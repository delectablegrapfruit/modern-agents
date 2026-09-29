// tests/node/w1c-kit.cjs — owner: W1-C. Shared helpers for the conflict and chance suites
// (tests/node/{crime,trade,fight,casino,election}.test.cjs): a booted mode-`rules` context, fresh
// states with a patch, seeded contexts, feature switches, scripted and counting streams, and fixture
// actions (owner 'testc') that run the W1-C named fns through the real action pipeline. Fakes are
// installed after boot, in the test only (CONTRACT D27). Not a test itself.
'use strict';
const L = require('./load.cjs');

/**
 * Loads mode `rules` and boots headless; console.warn is collected in SR.__warns.
 * @returns {object} SR (another realm: compare with JSON or suite().eq)
 */
function boot() {
  const warns = [];
  const con = { log: console.log, warn: (...a) => warns.push(a.join(' ')), error: console.error };
  const { SR } = L.load({ mode: 'rules', console: con });
  SR.__warns = warns;
  return SR;
}

/** @returns {object} a new-game state (seed 7, Fair start) with a patch deep-merged in (arrays replace). */
function state(SR, patch, opts) {
  const s = SR.rules.state.create(Object.assign({ seed: 7 }, opts || {}));
  if (patch) SR.util.merge(s, patch);
  return s;
}

/** @returns {object} a pipeline-like context with its own seeded stream. */
function ctx(SR, seed, extra) {
  return Object.assign({ rng: SR.rng.create(seed === undefined ? 1 : seed), source: 'sim' }, extra || {});
}

/** Turns feature flags on or off; returns a function that restores them. */
function features(SR, map) {
  const old = {};
  Object.keys(map).forEach((k) => { old[k] = SR.features[k]; SR.features[k] = !!map[k]; });
  return () => Object.keys(old).forEach((k) => { SR.features[k] = old[k]; });
}

/**
 * A scripted stream: int / float / chance / next / pick return queued values (a function of the
 * call is allowed), else fall back to a real seeded stream. Counts every draw.
 * @param {object} SR
 * @param {{int: Array, float: Array, chance: Array}} q queues per method
 */
function scripted(SR, q, seed) {
  const real = SR.rng.create(seed || 5);
  const queues = { int: (q.int || []).slice(), float: (q.float || []).slice(), chance: (q.chance || []).slice() };
  const r = {
    draws: 0,
    int(lo, hi) { r.draws++; if (queues.int.length) { const v = queues.int.shift(); return typeof v === 'function' ? v(lo, hi) : v; } return real.int(lo, hi); },
    float(lo, hi) { r.draws++; if (queues.float.length) { const v = queues.float.shift(); return typeof v === 'function' ? v(lo, hi) : v; } return real.float(lo, hi); },
    chance(p) { r.draws++; if (queues.chance.length) return !!queues.chance.shift(); return real.chance(p); },
    next() { r.draws++; return real.next(); },
    pick(a) { r.draws++; return real.pick(a); },
    weighted(p) { r.draws++; return real.weighted(p); },
    state() { return real.state(); },
    setState(s) { real.setState(s); return r; },
  };
  return r;
}

/** Wraps a stream and counts its draws (every method but state / setState / seed). */
function counting(rng) {
  const c = { draws: 0 };
  ['next', 'float', 'int', 'pick', 'chance', 'weighted'].forEach((m) => {
    c[m] = function () { c.draws++; return rng[m].apply(rng, arguments); };
  });
  c.state = () => rng.state();
  c.setState = (st) => { rng.setState(st); return c; };
  c.seed = (n) => { rng.seed(n); return c; };
  return c;
}

/**
 * Registers the fixture actions that call the W1-C named fns (idempotent per context), as the
 * wave-2 building data will.
 * @returns {string[]} the fixture ids
 */
function fixtures(SR) {
  if (SR.__w1c) return SR.__w1c;
  const A = (id, def) => SR.def.action('testc.' + id, Object.assign({ building: 'testc', p: 0, label: 'act.testc.' + id, group: 'special' }, def));
  A('robStore', { group: 'crime', timeRule: 'robbery', requires: [['fn', 'crime.canRob', 'store']], effects: [['fn', 'crime.rob', 'store']] });
  A('robStore:resolve', { group: 'crime', timeRule: 'free', effects: [['fn', 'crime.robResolve', 'store']] });
  A('robBank', { group: 'crime', timeRule: 'robbery', requires: [['fn', 'crime.canRob', 'bank']], effects: [['fn', 'crime.rob', 'bank']] });
  A('robBank:resolve', { group: 'crime', timeRule: 'free', effects: [['fn', 'crime.robResolve', 'bank']] });
  A('jailDay', { timeRule: 'free', effects: [['fn', 'crime.jailDay']] });
  A('bail', { timeRule: 'free', p: 1, feature: 'police', requires: [['fn', 'crime.canBail']], effects: [['fn', 'crime.payBail']] });
  A('smuggle', { timeRule: 'trip', effects: [['fn', 'trade.smuggle']] });
  A('smuggleCost', { timeRule: 'trip', cost: { cash: 'trade.ticket' }, effects: [['fn', 'trade.smuggle']] });
  A('take', { timeRule: 'free', effects: [['fn', 'trade.take']] });
  A('walk', { timeRule: 'free', effects: [['fn', 'trade.walk']] });
  A('barFight', { group: 'special', cost: { min: 180 }, effects: [['fn', 'fight.start', 'bar']] });
  A('barFight:resolve', { timeRule: 'free', effects: [['fn', 'fight.resolve', 'bar']] });
  A('slots', { timeRule: 'free', requires: [['fn', 'casino.canPlay', 'slots']], effects: [['fn', 'casino.slotsSpin']] });
  A('roulette', { timeRule: 'free', effects: [['fn', 'casino.rouletteSpin']] });
  A('bjHand', { timeRule: 'free', effects: [['fn', 'casino.bjHand']] });
  A('rally', { cost: { cash: 'election.cash', min: 'election.min' }, requires: [['fn', 'election.canCampaign']], effects: [['fn', 'election.campaign']] });
  A('tvAd', { cost: { cash: 'election.cash', min: 'election.min' }, requires: [['fn', 'election.canCampaign']], effects: [['fn', 'election.campaign']] });
  A('accept', { timeRule: 'free', effects: [['fn', 'election.accept']] });
  A('decree', { timeRule: 'free', p: 1, feature: 'civicPlus', effects: [['fn', 'election.decree']] });
  SR.__w1c = SR.registry.entries('action').filter((e) => e.def.building === 'testc').map((e) => e.id);
  return SR.__w1c;
}

/** Runs a fixture action through the pure pipeline. */
function act(SR, s, id, params, seed) { return SR.rules.act.run(s, 'testc.' + id, params || {}, ctx(SR, seed)); }

/** A deep copy through JSON (values of the vm realm compare by JSON). */
function json(v) { return JSON.parse(JSON.stringify(v)); }

/** @returns {number} |a - b| ≤ tol */
function near(a, b, tol) { return Math.abs(a - b) <= tol; }

module.exports = { L, boot, state, ctx, features, scripted, counting, fixtures, act, json, near };
