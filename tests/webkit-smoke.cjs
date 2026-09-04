/* Smoke test that runs the web app in a real browser engine (WebKit in CI, the same engine Books.app embeds).
 * Usage: NODE_PATH="$(npm root -g)" node tests/webkit-smoke.cjs [path/to/sample.mobi]
 * Env: PW_BROWSER=webkit|chromium (default webkit), PORT (default 8123). Needs `playwright` installed globally. */
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const pw = require('playwright');
const browserName = process.env.PW_BROWSER || 'webkit';
const port = +(process.env.PORT || 8123);
const root = path.resolve(__dirname, '..');
const mobiPath = process.argv[2] && fs.existsSync(process.argv[2]) ? process.argv[2] : null;
const assert = (cond, msg) => { if (!cond) throw new Error('ASSERT: ' + msg); console.log('  ok  ' + msg); };

const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', root], { stdio: 'ignore' });
const waitForServer = () => new Promise((resolve, reject) => { let n = 0; const tick = () => http.get(`http://127.0.0.1:${port}/index.html`, r => (r.statusCode === 200 ? resolve() : retry())).on('error', retry); const retry = () => (++n > 50 ? reject(new Error('server did not start')) : setTimeout(tick, 200)); tick(); });

(async () => {
  await waitForServer();
  const browser = await pw[browserName].launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(`http://127.0.0.1:${port}/index.html`);
  await page.waitForSelector('.home-empty', { timeout: 30000 });
  console.log(`${browserName}: app loaded`);

  // 1. plain-text import → EPUB build → reader
  const txt = path.join(os.tmpdir(), 'Smoke Test - Smoke Author.txt');
  fs.writeFileSync(txt, Array.from({ length: 12 }, (_, c) => `CHAPTER ${c + 1}\n\n` + Array.from({ length: 40 }, (_, i) => `Paragraph ${i + 1} of chapter ${c + 1}. `.repeat(6)).join('\n\n')).join('\n\n\n'));
  await page.setInputFiles('#file-input', [txt]);
  await page.waitForFunction(() => window.Library && Library.books.length >= 1, null, { timeout: 60000 });
  await page.waitForTimeout(400);

  // 2. Kindle import (optional sample)
  if (mobiPath) {
    await page.setInputFiles('#file-input', [mobiPath]);
    await page.waitForFunction(() => Library.books.length >= 2, null, { timeout: 60000 });
    const kindle = await page.evaluate(() => Library.books.map(b => ({ title: b.title, author: b.author, kind: b.kind, size: b.fileSize })));
    console.log('  books:', JSON.stringify(kindle));
    assert(kindle.every(b => b.kind === 'epub'), 'Kindle file converted to EPUB at import');
  } else console.log('  (no Kindle sample supplied; skipping conversion check)');

  // 3. open the newest book, page through, timeline, wheel
  await page.click('.sl-item:has-text("All")');
  await page.dblclick('.book-card >> nth=0');
  await page.waitForSelector('#rd-loading', { state: 'hidden', timeout: 60000 });
  await page.waitForTimeout(600);
  const st = () => page.evaluate(() => ({ page: Reader.page, total: Reader.layout.total, mode: Reader.layout.mode, label: document.getElementById('tl-label').textContent, marks: document.querySelectorAll('#tl-marks i').length, end: !!Reader._endShown }));
  let s = await st(); console.log('  opened:', JSON.stringify(s));
  assert(s.total > 3, `book paginates into ${s.total} pages`);
  await page.evaluate(() => Reader.next()); await page.waitForTimeout(400);
  const s2 = await st(); assert(s2.page > s.page && !s2.end, 'Reader.next() advances without reaching the end');
  await page.mouse.move(640, 400); await page.mouse.wheel(0, 100); await page.waitForTimeout(700);
  const s3 = await st(); assert(s3.page > s2.page, 'a wheel notch turns a page');
  await page.mouse.wheel(100, 0); await page.waitForTimeout(700);
  const s4 = await st(); assert(s4.page > s3.page, 'a horizontal wheel notch turns a page');
  assert(/Page \d+ of \d+/.test(s4.label), `timeline label reads "${s4.label}"`);
  assert(s4.marks > 0, `timeline shows ${s4.marks} chapter markers`);
  // vertical scrolling progress
  await page.evaluate(() => Settings.set('layout', 'scroll')); await page.waitForTimeout(800);
  await page.mouse.move(640, 400); await page.mouse.wheel(0, 3000); await page.waitForTimeout(1000);
  const s5 = await st(); console.log('  scroll:', JSON.stringify(s5));
  assert(s5.mode === 'scroll' && s5.page > 0, 'vertical scrolling reports progress');
  const dark = await page.evaluate(() => { Settings.set('theme', 'focus'); const d = document.getElementById('rd-frame').contentDocument; return getComputedStyle(d.documentElement).colorScheme; });
  assert(/dark/.test(dark), 'Focus theme switches the book document to a dark color scheme');
  await page.evaluate(() => { Settings.set('theme', 'original'); Settings.set('layout', 'paginated'); Reader.close(); }); await page.waitForTimeout(400);
  await page.evaluate(() => Library.deleteBooks(Library.books.map(b => b.id), { confirm: false, quiet: true }));
  if (errors.length) { console.log('page errors:\n' + errors.join('\n')); throw new Error(`${errors.length} page error(s)`); }
  console.log(`${browserName.toUpperCase()} SMOKE OK`);
  await browser.close();
  server.kill();
})().catch(e => { console.error(e.message || e); server.kill(); process.exit(1); });
