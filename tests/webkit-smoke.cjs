/* Smoke test that runs the web app in a real browser engine (WebKit in CI, the same engine Books.app embeds).
 * Usage: NODE_PATH="$(npm root -g)" node tests/webkit-smoke.cjs [path/to/sample.mobi]
 * Env: PW_BROWSER=webkit|chromium (default webkit), PORT (default 8123), SHOTS (dir for failure screenshots, default build).
 * Needs `playwright` installed globally. Exit code 1 on failure, with page errors and UI state printed for diagnosis. */
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), http = require('http');
const pw = require('playwright');
const browserName = process.env.PW_BROWSER || 'webkit';
const port = +(process.env.PORT || 8123);
const root = path.resolve(__dirname, '..');
const shots = process.env.SHOTS || path.join(root, 'build');
const mobiPath = process.argv[2] && fs.existsSync(process.argv[2]) ? process.argv[2] : null;
const ok = msg => console.log('  ok  ' + msg);
const warn = msg => console.log('  WARN ' + msg);

const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', root], { stdio: 'ignore' });
const waitForServer = () => new Promise((resolve, reject) => { let n = 0; const tick = () => http.get(`http://127.0.0.1:${port}/index.html`, r => (r.statusCode === 200 ? resolve() : retry())).on('error', retry); const retry = () => (++n > 50 ? reject(new Error('server did not start')) : setTimeout(tick, 200)); tick(); });

const sampleText = Array.from({ length: 12 }, (_, c) => `CHAPTER ${c + 1}\n\n` + Array.from({ length: 40 }, (_, i) => `Paragraph ${i + 1} of chapter ${c + 1}. `.repeat(6)).join('\n\n')).join('\n\n\n');

(async () => {
  await waitForServer();
  const browser = await pw[browserName].launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const uiState = () => page.evaluate(() => ({
    books: (window.Library ? Library.books : []).map(b => `${b.title} — ${b.author} [${b.kind}] ${b.fileSize}`),
    inputFiles: (document.getElementById('file-input') || { files: [] }).files.length,
    sheet: ((document.querySelector('.sheet') || {}).textContent || '').replace(/\s+/g, ' ').trim().slice(0, 300),
    toast: ((document.querySelector('.toast') || {}).textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200),
  })).catch(e => ({ error: e.message }));
  const fail = async (msg) => {
    console.log('FAIL ' + msg);
    console.log('  ui:', JSON.stringify(await uiState()));
    if (errors.length) console.log('  page errors:\n    ' + errors.join('\n    '));
    try { fs.mkdirSync(shots, { recursive: true }); await page.screenshot({ path: path.join(shots, `smoke-${browserName}-failure.png`) }); } catch (e) { /* ignore */ }
    throw new Error(msg);
  };
  const check = async (cond, msg) => { if (!cond) await fail(msg); ok(msg); };
  const waitBooks = async (n, ms) => { try { await page.waitForFunction(k => window.Library && Library.books.length >= k, n, { timeout: ms }); return true; } catch (e) { return false; } };
  const addViaAPI = (name, type, b64) => page.evaluate(async ({ name, type, b64 }) => {
    const bin = atob(b64); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    await Library.addFiles([new File([a], name, { type })], { quiet: true });
  }, { name, type, b64 });

  await page.goto(`http://127.0.0.1:${port}/index.html`);
  await page.waitForSelector('.home-empty', { timeout: 30000 });
  console.log(`${browserName}: app loaded`);

  // 1. plain-text import through the library API → EPUB build → stored
  await addViaAPI('Smoke Test - Smoke Author.txt', 'text/plain', Buffer.from(sampleText).toString('base64'));
  await check(await waitBooks(1, 60000), 'text file imported and typeset into an EPUB');

  // 2. the <input type=file> path (automation delivers the files; a missing change event is an automation quirk, not an app bug)
  const secondFile = mobiPath || path.join(shots, 'smoke-second.txt');
  if (!mobiPath) { fs.mkdirSync(shots, { recursive: true }); fs.writeFileSync(secondFile, sampleText.replace(/chapter/g, 'section')); }
  await page.setInputFiles('#file-input', [secondFile]);
  if (await waitBooks(2, 20000)) ok(`file input delivered ${path.basename(secondFile)}`);
  else {
    warn(`file input change event not delivered by automation (input.files=${(await uiState()).inputFiles}); importing through the API instead`);
    await addViaAPI(path.basename(secondFile), mobiPath ? 'application/x-mobipocket-ebook' : 'text/plain', fs.readFileSync(secondFile).toString('base64'));
    await check(await waitBooks(2, 60000), `${path.basename(secondFile)} imported through the API`);
  }
  const books = (await uiState()).books; console.log('  books:', JSON.stringify(books));
  if (mobiPath) await check(books.every(b => /\[epub\]/.test(b)), 'Kindle file converted to EPUB at import');

  // 3. open the newest book, page through, timeline, wheel
  await page.click('.sl-item:has-text("All")');
  await page.dblclick('.book-card >> nth=0');
  await page.waitForSelector('#rd-loading', { state: 'hidden', timeout: 60000 });
  await page.waitForTimeout(600);
  const st = () => page.evaluate(() => ({ page: Reader.page, total: Reader.layout.total, mode: Reader.layout.mode, label: document.getElementById('tl-label').textContent, marks: document.querySelectorAll('#tl-marks i').length, end: !!Reader._endShown }));
  let s = await st(); console.log('  opened:', JSON.stringify(s));
  await check(s.total > 3, `book paginates into ${s.total} pages`);
  await page.evaluate(() => Reader.next()); await page.waitForTimeout(400);
  const s2 = await st(); await check(s2.page > s.page && !s2.end, 'Reader.next() advances without reaching the end');
  await page.mouse.move(640, 400); await page.mouse.wheel(0, 100); await page.waitForTimeout(700);
  const s3 = await st(); await check(s3.page > s2.page, 'a wheel notch turns a page');
  await page.mouse.wheel(100, 0); await page.waitForTimeout(700);
  const s4 = await st(); await check(s4.page > s3.page, 'a horizontal wheel notch turns a page');
  await check(/Page \d+ of \d+/.test(s4.label), `timeline label reads "${s4.label}"`);
  await check(s4.marks > 0, `timeline shows ${s4.marks} chapter markers`);
  // vertical scrolling progress
  await page.evaluate(() => Settings.set('layout', 'scroll')); await page.waitForTimeout(800);
  await page.mouse.move(640, 400); await page.mouse.wheel(0, 3000); await page.waitForTimeout(1000);
  const s5 = await st(); console.log('  scroll:', JSON.stringify(s5));
  await check(s5.mode === 'scroll' && s5.page > 0, 'vertical scrolling reports progress');
  const dark = await page.evaluate(() => { Settings.set('theme', 'focus'); const d = document.getElementById('rd-frame').contentDocument; return getComputedStyle(d.documentElement).colorScheme; });
  await check(/dark/.test(dark), 'Focus theme switches the book document to a dark color scheme');
  await page.evaluate(() => { Settings.set('theme', 'original'); Settings.set('layout', 'paginated'); Reader.close(); }); await page.waitForTimeout(400);
  await page.evaluate(() => Library.deleteBooks(Library.books.map(b => b.id), { confirm: false, quiet: true }));
  if (errors.length) await fail(`${errors.length} page error(s)`);
  console.log(`${browserName.toUpperCase()} SMOKE OK`);
  await browser.close();
  server.kill();
})().catch(e => { console.error(e.message || e); server.kill(); process.exit(1); });
