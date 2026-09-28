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
  report.frames.stage1 = await page.evaluate(() => {
    const f = window.ronin.panel.frames;
    return { n: f.n, avg: +(f.total / Math.max(1, f.n)).toFixed(2), worst: f.worst, fps: +(f.n / Math.max(0.001, f.dt || 0)).toFixed(1), slow: f.slow || 0 };
  });

  async function playStage(stage, name, until, extra) {
    await page.evaluate((s) => { window.ronin.session.jump(s); window.ronin.panel.scene.loadFight(true); window.ronin.panel.frames = { n: 0, total: 0, worst: 0 }; }, stage);
    await hover(page, true);
    const ok = await waitFor(page, until, null, 90000);
    if (extra) await extra();
    await shot(page, name);
    report.frames[name] = { ...(await frameStats()), reached: ok };
  }
  async function frameStats() {
    return page.evaluate(() => {
      const f = window.ronin.panel.frames, n = Math.max(1, f.n), p = f.parts || {};
      const per = (v) => +(v / n).toFixed(2);
      return { n: f.n, avg: per(f.total), worst: +f.worst.toFixed(1), fps: +(f.n / Math.max(0.001, f.dt || 0)).toFixed(1), slow: f.slow || 0,
        update: per(p.update || 0), carnage: per(p.carnage || 0), tick: per(p.tick || 0), render: per(p.render || 0),
        dead: window.ronin.panel.scene.carnage.count, drawn: window.ronin.R.list.length,
        particles: window.ronin.R.list.reduce((t, e) => t + (e.n.parts ? e.n.parts.length : 0), 0) };
    });
  }
  /** Cuts toward a side with the real mouse button. */
  async function cut(side) {
    const box = await page.locator('#lane').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.6, { button: side === 'left' ? 'left' : 'right' });
  }
  if (want('brute')) {
    // As the app's self-test: a brute at the end of his wind-up, his club glaring, met with the real button.
    await playStage(3, '6a-brute', () => window.ronin.session.fight.stats.kills >= 6);
    await page.evaluate(() => {
      window.ronin.session.setAutopilot(false);
      window.ronin.core.raiseBruteClub('right');
      window.ronin.session.refresh(true);
    });
    await waitFor(page, () => window.ronin.panel.scene.clubsGlaring > 0, null, 3000);
    // (The fight held still while the screenshot is taken, so the cut still meets the glare.)
    await page.evaluate(() => { window.ronin.panel.scene.timeScale = 0; });
    await shot(page, '6b-brute-glare');
    await cut('right');
    await page.evaluate(() => { window.ronin.panel.scene.timeScale = 1; });
    await waitFor(page, () => window.ronin.panel.scene.turnsDrawn > 0, null, 3000);
    await page.waitForTimeout(40);
    await shot(page, '6c-brute-turned');
    await page.evaluate(() => window.ronin.session.setAutopilot(true));
  }
  if (want('archer')) await playStage(4, '6d-archer', () => window.ronin.session.fight.arrows.length > 0 || window.ronin.session.fight.foes.some((f) => f.phase === 'aiming' && f.progress > 0.7));
  if (want('warlord')) {
    await playStage(5, '7-warlord', () => { const b = window.ronin.session.fight.boss; return !!b && b.gap < 0.6; });
    // As the self-test: his guard set before him, and a cut into it with the real button.
    await waitFor(page, () => { const b = window.ronin.session.fight.boss; return !!b && b.gap <= window.ronin.session.fight.reach + 0.02 && b.phase !== 'windup'; }, null, 20000);
    const side = await page.evaluate(() => {
      window.ronin.session.setAutopilot(false);
      window.ronin.core.setWarlordGuard();
      window.ronin.session.refresh(true);
      return window.ronin.session.fight.boss.x < 0 ? 'left' : 'right';
    });
    await cut(side);
    await waitFor(page, () => window.ronin.panel.scene.clashesDrawn > 0, null, 3000);
    await page.waitForTimeout(10);
    await shot(page, '7c-warlord-clash');
    await page.evaluate(() => window.ronin.session.setAutopilot(true));
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
  if (want('pause')) {
    // Leaving pauses (the curtain and its pause sign, the panel dimmed); coming back takes the dwell (a ring fills).
    await page.evaluate(() => { window.ronin.session.next(); window.ronin.panel.scene.loadFight(true); });
    await hover(page, true);
    await page.waitForTimeout(3000);
    await hover(page, false);
    await page.waitForTimeout(400);
    report.paused = await page.evaluate(() => ({ away: window.ronin.panel.scene.isAwayPaused, opacity: window.ronin.panel.canvas.style.opacity }));
    await shot(page, '12-paused');
    const box = await page.locator('#lane').boundingBox();
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.6);
    await page.waitForTimeout(150);
    await shot(page, '12b-dwell');
    await page.waitForTimeout(400);
    report.resumed = await page.evaluate(() => !window.ronin.panel.scene.isAwayPaused);
  }
  if (want('hints')) {
    // Floor hints on (teaching the buttons again), gore off: the dead fall whole and nothing bleeds.
    const shedBefore = await page.evaluate(() => ({ shed: window.ronin.panel.scene.shed + window.ronin.panel.scene.carnage.shed, severed: window.ronin.panel.scene.carnage.severings }));
    await page.evaluate(() => {
      window.ronin.panel.setFloorHints(true);
      localStorage.setItem('ronin.gore', '0');
      window.ronin.session.setAutopilot(true);
      window.ronin.session.jump(11);
      window.ronin.panel.scene.loadFight(true);
    });
    await hover(page, true);
    await waitFor(page, () => window.ronin.session.fight.stats.kills >= 5, null, 60000);
    const shedAfter = await page.evaluate(() => ({ shed: window.ronin.panel.scene.shed + window.ronin.panel.scene.carnage.shed, severed: window.ronin.panel.scene.carnage.severings }));
    // (Blood spilt and men cut apart while gore was off: none of either.)
    report.goreOff = { shed: shedAfter.shed - shedBefore.shed, severed: shedAfter.severed - shedBefore.severed };
    await shot(page, '13-hints-gore-off');
    await page.evaluate(() => { window.ronin.panel.setFloorHints(false); localStorage.setItem('ronin.gore', '1'); });
  }
  if (want('endless')) {
    await page.evaluate(() => { window.ronin.session.startEndless(2); window.ronin.panel.scene.loadFight(true); });
    await hover(page, true);
    await page.waitForTimeout(700);
    await shot(page, '14-endless');
    await page.evaluate(() => { window.ronin.session.leaveEndless(); window.ronin.panel.scene.loadFight(true); });
  }
  if (want('sizes')) {
    // The dead stay, scaled with the lane, through another size.
    await page.evaluate(() => { window.ronin.session.jump(2); window.ronin.panel.scene.loadFight(true); });
    await hover(page, true);
    await waitFor(page, () => window.ronin.session.fight.stats.kills >= 6, null, 60000);
    await page.evaluate(() => window.ronin.panel.setSize(0));
    await page.waitForTimeout(300);
    await shot(page, '15-small');
    await page.evaluate(() => window.ronin.panel.setSize(2));
  }
  if (want('hide')) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    report.hidden = await page.evaluate(() => ({ panel: document.getElementById('panel-wrap').hidden, show: !document.getElementById('shown-hidden').hidden }));
    await page.click('#show-button');
    await page.waitForTimeout(200);
    report.shownAgain = await page.evaluate(() => !document.getElementById('panel-wrap').hidden);
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
  if (want('input')) {
    // The keys, the menu's items, and taps on a touch screen.
    const page2 = await open(552, 520);
    await page2.evaluate(() => { window.ronin.session.setAutopilot(false); window.ronin.session.jump(1); window.ronin.panel.scene.loadFight(true); });
    await page2.mouse.move(2, 2);
    await page2.keyboard.press('Space');
    await page2.waitForFunction(() => window.ronin.session.fight.foes.some((f) => f.gap < window.ronin.session.fight.reach), null, { timeout: 20000 });
    const side = await page2.evaluate(() => (window.ronin.session.fight.foes.find((f) => f.gap < window.ronin.session.fight.reach).x < 0 ? 'ArrowLeft' : 'ArrowRight'));
    await page2.keyboard.press(side);
    await page2.waitForTimeout(100);
    report.keyCut = await page2.evaluate(() => window.ronin.session.fight.stats.cuts);
    await page2.click('#menu-button');
    await page2.locator('#menu .item', { hasText: 'Gore' }).click();
    report.goreAfterMenu = await page2.evaluate(() => localStorage.getItem('ronin.gore'));
    await page2.locator('#menu summary', { hasText: 'Difficulty' }).click();
    await page2.locator('#menu .item', { hasText: 'Shura' }).click();
    report.modeAfterMenu = await page2.evaluate(() => window.ronin.session.fight.mode);
    await page2.click('#menu-button');
    await page2.locator('#menu summary', { hasText: 'Development' }).click();
    await page2.locator('#menu .item', { hasText: 'Queue' }).click();
    report.devTitle = await page2.locator('#menu summary', { hasText: 'Development' }).textContent();
    await page2.locator('#menu .item', { hasText: "Restore the Game's Rules" }).click();
    report.devTitleRestored = await page2.locator('#menu summary', { hasText: 'Development' }).textContent();
    const menuFile = path.join(out, 'menu-open.png');
    await page2.screenshot({ path: menuFile, fullPage: true });
    report.shots.push(menuFile);
    await page2.keyboard.press('Escape');
    await page2.close();
    const ctx = await browser.newContext({ viewport: { width: 400, height: 760 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, ignoreHTTPSErrors: true });
    const touch = await ctx.newPage();
    touch.on('pageerror', (e) => errors.push(`[touch] pageerror: ${e.stack || e.message}`));
    await touch.goto(`http://127.0.0.1:${port}/index.html`);
    await touch.waitForFunction(() => window.ronin && window.ronin.panel, null, { timeout: 60000 });
    await touch.evaluate(() => { window.ronin.session.setAutopilot(false); window.ronin.session.jump(1); window.ronin.panel.scene.loadFight(true); });
    const tb = await touch.locator('#lane').boundingBox();
    await touch.touchscreen.tap(tb.x + tb.width * 0.25, tb.y + tb.height * 0.6);
    await touch.waitForTimeout(2500);
    await touch.touchscreen.tap(tb.x + tb.width * 0.75, tb.y + tb.height * 0.6);
    await touch.waitForTimeout(150);
    report.touch = await touch.evaluate(() => ({ running: !window.ronin.panel.scene.isAwayPaused, whiffs: window.ronin.session.fight.stats.whiffs, cuts: window.ronin.session.fight.stats.cuts }));
    const tf = path.join(out, 'phone-touch.png');
    await touch.screenshot({ path: tf });
    report.shots.push(tf);
    await ctx.close();
  }
  if (want('resume')) {
    // The fight in progress is saved and picked up again where it was.
    const p = await open(552, 420);
    await p.evaluate(() => { window.ronin.session.setAutopilot(true); window.ronin.session.jump(2); window.ronin.panel.scene.loadFight(true); });
    const b = await p.locator('#lane').boundingBox();
    await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await p.waitForFunction(() => window.ronin.session.fight.stats.kills >= 4, null, { timeout: 60000 });
    await p.mouse.move(2, 2);
    await p.waitForTimeout(300);
    const before = await p.evaluate(() => { const f = window.ronin.session.fight; return { stage: f.stage, kills: f.stats.kills, time: +f.time.toFixed(2), seed: f.seed }; });
    await p.reload();
    await p.waitForFunction(() => window.ronin && window.ronin.panel, null, { timeout: 60000 });
    const after = await p.evaluate(() => { const f = window.ronin.session.fight; return { stage: f.stage, kills: f.stats.kills, time: +f.time.toFixed(2), seed: f.seed }; });
    report.resume = { before, after, same: before.seed === after.seed && before.kills === after.kills };
    await p.close();
  }
  if (want('big')) {
    // A wide desktop window at a Retina scale: the panel at its largest.
    const p = await open(1440, 900, 2);
    await p.evaluate(() => { window.ronin.session.setAutopilot(true); window.ronin.session.jump(7); window.ronin.panel.scene.loadFight(true); });
    const b = await p.locator('#lane').boundingBox();
    await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await p.waitForTimeout(1000);
    await p.evaluate(() => { window.ronin.panel.frames = { n: 0, total: 0, worst: 0 }; });
    await p.waitForTimeout(15000);
    report.frames.big = await p.evaluate(() => {
      const f = window.ronin.panel.frames, n = Math.max(1, f.n), q = f.parts || {};
      return { canvas: `${window.ronin.panel.canvas.width}x${window.ronin.panel.canvas.height}`, n: f.n, avg: +(f.total / n).toFixed(2), fps: +(f.n / Math.max(0.001, f.dt || 0)).toFixed(1),
        slow: f.slow || 0, render: +((q.render || 0) / n).toFixed(2), update: +((q.update || 0) / n).toFixed(2) };
    });
    const file = path.join(out, 'desktop-wide.png');
    await p.screenshot({ path: file });
    report.shots.push(file);
    await p.close();
  }
  if (want('csp')) {
    // A viewer whose Content-Security-Policy does not allow WebAssembly: the page says so.
    const html = fs.readFileSync(path.join(serve, 'index.html'), 'utf8')
      .replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="script-src \'self\' \'unsafe-inline\'">');
    fs.writeFileSync(path.join(serve, 'csp.html'), html);
    const blocked = await browser.newPage({ viewport: { width: 552, height: 420 }, ignoreHTTPSErrors: true });
    await blocked.goto(`http://127.0.0.1:${port}/csp.html`);
    await blocked.waitForFunction(() => !document.getElementById('fail').hidden, null, { timeout: 20000 }).catch(() => {});
    report.csp = await blocked.evaluate(() => document.getElementById('fail').hidden ? null : document.getElementById('fail').textContent.trim());
    const file = path.join(out, 'csp.png');
    await blocked.screenshot({ path: file });
    report.shots.push(file);
    await blocked.close();
  }
} catch (err) {
  errors.push('test: ' + (err.stack || err.message));
} finally {
  await browser.close();
  server.kill();
}
console.log(JSON.stringify({ errors, ...report }, null, 2));
