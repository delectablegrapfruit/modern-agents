// tests/node/core.test.cjs — owner: W1-K (lead). The kernel's Node tests (BUILD_PLAN §3.1).
// M0: the loader (modes rules and all, the DOM and Math.random guards, shuffled order), the
// registries and boot, SR.events, SR.rng (sfc32, determinism per seed, the three streams), SR.text
// and SR.util. M1 (the kernel's browser modules loaded in Node, which proves them load-time clean):
// SR.settings (schema, checks, persistence), SR.save (envelope, tmp swap, the rules stream round
// trip, deep-fill of a v1 fixture, a synthetic migration chain, quarantine, retention, the export
// code, recovery, quota, Hardcore), SR.quality (presets and Auto), SR.loop.step and SR.input
// (bindings, contexts, inject, remap, the gamepad poll).
//   node tests/node/core.test.cjs
'use strict';
const L = require('./load.cjs');

const T = L.suite('core');

/** A fresh context with the boot files, rng.js and text.js; extra files as { rel: code }. */
function kernel(extra, opts) {
  const ctx = L.context(opts);
  for (const f of ['js/boot/namespace.js', 'js/boot/util.js', 'js/boot/events.js', 'js/core/rng.js', 'js/core/text.js']) {
    L.run(ctx, require('fs').readFileSync(require('path').join(L.ROOT, f), 'utf8'), f);
  }
  for (const rel of Object.keys(extra || {})) L.run(ctx, extra[rel], rel);
  return ctx;
}
/** A console that records instead of printing. */
function quietConsole() {
  const log = { warn: [], error: [], log: [] };
  return { log, console: { warn: (...a) => log.warn.push(a.join(' ')), error: (...a) => log.error.push(a.map(String).join(' ')), log: (...a) => log.log.push(a.join(' ')) } };
}

// ------------------------------------------------------------------------------------------------
T.section('loader');
{
  const rules = L.load({ mode: 'rules', keepGoing: true });
  T.eq(rules.errors.map((e) => e.file), [], 'mode rules loads and boots headless with no errors');
  T.ok(rules.files.every((f) => L.RULES.some((p) => p.test(f))), 'mode rules loads only boot, rng, text, rules and data files');
  T.ok(rules.files.includes('js/core/rng.js') && rules.files.includes('js/core/text.js') && rules.files.includes('js/data/text/en-ui.js'), 'mode rules includes rng.js, text.js and data/**');
  T.ok(!rules.files.includes('js/core/scenes.js') && !rules.files.includes('js/main.js'), 'mode rules excludes browser files');
  T.eq(rules.files.slice(0, 3), ['js/boot/namespace.js', 'js/boot/util.js', 'js/boot/events.js'], 'boot files first, in index order');

  const all = L.load({ mode: 'all', keepGoing: true });
  T.eq(all.errors.map((e) => e.file), [], 'mode all loads and boots headless with no errors');
  for (const f of ['js/art/palette.js', 'js/art/icons.js', 'js/art/interiors/kit.js', 'js/art/exteriors-detail.js', 'js/art/props.js',
    'js/art/logos.js', 'js/minigames/skins/holdup.js', 'js/audio/sfx.js', 'js/audio/songs/stingers.js', 'js/ui/subscreens/bank.js']) {
    T.ok(all.files.includes(f), 'mode all includes ' + f);
  }
  T.ok(!all.files.includes('js/art/draw.js') && !all.files.includes('js/ui/card.js'), 'mode all excludes non-registration files');
  T.eq(L.indexScripts().filter((f) => !L.files('all').includes(f)).length + all.files.length, L.indexScripts().length, 'index scripts partition into mode all and the rest');
  T.eq(all.SR.registry.file('features', 'weather'), 'js/data/features.js', 'a registration records its file');
  T.eq(Object.keys(all.SR.features).length, 30, 'the 30 feature flags of Appendix B are registered');
  T.ok(Object.keys(all.SR.features).every((k) => all.SR.features[k] === false), 'every flag starts off');

  for (const seed of [1, 2, 3]) {
    const s = L.load({ mode: 'all', shuffle: seed, keepGoing: true });
    T.ok(!s.errors.length && s.files.join() !== all.files.join() && s.files.slice(0, 3).join() === all.files.slice(0, 3).join(),
      'shuffled load (seed ' + seed + '): boot files first, the rest reordered, boots clean');
  }

  let msg = '';
  try { L.load({ files: ['js/boot/namespace.js', 'js/nope/missing.js'] }); } catch (e) { msg = e.message; }
  T.ok(/js\/nope\/missing\.js: missing file/.test(msg), 'a missing file fails the load, naming it', msg);

  const ctx = L.context();
  T.throws(() => L.run(ctx, 'document.title;', 'js/data/bad.js'), /document is not defined/, 'touching the DOM at load time fails in Node');
  T.throws(() => L.run(ctx, 'window.addEventListener("x", function () {});', 'js/data/bad.js'), /not a function/, 'browser APIs on window are absent');
  T.throws(() => L.run(ctx, 'Math.random();', 'js/rules/bad.js'), /Math\.random is not allowed/, 'Math.random throws in Node-loaded files');
  T.throws(() => L.run(ctx, 'requestAnimationFrame(function () {});', 'js/data/bad.js'), /not defined/, 'requestAnimationFrame is absent');
}

