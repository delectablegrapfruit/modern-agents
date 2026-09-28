// The level mechanics and modes, played with the real game code in Chromium (from file://): doors and keys, one-way
// gates, switches, portals, moving platforms, ice, darkness, remix modifiers, chapters and bosses, Gauntlet settings,
// and the menu. Exits 1 on any failed check or page error.
//
//   node tests/mechanics.js
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
    const G = MZ.Game, S = MZ.Save.settings, L = MZ.Levels, frame = G.frame.bind(G), res = [];
    const check = (name, ok, info) => res.push({ name, ok: !!ok, info: info == null ? '' : String(info) });
    // The menu, before anything else.
    const labels = Array.from(document.querySelectorAll('.screen-title button')).map((b) => b.textContent.trim());
    check('menu: Chapters, Gauntlet, Endless, Time Trial; no Daily, no Seed', ['Chapters', 'Gauntlet', 'Endless', 'Time Trial'].every((x) => labels.includes(x)) && !labels.some((x) => /Daily|Seed/.test(x)), labels.join('|'));

    G.frame = () => {};
    MZ.Game.FX.play = () => new Promise((r) => setTimeout(r, 0));
    S.gameplay.rule = 'normal'; S.gameplay.timer = true; S.gameplay.boxes = false; S.controls.invert = false;
    let grab = { x: 0, y: 0 };
    G.input.vector = () => ({ x: 0, y: 0 });
    G.input.takeGrab = () => { const g = grab; grab = { x: 0, y: 0 }; return g; };
    const hits = [];
    G.on('hit', () => hits.push(G.t));
    const run = (sec, dir, spd) => {
      for (let i = 0; i < Math.round(sec * 60); i++) {
        if (dir) { const k = G.cam.zoom * (spd || 140) / 60; grab = { x: -dir.x * k, y: -dir.y * k }; }
        frame(1 / 60);
      }
    };
    const put = (p) => { G.ball.x = p.x; G.ball.y = p.y; G.vel = { x: 0, y: 0 }; run(0.02); };
    // A point on the floor this far from p along the corridor its bar crosses (d > 0: the way it faces).
    const off = (bar, d) => ({ x: bar.x + bar.nx * d, y: bar.y + bar.ny * d });

    // ----- chapters, bosses, the schedule of new mechanics, remix -----
    check('chapters of ten, the tenth a boss', L.chapterOf(10) === 1 && L.chapterOf(11) === 2 && L.isBoss(20) && !L.isBoss(19));
    let sched = true;
    for (const mc of L.MECHS) { const m = L.build(L.levelParams(mc.from)); if (!m.mechs.includes(mc.id)) sched = mc.id; }
    check('each mechanic is introduced on its own level', sched === true, sched);
    const b10 = L.build(L.levelParams(10)), l9 = L.build(L.levelParams(9));
    const w = G.ITEMS;
    check('Launch and the magic carpet are the rarest items, equally; the carpet is short', w.launch.w === w.carpet.w && Object.keys(w).every((id) => id === 'carpet' || id === 'launch' || w[id].w > 2 * w.carpet.w) && w.carpet.dur < 4, w.launch.w + ' / ' + w.carpet.w + ' / ' + w.carpet.dur + ' s');
    check('bosses are bigger than the levels before them', b10.boss && b10.nodes.length > l9.nodes.length * 1.2, b10.nodes.length + ' vs ' + l9.nodes.length);
    check('no remix before level 36, one or more after', L.levelParams(35).mods.length === 0 && [36, 41, 47, 58].every((lv) => L.levelParams(lv).mods.length >= 1));

    // ----- keys and doors -----
    G.startJourney(5);
    let m = G.maze, door = m.doors[0], key = m.keys.find((k) => k.color === door.color);
    const before = off(door, -60);
    put(before);
    hits.length = 0;
    run(1.5, { x: door.nx, y: door.ny });
    const s1 = (G.ball.x - door.x) * door.nx + (G.ball.y - door.y) * door.ny;
    check('a shut door is a wall: it stops you, and never hurts', s1 < 0 && hits.length === 0 && G.state === 'play', s1.toFixed(1));
    put(key);
    check('picking up the key doesn\'t open the door by itself', !door.open && G.keysHeld.get(door.color) === 1);
    G.draw();
    const chip = document.querySelector('#hud-keys .key-chip');
    check('the key you carry shows beside the item slot, in its colour', document.querySelectorAll('#hud-keys .key-chip').length === 1 && !!chip.querySelector('svg') && chip.offsetWidth >= 40 && chip.style.getPropertyValue('--kc') === door.color);
    put(before);
    for (let i = 0; i < 90 && (G.ball.x - door.x) * door.nx + (G.ball.y - door.y) * door.ny < 25; i++) run(1 / 60, { x: door.nx, y: door.ny });
    check('bumping into the door with its key opens it, and you walk through', door.open && (G.ball.x - door.x) * door.nx + (G.ball.y - door.y) * door.ny > 20 && hits.length === 0);
    check('...using the key up', !G.keysHeld.get(door.color));
    G.draw();
    check('...and its chip goes', !document.querySelector('#hud-keys .key-chip'));
    door.seen = true; G.draw();
    check('an opened door stays on the map', G.maze.doors.every((d) => d.edge !== door.edge || d.open));
    G.restartLevel();
    check('restart shuts the doors and puts the keys back', !door.open && !key.taken && !G.keysHeld.get(door.color));
    G.quit();

    // ----- one-way gates -----
    G.startJourney(12);
    m = G.maze;
    const gate = m.gates[0];
    put(off(gate, 60));
    hits.length = 0;
    run(1.5, { x: -gate.nx, y: -gate.ny });
    check('a one-way gate won\'t let you back through', (G.ball.x - gate.x) * gate.nx + (G.ball.y - gate.y) * gate.ny > 0 && hits.length === 0);
    put(off(gate, -60));
    run(1.5, { x: gate.nx, y: gate.ny });
    check('...but lets you through the way it points', (G.ball.x - gate.x) * gate.nx + (G.ball.y - gate.y) * gate.ny > 20);
    G.quit();

    // ----- switches -----
    G.startJourney(16);
    m = G.maze;
    const plate = m.plates[0], main = m.edges.find((e) => e.sw && e.sw.on === 1), mid = main.pts[Math.floor(main.pts.length / 2)];
    const solid = () => G.world.query(mid.x, mid.y, G.playT).seg && G.world.query(mid.x, mid.y, G.playT).seg.sw === main.sw;
    check('a switch bridge starts missing', !solid());
    put(plate);
    check('stepping on the switch brings it in', solid() && (G.world.sw[plate.g] | 0) === 1);
    run(0.5);
    check('standing on the switch doesn\'t flip it again', solid());
    put(m.start); put(plate);
    check('stepping on it again takes it away', !solid());
    G.quit();

    // ----- portals -----
    G.startJourney(25);
    m = G.maze;
    const pt = m.portals[0];
    put(pt.a);
    check('a portal sends you to its twin', Math.hypot(G.ball.x - pt.b.x, G.ball.y - pt.b.y) < 1, Math.round(Math.hypot(G.ball.x - pt.b.x, G.ball.y - pt.b.y)));
    run(0.5);
    check('...which doesn\'t send you straight back', Math.hypot(G.ball.x - pt.b.x, G.ball.y - pt.b.y) < 1);
    G.quit();

    // ----- moving platforms -----
    G.startJourney(21);
    m = G.maze;
    const mv = m.movers[0];
    let docked = 0;
    for (let i = 0; i < 60 * 30 && !docked; i++) { frame(1 / 60); const p = MZ.moverAt(mv, G.playT); if (p.k === 0) docked = 1; }
    put(mv.a);
    hits.length = 0;
    let rode = false;
    for (let i = 0; i < 60 * 30; i++) { frame(1 / 60); const p = MZ.moverAt(mv, G.playT); if (p.k === 1 && Math.hypot(G.ball.x - mv.b.x, G.ball.y - mv.b.y) < 3) { rode = true; break; } }
    check('a moving platform carries you across the gap', rode && hits.length === 0 && G.state === 'play');
    G.quit();

    // ----- ice -----
    G.startJourney(28);
    m = G.maze;
    const ice = m.edges.filter((e) => e.ice && e.plen > 200).sort((a, b) => b.plen - a.plen)[0];
    const A = ice.pts[0], Bp = ice.pts[ice.pts.length - 1], dl = Math.hypot(Bp.x - A.x, Bp.y - A.y), dir = { x: (Bp.x - A.x) / dl, y: (Bp.y - A.y) / dl };
    put({ x: A.x + dir.x * 40, y: A.y + dir.y * 40 });
    run(0.25, dir, 60);
    const p0 = { x: G.ball.x, y: G.ball.y };
    run(0.35); // let go
    check('on ice you keep sliding after you stop', Math.hypot(G.ball.x - p0.x, G.ball.y - p0.y) > 3, Math.hypot(G.ball.x - p0.x, G.ball.y - p0.y).toFixed(1));
    G.quit();

    // ----- darkness -----
    G.startJourney(32);
    m = G.maze;
    run(0.1);
    const v = G.look();
    check('in the dark the map only fills in near you', m.dark > 0 && v.x1 - v.x0 <= 2 * m.dark + 1, Math.round(v.x1 - v.x0) + ' <= ' + 2 * m.dark);
    G.quit();

    // ----- remix modifiers at runtime -----
    let mirrorLv = 36; while (!L.levelParams(mirrorLv).mods.includes('mirror')) mirrorLv++;
    G.startJourney(mirrorLv);
    const x0 = G.ball.x;
    grab = { x: -30, y: 0 }; frame(1 / 60);
    check('Mirror turns the drag around', G.ball.x < x0 || G.hitAt(G.ball.x, G.ball.y), (G.ball.x - x0).toFixed(1));
    G.quit();
    let nomapLv = 36; while (!L.levelParams(nomapLv).mods.includes('nomap')) nomapLv++;
    G.startJourney(nomapLv);
    G.draw();
    check('No map hides the map', MZ.$('#minimap').hidden);
    G.quit();

    // ----- item puzzles: item boxes, gaps, shrink gates -----
    G.startJourney(14);
    m = G.maze;
    const q = m.squeezes[0], gp = m.gaps[0], gbs = m.gboxes;
    check('item puzzles: a gap and a shrink gate, each with an item box that gives what it needs', m.gaps.length >= 1 && m.squeezes.length >= 1 && gbs.some((x) => x.item === 'shrink') && gbs.some((x) => x.item === gp.item));
    const gb = gbs.find((x) => x.item === gp.item);
    G.giveItem('star'); // a full slot
    put(gb);
    check('an item box gives its item, even over a full slot', G.item === gp.item && gb.out, G.item);
    G.useItem();
    let back = false;
    for (let i = 0; i < 60 * 5 && !back; i++) { run(1 / 60); back = !gb.out; }
    check('...and it comes back once that item is spent, so a wasted one can be fetched again', back);
    // A shrink gate: a wall at full size; shrunk, you go through.
    G.resetMech(); G.resetPower();
    const qd = { x: q.nx, y: q.ny };
    put(off(q, -45)); run(1.2, qd);
    const through = () => (G.ball.x - q.x) * q.nx + (G.ball.y - q.y) * q.ny;
    check('a shrink gate stops you at full size (a wall, never a hit)', through() < 0, through().toFixed(1));
    G.giveItem('shrink'); G.useItem();
    run(1);
    run(1.2, qd);
    check('...shrunk (by the lightning), you get through', G.scale <= 0.51 && through() > 20, through().toFixed(1));
    // A gap: no way over on foot; a Magic carpet floats you across.
    G.resetMech(); G.resetPower();
    S.gameplay.rule = 'casual'; // edges are walls: the attempt on foot can't hurt
    const gd = { x: gp.b.x - gp.a.x, y: gp.b.y - gp.a.y }, gl = Math.hypot(gd.x, gd.y); gd.x /= gl; gd.y /= gl;
    put(gp.a); run(2, gd);
    const toB = () => Math.hypot(G.ball.x - gp.b.x, G.ball.y - gp.b.y);
    check('a gap can\'t be crossed on foot', toB() > gl * 0.5, Math.round(toB()));
    S.gameplay.rule = 'normal';
    put(gp.a); G.giveItem('carpet'); G.useItem();
    run(gl / 140 + 0.2, gd); run(0.3);
    check('...a Magic carpet floats you across it', toB() < 30 && !G.hitAt(G.ball.x, G.ball.y) && !G.fx.bubble, Math.round(toB()));
    G.quit();
    G.startTrial(14);
    check('item boxes are there in Time Trial too (it has no mystery boxes)', G.maze.gboxes.length >= 2 && !G.boxesOn());
    G.quit();

    // ----- Gauntlet -----
    G.startGauntlet({ seedText: 'same', style: 'progressive', diff: 'normal' });
    const e1 = JSON.stringify(G.maze.edges.map((e) => [e.a, e.b]));
    G.quit();
    G.startGauntlet({ seedText: 'same', style: 'progressive', diff: 'normal' });
    check('Gauntlet: the same seed gives the same run', JSON.stringify(G.maze.edges.map((e) => [e.a, e.b])) === e1);
    G.quit();
    const deep = [0, 5, 10, 20].map((d) => L.gauntletLevel({ style: 'progressive', diff: 'normal', seed: 1 }, d));
    check('Gauntlet Progressive goes deeper and harder', deep.every((x, i) => !i || x > deep[i - 1]), deep.join(' < '));
    const rnd = Array.from({ length: 30 }, (_, d) => L.gauntletLevel({ style: 'random', diff: 'hard', seed: 7 }, d));
    check('Gauntlet Random stays inside its difficulty band', rnd.every((x) => x >= L.GAUNTLET.hard.span[0] && x <= L.GAUNTLET.hard.span[1]) && new Set(rnd).size > 5, Math.min(...rnd) + '-' + Math.max(...rnd));
    check('every tenth Gauntlet maze is a boss', L.gauntletParams({ style: 'progressive', diff: 'easy', seed: 3 }, 9).boss && !L.gauntletParams({ style: 'progressive', diff: 'easy', seed: 3 }, 8).boss);
    G.startGauntlet({ diff: 'easy' });
    check('Easy Gauntlet has unlimited lives', G.run.lives === Infinity);
    G.giveItem('shrink'); G.giveItem('heart');
    G.run.cleared++; G.nextGauntlet(); // what a clear does once the win media is over
    check('Gauntlet: the item in your slot and your Extra hit shields come along to the next maze', G.item === 'shrink' && G.bonus === 1 && G.run.cleared === 1);
    G.roll = { t: 0.2, id: 'carpet' }; // still spinning as the maze is cleared
    G.win();
    check('Gauntlet: a spin still going when you clear lands at once, and that item comes along', G.item === 'carpet' && !G.roll);
    G.quit();
    G.startGauntlet({ diff: 'easy' });
    check('...but a new run starts empty-handed', !G.item && !G.bonus);
    G.quit();
    // Gauntlet gems: their own count, paying out every few.
    const P = MZ.Save.progress, main0 = P.stats.gems, gg0 = P.gauntletGems || 0;
    G.startGauntlet({ diff: 'normal' });
    const lives0 = G.run.lives;
    for (let i = 0; i < G.GEM_CHARM; i++) G.gauntletGem();
    check('Gauntlet: every few gems pay out a life at once', G.run.lives === lives0 + 1 && G.run.gems === G.GEM_CHARM, lives0 + ' -> ' + G.run.lives);
    G.gemsTaken = 3; G.win();
    check('Gauntlet gems are counted apart from the main levels\' gems', P.stats.gems === main0 && P.gauntletGems === gg0 + G.GEM_CHARM, P.stats.gems + ' / ' + P.gauntletGems);
    G.quit();
    G.startGauntlet({ diff: 'easy' });
    for (let i = 0; i < G.GEM_CHARM; i++) G.gauntletGem();
    check('...on Easy (lives unlimited) they pay out an Extra hit instead', G.bonus === 1);
    G.quit();
    return res;
  });
  let bad = 0;
  for (const r of out) { if (!r.ok) bad++; console.log((r.ok ? 'ok   ' : 'FAIL ') + r.name + (r.info ? '  (' + r.info + ')' : '')); }
  for (const e of errors) console.log('pageerror ' + e);
  console.log(out.length - bad + '/' + out.length + ' checks passed' + (errors.length ? ', ' + errors.length + ' page errors' : ''));
  await browser.close();
  process.exit(bad || errors.length ? 1 : 0);
})();
