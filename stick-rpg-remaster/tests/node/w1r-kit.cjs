// tests/node/w1r-kit.cjs — owner: W2-RulesE (W1-R in wave 1). Shared helpers for the rules-kernel suites
// (state, act, time, stats, perks, tuning, mods): a fresh mode-`rules` context, a new-game state,
// and the fixture actions the pipeline tests run (registered after boot under the owner 'testbld',
// so they never collide with real building data). Not a test itself.
'use strict';
const L = require('./load.cjs');

/**
 * Loads mode `rules` in a fresh vm context and boots headless.
 * @param {{features: object, quiet: boolean}=} opts features: flags to turn on after boot
 * @returns {object} SR of that context
 */
function load(opts = {}) {
  const warns = [];
  const con = opts.quiet === false ? console : { log: console.log, warn: (...a) => warns.push(a.join(' ')), error: console.error };
  const { SR } = L.load({ mode: 'rules', console: con });
  SR.__warns = warns;
  for (const k of Object.keys(opts.features || {})) SR.features[k] = !!opts.features[k];
  return SR;
}

/** @returns {object} a new-game state (seed 7, Standard, Fair start unless overridden). */
function newState(SR, opts = {}) {
  return SR.rules.state.create(Object.assign({ seed: 7 }, opts));
}

/** A deep copy through JSON (values of the vm realm compare by JSON). */
function json(v) { return JSON.parse(JSON.stringify(v)); }

/**
 * Registers the fixture actions and named fns (idempotent per context).
 * @returns {string[]} the fixture action ids
 */
