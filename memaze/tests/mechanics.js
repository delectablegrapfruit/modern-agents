// The level mechanics and modes, played with the real game code in Chromium (from file://): doors and keys, one-way
// gates, switches, portals, moving platforms, ice, darkness, remix modifiers, chapters and bosses, Gauntlet settings and
// its Tox Boxes, and the menu. Exits 1 on any failed check or page error.
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
    const hits = [], losses = [];
    G.on('hit', () => hits.push(G.t));
    G.on('lose', (why) => losses.push(why));
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

    // ----- stars -----
    G.startJourney(21);
    const parT = G.maze.parTime, starsAt = (t) => { G.elapsed = t; G.gemsTaken = 0; return G.results().stars; };
    const sUnder = starsAt(parT - 0.5), sAt = starsAt(parT), sOver = starsAt(parT + 0.01);
    check('a star for beating par (at or under it), none for going over', sUnder === sAt && sAt === sOver + 1, [sUnder, sAt, sOver].join(' / '));
    MZ.Save.progress.journey.levels[21] = undefined; delete MZ.Save.progress.journey.levels[21]; MZ.Save.saveProgress();
    G.quit();

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
    let ice = null; // the longest straight stretch of ice: start a third of the way along it (well clear of any junction, where
    for (const e of m.edges) if (e.ice) for (let i = 1; i < e.pts.length; i++) { const P = e.pts[i - 1], Q = e.pts[i], l = Math.hypot(Q.x - P.x, Q.y - P.y); if (!ice || l > ice.l) ice = { P, Q, l }; } // the floor may be another corridor's)
    const dir = { x: (ice.Q.x - ice.P.x) / ice.l, y: (ice.Q.y - ice.P.y) / ice.l };
    G.pieces = null; put({ x: ice.P.x + dir.x * ice.l * 0.3, y: ice.P.y + dir.y * ice.l * 0.3 });
    const onIce = !!G.world.query(G.ball.x, G.ball.y, G.playT).seg.ice;
    run(0.3, dir, 80);
    const p0 = { x: G.ball.x, y: G.ball.y };
    run(0.35); // let go
    check('on ice you keep sliding after you stop', onIce && Math.hypot(G.ball.x - p0.x, G.ball.y - p0.y) > 3, Math.hypot(G.ball.x - p0.x, G.ball.y - p0.y).toFixed(1));
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
    for (let i = 0; i < 60 * 6 && !back; i++) { run(1 / 60); back = !gb.out; } // (a carpet is spent after 3.5 s, then 1.5 s)
    check('...and it comes back once that item is spent, so a wasted one can be fetched again', back);
    // A Shrink way: too narrow for you at full size (its walls hold you out, no hit); shrunk, you go through.
    G.resetMech(); G.resetPower(); hits.length = 0;
    check('nothing at an item obstacle says which item: no badges, no coloured gates or ghosts', !G.renderer.drawSqueeze && !G.renderer.drawGap && !G.renderer.drawLedge && typeof G.renderer.drawBreak === 'function' && m.crawls.length >= 1 && m.edges.filter((e) => e.crawl).every((e) => e.hw * 2 < G.box() * 0.9));
    const qd = { x: q.nx, y: q.ny };
    put(off(q, -45)); run(1.2, qd);
    const through = () => (G.ball.x - q.x) * q.nx + (G.ball.y - q.y) * q.ny;
    check('a Shrink way is too narrow for you: at full size you can\'t get in (its walls hold you, never a hit)', through() < 0 && !hits.length, through().toFixed(1));
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

    // ----- Gauntlet's Tox Boxes -----
    check('no Tox Boxes outside the Gauntlet', [3, 12, 25].every((lv) => !(L.build(L.levelParams(lv)).toxes || []).length));
    G.startGauntlet({ diff: 'hard', seedText: 'tox' });
    for (let d = 1; d < 12 && !G.maze.toxes.some((b) => b.route); d++) { G.run.cleared = d; G.nextGauntlet(); }
    const tx = G.maze.toxes.find((b) => b.route);
    check('the Gauntlet has Tox Boxes, some on the route', !!tx, G.maze.toxes.length);
    const gm = G.maze, gdeg = gm.nodes.map(() => 0);
    for (const e of gm.edges) { gdeg[e.a]++; gdeg[e.b]++; }
    check('Gauntlet mazes are stone grids (after the Cyclone Stone): straight corridors, long lanes cut right across', gm.lattice === 'square' && gm.edges.every((e) => e.pts.length === 2) && gm.lanes.length >= 1 && gm.lanes.every((l) => l.length >= 5), gm.lanes.map((l) => l.length - 1).join('+') + ' cells');
    check('...with Tox Boxes tumbling along the lanes, right through the junctions', gm.toxes.some((b) => b.lane && gm.nodes.some((v, i) => gdeg[i] >= 3 && b.tiles.slice(1, -1).some((T) => Math.hypot(T.x - v.x, T.y - v.y) < b.s / 2))));
    check('...each tumbling along the floor, with a hollow tile between the ends of its track', G.maze.toxes.every((b) => b.tiles.every((T) => G.world.query(T.x, T.y, G.playT).depth > b.s * 0.3) && b.tiles.some((T, k) => k > 0 && k < b.n && MZ.toxFace(b, k) === 0)));
    const buf = G.box() * 0.035, step = tx.roll + tx.rest, end0 = tx.end;
    const at = (c) => { tx.phase = c - (G.playT + 1 / 60); }; // the box's own clock reads c on the next frame
    const fresh = () => { G.pieces = null; G.hp = 2; G.bonus = 0; G.guardT = 0; G.stuck = false; G.fx = {}; G.scale = 1; hits.length = 0; };
    const T0 = tx.tiles[0], T1 = tx.tiles[1], rev = { x: -T1.ux, y: -T1.uy };
    fresh(); tx.end = 30; at(1); put(T1);
    run(0.6, rev);
    check('a Tox Box at rest is solid: you can\'t move into it (and bumping it doesn\'t hurt)', G.toxCover(T0, tx.s / 2 - buf, G.ball.x, G.ball.y) === 'none' && Math.hypot(G.ball.x - T1.x, G.ball.y - T1.y) > 3 && !hits.length, Math.hypot(G.ball.x - T1.x, G.ball.y - T1.y).toFixed(0));
    tx.end = end0;
    const tSolid = tx.tiles.findIndex((T, k) => k > 0 && MZ.toxFace(tx, k) !== 0), tHollow = tx.tiles.findIndex((T, k) => k > 0 && MZ.toxFace(tx, k) === 0);
    const onto = (k) => tx.end + (k - 1) * step; // (going up the track) when it starts tumbling onto tile k
    const roll0 = tx.roll, fwd = { x: T0.ux, y: T0.uy };
    fresh(); tx.roll = 6; at(tx.end + 6 * Math.sqrt(0.2)); put({ x: T0.x - fwd.x * tx.s * 0.95, y: T0.y - fwd.y * tx.s * 0.95 }); // (tumbling slowly off tile 0, you just behind it)
    const tp0 = { x: G.ball.x, y: G.ball.y };
    run(0.8, fwd);
    const foot = MZ.toxFoot(tx, MZ.toxAt(tx, G.playT));
    check('a tumbling Tox Box is solid too: you can follow it, never go through it', MZ.toxAt(tx, G.playT).f > 0 && G.toxCover(foot, foot.hl - buf, G.ball.x, G.ball.y, foot.hs - buf) === 'none' && Math.hypot(G.ball.x - tp0.x, G.ball.y - tp0.y) > 5 && !hits.length, Math.hypot(G.ball.x - tp0.x, G.ball.y - tp0.y).toFixed(0) + ' followed');
    tx.roll = roll0;
    const Tk = tx.tiles[tSolid];
    fresh(); at(onto(tHollow) - 0.05); put(tx.tiles[tHollow]);
    run(0.05 + tx.roll + 0.05);
    const Th = tx.tiles[tHollow], held0 = { x: G.ball.x, y: G.ball.y };
    check('...but on a hollow tile it comes down hollow side down over you: no hit, you\'re inside', !hits.length && G.toxInside() === 1);
    run(0.2, rev);
    check('...and it holds you in until it tumbles on', G.toxCover(Th, tx.s / 2 + 2 * buf, G.ball.x, G.ball.y) === 'all' && Math.hypot(G.ball.x - held0.x, G.ball.y - held0.y) < tx.s * 0.5, Math.hypot(G.ball.x - held0.x, G.ball.y - held0.y).toFixed(0));
    run(tx.rest + tx.roll + 0.05);
    const was = { x: G.ball.x, y: G.ball.y };
    run(0.4, rev);
    check('...then you\'re free, on its other side', !hits.length && Math.hypot(G.ball.x - was.x, G.ball.y - was.y) > 30 && G.toxInside() === 0);
    fresh(); G.giveItem('star'); G.useItem(); tx.end = 30; at(1); put(T1);
    run(0.5, rev);
    check('Invincible doesn\'t get you through: still solid', G.toxCover(T0, tx.s / 2 - buf, G.ball.x, G.ball.y) === 'none' && !hits.length);
    tx.end = end0;
    losses.length = 0; at(onto(tSolid) - 0.05); put(Tk);
    run(0.05 + tx.roll + 0.1);
    const pin0 = { x: G.ball.x, y: G.ball.y }, pinned = G.toxPin === tx, hidden = parseFloat(document.querySelector('#player').firstElementChild.style.opacity) === 0;
    run(0.3, rev);
    check('slammed while Invincible: no life lost, but pinned under it, out of sight, and stuck', !losses.length && pinned && hidden && Math.hypot(G.ball.x - pin0.x, G.ball.y - pin0.y) < 1, [losses.join(',') || 'no loss', pinned ? 'pinned' : 'free', hidden ? 'hidden' : 'shown'].join(', '));
    let freed = 0;
    for (let i = 0; i < 60 * 4 && G.toxPin; i++) { run(1 / 60); freed += 1 / 60; }
    const fr0 = { x: G.ball.x, y: G.ball.y };
    run(0.4, rev);
    check('...until it tumbles off you: then you move freely', !G.toxPin && Math.hypot(G.ball.x - fr0.x, G.ball.y - fr0.y) > 20 && !losses.length, 'after ' + freed.toFixed(2) + ' s');
    fresh(); losses.length = 0; at(onto(tSolid) - 0.05); put(Tk);
    run(0.05 + tx.roll + 0.1);
    check('otherwise, in its path as it slams down: that loses a life', losses.length === 1 && losses[0] === 'crush', losses.join(',') || 'no loss');
    G.quit();

    // ----- the Gauntlet's item puzzles, and its goals -----
    G.startGauntlet({ diff: 'extreme', seedText: 'items' });
    const scanFor = (want) => { for (let d = 0; d < 40; d++) if (want(L.build(L.gauntletParams(G.run, d)))) return d; return -1; };
    const gLd = scanFor((mm) => mm.gaps.some((q) => q.ledge)), gCr = scanFor((mm) => mm.crawls.length > 0), gCp = scanFor((mm) => mm.gaps.some((q) => !q.ledge && q.chain && q.chain.length > 1));
    check('Gauntlet item puzzles ask more: Launch ledges, long Magic carpet floats, Shrink crawlspaces', gLd >= 0 && gCr >= 0 && gCp >= 0, [gLd, gCr, gCp].join(', '));
    check('...and never a plain gap or shrink gate', [0, 6, 12, 18, 24].every((d) => { const mm = L.build(L.gauntletParams(G.run, d)); return mm.gaps.every((q) => q.chain) && mm.squeezes.length === 2 * mm.crawls.length; }));
    const deadEnd = (mm) => mm.edges.filter((e) => e.a === mm.mainPath[mm.mainPath.length - 1] || e.b === mm.mainPath[mm.mainPath.length - 1]).length === 1;
    check('GOAL is always at a dead end (nothing lies beyond it)', [0, 5, 10, 15, 20, 25].every((d) => deadEnd(L.build(L.gauntletParams(G.run, d)))) && [21, 30, 44, 60].every((lv) => deadEnd(L.build(L.levelParams(lv)))));
    // A ledge: nothing says where you'll land, and clouds cover it, until you Launch off it.
    G.run.cleared = gLd; G.nextGauntlet(); fresh();
    const gLg = G.maze.gaps.find((q) => q.ledge);
    put(gLg.a);
    check('a Launch ledge: where it comes down is under cloud', gLg.fog === 1 && !gLg.revealed);
    const gLdir = { x: (gLg.b.x - gLg.a.x) / Math.hypot(gLg.b.x - gLg.a.x, gLg.b.y - gLg.a.y), y: (gLg.b.y - gLg.a.y) / Math.hypot(gLg.b.x - gLg.a.x, gLg.b.y - gLg.a.y) };
    while (G.world.query(G.ball.x + gLdir.x * 2, G.ball.y + gLdir.y * 2, G.playT).depth > G.box() * 0.62) { G.ball.x += gLdir.x * 2; G.ball.y += gLdir.y * 2; } // out to the broken edge
    G.giveItem('launch'); G.useItem();
    const gLdist = Math.hypot(gLg.b.x - G.ball.x, gLg.b.y - G.ball.y);
    run(Math.min(1.4, gLdist / 300), gLdir, 300); run(1.6 - Math.min(1.4, gLdist / 300));
    const gLb = Math.hypot(G.ball.x - gLg.b.x, G.ball.y - gLg.b.y), gLa = Math.hypot(G.ball.x - gLg.a.x, G.ball.y - gLg.a.y);
    check('...Launch off it and the clouds part as you rise: steer to the far side and land', gLg.revealed && gLg.fog === 0 && gLb < gLa && !G.hitAt(G.ball.x, G.ball.y) && !hits.length && !G.fx.bubble, Math.round(gLb) + ' from its far end');
    // A long float: several corridors gone, the carpet's whole run.
    G.run.cleared = gCp; G.nextGauntlet(); fresh();
    const gCarp = G.maze.gaps.find((q) => !q.ledge && q.chain && q.chain.length > 1), gCd = Math.hypot(gCarp.b.x - gCarp.a.x, gCarp.b.y - gCarp.a.y);
    check('a Magic carpet float: two or more corridors gone, far across the void', gCarp.item === 'carpet' && gCd >= 200 && gCarp.chain.every((id) => !G.maze.edges.some((e) => e.id === id)), Math.round(gCd));
    put(gCarp.a); G.giveItem('carpet'); G.useItem();
    run(gCd / 170 + 0.05, { x: (gCarp.b.x - gCarp.a.x) / gCd, y: (gCarp.b.y - gCarp.a.y) / gCd }, 170); run(3.6);
    check('...float straight across without dawdling and you make it', Math.hypot(G.ball.x - gCarp.b.x, G.ball.y - gCarp.b.y) < 25 && !hits.length && !G.fx.bubble);
    // A long Shrink way: narrow and winding; Shrink has to last all the way through.
    G.run.cleared = gCr; G.nextGauntlet(); fresh();
    const gCrw = G.maze.crawls[0], gCrE = G.maze.edges.filter((e) => e.crawl), gCmid = gCrw.pts[Math.floor(gCrw.pts.length / 2)];
    check('a long Shrink way: too narrow for you all along, a stop just inside each mouth', gCrE.length > 1 && gCrE.every((e) => e.hw * 2 < G.box() * 0.9) && G.maze.squeezes.filter((q) => gCrE.some((e) => e.id === q.edge)).length === 2);
    put(gCrw.from);
    const gCin = { x: gCrw.pts[1].x - gCrw.from.x, y: gCrw.pts[1].y - gCrw.from.y }, gCl = Math.hypot(gCin.x, gCin.y);
    run(1, { x: gCin.x / gCl, y: gCin.y / gCl }, 100);
    check('...full size, you can\'t get in (no hit)', Math.hypot(G.ball.x - gCrw.from.x, G.ball.y - gCrw.from.y) < 40 && !hits.length);
    fresh(); G.scale = 0.5; G.fx.shrink = 0.06; put(gCmid); run(0.1);
    check('...and if Shrink runs out inside, you\'re squeezed: a hit, and a bubble back out to its mouth', hits.length === 1 && !!G.fx.bubble);
    run(3);
    check('...where there\'s room to grow back', Math.hypot(G.ball.x - gCrw.from.x, G.ball.y - gCrw.from.y) < 30 && !G.fx.bubble && G.scale > 0.9, G.scale.toFixed(2));
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
  // Your own picture: cut to a shape (a circle unless you choose otherwise), and that shape is its hitbox. The built-in
  // pictures keep their own.
  const shp = await page.evaluate(async () => {
    const G = MZ.Game, S = MZ.Save.settings, wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    c.getContext('2d').fillStyle = '#e33'; c.getContext('2d').fillRect(0, 0, 64, 64); // a square photo, opaque all over
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    const [item] = await MZ.Media.importFiles([new File([blob], 'photo.png', { type: 'image/png' })], 'player');
    const res = { def: S.player.shape }, was = S.player.media, look = async () => { G.applySettings(); await wait(400); G.sprite.update(performance.now(), true); const k = G.sprite.mask; return k ? { maxR: k.maxR, cells: k.cells } : null; };
    S.player.media = item.id;
    for (const sh of ['circle', 'square', 'heart', 'original']) { S.player.shape = sh; res[sh] = await look(); }
    S.player.media = 'default:sticker';
    S.player.shape = 'circle'; const b1 = await look();
    S.player.shape = 'square'; const b2 = await look();
    res.builtin = !!b1 && !!b2 && b1.cells === b2.cells;
    S.player.media = was; S.player.shape = 'circle'; G.applySettings();
    await MZ.Media.remove(item.id);
    return res;
  });
  const full = 96 * 96;
  out.push({ name: 'your own picture is cut to a circle by default, and that is its hitbox', ok: shp.def === 'circle' && shp.circle && shp.circle.maxR < 0.53 && Math.abs(shp.circle.cells / full - Math.PI / 4) < 0.04, info: shp.circle && (shp.circle.cells / full).toFixed(3) });
  out.push({ name: '...or to the shape you choose (square, heart...), or left as it is', ok: shp.square && shp.square.maxR > 0.69 && shp.heart && shp.heart.cells < shp.circle.cells * 0.9 && shp.original && shp.original.cells > full * 0.95, info: [shp.square, shp.heart, shp.original].map((x) => x && (x.cells / full).toFixed(2)).join(' / ') });
  out.push({ name: '...while the built-in pictures keep their own shape', ok: shp.builtin, info: '' });
  let bad = 0;
  for (const r of out) { if (!r.ok) bad++; console.log((r.ok ? 'ok   ' : 'FAIL ') + r.name + (r.info ? '  (' + r.info + ')' : '')); }
  for (const e of errors) console.log('pageerror ' + e);
  console.log(out.length - bad + '/' + out.length + ' checks passed' + (errors.length ? ', ' + errors.length + ' page errors' : ''));
  await browser.close();
  process.exit(bad || errors.length ? 1 : 0);
})();
