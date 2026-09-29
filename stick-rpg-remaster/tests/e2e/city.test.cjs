// tests/e2e/city.test.cjs — owner: W2-City. The `city` scene in the real page (index.html over
// file://; BUILD_PLAN §4.1, UI.md §5.5 and §4.1): the HUD on the map (W1-D's HUD, the minimap with
// its doors and your arrow, the ContextPrompt within 96 u, the touch cluster on touch screens),
// Leave bringing you out of the building's door, the nomination check on stepping into the city,
// Interact entering doors and opening a street person's dialog, click / tap to walk, the Pocket,
// Pause, minimap and minimal-HUD keys, the Fold Rescue (-10 HP, no time, the landing ≥ 64 u inside,
// Pilot Ori's line), a fall at 10 HP reaching the hospital (Standard) and death (Hardcore), the car
// fished out of the clouds, the 24:00 state, the day and night songs, the cab stub (P1, `phone`),
// the knockdown's presentation, the a11y audit of the city's own controls, and zero console errors.
// Screenshots go to shots/W2-City/.
//   node tests/e2e/city.test.cjs
'use strict';
const path = require('path');
const h = require('../harness.cjs');
const A = require('./a11y.test.cjs');

const SHOTS = path.join(h.ROOT, 'shots', 'W2-City');

