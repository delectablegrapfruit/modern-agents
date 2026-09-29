// tools/run-all.cjs — owner: W1-Q. Runs every suite (ARCHITECTURE §18; BUILD_PLAN §2 integration
// step, §6.7 release checklist), each in its own Node process, and prints one line per suite and a
// summary; the exit code is 1 when any suite fails.
//
// Groups, in order:
//   node      tests/node/load.cjs rules and all, then every tests/node/*.test.cjs
//   tools     tools/validate.cjs (--wave N, or strict), tools/shingles.cjs (shingles, banned strings,
//             binary files), and their --selftest
//   balance   tests/balance/sim.cjs --selftest (20 seeds × 100 days with the trivial bot)
//   e2e       every tests/e2e/*.test.cjs (Playwright over file://; the a11y audit, the shuffled
//             load and the contact sheets among them)
//   visual    tests/visual/visual.cjs (compare with the goldens) and its --selftest
//   perf      tests/perf/perf.cjs --selftest, then the tour (--quick unless --full)
//
//   node tools/run-all.cjs                 everything; validate runs with --wave N inferred from the
//                                          stubs still in the tree (strict when none is left)
//   options: --wave N | --strict · --only node,tools · --skip perf,visual · --full (the full perf
//            tour) · --jobs N (suites in parallel within a group; perf always runs alone) ·
//            --bail (stop at the first failing group) · --verbose (every suite's output) · --list
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const STUB_RE = /\/\*\s*stub, owner:\s*([^*]+?)\s*\*\//;
const MIN = 60 * 1000;

/** @returns {number|null} the wave the tree is in: the lowest owner wave among the stubs minus one (at least 1), null when no stub is left. */
function inferWave(root) {
  const walk = (dir) => {
    let out = [];
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) out = out.concat(walk(p));
      else if (/\.(js|css)$/.test(name)) out.push(p);
    }
    return out;
  };
  let low = Infinity;
  for (const d of ['js', 'css']) {
    if (!fs.existsSync(path.join(root, d))) continue;
    for (const f of walk(path.join(root, d))) {
      const m = STUB_RE.exec(fs.readFileSync(f, 'utf8'));
      if (!m) continue;
      const w = /W(\d)/.exec(m[1]);
      low = Math.min(low, w ? Number(w[1]) : 1);
    }
  }
  return low === Infinity ? null : Math.max(1, low - 1);
}

/** @returns {string[]} root-relative files of a directory matching a pattern, sorted. */
function list(dir, re) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs).filter((f) => re.test(f)).sort().map((f) => dir + '/' + f);
}

/** @returns {{name: string, suites: {cmd: string[], timeout: number, serial?: boolean}[]}[]} */
function plan(o) {
  const validate = ['tools/validate.cjs'].concat(o.wave !== null ? ['--wave', String(o.wave)] : []);
  return [
    { name: 'node', suites: [
      { cmd: ['tests/node/load.cjs', 'rules', '--quiet'], timeout: 2 * MIN },
      { cmd: ['tests/node/load.cjs', 'all', '--quiet'], timeout: 2 * MIN },
    ].concat(list('tests/node', /\.test\.cjs$/).map((f) => ({ cmd: [f], timeout: 10 * MIN }))) },
    { name: 'tools', suites: [
      { cmd: validate, timeout: 2 * MIN },
      { cmd: ['tools/shingles.cjs'], timeout: 2 * MIN },
      { cmd: ['tools/validate.cjs', '--selftest'], timeout: 5 * MIN },
      { cmd: ['tools/shingles.cjs', '--selftest'], timeout: 2 * MIN },
    ] },
    { name: 'balance', suites: [{ cmd: ['tests/balance/sim.cjs', '--selftest'], timeout: 5 * MIN }] },
    { name: 'e2e', suites: list('tests/e2e', /\.test\.cjs$/).map((f) => ({ cmd: [f], timeout: 20 * MIN })) },
    { name: 'visual', suites: [
      { cmd: ['tests/visual/visual.cjs', '--selftest'], timeout: 5 * MIN },
      { cmd: ['tests/visual/visual.cjs'], timeout: 15 * MIN },
    ] },
    { name: 'perf', suites: [
      { cmd: ['tests/perf/perf.cjs', '--selftest'], timeout: 2 * MIN, serial: true },
      { cmd: ['tests/perf/perf.cjs'].concat(o.full ? [] : ['--quick']), timeout: (o.full ? 60 : 15) * MIN, serial: true },
    ] },
  ];
}

