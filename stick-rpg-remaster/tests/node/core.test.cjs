// tests/node/core.test.cjs — owner: W1-K (lead). The kernel's Node tests (BUILD_PLAN §3.1).
// M0 part: the loader (modes rules and all, the DOM and Math.random guards, shuffled order), the
// registries and boot, SR.events, SR.rng (sfc32, determinism per seed, the three streams), SR.text
// and SR.util. M1 adds the rules stream round trip through a save, migrations, deep-fill of a v1
// fixture, quarantine, retention and the export code.
//   node tests/node/core.test.cjs
'use strict';
const L = require('./load.cjs');

const T = L.suite('core (M0)');

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

T.done();
