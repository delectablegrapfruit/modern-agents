// Autopilot: plays levels with the real game code, moving only by dragging the maze (the input's takeGrab), along the
// route the level generator says solves the level: fetching keys before their doors, pressing switches, riding moving
// platforms, stepping through portals, holding back on ice, taking an item box's item and using it (a Magic carpet or
// a Launch across a gap, Shrink for a shrink gate), and in the Gauntlet timing its way past the cyclone stones. Proves every level can be finished inside its time limit
// without a single touch of the edge, and shows how par compares with a steady run that knows the way.
//
//   node tests/autopilot.js                    levels 1-25
//   node tests/autopilot.js 1-60               a range
//   node tests/autopilot.js 7,12,30            a list
//   node tests/autopilot.js 1-20 --gauntlet=hard/random/seed-7   Gauntlet depths instead (difficulty/style/seed)
//   --strict                                   exit 1 unless every one is finished (CI)
//   --speed=140                                drag speed, world units per second
//   APDEBUG=1                                  on a failure, print where it happened and the last frames
//
// Needs Playwright with Chromium (npm i -D playwright && npx playwright install chromium). Opens the game from file://.
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (e2) { console.error('Playwright is not installed.'); process.exit(2); }
}
const args = process.argv.slice(2);
const strict = args.includes('--strict');
const speedArg = args.find((a) => a.startsWith('--speed='));
const speed = speedArg ? Number(speedArg.slice(8)) : 140;
const gArg = args.find((a) => a.startsWith('--gauntlet='));
const gauntlet = gArg ? (([diff, style, seed]) => ({ diff: diff || 'normal', style: style || 'progressive', seedText: seed || 'autopilot' }))(gArg.slice(11).split('/')) : null;
const arg = args.find((a) => !a.startsWith('--')) || '1-25';
const levels = arg.includes('-') ? (([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i))(arg.split('-').map(Number)) : arg.split(',').map(Number);
if (!levels.length || levels.some((l) => !(l >= 1)) || !(speed > 0)) { console.error('Usage: node tests/autopilot.js [1-25 | 3,7,12] [--strict] [--speed=140] [--gauntlet=normal/progressive/seed]'); process.exit(2); }

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  let errors = 0;
  page.on('pageerror', (e) => { errors++; console.log('pageerror', e.message); });
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await page.waitForFunction(() => window.MZ && MZ.Game && MZ.Game.state === 'menu');
  await page.evaluate(([speed, trace]) => {
    window.AP_TRACE = trace;
    const G = MZ.Game, S = MZ.Save.settings, step = G.frame.bind(G);
    G.frame = () => {}; // the page's own loop stops; we step the game by hand, fast
    G.draw = () => {};
    S.gameplay.rule = 'normal';
    S.gameplay.timer = true;
    S.gameplay.boxes = false; // items would only muddy the proof
    S.controls.invert = false;
    const AP = (window.AP = { outcome: null, want: null, trace: !!window.AP_TRACE });
    const win = G.win;
    G.win = function () { if (!AP.outcome) AP.outcome = 'win'; return win.apply(this, arguments); };
    G.on('lose', (reason) => { if (!AP.outcome) AP.outcome = reason === 'fall' ? 'edge' : reason; });
    G.on('hit', () => { if (!AP.outcome) AP.outcome = 'edge'; }); // a single touch of the edge counts: the route must be clean
    // The only input: finger travel in screen pixels. AP.want is this frame's wanted move in world units; on ice the
    // drag is chosen so that the drifting movement comes out exactly as wanted.
    G.input.vector = () => ({ x: 0, y: 0 });
    G.input.takeGrab = () => {
      const w = AP.want;
      if (!w) return { x: 0, y: 0 };
      let mx = w.x, my = w.y;
      const dt = AP.dt, q = G.world.query(G.ball.x, G.ball.y, G.playT);
      if (q.seg && q.seg.ice && dt > 0 && !(G.fx.carpet > 0) && !G.fx.launch) { // (floating or flying, ice doesn't drift you)
        const a = 1 - Math.exp(-dt * G.ICE_GRIP), v = G.vel;
        mx = dt * (v.x + (w.x / dt - v.x) / a); my = dt * (v.y + (w.y / dt - v.y) / a);
      }
      const sg = S.controls.invert !== G.mod('mirror') ? 1 : -1, k = Math.min(2, Math.max(0.5, S.controls.speed || 1)) / G.cam.zoom;
      return { x: mx / (sg * k), y: my / (sg * k) };
    };
    const HOLD = 24, MARGIN = 0.3; // wait this far before a vanishing bridge; cross only with this much time to spare
    AP.play = (start) => {
      start();
      AP.outcome = null;
      const m = G.maze, plan = [];
      for (const leg of m.route) {
        if (leg.type === 'walk') {
          const pts = [], cum = [], blinks = [];
          let acc = 0;
          for (const st of leg.steps) {
            const e = st.e, P = e.a === st.from ? e.pts : e.pts.slice().reverse(), s0 = acc;
            for (let k = pts.length ? 1 : 0; k < P.length; k++) {
              if (pts.length) acc += Math.hypot(P[k].x - pts[pts.length - 1].x, P[k].y - pts[pts.length - 1].y);
              pts.push(P[k]);
              cum.push(acc);
            }
            if (e.type === 'blink') blinks.push({ a: s0, b: acc, bl: e.blink });
          }
          plan.push({ type: 'path', pts, cum, blinks, len: acc });
        } else if (leg.type === 'ride') plan.push({ type: 'ride', mv: m.movers[leg.mover], phase: 'wait' });
        else if (leg.type === 'item') plan.push({ type: 'item', item: leg.item, t: 0 });
        else if (leg.type === 'cross') plan.push({ type: 'cross', item: leg.item, gap: m.gaps[leg.gap], phase: 'use' });
        else if (leg.type === 'shrink') plan.push({ type: 'shrink', phase: 'use' });
        else if (leg.type === 'warp') plan.push({ type: 'warp', to: m.portals[leg.portal].b });
      }
      // Cyclone stones: where each path comes within reach of one's sweep, and a check that going on now clears it.
      const stones = m.stones || [], REACH = G.box() * 0.55 + 6;
      const pointAt = (P, d) => { let i = 1; while (i < P.pts.length - 1 && P.cum[i] < d) i++; const f = Math.min(1, Math.max(0, (d - P.cum[i - 1]) / (P.cum[i] - P.cum[i - 1] || 1))); return { x: P.pts[i - 1].x + (P.pts[i].x - P.pts[i - 1].x) * f, y: P.pts[i - 1].y + (P.pts[i].y - P.pts[i - 1].y) * f }; };
      const toSweep = (q, st) => { let d = Infinity; for (let i = 1; i < st.path.length; i++) d = Math.min(d, Math.sqrt(MZ.segDist2(q.x, q.y, st.path[i - 1].x, st.path[i - 1].y, st.path[i].x, st.path[i].y))); return d; };
      for (const P of plan) {
        if (P.type !== 'path') continue;
        P.zones = [];
        for (const st of stones) {
          let a = -1;
          for (let d = 0; d <= P.len + 4; d += 4) {
            const near = d <= P.len && toSweep(pointAt(P, d), st) < st.r + REACH + 6;
            if (near && a < 0) a = d;
            if (!near && a >= 0) { P.zones.push({ a, b: Math.min(P.len, d) }); a = -1; }
          }
        }
        P.zones.sort((x, y) => x.a - y.a);
      }
      const clear = (P, s0, s1, t0) => { // moving from s0 to s1 at full speed from t0: never within reach of a stone
        for (let k = 0, d = s0; d <= s1 + 8; k++, d = s0 + speed * k / 60) {
          const q = pointAt(P, Math.min(P.len, d)), t = t0 + k / 60;
          for (const st of stones) { const c = MZ.stoneAt(st, t); if (Math.hypot(q.x - c.x, q.y - c.y) < st.r + REACH) return false; }
        }
        return true;
      };
      const dt = 1 / 60, frames = Math.ceil((m.timeLimit + 10) / dt);
      let pi = 0, s = 0, j = 0, wait = 0, done = 0;
      const at = (P, d) => {
        while (j + 2 < P.pts.length && P.cum[j + 1] < d) j++;
        const f = Math.min(1, Math.max(0, (d - P.cum[j]) / (P.cum[j + 1] - P.cum[j] || 1)));
        return { x: P.pts[j].x + (P.pts[j + 1].x - P.pts[j].x) * f, y: P.pts[j].y + (P.pts[j + 1].y - P.pts[j].y) * f };
      };
      const next = () => { pi++; s = 0; j = 0; };
      for (let f = 0; f < frames && !AP.outcome && G.state === 'play'; f++) {
        const b = G.ball, seg = plan[pi], after = plan[pi + 1];
        AP.dt = dt;
        AP.want = { x: 0, y: 0 }; // standing still means braking, on ice
        if (seg && seg.type === 'path' && after && after.type === 'warp' && Math.hypot(b.x - after.to.x, b.y - after.to.y) < 3) { pi += 2; s = 0; j = 0; continue; } // stepped into the portal
        if (seg && seg.type === 'path') {
          if (seg.pts.length < 2) { next(); continue; }
          const t = G.playT + dt; // the clock this step will see
          let nx = Math.min(seg.len, s + speed * dt);
          const z = seg.blinks.find((q) => q.b > s);
          if (z && s <= z.a) { // not on it yet: go only if it is up and stays up until we are across
            const ph = MZ.blinkPhase(z.bl, t), left = (z.bl.on - ph) * z.bl.period;
            if (!(ph < z.bl.on && (z.b - s) / speed + MARGIN < left)) nx = Math.min(nx, Math.max(s, z.a - HOLD));
          }
          const zs = seg.zones && seg.zones.find((q) => q.b > s);
          if (zs && s <= zs.a && nx > zs.a - 4 && !clear(seg, s, zs.b, t)) nx = Math.min(nx, Math.max(s, zs.a - 4)); // wait for the stone to go
          if (nx - s < speed * dt * 0.5) wait += dt;
          s = nx;
          const T = at(seg, s);
          AP.want = { x: T.x - b.x, y: T.y - b.y };
          if (s >= seg.len && Math.hypot(T.x - b.x, T.y - b.y) < 0.5) next();
        } else if (seg && seg.type === 'ride') { // wait at the corridor end, step on when it's in, ride, step off
          const mv = seg.mv, t = G.playT + dt, c = ((((t / mv.period + mv.phase) % 1) + 1) % 1) * mv.period, p = MZ.moverAt(mv, t);
          const go = (T) => { const d = Math.hypot(T.x - b.x, T.y - b.y), k = Math.min(1, (speed * dt) / (d || 1)); AP.want = { x: (T.x - b.x) * k, y: (T.y - b.y) * k }; return d < 0.5; };
          if (seg.phase === 'wait') { wait += dt; if (c < mv.pause && mv.pause - c > mv.r / speed + 0.35) seg.phase = 'board'; }
          if (seg.phase === 'board' && go(mv.a)) seg.phase = 'ride';
          if (seg.phase === 'ride') { wait += dt; if (p.k === 1) seg.phase = 'off'; }
          if (seg.phase === 'off' && go(mv.to)) next();
        } else if (seg && seg.type === 'warp') next();
        else if (seg && seg.type === 'item') { if (G.item === seg.item) next(); else if ((seg.t += dt) > 1) { AP.outcome = 'no ' + seg.item; } }
        else if (seg && seg.type === 'cross') { // use the item at the gap's near end, then straight across to its far end
          const T = seg.gap.b;
          if (seg.phase === 'use') { if (G.useItem()) seg.phase = 'go'; else AP.outcome = 'no ' + seg.item; }
          else {
            const d = Math.hypot(T.x - b.x, T.y - b.y), v = seg.item === 'launch' ? 420 : speed, k = Math.min(1, (v * dt) / (d || 1));
            AP.want = { x: (T.x - b.x) * k, y: (T.y - b.y) * k };
            if (d < 0.5 && !G.fx.launch) next(); // a Launch has to come down first
          }
        } else if (seg && seg.type === 'shrink') { // use Shrink and wait for the lightning to do its work
          if (seg.phase === 'use') { if (G.useItem()) seg.phase = 'wait'; else AP.outcome = 'no shrink'; }
          else { wait += dt; if (G.scale <= 0.5 + 1e-6) next(); }
        }
        const before = { x: b.x, y: b.y };
        step(dt);
        done = pi;
        if (AP.trace) { AP.log = AP.log || []; AP.log.push([f, pi, seg && seg.type, seg && seg.phase, seg && seg.mv && MZ.moverAt(seg.mv, G.playT).k.toFixed(2), Math.round(before.x), Math.round(before.y), AP.want && Math.round(AP.want.x) + ',' + Math.round(AP.want.y), Math.round(b.x), Math.round(b.y), G.world.query(b.x, b.y, G.playT).depth.toFixed(1)].join(' ')); if (AP.log.length > 12) AP.log.shift(); }
      }
      AP.want = null;
      const cur = plan[pi] || {}, bq = G.world.query(G.ball.x, G.ball.y, G.playT);
      AP.debug = { blinks: JSON.stringify((cur.blinks || []).map((z) => [Math.round(z.a), Math.round(z.b), z.bl.period.toFixed(2), z.bl.on.toFixed(2)])), segAt: (() => { const q = G.world.query(G.ball.x, G.ball.y, G.playT - 0.02); return q.seg ? [q.seg.blink ? 'blink' : '', q.seg.sw ? 'sw' : '', q.depth.toFixed(1)].join(' ') : 'none'; })(), leg: pi + '/' + plan.length + ' ' + cur.type, s: Math.round(s) + '/' + Math.round(cur.len || 0), ball: Math.round(G.ball.x) + ',' + Math.round(G.ball.y), depth: bq.depth.toFixed(1), dyn: !!(bq.seg && bq.seg.dyn), mover: cur.mv ? JSON.stringify(MZ.moverAt(cur.mv, G.playT)) + ' a=' + Math.round(cur.mv.a.x) + ',' + Math.round(cur.mv.a.y) : '', barred: G.maze && G.maze.doors.filter((d) => !d.open).length };
      const r = { stones: stones.length, level: m.level, boss: m.boss, layout: m.lattice + '/' + m.mask, mechs: (m.mechs || []).join('+') + (m.mods && m.mods.length ? ' [' + m.mods.join(',') + ']' : ''), outcome: AP.outcome || (G.state === 'play' ? 'stuck' : G.state), time: G.elapsed, par: m.parTime, limit: m.timeLimit, wait, progress: Math.round((100 * done) / Math.max(1, plan.length)) };
      G.quit();
      return r;
    };
  }, [speed, !!process.env.APDEBUG]);

  const results = [];
  const pad = (v, n) => String(v).padStart(n);
  console.log((gauntlet ? 'depth' : 'level') + '  result    time   par   diff  limit   wait  legs  mechanics');
  for (const L of levels) {
    const r = await page.evaluate(([L, gt]) => window.AP.play(() => {
      if (!gt) return MZ.Game.startJourney(L);
      MZ.Game.startGauntlet(gt);
      MZ.Game.run.cleared = L - 1;
      MZ.Game.nextGauntlet();
    }), [L, gauntlet]);
    r.n = L;
    results.push(r);
    const diff = r.time - r.par;
    if (process.env.APDEBUG && r.outcome !== 'win') console.log('   ', JSON.stringify(await page.evaluate(() => window.AP.debug)), '\n', (await page.evaluate(() => (window.AP.log || []).join('\n'))));
    console.log(pad(r.n, 5), ' ', r.outcome.padEnd(5), pad(r.time.toFixed(1) + 's', 7), pad(r.par + 's', 5), pad((diff >= 0 ? '+' : '') + diff.toFixed(1), 6), pad(r.limit + 's', 6), pad(r.wait.toFixed(1) + 's', 6), pad(r.progress + '%', 5), ' ', (r.boss ? 'BOSS ' : '') + (gauntlet ? 'L' + r.level + ' ' : '') + r.mechs + (r.stones ? ' +' + r.stones + ' stones' : '') + '  ' + r.layout);
  }
  const won = results.filter((r) => r.outcome === 'win');
  const underPar = won.filter((r) => r.time <= r.par).length;
  console.log(won.length + '/' + results.length + ' finished with no losses, ' + underPar + ' within par, at a steady ' + speed + ' units/s' + (errors ? ', ' + errors + ' page errors' : ''));
  await browser.close();
  if (strict && (won.length < results.length || errors)) process.exit(1);
})();
