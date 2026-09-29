// tests/e2e/shuffle.test.cjs — owner: W1-Q. The load-time rule in the browser (ARCHITECTURE §4,
// §18; CONTRACT §1): index.html's scripts load in 5 random orders (js/boot/* first and js/main.js
// last, everything else shuffled with fixed seeds) from a generated page whose <base> is the
// project, over file://. Each order must boot to the first scene with zero console errors, no
// registration errors and the same registrations (ids and files per kind) and boot hooks as the
// real index.html, then run 30 frames of the loop without an error.
//   node tests/e2e/shuffle.test.cjs [--seeds 11,22]
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const h = require('../harness.cjs');
const L = require('../node/load.cjs');

const args = process.argv.slice(2);
const val = (f) => { const k = args.indexOf(f); return k >= 0 ? args[k + 1] : undefined; };
const SEEDS = (val('--seeds') || '1101,2202,3303,4404,5505').split(',').map(Number);

/** Writes index.html with its scripts in another order; @returns {string} the page's file URL. */
function shuffledPage(dir, seed) {
  const html = fs.readFileSync(path.join(h.ROOT, 'index.html'), 'utf8');
  const scripts = L.indexScripts();
  const order = L.shuffled(scripts, seed).filter((f) => f !== 'js/main.js');
  if (scripts.indexOf('js/main.js') >= 0) order.push('js/main.js');
  const tags = order.map((f) => '  <script src="' + f + '"></script>').join('\n');
  const page = html
    .replace(/<head>/i, '<head>\n  <base href="' + pathToFileURL(h.ROOT).href + '/">')
    .replace(/<script\b[^>]*\bsrc\s*=[^>]*><\/script>[ \t]*\r?\n?/gi, '')
    .replace(/<\/body>/i, tags + '\n</body>');
  const file = path.join(dir, 'shuffle-' + seed + '.html');
  fs.writeFileSync(file, page);
  return { url: pathToFileURL(file).href, order };
}

/** In-page snapshot of what loading produced. */
function snap() {
  const SR = window.SR;
  const kinds = {};
  SR.registry.kinds.forEach((k) => {
    const ids = SR.registry.entries(k).map((e) => e.id + ' @ ' + e.file).sort();
    if (ids.length) kinds[k] = ids;
  });
  return {
    booted: SR.booted,
    registryErrors: SR.registry.errors().map((e) => e.kind + ' ' + e.id + ': ' + e.message),
    kinds,
    hooks: SR.registry.hooks().map((x) => x.prio + ' ' + x.file + (x.headless ? ' headless' : '')).sort(),
    scenes: SR.scenes.stack(),
    missing: SR.text && SR.text.missing ? SR.text.missing() : [],
  };
}

(async () => {
  const T = h.suite('e2e shuffle (W1-Q)');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-shuffle-'));
  try {
    T.section('index.html (the reference order)');
    const t0 = await h.open({ width: 1280, height: 720 });
    const base = await t0.eval(snap);
    T.ok(base.booted, 'index.html boots');
    T.eq(base.registryErrors, [], 'no registration errors');
    T.eq(t0.errors(), [], 'zero console errors');
    await t0.close();
    const kinds = Object.keys(base.kinds);

    for (const seed of SEEDS) {
      T.section('shuffle ' + seed);
      const page = shuffledPage(dir, seed);
      const moved = page.order.filter((f, k) => L.indexScripts()[k] !== f).length;
      T.ok(/^js\/boot\//.test(page.order[0]) && page.order[page.order.length - 1] === 'js/main.js' && moved > page.order.length / 2,
        'js/boot/* first, js/main.js last, ' + moved + ' of ' + page.order.length + ' scripts moved');
      let t;
      try {
        t = await h.open({ width: 1280, height: 720, url: page.url });
      } catch (e) {
        T.ok(false, 'boots (' + e.message.split('\n')[0] + ')');
        continue;
      }
      const s = await t.eval(snap);
      T.ok(s.booted, 'boots to ' + JSON.stringify(s.scenes));
      T.eq(s.scenes, base.scenes, 'the same first scene stack as index.html');
      T.eq(s.registryErrors, [], 'no registration errors');
      T.ok(kinds.every((k) => JSON.stringify(s.kinds[k]) === JSON.stringify(base.kinds[k])) && Object.keys(s.kinds).length === kinds.length,
        'the same registrations (' + kinds.length + ' kinds, ' + kinds.reduce((a, k) => a + base.kinds[k].length, 0) + ' ids, files included)',
        kinds.filter((k) => JSON.stringify(s.kinds[k]) !== JSON.stringify(base.kinds[k])));
      T.eq(s.hooks, base.hooks, 'the same boot hooks (' + base.hooks.length + ')');
      T.eq(s.missing.slice().sort(), base.missing.slice().sort(), 'the same missing text keys at the first scene (' + base.missing.length + ')');
      await t.eval(() => { if (window.SR.loop && typeof window.SR.loop.step === 'function') window.SR.loop.step(30); });
      T.eq(t.errors(), [], 'zero console errors after 30 frames');
      await t.close();
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  T.done();
})().catch((e) => { console.error(e); process.exit(1); });   // exit: an open browser would keep Node alive