// ------------------------------------------------------------------------------------------------
T.section('namespace and registries');
{
  const ctx = kernel();
  const SR = ctx.SR;
  T.eq([SR.VERSION, SR.W, SR.H, SR.STEP], ['0.1.0', 1280, 720, 1 / 60], 'constants VERSION, W, H, STEP');
  for (const k of ['def', 'reg', 'registry', 'rules', 'world', 'render', 'art', 'ui', 'audio', 'scenes', 'minigame', 'util', 'events', 'rng', 'tuning', 'features']) {
    T.ok(SR[k] && typeof SR[k] === 'object', 'SR.' + k + ' exists');
  }
  T.eq([SR.state, SR.booted], [null, false], 'SR.state null, SR.booted false before boot');
  T.eq(typeof SR.text, 'function', 'SR.text is a function');
  const kinds = ['tuning', 'features', 'fn', 'worldmap', 'building', 'action', 'subscreen', 'item', 'job', 'home', 'furniture', 'stock',
    'city', 'fighter', 'decree', 'rank', 'perk', 'achievement', 'encounter', 'arc', 'event', 'person', 'contact', 'skin', 'song', 'sfx',
    'text', 'interior', 'exterior', 'icon'];
  const missingKinds = kinds.filter((k) => typeof SR.def[k] !== 'function' || !SR.reg[k]);
  T.eq(missingKinds, [], 'SR.def.<kind> and SR.reg.<kind> for every kind of ARCHITECTURE §7 (' + kinds.length + ')');
  T.ok(typeof SR.def.scene === 'function' && typeof SR.def.minigame === 'function', 'kinds scene and minigame back SR.scenes.register / SR.minigame.register');
  T.eq(SR.registry.kinds.slice().sort(), kinds.concat(['scene', 'minigame']).sort(), 'SR.registry.kinds lists exactly those kinds');
  T.ok(SR.tuning === SR.reg.tuning && SR.features === SR.reg.features, 'SR.tuning and SR.features are the map registries');
}
{
  const ctx = kernel({
    'js/data/a.js': `(function () { 'use strict'; var SR = window.SR;
      SR.def.action('mcsticks.fries', { building: 'mcsticks', cost: { cash: 12, min: 30 } });
      SR.def.fn('bank.deposit', function (s, p, ctx) { return { ok: true }; });
      SR.def.icon('fries', function (ctx, size, state) {});
      SR.def.subscreen('bank.deposit', { title: 'sub.bank.deposit', mount: function () {} });
      SR.def.contact('lawyer', { name: 'contact.lawyer', p: 1, feature: 'police' });
      SR.def.exterior('bank', { detail: function () {}, signature: [[0, 0, 1, 1]] });
      SR.def.fighter(3, { n: 3 });
      SR.def.tuning({ time: { stepMin: 30 }, start: { cash: 100 } });
      SR.def.text({ 'act.mcsticks.fries': 'Fries', 'greet.x': ['A {name}', 'B {name}'] });
      SR.def.worldmap({ size: { w: 5120, h: 4608 } });
      SR.scenes.register('city', { kind: 'base' });
      SR.minigame.register('darts', { title: 'mg.darts.title' });
      SR.onBoot(20, function () { window.order.push('a20'); }, { headless: true });
      SR.onBoot(10, function () { window.order.push('a10'); });
    })();`,
    'js/data/b.js': `(function () { 'use strict'; var SR = window.SR;
      SR.onBoot(10, function () { window.order.push('b10'); }, { headless: true });
      SR.onBoot(90, function (opts) { window.order.push('b90:' + !!opts.headless); }, { headless: true });
    })();`,
  });
  const SR = ctx.SR;
  L.run(ctx, 'window.order = [];', 'js/test/setup.js');
  T.eq(SR.reg.action['mcsticks.fries'].cost, { cash: 12, min: 30 }, 'SR.def.action stores the def in SR.reg.action[id]');
  T.eq(SR.reg.action['mcsticks.fries'].id, 'mcsticks.fries', 'object defs get def.id');
  T.eq(SR.registry.file('action', 'mcsticks.fries'), 'js/data/a.js', 'the registering file is recorded');
  T.eq(SR.registry.entries('action').map((e) => [e.id, e.file]), [['mcsticks.fries', 'js/data/a.js']], 'SR.registry.entries lists id, def, file');
  T.eq(typeof SR.reg.fn['bank.deposit'], 'function', 'SR.def.fn stores a function');
  T.eq(typeof SR.reg.icon.fries, 'function', 'SR.def.icon stores a draw function');
  T.ok(SR.reg.subscreen['bank.deposit'] && SR.reg.contact.lawyer && SR.reg.exterior.bank, 'subscreen, contact and exterior register');
  T.ok(SR.reg.fighter['3'] && SR.reg.fighter['3'].id === '3', 'numeric ids become strings');
  T.eq([SR.tuning.time.stepMin, SR.tuning.start.cash], [30, 100], 'SR.def.tuning fills SR.tuning by top-level key');
  T.ok(SR.tuning.time.id === undefined, 'tuning tables are not annotated with id');
  T.eq(SR.reg.text['act.mcsticks.fries'], 'Fries', 'SR.def.text registers each key');
  T.eq(SR.reg.worldmap.main.size, { w: 5120, h: 4608 }, 'SR.def.worldmap is stored under id main');
  T.ok(SR.reg.scene.city && SR.reg.minigame.darts, 'SR.scenes.register and SR.minigame.register work at load time without their modules');
  T.eq(SR.registry.errors(), [], 'no registration errors');
  T.eq(SR.registry.hooks().map((h) => [h.prio, h.file]), [[10, 'js/core/rng.js'], [10, 'js/data/a.js'], [10, 'js/data/b.js'], [20, 'js/data/a.js'], [90, 'js/data/b.js']],
    'hooks run by priority, then registration order, with their files');
  const res = SR.boot({ headless: true });
  T.eq(ctx.order, ['b10', 'a20', 'b90:true'], 'headless boot runs only { headless: true } hooks, by priority, with opts');
  T.eq(res, { hooks: 4, headless: true }, 'SR.boot returns the hook count');
  T.eq(SR.booted, true, 'SR.booted after boot');
  T.throws(() => SR.boot({ headless: true }), /already booted/, 'a second boot throws');
  T.throws(() => SR.onBoot(10, () => {}), /after SR\.boot/, 'onBoot after boot throws');
  T.throws(() => SR.def.action('mcsticks.fries', {}), /duplicate id.*js\/data\/a\.js/, 'a duplicate after boot throws at once, naming the first file');
  SR.def.subscreen('test.late', { mount() {} });
  T.ok(!!SR.reg.subscreen['test.late'], 'a new id after boot (tests) registers');
}
{
  const ctx = kernel({
    'js/data/one.js': "window.SR.def.item('gun', { price: 400 }); window.SR.def.text({ 'item.gun': 'Hand gun' }); window.SR.def.tuning({ time: {} }); window.SR.def.features({ weather: false });",
    'js/data/two.js': "window.SR.def.item('gun', { price: 1 }); window.SR.def.text({ 'item.gun': 'Gun' }); window.SR.def.tuning({ time: {} }); window.SR.def.features({ weather: true });",
    'js/data/three.js': "window.SR.def.item('', {}); window.SR.def.building('bank', 'not an object'); window.SR.def.fn('x.y', {}); window.SR.def.features({ hustles: 'yes' }); window.SR.def.text({ 'a.b': 3 }); window.SR.def.item('knife', { id: 'dagger' });",
  });
  const SR = ctx.SR;
  const errs = SR.registry.errors();
  T.eq(errs.filter((e) => /duplicate/.test(e.message)).map((e) => [e.kind, e.id, e.files]),
    [['item', 'gun', ['js/data/one.js', 'js/data/two.js']], ['text', 'item.gun', ['js/data/one.js', 'js/data/two.js']],
      ['tuning', 'time', ['js/data/one.js', 'js/data/two.js']], ['features', 'weather', ['js/data/one.js', 'js/data/two.js']]],
    'duplicates are recorded with both files, for every kind');
  T.eq(SR.reg.item.gun.price, 400, 'the first registration is kept');
  T.eq(errs.filter((e) => !/duplicate/.test(e.message)).map((e) => e.kind + ':' + e.id),
    ['item:', 'building:bank', 'fn:x.y', 'features:hustles', 'text:a.b', 'item:knife'], 'bad ids and defs are recorded');
  T.throws(() => SR.boot({ headless: true }), /registration errors[\s\S]*item "gun": duplicate id[\s\S]*js\/data\/one\.js, js\/data\/two\.js/, 'boot throws listing the duplicates and both files');
  T.eq(SR.booted, false, 'a failed boot leaves SR.booted false');
}
{
  const ctx = kernel({ 'js/data/h.js': "window.SR.onBoot(20, function () { throw new Error('boom'); }, { headless: true });" });
  T.throws(() => ctx.SR.boot({ headless: true }), /hook \(prio 20, js\/data\/h\.js\) failed: boom/, 'a failing hook names its priority and file');
}
{
  const ctx = kernel();
  const f = ctx.SR.registry.fileFromStack;
  T.eq(f('Error\n    at callerFile (file:///C:/Games/Paper%20Sky/js/boot/namespace.js:30:21)\n    at Object.action (file:///C:/Games/Paper%20Sky/js/boot/namespace.js:99:50)\n    at file:///C:/Games/Paper%20Sky/js/data/buildings/bank.js:12:6'),
    'js/data/buildings/bank.js', 'file from a Chrome stack (Windows path)');
  T.eq(f('callerFile@file:///home/u/p/js/boot/namespace.js:30:21\nSR.def[kind]@file:///home/u/p/js/boot/namespace.js:99:59\n@file:///home/u/p/js/data/features.js:9:13\n'),
    'js/data/features.js', 'file from a Firefox stack');
  T.eq(f('callerFile@file:///Users/u/js/p/js/boot/namespace.js:30:36\n@file:///Users/u/js/p/js/boot/namespace.js:99:66\nglobal code@file:///Users/u/js/p/js/audio/songs/paper_sky.js:9:18'),
    'js/audio/songs/paper_sky.js', 'file from a Safari stack, with js/ earlier in the path');
  T.eq(f('Error\n    at callerFile (C:\\Games\\paper-sky\\js\\boot\\namespace.js:70:24)\n    at Object.item (C:\\Games\\paper-sky\\js\\boot\\namespace.js:130:67)\n    at C:\\Games\\paper-sky\\js\\data\\items.js:9:6'),
    'js/data/items.js', 'file from a Node stack on Windows (backslashes)');
  T.eq(f('Error\n    at <anonymous>:1:1'), '?', 'unknown when no js/ file is on the stack');
}

// ------------------------------------------------------------------------------------------------
T.section('SR.events');
{
  const q = quietConsole();
  const SR = kernel(null, { console: q.console }).SR;
  const E = SR.events;
  const got = [];
  const offA = E.on('buy', (p, n) => got.push('a:' + p.item + ':' + n));
  E.on('buy', (p) => got.push('b:' + p.item));
  E.on('*', (p, n) => got.push('*:' + n));
  T.eq(E.emit('buy', { item: 'fries' }), 3, 'emit returns the number of listeners called');
  T.eq(got.splice(0), ['a:fries:buy', 'b:fries', '*:buy'], 'listeners run synchronously in order, then *');
  offA();
  E.emit('buy', { item: 'gun' });
  T.eq(got.splice(0), ['b:gun', '*:buy'], 'on() returns an unsubscribe function');
  const once = (p) => got.push('once:' + p);
  E.once('night', once);
  E.emit('night', 1); E.emit('night', 2);
  T.eq(got.splice(0).filter((s) => s.startsWith('once')), ['once:1'], 'once fires a single time');
  E.once('night', once); E.off('night', once); E.emit('night', 3);
  T.eq(got.splice(0).filter((s) => s.startsWith('once')), [], 'off removes a once() listener by its function');
  E.on('fall', () => { throw new Error('bad listener'); });
  E.on('fall', () => got.push('after'));
  E.emit('fall', {});
  T.ok(got.includes('after'), 'a throwing listener does not stop the others');
  T.eq(E.errors.length, 1, 'the error is kept in SR.events.errors');
  T.ok(q.log.error.some((s) => /listener of "fall" threw/.test(s)), 'and logged with console.error');
  got.length = 0;
  const second = () => got.push('second');
  E.on('shift', () => { got.push('first'); E.off('shift', second); E.on('shift', () => got.push('late')); });
  E.on('shift', second);
  E.emit('shift', {});
  T.eq(got.splice(0).filter((s) => s !== '*:shift'), ['first'], 'a listener removed during emit is skipped; one added is not called');
  E.on('outer', () => { got.push('outer'); E.emit('inner'); });
  E.on('inner', () => got.push('inner'));
  E.emit('outer');
  T.eq(got.filter((s) => !s.startsWith('*')), ['outer', 'inner'], 'emit is re-entrant (nested emits run inline)');
  T.eq(E.count('shift'), 2, 'count(name)');
  T.eq(E.emit('nobody'), 1, 'an event with no listeners still reaches *');
}

