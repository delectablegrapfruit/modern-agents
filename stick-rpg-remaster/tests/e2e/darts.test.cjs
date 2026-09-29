// tests/e2e/darts.test.cjs — owner: W2-Night. The Darts engine through Sticky's practice row on
// the real index.html (BUILD_PLAN §4.8; GDD §4.13, §6.5; BALANCE B-14f; UI §5.8):
//   the row (30 m, +1 CHA the first game each day) and the params the rules drew (A, φx, φy);
//   the wobble A × (sin(2π·0.53·t + φx), sin(2π·0.71·t + φy)) with A = 120 × (1 + 0.4 Buzz) ×
//   (1 - min(INT, 600) / 1200) (Buzz only with `nightlife`), Assist halves it; the aim model (the
//   pointer target with a 0.2 s time constant, the arrows at 400 px/s); a dart lands exactly on the
//   crosshair; the ring radii 19 / 40 / 138 / 220 → 50 / 35 / 15 / 5 / 0; ten darts and the result
//   { score, throws }; the Auto equals SR.rules.casino.darts.autoThrows on the same stream; #aria per
//   dart; the ghost board at Buzz ≥ 2 (P1); zero console errors.
// Screenshots: shots/W2-Night/darts-*.png.   node tests/e2e/darts.test.cjs
'use strict';
const K = require('./night-kit.cjs');

