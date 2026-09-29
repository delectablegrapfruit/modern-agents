// tests/node/shuffle.test.cjs — owner: W1-Q. The load-time rule under shuffled loading, in Node
// (ARCHITECTURE §4, §18; CONTRACT §1): modes `rules` and `all` load in 5 random orders (js/boot/*
// first, the rest shuffled with fixed seeds) and must boot headless with no load, registration,
// boot or console error, and end up exactly as the index order does: the same ids per kind from the
// same files, the same boot hooks, the same tuning and text, the same new-game state and the same
// preview of every registered action on it.
//   node tests/node/shuffle.test.cjs [--seeds 11,22,33] [--mode rules|all]
'use strict';
const L = require('./load.cjs');

const args = process.argv.slice(2);
const val = (f) => { const k = args.indexOf(f); return k >= 0 ? args[k + 1] : undefined; };
const SEEDS = (val('--seeds') || '1101,2202,3303,4404,5505').split(',').map(Number);
const MODES = val('--mode') ? [val('--mode')] : ['rules', 'all'];

/** Loads and boots; @returns {object} a JSON-comparable snapshot of what loading produced. */
function snapshot(mode, shuffle) {
  const logs = [];
  const quiet = {
    log() {}, info() {}, debug() {}, trace() {}, warn() {},
    error(...a) { logs.push(a.map((x) => (x && x.message) || String(x)).join(' ')); },
  };
  const res = L.load({ mode, shuffle, keepGoing: true, console: quiet });
  const SR = res.context.SR;
  const out = {
    errors: res.errors.map((e) => e.file + ': ' + ((e.error && e.error.message) || e.error)),
    consoleErrors: logs,
    booted: !!(SR && SR.booted),
    files: res.files,
  };
  if (!SR || !SR.registry) return out;
  out.registryErrors = SR.registry.errors().map((e) => e.kind + ' ' + e.id + ': ' + e.message);
  out.kinds = {};
  SR.registry.kinds.forEach((k) => {
    const ids = SR.registry.entries(k).map((e) => e.id + ' @ ' + e.file).sort();
    if (ids.length) out.kinds[k] = ids;
  });
  out.hooks = SR.registry.hooks().map((h) => h.prio + ' ' + h.file + (h.headless ? ' headless' : '')).sort();
  out.tuning = JSON.stringify(SR.tuning);
  out.text = JSON.stringify(Object.keys(SR.reg.text).sort().map((k) => [k, SR.reg.text[k]]));
  out.features = JSON.stringify(SR.features);
  if (SR.booted && SR.rules && SR.rules.state && typeof SR.rules.state.create === 'function') {
    try {
      const s = SR.rules.state.create({ seed: 12345 });
      out.state = JSON.stringify(s);
      if (SR.rules.act && typeof SR.rules.act.preview === 'function') {
        out.previews = Object.keys(SR.reg.action).sort().map((id) => {
          try {
            return id + ' ' + JSON.stringify(SR.rules.act.preview(s, id, {}, { rng: SR.rng.create(7), now: s.clock.min, source: 'sim' }));
          } catch (e) { return id + ' threw ' + e.message; }
        });
      }
    } catch (e) { out.state = 'threw ' + e.message; }
  }
  return out;
}

const T = L.suite('node shuffle (W1-Q)');
for (const mode of MODES) {
  T.section('mode ' + mode + ': index order');
  const base = snapshot(mode, undefined);
  T.eq(base.errors, [], mode + ' loads in index order');
  T.ok(base.booted, mode + ' boots headless');
  T.eq(base.registryErrors || [], [], 'no registration errors');
  T.eq(base.consoleErrors, [], 'no console.error during load and boot');
  const kinds = Object.keys(base.kinds || {});
  for (const seed of SEEDS) {
    T.section('mode ' + mode + ': shuffle ' + seed);
    const s = snapshot(mode, seed);
    const moved = s.files.filter((f, k) => base.files[k] !== f).length;
    T.ok(s.files.slice(0, 3).every((f) => /^js\/boot\//.test(f)) && moved > s.files.length / 2, 'js/boot/* first, then a shuffle (' + moved + ' of ' + s.files.length + ' files moved)');
    T.eq(s.errors, [], 'loads with no error');
    T.ok(s.booted, 'boots headless');
    T.eq(s.registryErrors || [], [], 'no registration errors');
    T.eq(s.consoleErrors, [], 'no console.error during load and boot');
    T.ok(kinds.every((k) => JSON.stringify(s.kinds[k]) === JSON.stringify(base.kinds[k])) && Object.keys(s.kinds || {}).length === kinds.length,
      'the same ids per kind from the same files (' + kinds.map((k) => k + ' ' + base.kinds[k].length).join(', ') + ')',
      kinds.filter((k) => JSON.stringify(s.kinds[k]) !== JSON.stringify(base.kinds[k])));
    T.eq(s.hooks, base.hooks, 'the same boot hooks (' + (base.hooks || []).length + ')');
    T.ok(s.tuning === base.tuning && s.features === base.features && s.text === base.text, 'the same tuning, feature flags and text');
    if (base.state !== undefined) T.ok(s.state === base.state, 'the same new-game state (seed 12345)');
    if (base.previews) {
      const diff = base.previews.filter((p, k) => s.previews[k] !== p).map((p) => p.split(' ')[0]);
      T.eq(diff, [], 'the same preview of every registered action (' + base.previews.length + ')');
    }
  }
}
T.done();
