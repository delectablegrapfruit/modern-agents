// The core's tests, in Node (22 or later): node web/test/core.test.mjs [path/to/ronin.wasm]
// Loads the WebAssembly build through core.js (its own WASI shim, as in the browser), plays stages with the
// autopilot, cuts by hand, saves and loads, walks the menus, and fetches every frame of every figure, timing it.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
import { loadCore, decodeSketch } from '../core.js';

const here = dirname(fileURLToPath(import.meta.url));
const wasmPath = process.argv[2] || join(here, '..', 'dist', 'ronin.wasm');

let failures = 0;
const results = [];
async function test(name, body) {
  const t0 = performance.now();
  try {
    await body();
    results.push(`ok    ${name} (${(performance.now() - t0).toFixed(0)} ms)`);
  } catch (e) {
    failures++;
    results.push(`FAIL  ${name}\n      ${e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n      ') : e}`);
  }
  console.log(results[results.length - 1]);
}

function time(fn, runs) {
  const t0 = performance.now();
  for (let i = 0; i < runs; i++) fn();
  return (performance.now() - t0) / runs;
}

const EVENT_TYPES = new Set([
  'arrived', 'warlord', 'cut', 'whiff', 'deflected', 'loosed', 'pierced', 'raised', 'wounded', 'leapt', 'landed',
  'bloodlust', 'milestone', 'flung', 'healed', 'shattered', 'fled', 'shard', 'mended', 'scattered', 'guarded',
  'parried', 'summoned', 'turned', 'ended', 'promotion',
]);

const t0 = performance.now();
const bytes = readFileSync(wasmPath);
const core = await loadCore(bytes);
console.log(`loaded ${wasmPath} (${(bytes.length / 1048576).toFixed(2)} MB) in ${(performance.now() - t0).toFixed(0)} ms`);

/** Plays the fight on with the autopilot until it ends: every event, and the seconds it took. */
function playOut(maxSeconds = 900) {
  const events = [];
  const dt = 1 / 60;
  for (let t = 0; t < maxSeconds; t += dt) {
    const got = core.advance(dt);
    for (const e of got) events.push(e);
    if (got.some((e) => e.type === 'ended')) return events;
  }
  throw new Error(`no outcome after ${maxSeconds} s`);
}

await test('a new game: stage 1, full hearts, nothing on the lane yet', () => {
  assert.equal(core.newGame({ seed: 42 }), true);
  const s = core.state();
  assert.equal(s.stage, 1);
  assert.equal(s.mode, 'bushido');
  assert.equal(s.hp, 5);
  assert.equal(s.maxHP, 5);
  assert.equal(s.outcome, null);
  assert.equal(s.foes.length, 0);
  assert.equal(s.time, 0);
  assert.equal(s.rules.isStandard, true);
  assert.equal(s.setting, 'Crimson Dusk');
  assert.ok(s.roster.length >= 16);
});

await test('the same seed rolls the same stage', () => {
  core.newGame({ seed: 7 });
  const a = core.state().roster.join();
  core.newGame({ seed: '7' });
  assert.equal(core.state().roster.join(), a);
  core.newGame({ seed: 8n });
  const b = core.state();
  assert.equal(b.seed === core.state().seed, true);
});

await test('a cut at nothing whiffs and stumbles', () => {
  core.newGame({ seed: 42 });
  const events = core.strike('left');
  assert.deepEqual(events, [{ type: 'whiff', side: 'left' }]);
  const s = core.state();
  assert.equal(s.hero.isStumbling, true);
  assert.equal(s.hero.facing, 'left');
  assert.equal(s.stats.whiffs, 1);
  assert.throws(() => core.strike('up'));
});

let stage1;
await test('the autopilot clears stage 1, and the career books it', () => {
  core.newGame({ seed: 42 });
  assert.equal(core.setAutopilot(true), true);
  const events = playOut();
  stage1 = events;
  for (const e of events) assert.ok(EVENT_TYPES.has(e.type), `unknown event ${JSON.stringify(e)}`);
  const s = core.state();
  assert.equal(s.outcome, 'victory');
  assert.equal(s.remaining, 0);
  assert.ok(s.stats.kills >= 16, `kills ${s.stats.kills}`);
  assert.ok(s.score > 0);
  assert.equal(s.saveDue, true);
  const kills = events.filter((e) => (e.type === 'cut' || e.type === 'pierced') && e.killed);
  assert.equal(kills.length, s.stats.kills);
  for (const e of kills) assert.ok(e.kind && typeof e.x === 'number', `a kill carries the foe: ${JSON.stringify(e)}`);
  assert.ok(events.some((e) => e.type === 'arrived' && e.kind === 'grunt'));
  assert.ok(events.some((e) => e.type === 'raised'));
  const c = core.career();
  assert.equal(c.kills, s.stats.kills);
  assert.equal(c.stage, 2);
  assert.equal(c.cleared, 1);
  assert.equal(c.banner.outcome, 'victory');
  assert.ok(['CLEARED', 'FLAWLESS'].includes(c.banner.title));
  const counts = {};
  for (const e of events) counts[e.type] = (counts[e.type] || 0) + 1;
  console.log('      events:', JSON.stringify(counts));
});