// ------------------------------------------------------------------------------------------------
T.section('SR.rng');
{
  const SR = kernel().SR;
  const r = SR.rng.create(12345);
  T.eq([r.next(), r.next(), r.next(), r.next(), r.next()], [1977310364, 4106765030, 1538400628, 2967644150, 3285158194], 'sfc32 golden sequence for seed 12345');
  T.eq(r.state(), [138328956, 4258852600, 1794081162, 18], 'golden state after 5 draws (counter at 18)');
  T.eq([SR.rng.create(0).next(), SR.rng.create('paper').next()], [591558436, 2797389081], 'golden first draws for seed 0 and the string seed paper');
  const ref = (a, b, c, d) => () => { a |= 0; b |= 0; c |= 0; d |= 0; const t = ((a + b) | 0) + d | 0; d = (d + 1) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11); c = (c + t) | 0; return t >>> 0; };
  const g = SR.rng.create(99), f = ref(...g.state());
  let same = true; for (let i = 0; i < 10000; i++) if (f() !== g.next()) same = false;
  T.ok(same, 'matches a reference sfc32 over 10,000 draws');

  const seq = (s, n) => { const x = SR.rng.create(s); return Array.from({ length: n }, () => x.int(1, 1000)); };
  T.eq(seq(7, 50), seq(7, 50), 'the same seed gives the same sequence');
  T.ok(seq(7, 50).join() !== seq(8, 50).join(), 'different seeds give different sequences');
  const other = kernel().SR;
  T.eq(other.rng.create(42).state(), SR.rng.create(42).state(), 'determinism across contexts');

  for (const name of ['rules', 'world', 'fx']) {
    const st = SR.rng[name];
    T.ok(['seed', 'next', 'float', 'int', 'pick', 'chance', 'weighted', 'state', 'setState'].every((m) => typeof st[m] === 'function'), 'stream ' + name + ' has the full API');
    st.seed(2026); const a = [st.int(0, 99), st.float(), st.chance(0.5), st.pick(['x', 'y', 'z']), st.weighted([['p', 1], ['q', 3]])];
    st.seed(2026); const b = [st.int(0, 99), st.float(), st.chance(0.5), st.pick(['x', 'y', 'z']), st.weighted([['p', 1], ['q', 3]])];
    T.eq(a, b, 'stream ' + name + ' is deterministic per seed');
  }
  T.ok(new Set([SR.rng.rules, SR.rng.world, SR.rng.fx]).size === 3 && SR.rng.create(1).state().join() !== SR.rng.create(2).state().join(),
    'rules, world and fx are three separate generators');
  SR.rng.rules.seed(5); SR.rng.fx.seed(5);
  const before = SR.rng.rules.state();
  for (let i = 0; i < 100; i++) SR.rng.fx.float();
  T.eq(SR.rng.rules.state(), before, 'drawing from fx never moves rules');
  const w1 = SR.rng.create(1); w1.seed(SR.util.hash(12345, 3));
  SR.rng.reseedWorld(12345, 3);
  T.eq(SR.rng.world.state(), w1.state(), 'reseedWorld(seed, day) = seed(hash(seed, day))');

  const s = SR.rng.create(314);
  for (let i = 0; i < 37; i++) s.next();
  const saved = JSON.parse(JSON.stringify(s.state()));
  const expect = [s.next(), s.next(), s.next()];
  const s2 = SR.rng.create(1).setState(saved);
  T.eq([s2.next(), s2.next(), s2.next()], expect, 'state() → JSON → setState() continues the same sequence');
  T.throws(() => s2.setState([1, 2, 3]), /four numbers/, 'setState rejects a bad state');

  const d = SR.rng.create(77);
  const counts = new Array(6).fill(0);
  let lo = Infinity, hi = -Infinity, fmin = 1, fmax = 0;
  const N = 60000;
  for (let i = 0; i < N; i++) { const v = d.int(1, 6); counts[v - 1]++; lo = Math.min(lo, v); hi = Math.max(hi, v); }
  for (let i = 0; i < 10000; i++) { const v = d.float(); fmin = Math.min(fmin, v); fmax = Math.max(fmax, v); }
  T.eq([lo, hi], [1, 6], 'int(1, 6) is inclusive at both ends');
  T.ok(counts.every((c) => Math.abs(c / N - 1 / 6) < 0.01), 'int(1, 6) is uniform within 1 %', counts);
  T.ok(fmin >= 0 && fmax < 1, 'float() in [0, 1)');
  const fr = d.float(10, 20);
  T.ok(fr >= 10 && fr < 20, 'float(lo, hi) in [lo, hi)');
  T.eq(d.int(5, 5), 5, 'int(a, a) = a');
  const tally = { a: 0, b: 0, c: 0, z: 0 };
  for (let i = 0; i < 100000; i++) tally[d.weighted([['a', 1], ['b', 2], ['c', 7], ['z', 0]])]++;
  T.ok(Math.abs(tally.a / 1e5 - 0.1) < 0.01 && Math.abs(tally.b / 1e5 - 0.2) < 0.01 && Math.abs(tally.c / 1e5 - 0.7) < 0.01 && tally.z === 0,
    'weighted follows the weights within 1 %; weight 0 never wins', tally);
  let heads = 0;
  for (let i = 0; i < 100000; i++) if (d.chance(0.3)) heads++;
  T.ok(Math.abs(heads / 1e5 - 0.3) < 0.01, 'chance(0.3) within 1 %', heads);
  const c1 = SR.rng.create(8), c2 = SR.rng.create(8);
  c1.chance(0); c1.chance(1); c1.weighted([]); c1.pick([]);
  c2.next(); c2.next(); c2.next(); c2.next();
  T.eq(c1.state(), c2.state(), 'chance, weighted and pick always consume exactly one draw');
  T.eq(SR.rng.create(8).weighted([['a', 0]]), null, 'weighted with no positive weight returns null');
}

// ------------------------------------------------------------------------------------------------
T.section('SR.text');
{
  const q = quietConsole();
  const ctx = kernel({ 'js/data/text/en-test.js': "window.SR.def.text({ 'act.mcsticks.fries': 'Fries', 'toast.hi': 'Hi {name}, {n} left {missing}', 'greet.v': ['one', 'two', 'three'], 'x.money': '{cash}' });" }, { console: q.console });
  const SR = ctx.SR;
  T.eq(SR.text('act.mcsticks.fries'), 'Fries', 'a plain key');
  T.eq(SR.text('toast.hi', { name: 'Rikki', n: 3 }), 'Hi Rikki, 3 left {missing}', '{name} substitution; unknown vars stay');
  T.eq(SR.text('nope.key'), '\u27e6nope.key\u27e7', 'a missing key renders ⟦key⟧');
  SR.text('nope.key');
  T.eq(q.log.warn.filter((s) => /nope\.key/.test(s)).length, 1, 'a missing key is logged once (console.warn, not error)');
  T.eq(SR.text.missing(), ['nope.key'], 'SR.text.missing() lists it');
  T.eq([SR.text.has('act.mcsticks.fries'), SR.text.has('nope.key')], [true, false], 'SR.text.has');
  T.eq([0, 1, 2, 3, -1].map((v) => SR.text('greet.v', { variant: v })), ['one', 'two', 'three', 'one', 'three'], 'vars.variant picks an array entry (wrapping)');
  SR.rng.fx.seed(11); const a = Array.from({ length: 12 }, () => SR.text('greet.v'));
  SR.rng.fx.seed(11); const b = Array.from({ length: 12 }, () => SR.text('greet.v'));
  T.eq(a, b, 'variants without vars.variant come from the fx stream (deterministic per fx seed)');
  T.ok(new Set(a).size > 1, 'and vary');
  const rulesBefore = SR.rng.rules.state(); SR.text('greet.v');
  T.eq(SR.rng.rules.state(), rulesBefore, 'text never draws from the rules stream');
  T.eq([SR.text.money(1240), SR.text.money(-20), SR.text.money(0), SR.text.money(20, { sign: true }), SR.text.money(-0.4)], ['$1,240', '-$20', '$0', '+$20', '$0'], 'money');
  T.eq([SR.text.money(12.345, { cents: true }), SR.text.money(1234567, { compact: true }), SR.text.money(999999, { compact: true }), SR.text.money(2.5e9, { compact: true }), SR.text.money(2e6, { compact: true })],
    ['$12.35', '$1.2M', '$999,999', '$2.5B', '$2M'], 'money with cents and compact (from a million)');
  T.eq([SR.text.num(1234567), SR.text.num(-1234.5, 1), SR.text.num(0.25, 2)], ['1,234,567', '-1,234.5', '0.25'], 'num');
  T.eq([SR.text.time(0), SR.text.time(480), SR.text.time(870), SR.text.time(1440), SR.text.time(1470)], ['00:00', '08:00', '14:30', '24:00', '00:30'], 'time, 24 h (1440 reads 24:00)');
  T.eq([SR.text.time(0, true), SR.text.time(870, true), SR.text.time(720, true), SR.text.time(1440, true)], ['12:00 AM', '2:30 PM', '12:00 PM', '12:00 AM'], 'time, 12 h');
  ctx.SR.settings = { get: (k) => (k === 'game.clock24' ? false : undefined) };
  T.eq(SR.text.time(870), '2:30 PM', 'time follows settings game.clock24 when present');
  T.eq([SR.text.dur(30), SR.text.dur(120), SR.text.dur(90), SR.text.dur(0)], ['30m', '2h', '1h 30m', '0m'], 'dur');
  T.eq([SR.text.pct(0.62), SR.text.pct(0.014, 1)], ['62 %', '1.4 %'], 'pct');
}

// ------------------------------------------------------------------------------------------------
T.section('SR.util');
{
  const q = quietConsole();
  const U = kernel(null, { console: q.console }).SR.util;
  T.eq([U.clamp(5, 0, 3), U.clamp(-1, 0, 3), U.lerp(10, 20, 0.25), U.invLerp(10, 20, 15), U.invLerp(3, 3, 9)], [3, 0, 12.5, 0.5, 0], 'clamp, lerp, invLerp');
  T.eq([U.easeLinear(0.5), U.easeIn(0.5), U.easeOut(0), U.easeOut(1), U.easeInOut(0.5)], [0.5, 0.125, 0, 1, 0.5], 'easing end points and symmetry');
  T.ok(U.easeOut(0.3) > 0.3 && U.easeSpring(0.6) > 1, 'easeOut is fast early; easeSpring overshoots (the UI tokens)');
  T.eq(U.fmt('{a} and {b} {c}', { a: 1, b: 'two' }), '1 and two {c}', 'fmt');
  T.eq([U.hash(12345, 1), U.hash(12345, 2), U.hash('a'), U.hash()], [949125081, 507889145, 969755068, 2872998923], 'hash golden values (world seeds depend on them)');
  T.ok(U.hash(1, 23) !== U.hash(12, 3), 'hash separates its arguments');
  T.eq([U.crc32('123456789'), U.crc32(''), U.crc32('a😀b')], [0xcbf43926, 0, 0xb442ad84], 'crc32 (IEEE; UTF-8 bytes)');
  const defaults = { v: 1, money: { cash: 100, cds: [] }, stats: { str: 7, hp: 22 }, list: [1, 2], nul: null, obj: { a: { b: 1 } } };
  const old = { v: 1, money: { cash: 5 }, stats: { str: 9, extra: true }, list: [9], nul: 3, custom: 'kept' };
  const filled = U.deepFill(old, defaults);
  T.eq(filled, { v: 1, money: { cash: 5, cds: [] }, stats: { str: 9, extra: true, hp: 22 }, list: [9], nul: 3, custom: 'kept', obj: { a: { b: 1 } } },
    'deepFill adds missing fields, keeps values, arrays and unknown fields');
  filled.obj.a.b = 2;
  T.eq(defaults.obj.a.b, 1, 'deepFill copies (defaults are never shared)');
  const c = U.clone(defaults); c.money.cds.push(1);
  T.eq(defaults.money.cds, [], 'clone is deep');
  T.ok(U.equal({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }) && !U.equal({ a: 1 }, { a: 1, b: 2 }) && !U.equal([1], { 0: 1 }) && U.equal(NaN, NaN), 'equal');
  T.eq(U.merge({ a: { b: 1, c: 2 }, d: [1] }, { a: { b: 5 }, d: [2, 3], e: 1 }), { a: { b: 5, c: 2 }, d: [2, 3], e: 1 }, 'merge (objects merge, arrays replace)');
  T.eq([U.pad(7, 2), U.pad(123, 2)], ['07', '123'], 'pad');
  T.eq([U.warnOnce('k', 'first'), U.warnOnce('k', 'again')], [true, false], 'warnOnce');
  T.ok(U.isObject({}) && !U.isObject([]) && !U.isObject(null), 'isObject');
}

