/* Self-test for the chrome-less reader web core (Sources/Books/Resources/Reader) in a real browser engine.
 *
 * Usage: NODE_PATH="$(npm root -g)" node scripts/reader-core-harness.cjs [path/to/book.epub]
 * Env:   PW_BROWSER=chromium|webkit (default chromium), PORT (default 8231), SHOTS (screenshot dir on failure)
 *
 * There is no UI to click, so the harness drives the page exactly the way the native app does: it installs
 * window.__readerBridge (the fallback the core uses when window.webkit.messageHandlers.reader is absent), collects
 * every message the page posts, and calls into window.reader.*. Each check prints PASS or FAIL; exit code 1 on any
 * failure. A small HTTP server stands in for the app's books-reader:// scheme handler: the Reader resource
 * directory at /, the book at /book/test.epub.
 */
const fs = require('fs'), path = require('path'), http = require('http');
const pw = require('playwright');

const browserName = process.env.PW_BROWSER || 'chromium';
const port = +(process.env.PORT || 8231);
const root = path.resolve(__dirname, '..');
const readerDir = path.join(root, 'Sources', 'Books', 'Resources', 'Reader');
const shots = process.env.SHOTS || path.join(root, 'build');

/* The book to typeset: an argument, $EPUB, or the first EPUB lying in one of the usual fixture directories. */
const FIXTURE_DIRS = [path.join(root, 'Tests', 'Fixtures', 'epub'), path.join(root, 'build')];
const firstFixture = () => {
  for (const dir of FIXTURE_DIRS) {
    const found = (fs.existsSync(dir) ? fs.readdirSync(dir) : []).filter(f => f.endsWith('.epub')).sort();
    if (found.length) return path.join(dir, found[0]);
  }
  return null;
};
const epubPath = [process.argv[2], process.env.EPUB, firstFixture()].find(p => p && fs.existsSync(p));
if (!epubPath) { console.error('No EPUB found. Usage: NODE_PATH="$(npm root -g)" node scripts/reader-core-harness.cjs <book.epub>'); process.exit(2); }

/* ------------------------------------------------------------------ the stand-in for the app's scheme handler */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.epub': 'application/epub+zip' };
const server = http.createServer((req, res) => {
  let url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/') url = '/reader.html';
  // The app's scheme handler has no favicon either; answering it keeps the browser from logging a console error.
  if (url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  const file = url === '/book/test.epub' ? epubPath : path.join(readerDir, path.normalize(url).replace(/^(\.\.[/\\])+/, ''));
  fs.readFile(file, (err, body) => {
    if (err) { console.log('  404   ' + url); res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'content-length': body.length });
    res.end(body);
  });
});

/* ------------------------------------------------------------------ check bookkeeping */
let failures = 0, checks = 0;
const pass = (label, detail) => { checks++; console.log(`  PASS  ${label}${detail ? '  — ' + detail : ''}`); };
const failed = (label, detail) => { checks++; failures++; console.log(`  FAIL  ${label}${detail ? '  — ' + detail : ''}`); };
const check = (cond, label, detail) => { cond ? pass(label, detail) : failed(label, detail); return !!cond; };

/* ------------------------------------------------------------------ page helpers */
const DEFAULT_SETTINGS = {
  theme: 'original', font: 'original', fontSize: 100, lineHeight: 'normal', textWidth: 'medium',
  justify: false, hyphenate: true, layout: 'paginated', spread: 'auto', pageTurn: 'slide',
  wheelTurnsPages: true, wheelSensitivity: 'medium', wheelInvert: false, wheelHorizontal: true,
};
const settings = extra => Object.assign({}, DEFAULT_SETTINGS, extra || {});

