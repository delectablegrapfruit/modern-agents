// Autopilot: plays journey levels with the real game physics and tilt input only, following each level's route.
// Proves levels are finishable within their time limits and shows how par compares with a careful run.
//
//   node tests/autopilot.js            levels 1–25
//   node tests/autopilot.js 1-40       a range
//   node tests/autopilot.js 7,12,30    a list
//   --strict                           exit 1 unless every level is finished (CI)
//
// Needs Playwright with Chromium (npm i -D playwright && npx playwright install chromium). Opens the game from file://.
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (e2) { console.error('Playwright is not installed.'); process.exit(2); }
}
const strict = process.argv.includes('--strict');
const arg = process.argv.slice(2).find((a) => !a.startsWith('--')) || '1-25';
const levels = arg.includes('-') ? (([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i))(arg.split('-').map(Number)) : arg.split(',').map(Number);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await page.waitForFunction(() => window.MZ && MZ.Game && MZ.Game.state === 'menu');
  const results = await page.evaluate((levels) => {
    const G = MZ.Game, step = G.frame.bind(G);
    G.frame = () => {}; // the page's own loop stops; we step the game by hand, fast
    G.draw = () => {};
    MZ.Save.settings.gameplay.rule = 'normal';
    MZ.Save.settings.gameplay.timer = true;
    MZ.Save.settings.controls.scheme = 'tilt';
    const out = [];
    for (const L of levels) {
      G.startJourney(L);
      G.t = 0; // vanishing bridges run on the game clock: start it at 0 so every run is identical
      const m = G.maze, wp = [];
      for (let i = 0; i + 1 < m.mainPath.length; i++) {
        const a = m.mainPath[i], b = m.mainPath[i + 1];
        const e = m.edges.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
        const pts = e.a === a ? e.pts : e.pts.slice().reverse();
        for (let k = i ? 1 : 0; k < pts.length; k++) wp.push({ x: pts[k].x, y: pts[k].y, hw: e.hw, blink: e.type === 'blink' ? e.blink : null, ice: e.type === 'ice' });
      }
      const seg = [];
      for (let i = 0; i + 1 < wp.length; i++) seg.push(Math.hypot(wp[i + 1].x - wp[i].x, wp[i + 1].y - wp[i].y));
      const ahead = (i, f, d) => {
        let rem = d + f * seg[i];
        while (i < seg.length - 1 && rem > seg[i]) { rem -= seg[i]; i++; }
        const k = Math.min(1, rem / (seg[i] || 1));
        return { x: wp[i].x + (wp[i + 1].x - wp[i].x) * k, y: wp[i].y + (wp[i + 1].y - wp[i].y) * k, i };
      };
      let wi = 0;
      G.input.vector = () => {
        const b = G.ball;
        let best = Infinity, bi = wi, bf = 0;
        for (let i = wi; i < Math.min(seg.length, wi + 6); i++) {
          const P = wp[i], Q = wp[i + 1], dx = Q.x - P.x, dy = Q.y - P.y, l2 = dx * dx + dy * dy || 1;
          const f = Math.max(0, Math.min(1, ((b.x - P.x) * dx + (b.y - P.y) * dy) / l2));
          const d = Math.hypot(P.x + dx * f - b.x, P.y + dy * f - b.y);
          if (d < best - 1e-6) { best = d; bi = i; bf = f; }
        }
        wi = bi;
        // Stop short of a vanishing bridge that won't stay up long enough; never stop on one.
        let brakeTo = Infinity;
        if (!wp[bi + 1].blink) {
          let dist = (1 - bf) * seg[bi], j = bi + 1;
          while (j < seg.length && dist < 160 && !wp[j + 1].blink) { dist += seg[j]; j++; }
          if (j < seg.length && wp[j + 1].blink && dist < 160) {
            const bl = wp[j + 1].blink, ph = MZ.blinkPhase(bl, G.t);
            let len = 0;
            for (let k = j; k < seg.length && wp[k + 1].blink === bl; k++) len += seg[k];
            if (ph >= bl.on || (bl.on - ph) * bl.period < len / 200 + 0.5) brakeTo = Math.max(0, dist - 40);
          }
        }
        let ice = false;
        for (let k = bi; k < Math.min(seg.length, bi + 5); k++) if (wp[k + 1].ice) ice = true;
        // Slow down for bends ahead.
        const sp = Math.hypot(b.vx, b.vy);
        let turn = 0;
        const h0 = ahead(bi, bf, 0), h1 = ahead(bi, bf, 60);
        let prev = Math.atan2(h1.y - h0.y, h1.x - h0.x);
        for (let d = 60; d <= 60 + Math.max(120, sp * 0.6); d += 30) {
          const p1 = ahead(bi, bf, d), p2 = ahead(bi, bf, d + 30), a2 = Math.atan2(p2.y - p1.y, p2.x - p1.x);
          let da = Math.abs(a2 - prev) % (2 * Math.PI);
          if (da > Math.PI) da = 2 * Math.PI - da;
          turn += da;
          prev = a2;
        }
        const narrow = Math.min(1, Math.max(0, (46 - wp[bi].hw) / 20));
        let vmax = Math.max(110, 400 - 120 * narrow - 230 * Math.min(1, turn / 1.4));
        if (ice) vmax *= 0.6;
        vmax = Math.min(vmax, brakeTo * 2.2);
        const tgt = ahead(bi, bf, Math.max(35, sp * 0.18));
        const dx = tgt.x - b.x, dy = tgt.y - b.y, d = Math.hypot(dx, dy) || 1;
        let ux = ((dx / d) * vmax - b.vx) / 160, uy = ((dy / d) * vmax - b.vy) / 160;
        const mm = Math.hypot(ux, uy);
        if (mm > 1) { ux /= mm; uy /= mm; }
        return { x: ux, y: uy };
      };
      G.setState('play');
      let outcome = 'stuck';
      for (let i = 0; i < 60 * 300; i++) {
        step(1 / 60);
        if (G.state === 'goal') { outcome = 'win'; break; }
        if (G.state === 'fall') { outcome = 'fell'; break; }
        if (G.state === 'fx') { outcome = 'time'; break; }
      }
      out.push({ level: L, layout: m.lattice + '/' + m.mask, outcome, time: +G.elapsed.toFixed(1), par: m.parTime, limit: m.timeLimit, progress: Math.round((100 * wi) / seg.length) + '%' });
      G.quit();
    }
    return out;
  }, levels);
  for (const r of results) console.log(String(r.level).padStart(3), r.outcome.padEnd(5), (r.time + 's').padStart(7), ' par', String(r.par).padStart(3), ' limit', String(r.limit).padStart(3), ' ', r.progress.padStart(4), ' ', r.layout);
  const wins = results.filter((r) => r.outcome === 'win').length;
  console.log(wins + '/' + results.length + ' finished by the autopilot (it is careful, not perfect: ice and mud still catch it out sometimes)');
  await browser.close();
  if (strict && wins < results.length) process.exit(1);
})();