(async () => {
  const T = h.suite('e2e city (W2-City)');
  const t = await h.open({ fast: true });
  const { page } = t;
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const clearToasts = () => ev(() => { if (window.SR.ui.toast.clear) window.SR.ui.toast.clear(); });
  const settle = async () => { await t.step(1); await t.step(100); };

  await ev(() => {
    const SR = window.SR;
    window.W2C = {
      run(sec, input) { for (let i = 0; i < Math.round(sec * 60); i++) SR.world.update(1 / 60, input || { x: 0, y: 0, skate: false }); },
      promptText() { const el = document.querySelector('#ui [data-id="context-prompt"]'); return el && el.classList.contains('is-shown') ? el.textContent.replace(/\s+/g, ' ').trim() : ''; },
      toasts() { return SR.ui.toast.list().map((x) => x.text); },
    };
  });

  // ------------------------------------------------------------------------------------------------
  T.section('the HUD on the map');
  await t.newGame({ seed: 21 });
  await t.enter('home');
  await t.press('back');
  await t.step(2);
  const hud = await ev(() => {
    const SR = window.SR, root = document.querySelector('#ui [data-scene="city"]');
    const mini = root && root.querySelector('[data-id="minimap"]'), cv = root && root.querySelector('[data-id="minimap-canvas"]');
    const px = cv ? cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data : [];
    let ink = 0;
    for (let i = 3; i < px.length; i += 4) if (px[i] > 0) ink++;
    const box = mini ? mini.getBoundingClientRect() : null;
    return { scenes: SR.scenes.stack(), hud: !!(root && root.querySelector('[data-id="hud"]')), compact: !!(root && root.querySelector('.hud.is-compact')),
      prompt: !!(root && root.querySelector('[data-id="context-prompt"]')), mini: !!mini && !mini.hidden, ink, draws: SR.render.minimap.draws,
      box: box && [Math.round(box.left), Math.round(box.top), Math.round(box.width), Math.round(box.height)],
      touch: root && root.querySelector('[data-id="city-touch"]').hidden, door: [SR.world.player.x, SR.world.player.y], exit: SR.world.geometry.doorById.home_apt.exit };
  });
  T.eq(hud.scenes, ['city'], 'Leave takes you from the apartment to the city');
  T.eq(hud.door, [hud.exit.x, hud.exit.y], 'standing outside the home door (params.from)');
  T.ok(hud.hud && !hud.compact && hud.prompt, 'the full city HUD and the ContextPrompt are mounted');
  T.ok(hud.mini && hud.ink > 5000 && hud.draws > 0, 'the minimap is drawn (' + hud.ink + ' inked pixels)');
  T.eq(hud.box, [1080, 520, 184, 184], 'the minimap sits at 1080-1264 × 520-704 (UI.md §2.2)');
  T.eq(hud.touch, true, 'no touch buttons on a desktop');
  // The minimap shows the doors (a dot in the building's colour) and you (an arrow in your karma
  // colour): read its pixels back at each door's and the player's minimap point.
  const mm = await ev(() => {
    const SR = window.SR, G = SR.world.geometry, P = SR.world.player, MM = SR.render.minimap;
    const cv = document.querySelector('#ui [data-id="minimap-canvas"]');
    MM.tick(cv, 0, true);
    const k = cv.width / MM.SIZE, img = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height);
    const rgb = (c) => { const n = parseInt(String(c).replace('#', '').slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
    // The closest colour to `want` within 2 px of a world point's minimap spot (dots are antialiased).
    const best = (x, y, want) => {
      const p = MM.toMap(x, y), w = rgb(want);
      let d = 1e9;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const i = ((Math.round(p.y * k) + dy) * cv.width + Math.round(p.x * k) + dx) * 4;
        d = Math.min(d, Math.abs(img.data[i] - w[0]) + Math.abs(img.data[i + 1] - w[1]) + Math.abs(img.data[i + 2] - w[2]));
      }
      return d;
    };
    const doors = G.doors.filter((d) => Math.hypot(d.x - P.x, d.y - P.y) > 150).map((d) => {
      const b = G.buildings[d.building], key = (b && b.def && b.def.exterior && b.def.exterior.palette) || 'bld.' + d.building;
      return { id: d.id, off: best(d.x, d.y, SR.render.lib.pal([key + '.walls', 'bld.default.walls'], 0.5)) };
    });
    return { doors, n: G.doors.length, player: best(P.x, P.y, SR.art.stick.karmaColor(SR.state.stats.karma)) };
  });
  T.ok(mm.doors.length >= mm.n - 2 && mm.doors.every((d) => d.off <= 30), 'the minimap shows every door as a dot in its building\'s colour', mm.doors.filter((d) => d.off > 30));
  T.ok(mm.player <= 30, 'and you as an arrow in your karma colour (off by ' + mm.player + ')');
  const a11y = await t.eval(A.audit, '#ui [data-scene="city"]');
  T.eq(a11y.issues, [], 'the city\'s controls have names, roles and contrast (' + a11y.controls + ' controls)');
  await clearToasts();
  await settle();
  await t.shot(path.join(SHOTS, 'city-home-morning.png'));

  T.section('back from a building: outside its door');
  await t.enter('mcsticks');
  await t.press('back');
  await t.step(2);
  const back = await ev(() => { const SR = window.SR, d = SR.world.geometry.doorById.mcsticks; return { at: [SR.world.player.x, SR.world.player.y], exit: [d.exit.x, d.exit.y], scenes: SR.scenes.stack() }; });
  T.eq([back.scenes, back.at], [['city'], back.exit], 'Leave McSticks: 56 u outside its door');

  // ------------------------------------------------------------------------------------------------
  T.section('stepping into the city runs the nomination check');
  const nom = await ev(() => {
    const SR = window.SR;
    SR.debug.newGame({ seed: 22 });
    SR.debug.set({ homes: { owned: ['apt', 'castle'], living: 'castle' }, money: { cash: 250000 }, stats: { str: 700, int: 700, cha: 700, hpMax: 715, hp: 715, karma: 40 } });
    const before = SR.state.election.status;
    const seen = [];
    const off = SR.events.on('action:done', (p) => seen.push(p.id));
    SR.ui.toast.clear();
    SR.debug.goto('city');
    off();
    return { before, after: SR.state.election.status, path: SR.state.election.path, ran: seen.indexOf('world.city') >= 0, toasts: window.W2C.toasts() };
  });
  T.eq([nom.before, nom.after, nom.path], ['none', 'nominated', 'president'], 'a qualifying player stepping into the city is nominated (GDD §4.17)');
  T.ok(nom.ran && nom.toasts.length > 0, 'through the silent world.city action, with its toast', nom.toasts);

  // ------------------------------------------------------------------------------------------------
  T.section('the ContextPrompt and Interact');
  await t.newGame({ seed: 23 });
  await t.goto('city');
  const prompts = await ev(() => {
    const SR = window.SR, X = window.W2C, W = SR.world, d = W.geometry.doorById.mcsticks, out = {};
    W.teleport(d.x + 80, d.y); X.run(0.1); SR.loop.step(1);
    out.near = X.promptText();
    W.teleport(d.x + 130, d.y); X.run(0.1); SR.loop.step(1);
    out.tagOnly = X.promptText();
    W.teleport(d.x + 300, d.y); X.run(0.1); SR.loop.step(1);
    out.far = X.promptText();
    // By car: park and enter at the kerb.
    SR.debug.set({ player: { cars: { junker: { owned: true, x: d.kerb[0], y: d.kerb[1] - 40, a: Math.PI / 2, towed: false } } } });
    W.teleport(d.kerb[0] + 40, d.kerb[1] - 40); X.run(0.1); SR.loop.step(1);
    out.getIn = X.promptText();
    SR.debug.press('car'); X.run(0.1); SR.loop.step(1);
    out.driving = SR.world.player.car;
    out.park = X.promptText();
    SR.debug.press('car'); X.run(0.1);
    return out;
  });
  T.ok(/Enter McSticks/.test(prompts.near), 'within 96 u: "[E] Enter McSticks" (' + prompts.near + ')');
  T.eq([prompts.tagOnly, prompts.far], ['', ''], 'from 96 u on, no prompt (a plain door tag only, drawn on the canvas)');
  T.ok(/Get in the car/.test(prompts.getIn), 'by your car: "[C] Get in the car" (' + prompts.getIn + ')');
  T.ok(prompts.driving === 'junker' && /Park and enter/.test(prompts.park) && /McSticks/.test(prompts.park), 'driving by the kerb: "Park and enter McSticks" (' + prompts.park + ')');
  const enter = await ev(() => { const SR = window.SR, d = SR.world.geometry.doorById.mcsticks; SR.world.teleport(d.x + 70, d.y); window.W2C.run(0.1); SR.debug.press('interact'); return SR.scenes.stack(); });
  T.eq(enter, ['building'], 'Interact enters the prompted door');
  await t.press('back');
  await t.step(2);

  T.section('a street person: the dialog entry (a test person until W2-Street lands)');
  const talk = await ev(() => {
    const SR = window.SR, W = SR.world, X = window.W2C;
    if (!SR.reg.person.testguy) SR.def.person('testguy', { name: 'ori.name', look: 'ori', voice: 1, schedule: [] });
    if (!SR.reg.action['testguy.wave']) SR.def.action('testguy.wave', { building: 'street:testguy', group: 'special', order: 1, label: 'act.world.action', p: 0, timeRule: 'free', effects: [['karma', 1]] });
    const had = W.streetnpcs;
    window.__hadNpcs = had;
    W.streetnpcs = { people: [{ id: 'testguy', x: 2230, y: 2600, facing: 180, state: 'pause', visible: true }], update() {} };
    W.teleport(2230, 2660); X.run(0.1); SR.loop.step(1);
    const prompt = X.promptText();
    const k0 = SR.state.stats.karma;
    SR.debug.press('interact');
    SR.loop.step(1);
    const stack = SR.scenes.stack(), choices = Array.from(document.querySelectorAll('#ui [data-id^="choice-"]')).map((b) => b.getAttribute('data-id'));
    return { prompt, stack, choices, k0 };
  });
  T.ok(/Talk to Pilot Ori/.test(talk.prompt), 'within 96 u of a street person: "[E] Talk to ..." (' + talk.prompt + ')');
  T.ok(talk.stack[talk.stack.length - 1] === 'dialog' && talk.choices.indexOf('choice-testguy.wave') >= 0 && talk.choices.indexOf('choice-leave') >= 0,
    'Interact opens the Dialog sheet with the person\'s street actions and Leave', talk);
  await t.step(1);
  await clearToasts();
  await t.shot(path.join(SHOTS, 'city-street-dialog.png'));
  await t.clickUI('choice-testguy.wave');
  await t.step(2);
  const talked = await ev(() => ({ k: window.SR.state.stats.karma, stack: window.SR.scenes.stack() }));
  T.eq([talked.k - talk.k0, talked.stack], [1, ['city']], 'picking a choice runs its action through SR.act and closes the sheet');

  // One key fires several actions (E / Enter / Space: interact and confirm; Esc: back and pause).
  // With instant text (fast mode, or access.typewriterCps 0) the press that opens a dialog must not
  // also pick its first choice, and the Esc that closes a scene must not also open the pause menu.
  T.section('one key, several actions: E talks without choosing, Esc leaves without pausing');
  const keyTalk = [];
  for (const key of ['KeyE', 'Enter', 'Space']) {
    const k0 = await ev(() => { const SR = window.SR; SR.world.teleport(2230, 2660); window.W2C.run(0.1); SR.loop.step(1); return SR.state.stats.karma; });
    await t.key(key);
    await t.step(2);
    const open = await ev(() => ({ stack: window.SR.scenes.stack(), karma: window.SR.state.stats.karma }));
    await t.key('Escape');
    await t.step(2);
    keyTalk.push({ key, opened: open.stack.join(), picked: open.karma !== k0, afterEsc: (await t.scenes()).join() });
  }
  T.ok(keyTalk.every((r) => r.opened === 'city,dialog' && !r.picked), 'E, Enter and Space open the street dialog and pick nothing (instant text)', keyTalk);
  T.ok(keyTalk.every((r) => r.afterEsc === 'city'), 'Esc closes the dialog without opening the pause menu', keyTalk);
  await ev(() => { window.SR.world.streetnpcs = window.__hadNpcs; });
  const real = await ev(() => {
    const SR = window.SR, S = SR.world.streetnpcs;
    if (!S || typeof S.talk !== 'function') return null;
    SR.debug.setTime(720); window.W2C.run(0.5);
    const e = SR.world.entities('person').find((q) => q.id === 'harold' && q.visible !== false);
    if (!e) return null;
    SR.world.teleport(e.x, e.y + 60); window.W2C.run(0.1); SR.loop.step(1);
    return { cash: SR.state.money.cash, min: SR.state.clock.min, prompt: (SR.scenes.get('city').debug.prompt() || {}).key };
  });
  if (real) {
    await t.key('KeyE');
    await t.step(2);
    const got = await ev(() => ({ stack: window.SR.scenes.stack(), cash: window.SR.state.money.cash, min: window.SR.state.clock.min }));
    await t.key('Escape');
    await t.step(2);
    const back = await t.scenes();
    T.ok(real.prompt === 'talk:harold' && got.stack.join() === 'city,dialog' && got.cash === real.cash && got.min === real.min && back.join() === 'city',
      'with W2-Street\'s people: E opens Harold\'s dialog without giving him $10, Esc closes it', { real, got, back });
  }
  await t.enter('mcsticks');
  await t.step(2);
  await t.key('Escape');
  await t.step(2);
  const leave = await t.scenes();
  await t.key('Escape');
  await t.step(2);
  const paused = await t.scenes();
  await t.key('Escape');
  await t.step(2);
  const unpaused = await t.scenes();
  T.eq([leave, paused, unpaused], [['city'], ['city', 'pause'], ['city']], 'Esc leaves a building for the city (no pause menu); in the city Esc opens Pause, and Esc closes it again');

  T.section('knocked down; the street people\'s barks');
  const knock = await ev(() => {
    const SR = window.SR, W = SR.world, P = W.player, d = W.geometry.doorById.mcsticks, out = {};
    W.teleport(d.x + 70, d.y); window.W2C.run(0.1);
    P.knock(1.14);
    SR.debug.press('interact');
    out.door = SR.scenes.stack().join();
    SR.debug.set({ player: { cars: { junker: { owned: true, x: d.x + 70, y: d.y + 60, a: 0, towed: false } } } });
    SR.debug.press('car');
    out.car = P.car;
    window.W2C.run(1.3);
    SR.debug.press('car');
    out.carAfter = P.car;
    SR.debug.press('car');
    return out;
  });
  T.eq([knock.door, knock.car, knock.carAfter], ['city', null, 'junker'], 'while knocked down Interact and Car do nothing; once up, C gets you in the car');
  const bark = await ev(() => {
    const SR = window.SR, W = SR.world, U = SR.render.worldui, tags = [];
    const orig = U.tag;
    W.streetnpcs = { people: [{ id: 'testguy', x: 2230, y: 2600, facing: 180, state: 'pause', visible: true, bark: 'toast.world.phew', barkT: 2 },
      { id: 'testguy2', x: 2300, y: 2600, facing: 180, state: 'pause', visible: true, bark: 'toast.world.edge', barkT: 0 }], update() {} };
    W.teleport(2230, 2700); window.W2C.run(0.1);
    U.tag = function (x, y, text, opts) { tags.push({ x, y, text, z: opts && opts.z }); return orig.apply(this, arguments); };
    try { SR.loop.step(1); } finally { U.tag = orig; }
    W.streetnpcs = window.__hadNpcs;
    return tags;
  });
  T.ok(bark.some((x) => x.x === 2230 && /Phew/.test(x.text) && x.z > 0) && !bark.some((x) => x.x === 2300),
    'a street person\'s bark (barkT > 0) floats over their name tag; an expired one does not (W2-Street request 1)', bark);

  // ------------------------------------------------------------------------------------------------
  T.section('click to walk; the Pocket, Pause, minimap and minimal-HUD keys');
  const click = await ev(() => {
    const SR = window.SR, W = SR.world;
    W.teleport(2223, 2700);
    window.W2C.run(0.1);
    SR.loop.step(1);
    const to = { x: 2223, y: 2950 }, q = SR.render.toScreen(to.x, to.y), c = SR.stage.box;
    return { cx: c.left + q.x * SR.stage.k, cy: c.top + q.y * SR.stage.k, y0: W.player.y };
  });
  await page.mouse.click(click.cx, click.cy);
  const walked = await ev(() => { const SR = window.SR, P = SR.world.player; const had = P.path.length; SR.loop.step(90); return { had, y: P.y }; });
  T.ok(walked.had > 0 && walked.y > click.y0 + 150, 'a click on the ground walks you there along a route (' + Math.round(walked.y - click.y0) + ' u in 1.5 s)', walked);
  const keys = await ev(() => {
    const SR = window.SR, out = {};
    const vis = () => !document.querySelector('#ui [data-id="minimap"]').hidden;
    out.mini0 = vis();
    SR.debug.press('minimap'); out.mini1 = vis(); out.set1 = SR.settings.get('game.minimap');
    SR.debug.press('minimap'); out.mini2 = vis();
    SR.debug.press('minimalHud'); out.minimal = SR.settings.get('game.minimalHud');
    SR.debug.press('minimalHud');
    out.pocketReg = !!SR.reg.scene.pocket; out.pauseReg = !!SR.reg.scene.pause;
    SR.debug.press('pocket'); out.pocket = SR.scenes.stack().slice(); if (out.pocket.length > 1) SR.scenes.pop();
    SR.debug.press('map'); out.map = SR.scenes.top() && SR.scenes.top().params; if (SR.scenes.stack().length > 1) SR.scenes.pop();
    SR.debug.press('pause'); out.pause = SR.scenes.stack().slice(); if (out.pause.length > 1) SR.scenes.pop();
    out.after = SR.scenes.stack();
    return out;
  });
  T.eq([keys.mini0, keys.mini1, keys.set1, keys.mini2], [true, false, false, true], 'N toggles the minimap (Settings › game.minimap)');
  T.eq(keys.minimal, true, 'H toggles the minimal HUD (game.minimalHud)');
  T.ok(!keys.pocketReg || (keys.pocket.join() === 'city,pocket' && keys.map && keys.map.tab === 'map'), 'Tab opens the Pocket over the city; M its Map tab' + (keys.pocketReg ? '' : ' (pocket not registered yet: refused)'), keys);
  T.ok(!keys.pauseReg || keys.pause.join() === 'city,pause', 'Esc / Start opens Pause' + (keys.pauseReg ? '' : ' (pause not registered yet: refused)'), keys);
  T.eq(keys.after, ['city'], 'and they close back to the city');

  // ------------------------------------------------------------------------------------------------
  T.section('the Fold Rescue');
  await t.newGame({ seed: 24 });
  await t.goto('city');
  await t.teleport(2489, 4040);
  await clearToasts();
  const start = await ev(() => {
    const SR = window.SR, F = SR.world.fall, s = SR.state;
    const r = { hp: s.stats.hp, min: s.clock.min, falls: s.records.falls };
    SR.input.inject('down', true);
    let n = 0;
    while (n < 200 && F.phase !== 'drop') { SR.loop.step(1); n++; }
    SR.input.inject('down', false);
    SR.loop.step(10);
    r.hidden = SR.render.actors.player().visible === false;
    return r;
  });
  T.ok(start.hidden, 'while the stick drops, the city draws it (the real player is hidden behind a stand-in)');
  await t.shot(path.join(SHOTS, 'fold-1-drop.png'));
  await ev(() => { const F = window.SR.world.fall; let n = 0; while (n < 120 && F.phase !== 'catch') { window.SR.loop.step(1); n++; } window.SR.loop.step(18); });
  await t.shot(path.join(SHOTS, 'fold-2-catch.png'));
  await ev(() => { const F = window.SR.world.fall; let n = 0; while (n < 120 && F.phase !== 'land') { window.SR.loop.step(1); n++; } window.SR.loop.step(14); });
  await t.shot(path.join(SHOTS, 'fold-3-land.png'));
  const landed = await ev(() => {
    const SR = window.SR, F = SR.world.fall, P = SR.world.player, G = SR.world.geometry;
    let n = 0;
    while (n < 120 && F.active()) { SR.loop.step(1); n++; }
    SR.loop.step(4);
    return { hp: SR.state.stats.hp, min: SR.state.clock.min, falls: SR.state.records.falls, inside: G.edgeDistance(P.x, P.y), toasts: window.W2C.toasts(), shown: SR.render.actors.player().visible !== false };
  });
  T.eq([landed.hp - start.hp, landed.min - start.min, landed.falls - start.falls], [-10, 0, 1], 'a fall costs 10 HP and no time (orig)');
  T.ok(landed.inside >= 64, 'the plane sets you down ≥ 64 u inside the edge (' + Math.round(landed.inside) + ' u)');
  T.ok(landed.toasts.some((x) => /Pilot Ori/.test(x)), 'Pilot Ori says his line after the first fall', landed.toasts);
  T.ok(landed.shown, 'and the stick is back on the sheet');
  await t.step(20);
  await t.shot(path.join(SHOTS, 'fold-4-landed.png'));

  T.section('a fall at 10 HP: the hospital (Standard), death (Hardcore)');
  const fallDown = await ev(() => {
    const SR = window.SR, out = {};
    ['standard', 'hardcore'].forEach((difficulty) => {
      SR.debug.newGame({ seed: 25, difficulty });
      SR.debug.goto('city');
      SR.debug.set({ stats: { hp: 10 } });
      SR.world.teleport(2489, 4040);
      let got = null;
      const off = SR.events.on('player:down', (p) => { got = { outcome: p.outcome, cause: p.cause }; });
      SR.input.inject('down', true);
      let n = 0;
      while (n < 200 && !SR.world.fall.active()) { SR.world.update(1 / 60); n++; }
      SR.input.inject('down', false);
      while (n < 600 && !got) { SR.world.update(1 / 60, { x: 0, y: 0, skate: false }); n++; }
      off();
      out[difficulty] = { got, over: SR.state.over };
    });
    return out;
  });
  T.eq(fallDown.standard.got, { outcome: 'hospital', cause: 'fall' }, 'Standard: a fall at 10 HP reaches the hospital flow');
  T.eq([fallDown.hardcore.got, fallDown.hardcore.over], [{ outcome: 'death', cause: 'fall' }, true], 'Hardcore: it is death');

  T.section('the car fished out of the clouds');
  const fished = await ev(() => {
    const SR = window.SR, W = SR.world, P = W.player;
    SR.debug.newGame({ seed: 26 });
    SR.debug.goto('city');
    SR.debug.set({ money: { cash: 500 }, player: { cars: { junker: { owned: true, x: 2560, y: 3900, a: Math.PI / 2, towed: false } } } });
    W.teleport(2560, 3840);
    P.board('junker', true);
    SR.ui.toast.clear();
    let n = 0;
    while (n < 300 && !(SR.state.player.cars.junker.towed)) { SR.loop.step(1); SR.input.inject('down', true); n++; }
    SR.input.inject('down', false);
    let k = 0;
    while (k < 200 && W.fall.active()) { SR.loop.step(1); k++; }
    const r = { towed: SR.state.player.cars.junker.towed, driving: P.car, toasts: window.W2C.toasts(), cash: SR.state.money.cash };
    SR.debug.night('sleep');
    const lot = W.geometry.map.homeLots.junker, row = SR.state.player.cars.junker;
    r.morning = { towed: row.towed, onLot: row.x >= lot[0] && row.x <= lot[2] && row.y >= lot[1] && row.y <= lot[3], cash: SR.state.money.cash };
    return r;
  });
  T.ok(fished.towed && fished.driving === null && fished.toasts.some((x) => /clouds/i.test(x)), 'driving off the rim: you are rescued on foot and your car sinks into the clouds', fished);
  T.ok(!fished.morning.towed && fished.morning.onLot && fished.cash - fished.morning.cash >= 100, 'the next morning it is back on its home lot, towed for $100', fished.morning);

  // ------------------------------------------------------------------------------------------------
  T.section('24:00, the songs, the knockdown');
  const late = await ev(() => {
    const SR = window.SR, X = window.W2C;
    SR.debug.newGame({ seed: 27 });
    SR.debug.goto('city');
    SR.ui.toast.clear();
    SR.debug.setTime(1440);
    SR.loop.step(2);
    const first = X.toasts().filter((x) => /Midnight/.test(x)).length;
    SR.debug.setTime(1410); SR.debug.setTime(1440);
    SR.loop.step(2);
    const second = X.toasts().filter((x) => /Midnight/.test(x)).length;
    // A new game's first midnight has its own toast (another game's day 1 does not count).
    SR.debug.newGame({ seed: 27 });
    SR.debug.goto('city');
    SR.ui.toast.clear();
    SR.debug.setTime(1440);
    SR.loop.step(2);
    const fresh = X.toasts().filter((x) => /Midnight/.test(x)).length;
    const def = SR.scenes.get('city');
    const night = SR.reg.song.streetlights ? 'streetlights' : 'crossroads_strut';
    const songs = [def.debug.songFor(720), def.debug.songFor(1169), def.debug.songFor(1170), def.debug.songFor(200), def.debug.songFor(330)];
    SR.debug.setTime(720); SR.loop.step(20);
    const day = def.debug.song().id;
    SR.debug.setTime(1260); SR.loop.step(20);
    const eve = def.debug.song().id;
    return { first, second, fresh, songs, night, day, eve, wind: def.debug.song().wind };
  });
  T.eq([late.first, late.second, late.fresh], [1, 1, 1], 'at 24:00 a chime and one toast a day ("head home"), and again in a new game');
  T.eq(late.songs, ['crossroads_strut', 'crossroads_strut', late.night, late.night, 'crossroads_strut'], 'the day song until 19:30, the night song from 19:30 to 05:30 (ART_AUDIO §13.4)');
  T.eq([late.day, late.eve], ['crossroads_strut', late.night], 'and the city switches them as the clock passes 19:30');
  const edge = await ev(() => {
    const SR = window.SR, def = SR.scenes.get('city');
    SR.world.teleport(2489, 3900); SR.loop.step(20);
    const inland = def.debug.song().wind;
    SR.world.teleport(2489, 4060); SR.loop.step(20);
    return { inland, rim: def.debug.song().wind };
  });
  T.ok(edge.inland === 0 && edge.rim > 0 && edge.rim <= 0.25, 'the wind bed fades in near an unrailed edge (0 → -12 dB)', edge);
  await ev(() => {
    const SR = window.SR, W = SR.world, TR = W.traffic;
    SR.debug.setTime(720);
    W.pedestrians.list.length = 0;
    TR.clear(); TR.spawning = false;
    W.teleport(2398, 3700);
    TR.add('mainS|J1:mainS|J2:mainS', { s: 3700 - 656 - 90, v: 480, cruise: 480 });
    let n = 0;
    while (n < 60 && TR.stats.hits === 0) { SR.loop.step(1); n++; }
    SR.loop.step(20);
    TR.spawning = true;
  });
  const knocked = await ev(() => ({ knock: window.SR.world.player.knockdown, hits: window.SR.world.traffic.stats.hits }));
  T.ok(knocked.hits === 1 && knocked.knock > 0, 'a car hit knocks you down (stars circle, the view shakes)', knocked);
  await t.shot(path.join(SHOTS, 'city-knockdown.png'));

  // ------------------------------------------------------------------------------------------------
  T.section('the cab stub (P1, flag phone)');
  const cab = await ev(() => {
    const SR = window.SR, W = SR.world, out = {};
    SR.debug.newGame({ seed: 28 });
    SR.debug.goto('city');
    SR.debug.setTime(720);
    out.flagOff = SR.world.cab('mcsticks').reason;
    SR.debug.feature('phone', true);
    out.noPhone = SR.world.cab('mcsticks').reason;
    SR.debug.set({ items: { phone: 1 }, money: { cash: 100 } });
    const r = SR.world.cab('mcsticks'), d = W.geometry.doorById.mcsticks;
    out.ride = { ok: r.ok, cash: SR.state.money.cash, min: SR.state.clock.min, at: [W.player.x, W.player.y], exit: [d.exit.x, d.exit.y] };
    SR.debug.setTime(1440);
    out.lateShop = SR.world.cab('bank').reason;
    const home = SR.world.cab('home_apt'), hd = W.geometry.doorById.home_apt;
    out.lateHome = { ok: home.ok, min: SR.state.clock.min, at: [W.player.x, W.player.y], exit: [hd.exit.x, hd.exit.y] };
    SR.debug.feature('phone', false);
    return out;
  });
  T.eq([cab.flagOff, cab.noPhone], ['reason.featureOff', 'reason.needPhone'], 'no cab without the phone flag, or without a phone');
  T.eq([cab.ride.ok, cab.ride.cash, cab.ride.min, cab.ride.at], [true, 85, 750, cab.ride.exit], 'a ride: $15 and 30 min, and you step out at the door (GDD §4.18)');
  T.eq([cab.lateShop, cab.lateHome.ok, cab.lateHome.min, cab.lateHome.at], ['reason.dayOver', true, 1440, cab.lateHome.exit], 'at 24:00 only home, and it takes no minutes');

  T.section('result (desktop)');
  T.eq(t.errors(), [], 'zero console errors');
  await t.close();

  // ------------------------------------------------------------------------------------------------
  T.section('touch: the cluster, tap to walk, the stick half');
  const tt = await h.open({ fast: true, touch: true, width: 844, height: 390 });
  const tp = tt.page;
  await tt.newGame({ seed: 29 });
  await tt.goto('city');
  await tt.eval(() => { const SR = window.SR; SR.world.teleport(2223, 2700); SR.loop.step(2); });
  const layout = await tt.eval(() => {
    const SR = window.SR, root = document.querySelector('#ui [data-scene="city"]');
    const touch = root.querySelector('[data-id="city-touch"]'), mini = root.querySelector('[data-id="minimap"]');
    const r = (el) => { const b = el.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
    const btns = ['touch-action', 'touch-skate', 'touch-car'].map((id) => r(root.querySelector('[data-id="' + id + '"]')));
    const over = (a, b) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
    return { compact: SR.stage.compact, device: SR.input.last, touchShown: !touch.hidden, action: btns[0], mini: r(mini), vw: window.innerWidth, vh: window.innerHeight,
      clash: btns.some((b) => over(b, r(mini))), sizes: btns.map((b) => b[2]) };
  });
  T.ok(layout.touchShown && layout.compact, 'on a phone the touch cluster shows (Action, Skate, Car)', layout);
  T.ok(layout.action[0] + layout.action[2] <= layout.vw && layout.action[1] + layout.action[3] <= layout.vh && layout.mini[1] < layout.vh / 2 && !layout.clash,
    'the Action button sits bottom right, the minimap moves up under the HUD, and nothing overlaps', layout);
  T.ok(layout.sizes[0] >= 88 && layout.sizes[1] >= 58 && layout.sizes[2] >= 58, 'Action 96, Skate 64 and Car 64 logical px (≥ 44 CSS px at uiK 0.92)', layout.sizes);
  const tapTo = await tt.eval(() => { const SR = window.SR, q = SR.render.toScreen(2285, 2950), b = SR.stage.box; return { x: b.left + q.x * SR.stage.k, y: b.top + q.y * SR.stage.k, lx: b.left + 200 * SR.stage.k, ly: b.top + 500 * SR.stage.k }; });
  await tp.touchscreen.tap(tapTo.x, tapTo.y);
  const tapped = await tt.eval(() => window.SR.world.player.path.length);
  await tt.eval(() => window.SR.world.player.cancelRoute());
  await tp.touchscreen.tap(tapTo.lx, tapTo.ly);
  const leftHalf = await tt.eval(() => window.SR.world.player.path.length);
  T.ok(tapped > 0 && leftHalf === 0, 'a tap on the right half walks you there; the left half is the stick\'s', { tapped, leftHalf });
  const skate = await tt.eval(() => {
    const SR = window.SR, b = document.querySelector('#ui [data-id="touch-skate"]');
    b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }));
    const on = SR.input.held('skate'), pressed = b.getAttribute('aria-pressed');
    b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }));
    return { on, pressed, off: SR.input.held('skate') };
  });
  T.eq([skate.on, skate.pressed, skate.off], [true, 'true', false], 'the Skate button toggles the skate hold');
  await tt.eval(() => { const SR = window.SR; SR.render.warm(); if (SR.ui.toast.clear) SR.ui.toast.clear(); });
  await tt.step(1);
  await tt.step(60);
  await tt.shot(path.join(SHOTS, 'city-touch-844x390.png'));
  T.eq(tt.errors(), [], 'zero console errors (touch)');
  await tt.close();
  T.done();
})().catch((e) => { console.error(e); process.exit(1); });
