// Autopilot: plays journey levels with the real game code, moving only by dragging the maze (the input's takeGrab),
// along the centre of each level's route at a steady drag speed. Proves every level can be finished inside its time
// limit without a single loss, and shows how par compares with a steady run that knows the way.
//
//   node tests/autopilot.js            levels 1-25
//   node tests/autopilot.js 1-40       a range
//   node tests/autopilot.js 7,12,30    a list
//   --strict                           exit 1 unless every level is finished (CI)
//   --speed=360                        drag speed, world units per second
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
const speed = speedArg ? Number(speedArg.slice(8)) : 360;
const arg = args.find((a) => !a.startsWith('--')) || '1-25';
const levels = arg.includes('-') ? (([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i))(arg.split('-').map(Number)) : arg.split(',').map(Number);
if (!levels.length || levels.some((l) => !(l >= 1)) || !(speed > 0)) { console.error('Usage: node tests/autopilot.js [1-25 | 3,7,12] [--strict] [--speed=360]'); process.exit(2); }

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  let errors = 0;
  page.on('pageerror', (e) => { errors++; console.log('pageerror', e.message); });
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await page.waitForFunction(() => window.MZ && MZ.Game && MZ.Game.state === 'menu');
  await page.evaluate((speed) => {
    const G = MZ.Game, S = MZ.Save.settings, step = G.frame.bind(G);
    G.frame = () => {}; // the page's own loop stops; we step the game by hand, fast
    G.draw = () => {};
    S.gameplay.rule = 'normal';
    S.gameplay.timer = true;
    S.controls.invert = false;
    const AP = (window.AP = { outcome: null, target: null });
    const win = G.win;
    G.win = function () { if (!AP.outcome) AP.outcome = 'win'; return win.apply(this, arguments); };
    G.on('lose', (reason) => { if (!AP.outcome) AP.outcome = reason === 'fall' ? 'edge' : reason; });
    // The only input: finger travel in screen pixels. The world follows the finger, so the player moves the other way.
    G.input.vector = () => ({ x: 0, y: 0 });
    G.input.takeGrab = () => {
      const b = G.ball, T = AP.target;
      if (!T) return { x: 0, y: 0 };
      const k = G.cam.zoom / Math.min(2, Math.max(0.5, S.controls.speed || 1));
      return { x: -(T.x - b.x) * k, y: -(T.y - b.y) * k };
    };
    const HOLD = 24, MARGIN = 0.3; // wait this far before a vanishing bridge; cross only with this much time to spare
    AP.play = (L) => {
      G.startJourney(L); // vanishing bridges run on G.playT, which every level starts at 0: every run is identical
      AP.outcome = null;
      const m = G.maze, pts = [], cum = [], blinks = [];
      let acc = 0;
      for (let i = 0; i + 1 < m.mainPath.length; i++) {
        const a = m.mainPath[i], b = m.mainPath[i + 1];
        const e = m.edges.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
        const P = e.a === a ? e.pts : e.pts.slice().reverse(), s0 = acc;
        for (let k = pts.length ? 1 : 0; k < P.length; k++) {
          if (pts.length) acc += Math.hypot(P[k].x - pts[pts.length - 1].x, P[k].y - pts[pts.length - 1].y);
          pts.push(P[k]);
          cum.push(acc);
        }
        if (e.type === 'blink') blinks.push({ a: s0, b: acc, bl: e.blink });
      }
      let j = 0;
      const at = (d) => {
        while (j + 2 < pts.length && cum[j + 1] < d) j++;
        const f = Math.min(1, Math.max(0, (d - cum[j]) / (cum[j + 1] - cum[j] || 1)));
        return { x: pts[j].x + (pts[j + 1].x - pts[j].x) * f, y: pts[j].y + (pts[j + 1].y - pts[j].y) * f };
      };
      const dt = 1 / 60, frames = Math.ceil((m.timeLimit + 10) / dt);
      let s = 0, wait = 0;
      for (let f = 0; f < frames && !AP.outcome && G.state === 'play'; f++) {
        const t = G.playT + dt; // the clock this step will see
        let next = Math.min(acc, s + speed * dt);
        const z = blinks.find((q) => q.b > s);
        if (z && s < z.a) { // not on it yet: go only if it is up and stays up until we are across
          const ph = MZ.blinkPhase(z.bl, t), left = (z.bl.on - ph) * z.bl.period;
          if (!(ph < z.bl.on && (z.b - s) / speed + MARGIN < left)) next = Math.min(next, Math.max(s, z.a - HOLD));
        }
        if (next - s < speed * dt * 0.5) wait += dt;
        s = next;
        AP.target = at(s);
        step(dt);
      }
      AP.target = null;
      const r = { level: L, layout: m.lattice + '/' + m.mask, outcome: AP.outcome || (G.state === 'play' ? 'stuck' : G.state), time: G.elapsed, par: m.parTime, limit: m.timeLimit, wait, gems: G.gemsTaken + '/' + G.gems.length, progress: Math.round((100 * s) / acc) };
      G.quit();
      return r;
    };
  }, speed);

  const results = [];
  const pad = (v, n) => String(v).padStart(n);
  console.log('level  result    time   par   diff  limit   wait  gems  route  layout');
  for (const L of levels) {
    const r = await page.evaluate((L) => window.AP.play(L), L);
    results.push(r);
    const diff = r.time - r.par;
    console.log(pad(r.level, 5), ' ', r.outcome.padEnd(5), pad(r.time.toFixed(1) + 's', 7), pad(r.par + 's', 5), pad((diff >= 0 ? '+' : '') + diff.toFixed(1), 6), pad(r.limit + 's', 6), pad(r.wait.toFixed(1) + 's', 6), pad(r.gems, 5), pad(r.progress + '%', 6), ' ', r.layout);
  }
  const won = results.filter((r) => r.outcome === 'win');
  const underPar = won.filter((r) => r.time <= r.par).length;
  console.log(won.length + '/' + results.length + ' finished with no losses, ' + underPar + ' within par, at a steady ' + speed + ' units/s' + (errors ? ', ' + errors + ' page errors' : ''));
  await browser.close();
  if (strict && won.length < results.length) process.exit(1);
})();