(async () => {
  const T = K.h.suite('e2e darts');
  const k = await K.open({});
  const { t, E } = k;

  async function atBar(opts, patch) {
    await t.newGame(Object.assign({ seed: 99 }, opts || {}));
    await t.setTime(19 * 60);
    if (patch) await t.set(patch);
    await t.enter('bar');
    await t.step(2);
    await k.quiet();
    await k.clearLogs();
  }
  /** B-14f's ring points, computed here from BALANCE (not the rules). */
  function ringPts(x, y) {
    const r = Math.hypot(x, y);
    return r <= 19 ? 50 : r <= 40 ? 35 : r <= 138 ? 15 : r <= 220 ? 5 : 0;
  }
  const wob = (p, tt) => ({ x: p.A * Math.sin(2 * Math.PI * 0.53 * tt + p.phx), y: p.A * Math.sin(2 * Math.PI * 0.71 * tt + p.phy) });
  const near = (a, b, eps) => Math.abs(a - b) <= (eps || 1e-6);

  // ------------------------------------------------------------------------------------------
  T.section('the practice row (B-14f practice)');
  await atBar({ stats: { int: 100 } });
  const pv = await t.preview('bar.darts');
  T.eq([pv.ok, pv.cost.min, pv.cost.cash], [true, 30, 0], 'Darts practice: 30 m, free (orig: prizeless)');
  const cha0 = (await k.state()).stats.cha;
  await k.row('bar.darts');
  let cur = await k.cur();
  T.eq([cur && cur.id, cur && cur.context, cur && cur.params.mode], ['darts', 'darts', 'practice'], 'the frame runs the darts engine in practice mode, its context pushed');
  T.eq((await k.state()).stats.cha - cha0, 1, '+1 CHA for the first game of the day');
  let p = await k.peek();
  const A = 120 * (1 + 0.4 * 0) * (1 - Math.min(100, 600) / 1200);
  T.ok(near(p.params.A, A), 'A = 120 × (1 + 0.4 × Buzz) × (1 - min(INT, 600)/1200) = 110 at INT 100, Buzz 0', p.params.A);
  T.ok(typeof p.params.phx === 'number' && typeof p.params.phy === 'number' && p.params.darts === 10, 'the phases come from the rules; 10 darts (orig)');
  T.ok(await k.heard('mg.darts.startAria'), 'the round is announced');
  T.eq(await k.audit(), [], 'the darts frame passes the a11y audit');

  T.section('the wobble (B-14f): A × (sin(2π·0.53·t + φx), sin(2π·0.71·t + φy))');
  let okW = true;
  for (let i = 0; i < 6; i++) {
    await t.step(7 + i * 5);
    p = await k.peek();
    const w = wob(p.params, p.t);
    if (!near(p.cross.x - p.aim.x, w.x, 1e-6) || !near(p.cross.y - p.aim.y, w.y, 1e-6)) okW = false;
  }
  T.ok(okW, 'the crosshair = the aim point + the Lissajous wobble at t = seconds of play');
  const t0 = p.t;
  await t.clickUI('mg-pause');
  await t.step(60);
  p = await k.peek();
  T.ok(near(p.t, t0), 'paused time does not move the wobble', [t0, p.t]);
  await t.key('Escape');
  await t.step(1);

  T.section('the aim model: the arrows move the target 400 px/s; the aim follows with 0.2 s smoothing');
  p = await k.peek();
  const tx0 = p.target.x;
  await t.page.keyboard.down('ArrowRight');
  await t.step(30);
  await t.page.keyboard.up('ArrowRight');
  await t.step(1);
  p = await k.peek();
  T.ok(Math.abs(p.target.x - tx0 - 400 * 0.5) <= 400 / 60 * 1.5, 'half a second of → moves the target 200 px', p.target.x - tx0);
  const lag = p.target.x - p.aim.x;
  await t.step(12);   // 0.2 s: one time constant
  p = await k.peek();
  const ratio = (p.target.x - p.aim.x) / lag;
  T.ok(ratio > 0.3 && ratio < 0.43, 'after 0.2 s the aim has closed 1 - 1/e of the gap (B-14f smoothSec)', ratio);

  T.section('a dart lands exactly on the crosshair and scores by ring (B-14f rings)');
  // Aim with the pointer at points of known radius (after the aim settles), then throw with Space.
  const box = await E(() => { const c = document.querySelector('[data-id="mg-canvas"]').getBoundingClientRect(); return { x: c.left, y: c.top, w: c.width, h: c.height }; });
  const center = await E(() => SR.reg.minigame.darts.CENTER);
  T.eq(center, { x: 640, y: 288 }, 'the board is centred in the 1280 × 576 play area (UI §5.8, B-14f)');
  const toPage = (x, y) => ({ x: box.x + x * box.w / 1280, y: box.y + y * box.h / 576 });
  let exact = true, byRing = true;
  const tried = [];
  for (const [dx, dy] of [[0, 0], [30, 0], [0, 90], [-180, 0], [0, 200], [250, 0]]) {
    const pt = toPage(center.x + dx, center.y + dy);
    await t.page.mouse.move(pt.x, pt.y);
    await t.step(90);   // 1.5 s: the aim settles on the target
    p = await k.peek();
    const want = p.cross, n = p.darts.length;
    await t.page.keyboard.press('Space');
    for (let i = 0; i < 20; i++) { p = await k.peek(); if (p.darts.length > n) break; await t.step(1); }
    const d = p.darts[p.darts.length - 1];
    tried.push([Math.round(Math.hypot(d.x, d.y)), d.pts]);
    // The throw happens on the next step after the press: the crosshair moved by one step of wobble.
    if (Math.hypot(d.x - want.x, d.y - want.y) > p.params.A * 2 * Math.PI * 0.71 / 60 * 3) exact = false;
    if (d.pts !== ringPts(d.x, d.y)) byRing = false;
  }
  T.ok(exact, 'each dart lands where the crosshair was at the throw');
  T.ok(byRing, 'each dart scores 50 / 35 / 15 / 5 / 0 by its radius (19 / 40 / 138 / 220)', tried);
  T.ok(await k.heard('mg.darts.dartAria'), 'every dart is announced with its points and the total');
  await t.step(20);
  await k.shot('darts-practice');
  // The rest of the round with Space; the result is { score, throws }.
  for (let i = (await k.peek()).darts.length; i < 10; i++) { await t.page.keyboard.press('Space'); await t.step(25); }
  await k.closed();
  const done = (await k.done()).filter((d) => d.id === 'darts').pop();
  T.ok(done && done.result.throws.length === 10 && done.result.score === done.result.throws.reduce((a, b) => a + b, 0), 'ten darts: { score, throws } (CONTRACT §13)', done && done.result);
  const toast = (await k.acted()).filter((a) => a.id === 'bar.darts:resolve')[0];
  T.ok(toast && toast.ok && toast.toasts.some((x) => /^toast\.bar\.darts/.test(x)), 'bar.darts:resolve says how the round went (practice is prizeless)', toast);

  T.section('practice: +1 CHA only once a day');
  const cha1 = (await k.state()).stats.cha;
  await k.quiet();
  await k.row('bar.darts');
  T.eq((await k.state()).stats.cha, cha1, 'the second game today gives no CHA');

  T.section('Assist halves the wobble (B-14f)');
  p = await k.peek();
  const a0 = p.A;
  await t.clickUI('mg-assist');
  await t.step(1);
  p = await k.peek();
  T.ok(near(p.A, a0 * 0.5), 'Assist: A × 0.5', [a0, p.A]);
  const w2 = wob(p.params, p.t);
  T.ok(near(p.cross.x - p.aim.x, w2.x * 0.5, 1e-6), 'the drawn wobble follows it');
  await t.clickUI('mg-assist');

  T.section('the Auto is SR.rules.casino.darts.autoThrows on the same stream (a real sample)');
  const st = await E(() => ({ rng: SR.rng.rules.state(), params: JSON.parse(JSON.stringify(SR.minigame.current().params)), state: JSON.parse(JSON.stringify(SR.state)) }));
  await t.clickUI('mg-auto');
  await k.closed();
  const ad = (await k.done()).filter((d) => d.id === 'darts').pop();
  const ar = await E((st) => { const rng = SR.rng.create(1); rng.setState(st.rng); return SR.rules.casino.darts.autoThrows(st.state, st.params, rng); }, st);
  T.eq([ad.result.score, ad.result.throws, ad.result.auto], [ar.score, ar.throws, true], 'Auto: 10 throws at random moments of the wobble, the rules\' own sample');
  const dist = await E(() => {
    const st = SR.rules.state.create({ seed: 5, stats: { int: 100 } }), rng = SR.rng.create(77);
    let sum = 0, hi = 0;
    for (let i = 0; i < 4000; i++) { const r = SR.minigame.auto('darts', { mode: 'practice' }, rng, st); sum += r.score; if (r.score >= 160) hi++; }
    return { mean: sum / 4000, p160: hi / 4000 };
  });
  T.ok(Math.abs(dist.mean - 145) < 4 && Math.abs(dist.p160 - 0.25) < 0.03, 'Auto at INT 100: mean ≈ 145, P(≥ 160) ≈ 0.25 (B-14f reference)', dist);

  T.section('Buzz (P1 `nightlife`): a wider wobble and the ghost board at Buzz ≥ 2');
  await E(() => SR.debug.feature('nightlife', true));
  await atBar({ stats: { int: 100 } }, { stats: { buzz: 2 } });
  await k.row('bar.darts');
  p = await k.peek();
  T.ok(near(p.params.A, 120 * (1 + 0.4 * 2) * (1 - 100 / 1200)) && p.ghost, 'Buzz 2: A × 1.8 and the ghost board', [p.params.A, p.ghost]);
  await t.step(30);
  await k.shot('darts-ghost');
  await t.clickUI('mg-exit');
  await k.closed();
  await E(() => SR.debug.feature('nightlife', false));

  T.section('no console errors');
  T.eq(t.errors(), [], 'zero console errors, page errors or failed requests');
  await t.close();
  T.done();
})().catch((e) => { console.error(e); process.exit(1); });
