// Hearts, mystery boxes, items and checkpoints, played with the real game code in Chromium (from file://), stepping the
// game by hand. Exits 1 on any failed check or page error.
//
//   node tests/items.js
//
// Needs Playwright with Chromium (npm i -D playwright && npx playwright install chromium).
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (e2) { console.error('Playwright is not installed.'); process.exit(2); }
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await page.waitForFunction(() => window.MZ && MZ.Game && MZ.Game.state === 'menu');
  const out = await page.evaluate(() => {
    const G = MZ.Game, S = MZ.Save.settings, frame = G.frame.bind(G), res = [];
    G.frame = () => {}; // the page's own loop stops; we step by hand
    MZ.Game.FX.play = () => new Promise((r) => setTimeout(r, 0)); // no lose/win media
    S.gameplay.rule = 'normal'; S.gameplay.timer = true; S.gameplay.boxes = true; S.controls.invert = false;
    let grab = { x: 0, y: 0 };
    G.input.vector = () => ({ x: 0, y: 0 });
    G.input.takeGrab = () => { const g = grab; grab = { x: 0, y: 0 }; return g; };
    const events = [];
    for (const ev of ['hit', 'lose', 'use']) G.on(ev, (a) => events.push(ev + ':' + a));
    const check = (name, ok, info) => res.push({ name, ok: !!ok, info: info == null ? '' : String(info) });
    const run = (sec, dir) => { // step sec seconds; dir: world direction to drag at 140 units/s
      for (let i = 0; i < Math.round(sec * 60); i++) {
        if (dir) { const k = G.cam.zoom * 140 / 60; grab = { x: -dir.x * k, y: -dir.y * k }; }
        frame(1 / 60);
      }
    };
    const onFloor = () => !G.hitAt(G.ball.x, G.ball.y);
    // A direction from here that leaves the floor soon (the void is within 150 units).
    const voidDir = () => {
      for (let a = 0; a < 64; a++) {
        const d = { x: Math.cos(a * Math.PI / 32), y: Math.sin(a * Math.PI / 32) };
        let hit = false;
        for (let s = 0; s < 150; s += 4) if (G.world.query(G.ball.x + d.x * s, G.ball.y + d.y * s, G.playT).depth < -30) { hit = true; break; }
        if (hit) return d;
      }
      return null;
    };

    // Touch the edge (drag into it until a hit), step back off it, wait out the guard, touch it again.
    const touch = (dir) => { for (let i = 0; i < 180 && !events.some((e) => e.startsWith('hit') || e.startsWith('lose')); i++) run(1 / 60, dir); };
    const away = (dir) => { run(0.3, { x: -dir.x, y: -dir.y }); run(0.9); };

    // ----- health -----
    G.startJourney(6);
    let d = voidDir();
    check('health starts full', G.hp === 2 && G.bonus === 0 && G.hurtLevel() === 0);
    touch(d);
    check('a touch costs one hit', G.hp === 1 && events.includes('hit:1'), G.hp);
    check('stopped at the edge, still on the floor', onFloor() && G.state === 'play');
    G.draw();
    const look = () => parseFloat(MZ.$('#player-media').style.opacity || 1);
    check('hurt shows on the picture only: faded, no health HUD, no screen glow', look() < 0.5 && !MZ.$('#hud-health') && !MZ.$('#hurt-flash'), look());
    run(5, d);
    check('holding against the edge never hits twice', G.hp === 1 && G.state === 'play' && events.filter((e) => e.startsWith('hit')).length === 1, G.hp);
    check('no healing while still on the edge', G.hurtT === 0, G.hurtT.toFixed(2));
    away(d); // off the edge for about 1 s
    run(3.2);
    check('not healed 4 s after leaving the edge', G.hp === 1 && G.hurtLevel() > 0 && G.hurtLevel() < 0.3, G.hurtLevel().toFixed(2));
    G.draw();
    check('the last second: the shield recharges, the picture filling back in', MZ.$('#player').classList.contains('recharge') && look() > 0.45 && look() < 1, look());
    run(1.2);
    check('healed 5 s after leaving the edge', G.hp === 2 && G.hurtLevel() === 0, G.hp);
    G.draw();
    check('recharged: the picture is solid again', look() === 1 && !MZ.$('#player').classList.contains('recharge'), look());
    events.length = 0;
    touch(d); run(0.3, { x: -d.x, y: -d.y }); run(0.55); // back off, then straight back in once the 0.75 s guard is over
    events.length = 0;
    touch(d);
    check('a second, separate touch before healing loses', events.includes('lose:fall') && G.state !== 'play', events.join());
    G.quit();

    // ----- Extra hit -----
    G.startJourney(6); d = voidDir();
    G.giveItem('heart');
    check('Extra hit adds a gold ring at once', G.bonus === 1 && !G.item);
    events.length = 0;
    touch(d);
    check('the Extra hit goes first', G.bonus === 0 && G.hp === 2);
    G.quit();

    // ----- mystery box -----
    G.startJourney(10);
    const bx = G.boxes[0];
    check('levels have boxes', G.boxes.length >= 1, G.boxes.length);
    G.ball.x = bx.x; G.ball.y = bx.y;
    run(0.05);
    check('touching a box spins for an item', !!G.roll && bx.takenAt != null);
    run(1.2);
    check('the spin lands on an item', !G.roll && (G.item || G.bonus === 1), G.item || 'bonus');
    const held = G.item;
    G.item = 'star'; const other = G.boxes[1]; G.ball.x = other.x; G.ball.y = other.y; run(0.05);
    check('with a full slot a box still shatters, but gives nothing', G.item === 'star' && !G.roll && other.takenAt != null);
    G.ball.x = G.maze.start.x; G.ball.y = G.maze.start.y; // step away from it
    run(20);
    check('a shattered box is still gone after 20 s', other.takenAt != null);
    run(5.1);
    check('...and back after 25 s', other.takenAt == null);
    G.item = null; G.ball.x = other.x; G.ball.y = other.y; run(0.05);
    check('then an empty slot gets an item from it', !!G.roll && other.takenAt != null);
    // Zoom: never wider than the default view.
    const z0 = G.zoomTarget();
    G.zoomBy(0.4); check('zooming out stops at the default view', G.zoomTarget() === z0);
    G.zoomBy(3); check('zooming in still works', G.zoomTarget() > z0 * 2.9);
    G.zoomBy(1 / 3);
    G.quit();

    // ----- Invincible -----
    G.startJourney(6); d = voidDir();
    G.giveItem('star'); G.useItem();
    run(2, d);
    check('Invincible: no damage, edges hold', G.hp === 2 && onFloor() && G.fx.star > 5, G.hp + ' ' + G.fx.star);
    run(7);
    check('Invincible runs out', !(G.fx.star > 0));
    G.quit();

    // ----- Magic carpet -----
    G.startJourney(6); d = voidDir();
    const home = { x: G.ball.x, y: G.ball.y };
    G.giveItem('carpet'); G.useItem();
    run(1.5, d);
    check('Magic carpet floats over the void', G.hp === 2 && !onFloor() && G.world.query(G.ball.x, G.ball.y, G.playT).depth < 0);
    let bubbled = false;
    for (let i = 0; i < 60 * 8; i++) { run(1 / 60); if (G.fx.bubble) bubbled = true; }
    check('carpet running out over the void: a hit, and a bubble floats you back to the last solid ground', G.hp === 1 && bubbled && onFloor() && G.state === 'play' && Math.hypot(G.ball.x - home.x, G.ball.y - home.y) < 150, G.hp);
    G.quit();

    // ----- Shrink -----
    G.startJourney(6);
    const full = G.box();
    G.giveItem('shrink'); G.useItem();
    run(0.5);
    check('Shrink halves the picture and its hitbox', Math.abs(G.box() - full / 2) < 0.01, G.box() / full);
    run(10.5);
    check('Shrink grows back', Math.abs(G.box() - full) < 0.01, G.box() / full);
    G.quit();

    // ----- Bullet -----
    G.startJourney(14);
    const m = G.maze, g0 = Math.hypot(G.ball.x - m.goal.x, G.ball.y - m.goal.y);
    G.giveItem('bullet');
    check('Bullet is used', G.useItem() && !!G.fx.bullet);
    const len = G.fx.bullet.len;
    let minZ = Infinity, maxT = 0;
    for (let i = 0; i < 60 * 8 && G.fx.bullet; i++) { grab = { x: 500, y: 500 }; frame(1 / 60); maxT += 1 / 60; }
    check('Bullet carries you about 1800 units along the corridors', len > 1500 && !G.fx.bullet, Math.round(len) + ' in ' + maxT.toFixed(1) + 's');
    check('Bullet lands on the floor, unhurt, short of GOAL', onFloor() && G.hp === 2 && G.state === 'play');
    check('Bullet heads for GOAL', Math.hypot(G.ball.x - m.goal.x, G.ball.y - m.goal.y) < g0, Math.round(g0) + ' -> ' + Math.round(Math.hypot(G.ball.x - m.goal.x, G.ball.y - m.goal.y)));
    // Near the goal it stops short and the finish is yours.
    const last = m.mainPath[m.mainPath.length - 3];
    G.ball.x = m.nodes[last].x; G.ball.y = m.nodes[last].y;
    G.giveItem('bullet'); G.useItem();
    for (let i = 0; i < 60 * 8 && G.fx.bullet; i++) frame(1 / 60);
    check('Bullet near GOAL stops short of it', G.state === 'play' && onFloor(), G.state);
    G.quit();

    // ----- Launch: steer in the air, come down right where you are (on the board, or in the void) -----
    G.startJourney(14);
    const before = G.trail.length ? Math.max(...G.trail.map((r) => r.x1 - r.x0)) : 0;
    const a = { x: G.ball.x, y: G.ball.y }, gl = G.maze.goal, len0 = Math.hypot(gl.x - a.x, gl.y - a.y);
    const toward = { x: (gl.x - a.x) / len0, y: (gl.y - a.y) / len0 };
    G.giveItem('launch'); G.useItem();
    const T = G.fx.launch.T;
    let overVoid = false;
    for (let i = 0; i < 60 * 8 && G.fx.launch; i++) {
      grab = { x: -toward.x * 6, y: -toward.y * 6 }; // a steady 360 px/s drag toward GOAL, on the zoomed-out screen
      frame(1 / 60);
      minZ = Math.min(minZ, G.cam.zoom);
      if (G.world.query(G.ball.x, G.ball.y, G.playT).depth < -40) overVoid = true;
      G.draw();
    }
    const wide = Math.max(...G.trail.map((r) => r.x1 - r.x0)), moved = Math.hypot(G.ball.x - a.x, G.ball.y - a.y);
    check('Launch is short, like a real launch', T <= 2.6, T.toFixed(2) + ' s');
    check('Launch flies high: the camera pulls far out', minZ < G.zoomTarget() * 0.25, (minZ / G.zoomTarget()).toFixed(3));
    check('Launch steers freely, over the void too', moved > 800 && overVoid, Math.round(moved) + ' units');
    check('Launch goes where you steer (toward GOAL here)', Math.hypot(gl.x - G.ball.x, gl.y - G.ball.y) < len0 - 600, Math.round(len0) + ' -> ' + Math.round(Math.hypot(gl.x - G.ball.x, gl.y - G.ball.y)));
    check('Launch maps what it flies over', wide > 1000 && wide > before * 4, Math.round(before) + ' -> ' + Math.round(wide));
    check('camera back down after landing', G.state !== 'play' || Math.abs(G.cam.zoom - G.zoomTarget()) < 1e-6);
    G.quit();
    // Steered onto the board: down exactly there, unhurt. Steered over the void: a fall (a hit), then the nearest floor.
    const launchTo = (p) => {
      G.giveItem('launch'); G.useItem();
      for (let i = 0; i < 60 * 8 && G.fx.launch; i++) { if (G.fx.launch.t > 1.2) { G.ball.x = p.x; G.ball.y = p.y; } frame(1 / 60); }
    };
    G.startJourney(14);
    const node = G.maze.nodes[G.maze.mainPath[Math.floor(G.maze.mainPath.length / 2)]];
    events.length = 0;
    launchTo(node);
    check('Launch onto the board: down right there, unhurt', Math.hypot(G.ball.x - node.x, G.ball.y - node.y) < G.box() * 0.25 && G.hp === 2 && !events.some((e) => e.startsWith('hit')));
    const B = G.maze.bounds, far = { x: B.minX - 100, y: B.minY - 100 }, took = { x: G.ball.x, y: G.ball.y };
    launchTo(far);
    check('Launch into the void: a hit, and a bubble', G.hp === 1 && events.includes('hit:1') && !!G.fx.bubble);
    for (let i = 0; i < 60 * 4 && G.fx.bubble; i++) frame(1 / 60);
    check('...that floats you back to where you took off', onFloor() && G.state === 'play' && Math.hypot(G.ball.x - took.x, G.ball.y - took.y) < 20);
    G.quit();

    // ----- checkpoints -----
    let L = 20;
    for (; L < 60; L++) { G.startJourney(L); if (G.checkpoints.length) break; G.quit(); }
    const c = G.checkpoints[0];
    G.ball.x = c.x; G.ball.y = c.y; run(0.05);
    check('touching a flag lights it', G.cpIdx === 0 && c.lit, 'level ' + L);
    d = voidDir(); events.length = 0; touch(d); away(d); events.length = 0; touch(d);
    return new Promise((resolve) => setTimeout(() => {
      check('a loss goes back to the lit flag, hearts full', G.state === 'play' && Math.hypot(G.ball.x - c.x, G.ball.y - c.y) < 1 && G.hp === 2, G.state);
      G.quit();
      // ----- Time Trial: no boxes, no time limit, ghosts only here -----
      G.startJourney(3);
      check('no ghost outside Time Trial', !G.ghost && G.ghostAt(1) === null);
      G.quit();
      G.startTrial(3);
      const tb = G.boxes[0]; G.ball.x = tb.x; G.ball.y = tb.y; run(0.1);
      check('Time Trial: no mystery boxes, no item slot, no countdown', !G.boxesOn() && MZ.$('#hud-item').hidden && !G.timed());
      check('Time Trial: boxes are not picked up', !G.roll && !G.item && tb.takenAt == null);
      run(1);
      G.ball.x = G.maze.goal.x; G.ball.y = G.maze.goal.y; run(0.05);
      check('Time Trial clear saves a best time', MZ.Save.progress.trials[3] > 0, MZ.Save.progress.trials[3]);
      return new Promise((r2) => setTimeout(r2, 50)).then(() => {
        G.startTrial(3);
        check('Time Trial: your best run comes back as a ghost', !!G.ghost && !!G.ghostAt(0.5));
        G.quit();
      }).then(() => {
      // ----- Endless -----
      G.startEndless('items-test');
      check('Endless has boxes', G.boxes.length > 0, G.boxes.length);
      G.giveItem('bullet');
      const o = G.run.origin;
      check('Endless Bullet is used', G.useItem());
      for (let i = 0; i < 60 * 8 && G.fx.bullet; i++) frame(1 / 60);
      check('Endless Bullet heads outward and lands on the floor', Math.hypot(G.ball.x - o.x, G.ball.y - o.y) > 600 && onFloor(), Math.round(Math.hypot(G.ball.x - o.x, G.ball.y - o.y)));
      G.giveItem('launch'); G.useItem();
      for (let i = 0; i < 60 * 5 && G.fx.launch; i++) { frame(1 / 60); G.draw(); }
      check('Endless Launch lands on the floor', onFloor() && G.state === 'play');
      G.quit();
      resolve(res);
      });
    }, 50));
  });
  let bad = 0;
  for (const r of out) { if (!r.ok) bad++; console.log((r.ok ? 'ok   ' : 'FAIL ') + r.name + (r.info ? '  (' + r.info + ')' : '')); }
  for (const e of errors) console.log('pageerror ' + e);
  console.log(out.length - bad + '/' + out.length + ' checks passed' + (errors.length ? ', ' + errors.length + ' page errors' : ''));
  await browser.close();
  process.exit(bad || errors.length ? 1 : 0);
})();