// ================================================================================================
// M1: the kernel's browser modules, loaded in Node (they must be load-time clean).
const fs = require('fs');
const path = require('path');
const FIX = path.join(L.ROOT, 'tests', 'fixtures');
const fixture = (name) => fs.readFileSync(path.join(FIX, name), 'utf8');
const fixtureJSON = (name) => JSON.parse(fixture(name));
const CORE_M1 = ['js/core/loop.js', 'js/core/stage.js', 'js/core/quality.js', 'js/core/input.js', 'js/core/scenes.js',
  'js/core/save.js', 'js/core/settings.js', 'js/core/debug.js'];
const J = (v) => JSON.parse(JSON.stringify(v));

/** A Storage double: a Map, a write log and an optional per-value quota (bytes). */
function fakeStorage(opts) {
  opts = opts || {};
  const m = opts.map || new Map();
  const log = [];
  return {
    get length() { return m.size; },
    key(i) { return Array.from(m.keys())[i] === undefined ? null : Array.from(m.keys())[i]; },
    getItem(k) { return m.has(k) ? m.get(k) : null; },
    setItem(k, v) {
      if (opts.quota && String(v).length > opts.quota && k !== 'sr1.probe') { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; }
      log.push('set ' + k); m.set(k, String(v));
    },
    removeItem(k) { log.push('remove ' + k); m.delete(k); },
    map: m, log,
  };
}

/**
 * Loads mode rules plus the kernel's M1 files; installs a fake localStorage and (unless real)
 * the fixture as SR.rules.state (a test fake, D27); boots headless.
 */
function m1(opts) {
  opts = opts || {};
  const res = L.load({ mode: 'rules', extra: CORE_M1, boot: false, console: opts.console });
  const ctx = res.context, SR = res.SR;
  const ls = opts.noStorage ? null : fakeStorage(opts.storage);
  if (ls) ctx.localStorage = ls;
  if (!opts.realRules) {
    const base = fixtureJSON('state-v1.json');
    SR.rules.state = { defaults: () => J(base), create: (o) => Object.assign(J(base), { seed: (o && o.seed) || base.seed }) };
  }
  if (opts.navigator) ctx.navigator = opts.navigator;
  SR.boot({ headless: true });
  return { ctx, SR, ls, state: () => SR.rules.state.create({ seed: 777 }) };
}
/** Every leaf path of a plain object ('money.cash', 'npc.kid.packs'); arrays are leaves. */
function leaves(o, pre, out) {
  out = out || [];
  Object.keys(o).forEach((k) => {
    const p = pre ? pre + '.' + k : k;
    if (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) leaves(o[k], p, out); else out.push(p);
  });
  return out;
}
const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);

// ------------------------------------------------------------------------------------------------
T.section('M1: the kernel files are load-time clean');
{
  const q = quietConsole();
  const res = L.load({ mode: 'rules', extra: CORE_M1, keepGoing: true, console: q.console });
  T.eq(res.errors.map((e) => e.file + ': ' + e.error.message), [], 'loop, stage, quality, input, scenes, save, settings, debug load in Node (no DOM at load time) and boot headless');
  const SR = res.SR;
  T.ok(['pause', 'resume', 'step'].every((f) => typeof SR.loop[f] === 'function') && 'time' in SR.loop && 'paused' in SR.loop && 'perf' in SR.loop && 'fpsCap' in SR.loop, 'SR.loop: pause, resume, step, time, paused, perf, fpsCap (CONTRACT §20)');
  T.ok(['toLogical', 'fullscreen', 'resize'].every((f) => typeof SR.stage[f] === 'function') &&
    ['k', 'uiK', 'dpr', 'scale', 'compact', 'portrait', 'world', 'fx', 'ctx', 'fxCtx'].every((k) => k in SR.stage), 'SR.stage: toLogical, fullscreen, resize and the read-only k, uiK, dpr, scale, compact, portrait, world, fx, ctx, fxCtx');
  T.ok(typeof SR.quality.set === 'function' && ['preset', 'auto', 'params'].every((k) => k in SR.quality), 'SR.quality: set, preset, auto, params');
  T.ok(['on', 'off', 'held', 'axis', 'bind', 'bindings', 'pushContext', 'popContext', 'inject', 'typing'].every((f) => typeof SR.input[f] === 'function') && 'last' in SR.input,
    'SR.input: on, off, held, axis, bind, bindings, pushContext, popContext, inject, typing, last (CONTRACT §12.2)');
  T.ok(['write', 'read', 'load', 'list', 'remove', 'exportCode', 'importCode', 'exportFile', 'importFile', 'profile', 'saveProfile'].every((f) => typeof SR.save[f] === 'function') &&
    SR.save.CURRENT === 1 && typeof SR.save.migrations === 'object', 'SR.save: CURRENT 1, migrations and every §16 function');
  T.ok(['get', 'set', 'all'].every((f) => typeof SR.settings[f] === 'function'), 'SR.settings: get, set, all');
  T.ok(['newGame', 'set', 'get', 'act', 'preview', 'enter', 'teleport', 'setTime', 'setDay', 'step', 'press', 'hold', 'mg', 'fast', 'perf', 'shot', 'ui', 'grid', 'time',
    'night', 'down', 'quality', 'projected', 'seed', 'feature', 'goto'].every((f) => typeof SR.debug[f] === 'function'), 'SR.debug has every function of ARCHITECTURE §20');
  T.ok(!!SR.reg.scene.artbible && SR.reg.scene.artbible.kind === 'base', 'the artbible scene is registered by js/core/debug.js (D25)');
  const shuffled = L.load({ mode: 'rules', extra: CORE_M1, shuffle: 99, keepGoing: true, console: q.console });
  T.eq(shuffled.errors.length, 0, 'and in a shuffled order');
}

// ------------------------------------------------------------------------------------------------
T.section('M1: SR.settings');
{
  const { SR, ls, ctx } = m1();
  const S = SR.settings;
  T.eq(S.all(), {
    game: { clock24: true, hints: true, alwaysAuto: false, confirmSpendOver: 1000, holdRepeat: true, rightClickBack: false, skateToggle: false, minimalHud: false, minimap: true },
    audio: { master: 0.8, music: 0.7, sfx: 0.8, ambience: 0.6, ui: 0.7, mono: false },
    display: { quality: 'auto', fpsCap: 60, fullscreen: false, screenShake: true, lean: false },
    access: { textScale: 1, highContrast: false, colorblind: 'none', reducedMotion: 'system', flashReduction: false, captions: false, assist: false, safeEdges: false, noGusts: false, typewriterCps: 60, haptics: true },
    controls: { keys: {}, pad: {}, contexts: {} },
  }, 'defaults are the ARCHITECTURE §16 schema');
  T.eq([S.get('game.clock24'), S.get('audio.music'), S.get('nope.key'), S.get('controls')], [true, 0.7, undefined, { keys: {}, pad: {}, contexts: {} }], 'get by dotted key (undefined when unknown)');
  const got = [];
  SR.events.on('settings:changed', (p) => got.push(p));
  T.eq(S.set('game.clock24', false), false, 'set returns the value');
  T.eq(got, [{ key: 'game.clock24', value: false }], 'set emits settings:changed { key, value }');
  S.set('game.clock24', false);
  T.eq(got.length, 1, 'setting the same value again emits nothing');
  T.eq(JSON.parse(ls.getItem('sr1.settings')).game.clock24, false, 'the change is saved to sr1.settings');
  T.throws(() => S.set('game.clock24', 'no'), /invalid value/, 'a wrong type throws');
  T.throws(() => S.set('display.quality', 'ultra'), /invalid value/, 'a value outside an enum throws');
  T.throws(() => S.set('audio.music', 1.5), /invalid value/, 'a volume outside 0..1 throws');
  T.throws(() => S.set('nope.key', 1), /unknown key/, 'an unknown key throws');
  T.throws(() => S.set('audio', {}), /group/, 'a group cannot be set at once');
  S.set('controls.keys', { interact: ['KeyF'] });
  S.set('controls.contexts.blackjack.hit', ['KeyG']);
  T.eq(S.get('controls'), { keys: { interact: ['KeyF'] }, pad: {}, contexts: { blackjack: { hit: ['KeyG'] } } }, 'controls take remap maps, also per context');
  T.throws(() => S.set('controls.keys', { interact: 'KeyF' }), /controls/, 'a controls map must hold arrays of codes');
  const x = S.all(); x.game.clock24 = 'mutated';
  T.eq(S.get('game.clock24'), false, 'all() returns a copy');
  S.set('access.textScale', 1.5);
  S.reset('access.textScale');
  T.eq(S.get('access.textScale'), 1, 'reset(key) restores the default');
  // A second context over the same storage reads what was saved.
  const again = m1({ storage: { map: ls.map } });
  T.eq([again.SR.settings.get('game.clock24'), again.SR.settings.get('controls.keys')], [false, { interact: ['KeyF'] }], 'settings persist (a reload reads sr1.settings)');
  S.reset();
  T.eq(S.all(), S.defaults(), 'reset() restores every default');
  T.eq(got[got.length - 1].key, '*', 'and emits settings:changed with key *');
  void ctx;
}
{
  const store = new Map([['sr1.settings', fixture('settings-v1.json')]]);
  const { SR } = m1({ storage: { map: store } });
  const all = SR.settings.all();
  T.eq([all.game.clock24, all.game.hints, all.game.alwaysAuto, all.audio.master, all.audio.music, all.display.quality, all.display.fpsCap, all.access.textScale, all.access.colorblind],
    [false, true, true, 0.5, 0.7, 'auto', 30, 1.25, 'deutan'], 'stored settings are sanitised: valid values kept, bad types and values back to defaults');
  T.ok(!('unknown' in all.game) && !('extra' in all), 'unknown keys are dropped');
  T.eq(all.controls, { keys: { interact: ['KeyF'] }, pad: {}, contexts: { blackjack: { hit: ['KeyG'] } } }, 'stored remaps are kept');
  const q = quietConsole();
  const broken = m1({ storage: { map: new Map([['sr1.settings', '{"game": {']]) }, console: q.console });
  T.eq(broken.SR.settings.all(), broken.SR.settings.defaults(), 'unreadable stored settings give the defaults');
  T.ok(q.log.warn.some((w) => /unreadable/.test(w)), 'with a warning (not an error)');
}

