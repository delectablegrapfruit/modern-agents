// tests/node/load.cjs — owner: W1-K (lead). Loads the game's Node-safe files into a vm context
// (window = globalThis, no document, no browser API, Math.random poisoned) in index.html order and
// runs SR.boot({ headless: true }) (ARCHITECTURE §18; docs/CONTRACT.md §18).
//
//   node tests/node/load.cjs rules            js/boot/*, js/core/rng.js, js/core/text.js, js/rules/*, js/data/**
//   node tests/node/load.cjs all              rules + every registration file (the validator's set)
//   options: --shuffle <seed> (boot files first, the rest shuffled), --no-boot, --list, --quiet
//
//   const { load } = require('./load.cjs');
//   const { SR } = load({ mode: 'rules' });   // throws on the first load or boot error
//
// Values from the context belong to another realm: compare them with JSON (suite().eq does) or
// assert.deepEqual, never assert.deepStrictEqual (prototypes differ across realms).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');

// ARCHITECTURE §18: mode rules, and the registration files mode all adds (ARCHITECTURE §4).
const RULES = [/^js\/boot\/[^/]+\.js$/, /^js\/core\/rng\.js$/, /^js\/core\/text\.js$/, /^js\/rules\/[^/]+\.js$/, /^js\/data\/.+\.js$/];
const REGISTRATION = [
  /^js\/art\/palette\.js$/, /^js\/art\/icons\.js$/, /^js\/art\/interiors\/[^/]+\.js$/,
  /^js\/art\/exteriors-detail\.js$/, /^js\/art\/props\.js$/, /^js\/art\/logos\.js$/,
  /^js\/minigames\/skins\/[^/]+\.js$/, /^js\/audio\/sfx\.js$/, /^js\/audio\/songs\/[^/]+\.js$/,
  /^js\/ui\/subscreens\/[^/]+\.js$/,
];