await test('next() goes on to stage 2 with the hearts carried, the autopilot kept', () => {
  const hp = core.state().hp;
  core.next();
  const s = core.state();
  assert.equal(s.stage, 2);
  assert.equal(s.outcome, null);
  assert.equal(s.hp, hp);
  assert.equal(s.autopilot, true);
  const events = playOut();
  assert.ok(events.some((e) => e.type === 'ended'));
});

await test('a stage full of everything: stage 10 on Oni with the autopilot, every foe field present', () => {
  core.newGame({ seed: 3, mode: 'oni' });
  core.begin({ stage: 10 });
  core.setAutopilot(true);
  let s = core.state();
  assert.equal(s.stage, 10);
  assert.equal(s.mode, 'oni');
  assert.equal(s.difficulty.boss, true);
  const seen = new Set();
  let maxFoes = 0;
  for (let t = 0; t < 900 && !s.outcome; t += 1 / 30) {
    core.advance(1 / 30);
    s = core.state();
    maxFoes = Math.max(maxFoes, s.foes.length);
    for (const f of s.foes) {
      seen.add(f.kind);
      for (const key of ['id', 'kind', 'x', 'distance', 'phase', 'progress', 'timer', 'span', 'windup', 'hp', 'maxHP', 'alive',
        'bearer', 'darting', 'leapTo', 'guardSet', 'senNoSen', 'readying', 'clubGlares', 'turns', 'side']) {
        assert.ok(key in f, `foe lacks ${key}`);
      }
    }
  }
  assert.ok(s.outcome, 'the stage ended');
  console.log(`      stage 10 oni: ${s.outcome} at ${s.time.toFixed(1)} s, kinds ${[...seen].join(' ')}, up to ${maxFoes} foes at once`);
  assert.ok(seen.has('warlord') || s.outcome === 'defeat');
});

await test('rules: set, read back, restore', () => {
  const std = core.standardRules();
  assert.deepEqual(
    Object.keys(std).sort(),
    ['isStandard', 'noBruteKnockback', 'passBusy', 'passThrough', 'passes', 'runnersPassAll', 'shove', 'slipPast'],
  );
  assert.equal(std.runnersPassAll, true);
  assert.equal(std.noBruteKnockback, true);
  let r = core.setRules({ shove: false, passThrough: true });
  assert.equal(r.shove, false);
  assert.equal(r.passThrough, true);
  assert.equal(r.isStandard, false);
  assert.equal(core.state().rules.shove, false);
  r = core.setRules(std);
  assert.equal(r.isStandard, true);
  assert.equal(core.queueRules().passes, false);
});

await test('save and load: the fight resumes on the same step', () => {
  core.newGame({ seed: 99 });
  core.setAutopilot(true);
  core.advance(6);
  const save = core.saveJSON();
  assert.ok(save.startsWith('{') && save.includes('"career"') && save.includes('"fight"'));
  const before = core.state();
  const after10 = (() => { core.advance(5); return core.state(); })();
  assert.equal(core.loadSave(save), true);
  assert.deepEqual({ ...core.state(), saveDue: false }, { ...before, saveDue: false });
  core.advance(5);
  assert.deepEqual({ ...core.state(), saveDue: false }, { ...after10, saveDue: false });
  assert.equal(core.loadSave('not json'), false);
});

await test('menus: difficulty, endless, restart, jump', () => {
  core.newGame({ seed: 5 });
  core.setAutopilot(false);
  assert.equal(core.begin({ mode: 'shura' }), true);
  assert.equal(core.state().mode, 'shura');
  assert.equal(core.state().maxHP, 4);
  core.choose('bushido');
  assert.equal(core.career().mode, 'bushido');
  core.jump(3);
  assert.equal(core.state().stage, 3);
  core.begin({ endless: true, stage: 2 });
  let c = core.career();
  assert.equal(c.isEndless, true);
  assert.equal(c.endless.start, 2);
  assert.equal(core.state().endless, true);
  core.leaveEndless();
  c = core.career();
  assert.equal(c.isEndless, false);
  const seed = core.state().seed;
  core.restart();
  assert.notEqual(core.state().seed, seed);
  assert.equal(c.modes.length, 4);
  assert.ok(c.endlessStages.length >= 3);
});