// ------------------------------------------------------------------------------------------------
T.section('M1: SR.save — write, read, load, the rules stream');
{
  const { SR, ls, state } = m1();
  const s = state();
  T.eq(SR.save.available, true, 'SR.save.available with a working localStorage');
  SR.save.load(s);
  T.ok(SR.state === s, 'load(state) makes a state the live game');
  const written = [];
  SR.events.on('save:written', (p) => written.push(p));
  ls.log.length = 0;
  const meta = SR.save.write('slot1');
  T.eq(ls.log, ['set sr1.tmp', 'set sr1.slot1', 'remove sr1.tmp'], 'write order: tmp, then the slot, then remove tmp');
  T.eq(ls.getItem('sr1.tmp'), null, 'no tmp is left behind');
  T.eq(written, [{ slot: 'slot1' }], 'save:written { slot }');
  const env = JSON.parse(ls.getItem('sr1.slot1'));
  T.eq([env.fmt, env.v, Object.keys(env).join()], ['sr-save', 1, 'fmt,v,meta,state'], 'the envelope { fmt: sr-save, v, meta, state }');
  T.ok(['name', 'day', 'length', 'difficulty', 'title', 'netWorth', 'savedAt', 'playSec', 'thumb'].every((k) => k in env.meta), 'meta has name, day, length, difficulty, title, netWorth, savedAt, playSec, thumb');
  T.eq([meta.name, meta.day, meta.length, meta.difficulty], [s.player.name, s.clock.day, s.mode.length, s.mode.difficulty], 'meta describes the run');
  T.eq(env.state.rng.rules, SR.rng.rules.state(), 'the live rules stream is recorded in state.rng.rules before writing');
  T.eq(J(SR.save.read('slot1')), J(s), 'read(slot) returns an equal state');
  T.eq(SR.save.write(2).slot, 'slot2', 'numeric slots 1-3 are slot1-slot3');
  T.throws(() => SR.save.write('slot9'), /unknown slot/, 'an unknown slot throws');
  T.eq(SR.save.list().map((x) => x.slot), ['slot1', 'slot2'], 'list() shows the saves that exist');
  SR.save.remove('slot2');
  T.eq(SR.save.list().map((x) => x.slot), ['slot1'], 'remove(slot)');

  // The rules stream round-trips through a save (BUILD_PLAN §3.1).
  for (let i = 0; i < 13; i++) SR.rng.rules.next();
  SR.save.write('slot3');
  const after = Array.from({ length: 20 }, () => SR.rng.rules.int(1, 1000000));
  for (let i = 0; i < 50; i++) SR.rng.rules.next();
  SR.save.load('slot3');
  T.eq(Array.from({ length: 20 }, () => SR.rng.rules.int(1, 1000000)), after, 'the rules stream continues exactly where the save left it');
  const w = SR.rng.create(1); w.seed(SR.util.hash(SR.state.seed, SR.state.clock.day));
  T.eq(SR.rng.world.state(), w.state(), 'loading reseeds the world stream with hash(seed, day)');
  const fresh = state();
  delete fresh.rng;
  SR.save.load(fresh);
  T.eq(SR.rng.rules.state(), SR.rng.create(fresh.seed).state(), 'a state without rng seeds the rules stream from state.seed');

  SR.save.write('suspend');
  T.ok(!!SR.save.load('suspend') && ls.getItem('sr1.suspend') === null, 'loading the suspend slot deletes it');
  T.eq(SR.save.load('slot2'), null, 'loading an empty slot returns null');
  const bad = state(); bad.money.cash = -1;
  T.throws(() => SR.save.load(bad), /broken values/, 'load(state) refuses broken values');
  SR.save.write('slot1');
  const good = ls.getItem('sr1.slot1');
  const cash = SR.state.money.cash;
  SR.state.money.cash = NaN;                       // a rules bug; JSON would store it as null
  let wcode = '';
  try { SR.save.write('slot1'); } catch (e) { wcode = e.code; }
  SR.state.money.cash = cash;
  T.eq([wcode, ls.getItem('sr1.slot1') === good, ls.getItem('sr1.tmp')], ['invalid', true, null], 'write refuses a state the read would quarantine (code invalid); the slot keeps its previous save');
  T.eq(ls.getItem('srpg.save'), null, 'Classic mode\'s srpg.save is never touched');
  T.ok(Array.from(ls.map.keys()).every((k) => k.indexOf('sr1.') === 0), 'every key is under sr1.');
}
{
  const { SR } = m1();
  T.throws(() => SR.save.write('slot1'), /no game/, 'write without a game throws (code nogame)');
  const s = SR.rules.state.create({ seed: 5 });
  s.mode.difficulty = 'hardcore';
  SR.save.load(s);
  let code = '';
  try { SR.save.write('slot1'); } catch (e) { code = e.code; }
  T.eq(code, 'hardcore', 'Hardcore has no manual saves (write to a slot throws code hardcore)');
  T.eq(SR.save.write('ironman').slot, 'ironman', 'Hardcore writes the ironman slot');
  SR.state.mode.inProgress = false;
  SR.state.pending = { resolve: 'bar.fight:resolve', worst: { outcome: 'lose' } };
  const pm = SR.save.write('ironman');
  T.eq([pm.inProgress, SR.state.mode.inProgress], [true, true], 'an ironman write with pending (the minigame frame\'s) is marked in progress (a mid-day state)');
  // The ironman rule is data: B-16 `saves: 'ironman'` in tuning.difficulty, not the id 'hardcore'.
  SR.state.pending = null;
  const row = SR.tuning.difficulty.relaxed;
  const was = row.saves;
  row.saves = 'ironman';
  SR.state.mode.difficulty = 'relaxed';
  code = '';
  try { SR.save.write('slot1'); } catch (e) { code = e.code; }
  row.saves = was;
  T.eq(code, 'hardcore', 'a difficulty whose tuning row says saves: ironman keeps the single ironman slot');
  SR.state.mode.difficulty = 'standard';
  T.eq(SR.save.write('slot1').slot, 'slot1', 'Standard (saves: slots) writes manual slots');
}
{
  const { SR, ls } = m1({ storage: { quota: 3000 } });
  const s = SR.rules.state.create({ seed: 9 });
  SR.save.load(s);
  ls.map.set('sr1.slot1', 'the previous save');
  let e = null;
  try { SR.save.write('slot1'); } catch (x) { e = x; }
  T.eq(e && e.code, 'quota', 'a full storage makes write throw an Error with code quota');
  T.eq([ls.getItem('sr1.slot1'), ls.getItem('sr1.tmp')], ['the previous save', null], 'the slot keeps its previous save and tmp is removed');
}
{
  const { SR } = m1({ noStorage: true });
  T.eq(SR.save.available, false, 'without localStorage saves fall back to memory (available: false)');
  SR.save.load(SR.rules.state.create({ seed: 3 }));
  SR.save.write('slot1');
  T.eq(SR.save.read('slot1').seed, SR.state.seed, 'and still write and read');
}

