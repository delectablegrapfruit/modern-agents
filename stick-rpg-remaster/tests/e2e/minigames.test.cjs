// tests/e2e/minigames.test.cjs — owner: W1-M. The minigame framework and the three engines
// (BUILD_PLAN §3.10): each engine plays with keyboard, mouse, a mocked gamepad and touch; the
// engine's context map shadows the city keys while open and is popped after; Auto returns a
// sampled outcome from host.rng (Duel Auto over 10⁴ seeded runs within ±2 % of the analytic win
// rate, the hotwire Auto hit rate = arc / 360°, Shift Rush and pitch Auto m = 1.0 exactly); Pause
// freezes timers; outcomes use host.rng; stance mode applies the counter table and the hint
// accuracy formula; results have the ARCHITECTURE §10 shapes; #aria announces each beat; the
// Hardcore pending hook; the engines read their tuning rows (items, streak, belt, hotwire arc,
// Assist); the frame on the real index.html with zero console errors, holding the song's 6 dB
// duck while a game without its own song is open.
// Screenshots: shots/W1-M/*.png (git-ignored).
//   node tests/e2e/minigames.test.cjs
'use strict';
const path = require('path');
const { pathToFileURL } = require('url');
const h = require('../harness.cjs');

const SHOTS = path.join(h.ROOT, 'shots', 'W1-M');
const SHEET = pathToFileURL(path.join(h.ROOT, 'tests', 'sheets', 'minigames.html')).href + '?paused';
const AREA_Y = 64;   // the play area starts 64 px below the top of the 1280 × 720 stage (UI §2.2)

/** Page-side helpers installed once per page. */
function install(page) {
  return page.evaluate(() => {
    window.__aria = [];
    new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => { if (n.textContent) window.__aria.push(n.textContent); })))
      .observe(document.getElementById('aria'), { childList: true, subtree: true });
    window.__done = [];
    SR.events.on('minigame:done', (p) => window.__done.push(JSON.parse(JSON.stringify(p))));
    window.__acts = [];
    const orig = SR.scenes.dispatch;
    SR.scenes.dispatch = function (a, ev) { window.__acts.push({ a, code: ev && ev.code, ctx: ev && ev.context }); return orig.apply(this, arguments); };
    window.__pushes = [];
    const push = SR.input.pushContext, pop = SR.input.popContext;
    SR.input.pushContext = function (name, map, opts) { window.__pushes.push({ op: 'push', name, map: JSON.parse(JSON.stringify(map)), shadow: !!(opts && opts.shadow) }); return push.apply(this, arguments); };
    SR.input.popContext = function (name) { window.__pushes.push({ op: 'pop', name }); return pop.apply(this, arguments); };
    window.__pad = { id: 'Mock pad (Xbox)', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    navigator.getGamepads = () => [window.__pad];
    // A matcher for a text key's template ({vars} match anything), so checks never hard-code wording.
    window.__re = (key) => {
      const v = SR.reg.text[key];
      const src = String(Array.isArray(v) ? v[0] : v).replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{\w+\}/g, '[\\s\\S]*?');
      return new RegExp(src);
    };
    window.__count = (key) => window.__aria.filter((s) => window.__re(key).test(s)).length;
    window.__inArc = (p, margin) => {
      const d = Math.abs(((p.angle - p.arcC) % 360 + 360) % 360);
      return Math.min(d, 360 - d) <= p.width / 2 - margin;
    };
  });
}

