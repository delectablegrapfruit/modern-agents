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

    // ----- the picture growing over the edge (a new animation frame, pressed into a wall) is a touch, never a fall -----
    G.startJourney(6); d = voidDir();
    S.gameplay.rule = 'casual'; run(0.6, d); // pressed against the edge (casual: the edges are walls)
    G.scale = 3; run(1 / 60, d); // a much bigger frame, reaching well over the edge
    check('a picture that grows over the edge is pushed back onto the floor, no bubble', !G.fx.bubble && onFloor() && G.state === 'play');
    S.gameplay.rule = 'normal'; G.quit();

    // ----- a touch at the start of a frame (the picture's next frame reaching over the edge) and a drag into the edge
    // in that same frame are one hit, not two (it used to lose from full health, with animated pictures) -----
    G.startJourney(6); d = voidDir();
    S.gameplay.rule = 'casual'; run(0.6, d); S.gameplay.rule = 'normal'; // right at the edge, no hit
    G.guardT = 0; G.stuck = false; G.hp = 2; G.bonus = 0; events.length = 0;
    for (let k = 0; k < 40 && !G.hitAt(G.ball.x, G.ball.y); k++) { G.ball.x += d.x * 0.5; G.ball.y += d.y * 0.5; } // a hair over it
    run(1 / 60, d);
    check('an edge touch and a drag into it in the same frame cost one hit', G.hp === 1 && G.state === 'play' && !events.some((e) => e.startsWith('lose')), events.join());
    G.quit();

    // ----- mouse: Glide steers toward the pointer without a click; Lock drags without a button -----
    G.startJourney(1);
    S.controls.mouse = 'glide'; G.applySettings();
    const stg = MZ.$('#stage'), hover = (x, y) => stg.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', pointerId: 1, isPrimary: true, button: -1, buttons: 0, clientX: x, clientY: y, bubbles: true }));
    const fwd = G.maze.nodes[G.maze.mainPath[1]], g0x = G.ball.x, g0y = G.ball.y, fl = Math.hypot(fwd.x - g0x, fwd.y - g0y);
    const fdir = { x: (fwd.x - g0x) / fl, y: (fwd.y - g0y) / fl };
    hover(innerWidth / 2 + fdir.x * 300, innerHeight / 2 + fdir.y * 300); // the pointer well ahead, along the corridor
    run(0.5);
    const glided = (G.ball.x - g0x) * fdir.x + (G.ball.y - g0y) * fdir.y;
    check('Glide: you head toward the mouse pointer, no button held', glided > 40 && !G.input.drag, Math.round(glided));
    hover(innerWidth / 2 + 3, innerHeight / 2 - 2); // resting on the picture
    const r0x = G.ball.x, r0y = G.ball.y;
    run(0.3);
    check('...and stop with the pointer resting on your picture', Math.hypot(G.ball.x - r0x, G.ball.y - r0y) < 0.5);
    hover(innerWidth / 2 + fdir.x * 300, innerHeight / 2 + fdir.y * 300);
    stg.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse', pointerId: 1, bubbles: false }));
    const l0x = G.ball.x, l0y = G.ball.y;
    run(0.3);
    check('...or with the pointer off the window', Math.hypot(G.ball.x - l0x, G.ball.y - l0y) < 0.5);
    S.controls.mouse = 'lock'; G.applySettings();
    G.input.locked = true; // (a real browser captures the mouse on a click; headless it's pretended)
    const gx0 = G.input.grabDX;
    stg.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', pointerId: 1, isPrimary: true, buttons: 0, movementX: 25, movementY: 0, clientX: 10, clientY: 10, bubbles: true }));
    check('Lock: with the mouse captured, moving it drags the maze, no button held', G.input.grabDX - gx0 === 25);
    G.input.grabDX = 0; G.input.grabDY = 0; G.input.locked = false;
    S.controls.mouse = 'glide'; G.applySettings();
    G.quit();

    // ----- touch: the Joystick steers as Glide does; Touch → Drag drags -----
    G.startJourney(1);
    S.controls.touch = 'joystick'; G.applySettings();
    const tch = (type, id, x, y, primary) => stg.dispatchEvent(new PointerEvent(type, { pointerType: 'touch', pointerId: id, isPrimary: primary !== false, clientX: x, clientY: y, bubbles: true }));
    const j0x = G.ball.x, j0y = G.ball.y, jdx = G.input.grabDX;
    tch('pointerdown', 7, 300, 500); tch('pointermove', 7, 300 + fdir.x * 70, 500 + fdir.y * 70);
    run(0.5);
    const stuck = (G.ball.x - j0x) * fdir.x + (G.ball.y - j0y) * fdir.y;
    check('Joystick: a thumb down anywhere, slid the way to go, steers you there (as Glide does)', stuck > 40 && !G.input.drag && G.input.grabDX === jdx, Math.round(stuck));
    tch('pointerup', 7, 300 + fdir.x * 70, 500 + fdir.y * 70);
    const s0x = G.ball.x, s0y = G.ball.y;
    run(0.3);
    check('...lifting it stops you', Math.hypot(G.ball.x - s0x, G.ball.y - s0y) < 0.5 && !G.input.stick);
    tch('pointerdown', 8, 300, 500); tch('pointerdown', 9, 500, 500, false);
    check('...and two fingers pinch, never steer', !G.input.stick && !!G.input.pinch);
    tch('pointerup', 9, 500, 500); tch('pointerup', 8, 300, 500);
    S.controls.touch = 'drag'; G.applySettings();
    const dgx = G.input.grabDX;
    tch('pointerdown', 10, 300, 500); tch('pointermove', 10, 340, 500);
    check('Touch → Drag: the finger drags the maze instead', G.input.grabDX - dgx === 40 && !G.input.stick);
    tch('pointerup', 10, 340, 500);
    G.input.grabDX = 0; G.input.grabDY = 0;
    S.controls.touch = 'joystick'; G.applySettings();
    G.quit();

    // ----- Path: shows the way -----
    G.startJourney(3);
    G.giveItem('path');
    check('Path is used, and lasts a while', G.useItem() && G.fx.path > 5);
    const pl = G.pathLine.pts, pEnd = pl[pl.length - 1], pGoal = G.maze.goal;
    G.draw();
    check('Path leads to GOAL', Math.hypot(pEnd.x - pGoal.x, pEnd.y - pGoal.y) < 1, Math.round(Math.hypot(pEnd.x - pGoal.x, pEnd.y - pGoal.y)));
    G.quit();
    G.startJourney(5);
    G.giveItem('path'); G.useItem();
    const k5 = G.maze.keys[0], e5 = G.pathLine.pts[G.pathLine.pts.length - 1];
    check('...or, with GOAL behind a door you can\'t open yet, to its key', Math.hypot(e5.x - k5.x, e5.y - k5.y) < 1);
    run(6.5);
    check('...and fades after 6 s', !(G.fx.path > 0));
    G.quit();

    // ----- a right click uses the item -----
    G.startJourney(6);
    G.giveItem('shrink');
    const stage = MZ.$('#stage'), mouse = (type, buttons) => stage.dispatchEvent(new PointerEvent(type, { pointerType: 'mouse', pointerId: 1, isPrimary: true, button: 2, buttons, clientX: innerWidth / 2, clientY: innerHeight / 2, bubbles: true }));
    mouse('pointerdown', 2); mouse('pointerup', 0);
    check('a right click uses the item, and never drags', !G.item && !!G.fx.storm && !G.input.drag);
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
    for (let i = 0; i < 60 * 8 && !(bubbled && !G.fx.bubble); i++) { run(1 / 60); if (G.fx.bubble) bubbled = true; }
    check('carpet running out over the void: a hit, and a bubble floats you back to the last solid ground', G.hp === 1 && bubbled && onFloor() && G.state === 'play' && Math.hypot(G.ball.x - home.x, G.ball.y - home.y) < 150, G.hp);
    G.quit();

    // ----- Shrink -----
    G.startJourney(6);
    const full = G.box();
    G.giveItem('shrink'); G.useItem();
    check('Shrink summons a thundercloud first: nothing shrinks yet', !!G.fx.storm && !(G.fx.shrink > 0) && Math.abs(G.box() - full) < 0.01);
    run(0.3); G.draw();
    run(0.6); G.draw();
    check('...its lightning strikes, and that halves the picture and its hitbox', Math.abs(G.box() - full / 2) < 0.01 && G.fx.shrink > 0, G.box() / full);
    run(10.5);
    check('Shrink grows back', Math.abs(G.box() - full) < 0.01, G.box() / full);
    G.quit();

    // ----- Bullet -----
    // How far along the level's own route a point is (the route of a level with no doors is one walk to GOAL).
    const routeAt = (mz) => {
      const P = [];
      for (const st of mz.route[0].steps) { const Q = st.e.a === st.from ? st.e.pts : st.e.pts.slice().reverse(); P.push(...(P.length ? Q.slice(1) : Q)); }
      return (x, y) => { let best = Infinity, at = 0, acc = 0; for (let i = 1; i < P.length; i++) { const d = MZ.segDist2(x, y, P[i - 1].x, P[i - 1].y, P[i].x, P[i].y); if (d < best) { best = d; at = acc; } acc += Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y); } return at; };
    };
    G.startJourney(13);
    const m = G.maze, along = routeAt(m), g0 = along(G.ball.x, G.ball.y);
    G.giveItem('bullet');
    check('Bullet is used', G.useItem() && !!G.fx.bullet);
    const len = G.fx.bullet.len;
    let minZ = Infinity, maxT = 0;
    for (let i = 0; i < 60 * 8 && G.fx.bullet; i++) { grab = { x: 500, y: 500 }; frame(1 / 60); maxT += 1 / 60; }
    check('Bullet carries you about 1800 units along the corridors', len > 1500 && !G.fx.bullet, Math.round(len) + ' in ' + maxT.toFixed(1) + 's');
    check('Bullet lands on the floor, unhurt, short of GOAL', onFloor() && G.hp === 2 && G.state === 'play');
    check('Bullet heads along the corridors toward GOAL', along(G.ball.x, G.ball.y) > g0 + 1200, Math.round(g0) + ' -> ' + Math.round(along(G.ball.x, G.ball.y)));
    G.quit();
    // With GOAL in reach it flies you right into it.
    G.startJourney(3);
    const m3 = G.maze, last = m3.mainPath[m3.mainPath.length - 3];
    G.ball.x = m3.nodes[last].x; G.ball.y = m3.nodes[last].y;
    G.giveItem('bullet'); G.useItem();
    for (let i = 0; i < 60 * 8 && G.fx.bullet && G.state === 'play'; i++) frame(1 / 60);
    check('Bullet with GOAL in reach flies you into it', G.state !== 'play' && !G.fx.bullet && Math.hypot(G.ball.x - m3.goal.x, G.ball.y - m3.goal.y) < G.goalR() + G.box(), G.state);
    G.quit();
    // A shut door stops the Bullet: it never crosses one.
    G.startJourney(5);
    const door = G.maze.doors[0];
    G.maze.keys[0].x += 1e5; // (out of reach, so it can't be picked up on the way)
    let crossed = false;
    G.giveItem('bullet');
    if (G.useItem()) for (let i = 0; i < 60 * 8 && G.fx.bullet; i++) {
      const x0 = G.ball.x, y0 = G.ball.y;
      frame(1 / 60);
      if (MZ.segsCross(x0, y0, G.ball.x, G.ball.y, door.ax, door.ay, door.bx, door.by)) crossed = true;
    }
    check('a shut door stops the Bullet', !crossed && !door.open);
    G.quit();
    // ...and with GOAL behind a door you can't open yet, it takes you to the key.
    G.startJourney(5);
    const key5 = G.maze.keys[0];
    G.giveItem('bullet');
    if (G.useItem()) for (let i = 0; i < 60 * 8 && G.fx.bullet; i++) frame(1 / 60);
    check('with GOAL shut off, the Bullet takes you to the key', G.keysHeld.get(key5.color) === 1 && Math.hypot(G.ball.x - key5.x, G.ball.y - key5.y) < 30 && onFloor(), Math.round(Math.hypot(G.ball.x - key5.x, G.ball.y - key5.y)));
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
    check('Launch is short, like a real launch', T <= 1.6, T.toFixed(2) + ' s');
    check('Launch goes up: the camera pulls out, but not too far', minZ < G.zoomTarget() * 0.5 && minZ > G.zoomTarget() * 0.15, (minZ / G.zoomTarget()).toFixed(3));
    check('Launch steers freely, over the void too, as far as the clouds', moved > 250 && moved <= 341 && overVoid, Math.round(moved) + ' units');
    const went = (G.fx.bubble ? G.fx.bubble.a : G.ball), gone = (went.x - a.x) * toward.x + (went.y - a.y) * toward.y;
    check('Launch goes where you steer', gone > 250, Math.round(gone) + ' units the way you dragged');
    check('Launch maps what it flies over', wide > 1000 && wide > before * 4, Math.round(before) + ' -> ' + Math.round(wide));
    check('camera back down after landing', G.state !== 'play' || Math.abs(G.cam.zoom - G.zoomTarget()) < 1e-6);
    G.quit();
    // Steered onto the board: down exactly there, unhurt. Steered over the void: a fall (a hit), then the nearest floor.
    const launchTo = (p) => {
      G.giveItem('launch'); G.useItem();
      // Placed there (with its take-off moved along, so the reach doesn't hold it back: that's checked above).
      for (let i = 0; i < 60 * 8 && G.fx.launch; i++) { if (G.fx.launch.t > G.fx.launch.T - 0.3) { G.ball.x = p.x; G.ball.y = p.y; G.fx.launch.from = { x: p.x, y: p.y }; } frame(1 / 60); }
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
    let built = 0;
    const assemble = G.assemble;
    G.assemble = function () { built++; return assemble.call(this); };
    d = voidDir(); events.length = 0; touch(d); away(d); events.length = 0; touch(d);
    check('a loss shatters the picture', !!G.pieces && G.pieces.kind === 'break' && G.state === 'fx');
    const until = (ok, then, n) => (ok() || n > 150 ? then() : setTimeout(() => until(ok, then, n + 1), 20)); // the loss plays out on timers
    return new Promise((resolve) => until(() => G.state === 'play', () => {
      G.assemble = assemble;
      check('a loss goes back to the lit flag, hearts full', G.state === 'play' && Math.hypot(G.ball.x - c.x, G.ball.y - c.y) < 1 && G.hp === 2, G.state);
      check('...and the pieces fly back together as you spawn', built === 1);
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
    }, 0));
  });
  let bad = 0;
  for (const r of out) { if (!r.ok) bad++; console.log((r.ok ? 'ok   ' : 'FAIL ') + r.name + (r.info ? '  (' + r.info + ')' : '')); }
  for (const e of errors) console.log('pageerror ' + e);
  console.log(out.length - bad + '/' + out.length + ' checks passed' + (errors.length ? ', ' + errors.length + ' page errors' : ''));
  await browser.close();
  process.exit(bad || errors.length ? 1 : 0);
})();
