// Drives the page headlessly in Chromium: plays stages on the autopilot, cuts both ways, takes screenshots of the
// panel at the app's size (520 x 180) and at phone width, and reports console errors and the frame time.
//
//   web/build.sh && web/assemble.sh && node web/test/run.mjs [--out <dir>] [--only <name,...>]
//
// Serves web/dist (harness.html as the index, beside core.js and ronin.wasm) with python3's http.server.
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
const args = process.argv.slice(2);
const outArg = args.indexOf('--out');
const out = outArg >= 0 ? args[outArg + 1] : path.join(process.env.TMPDIR || '/tmp', 'ronin-web-shots');
const onlyArg = args.indexOf('--only');
const only = onlyArg >= 0 ? new Set(args[onlyArg + 1].split(',')) : null;
fs.mkdirSync(out, { recursive: true });

// A directory to serve: the harness as index.html, and the core beside it.
const serve = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'ronin-web-'));
fs.copyFileSync(path.join(web, 'dist', 'harness.html'), path.join(serve, 'index.html'));
for (const f of ['core.js', 'ronin.wasm']) fs.copyFileSync(path.join(web, 'dist', f), path.join(serve, f));
const port = 8700 + Math.floor(Math.random() * 200);
const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: serve, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));

const exe = fs.readdirSync('/opt/pw-browsers').filter((d) => d.startsWith('chromium-')).map((d) => `/opt/pw-browsers/${d}/chrome-linux/chrome`).find((p) => fs.existsSync(p));
const browser = await playwright.chromium.launch({ executablePath: exe, args: ['--enable-unsafe-swiftshader', '--use-gl=swiftshader'] });
const errors = [];
const report = { shots: [], frames: {} };

async function open(width, height, dpr = 1) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dpr, ignoreHTTPSErrors: true });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${width}] ${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${width}] pageerror: ${e.stack || e.message}`));
  await page.goto(`http://127.0.0.1:${port}/index.html`);
  await page.waitForFunction(() => window.ronin && window.ronin.panel, null, { timeout: 60000 });
  return page;
}

async function shot(page, name) {
  const file = path.join(out, `${name}.png`);
  await page.locator('#lane').screenshot({ path: file });
  report.shots.push(file);
  return file;
}

/** Holds the pointer over the lane (the fight runs), or off it. */
async function hover(page, on) {
  const box = await page.locator('#lane').boundingBox();
  if (on) await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.3);
  else await page.mouse.move(2, 2);
}

async function waitFor(page, fn, arg, timeout = 30000) {
  try { await page.waitForFunction(fn, arg, { timeout, polling: 50 }); return true; } catch { return false; }
}

const want = (name) => !only || only.has(name);