// ------------------------------------------------------------------------------------------------
T.section('M1: SR.save — migrations, deep-fill, quarantine');
{
  const { SR, ls } = m1();
  const defaults = SR.rules.state.defaults();
  const raw = fixture('save-v1-missing.json');
  const src = JSON.parse(raw).state;
  const missing = leaves(defaults).filter((p) => get(src, p) === undefined);
  T.ok(missing.length >= 10, 'the v1 fixture misses fields (' + missing.length + ')');
  ls.setItem('sr1.slot1', raw);
  const s = SR.save.read('slot1');
  T.eq(leaves(defaults).filter((p) => get(s, p) === undefined), [], 'read deep-fills every missing field from SR.rules.state.defaults()');
  T.eq(missing.filter((p) => JSON.stringify(get(s, p)) !== JSON.stringify(get(defaults, p))), [], 'with the default values');
  T.eq([s.player.name, s.money.cash, s.clock.day, s.stats.str, s.legacyNote], ['Rikki', 340, 12, 18, 'kept'], 'existing values and unknown fields are kept');

  ls.setItem('sr1.slot2', raw);
  const trail = [];
  SR.save.CURRENT = 3;
  SR.save.migrations[2] = (st) => { trail.push('2:v' + st.v); st.trail = ['2']; };
  SR.save.migrations[3] = (st) => { trail.push('3:v' + st.v); st.trail.push('3'); return st; };
  const m = SR.save.read('slot2');
  T.eq(trail, ['2:v1', '3:v2'], 'a synthetic migration chain runs in order, v2 then v3');
  T.eq([m.v, m.trail], [3, ['2', '3']], 'the state ends at CURRENT with every step applied');
  ls.setItem('sr1.slot2', raw);
  delete SR.save.migrations[3];
  T.eq(SR.save.read('slot2'), null, 'a missing migration fails the read');
  T.eq(SR.save.lastError.reason, 'migration', 'lastError.reason migration');
  SR.save.CURRENT = 1;
  delete SR.save.migrations[2];

  const broken = [];
  SR.events.on('save:broken', (p) => broken.push(p));
  const corrupt = fixture('save-corrupt.txt');
  ls.setItem('sr1.slot3', corrupt);
  T.eq(SR.save.read('slot3'), null, 'a corrupt save reads as null');
  const key = SR.save.lastError.key;
  T.ok(/^sr1\.broken\.\d+/.test(key) && ls.getItem(key) === corrupt, 'it is quarantined: the raw string is copied to sr1.broken.<timestamp>');
  T.eq(ls.getItem('sr1.slot3'), null, 'and the slot is removed');
  T.eq([SR.save.lastError.reason, broken.length, broken[0] && broken[0].key], ['corrupt', 1, key], 'save:broken { slot, reason, key } for the UI');
  ls.setItem('sr1.auto', fixture('save-v1-invalid.json'));
  T.eq([SR.save.read('auto'), SR.save.lastError.reason], [null, 'invalid'], 'broken values (negative cash, clock past 24:00, HP null) are quarantined too');
  T.ok(SR.save.validate(JSON.parse(fixture('save-v1-invalid.json')).state).length >= 3, 'validate lists each problem');
  ls.setItem('sr1.slot1', fixture('save-v9-newer.json'));
  const nBroken = ls.map.size;
  T.eq([SR.save.read('slot1'), SR.save.lastError.reason], [null, 'newer'], 'a save from a newer version is refused');
  T.ok(ls.getItem('sr1.slot1') !== null && ls.map.size === nBroken, 'and kept as it is (not quarantined)');
  ls.setItem('sr1.slot2', '{"fmt":"something-else","state":{}}');
  T.eq(SR.save.list().filter((x) => x.slot === 'slot2').map((x) => [x.broken, x.meta]), [[true, null]], 'list() flags a save it cannot read (without quarantining it)');
  T.eq([SR.save.read('slot2'), SR.save.lastError.reason], [null, 'format'], 'a foreign JSON file is refused as format');
}
{
  // A full storage cannot take the quarantine copy: the unreadable slot must stay (it is the only copy).
  const q = quietConsole();
  const { SR, ls } = m1({ console: q.console });
  const set = ls.setItem;
  ls.setItem = function (k, v) { if (k.indexOf('sr1.broken.') === 0) { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; } return set.call(this, k, v); };
  const corrupt = fixture('save-corrupt.txt');
  ls.map.set('sr1.slot1', corrupt);
  T.eq(SR.save.read('slot1'), null, 'a corrupt save still reads as null when the quarantine copy fails');
  T.eq([ls.getItem('sr1.slot1'), SR.save.lastError.reason, SR.save.lastError.key], [corrupt, 'corrupt', null], 'but the slot is kept (never deleted without its copy) and lastError.key is null');
  T.ok(Array.from(ls.map.keys()).every((k) => k.indexOf('sr1.broken.') !== 0) && q.log.warn.some((w) => /quarantine/.test(w)), 'no half-written broken key; a warning (not an error) says why');
}

// ------------------------------------------------------------------------------------------------
T.section('M1: SR.save — retention (ARCHITECTURE §15)');
{
  const { SR, ls, state } = m1();
  const s = state();
  // 1,000 messages: every 10th unread, the others read; a third of the read ones archived.
  s.msgs = Array.from({ length: 1000 }, (_, i) => ({ id: 'm' + i, from: 'x', key: 'vm.x', vars: {}, day: 1 + (i >> 3), read: i % 10 !== 0, archived: i % 3 === 0 && i % 10 !== 0 }));
  SR.save.load(s);
  SR.save.write('slot1');
  const kept = JSON.parse(ls.getItem('sr1.slot1')).state.msgs;
  T.eq(kept.length, 150, 'a 1,000-message state is pruned to 150');
  T.eq(kept.filter((m) => !m.read).length, 100, 'every unread message is kept');
  const readKept = kept.filter((m) => m.read).map((m) => m.id);
  const archivedNewest = s.msgs.filter((m) => m.read && m.archived).slice(-50).map((m) => m.id);
  T.eq(readKept, archivedNewest, 'read non-archived messages go first; the 50 read ones kept are the newest archived');
  const r = { msgs: [] };
  for (let i = 0; i < 150; i++) r.msgs.push({ id: 'a' + i, read: true, archived: i < 5 });
  r.msgs.push({ id: 'new', read: false, archived: false });
  SR.save.retain(r);
  T.ok(r.msgs.length === 150 && r.msgs[0].id === 'a0' && !r.msgs.some((m) => m.id === 'a5'), 'the oldest read non-archived message goes first');
  const r2 = { msgs: Array.from({ length: 150 }, (_, i) => ({ id: 'r' + i, read: true, archived: true })).concat([{ id: 'n', read: false }]) };
  SR.save.retain(r2);
  T.ok(r2.msgs.length === 150 && r2.msgs[0].id === 'r1', 'then the oldest read archived one');
  const u = { msgs: Array.from({ length: 151 }, (_, i) => ({ id: 'u' + i, read: false, archived: false })) };
  SR.save.retain(u);
  T.ok(u.msgs.length === 150 && u.msgs[0].id === 'u1', 'a 151st unread message drops the oldest unread one');
  const h = { history: { nw: Array.from({ length: 200 }, (_, i) => ({ day: i + 1, v: i })), str: [1, 2, 3], int: Array.from({ length: 200 }, (_, i) => [i + 1, i]) },
    log: { today: Array.from({ length: 25 }, (_, i) => ({ kind: 'k', weight: i })), yesterday: [], older: [1] },
    money: { rateHist: Array.from({ length: 40 }, (_, i) => i) }, stocks: { MCS: { hist: Array.from({ length: 45 }, (_, i) => i) } } };
  SR.save.retain(h);
  const days = h.history.nw.map((p) => p.day);
  T.ok(days.slice(0, 120).join() === Array.from({ length: 120 }, (_, i) => i + 1).join() && days.slice(120).join() === '127,134,141,148,155,162,169,176,183,190,197',
    'history: one point per morning to day 120, then every 7th morning');
  T.eq([h.history.int.length, h.history.str], [131, [1, 2, 3]], '[day, value] points thin the same way; untagged points are left alone');
  T.eq([h.log.today.length, h.log.today[0].weight, 'older' in h.log], [20, 5, false], 'the log keeps two days of 20 entries');
  T.eq([h.money.rateHist.length, h.money.rateHist[0], h.stocks.MCS.hist.length, h.stocks.MCS.hist[0]], [30, 10, 30, 15], 'rateHist and stock histories keep 30 points');
}

// ------------------------------------------------------------------------------------------------
T.section('M1: SR.save — the export code, recovery, profile');
{
  const { SR, ls, state } = m1();
  const s = state();
  s.player.name = 'Zoë ✂ Stick';
  SR.save.load(s);
  const code = SR.save.exportCode();
  T.ok(/^PSKY1:[A-Za-z0-9+/]+=*:[0-9a-f]{8}$/.test(code), 'the code is PSKY1: + base64 + : + 8 lowercase hex digits');
  const body = code.slice(6, code.lastIndexOf(':'));
  T.eq(code.slice(code.lastIndexOf(':') + 1), SR.util.pad((SR.util.crc32(body) >>> 0).toString(16), 8), 'the checksum is the CRC-32 of the base64 part (D23)');
  T.eq(J(SR.save.importCode(code)), J(SR.state), 'the export code round-trips (unicode names too)');
  T.eq(J(SR.save.importCode(' \n' + code.slice(0, 40) + '\n' + code.slice(40) + ' ')), J(SR.state), 'whitespace and line breaks in a pasted code are ignored');
  const flip = (c, i) => c.slice(0, i) + (c[i] === 'A' ? 'B' : 'A') + c.slice(i + 1);
  let reason = '';
  try { SR.save.importCode(flip(code, 30)); } catch (e) { reason = e.reason; }
  T.eq(reason, 'checksum', 'a damaged code fails its checksum');
  try { SR.save.importCode('PSKY2:' + code.slice(6)); } catch (e) { reason = e.reason; }
  T.eq(reason, 'code', 'a wrong prefix is refused');
  const golden = fixture('export-v1.txt').trim();
  const env = JSON.parse(fixture('save-v1-missing.json'));
  const g = SR.save.importCode(golden);
  T.eq([g.player.name, g.money.cash, g.legacyNote, g.v], ['Rikki ✂ Ünïcode', 340, 'kept', 1], 'the golden code (made by Node\'s own base64 and zlib.crc32) decodes');
  env.meta.name = env.state.player.name = 'Rikki ✂ Ünïcode';
  T.eq(golden, 'PSKY1:' + Buffer.from(JSON.stringify(env), 'utf8').toString('base64') + ':' + golden.slice(-8), 'and the format matches an independent encoder byte for byte');
  SR.save.write('slot1');
  T.eq(J(SR.save.importCode(SR.save.exportCode('slot1'))), J(SR.save.read('slot1')), 'exportCode(slot) encodes a stored save');

  // An interrupted write: tmp holds a newer save of slot1 than slot1 itself.
  const older = JSON.parse(ls.getItem('sr1.slot1'));
  const newer = JSON.parse(JSON.stringify(older));
  newer.meta.savedAt = older.meta.savedAt + 1000; newer.state.money.cash = 777;
  ls.map.set('sr1.tmp', JSON.stringify(newer));
  T.eq(SR.save.recover(), 'slot1', 'recover() finishes a write interrupted before the slot was written');
  T.eq([SR.save.read('slot1').money.cash, ls.getItem('sr1.tmp')], [777, null], 'the slot holds the newer save and tmp is gone');
  const stale = JSON.parse(ls.getItem('sr1.slot1')); stale.meta.savedAt -= 5000; stale.state.money.cash = 1;
  ls.map.set('sr1.tmp', JSON.stringify(stale));
  T.eq([SR.save.recover(), SR.save.read('slot1').money.cash, ls.getItem('sr1.tmp')], [null, 777, null], 'a stale tmp is dropped');

  T.eq(SR.save.profile(), { v: 1, achievements: {}, hallOfFame: {}, badges: {}, hintsSeen: {}, totals: {} }, 'profile() defaults');
  const p = SR.save.profile(); p.badges.oldSchool = true;
  SR.save.saveProfile(p);
  T.eq([SR.save.profile().badges.oldSchool, JSON.parse(ls.getItem('sr1.profile')).badges.oldSchool], [true, true], 'saveProfile persists sr1.profile');
}

