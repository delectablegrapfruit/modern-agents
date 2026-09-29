// tests/e2e/sheets.test.cjs — owner: W1-Q. The contact-sheet smoke test (ARCHITECTURE §18;
// BUILD_PLAN §3.6, §3.11): every tests/sheets/*.html opens from disk over file://, loads js/boot/*
// first and never js/main.js (CONTRACT §17.2), boots (SR.boot({ scene: false })), runs live for a
// moment with zero console errors, page errors and failed requests, shows something (text or a
// painted canvas), and is captured full-page to shots/W1-Q/sheets/<name>.png for review.
//   node tests/e2e/sheets.test.cjs [name ...]      (only the named sheets)
'use strict';
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const h = require('../harness.cjs');

const DIR = path.join(h.ROOT, 'tests', 'sheets');
const SHOTS = path.join(h.ROOT, 'shots', 'W1-Q', 'sheets');
const SETTLE_MS = 1200;          // live time before the capture (sheets draw on the loop or on timers)
const MAX_SHOT_H = 12000;

/** @returns {string[]} the script srcs of a sheet, resolved to root-relative paths. */
function sheetScripts(file) {
  const html = fs.readFileSync(file, 'utf8');
  const out = [];
  const re = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html))) out.push(path.relative(h.ROOT, path.resolve(path.dirname(file), m[1])).split(path.sep).join('/'));
  return out;
}

/** In-page: is anything shown? Text length, painted canvases (a 32 × 32 sample that is not uniform). */
function shown() {
  const text = (document.body.innerText || '').trim().length;
  let painted = 0;
  let canvases = 0;
  document.querySelectorAll('canvas').forEach((c) => {
    if (!c.width || !c.height) return;
    canvases++;
    try {
      const s = document.createElement('canvas');
      s.width = 32;
      s.height = 32;
      const x = s.getContext('2d');
      x.drawImage(c, 0, 0, 32, 32);
      const d = x.getImageData(0, 0, 32, 32).data;
      for (let i = 4; i < d.length; i += 4) {
        if (d[i] !== d[0] || d[i + 1] !== d[1] || d[i + 2] !== d[2] || d[i + 3] !== d[3]) { painted++; return; }
      }
    } catch (e) { /* a tainted or lost canvas counts as not painted */ }
  });
  return { text, canvases, painted, booted: !!(window.SR && window.SR.booted) };
}

(async () => {
  const T = h.suite('e2e sheets (W1-Q)');
  const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const sheets = fs.readdirSync(DIR).filter((f) => /\.html$/.test(f)).sort().filter((f) => !only.length || only.includes(f.replace(/\.html$/, '')));
  fs.mkdirSync(SHOTS, { recursive: true });
  T.ok(sheets.length > 0, sheets.length + ' contact sheets: ' + sheets.join(', '));
  for (const f of sheets) {
    const name = f.replace(/\.html$/, '');
    T.section(name);
    const file = path.join(DIR, f);
    const scripts = sheetScripts(file).filter((s) => /^js\//.test(s));
    const firstBoot = scripts.slice(0, 3).join(' ');
    T.ok(/^js\/boot\/namespace\.js js\/boot\/util\.js js\/boot\/events\.js$/.test(firstBoot), 'loads js/boot/* first (' + scripts.length + ' game scripts)', firstBoot);
    T.ok(scripts.indexOf('js/main.js') < 0, 'never loads js/main.js');
    const missing = scripts.filter((s) => !fs.existsSync(path.join(h.ROOT, s)));
    T.eq(missing, [], 'every script exists');
    let t;
    try {
      t = await h.open({ width: 1400, height: 900, url: pathToFileURL(file).href, live: true, timeout: 30000 });
    } catch (e) {
      T.ok(false, 'boots (' + e.message.split('\n').slice(0, 4).join(' / ') + ')');
      continue;
    }
    try {
      await t.page.waitForLoadState('load');
      await t.page.waitForTimeout(SETTLE_MS);
      const s = await t.eval(shown);
      T.ok(s.booted, 'SR.booted');
      T.ok(s.text > 0 || s.painted > 0, 'shows something (' + s.text + ' characters of text, ' + s.painted + ' of ' + s.canvases + ' canvases painted)');
      const height = await t.eval(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight));
      await t.page.setViewportSize({ width: 1400, height: Math.max(900, Math.min(MAX_SHOT_H, height)) });
      await t.page.waitForTimeout(300);
      const out = path.join(SHOTS, name + '.png');
      await t.page.screenshot({ path: out, fullPage: height <= MAX_SHOT_H });
      T.ok(fs.statSync(out).size > 2000, 'captured ' + path.relative(h.ROOT, out));
      T.eq(t.errors(), [], 'zero console errors, page errors and failed requests');
    } catch (e) {
      T.ok(false, 'runs (' + e.message.split('\n')[0] + ')');
    } finally {
      await t.close();
    }
  }
  T.done();
})().catch((e) => { console.error(e); process.exitCode = 1; });