try {
  const page = await open(552, 420);
  // A fresh career.
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload();
  await page.waitForFunction(() => window.ronin && window.ronin.panel);
  await page.evaluate(() => { window.ronin.panel.setSize(2); });
  await page.waitForTimeout(300);
  if (want('first-look')) {
    await hover(page, true);
    await page.waitForTimeout(900);
    await shot(page, '0-first-look');
  }
  if (want('cut')) {
    await hover(page, true);
    await waitFor(page, () => { const f = window.ronin.session.fight; return f.foes.some((x) => x.gap < f.reachNow); }, null, 20000);
    const side = await page.evaluate(() => { const f = window.ronin.session.fight; const x = f.foes.find((q) => q.gap < f.reachNow); return x ? (x.x < 0 ? 'left' : 'right') : 'left'; });
    const box = await page.locator('#lane').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.6, { button: side === 'left' ? 'left' : 'right' });
    await page.waitForTimeout(60);
    await shot(page, '2-cut');
    // A whiff the other way.
    await page.waitForTimeout(400);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.6, { button: side === 'left' ? 'right' : 'left' });
    await page.waitForTimeout(80);
    await shot(page, '2b-whiff');
  }
  // The autopilot through stage 1: the fight, the gourd, the flourish, the card.
  await page.evaluate(() => window.ronin.session.setAutopilot(true));
  await hover(page, true);
  if (want('fight')) {
    await waitFor(page, () => window.ronin.session.fight.combo >= 5 && window.ronin.session.fight.foes.length >= 2, null, 40000);
    await shot(page, '3-fight');
  }
  if (want('gourd')) {
    if (await waitFor(page, () => !!window.ronin.session.fight.gourd, null, 60000)) {
      await page.waitForTimeout(350);
      await shot(page, '3b-gourd');
    }
  }
  if (want('cleared')) {
    await waitFor(page, () => window.ronin.session.fight.outcome === 'victory', null, 120000);
    await page.waitForTimeout(900);
    await shot(page, '4-flourish');
    await waitFor(page, () => window.ronin.panel.scene.isShowingBanner, null, 5000);
    await page.waitForTimeout(500);
    await shot(page, '5-cleared');
  }
  const frames = await page.evaluate(() => { const f = window.ronin.panel.frames; return { n: f.n, avg: f.total / Math.max(1, f.n), worst: f.worst }; });
  report.frames.stage1 = frames;

  async function playStage(stage, name, until, extra) {
    await page.evaluate((s) => { window.ronin.session.jump(s); window.ronin.panel.scene.loadFight(true); window.ronin.panel.frames = { n: 0, total: 0, worst: 0 }; }, stage);
    await hover(page, true);
    const ok = await waitFor(page, until, null, 90000);
    if (extra) await extra();
    await shot(page, name);
    const f = await page.evaluate(() => { const f = window.ronin.panel.frames; return { n: f.n, avg: f.total / Math.max(1, f.n), worst: f.worst }; });
    report.frames[name] = { ...f, reached: ok };
  }
  if (want('brute')) {
    await playStage(3, '6b-brute-glare', () => window.ronin.panel.scene.clubsGlaring > 0);
    await waitFor(page, () => window.ronin.panel.scene.turnsDrawn > 0, null, 30000);
    await page.waitForTimeout(30);
    await shot(page, '6c-brute-turned');
  }
  if (want('archer')) await playStage(4, '6d-archer', () => window.ronin.session.fight.arrows.length > 0 || window.ronin.session.fight.foes.some((f) => f.phase === 'aiming' && f.progress > 0.7));
  if (want('warlord')) {
    await playStage(5, '7-warlord', () => !!window.ronin.session.fight.boss);
    await waitFor(page, () => window.ronin.panel.scene.clashesDrawn > 0, null, 40000);
    await page.waitForTimeout(20);
    await shot(page, '7c-warlord-clash');
    await waitFor(page, () => window.ronin.session.fight.outcome === 'victory', null, 90000);
    await page.waitForTimeout(700);
    await shot(page, '8-warlord-slain');
  }
  if (want('bloodlust')) {
    await playStage(7, '9-bloodlust', () => window.ronin.session.fight.combo >= 21);
  }
  if (want('fallen')) {
    await page.evaluate(() => { window.ronin.session.setAutopilot(false); window.ronin.session.jump(9); window.ronin.panel.scene.loadFight(true); });
    await hover(page, true);
    await waitFor(page, () => window.ronin.panel.scene.isShowingBanner, null, 90000);
    await page.waitForTimeout(600);
    await shot(page, '10-fallen');
  }
  if (want('compact')) {
    await page.evaluate(() => window.ronin.panel.setCompact(true));
    await page.waitForTimeout(300);
    await shot(page, '11-compact');
    await page.evaluate(() => window.ronin.panel.setCompact(false));
  }
  if (want('menu')) {
    await page.click('#menu-button');
    await page.waitForTimeout(200);
    const file = path.join(out, 'menu.png');
    await page.screenshot({ path: file, fullPage: true });
    report.shots.push(file);
    await page.click('#menu-button');
  }
  await page.close();

  if (want('phone')) {
    const phone = await open(400, 800, 2);
    await phone.evaluate(() => window.ronin.session.setAutopilot(true));
    const box = await phone.locator('#lane').boundingBox();
    await phone.touchscreen?.tap?.(box.x + 10, box.y + box.height * 0.6).catch?.(() => {});
    await phone.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await phone.waitForTimeout(3500);
    const file = path.join(out, 'phone.png');
    await phone.screenshot({ path: file, fullPage: true });
    report.shots.push(file);
    report.phoneOverflow = await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    await phone.close();
  }
} catch (err) {
  errors.push('test: ' + (err.stack || err.message));
} finally {
  await browser.close();
  server.kill();
}
console.log(JSON.stringify({ errors, ...report }, null, 2));