// ------------------------------------------------------------------------------------------------
T.section('M1: SR.quality');
{
  const { SR } = m1();
  const Q = SR.quality;
  const got = [];
  SR.events.on('quality:changed', (p) => got.push(p));
  T.eq(Q.presets(), {
    high: { maxDpr: 2, renderScale: 1, shadowHours: 1, particles: 1, crowd: 1, rain: 300, lean: true },
    medium: { maxDpr: 1.5, renderScale: 1, shadowHours: 2, particles: 0.7, crowd: 1, rain: 200, lean: false },
    low: { maxDpr: 1, renderScale: 0.75, shadowHours: 0, particles: 0.4, crowd: 0.5, rain: 90, lean: false },
  }, 'the preset table of ARCHITECTURE §2');
  T.eq([Q.preset, Q.auto], ['high', true], 'Auto starting at High by default');
  T.eq(Q.set('low'), 'low', 'set(low)');
  T.eq([Q.preset, Q.auto, Q.params.renderScale, Q.params.crowd], ['low', false, 0.75, 0.5], 'a fixed preset turns Auto off; params follow the table');
  T.eq(got, [{ preset: 'low', auto: false }], 'quality:changed { preset, auto }');
  const p1 = Q.params;
  T.ok(p1 === Q.params && Object.isFrozen(p1), 'params is one frozen object per preset (read every frame without allocating)');
  Q.set('medium');
  T.ok(Q.params !== p1 && Q.params.maxDpr === 1.5 && p1.maxDpr === 1, 'and a new one after a change');
  Q.set('low');
  got.length = 1;
  T.throws(() => Q.set('ultra'), /unknown preset/, 'an unknown preset throws');
  T.eq(Q.sample(40, 0), null, 'a fixed preset ignores work-time samples');
  Q.set('high');
  Q.set('auto');
  // Auto: 60 samples a second of 16 ms work time.
  let t = 1e6, changes = [];
  const feed = (ms, seconds) => { for (let i = 0; i < seconds * 60; i++) { t += 1000 / 60; const r = Q.sample(ms, t); if (r) changes.push([Math.round((t - 1e6) / 1000), r]); } };
  feed(16, 30);
  T.eq(changes.map((c) => c[1]), ['medium', 'low'], 'Auto steps down when the 90th percentile of work time exceeds 12 ms');
  T.ok(changes[0][0] >= 4 && changes[0][0] <= 6 && changes[1][0] - changes[0][0] >= 20, 'after a full 5 s window, then at most one change per 20 s', changes);
  changes = [];
  feed(3, 19);
  T.eq(changes, [], 'fast frames do not step up before 20 s');
  feed(3, 40);
  T.eq(changes.map((c) => c[1]), ['medium', 'high'], 'staying under 7 ms for 20 s steps up, one preset per 20 s');
  changes = [];
  feed(9, 60);
  T.eq(changes, [], 'between 7 and 12 ms nothing changes');
  T.eq(Q.auto, true, 'Auto stays on while it changes presets');
}

// ------------------------------------------------------------------------------------------------
T.section('M1: SR.loop.step (headless)');
{
  const { SR } = m1();
  const seen = { update: 0, render: 0, dts: new Set() };
  SR.scenes.register('test.counter', { kind: 'base', update(dt) { seen.update++; seen.dts.add(dt); }, render() { seen.render++; } });
  SR.scenes.go('test.counter');
  T.eq(SR.loop.step(7), 7, 'step(7) returns 7');
  T.eq([seen.update, seen.render, Array.from(seen.dts)], [7, 1, [1 / 60]], 'step(n) runs exactly n fixed updates of 1/60 s, then one render');
  T.ok(Math.abs(SR.loop.time - 7 / 60) < 1e-12 && SR.loop.steps === 7, 'SR.loop.time advances by n × STEP');
  SR.loop.step();
  T.eq([seen.update, seen.render], [8, 2], 'step() is one step');
  SR.loop.pause();
  T.eq(SR.loop.paused, true, 'pause()');
  SR.loop.step(2);
  T.eq(seen.update, 10, 'step works while paused (tests)');
  SR.loop.resume();
  T.eq(SR.loop.paused, false, 'resume()');
  const p = SR.loop.perf;
  T.ok(p.update && typeof p.update.p50 === 'number' && typeof p.update.p95 === 'number' && typeof p.render.p95 === 'number' && typeof p.fps === 'number' && typeof p.draws === 'number' && p.frames === 3,
    'perf = { update: {p50, p95}, render: {p50, p95}, fps, draws } over the frames so far');
  T.eq(p.fps, 0, 'step(n) samples work time but never fps (only animation frames measure fps)');
  T.throws(() => { SR.loop.fpsCap = 45; }, /60 or 30/, 'fpsCap is 60 or 30');
}