(async () => {
  const T = h.suite('e2e minigames');
  const t = await h.open({ url: SHEET });
  const { page } = t;
  await install(page);
  await t.eval(() => document.body.classList.add('shot'));

  const E = (fn, arg) => page.evaluate(fn, arg);
  const step = (n) => E((n) => { window.sheet.step(n); }, n);
  const peek = () => E(() => window.sheet.peek());
  const last = () => E(() => window.sheet.last);
  const cur = () => E(() => {
    const c = SR.minigame.current();
    return c ? { id: c.id, skin: c.skin, panel: c.panel, finished: c.finished, replaying: c.replaying, context: c.context, contextPushed: c.contextPushed, assist: c.assist, device: c.device, t: c.t } : null;
  });
  const start = (id, params, st) => E(([id, params, st]) => {
    SR.state = window.sheet.fakeState(st || {});
    window.__aria.length = 0;
    window.__acts.length = 0;
    window.sheet.run(id, params || {});
    window.sheet.step(1);
    return SR.minigame.current() ? SR.minigame.current().context : null;
  }, [id, params || {}, st || {}]);
  const untilDone = async (max) => {
    for (let i = 0; i < (max || 600); i++) { const r = await last(); if (r.done) return r; await step(10); }
    return last();
  };
  const shot = (name) => t.shot(path.join(SHOTS, name + '.png'));
  const key = (code) => page.keyboard.press(code);
  const padPress = async (b) => {
    await E((b) => { window.__pad.buttons[b].pressed = true; window.__pad.buttons[b].value = 1; }, b);
    await step(1);
    await E((b) => { window.__pad.buttons[b].pressed = false; window.__pad.buttons[b].value = 0; }, b);
    await step(1);
  };
  /** Steps until the needle is inside the sweet arc (margin in degrees); returns the frames stepped. */
  const toArc = (margin) => E((m) => { for (let i = 0; i < 600; i++) { const p = window.sheet.peek(); if (window.__inArc(p, m)) return i; window.sheet.step(1); } return -1; }, margin);
  const toMiss = () => E(() => { for (let i = 0; i < 600; i++) { const p = window.sheet.peek(); const d = Math.abs(((p.angle - p.arcC) % 360 + 360) % 360); if (Math.min(d, 360 - d) > p.width / 2 + 30) return i; window.sheet.step(1); } return -1; });

  // ------------------------------------------------------------------------------------------
  T.section('framework API');
  const api = await E(() => ({
    engines: SR.minigame.engines().sort(),
    fns: ['run', 'register', 'lookup', 'auto', 'force', 'chance', 'roll', 'current'].filter((k) => typeof SR.minigame[k] === 'function'),
    bySkin: (() => { const L = SR.minigame.lookup('test_holdup', { D: 70 }); return { id: L.id, skin: L.skinId, D: L.params.D, mode: L.params.mode, skinParam: L.params.skin }; })(),
    byEngine: SR.minigame.lookup('duel', { skin: 'test_holdup' }).skinId,
    otherEngine: SR.minigame.lookup('duel', { skin: 'test_pitch' }).skinId,
    plain: SR.minigame.lookup('timingring', {}).skinId,
    unknown: SR.minigame.lookup('nope'),
    scene: (() => { const d = SR.scenes.get('minigame'); return { kind: d.kind, blocksUpdate: d.blocksUpdate, blocksRender: d.blocksRender }; })(),
  }));
  T.eq(api.engines, ['duel', 'shiftrush', 'timingring'], 'the three engines are registered');
  T.eq(api.fns.length, 8, 'SR.minigame.{run, register, lookup, auto, force, chance, roll, current}');
  T.eq(api.bySkin, { id: 'duel', skin: 'test_holdup', D: 70, mode: 'plain', skinParam: 'test_holdup' }, 'a skin id runs its engine with the skin; run params override skin params');
  T.eq([api.byEngine, api.otherEngine, api.plain], ['test_holdup', null, null], 'an engine id takes params.skin only when that skin belongs to it');
  T.eq(api.unknown, null, 'lookup of an unknown id is null');
  T.eq(api.scene, { kind: 'overlay', blocksUpdate: true, blocksRender: true }, "the 'minigame' scene is an overlay that blocks update");
  const rej = await E(() => SR.minigame.run('nope').then(() => 'resolved', (e) => e.message));
  T.ok(/unknown engine or skin/.test(rej), 'run() of an unknown id rejects', rej);
  const forced = await E(async () => { SR.minigame.force({ m: 1.2, hits: 4, misses: 0 }); const r = await SR.minigame.run('test_pitch'); return { r, stack: SR.scenes.stack(), done: window.__done[window.__done.length - 1] }; });
  T.eq(forced.r, { m: 1.2, hits: 4, misses: 0 }, 'force() (SR.debug.mg) makes the next run resolve with that result');
  T.eq(forced.stack, ['sheet'], 'a forced run opens no frame');
  T.eq(forced.done, { id: 'timingring', skin: 'test_pitch', result: { m: 1.2, hits: 4, misses: 0 } }, 'minigame:done carries { id, skin, result }');
  T.ok(await E(() => typeof SR.debug.mg === 'function' && SR.debug.mg({ m: 1 }) === 1 && SR.minigame.run('shiftrush').then((r) => r.m === 1)), 'SR.debug.mg feeds SR.minigame.force');

  // ------------------------------------------------------------------------------------------
  T.section('Shift Rush · orderup · keyboard; the context map');
  let ctxName = await start('test_orderup');
  T.eq(ctxName, 'orderup', 'Shift Rush pushes its context under the CONTRACT §12.3 name orderup (no skin field needed)');
  const pushed = await E(() => window.__pushes.filter((p) => p.name === 'orderup').pop());
  T.ok(pushed && pushed.op === 'push' && pushed.shadow && pushed.map.bin1.indexOf('Digit1') >= 0 && pushed.map.serve.indexOf('Enter') >= 0,
    'pushContext("orderup", { bin1: Digit1 … bin6, serve: Enter }, { shadow: true })', pushed);
  T.eq(await E(() => SR.input.contexts().slice(-1)[0]), 'orderup', 'the context is on top of SR.input while the frame is open');
  await key('Digit9');
  let acts = await E(() => window.__acts.map((x) => x.a));
  T.ok(acts.indexOf('row9') >= 0, 'a key the context does not bind keeps its global action (Digit9 → row9)', acts);
  let p0 = await peek();
  const first = p0.ticket[0];
  await E(() => { window.__acts.length = 0; });
  await key('Digit' + (first + 1));
  acts = await E(() => window.__acts);
  T.ok(acts.some((x) => x.a === 'bin' + (first + 1) && x.ctx === 'orderup') && !acts.some((x) => /^row/.test(x.a)), 'Digit1-6 fire bin1-6 and never row1-6 while open', acts);
  await E(() => { window.__acts.length = 0; });
  for (let i = 1; i < p0.ticket.length; i++) await key('Digit' + (p0.ticket[i] + 1));
  await key('Enter');
  acts = await E(() => window.__acts.map((x) => x.a));
  T.ok(acts.indexOf('serve') >= 0 && acts.indexOf('confirm') < 0 && acts.indexOf('interact') < 0, 'Enter fires serve, shadowing confirm and interact', acts);
  let p1 = await peek();
  T.eq([p1.correct, p1.wrong], [1, 0], 'a ticket typed in order and served counts one correct');
  await shot('shiftrush-orderup-keyboard');
  // one wrong bin, then play the round out
  await step(1);
  p1 = await peek();
  const wrongBin = p1.ticket ? (p1.ticket[0] + 1) % 6 : 0;
  if (p1.ticket) await key('Digit' + (wrongBin + 1));
  for (let guard = 0; guard < 200; guard++) {
    const p = await peek();
    if (!p || p.done) break;
    if (p.ticket) {
      for (let i = p.tray.length; i < p.ticket.length; i++) await key('Digit' + (p.ticket[i] + 1));
      await key('Enter');
    }
    await step(20);
  }
  const bannerShown = await E(() => { const b = document.querySelector('[data-id="mg-banner"]'); return b && b.style.display !== 'none' ? b.textContent : ''; });
  await shot('shiftrush-result-banner');
  let r = await untilDone();
  T.ok(r.done && r.result && typeof r.result.m === 'number' && Object.keys(r.result).sort().join() === 'hits,m,misses', 'Shift Rush resolves { m, hits, misses }', r.result);
  T.ok(r.result.hits >= 5 && r.result.misses === (p1.ticket ? 1 : 0), 'the round counted the served tickets and the wrong bin', r.result);
  const want = await E((x) => SR.reg.minigame.shiftrush.grade({ mode: 'tickets' }, x.hits, x.misses), r.result);
  T.eq(r.result.m, want, 'm = clamp(0.7 + 0.075 × correct - 0.1 × wrong, 0.7, 1.3)');
  T.ok(bannerShown.indexOf(await E(() => SR.text('mg.frame.result'))) >= 0, 'the result banner shows before the frame closes', bannerShown);
  T.eq(await E(() => SR.scenes.stack()), ['sheet'], 'the frame pops when the round ends');
  T.ok(await E(() => SR.input.contexts().indexOf('orderup') < 0), 'the context is popped on close');
  await E(() => { window.__acts.length = 0; });
  await key('Digit1');
  T.ok(await E(() => window.__acts.some((x) => x.a === 'row1')), 'after closing, Digit1 is row1 again');
  T.ok(await E(() => window.__count('mg.frame.sr.newTicket') >= 5 && window.__count('mg.frame.sr.served') >= 5), '#aria announced the orders and the serves');

  // ------------------------------------------------------------------------------------------
  T.section('Pause freezes timers; Exit without a stake');
  await start('test_orderup');
  await step(60);
  const left1 = (await peek()).left;
  await key('Escape');
  let c = await cur();
  T.eq(c.panel, 'pause', 'Esc opens the pause panel (back and pause fire together: one toggle)');
  T.ok(!c.contextPushed && (await E(() => SR.input.contexts().indexOf('orderup') < 0)), 'the context is released while paused');
  await shot('frame-pause');
  await step(300);
  const left2 = (await peek()).left;
  T.eq(left2, left1, 'five seconds of steps while paused leave the timer where it was');
  await key('Escape');
  c = await cur();
  T.ok(c.panel === null && c.contextPushed, 'Esc again resumes and pushes the context back');
  await step(60);
  const left3 = (await peek()).left;
  T.ok(Math.abs(left1 - left3 - 1) < 0.02, 'the timer runs again after Resume', [left1, left3]);
  await padPress(9);
  T.eq((await cur()).panel, 'pause', 'Start (Pad9) pauses too');
  await padPress(1);
  T.eq((await cur()).panel, null, 'B (Pad1) resumes from the pause panel');
  await t.clickUI('mg-exit');
  r = await untilDone(5);
  T.eq(r.result, { m: 1, hits: 0, misses: 0, auto: true, exited: true }, 'Exit from a hustle takes the Auto shift at once (no confirm without a stake)');

  // ------------------------------------------------------------------------------------------
  T.section('Shift Rush · sortit · mouse');
  await start('test_sortit');
  for (let guard = 0; guard < 400; guard++) {
    const p = await peek();
    if (!p || p.done) break;
    if (p.front && p.front.p > 0.05) {
      const b = p.rects.bins[p.front.bin];
      await page.mouse.click(b.x + b.w / 2, AREA_Y + b.y + b.h / 2);
    }
    await step(12);
  }
  c = await cur();
  await shot('shiftrush-sortit-mouse');
  r = await untilDone();
  T.ok(r.result && r.result.hits >= 15 && r.result.misses === 0, 'clicking the right bins sorts the belt', r.result);
  T.ok(r.result.m > 1 && r.result.m <= 1.3, 'streaks lift m above 1.0 (≤ 1.3)', r.result);
  T.ok(await E(() => window.__count('mg.frame.sr.sortRight') >= 15), '#aria announced the sorts');
  const streak = await E(() => [0, 2, 3, 6, 12, 15, 30].map((n) => SR.reg.minigame.shiftrush.streakMult({ mode: 'conveyor' }, n)));
  T.eq(streak, [1, 1, 1.1, 1.2, 1.4, 1.5, 1.5], 'the streak multiplier steps ×1.1 per 3 right sorts up to ×1.5');

  // ------------------------------------------------------------------------------------------
  T.section('Shift Rush · orderup · gamepad');
  await start('test_orderup');
  for (let n = 0; n < 2; n++) {
    const p = await peek();
    for (let i = 0; i < p.ticket.length; i++) {
      let cursor = (await peek()).cursor;
      while (cursor !== p.ticket[i]) { await padPress(15); cursor = (await peek()).cursor; }
      await padPress(0);
    }
    await padPress(3);
    await step(400);
  }
  c = await cur();
  T.eq(c.device, 'pad', 'the frame follows the pad as the last device');
  const hintText = await E(() => document.querySelector('[data-id="mg-hints"]').textContent);
  T.ok(hintText.indexOf(await E(() => SR.text('mg.frame.sr.serve'))) >= 0 && !/1-6/.test(hintText), 'the bottom bar shows pad hints for the pad', hintText);
  await shot('shiftrush-orderup-pad');
  r = await untilDone();
  T.ok(r.result.hits >= 2, 'D-pad, A and Y serve tickets', r.result);

  // ------------------------------------------------------------------------------------------
  T.section('Timing Ring · pitch · keyboard, Assist, Auto');
  await start('test_pitch', {}, { stats: { cha: 100 } });
  T.eq(await E(() => SR.input.contexts().slice(-1)[0]), 'timingring', 'an engine context is named after its engine id (CONTRACT §12.3)');
  let pr = await peek();
  T.ok(Math.abs(pr.arc - 37.8) < 1e-9 && pr.speed === 180, 'pitch arc = (0.08 + CHA/4000) × 360° = 37.8° at CHA 100; needle 180°/s at step 0', pr);
  for (let i = 0; i < 4; i++) { await toArc(5); await key('Space'); await step(12); }
  await toMiss();
  await key('Space');
  pr = await peek();
  await shot('timingring-pitch');
  r = await untilDone();
  T.eq(r.result, { m: 1.18, hits: 4, misses: 1 }, 'four hits and a miss: m = 0.7 + 0.12 × 4 = 1.18');
  T.eq(await E(() => window.__count('mg.frame.tr.pressAria')), 5, '#aria announces each press');
  await start('test_pitch', { step: 1 }, { stats: { cha: 100 } });
  T.eq((await peek()).speed, 210, 'difficulty step 1 adds 30°/s');
  await t.clickUI('mg-assist');
  pr = await peek();
  T.ok(Math.abs(pr.speed - 147) < 1e-9 && Math.abs(pr.width - 37.8 * 1.5) < 1e-9 && (await cur()).assist, 'Assist: needle -30 %, sweet arc +50 %', pr);
  await step(1);
  await shot('timingring-assist');
  await t.clickUI('mg-assist');
  await t.clickUI('mg-auto');
  c = await cur();
  T.ok(c.replaying, 'Auto starts a quick replay');
  await shot('frame-auto-replay');
  r = await untilDone();
  T.eq(r.result, { m: 1, hits: 0, misses: 0, auto: true }, 'pitch Auto returns m = 1.0 exactly');

  // ------------------------------------------------------------------------------------------
  T.section('Timing Ring · hotwire · mouse and gamepad');
  await start('test_hotwire', {}, { stats: { int: 250 } });
  pr = await peek();
  T.ok(pr.arc === 30 && pr.mode === 'unlock', 'hotwire arc = clamp(20° + (INT - 200)/5, 8°, 70°) = 30° at INT 250', pr);
  for (let i = 0; i < 3; i++) { await toArc(3); await page.mouse.click(640, AREA_Y + 450); await step(12); }
  r = await untilDone();
  T.eq(r.result, { started: true, hits: 3, misses: 0 }, 'three clicks in the arc start the car: { started, hits, misses }');
  await start('test_pitch', {}, { stats: { cha: 100 } });
  for (let i = 0; i < 5; i++) { await toArc(5); await padPress(0); await step(10); }
  r = await untilDone();
  T.eq(r.result, { m: 1.3, hits: 5, misses: 0 }, 'A (Pad0) presses the ring: five hits give m = 1.3');
  await start('test_hotwire', {}, { stats: { int: 250 } });
  for (let i = 0; i < 3; i++) { await toMiss(); await key('Space'); await step(12); }
  r = await untilDone();
  T.eq(r.result, { started: false, hits: 0, misses: 3 }, 'three misses trip the alarm: started false');

  // ------------------------------------------------------------------------------------------
  T.section('Duel · holdup · keyboard; outcomes use host.rng');
  await E(() => {
    window.__checks = [];
    const chk = SR.rules.check.chance;
    SR.rules.check.chance = function (stat, D, o) { window.__checks.push(o && o.checkId); return chk.apply(this, arguments); };
    window.__chk = chk;
  });
  await E(() => SR.rng.rules.seed(777));
  const snap = await E(() => SR.rng.rules.state());
  await start('test_holdup', { stake: 250 }, { stats: { str: 60, cha: 100, int: 220 } });
  T.eq(await E(() => document.querySelector('[data-id="mg-info"]').textContent), await E(() => SR.text('mg.frame.stake', { money: '$250' })), 'the top bar shows the stake');
  let dp = await peek();
  T.eq(dp.cur.options.map((o) => [o.id, o.stat, o.D]), [['intimidate', 'str', 60], ['sweettalk', 'cha', 60], ['outwit', 'int', 60]], 'each option shows its stat and D');
  T.ok(Math.abs(dp.cur.options[1].p - 100 / 160) < 1e-9, 'shown odds = chance(stat, D) (CHA 100, D 60 → 62.5 %)', dp.cur.options[1]);
  await shot('duel-holdup-choose');
  const picked = [];
  for (let guard = 0; guard < 6; guard++) {
    dp = await peek();
    if (!dp || dp.phase === 'done') break;
    if (dp.phase === 'choose') { await key('Digit2'); picked.push('sweettalk'); if (picked.length === 1) { await step(1); await shot('duel-holdup-outcome'); } }
    await step(70);
  }
  r = await untilDone();
  T.ok(Array.isArray(r.result.beats) && typeof r.result.wins === 'number' && typeof r.result.losses === 'number' && Array.isArray(r.result.picks),
    'Duel resolves { beats: [bool], wins, losses, picks }', r.result);
  T.ok(r.result.wins === 2 || r.result.losses === 2, 'best of three stops once decided', r.result);
  const replay = await E(([snap, n]) => {
    const rng = SR.rng.create(0);
    rng.setState(snap);
    const out = [];
    for (let i = 0; i < n; i++) out.push(rng.float() < window.__chk(100, 60, { s: SR.state, checkId: 'holdup.store.cha' }));
    return out;
  }, [snap, r.result.beats.length]);
  T.eq(r.result.beats, replay, 'each beat is one roll of SR.rng.rules (host.rng) against the chance');
  T.ok(await E(() => window.__checks.indexOf('holdup.store.cha') >= 0 && window.__checks.indexOf('holdup.store.str') >= 0), 'odds go through SR.rules.check.chance with the check ids holdup.store.<stat>');
  T.ok(await E((n) => window.__count('mg.frame.duel.beatAria') === n && window.__count('mg.frame.duel.outcomeAria') === n && window.__aria.filter((s) => s.indexOf('Sweet-talk') === 0).length === n, r.result.beats.length),
    '#aria announces each beat and its outcome');
  await E(() => { SR.rules.check.chance = window.__chk; });

  // ------------------------------------------------------------------------------------------
  T.section('Duel · exit confirm with a stake; the Hardcore pending hook');
  await start('test_holdup', { stake: 250 });
  await t.clickUI('mg-exit');
  c = await cur();
  T.eq(c.panel, 'exit', 'Exit asks to confirm while a stake is live');
  await shot('frame-exit-confirm');
  await key('Escape');
  T.eq((await cur()).panel, 'pause', 'Esc steps back from the confirm to the pause panel');
  await key('Escape');
  T.eq((await cur()).panel, null, 'Esc again resumes');
  await t.clickUI('mg-exit');
  await t.clickUI('mg-panel-leave');
  r = await untilDone(5);
  T.eq(r.result, { beats: [false, false], wins: 0, losses: 2, picks: [null, null], exited: true }, 'walking out of a hold-up loses the remaining beats');
  await E(() => { window.__writes = []; window.__saveWrite = SR.save.write; SR.save.write = function (slot) { window.__writes.push({ slot, pending: JSON.parse(JSON.stringify(SR.state.pending)) }); }; });
  await start('test_holdup', { stake: 250, resolve: 'store.rob:resolve' }, { difficulty: 'hardcore' });
  let pend = await E(() => SR.state.pending);
  T.eq(pend, { resolve: 'store.rob:resolve', worst: { beats: [false, false], wins: 0, losses: 2, picks: [null, null] } }, 'Hardcore: state.pending = { resolve, worst } while a stake-bearing round is open');
  T.eq(await E(() => window.__writes.map((w) => w.slot)), ['ironman'], 'the ironman slot is written before the round opens');
  await E(() => SR.minigame.current().host.finish({ beats: [true, true], wins: 2, losses: 0, picks: ['sweettalk', 'sweettalk'] }));
  r = await untilDone();
  T.eq(await E(() => SR.state.pending), null, 'pending is cleared when the round resolves');
  await E(() => SR.events.emit('action:done', { id: 'store.rob', result: { open: { minigame: 'test_holdup', skin: 'test_holdup', params: {}, resolve: 'store.rob:resolve' } } }));
  await start('test_holdup', { stake: 250 }, { difficulty: 'hardcore' });
  T.eq(await E(() => SR.state.pending && SR.state.pending.resolve), 'store.rob:resolve', "without params.resolve the hook takes the last Result.open's resolve id");
  await t.clickUI('mg-exit');
  await t.clickUI('mg-panel-leave');
  await untilDone(5);
  await start('test_pitch', {}, { difficulty: 'hardcore' });
  T.eq(await E(() => SR.state.pending), null, 'a hustle is not stake-bearing: no pending');
  await t.clickUI('mg-exit');
  await untilDone(5);
  await E(() => { SR.save.write = window.__saveWrite; });

  // ------------------------------------------------------------------------------------------
  T.section('Exit by the round\'s progress (confirmExit as a function, exitRisk; W2-Night request 7)');
  // An engine may answer the exit question from the round's progress (the def's confirmExit as a
  // function), or its instance may answer at once without side effects (exitRisk()): blackjack asks
  // only while a hand is out (its stake would be lost), and leaves at once between hands.
  await E(() => {
    window.__live = 0;
    window.__asked = [];
    if (!SR.reg.minigame.test_exitfn) {
      SR.minigame.register('test_exitfn', {
        title: 'mg.frame.paused',
        confirmExit: function (progress, params) { window.__asked.push({ progress, mark: params && params.mark }); return !!(progress && progress.live > 0); },
        create: function () {
          return { update() {}, render() {}, onAction() {}, destroy() {}, progress() { return { live: window.__live }; } };
        },
        forfeit: function (params, progress) { return { lost: (progress && progress.live) || 0, exited: true }; },
      });
    }
  });
  await start('test_exitfn', { mark: 7 });
  await E(() => { window.__live = 25; });
  await t.clickUI('mg-exit');
  c = await cur();
  T.ok(c.panel === 'exit' && await E(() => window.__asked.length === 1 && window.__asked[0].progress.live === 25 && window.__asked[0].mark === 7),
    'a hand out: Exit asks (confirmExit(progress, params) returned true)', await E(() => window.__asked));
  T.ok(new RegExp(await E(() => window.__re('mg.frame.quitLoss').source)).test(await E(() => (document.querySelector('[data-id="mg-panel-text"]') || {}).textContent || '')),
    'with the "this round counts as a loss" line');
  await key('Escape');
  await key('Escape');
  T.eq((await cur()).panel, null, 'Esc twice resumes');
  await E(() => { window.__live = 0; });
  await t.clickUI('mg-exit');
  r = await untilDone(5);
  T.eq(r.result, { lost: 0, exited: true }, 'between hands: Exit leaves at once (no question)');
  await E(() => {
    window.__risk = false;
    if (!SR.reg.minigame.test_exitrisk) {
      SR.minigame.register('test_exitrisk', {
        title: 'mg.frame.paused',
        confirmExit: true,
        create: function () { return { update() {}, render() {}, onAction() {}, destroy() {}, exitRisk() { return window.__risk; } }; },
        forfeit: function () { return { exited: true }; },
      });
    }
  });
  await start('test_exitrisk', {});
  await E(() => { window.__risk = true; });
  await t.clickUI('mg-exit');
  const asked = (await cur()).panel;
  await key('Escape');
  await key('Escape');
  await E(() => { window.__risk = false; });
  await t.clickUI('mg-exit');
  r = await untilDone(5);
  T.ok(asked === 'exit' && r.result && r.result.exited === true, 'an instance\'s exitRisk() answers before the def\'s confirmExit: true (asks when at risk, else leaves at once)', { asked, r: r.result });

  // ------------------------------------------------------------------------------------------
  T.section('Duel · stance (debate) · mouse; the counter table and the hint');
  const table = await E(() => {
    const d = SR.reg.minigame.duel, out = {};
    ['int', 'cha', 'str'].forEach((s) => ['logic', 'emotion', 'force'].forEach((st) => { out[s + '/' + st] = d.factor(s, st); }));
    return out;
  });
  T.eq(table, { 'int/logic': 1, 'int/emotion': 0.5, 'int/force': 2, 'cha/logic': 2, 'cha/emotion': 1, 'cha/force': 0.5, 'str/logic': 0.5, 'str/emotion': 2, 'str/force': 1 },
    'B-30: Facts beats Emotion, Charm beats Force, Pressure beats Logic (D × 0.5); Logic counters Charm, Emotion counters Pressure, Force counters Facts (D × 2)');
  const rows = await E(() => {
    const d = SR.reg.minigame.duel;
    const io = d.opts({ skin: 'interrogation' }), ho = d.opts({ skin: 'holdup', D: 90, check: 'holdup.bank' }), deb = d.opts({ skin: 'debate' }), br = d.opts({ skin: 'boardroom' });
    const R = d.newRound({ stats: { int: 100, cha: 100, str: 100, heat: 40 } }, { skin: 'interrogation' });
    const cur = d.begin(R, SR.rng.create(5));
    return {
      interrogation: { mode: io.mode, beats: io.beats, bestOf: io.bestOf, needed: io.needed, options: io.options.map((o) => o.label + ':' + o.stat), baseD: cur.options[0].baseD },
      holdup: { mode: ho.mode, bestOf: ho.bestOf, D: ho.Drule, check: ho.check, labels: ho.options.map((o) => o.label) },
      debate: { mode: deb.mode, bestOf: deb.bestOf, D: deb.Drule },
      boardroom: { mode: br.mode, beats: br.beats, options: Object.keys(br.cardOptions), evInt: br.evInt },
    };
  });
  T.eq(rows, {
    interrogation: { mode: 'stance', beats: 3, bestOf: true, needed: 2, options: ['mg.interrogation.facts:int', 'mg.interrogation.charm:cha', 'mg.interrogation.pressure:str'], baseD: 240 },
    holdup: { mode: 'plain', bestOf: true, D: 90, check: 'holdup.bank', labels: ['mg.holdup.intimidate', 'mg.holdup.sweetTalk', 'mg.holdup.outwit'] },
    debate: { mode: 'stance', bestOf: false, D: 500 },
    boardroom: { mode: 'cards', beats: 3, options: ['safe', 'bold', 'ruthless'], evInt: 200 },
  }, "a skin with a B-30 row in SR.tuning.duel gets its mode, beats, need, options (labels mg.<skin>.<id>) and D (interrogation 200 + Heat) from it");
  const hint = await E(() => {
    const d = SR.reg.minigame.duel, rng = SR.rng.create(99), res = {};
    [0, 200, 600].forEach((int) => {
      let right = 0, wrongA = 0, n = 10000;
      for (let i = 0; i < n; i++) { const s = d.drawStance(rng, int); if (s.right) right++; else if (s.hint === d.opts({}).stances[(d.opts({}).stances.indexOf(s.stance) + 1) % 3]) wrongA++; }
      res[int] = { rate: right / n, p: d.hintP(int), wrongSplit: wrongA / Math.max(1, n - right) };
    });
    return res;
  });
  T.ok([0, 200, 600].every((i) => Math.abs(hint[i].rate - hint[i].p) < 0.02) && hint[0].p === 0.5 && hint[200].p === 0.7 && hint[600].p === 0.95,
    'the hint is right with p = min(0.95, 0.5 + INT/1000) (10⁴ draws each at INT 0 / 200 / 600, ±2 %)', hint);
  T.ok([0, 200].every((i) => Math.abs(hint[i].wrongSplit - 0.5) < 0.03), 'a wrong hint names either other stance evenly', hint);
  await start('test_debate', {}, { stats: { int: 220, cha: 100, str: 60 } });
  dp = await peek();
  const hinted = dp.cur.hint;
  const expectD = await E((h) => ['int', 'cha', 'str'].map((s) => 500 * SR.reg.minigame.duel.factor(s, h)), hinted);
  T.eq(dp.cur.options.map((o) => o.D), expectD, 'shown D is halved or doubled for the hinted stance (' + hinted + ')');
  await shot('duel-debate-stance');
  for (let guard = 0; guard < 6; guard++) {
    dp = await peek();
    if (!dp || dp.phase === 'done') break;
    if (dp.phase === 'choose') await t.clickUI('mg-duel-opt-1');
    if (guard === 0) { await step(1); await shot('duel-debate-reveal'); }
    await step(70);
  }
  r = await untilDone();
  T.ok(r.result.beats.length === 3 && Array.isArray(r.result.stances) && r.result.stances.length === 3 && r.result.picks.every((x) => x === 'facts'),
    'a stance duel plays all 3 beats and reports the stances', r.result);
  T.ok(await E(() => window.__count('mg.frame.duel.hint') >= 3 && window.__count('mg.frame.duel.reveal') === 3), '#aria reads the hint and reveals each stance');

  // ------------------------------------------------------------------------------------------
  T.section('Duel · cards (boardroom) · gamepad');
  await start('test_boardroom', {}, { stats: { int: 220, cha: 100, str: 60 } });
  dp = await peek();
  T.ok(dp.cur.options.every((o) => typeof o.ev === 'number'), 'cards carry each option\'s expected m change', dp.cur.options);
  T.ok(await E(() => /EV/.test(document.querySelector('[data-id="mg-duel-card"]').textContent)), 'INT ≥ 200 shows the EV chips');
  await shot('duel-boardroom-cards');
  for (let guard = 0; guard < 6; guard++) {
    dp = await peek();
    if (!dp || dp.phase === 'done') break;
    if (dp.phase === 'choose') { await padPress(13); await padPress(0); }
    await step(70);
  }
  r = await untilDone();
  T.ok(r.result.beats.length === 3 && typeof r.result.sum === 'number' && r.result.m === Math.round(Math.min(1.3, Math.max(0.7, 1 + r.result.sum)) * 100) / 100,
    'boardroom adds sum and m = clamp(1 + sum, 0.7, 1.3)', r.result);
  T.eq(r.result.picks, ['bold', 'bold', 'ruthless'], 'D-pad down and A pick the second option of each card');
  const noEv = await E(() => { SR.state = window.sheet.fakeState({ stats: { int: 150 } }); window.sheet.run('test_boardroom'); window.sheet.step(1); const txt = document.querySelector('[data-id="mg-duel-card"]').textContent; return txt; });
  T.ok(!/EV/.test(noEv), 'below INT 200 the EV stays hidden');
  await t.clickUI('mg-exit');
  await t.clickUI('mg-panel-leave');
  await untilDone(5);

  // ------------------------------------------------------------------------------------------
  T.section('Auto samples (10⁴ seeded runs)');
  const duelAuto = await E(() => {
    const st = window.sheet.fakeState({ stats: { str: 30, cha: 100, int: 20 } });
    const params = { mode: 'plain', beats: 3, bestOf: true, D: 60, check: 'holdup.store',
      options: [{ id: 'a', stat: 'str' }, { id: 'b', stat: 'cha' }, { id: 'c', stat: 'int' }] };
    const p = Math.max.apply(null, ['str', 'cha', 'int'].map((s) => SR.minigame.chance(st.stats[s], 60, { s: st, checkId: 'holdup.store.' + s })));
    const analytic = p * p * (3 - 2 * p);
    const rng = SR.rng.create(2024);
    let wins = 0, allB = true;
    const n = 10000;
    for (let i = 0; i < n; i++) { const r = SR.minigame.auto('duel', params, rng, st); if (r.wins >= 2) wins++; if (!r.picks.every((x) => x === 'b')) allB = false; }
    return { p, analytic, rate: wins / n, allB };
  });
  T.ok(Math.abs(duelAuto.p - 0.625) < 1e-9 && Math.abs(duelAuto.rate - duelAuto.analytic) <= 0.02 && duelAuto.allB,
    'Duel Auto (best shown odds, rolled): win rate within ±2 % of p²(3 - 2p) = ' + duelAuto.analytic.toFixed(4), duelAuto);
  const stanceAuto = await E(() => {
    const d = SR.reg.minigame.duel;
    const st = window.sheet.fakeState({ stats: { str: 60, cha: 100, int: 220 } });
    const params = { mode: 'stance', beats: 3, D: 500, check: 'duel.debate' };
    const o = d.opts(params), stats = ['int', 'cha', 'str'], hp = d.hintP(220);
    const ch = (s, D) => SR.minigame.chance(st.stats[s], D, { s: st, checkId: 'duel.debate.' + s });
    let q = 0;
    o.stances.forEach((stance) => {
      o.stances.forEach((hint) => {
        const w = hint === stance ? hp : (1 - hp) / 2;
        let best = 0, bp = -1;
        stats.forEach((s, k) => { const v = ch(s, 500 * d.factor(s, hint)); if (v > bp) { bp = v; best = k; } });
        q += (1 / 3) * w * ch(stats[best], 500 * d.factor(stats[best], stance));
      });
    });
    const rng = SR.rng.create(31337), n = 10000;
    let beatsWon = 0, twoPlus = 0;
    for (let i = 0; i < n; i++) { const r = SR.minigame.auto('duel', params, rng, st); beatsWon += r.wins; if (r.wins >= 2) twoPlus++; }
    return { q, rate: beatsWon / (3 * n), two: twoPlus / n, analyticTwo: 3 * q * q * (1 - q) + q * q * q };
  });
  T.ok(Math.abs(stanceAuto.rate - stanceAuto.q) <= 0.02 && Math.abs(stanceAuto.two - stanceAuto.analyticTwo) <= 0.02,
    'stance Duel Auto (best odds given the hint): per-beat and ≥ 2 wins rates within ±2 % of the analytic values', stanceAuto);
  const hot = await E(() => {
    const out = {};
    [250, 400, 700].forEach((int) => {
      const st = { stats: { int } }, rng = SR.rng.create(int);
      const arc = SR.reg.minigame.timingring.arcDeg(st, { mode: 'unlock' });
      let hits = 0, presses = 0, ok = true;
      for (let i = 0; i < 20000; i++) {
        const r = SR.minigame.auto('timingring', { mode: 'unlock' }, rng, st);
        hits += r.hits; presses += r.hits + r.misses;
        if (r.started !== (r.hits >= 3) || !(r.hits >= 3 || r.misses >= 3)) ok = false;
      }
      out[int] = { arc, want: arc / 360, rate: hits / presses, ok };
    });
    return out;
  });
  T.ok([250, 400, 700].every((i) => Math.abs(hot[i].rate - hot[i].want) < 0.005 && hot[i].ok) && hot[700].arc === 70,
    'hotwire Auto: each press hits with p = arc / 360° (2 × 10⁴ rounds at INT 250 / 400 / 700)', hot);
  const autos = await E(() => [
    SR.minigame.auto('test_orderup', {}, SR.rng.create(1)), SR.minigame.auto('test_sortit', {}, SR.rng.create(1)), SR.minigame.auto('test_pitch', {}, SR.rng.create(1)),
  ]);
  T.eq(autos, [{ m: 1, hits: 0, misses: 0, auto: true }, { m: 1, hits: 0, misses: 0, auto: true }, { m: 1, hits: 0, misses: 0, auto: true }], 'Shift Rush and pitch Auto return m = 1.0 exactly (not a sample)');
  const draws = await E(() => { const a = SR.rng.rules.state().join(); SR.minigame.auto('test_holdup', {}); return a !== SR.rng.rules.state().join(); });
  T.ok(draws, 'Auto draws from SR.rng.rules by default');
  await start('test_debate', { auto: true });
  T.ok((await cur()).replaying, 'params.auto opens the frame straight into the Auto replay');
  r = await untilDone();
  T.ok(r.result.auto === true && r.result.beats.length === 3, 'the replayed Auto result resolves the run', r.result);

  // ------------------------------------------------------------------------------------------
  T.section('tuning rows (W1-M request 4, CONTRACT D55)');
  // The engines read jobs.hustle.orderup.items, jobs.hustle.sortit.{streak, travelSec},
  // street.junker.ring.arc and world.assist through SR.minigame.tune; a planted table flows through.
  const tu = await E(() => {
    const SRx = SR.reg.minigame.shiftrush, TR = SR.reg.minigame.timingring;
    const pick = (o, ks) => ks.reduce((a, k) => { a[k] = o[k]; return a; }, {});
    const read = () => ({
      tickets: pick(SRx.opts({}), ['itemsMin', 'itemsMax', 'assistSpeed']),
      belt: pick(SRx.opts({ mode: 'conveyor' }), ['streakStep', 'streakMax', 'streakEvery', 'travelFrom', 'travelTo']),
      mult4: SRx.streakMult({ mode: 'conveyor' }, 4),
      arc: TR.opts({ mode: 'unlock' }).arc,
      arc300: TR.arcDeg({ stats: { int: 300 } }, { mode: 'unlock' }),
      assist: pick(TR.opts({}), ['assistSpeed', 'assistArc']),
      consts: [SRx.ASSIST_SPEED, TR.ASSIST_SPEED, TR.ASSIST_ARC],
    });
    const now = read();
    const rows = { items: SR.tuning.jobs.hustle.orderup.items, streak: SR.tuning.jobs.hustle.sortit.streak, travel: SR.tuning.jobs.hustle.sortit.travelSec,
      arc: SR.tuning.street.junker.ring.arc, assist: SR.tuning.world.assist };
    const saved = SR.tuning;
    SR.tuning = JSON.parse(JSON.stringify(saved));
    const TU = SR.tuning;
    TU.jobs.hustle.orderup.items = [3, 4];
    TU.jobs.hustle.sortit.streak = { step: 0.2, max: 1.4, every: 2 };
    TU.jobs.hustle.sortit.travelSec = [4, 3];
    TU.street.junker.ring.arc = { base: 30, perInt: 0.1, from: 100, min: 10, max: 60 };
    TU.world.assist = { speed: 0.5, sweet: 2, wobble: 0.5 };
    let planted;
    try { planted = read(); } finally { SR.tuning = saved; }
    return { now, rows, planted };
  });
  T.eq([tu.now.tickets.itemsMin, tu.now.tickets.itemsMax], tu.rows.items, 'Shift Rush tickets list jobs.hustle.orderup.items (2-5)');
  T.eq([tu.now.belt.streakStep, tu.now.belt.streakMax, tu.now.belt.streakEvery, tu.now.belt.travelFrom, tu.now.belt.travelTo],
    [tu.rows.streak.step, tu.rows.streak.max, tu.rows.streak.every, tu.rows.travel[0], tu.rows.travel[1]], 'the belt reads jobs.hustle.sortit.streak and .travelSec');
  T.eq(tu.now.arc, { stat: 'int', base: tu.rows.arc.base, per: tu.rows.arc.perInt, from: tu.rows.arc.from, min: tu.rows.arc.min, max: tu.rows.arc.max }, 'the hotwire arc reads street.junker.ring.arc');
  T.eq([tu.now.tickets.assistSpeed, tu.now.assist.assistSpeed, tu.now.assist.assistArc, tu.now.consts], [tu.rows.assist.speed, tu.rows.assist.speed, tu.rows.assist.sweet,
    [tu.rows.assist.speed, tu.rows.assist.speed, tu.rows.assist.sweet]], 'Assist reads world.assist (speed, sweet)');
  T.eq(tu.planted, {
    tickets: { itemsMin: 3, itemsMax: 4, assistSpeed: 0.5 },
    belt: { streakStep: 0.2, streakMax: 1.4, streakEvery: 2, travelFrom: 4, travelTo: 3 },
    mult4: 1.4,
    arc: { stat: 'int', base: 30, per: 0.1, from: 100, min: 10, max: 60 },
    arc300: 50,
    assist: { assistSpeed: 0.5, assistArc: 2 },
    consts: [0.5, 0.5, 2],
  }, 'a planted table flows into both engines (items, streak, belt, arc clamp(30 + (300 - 100) × 0.1, 10, 60) = 50°, Assist)');

  // ------------------------------------------------------------------------------------------
  T.section('review probes: contexts, overlays, removal, check ids, grading');
  const ctxNames = await E(() => {
    const out = {};
    ['test_sortit', 'test_holdup', 'test_debate', 'test_hotwire'].forEach((id) => {
      SR.state = window.sheet.fakeState({});
      window.sheet.run(id, {});
      window.sheet.step(1);
      out[id] = SR.input.contexts().slice(-1)[0];
      window.sheet.step(0);
      SR.minigame.current().host.finish(null);
      window.sheet.step(200);
    });
    return out;
  });
  T.eq(ctxNames, { test_sortit: 'orderup', test_holdup: 'duel', test_debate: 'duel', test_hotwire: 'timingring' },
    'every skin of an engine shares its context (Shift Rush: orderup; the others: the engine id)');
  // A minigame:done listener may open the next round at once (the frame is gone by then).
  const chained = await E(async () => {
    SR.state = window.sheet.fakeState({});
    let second = null;
    const off = SR.events.on('minigame:done', () => { off(); second = SR.minigame.run('test_pitch', {}).then((x) => x, (e) => 'rejected: ' + e.message); });
    window.sheet.run('test_hotwire', {});
    window.sheet.step(1);
    SR.minigame.current().host.finish({ started: true, hits: 3, misses: 0 });
    window.sheet.step(200);
    const open = SR.minigame.current() && SR.minigame.current().skin;
    SR.minigame.current().host.finish({ m: 1, hits: 2, misses: 3 });
    window.sheet.step(200);
    return { open, second: await second, stack: SR.scenes.stack() };
  });
  T.eq(chained, { open: 'test_pitch', second: { m: 1, hits: 2, misses: 3 }, stack: ['sheet'] }, 'a minigame:done listener can open the next round right away');
  // A non-blocking overlay over the frame: the round freezes and the frame (not the overlay) pops.
  const covered = await E(() => {
    if (!SR.reg.scene.probe_over) SR.scenes.register('probe_over', { kind: 'overlay' });
    SR.state = window.sheet.fakeState({});
    window.sheet.run('test_orderup', {});
    window.sheet.step(10);
    const t0 = window.sheet.peek().t;
    SR.scenes.push('probe_over');
    window.sheet.step(180);
    const t1 = window.sheet.peek().t;
    const ctxWhile = SR.input.contexts().slice();
    SR.minigame.current().host.finish({ m: 1.1, hits: 5, misses: 1 });
    window.sheet.step(200);
    const stackWhile = SR.scenes.stack();
    SR.scenes.pop();
    window.sheet.step(200);
    return { frozen: t1 === t0, ctxWhile, stackWhile, stackAfter: SR.scenes.stack(), last: window.sheet.last };
  });
  T.ok(covered.frozen && covered.ctxWhile.indexOf('orderup') < 0, 'an overlay over the frame freezes its timers and takes its keys back', covered);
  T.eq(covered.stackWhile, ['sheet', 'minigame', 'probe_over'], 'a round that ends while covered does not pop the overlay above it');
  await E(() => new Promise((r) => setTimeout(r, 0)));
  T.ok((await last()).done && (await last()).result.m === 1.1 && covered.stackAfter.join() === 'sheet', 'it closes once it is on top again and resolves the run', await last());
  // Removed by SR.scenes.go: the run resolves with the forfeit and minigame:done still fires.
  const removed = await E(async () => {
    window.__done.length = 0;
    SR.state = window.sheet.fakeState({});
    window.sheet.run('test_holdup', { stake: 250 });
    window.sheet.step(2);
    SR.scenes.go('sheet');
    await new Promise((r) => setTimeout(r, 0));
    return { last: window.sheet.last, done: window.__done.slice(), cur: SR.minigame.current() };
  });
  T.ok(removed.last.done && removed.last.result.exited === true && removed.last.result.losses === 2 && removed.cur === null,
    'SR.scenes.go removing the frame resolves the run with the forfeit', removed.last);
  T.eq(removed.done.map((d) => [d.id, d.skin, d.result.losses]), [['duel', 'test_holdup', 2]], '... and emits minigame:done');
  // finish() without a result counts as leaving.
  await start('test_hotwire', {}, { stats: { int: 250 } });
  await E(() => SR.minigame.current().host.finish(undefined));
  r = await untilDone();
  T.eq(r.result, { started: false, hits: 0, misses: 0, exited: true }, 'finish(undefined) resolves with the forfeit, never undefined');
  // B-28b check ids by skin, and a { base, perHeat } D from the run params.
  const checks = await E(() => {
    const d = SR.reg.minigame.duel;
    const relaxed = window.sheet.fakeState({ difficulty: 'relaxed', stats: { cha: 100 } });
    const R = d.newRound(relaxed, { skin: 'holdup', D: 60 });
    const cur = d.begin(R, SR.rng.create(3));
    const had = SR.features.perks;
    SR.debug.feature('perks', true);
    const fan = window.sheet.fakeState({ stats: { cha: 10 } });
    fan.perks.owned.push('crowdPleaser');
    const tr = d.newRound(fan, { skin: 'tourhook' });
    const tcur = d.begin(tr, SR.rng.create(3));
    SR.debug.feature('perks', !!had);
    const heat = d.newRound(window.sheet.fakeState({ stats: { heat: 30 } }), { skin: 'holdup', D: { base: 60, perHeat: 1 } });
    return {
      prefixes: [d.opts({ skin: 'holdup' }).check, d.opts({ skin: 'holdup', target: 'bank' }).check, d.opts({ skin: 'tourhook' }).check,
        d.opts({ skin: 'debate' }).check, d.opts({ skin: 'holdup', check: 'x.y' }).check],
      relaxedCha: cur.options.filter((o) => o.stat === 'cha')[0].p,
      tour: tcur.options.map((o) => o.p),
      heatD: d.begin(heat, SR.rng.create(1)).options[0].D,
    };
  });
  T.eq(checks.prefixes, ['holdup.store', 'holdup.bank', 'tour.hook', 'duel.debate', 'x.y'], 'default check ids follow B-28b: holdup.store / holdup.bank (params.target), tour.hook, duel.<skin>');
  T.ok(Math.abs(checks.relaxedCha - (100 / 160 + 0.10)) < 1e-9, 'so Relaxed adds +0.10 to a hold-up beat without a check param', checks);
  T.eq(checks.tour, [1, 1, 1], 'and Crowd Pleaser makes every tour-hook option certain');
  T.eq(checks.heatD, 90, 'a { base, perHeat } D in the run params reads Heat (60 + 30)');
  // Shift Rush m is B-05's formula exactly (no 0.01 rounding: 0.775 stays 0.775).
  const grades = await E(() => [[1, 0], [3, 0], [3, 2], [5, 1], [7, 0], [8, 0], [0, 3]].map(([c, w]) => SR.reg.minigame.shiftrush.grade({ mode: 'tickets' }, c, w)));
  T.eq(grades, [0.775, 0.925, 0.725, 0.975, 1.225, 1.3, 0.7], 'm = clamp(0.7 + 0.075 × correct - 0.1 × wrong, 0.7, 1.3) without rounding drift');
  // Sort It with the keyboard arrows.
  await start('test_sortit');
  for (let guard = 0; guard < 400; guard++) {
    const p = await peek();
    if (!p || p.done) break;
    if (p.front && p.front.p > 0.05) await key(['ArrowLeft', 'ArrowDown', 'ArrowRight'][p.front.bin]);
    await step(12);
  }
  r = await untilDone();
  T.ok(r.result.hits >= 15 && r.result.misses === 0 && r.result.m > 1, 'Sort It plays with ← ↓ → on the keyboard', r.result);
  // Esc when pause is remapped away from it: Esc (back) still opens and closes the pause panel.
  await E(() => SR.input.bind('pause', ['KeyP', 'Pad9']));
  await start('test_pitch');
  await key('Escape');
  const remapOpen = (await cur()).panel;
  await key('Escape');
  const remapClosed = (await cur()).panel;
  await key('KeyP');
  const pOpen = (await cur()).panel;
  await key('KeyP');
  await E(() => SR.input.bind('pause', null));
  T.eq([remapOpen, remapClosed, pOpen, (await cur()).panel], ['pause', null, 'pause', null], 'with pause remapped to P, Esc (back) and P each toggle the pause panel once');
  await t.clickUI('mg-exit');
  await untilDone(5);
  // Hotwire: "up to 5 presses" is B-26's 3 hits / 3 misses.
  const presses = await E(() => [SR.reg.minigame.timingring.opts({ mode: 'unlock' }).presses, SR.reg.minigame.timingring.opts({ mode: 'unlock', hits: 2, misses: 2 }).presses]);
  T.eq(presses, [5, 3], 'hotwire presses = hits + misses - 1 (5 from street.junker.ring)');
  // Hardcore: once decided, the real result replaces pending.worst in the ironman slot.
  await E(() => { window.__writes = []; window.__saveWrite = SR.save.write; SR.save.write = function (slot) { window.__writes.push({ slot, pending: JSON.parse(JSON.stringify(SR.state.pending)) }); }; });
  await start('test_holdup', { stake: 250, resolve: 'store.rob:resolve' }, { difficulty: 'hardcore' });
  await E(() => SR.minigame.current().host.finish({ beats: [true, true], wins: 2, losses: 0, picks: ['outwit', 'outwit'] }));
  const settled = await E(() => ({ writes: window.__writes.slice(), finished: SR.minigame.current().finished }));
  await untilDone();
  await E(() => { SR.save.write = window.__saveWrite; });
  T.ok(settled.finished && settled.writes.length === 2 && settled.writes[0].pending.worst.losses === 2 && settled.writes[1].pending.worst.wins === 2,
    'Hardcore: the decided result replaces pending.worst (a tab closed during the banner keeps the win)', settled.writes);
  // Key glyphs without W1-D's KeyHint come from the key.* strings, not hard-coded English.
  const glyphs = await E(() => {
    const kh = SR.ui.keyHint;
    SR.ui.keyHint = null;
    const out = ['Escape', 'Pad8', 'Mouse0', 'Digit3', 'ArrowLeft'].map((c) => SR.minigame.glyph(c));
    SR.ui.keyHint = kh;
    return { out, want: [SR.text('key.esc'), SR.text('key.pad.xbox.8'), SR.text('key.mouseLeft'), '3', '←'] };
  });
  T.eq(glyphs.out, glyphs.want, 'glyph fallbacks use the key.* text keys');

  // ------------------------------------------------------------------------------------------
  T.section('frame layout and accessibility');
  await start('test_holdup', { stake: 250 });
  const layout = await E(() => {
    const q = (id) => { const r = document.querySelector('[data-id="' + id + '"]').getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom)]; };
    const mirror = document.querySelector('[data-id="mg-mirror"]');
    return { top: q('mg-top'), area: q('mg-area'), bottom: q('mg-bottom'), touch: getComputedStyle(document.querySelector('[data-id="mg-area"]')).touchAction,
      mirror: mirror.textContent, frameRole: document.querySelector('[data-id="mg-frame"]').getAttribute('role') };
  });
  T.eq([layout.top, layout.area, layout.bottom], [[0, 64], [64, 640], [640, 720]], 'UI §2.2: top bar 0-64, play area 64-640, bottom bar 640-720');
  T.eq(layout.touch, 'none', 'the play area has touch-action: none');
  T.ok(await E((m) => window.__re('mg.frame.duel.scoreMirror').test(m), layout.mirror), 'the visually hidden mirror carries the state as text', layout.mirror);
  await t.clickUI('mg-exit');
  await t.clickUI('mg-panel-leave');
  await untilDone(5);
  T.eq(t.errors(), [], 'sheet: zero console errors, page errors and failed requests');
  const warns = t.warnings().filter((w) => /mg\./.test(w) && !/mg\.test\./.test(w));
  T.eq(warns, [], 'sheet: no missing mg.* text warnings');
  await t.close();

  // ------------------------------------------------------------------------------------------
  T.section('touch (a coarse-pointer page)');
  const tt = await h.open({ url: SHEET, touch: true });
  await install(tt.page);
  await tt.page.evaluate(() => document.body.classList.add('shot'));
  const TE = (fn, arg) => tt.page.evaluate(fn, arg);
  const tstep = (n) => TE((n) => window.sheet.step(n), n);
  const tstart = (id, params, st) => TE(([id, params, st]) => { SR.state = window.sheet.fakeState(st || {}); window.sheet.run(id, params || {}); window.sheet.step(1); }, [id, params || {}, st || {}]);
  const tdone = async () => { for (let i = 0; i < 600; i++) { const r = await TE(() => window.sheet.last); if (r.done) return r; await tstep(10); } return TE(() => window.sheet.last); };
  const tap = (x, y) => tt.page.touchscreen.tap(x, y);
  // Shift Rush: tap the bins and Serve
  await tstart('test_orderup');
  for (let n = 0; n < 2; n++) {
    const p = await TE(() => window.sheet.peek());
    for (const b of p.ticket) { const r = p.rects.bins[b]; await tap(r.x + r.w / 2, AREA_Y + r.y + r.h / 2); }
    await tap(p.rects.serve.x + 40, AREA_Y + p.rects.serve.y + 40);
    await tstep(400);
  }
  const tdev = await TE(() => SR.minigame.current().device);
  const thints = await TE(() => document.querySelector('[data-id="mg-hints"]').textContent);
  await tt.shot(path.join(SHOTS, 'touch-shiftrush.png'));
  let tr = await tdone();
  T.ok(tr.result.hits >= 2 && tdev === 'touch', 'taps on the bins and Serve play Shift Rush', { r: tr.result, tdev });
  T.ok(thints.indexOf(await TE(() => SR.text('mg.frame.sr.tapBins'))) >= 0 && !/1-6/.test(thints), 'touch shows tap hints, no key glyphs', thints);
  // Timing Ring: tap the play area in the arc
  await tstart('test_hotwire', {}, { stats: { int: 300 } });
  for (let i = 0; i < 3; i++) {
    await TE(() => { for (let k = 0; k < 600; k++) { const p = window.sheet.peek(); if (window.__inArc(p, 3)) return; window.sheet.step(1); } });
    await tap(300, AREA_Y + 300);
    await tstep(12);
  }
  // the result banner: a tap skips it
  await tstep(2);
  const bannerUp = await TE(() => SR.minigame.current() && SR.minigame.current().finished);
  await tap(640, 300);
  tr = await TE(() => window.sheet.last);
  T.ok(bannerUp && tr.done && tr.result.started === true && tr.result.hits === 3, 'taps in the arc start the car; a tap skips the result banner', tr);
  // Duel: tap the options
  await tstart('test_holdup', { stake: 250 });
  for (let guard = 0; guard < 6; guard++) {
    const dp2 = await TE(() => window.sheet.peek());
    if (!dp2 || dp2.phase === 'done') break;
    if (dp2.phase === 'choose') await tt.page.locator('[data-id="mg-duel-opt-3"]').tap();
    if (guard === 0) await tt.shot(path.join(SHOTS, 'touch-duel.png'));
    await tstep(70);
  }
  tr = await tdone();
  T.ok(tr.result.picks.every((x) => x === 'outwit') && (tr.result.wins === 2 || tr.result.losses === 2), 'tapping an option plays the Duel', tr.result);
  T.eq(tt.errors(), [], 'touch page: zero console errors');
  await tt.close();

  // ------------------------------------------------------------------------------------------
  T.section('the real page (index.html)');
  const g = await h.open();
  T.eq(g.errors(), [], 'index.html boots with zero console errors');
  const gp = g.page;
  const ring = await gp.evaluate(() => {
    SR.def.skin('test_ring', { engine: 'timingring', params: { mode: 'grade' } });
    // A spy on the held duck (ART_AUDIO §13.4, W1-S request 6): SR.audio.duck(6, Infinity) while
    // the frame is open, released when it closes.
    window.__ducks = [];
    const duck = SR.audio.duck;
    SR.audio.duck = function (db, ms) {
      const e = { db, ms: ms === Infinity ? 'Infinity' : ms, released: false };
      window.__ducks.push(e);
      const rel = duck.apply(this, arguments);
      return function () { e.released = true; return rel.apply(this, arguments); };
    };
    window.__res = null;
    SR.minigame.run('test_ring').then((r) => { window.__res = r; });
    return { stack: SR.scenes.stack(), ctx: SR.input.contexts() };
  });
  T.eq(ring.stack.slice(-1), ['minigame'], 'a Timing Ring test skin opens the minigame scene over the title');
  T.eq(ring.ctx.slice(-1), ['timingring'], 'with its context map pushed');
  T.eq(await gp.evaluate(() => window.__ducks), [{ db: 6, ms: 'Infinity', released: false }], 'a game without its own song ducks the song below 6 dB, held while the frame is open');
  for (let i = 0; i < 5; i++) {
    await gp.evaluate(() => { for (let k = 0; k < 600; k++) { const c = SR.minigame.current(); const p = c.inst.peek(); const d = Math.abs(((p.angle - p.arcC) % 360 + 360) % 360); if (Math.min(d, 360 - d) < p.width / 2 - 3) return; SR.loop.step(1); } });
    await gp.keyboard.press('Space');
    await gp.evaluate(() => SR.loop.step(12));
  }
  await g.shot(path.join(SHOTS, 'index-timingring.png'));
  await gp.evaluate(() => SR.loop.step(120));
  const gres = await gp.evaluate(() => ({ r: window.__res, stack: SR.scenes.stack(), ctx: SR.input.contexts() }));
  T.eq(gres.r, { m: 1.3, hits: 5, misses: 0 }, 'Space presses the ring on the real page (m = 1.3)');
  T.ok(gres.stack.indexOf('minigame') < 0 && gres.ctx.indexOf('timingring') < 0, 'the frame closes and pops its context');
  T.eq(await gp.evaluate(() => window.__ducks), [{ db: 6, ms: 'Infinity', released: true }], 'closing the frame releases its duck');
  const own = await gp.evaluate(() => {
    SR.def.skin('test_ring_song', { engine: 'timingring', music: 'paper_sky', params: { mode: 'grade' } });
    window.__ducks.length = 0;
    SR.minigame.run('test_ring_song', { auto: true });
    for (let k = 0; k < 600 && SR.minigame.current(); k++) SR.loop.step(1);
    return { ducks: window.__ducks.slice(), open: !!SR.minigame.current() };
  });
  T.eq(own, { ducks: [], open: false }, 'a game with its own song switches to it and does not duck');
  // W2-Civic request 5: closing a game with its own song inside a building plays the building's
  // song as the building scene would, the named fn music.<building> first ({ id, variant }).
  const below = await gp.evaluate(() => {
    SR.debug.newGame({ seed: 5 });
    SR.debug.enter('mcsticks');
    SR.loop.step(2);
    const calls = [], music = SR.audio.music;
    SR.audio.music = function (id, opts) { calls.push([id, opts && opts.variant ? opts.variant : null]); return music.apply(this, arguments); };
    const had = SR.reg.fn['music.mcsticks'];
    const run = (label) => {
      calls.length = 0;
      SR.minigame.run('test_ring_song', { auto: true });
      for (let k = 0; k < 600 && SR.minigame.current(); k++) SR.loop.step(1);
      return { label, top: SR.scenes.top().id, calls: calls.slice() };
    };
    const plain = run('def.music');
    SR.reg.fn['music.mcsticks'] = function () { return { id: 'paper_sky', variant: 'qaVariant' }; };
    const viaFn = run('music.mcsticks');
    if (had === undefined) delete SR.reg.fn['music.mcsticks']; else SR.reg.fn['music.mcsticks'] = had;
    SR.audio.music = music;
    return { plain, viaFn, song: SR.reg.building.mcsticks.music };
  });
  T.ok(below.plain.top === 'building' && below.plain.calls.length === 2 && below.plain.calls[1][0] === below.song,
    'closing a game with its own song in McSticks plays the building\'s song again', below.plain);
  T.eq(below.viaFn.calls[1], ['paper_sky', 'qaVariant'], 'a building with a music.<building> fn gets the fn\'s song and variant back (as on entering)');
  // Blackjack between hands: nothing is at stake, so Exit leaves at once (W2-Night request 7; a hand
  // out still asks: tests/e2e/casino.test.cjs).
  const bj = await gp.evaluate(async () => {
    SR.debug.newGame({ seed: 6 });
    SR.state.money.cash = 500;
    let res = null;
    SR.minigame.run('blackjack', {}).then((r) => { res = r; });
    SR.loop.step(2);
    const c = SR.minigame.current();
    const out = { phase: c && c.inst.peek().phase, risk: c && c.inst.exitRisk() };
    document.querySelector('[data-id="mg-exit"]').click();
    SR.loop.step(2);
    out.panel = SR.minigame.current() ? SR.minigame.current().panel : 'closed';
    for (let k = 0; k < 200 && SR.minigame.current(); k++) SR.loop.step(1);
    out.open = !!SR.minigame.current();
    await new Promise((ok) => setTimeout(ok, 0));   // run()'s promise settles after the frame closes
    out.exited = !!(res && res.exited);
    return out;
  });
  T.eq(bj, { phase: 'bet', risk: false, panel: 'closed', open: false, exited: true }, 'blackjack between hands: Exit leaves at once, without the "counts as a loss" question');
  T.eq(g.errors(), [], 'index.html: zero console errors after a round');
  await g.close();

  T.done();
})().catch((e) => { console.error(e); process.exit(1); });