const count = page => page.evaluate(() => window.__msgs.length);
const lastOf = (page, type) => page.evaluate(t => { for (let i = window.__msgs.length - 1; i >= 0; i--) if (window.__msgs[i].type === t) return window.__msgs[i]; return null; }, type);
const allOf = (page, type) => page.evaluate(t => window.__msgs.filter(m => m.type === t), type);
const state = async page => JSON.parse(await page.evaluate(() => window.reader.state()));
/** Waits for the next message of `type` posted at or after index `from`. */
async function waitFor(page, type, from, timeout) {
  const h = await page.waitForFunction(([t, f]) => {
    for (let i = f; i < window.__msgs.length; i++) if (window.__msgs[i].type === t) return window.__msgs[i];
    return null;
  }, [type, from], { timeout: timeout || 20000, polling: 40 });
  return h.jsonValue();
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
/** Waits until the page has stopped scrolling — a smooth page turn is still moving when the call returns. */
const settle = async page => {
  await page.waitForFunction(() => {
    const se = document.scrollingElement, k = se.scrollLeft + ':' + se.scrollTop;
    const stable = window.__scrollKey === k;
    window.__scrollKey = k;
    return stable;
  }, null, { polling: 120, timeout: 10000 });
  await page.evaluate(() => { delete window.__scrollKey; });
};

/** Selects a couple of words that are actually visible on the current page and ends the gesture like a mouse does. */
const selectVisibleWords = page => page.evaluate(() => {
  const pts = [];
  for (const fy of [0.4, 0.5, 0.6, 0.35, 0.65, 0.3, 0.7]) for (const fx of [0.25, 0.3, 0.2, 0.35, 0.75]) pts.push([Math.round(innerWidth * fx), Math.round(innerHeight * fy)]);
  const range = document.createRange();
  for (const [x, y] of pts) {
    const el = document.elementFromPoint(x, y);
    if (!el || !el.closest || !el.closest('.books-section')) continue;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const v = n.nodeValue;
      const s = v.search(/\S/);
      if (s < 0 || v.trim().length < 12) continue;
      range.setStart(n, s); range.setEnd(n, Math.min(v.length, s + 24));
      const r = range.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight) {
        const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        return range.toString();
      }
    }
  }
  return null;
});