/** Runs one suite; @returns {Promise<{ok: boolean, ms: number, out: string, code: number|null, timedOut: boolean}>} */
function runSuite(s) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, s.cmd, { cwd: ROOT, env: process.env });
    let out = '';
    let timedOut = false;
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, s.timeout);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0 && !timedOut, ms: Date.now() - t0, out, code, timedOut });
    });
  });
}

/** @returns {string} the lines worth showing for a failed suite. */
function excerpt(out) {
  const lines = out.split('\n');
  const bad = lines.filter((l) => /^\s*(FAIL|ERROR)\b|Error:|^\s+at /.test(l)).slice(0, 30);
  const tail = lines.slice(-12);
  return bad.concat(['  …'], tail).map((l) => '      ' + l).join('\n');
}

async function main(argv) {
  const has = (f) => argv.includes(f);
  const val = (f) => { const k = argv.indexOf(f); return k >= 0 ? argv[k + 1] : undefined; };
  let wave = has('--strict') ? null : val('--wave') !== undefined ? Number(val('--wave')) : inferWave(ROOT);
  const inferred = !has('--strict') && val('--wave') === undefined;
  const only = val('--only') ? val('--only').split(',') : null;
  const skip = val('--skip') ? val('--skip').split(',') : [];
  const jobs = Math.max(1, Number(val('--jobs') || 1));
  const groups = plan({ wave, full: has('--full') }).filter((g) => (!only || only.includes(g.name)) && !skip.includes(g.name));
  if (has('--list')) {
    groups.forEach((g) => { console.log(g.name); g.suites.forEach((s) => console.log('  node ' + s.cmd.join(' '))); });
    return;
  }
  console.log('run-all: ' + groups.map((g) => g.name).join(', ') + ' · validate ' + (wave === null ? 'strict' : '--wave ' + wave + (inferred ? ' (inferred from the stubs; --strict for the release check)' : '')) +
    (jobs > 1 ? ' · ' + jobs + ' jobs' : ''));
  const results = [];
  const t0 = Date.now();
  for (const g of groups) {
    console.log('\n' + g.name);
    const queue = g.suites.slice();
    const par = g.suites.some((s) => s.serial) ? 1 : jobs;
    const worker = async () => {
      while (queue.length) {
        const s = queue.shift();
        const r = await runSuite(s);
        const label = 'node ' + s.cmd.join(' ');
        results.push({ group: g.name, label, r });
        console.log('  ' + (r.ok ? 'ok  ' : 'FAIL') + ' ' + label + ' (' + (r.ms / 1000).toFixed(1) + ' s' + (r.timedOut ? ', timed out' : '') + ')');
        if (has('--verbose')) console.log(r.out.split('\n').map((l) => '      ' + l).join('\n'));
        else if (!r.ok) console.log(excerpt(r.out));
      }
    };
    await Promise.all(Array.from({ length: Math.min(par, g.suites.length) }, worker));
    if (has('--bail') && results.some((x) => x.group === g.name && !x.r.ok)) { console.log('\n--bail: stopping after the ' + g.name + ' group'); break; }
  }
  const failed = results.filter((x) => !x.r.ok);
  console.log('\nrun-all: ' + (results.length - failed.length) + ' of ' + results.length + ' suites passed in ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s' +
    (failed.length ? '\n  failed: ' + failed.map((x) => x.label.replace(/^node /, '')).join('\n          ') : ''));
  process.exitCode = failed.length ? 1 : 0;
}

module.exports = { plan, inferWave, runSuite };

if (require.main === module) main(process.argv.slice(2)).catch((e) => { console.error(e); process.exitCode = 1; });