function fixtures(SR) {
  if (SR.__fixtures) return SR.__fixtures;
  const A = (id, def) => SR.def.action('testbld.' + id, Object.assign({ building: 'testbld', p: 0, label: 'act.testbld.' + id }, def));
  A('fries', { group: 'eat', order: 20, cost: { cash: 12, min: 30 }, priceTarget: 'food.mcsticks.fries', requires: [['hpBelowMax']],
    effects: [['heal', 20], ['emit', 'eat', { item: 'fries', hp: 20, where: 'mcsticks' }], ['sfx', 'eat'], ['anim', 'eat']], repeatable: true });
  A('snack', { group: 'eat', order: 30, cost: { cash: 1, min: 30 }, requires: [['hpBelowMax']], effects: [['heal', 1]], repeatable: true });
  A('work', { group: 'work', cost: { min: 360 }, requires: [['jobTrack', 'mcsticks']],
    effects: [['cash', 42, 'wage'], ['karma', 1], ['emit', 'shift', { track: 'mcsticks', rank: 'cook', variant: 'full', m: 1, pay: 42 }]], repeatable: true });
  A('class', { group: 'train', cost: { cash: 20, min: 120 }, priceTarget: 'class.biz', effects: [['stat', 'int', 4], ['daily', 'uofsKarma', 1]], repeatable: true });
  A('study', { group: 'train', cost: { min: 120 }, effects: [['stat', 'int', 2]], repeatable: true });
  A('gym', { group: 'train', cost: { min: 120, hp: 4 }, requires: [['hpAbove', 4]], effects: [['stat', 'str', 2]], repeatable: true });
  A('lift', { group: 'train', cost: { min: 60 }, effects: [['stat', 'str', 5]] });
  A('rob', { group: 'crime', timeRule: 'robbery', confirm: 'confirm.testbld.rob', requires: [['item', 'gun', 1], ['item', 'ammo', 10]],
    effects: [['open', 'holdup', { target: 'store' }]] });
  A('rob:resolve', { group: 'crime', timeRule: 'free', effects: [['setTime', 1440], ['karma', -10], ['heat', 30], ['emit', 'rob', { target: 'store', outcome: 'lose', loot: 0 }]] });
  A('beer', { group: 'train', cost: { cash: 20, min: 60 }, priceTarget: 'item.bar.beer', requires: [['buzzBelow', 5]], effects: [['stat', 'cha', 2], ['buzz', 1]], repeatable: true });
  A('degreeClass', { group: 'train', p: 1, feature: 'degrees', cost: { cash: 20, min: 120 }, effects: [['stat', 'cha', 4]] });
  A('phoneOnly', { group: 'special', hidden: [['noItem', 'phone']], effects: [['flag', 'called']] });
  A('deposit', { group: 'services', screen: 'bank.deposit', requires: [['cashAtLeast', 1]] });
  A('bill', { group: 'special', timeRule: 'free', effects: [['charge', 500, 'test']] });
  A('fall', { group: 'special', timeRule: 'free', effects: [['hurt', 10, 'fall'], ['record', 'falls', 1], ['emit', 'fall', { count: 1, x: 0, y: 0 }]] });
  A('crash', { group: 'special', timeRule: 'free', effects: [['hurt', 999, 'carCrash']] });
  A('chess', { group: 'special', cost: { min: 60 }, requires: [['cashAtLeast', 20], ['dailyBelow', 'chess', 3]],
    effects: [['daily', 'chess', 1], ['stat', 'int', 1], ['check', 'park.chess', 'int', 150, [['cash', 20, 'win']], [['cash', -20]]]] });
  A('coin', { group: 'special', effects: [['chance', 0.5, [['cash', 10]], [['cash', 1]]]] });
  A('ammoLoss', { group: 'special', effects: [['fn', 'test.randAmmo']] });
  A('refuse', { group: 'special', effects: [['cash', 5], ['karma', 3], ['fn', 'test.refuse']] });
  A('jail', { group: 'crime', timeRule: 'free', effects: [['jail', 'test']] });
  A('news', { group: 'special', effects: [['log', 'promoted', { track: 'nli' }], ['msg', 'vm.harold.test', { n: 1 }], ['toast', 'toast.stats.winded', {}, 'info'], ['stamp', 'stamp.stats.int', { n: 2 }]] });
  A('karmaBig', { group: 'special', effects: [['karma', 150]] });
  A('karmaLow', { group: 'special', effects: [['karma', -250]] });
  A('heatUp', { group: 'special', effects: [['heat', 70]] });
  A('buyGum', { group: 'buy', cost: { cash: 1 }, priceTarget: 'item.store.gum', effects: [['item', 'gum', 1]], repeatable: true });
  A('takeoutFries', { group: 'buy', p: 1, feature: 'shopsPlus', cost: { cash: 12 }, priceTarget: 'food.mcsticks.fries', effects: [['item', 'takeout', 1, 'fries']] });
  A('useSmokes', { group: 'special', cost: { min: 60, hp: 10, items: { smokes: 1 } }, requires: [['hpAbove', 10]], effects: [['stat', 'cha', 1], ['karma', -1]] });
  A('late', { group: 'special', cost: { min: 30 }, effects: [['setTime', 1440]] });
  A('throws', { group: 'special', effects: [['cash', 5], ['fn', 'test.throw']] });
  A('achieve', { group: 'special', effects: [['achievement', 'firstFries']] });
  A('perkPick', { group: 'special', timeRule: 'free', effects: [['fn', 'perks.choose']] });
  A('arcGift', { group: 'special', effects: [['emit', 'gift', { npc: 'harold', item: 'cash', n: 10 }]] });

  SR.def.fn('test.randAmmo', (s, params, ctx) => { const n = ctx.rng.int(5, 9); s.items.ammo = Math.max(0, s.items.ammo - n); return {}; });
  SR.def.fn('test.refuse', () => ({ ok: false, reason: 'reason.notNow', vars: {} }));
  SR.def.fn('test.throw', () => { throw new Error('planted'); });

  SR.__fixtures = SR.registry.entries('action').filter((e) => e.def.building === 'testbld').map((e) => e.id);
  return SR.__fixtures;
}

/** @returns {object} a ctx for the pure forms with a fresh stream of the given seed. */
function ctx(SR, seed = 99, source = 'debug') { return { rng: SR.rng.create(seed), source }; }

module.exports = { L, load, newState, json, fixtures, ctx };