/** @returns {string[]} every script src of index.html, in order (root-relative). */
function indexScripts() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const out = [];
  const re = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html))) out.push(m[1].replace(/^\.\//, ''));
  return out;
}

/** @returns {string[]} the files of a mode ('rules' | 'all'), in index order. */
function files(mode) {
  const pats = mode === 'all' ? RULES.concat(REGISTRATION) : mode === 'rules' ? RULES : null;
  if (!pats) throw new Error('load.cjs: unknown mode "' + mode + '" (rules | all)');
  return indexScripts().filter((f) => pats.some((p) => p.test(f)));
}

/** @returns {function(): number} a small seeded PRNG for --shuffle (mulberry32; not the game's RNG). */
function mulberry32(a) {
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Boot files keep their order and come first; the rest is shuffled with the seed. */
function shuffled(list, seed) {
  const boot = list.filter((f) => f.startsWith('js/boot/'));
  const rest = list.filter((f) => !f.startsWith('js/boot/'));
  const r = mulberry32(seed >>> 0);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return boot.concat(rest);
}

/** Creates an empty game context: window = globalThis, console, Math.random poisoned. */
function context(opts = {}) {
  const ctx = vm.createContext({ console: opts.console || console });
  vm.runInContext('globalThis.window = globalThis;', ctx);
  if (!opts.allowRandom) {
    vm.runInContext("Math.random = function () { throw new Error('Math.random is not allowed in Node-loaded files (use SR.rng)'); };", ctx);
  }
  return ctx;
}

/** Runs code in ctx as if it were the file rel (root-relative, for error messages and SR.def file names). */
function run(ctx, code, rel) {
  vm.runInContext(code, ctx, { filename: path.join(ROOT, rel) });
}

/**
 * Loads a set of files and boots headless.
 * @param {object} opts mode ('rules' | 'all'), files (explicit list instead of a mode), extra (more
 *   files after the mode's), shuffle (seed), boot (default true), keepGoing (collect every error
 *   instead of throwing), allowRandom, console
 * @returns {{SR: object, context: object, files: string[], errors: {file: string, error: Error}[], boot: object}}
 */
function load(opts = {}) {
  const mode = opts.mode || 'rules';
  let list = opts.files ? opts.files.slice() : files(mode).concat(opts.extra || []);
  if (opts.shuffle !== undefined && opts.shuffle !== null && opts.shuffle !== false) list = shuffled(list, Number(opts.shuffle));
  const ctx = context(opts);
  const errors = [];
  const fail = (file, error) => {
    errors.push({ file, error });
    if (!opts.keepGoing) {
      const e = new Error('load.cjs: ' + file + ': ' + (error && error.message) +
        (/is not defined|Cannot read prop/.test(String(error && error.message)) ? ' (files loaded in Node must not touch the DOM or browser APIs at load time)' : ''));
      e.cause = error;
      throw e;
    }
  };
  for (const rel of list) {
    const abs = path.join(ROOT, rel);
    let code;
    try {
      code = fs.readFileSync(abs, 'utf8');
    } catch (e) {
      fail(rel, new Error('missing file'));
      continue;
    }
    try {
      run(ctx, code, rel);
    } catch (e) {
      fail(rel, e);
    }
  }
  let boot = null;
  if (opts.boot !== false && !errors.length) {
    try {
      boot = ctx.SR.boot({ headless: true });
    } catch (e) {
      fail('SR.boot({ headless: true })', e);
    }
  }
  return { SR: ctx.SR, context: ctx, files: list, errors, boot };
}

/**
 * A tiny test reporter shared by the Node and e2e suites.
 * @returns {{ok: function, eq: function, throws: function, section: function, done: function(): boolean}}
 */
function suite(name) {
  let pass = 0;
  let failed = 0;
  const t = {
    section(title) { console.log(title); },
    ok(cond, msg, extra) {
      if (cond) { pass++; console.log('  ok   ' + msg); }
      else { failed++; console.log('  FAIL ' + msg + (extra !== undefined ? ' ' + JSON.stringify(extra) : '')); }
      return !!cond;
    },
    eq(got, want, msg) {
      const g = JSON.stringify(got);
      const w = JSON.stringify(want);
      return t.ok(g === w, msg + (g === w ? '' : ' (got ' + g + ', want ' + w + ')'));
    },
    throws(fn, re, msg) {
      try {
        fn();
      } catch (e) {
        return t.ok(!re || re.test(String(e && e.message)), msg + (re && !re.test(String(e && e.message)) ? ' (message: ' + (e && e.message) + ')' : ''));
      }
      return t.ok(false, msg + ' (did not throw)');
    },
    done() {
      console.log(name + ': ' + pass + ' passed, ' + failed + ' failed');
      if (failed) process.exitCode = 1;
      return failed === 0;
    },
  };
  console.log('# ' + name);
  return t;
}

module.exports = { ROOT, RULES, REGISTRATION, indexScripts, files, load, context, run, shuffled, suite };

if (require.main === module) {
  const args = process.argv.slice(2);
  const mode = args.find((a) => a === 'rules' || a === 'all') || 'rules';
  const si = args.indexOf('--shuffle');
  const quiet = args.includes('--quiet');
  const t0 = Date.now();
  const res = load({ mode, shuffle: si >= 0 ? Number(args[si + 1]) : undefined, boot: !args.includes('--no-boot'), keepGoing: true });
  if (args.includes('--list')) res.files.forEach((f) => console.log('  ' + f));
  for (const e of res.errors) console.error('ERROR ' + e.file + ': ' + (e.error && (e.error.stack || e.error.message)));
  const SR = res.SR;
  if (!quiet && SR && SR.registry) {
    const counts = SR.registry.kinds.map((k) => [k, SR.registry.entries(k).length]).filter((x) => x[1] > 0);
    console.log('  registrations: ' + (counts.length ? counts.map((x) => x[0] + ' ' + x[1]).join(', ') : 'none yet'));
  }
  console.log('load.cjs ' + mode + (si >= 0 ? ' (shuffle ' + args[si + 1] + ')' : '') + ': ' + res.files.length + ' files, ' +
    (res.boot ? res.boot.hooks + ' headless boot hooks' : 'no boot') + ', ' + res.errors.length + ' errors (' + (Date.now() - t0) + ' ms)');
  process.exitCode = res.errors.length ? 1 : 0;
}