await test('stage info and tuning', () => {
  const st = core.stage(5, 'bushido');
  assert.equal(st.boss, true);
  assert.equal(st.introduces, 'warlord');
  assert.equal(st.card.title, 'STAGE 5');
  assert.ok(st.card.lines.some((l) => l.icon === 'crest'));
  const t = core.tuning;
  assert.equal(t.Tuning.step, 1 / 120);
  assert.equal(t.Frame.cutFrames, 9);
  assert.equal(t.kinds.brute.baseHP, 3);
  assert.equal(t.modes.oni.hearts, 3);
  assert.ok(t.Figure.anchor.x > 0 && t.Figure.anchor.y > 0);
});

const CASTS = ['hero', 'grunt', 'runner', 'brute', 'dancer', 'archer', 'warlord'];
let sketchReport = [];
await test('every frame of every cast draws', () => {
  for (const cast of CASTS) {
    const frames = core.frames(cast);
    assert.ok(frames.length > 10, `${cast}: ${frames.length} frames`);
    const t0 = performance.now();
    let shapes = 0;
    for (const frame of frames) {
      const s = core.sketch(cast, frame);
      assert.ok(s.width > 0 && s.height > 0);
      assert.ok(s.body.length > 0, `${cast} ${frame} draws nothing`);
      for (const shape of [...s.underlay, ...s.body, ...s.overlay]) {
        assert.ok(shape.path instanceof Float32Array || shape.ellipse);
        assert.ok(shape.fill || shape.stroke);
      }
      shapes += s.underlay.length + s.body.length + s.overlay.length;
    }
    const ms = performance.now() - t0;
    sketchReport.push(`${cast}: ${frames.length} frames, ${shapes} shapes in ${ms.toFixed(0)} ms (${(ms / frames.length).toFixed(2)} ms/frame)`);
  }
  for (const line of sketchReport) console.log('      ' + line);
});

await test('frame keys: every case reads back, bad ones are refused', () => {
  for (const key of ['idle(0)', 'walk(3)', 'cut(kesa,2)', 'recover(kesa,4)', 'aim', 'reel(1,0)', 'clash(1)', 'chain(tsuki,4)',
    'winded(2,7)', 'iai(5)', 'shuffle(3)', 'stumble(1)', 'repelled(0)', 'hurt(2)', 'flourish(6)', 'fall(4)', 'retreat(2)',
    'windup(3)', 'strike(2)', 'stagger(1)', 'leap', 'loose', 'block', 'die(0)', 'cut(nukitsuke,8)']) {
    const cast = ['aim', 'loose'].includes(key) ? 'archer' : ['block', 'leap', 'windup(3)', 'strike(2)', 'stagger(1)', 'die(0)'].includes(key) ? 'warlord' : 'hero';
    const s = core.sketch(cast, key);
    assert.ok(s.body.length > 0, key);
  }
  assert.throws(() => core.sketch('hero', 'cut(nope,1)'));
  assert.throws(() => core.sketch('ninja', 'idle(0)'));
  const unarmed = core.sketch('grunt', 'idle(0)', { armed: false });
  const armed = core.sketch('grunt', 'idle(0)');
  assert.ok(unarmed.body.length < armed.body.length);
  const foot = core.footing('hero', 'idle(0)');
  assert.ok(typeof foot.front.x === 'number' && typeof foot.back.y === 'number');
  const fig = core.figure('hero', 'cut(kesa,4)');
  assert.ok(fig.tip && fig.anatomy.headRadius > 0);
  assert.ok(core.has('archer', 'aim') && !core.has('grunt', 'aim'));
  const size = core.figureSize('hero', 100);
  assert.ok(Math.abs(size.width / size.height - core.tuning.Figure.canvas.width / core.tuning.Figure.canvas.height) < 1e-9);
});

await test('timings: state() and advance() per frame', () => {
  core.newGame({ seed: 11, mode: 'oni' });
  core.begin({ stage: 9 });
  core.setAutopilot(true);
  core.advance(20);
  const n = core.state().foes.length;
  const stateMs = time(() => core.state(), 2000);
  const advanceMs = time(() => core.advance(1 / 60), 2000);
  const sketchMs = time(() => core.sketch('hero', 'cut(kesa,4)'), 200);
  console.log(`      state(): ${(stateMs * 1000).toFixed(0)} µs with ${n} foes · advance(1/60): ${(advanceMs * 1000).toFixed(0)} µs · sketch(hero, cut): ${(sketchMs * 1000).toFixed(0)} µs`);
  assert.ok(stateMs < 1, `state() takes ${stateMs} ms`);
});

console.log(failures ? `\n${failures} failed` : `\nall ${results.length} passed`);
process.exit(failures ? 1 : 0);