(async () => {
  await new Promise((res, rej) => server.listen(port, '127.0.0.1', res).on('error', rej));
  console.log(`reader core harness — ${browserName}, book: ${path.basename(epubPath)}`);

  const browser = await pw[browserName].launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [], warnings = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    // A book may reference assets it does not ship (the small fixture links a stylesheet image that is not in the
    // zip). That is the book's problem, not the core's, so it is a warning rather than a failure.
    if (/Failed to load resource/.test(m.text())) { warnings.push(`${m.text()} (${(m.location() || {}).url || ''})`); return; }
    errors.push('console: ' + m.text());
  });
  // The bridge the page falls back to when WKWebView's message handler is missing — installed before any page script runs.
  await page.addInitScript(() => { window.__msgs = []; window.__readerBridge = m => window.__msgs.push(m); });

  await page.goto(`http://127.0.0.1:${port}/reader.html`);
  await waitFor(page, 'ready', 0, 15000);
  check(await page.evaluate(() => typeof window.reader === 'object' && typeof window.reader.open === 'function'), 'ready posted and window.reader exists');

  /* -------------------------------------------------------------- 1. open */
  let from = await count(page);
  await page.evaluate(s => window.reader.open({ url: '/book/test.epub', settings: s, locator: null, bookmarks: [], highlights: [] }), DEFAULT_SETTINGS);
  const opened = await waitFor(page, 'opened', from, 90000);
  check(opened.total > 3, 'opened: the book paginates into more than 3 pages', `total=${opened.total} cols=${opened.cols} mode=${opened.mode}`);
  check(Array.isArray(opened.toc) && opened.toc.length > 0, 'opened: table of contents is not empty', `${opened.toc.length} entries, title "${opened.title}", ${opened.spineCount} sections, ${opened.words} words`);
  check(typeof opened.mode === 'string' && typeof opened.cols === 'number' && Array.isArray(opened.chapters) && Array.isArray(opened.bookmarks),
    'opened carries the layout fields (mode/total/cols/chapters/bookmarks)');
  await sleep(300);

  /* -------------------------------------------------------------- 2. next() */
  let before = await lastOf(page, 'position');
  check(before && before.page === 0, 'position reported after open', before ? `page=${before.page} percent=${before.percent} chapter="${before.chapter}"` : 'none');
  from = await count(page);
  await page.evaluate(() => window.reader.next());
  let after = await waitFor(page, 'position', from, 5000);
  check(after.page > before.page, 'next() advances the page and posts position', `${before.page} → ${after.page}`);
  await sleep(250);

  /* -------------------------------------------------------------- 3. wheel */
  const cols = opened.cols;
  await page.mouse.move(640, 400);
  before = await lastOf(page, 'position'); from = await count(page);
  await page.mouse.wheel(0, 100);
  after = await waitFor(page, 'position', from, 5000);
  check(after.page - before.page === cols, `a vertical wheel notch turns exactly one screen (${cols} page${cols > 1 ? 's' : ''})`, `${before.page} → ${after.page}`);
  await sleep(500);   // outside the 400 ms gesture window, so the next notch is a fresh gesture

  before = after; from = await count(page);
  await page.mouse.wheel(100, 0);
  after = await waitFor(page, 'position', from, 5000);
  check(after.page - before.page === cols, 'a horizontal wheel notch turns one screen too', `${before.page} → ${after.page}`);
  await sleep(600);

  /* -------------------------------------------------------------- 4. keys */
  before = after; from = await count(page);
  await page.keyboard.press('ArrowRight');
  after = await waitFor(page, 'position', from, 5000);
  const activity = await waitFor(page, 'activity', from, 3000).catch(() => null);
  check(after.page - before.page === cols, 'ArrowRight turns the page', `${before.page} → ${after.page}`);
  check(!!activity, 'input posts activity for the app\'s reading-time tracking');
  from = await count(page);
  await page.keyboard.press('ArrowLeft');
  after = await waitFor(page, 'position', from, 5000);
  check(after.page === before.page, 'ArrowLeft turns back', `→ ${after.page}`);

  /* -------------------------------------------------------------- 5. goToFraction */
  from = await count(page);
  await page.evaluate(() => window.reader.goToFraction(0.5));
  const mid = await waitFor(page, 'position', from, 5000);
  check(mid.percent > 35 && mid.percent < 70, 'goToFraction(0.5) lands mid-book', `page=${mid.page}/${mid.total} percent=${mid.percent} chapter="${mid.chapter}"`);
  await settle(page);

  /* -------------------------------------------------------------- 6. selection */
  from = await count(page);
  const picked = await selectVisibleWords(page);
  let selection = null;
  if (check(!!picked, 'found visible text to select', picked ? JSON.stringify(picked) : 'no on-screen text node')) {
    selection = await waitFor(page, 'selection', from, 5000);
    check(!!selection.text && selection.locator && selection.locator.end > selection.locator.start,
      'selecting text posts selection with a range locator',
      `"${selection.text}" spine=${selection.locator.spine} ${selection.locator.start}–${selection.locator.end} chapter="${selection.chapter}"`);
    const r = selection.rect;
    check(r && r.width > 0 && r.height > 0 && r.x >= 0 && r.x < 1280 && r.y >= 0 && r.y < 800,
      'selection rect is in web-view CSS pixels', `x=${Math.round(r.x)} y=${Math.round(r.y)} w=${Math.round(r.width)} h=${Math.round(r.height)}`);
  }

  /* -------------------------------------------------------------- 7. highlights */
  from = await count(page);
  await page.evaluate(() => window.reader.addHighlight({ id: 'h1', color: 'yellow' }));
  const added = await waitFor(page, 'highlightAdded', from, 5000);
  check(added.id === 'h1' && added.color === 'yellow' && !!added.text && !!added.locator, 'addHighlight posts highlightAdded', `"${added.text}" chapter="${added.chapter}"`);
  check(await page.evaluate(() => document.querySelectorAll('span.books-hl[data-id="h1"]').length > 0), 'the highlight is wrapped in span.books-hl in the document');

  // Click it the way a reader would: a real mouse click on the wrapped text.
  await settle(page);
  const hlBox = await page.evaluate(() => { const s = document.querySelector('span.books-hl[data-id="h1"]'); if (!s) return null; const r = s.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  from = await count(page);
  if (hlBox) await page.mouse.click(hlBox.x, hlBox.y);
  const tapped = hlBox ? await waitFor(page, 'highlightTapped', from, 5000).catch(() => null) : null;
  check(tapped && tapped.id === 'h1' && tapped.rect && tapped.rect.width > 0, 'clicking a highlight posts highlightTapped with its rect', tapped ? `x=${Math.round(tapped.rect.x)} y=${Math.round(tapped.rect.y)}` : 'no message');

  await page.evaluate(() => window.reader.updateHighlight({ id: 'h1', color: 'green', note: 'a note' }));
  const tint = await page.evaluate(() => { const s = document.querySelector('span.books-hl[data-id="h1"]'); return s ? s.style.getPropertyValue('--hl') : null; });
  check(/48|213|88/.test(tint || ''), 'updateHighlight re-tints the span', `--hl: ${tint}`);
  await page.evaluate(() => window.reader.removeHighlight('h1'));
  check(await page.evaluate(() => document.querySelectorAll('span.books-hl[data-id="h1"]').length === 0), 'removeHighlight unwraps it again');

  /* -------------------------------------------------------------- 8. clearSelection */
  await selectVisibleWords(page);
  from = await count(page);
  await page.evaluate(() => window.reader.clearSelection());
  const cleared = await waitFor(page, 'selectionCleared', from, 5000).catch(() => null);
  check(!!cleared && await page.evaluate(() => getSelection().isCollapsed), 'clearSelection() collapses the selection and posts selectionCleared');

  /* -------------------------------------------------------------- 9. search */
  from = await count(page);
  await page.evaluate(() => window.reader.search('the'));
  await waitFor(page, 'searchResults', from, 30000);
  await page.waitForFunction(f => window.__msgs.slice(f).some(m => m.type === 'searchResults' && m.done), from, { timeout: 90000, polling: 50 });
  const batches = (await allOf(page, 'searchResults')).filter(m => m.query === 'the');
  const hits = batches.reduce((a, b) => a.concat(b.results), []);
  check(hits.length > 0, 'search("the") posts searchResults', `${hits.length} hits in ${batches.length} batch(es), done=${batches[batches.length - 1].done}`);
  check(hits.every(h => typeof h.spine === 'number' && typeof h.offset === 'number' && typeof h.pos === 'number' && typeof h.excerpt === 'string' && typeof h.chapter === 'string'),
    'every result carries {spine, offset, excerpt, chapter, pos}', hits[0] ? `first: p.${hits[0].pos} "${hits[0].excerpt.slice(0, 60)}"` : '');

  /* -------------------------------------------------------------- 10. bookmarks */
  const here = await state(page);
  from = await count(page);
  await page.evaluate(loc => window.reader.setBookmarks([{ id: 'b1', locator: loc }]), here.locator);
  const bm = await waitFor(page, 'position', from, 5000);
  check(bm.bookmark === 'b1', 'a bookmark on the current page is reported in position.bookmark', `locator ${JSON.stringify(here.locator)} → bookmark=${bm.bookmark}`);
  const lay = await lastOf(page, 'layout');
  check(!!lay && lay.bookmarks.some(b => b.id === 'b1' && typeof b.pos === 'number'), 'layout lists the bookmark with a position', lay ? JSON.stringify(lay.bookmarks) : '');

  /* -------------------------------------------------------------- 11. chapter navigation */
  const target = opened.toc.filter(t => t.pos != null && t.pos > 0).pop();
  if (target) {
    from = await count(page);
    await page.evaluate(h => window.reader.goToHref(h), target.href);
    const at = await waitFor(page, 'position', from, 5000);
    check(at.chapter === target.label, 'goToHref jumps to that entry of the table of contents', `"${target.label}" → page ${at.page}, chapter "${at.chapter}"`);
  } else check(false, 'goToHref jumps to that entry of the table of contents', 'the book has no positioned TOC entry');
  from = await count(page);
  await page.evaluate(() => window.reader.goToPage(0));
  await waitFor(page, 'position', from, 5000);
  from = await count(page);
  await page.evaluate(() => window.reader.nextChapter());
  const nc = await waitFor(page, 'position', from, 5000);
  check(nc.page > 0, 'nextChapter() moves forward to the next chapter start', `page=${nc.page} chapter="${nc.chapter}"`);
  from = await count(page);
  await page.evaluate(() => window.reader.prevChapter());
  const pc = await waitFor(page, 'position', from, 5000);
  check(pc.page < nc.page, 'prevChapter() moves back', `page=${pc.page}`);

  /* -------------------------------------------------------------- 12. full screen margins */
  from = await count(page);
  const colH = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--col-h').trim());
  const normalH = await colH();
  await page.evaluate(() => window.reader.setFullscreen(true));
  await waitFor(page, 'layout', from, 15000);
  const fsH = await colH();
  check(parseFloat(fsH) > parseFloat(normalH), 'setFullscreen(true) gives the text the space the hidden chrome used', `${normalH} → ${fsH}`);
  from = await count(page);
  await page.evaluate(() => window.reader.setFullscreen(false));
  await waitFor(page, 'layout', from, 15000);

  /* -------------------------------------------------------------- 13. theme */
  from = await count(page);
  await page.evaluate(s => window.reader.applySettings(s), settings({ theme: 'focus' }));
  await waitFor(page, 'layout', from, 15000);
  const themed = await page.evaluate(() => ({
    bg: getComputedStyle(document.documentElement).backgroundColor,
    scheme: getComputedStyle(document.documentElement).colorScheme,
    dark: document.documentElement.classList.contains('dark'),
  }));
  check(themed.bg === 'rgb(0, 0, 0)' && themed.dark && /dark/.test(themed.scheme), 'theme "focus" paints html black and switches to the dark color scheme', JSON.stringify(themed));
  from = await count(page);
  await page.evaluate(s => window.reader.applySettings(s), DEFAULT_SETTINGS);
  await waitFor(page, 'layout', from, 15000);

  /* -------------------------------------------------------------- 14. scrolling layout */
  from = await count(page);
  await page.evaluate(s => window.reader.applySettings(s), settings({ layout: 'scroll' }));
  const scrollLayout = await waitFor(page, 'layout', from, 15000);
  check(scrollLayout.mode === 'scroll' && scrollLayout.total > 0, 'applySettings({layout:"scroll"}) relayouts as one continuous scroll', `total=${scrollLayout.total}px`);
  await sleep(400);
  before = await lastOf(page, 'position');
  await page.mouse.move(640, 400);
  await page.mouse.wheel(0, 900);
  await sleep(600);
  after = await lastOf(page, 'position');
  check(after.percent !== before.percent && after.page > before.page, 'the wheel scrolls the text and progress follows', `${before.percent}% → ${after.percent}% (y ${before.page} → ${after.page})`);

  /* -------------------------------------------------------------- 15. back to pages, same place */
  const inScroll = await state(page);
  from = await count(page);
  await page.evaluate(s => window.reader.applySettings(s), DEFAULT_SETTINGS);
  await waitFor(page, 'layout', from, 15000);
  const back = await state(page);
  const sameSpine = back.locator.spine === inScroll.locator.spine;
  const drift = Math.abs(back.locator.offset - inScroll.locator.offset);
  check(back.mode === 'paginated' && sameSpine && drift <= 4, 'switching back to pages keeps the reading position',
    `${JSON.stringify(inScroll.locator)} → ${JSON.stringify(back.locator)} (page ${back.page}/${back.total})`);

  /* -------------------------------------------------------------- 16. the end of the book */
  from = await count(page);
  await page.evaluate(() => window.reader.goToFraction(1));
  await waitFor(page, 'position', from, 5000);
  await sleep(300);
  from = await count(page);
  await page.evaluate(() => window.reader.next());
  const end = await waitFor(page, 'end', from, 5000).catch(() => null);
  check(!!end, 'paging past the last page posts end', `atEnd=${(await lastOf(page, 'position')).atEnd}`);

  /* -------------------------------------------------------------- 17. links */
  from = await count(page);
  const externalHref = await page.evaluate(() => {
    const a = document.querySelector('a[href^="http"]:not([data-internal-href])');
    if (!a) return null;
    a.click();
    return a.getAttribute('href');
  });
  if (externalHref) {
    const link = await waitFor(page, 'link', from, 5000).catch(() => null);
    check(link && link.href === externalHref, 'clicking a link out of the book posts link', link ? link.href : 'no message');
  } else check(true, 'clicking a link out of the book posts link', 'skipped: this book has no external links');
  from = await count(page);
  const internalHref = await page.evaluate(() => { const a = document.querySelector('a[data-internal-href]'); if (!a) return null; a.click(); return a.dataset.internalHref; });
  if (internalHref) {
    const moved = await waitFor(page, 'position', from, 5000).catch(() => null);
    check(!!moved, 'clicking a link inside the book navigates instead of reporting it', internalHref);
    check((await allOf(page, 'link')).length === (externalHref ? 1 : 0), 'in-book links are never reported as external links');
  } else check(true, 'clicking a link inside the book navigates instead of reporting it', 'skipped: this book has no internal links');

  /* -------------------------------------------------------------- 18. empty search cancels */
  from = await count(page);
  await page.evaluate(() => window.reader.search(''));
  const cancelled = await waitFor(page, 'searchResults', from, 5000);
  check(cancelled.results.length === 0 && cancelled.done === true, 'an empty query cancels the search');

  /* -------------------------------------------------------------- 19. re-open with what the app stored */
  from = await count(page);
  await page.evaluate(() => window.reader.goToFraction(0.6));
  await waitFor(page, 'position', from, 5000);
  await settle(page);
  const saved = await state(page);
  from = await count(page);
  await page.evaluate(([s, loc]) => window.reader.open({
    url: '/book/test.epub', settings: s, locator: loc,
    bookmarks: [{ id: 'bm', locator: loc }],
    highlights: [{ id: 'hx', locator: { spine: loc.spine, start: loc.offset, end: loc.offset + 20 }, color: 'blue', note: 'from the app' }],
  }), [DEFAULT_SETTINGS, saved.locator]);
  const reopened = await waitFor(page, 'opened', from, 90000);
  const restored = await state(page);
  check(reopened.total === opened.total, 're-opening the book lays it out the same way', `${opened.total} vs ${reopened.total} pages`);
  check(restored.locator.spine === saved.locator.spine && Math.abs(restored.locator.offset - saved.locator.offset) <= 4,
    'open({locator}) restores the reading position', `${JSON.stringify(saved.locator)} → ${JSON.stringify(restored.locator)}`);
  check(restored.bookmark === 'bm', 'bookmarks passed to open() land on the restored page');
  check(await page.evaluate(() => document.querySelectorAll('span.books-hl[data-id="hx"]').length > 0), 'highlights passed to open() are rendered');

  /* -------------------------------------------------------------- errors */
  const posted = await allOf(page, 'error');
  check(posted.length === 0, 'the page posted no error messages', posted.map(e => e.message).join(' | '));
  check(errors.length === 0, 'no uncaught page errors', errors.join(' | '));
  for (const w of warnings) console.log('  WARN  book resource did not load — ' + w);

  if (failures) {
    try { fs.mkdirSync(shots, { recursive: true }); await page.screenshot({ path: path.join(shots, `reader-core-${browserName}-failure.png`) }); } catch (e) { /* ignore */ }
  }
  await browser.close();
  server.close();
  console.log(`\n${failures ? 'FAILED' : 'OK'} — ${checks - failures}/${checks} checks passed (${path.basename(epubPath)}, ${browserName})`);
  process.exit(failures ? 1 : 0);
})().catch(e => {
  console.error('\nHARNESS ERROR: ' + (e && e.stack ? e.stack : e));
  try { server.close(); } catch (err) { /* ignore */ }
  process.exit(1);
});