// ------------------------------------------------------------------------------------------------
T.section('M1: SR.input (headless: bindings, contexts, inject, remap, the gamepad poll)');
{
  const pads = [null];
  const { SR } = m1({ navigator: { getGamepads: () => pads } });
  const I = SR.input;
  const want = {
    up: ['ArrowUp', 'KeyW', 'Pad12'], down: ['ArrowDown', 'KeyS', 'Pad13'], left: ['ArrowLeft', 'KeyA', 'Pad14'], right: ['ArrowRight', 'KeyD', 'Pad15'],
    interact: ['KeyE', 'Enter', 'NumpadEnter', 'Space', 'Pad0'], confirm: ['Enter', 'NumpadEnter', 'Space', 'KeyE', 'Pad0'], back: ['Escape', 'Backspace', 'Pad1'],
    skate: ['ShiftLeft', 'ShiftRight', 'Pad7'], car: ['KeyC', 'Pad3'], pocket: ['Tab', 'Pad8'], map: ['KeyM'], bag: ['KeyI'], journal: ['KeyJ'], minimap: ['KeyN'],
    pause: ['Escape', 'Pad9'], tabPrev: ['Pad4'], tabNext: ['Pad5'], repeat: ['KeyR'], zoomIn: ['Equal', 'NumpadAdd', 'WheelUp'], zoomOut: ['Minus', 'NumpadSubtract', 'WheelDown'],
    zoomCycle: ['Pad10'], minimalHud: ['KeyH'], row1: ['Digit1', 'Numpad1'], row9: ['Digit9', 'Numpad9'],
  };
  T.eq(Object.keys(want).filter((a) => JSON.stringify(I.bindings(a)) !== JSON.stringify(want[a])), [], 'default bindings are CONTRACT §12.1');
  T.eq([I.bindings('tabNext', 'tabs'), I.bindings('hit', 'blackjack'), I.bindings('serve', 'orderup')], [['KeyE'], ['KeyH', 'Pad0'], ['Enter']], 'the named contexts of CONTRACT §12.3');
  const log = [];
  I.on('*', (ev) => log.push(ev.action + (ev.down ? '+' : '-') + (ev.repeat ? 'r' : '') + (ev.context ? '@' + ev.context : '')));
  const scene = [];
  SR.scenes.register('test.input', { kind: 'base', onAction(a, ev) { scene.push(a + ':' + ev.down); } });
  SR.scenes.go('test.input');
  I.inject('interact', true);
  T.eq([I.held('interact'), log.splice(0), scene.splice(0)], [true, ['interact+'], ['interact:true']], 'inject(down) holds the action, tells listeners and the top scene');
  I.inject('interact', false);
  T.eq([I.held('interact'), log.splice(0), scene.splice(0)], [false, ['interact-'], []], 'inject(up) releases it; releases never reach onAction');
  I.inject('up', true); I.inject('right', true);
  const a = I.axis('move');
  T.ok(Math.abs(a.x - Math.SQRT1_2) < 1e-9 && Math.abs(a.y + Math.SQRT1_2) < 1e-9, 'axis(move) composes the directions, length ≤ 1', a);
  I.inject('up', false); I.inject('right', false);
  T.eq(I.axis('move'), { x: 0, y: 0 }, 'and returns to 0');
  log.length = 0;

  // The gamepad (polled by the loop every step).
  const btn = (on) => ({ pressed: on, value: on ? 1 : 0 });
  const padOf = (pressed, axes) => ({ id: 'test pad', connected: true, mapping: 'standard', axes: axes || [0, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, i) => btn(pressed.indexOf(i) >= 0)) });
  pads[0] = padOf([0]);
  SR.loop.step(1);
  T.eq([log.splice(0).sort(), SR.input.last], [['confirm+', 'interact+'], 'pad'], 'pad A (Pad0) presses interact and confirm, and input.last becomes pad');
  pads[0] = padOf([]);
  SR.loop.step(1);
  T.eq(log.splice(0).sort(), ['confirm-', 'interact-'], 'releasing A releases both');
  pads[0] = padOf([], [0.6, 0, 0, 0]);
  SR.loop.step(1);
  const pa = I.axis('move');
  T.ok(Math.abs(pa.x - 0.5) < 1e-9 && pa.y === 0, 'the left stick drives axis(move), rescaled after the 0.2 dead zone (0.6 → 0.5)', pa);
  T.eq(log.splice(0), ['right+'], 'past 0.5 the stick presses the digital direction');
  pads[0] = padOf([], [0.1, 0.05, 0, 0]);
  SR.loop.step(1);
  T.eq([I.axis('move'), log.splice(0)], [{ x: 0, y: 0 }, ['right-']], 'inside the dead zone the stick reads 0 and releases the direction');
  pads[0] = padOf([13]);
  SR.loop.step(24);
  T.eq(log.splice(0), ['down+'], 'a held D-pad direction does not repeat before 0.4 s');
  SR.loop.step(12);
  T.eq(log.splice(0), ['down+r', 'down+r'], 'then repeats every 0.1 s (menus)');
  pads[0] = padOf([]);
  SR.loop.step(1);
  log.length = 0;

  // Contexts: blackjack shadows H / S / D.
  const pop = I.pushContext('blackjack');
  T.eq(I.contexts(), ['blackjack'], 'pushContext(name) with the named default map');
  pads[0] = padOf([0]); SR.loop.step(1);
  T.eq(log.splice(0), ['hit+@blackjack'], 'inside the context, Pad0 fires only hit (interact and confirm are shadowed)');
  pop();
  T.eq([log.splice(0), I.held('hit'), I.contexts()], [['hit-@blackjack'], false, []], 'popping releases what the context pressed');
  SR.loop.step(3);
  T.eq(log.splice(0), [], 'a button held across the pop stays inert (no global press on the next polls)');
  pads[0] = padOf([]); SR.loop.step(1);
  pads[0] = padOf([0]); SR.loop.step(1);
  T.eq(log.splice(0).sort(), ['confirm+', 'interact+'], 'pressed again after the pop, it is interact and confirm');
  pads[0] = padOf([]); SR.loop.step(1); log.length = 0;
  I.pushContext('tabs'); I.pushContext('fight');
  T.ok(I.popContext('tabs') && JSON.stringify(I.contexts()) === '["fight"]', 'popContext(name) removes the most recent context of that name');
  I.popContext('fight');
  T.throws(() => I.pushContext('bad', { a: 'KeyA' }), /map must be/, 'a context map must be { action: [bindings] }');

  // Remap.
  I.bind('interact', ['KeyF', 'Pad2']);
  T.eq([I.bindings('interact'), SR.settings.get('controls.keys.interact'), SR.settings.get('controls.pad.interact')], [['KeyF', 'Pad2'], ['KeyF'], ['Pad2']], 'bind() replaces the bindings and saves keys and pad in settings.controls');
  pads[0] = padOf([2]); SR.loop.step(1);
  T.eq(log.splice(0), ['interact+'], 'the remapped pad button fires the action');
  pads[0] = padOf([]); SR.loop.step(1); log.length = 0;
  I.bind('interact', null);
  T.eq(I.bindings('interact'), want.interact, 'bind(action, null) restores the default');
  I.bind('hit', ['KeyG'], 'blackjack');
  T.eq([I.bindings('hit', 'blackjack'), I.bindings('stand', 'blackjack')], [['KeyG'], ['KeyS', 'Pad1']], 'bind(action, list, context) remaps inside one context only');
  T.throws(() => I.bind('interact', ['not a code']), /codes/, 'bind validates the codes');
  T.throws(() => I.bind('nope', ['KeyF']), /unknown action/, 'and the global action name');
  SR.settings.set('game.rightClickBack', true);
  T.ok(I.bindings('back').indexOf('Mouse2') >= 0, 'rightClickBack adds Mouse2 to back');
  SR.settings.set('game.skateToggle', true);
  I.inject('skate', true); I.inject('skate', false);
  T.eq(I.held('skate'), true, 'with skateToggle a press latches skate');
  I.inject('skate', true); I.inject('skate', false);
  T.eq(I.held('skate'), false, 'and the next press unlatches it');
  SR.settings.set('game.skateToggle', false);
  T.eq(I.typing(), false, 'typing() is false without a document');

  // A pad that vanishes from getGamepads() without a disconnect event still releases what it held.
  log.length = 0;
  pads[0] = padOf([1], [0.9, 0, 0, 0]);
  SR.loop.step(1);
  T.eq(log.splice(0).sort(), ['back+', 'right+'], 'pad B and the stick past 0.5 press back and right');
  pads[0] = null;
  SR.loop.step(1);
  T.eq([log.splice(0).sort(), I.held('back'), I.held('right'), I.axis('move')], [['back-', 'right-'], false, false, { x: 0, y: 0 }], 'when the pad vanishes, its button, direction and axis are released');
  SR.loop.step(5);
  T.eq(log.splice(0), [], 'and with no pad the poll does nothing');

  // Engine contexts: a context named after an engine defaults to the engine's `keys` (CONTRACT §12.3).
  SR.minigame.register('test.darts', { keys: { throw: ['Space'], aimUp: ['ArrowUp'] }, create() { return {}; } });
  T.eq(I.bindings('throw', 'test.darts'), ['Space'], 'bindings(action, engineId) reads the engine\'s keys before the frame pushes them');
  const popDarts = I.pushContext('test.darts');
  I.inject('throw', true); I.inject('throw', false);
  T.eq(log.splice(0), ['throw+@test.darts', 'throw-@test.darts'], 'pushContext(engineId) with no map pushes the engine\'s keys');
  popDarts();
}

// ------------------------------------------------------------------------------------------------
T.section('M1: SR.debug.night finishes the night like the report scene (real rules)');
{
  const probe = L.load({ mode: 'rules', keepGoing: true });
  const real = probe.SR.rules.night && typeof probe.SR.rules.night.run === 'function' && probe.SR.rules.state && typeof probe.SR.rules.state.create === 'function';
  if (!real) {
    T.ok(true, 'skipped: SR.rules.night / SR.rules.state are still stubs');
  } else {
    const { SR } = m1({ realRules: true });
    const s = SR.debug.newGame({ seed: 31337 });
    T.eq([s.seed, s.clock.day, SR.state === s], [31337, 1, true], 'newGame(opts) makes a real new game live');
    const started = [], nights = [];
    SR.events.on('day:started', (p) => started.push([p.day, !!p.report]));
    SR.events.on('night', (p) => nights.push(p.day));
    const rep = SR.debug.night('sleep');
    T.eq([rep.day, SR.state.clock.day, nights, started], [2, 2, [2], [[2, true]]], 'night(sleep) runs the night, re-emits its events, then day:started { day, report }');
    const w = SR.rng.create(1); w.seed(SR.util.hash(31337, 2));
    T.eq(SR.rng.world.state(), w.state(), 'so the world stream follows the new day (hash(seed, day))');
  }
}

// ------------------------------------------------------------------------------------------------
T.section('M1: SR.save with the real rules (when W1-R has landed)');
{
  const probe = L.load({ mode: 'rules', keepGoing: true });
  const real = probe.SR.rules.state && typeof probe.SR.rules.state.create === 'function' && typeof probe.SR.rules.state.defaults === 'function';
  if (!real) {
    T.ok(true, 'skipped: SR.rules.state is still a stub');
  } else {
    const { SR, ls } = m1({ realRules: true });
    const s = SR.rules.state.create({ seed: 4242, name: 'Real' });
    SR.save.load(s);
    T.eq(SR.save.validate(s), [], 'a new real state validates');
    SR.save.write('slot1');
    T.eq(J(SR.save.read('slot1')), J(SR.state), 'a real state round-trips through a slot');
    T.eq(J(SR.save.importCode(SR.save.exportCode())), J(SR.state), 'and through an export code');
    T.eq(leaves(SR.rules.state.defaults()).filter((p) => get(SR.save.read('slot1'), p) === undefined), [], 'no field of defaults() is missing after a read');

    // ARCHITECTURE §15: retention keeps a 1,000-day Unlimited run under the 60 KB budget. The balance
    // sim (W1-Q) will play one; until then a synthetic worst case on the real schema: every history
    // series 1,000 mornings long, 1,000 messages, 1,000-point rate and stock histories, 50 log lines a day.
    const r = SR.rng.create(99);
    const big = SR.rules.state.create({ seed: 99, length: 0 });
    big.clock.day = 1000;
    Object.keys(big.history).forEach((k) => { big.history[k] = Array.from({ length: 1000 }, (_, i) => [i + 1, r.int(0, 9999999)]); });
    big.msgs = Array.from({ length: 1000 }, (_, i) => ({ id: i + 1, from: 'penny', key: 'vm.penny.loan1', vars: { days: 3, n: 1200, money: '$1,200' }, day: 1 + (i >> 1), read: i % 3 !== 0, archived: i % 5 === 0 }));
    Object.keys(big.stocks).forEach((t) => { big.stocks[t].hist = Array.from({ length: 1000 }, () => r.float(1, 500)); });
    big.money.rateHist = Array.from({ length: 1000 }, () => r.float(0.25, 3.5));
    big.log.today = Array.from({ length: 50 }, (_, i) => ({ kind: 'fall', weight: 10, vars: { n: i } }));
    big.log.yesterday = big.log.today.slice();
    SR.save.load(big);
    SR.save.write('slot2');
    const raw = ls.getItem('sr1.slot2');
    const kept = JSON.parse(raw).state;
    T.ok(raw.length <= 60 * 1024, 'a 1,000-day Unlimited save is within 60 KB after retention (' + (raw.length / 1024).toFixed(1) + ' KB)');
    T.eq([kept.msgs.length, kept.history.nw.length, kept.log.today.length, kept.money.rateHist.length, kept.stocks[Object.keys(kept.stocks)[0]].hist.length],
      [150, 120 + Math.floor((1000 - 120) / 7), SR.tuning.news.logMax, 30, SR.tuning.stocks.history], 'messages 150, history daily to 120 then weekly, the log at tuning.news.logMax, rate and stock histories at 30');
  }
}

T.done();
