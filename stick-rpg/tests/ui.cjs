// UI checks: the icon set, the HUD, the INVENTORY and STATS panels (rules from the original's
// root frames 2, 5 and 6), and the shared menu CSS. Screenshots go to $OUT (default below).
//   node tests/ui.cjs
const path = require('path');
const fs = require('fs');
const h = require('./harness.cjs');

const OUT = process.env.OUT || '/tmp/claude-0/-home-user-modern-agents/e8aaa668-44cd-5f53-8561-931f113fdf41/scratchpad/shots/ui';
const REF = process.env.REF || '/tmp/claude-0/-home-user-modern-agents/e8aaa668-44cd-5f53-8561-931f113fdf41/scratchpad/ref';
fs.mkdirSync(OUT, { recursive: true });

// Every icon name the architecture lists.
const ICON_NAMES = `leave ok cancel house money work sleep save messages zzz
slushee candybar nachos smokes pills rob
apply promotion janitor mailroom sales executive vicepresident ceo
deposit withdraw loan repay realestate apartment penthouse mansion castle
alarm knife gun ammo cellphone
beer bottle barfight darts
slots blackjack roulette
milkshake fries burger tripleburger cook
bus
bed tv computer satellite books treadmill freezer minibar
study class gym
tv news stocks campaign fitness dating
give10 givebooze givesmokes cocaine hotwire
punch kick fireball energy run
skateboard car`.split(/\s+/);

let failures = 0;
let checks = 0;
function ok(cond, msg) {
  checks++;
  if (!cond) { failures++; console.log('FAIL', msg); }
}
function eq(a, b, msg) { ok(a === b, msg + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function shotPath(n) { return path.join(OUT, n + '.png'); }

// Build the icon sheet: every icon on its tile, labelled.
async function iconSheet(t) {
  return t.page.evaluate((names) => {
    SRPG.ui.clear();
    const root = SRPG.ui.box(0, 0, 550, 400, 'sheet');
    root.style.background = '#4884ff';
    names.forEach((name, i) => {
      const col = i % 11, row = Math.floor(i / 11);
      SRPG.ui.iconButton(root, { icon: name, label: '', x: 5 + col * 49.5, y: 3 + row * 49, w: 36, size: 34, id: 'icon-' + name });
      const l = SRPG.ui.el('div', 'nopoint', root, name);
      l.style.cssText = 'position:absolute;left:' + (5 + col * 49.5) + 'px;top:' + (39 + row * 49) + 'px;font:bold 6px Arial;color:#fff;white-space:nowrap';
    });
    // each icon must paint something
    const blank = [];
    names.forEach((name) => {
      const c = document.createElement('canvas');
      c.width = c.height = 48;
      const drew = SRPG.icons.draw(c.getContext('2d'), name, 48);
      const d = c.getContext('2d').getImageData(0, 0, 48, 48).data;
      let n = 0;
      for (let k = 3; k < d.length; k += 4) if (d[k] > 40) n++;
      if (!drew || n < 60) blank.push(name + ':' + n);
    });
    return blank;
  }, SRPG_ICON_LIST);
}
let SRPG_ICON_LIST = [];

(async () => {
  // screenshots at 2x, the size of the reference captures (1100 x 800)
  const t = await h.open({ scale: 2 });
  const { page } = t;
  const st = () => t.state();
  const scene = () => page.evaluate(() => SRPG.engine.sceneName + (SRPG.engine.sceneName === 'location' ? ':' + SRPG.location.current : ''));

  // ---------------------------------------------------------------- icons
  await t.newGame({ pname: 'Tester' });
  const names = await page.evaluate(() => SRPG.icons.names.slice());
  ICON_NAMES.forEach((n) => ok(names.includes(n), 'icon registered: ' + n));
  SRPG_ICON_LIST = names;
  const blank = await iconSheet(t);
  eq(blank.length, 0, 'every icon draws pixels ' + blank.join(','));
  // the sheet at 1x (34 px tiles as the game draws them) and at 3x density
  {
    const t1 = await h.open({ scale: 1 });
    await t1.newGame({});
    await iconSheet(t1);
    await t1.shot(shotPath('icons-34'));
    await t1.close();
    const t3 = await h.open({ scale: 3 });
    await t3.newGame({});
    await iconSheet(t3);
    await t3.shot(shotPath('icons-3x'));
    const errs3 = t3.errors.filter((e) => !/requestfailed|ERR_FILE_NOT_FOUND/.test(e));
    eq(errs3.length, 0, 'no page errors (3x) ' + errs3.join(' | '));
    await t3.close();
  }
  // tiles: CSS draws the tile, the icon only the object (corners stay transparent)
  const corner = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 48;
    SRPG.icons.draw(c.getContext('2d'), 'milkshake', 48);
    return c.getContext('2d').getImageData(1, 1, 1, 1).data[3];
  });
  eq(corner, 0, 'icons are drawn without their own tile');

  // ---------------------------------------------------------------- HUD
  await t.newGame({ pname: 'Tester' });
  const hudRules = await page.evaluate(() => {
    const H = SRPG.hud;
    return {
      pct: [H.hpPct(25, 25), H.hpPct(15, 25), H.hpPct(1, 40), H.hpPct(0, 25)],
      heart: [H.heartState(100), H.heartState(75), H.heartState(74), H.heartState(50), H.heartState(49), H.heartState(25), H.heartState(24), H.heartState(2)],
      hitInv: H.hit(477, 21), hitStats: H.hit(528, 20), hitNone: H.hit(300, 200),
    };
  });
  eq(JSON.stringify(hudRules.pct), JSON.stringify([100, 60, 2, 0]), 'hp_bar frame = int(hp / hpmax * 100)');
  eq(JSON.stringify(hudRules.heart), JSON.stringify([0, 0, 1, 1, 2, 2, 3, 3]), 'heart picture changes at 75 / 50 / 25 %');
  eq(hudRules.hitInv, 'inventory', 'backpack hit area');
  eq(hudRules.hitStats, 'stats', '"?" hit area');
  eq(hudRules.hitNone, null, 'no HUD button elsewhere');

  const hudCases = [
    { name: 'hud-map-start', patch: { hp: 25, hpmax: 25, time: 8, cash: 100, day: 1 } },
    { name: 'hud-map-hurt', patch: { hp: 15, hpmax: 25, time: 11, cash: 12345, day: 12 } },
    { name: 'hud-map-bleeding', patch: { hp: 15, hpmax: 40, time: 18, cash: 1000000, day: 100 } },
    { name: 'hud-map-dying', patch: { hp: 3, hpmax: 40, time: 0, cash: 0, day: 365 } },
    { name: 'hud-map-midnight', patch: { hp: 40, hpmax: 40, time: 24, cash: 99, day: 7 } },
  ];
  // the reference HUD's map position (start of the game)
  for (const c of hudCases) {
    await t.set(Object.assign({ mapx: 456, mapy: 630 }, c.patch));
    await t.step(1);
    await t.shot(shotPath(c.name));
  }
  // the "hp/ max" label is one string (the YOU DIED screen relabels it)
  const labels = await page.evaluate(() => {
    const c = document.createElement('canvas').getContext('2d');
    const seen = [];
    const f = c.fillText.bind(c);
    c.fillText = (str, x, y) => { seen.push(String(str)); f(str, x, y); };
    SRPG.hud.draw(c, { hp: 15, hpmax: 25, cash: 100, time: 8, day: 1, karma: 0 }, 'fight');
    return seen;
  });
  ok(labels.includes('15/ 25'), 'HP label drawn as "15/ 25": ' + JSON.stringify(labels));
  // knocked down (root frame 3): no backpack / "?" and no clicking them
  await page.evaluate(() => { SRPG.city.st.stun = 20; });
  eq(await page.evaluate(() => SRPG.hud.hit(477, 21)), null, 'HUD buttons gone while knocked down');
  await t.shot(shotPath('hud-map-knocked-down'));
  await page.evaluate(() => { SRPG.city.st.stun = 0; });
  eq(await page.evaluate(() => SRPG.hud.hit(477, 21)), 'inventory', 'HUD buttons back after the knock-down');
  // backpack hover state
  await t.set({ hp: 25, hpmax: 25, time: 8, cash: 100, day: 1 });
  await page.mouse.move(477, 21);
  await t.step(1);
  await t.shot(shotPath('hud-map-hover-backpack'));
  await page.mouse.move(528, 22);
  await t.step(1);
  await t.shot(shotPath('hud-map-hover-stats'));
  await page.mouse.move(10, 390);
  // inside a building the HUD has no backpack / "?"
  await page.evaluate(() => {
    SRPG.registerLocation({ id: '__plain', view: () => ({ quote: 'Hello.', buttons: [] }) });
  });
  await t.open('__plain');
  await t.step(1);
  await t.shot(shotPath('hud-inside'));

  // The HP bar's red fill, measured on the original (stage x where the red ends, sampled on a row
  // just under the numbers): 5% steps from x 45.2 at 0% by 1.4654 per %, only 100% fills the slanted
  // right end. Rendered offscreen at 4x.
  const bar = await page.evaluate(() => {
    function edgeAt(hp, hpmax) {
      const c = document.createElement('canvas');
      c.width = 1000; c.height = 120;
      const g = c.getContext('2d');
      g.scale(4, 4);
      g.fillStyle = '#33cc00'; g.fillRect(0, 0, 250, 30);
      SRPG.hud.hpBar(g, hp, hpmax, 120.75, 16.9, 1.2, { t: 0 });
      const d = g.getImageData(0, Math.round(22.75 * 4), 1000, 1).data;
      let last = null;
      for (let x = 38 * 4; x < 205 * 4; x++) {
        const r = d[x * 4], gg = d[x * 4 + 1], b = d[x * 4 + 2];
        if (r > 230 && gg < 40 && b < 40) last = x;
      }
      // top-right corner of the bar (inside the slanted end): red only when full
      const tr = g.getImageData(Math.round(197 * 4), Math.round(13.9 * 4), 1, 1).data;
      return { edge: last == null ? null : (last + 1) / 4, corner: [tr[0], tr[1], tr[2]] };
    }
    return {
      p100: edgeAt(25, 25), p95: edgeAt(39, 40), p60: edgeAt(15, 25), p62: edgeAt(25, 40), p56: edgeAt(14, 25),
      p37: edgeAt(15, 40), p20: edgeAt(5, 25), p12: edgeAt(5, 40), p2: edgeAt(1, 40), p0: edgeAt(0.2, 40), dead: edgeAt(0, 40),
    };
  });
  ok(bar.p100.corner[0] > 230 && bar.p100.corner[1] < 40, 'full HP fills the slanted right end of the bar ' + JSON.stringify(bar.p100));
  ok(bar.p95.corner[0] < 140, '95% leaves the right end dark ' + JSON.stringify(bar.p95));
  [['p60', 134], ['p62', 134], ['p56', 125.25], ['p37', 95.5], ['p20', 75], ['p12', 60]].forEach(([k, want]) => {
    ok(bar[k].edge != null && Math.abs(bar[k].edge - want) <= 1.2, 'HP fill ends where the original\'s does (' + k + ': ' + JSON.stringify(bar[k].edge) + ', want ' + want + ')');
  });
  ok(bar.p2.edge != null && bar.p2.edge < 47 && bar.p0.edge != null && bar.p0.edge < 47, 'under 5% (even int() = 0) a sliver is left: ' + JSON.stringify([bar.p2, bar.p0]));
  eq(bar.dead.edge, null, 'no fill at 0 HP');
  if (process.env.VERBOSE) console.log('bar edges', JSON.stringify(bar));
  // crisp 2x renders of the HUD strip for side-by-side checks with ref/hud-map.png
  const crisp = await page.evaluate(() => {
    const out = {};
    [['start', { hp: 25, hpmax: 25, time: 8, cash: 100, day: 1 }], ['midnight', { hp: 40, hpmax: 40, time: 24, cash: 99, day: 7 }],
      ['hurt', { hp: 15, hpmax: 40, time: 18, cash: 12345, day: 365 }]].forEach(([n, st]) => {
      const c = document.createElement('canvas');
      c.width = 1100; c.height = 90;
      const g = c.getContext('2d');
      g.scale(2, 2);
      g.fillStyle = '#33cc00'; g.fillRect(0, 0, 245, 45); g.fillStyle = '#666'; g.fillRect(245, 0, 305, 45);
      SRPG.hud.draw(g, Object.assign({ karma: 0 }, st), 'map');
      out[n] = c.toDataURL();
    });
    // the midnight dial keeps a dark hand at 12 o'clock
    const c = document.createElement('canvas');
    c.width = 240; c.height = 240;
    const g = c.getContext('2d');
    g.scale(4, 4);
    SRPG.hud.clock(g, 30, 30, 24);
    const hand = g.getImageData(120, 88, 1, 1).data, face = g.getImageData(144, 120, 1, 1).data;
    out.hand = [hand[0], face[0]];
    return out;
  });
  ['start', 'midnight', 'hurt'].forEach((n) => fs.writeFileSync(shotPath('hud-crisp-' + n), Buffer.from(crisp[n].split(',')[1], 'base64')));
  ok(crisp.hand[0] < 150 && crisp.hand[1] > 180, 'midnight clock: red face with a dark hand at 12 ' + JSON.stringify(crisp.hand));

  // ---------------------------------------------------------------- SHOW FPS
  await t.newGame({ pname: 'Tester' });
  const fps0 = await page.evaluate(() => { SRPG.hud.fpsUpdate(); return getComputedStyle(document.querySelector('.fps-shower')).display; });
  eq(fps0, 'none', 'fps counter starts hidden');

  // ---------------------------------------------------------------- INVENTORY (empty)
  await t.newGame({ pname: 'Tester' });
  await page.evaluate(() => SRPG.city.openPanel('inventory'));
  await t.step(1);
  let inv = await page.evaluate(() => ({
    items: Array.from(document.querySelectorAll('.inv-item')).map((e) => e.getAttribute('data-id')),
    home: !!document.querySelector('[data-id="gohome"]'),
    close: !!document.querySelector('[data-id="close"]'),
    title: document.getElementById('ui').innerText.indexOf('INVENTORY') >= 0,
  }));
  eq(inv.items.length, 0, 'no items shown when nothing is owned');
  ok(inv.home && inv.close && inv.title, 'inventory has the title, the X and the go-home house');
  await t.shot(shotPath('inventory-empty'));
  // the X closes it and the map carries on
  await t.clickUI('close');
  eq(await page.evaluate(() => !!SRPG.city.st.panel), false, 'X closes the inventory');
  eq(await page.evaluate(() => document.querySelectorAll('.inv-panel').length), 0, 'inventory DOM removed');

  // ---------------------------------------------------------------- INVENTORY (every item)
  const allItems = { smokes: 3, knife: 1, gun: 1, ammo: 7, pills: 2, cocaine: 4, skateboard: 1, cellPhone: 1, alarm: 1, car: 1 };
  await t.set({ items: allItems, booze: 5, charm: 20 });
  await page.evaluate(() => SRPG.city.openPanel('inventory'));
  await t.step(1);
  inv = await page.evaluate(() => Array.from(document.querySelectorAll('.inv-item')).map((e) => e.getAttribute('data-id')).sort());
  eq(JSON.stringify(inv), JSON.stringify(['inv-beer', 'inv-cellphone', 'inv-cocaine', 'inv-gun', 'inv-knife', 'inv-pills', 'inv-skateboard', 'inv-smokes']),
    'the eight inventory slots (no car / alarm clock, as in the original)');
  await t.shot(shotPath('inventory-all'));
  // hovering shows the item's note
  const hoverShots = [['smokes', 364, 150], ['knife', 395, 222], ['gun', 376, 301], ['pills', 292, 326], ['cocaine', 219, 300],
    ['skateboard', 286, 115], ['beer', 182, 222], ['cellphone', 207, 154]];
  for (const [id, x, y] of hoverShots) {
    await page.mouse.move(x, y);
    const tip = await page.evaluate(() => { const e = document.querySelector('.inv-tip.show'); return e ? e.innerText.replace(/\s+/g, ' ').trim() : ''; });
    ok(tip.length > 0, 'hover note for ' + id + ': ' + tip);
    if (id === 'smokes') ok(/SMOKES/.test(tip) && /\b3\b/.test(tip) && /\+1 CHARM/.test(tip) && /-10 HP/.test(tip), 'smokes note: ' + tip);
    if (id === 'gun') ok(/AMMO\(x/.test(tip) && /\b7\b/.test(tip), 'gun note shows ammo: ' + tip);
    if (id === 'pills') ok(/CAFFIENE/.test(tip) && /\b2\b/.test(tip) && /EXTRA TIME/.test(tip) && /-20 HP/.test(tip), 'pills note: ' + tip);
    if (id === 'beer') ok(/BEER/.test(tip) && /\b5\b/.test(tip) && /COMMODITY/.test(tip), 'beer note: ' + tip);
    await t.shot(shotPath('inventory-hover-' + id));
  }
  await page.mouse.move(10, 390);
  await page.evaluate(() => SRPG.city.closePanel());

  // ---------------------------------------------------------------- smokes (button 727)
  // hp > 10 and time < 24: -10 hp, -1 pack, +1 hour, -1 karma (unclamped); +1 charm on frame 15
  await t.set({ hp: 25, hpmax: 25, time: 10, charm: 5, karma: 0, items: { smokes: 2 } });
  await page.evaluate(() => SRPG.city.openPanel('inventory'));
  await t.clickUI('inv-smokes');
  let s = await st();
  eq(s.hp, 15, 'smoking costs 10 HP');
  eq(s.items.smokes, 1, 'smoking uses a pack');
  eq(s.time, 11, 'smoking takes an hour');
  eq(s.karma, -1, 'smoking costs 1 karma');
  eq(s.charm, 5, 'charm not raised yet (animation frame 5)');
  ok(await page.evaluate(() => !!document.querySelector('[data-id="smoking"]')), 'smoking animation shown');
  eq(await page.evaluate(() => getComputedStyle(document.querySelector('.pnum')).fontWeight), '400', 'the charm number is plain (not bold) Verdana');
  await t.step(5);
  await t.shot(shotPath('inventory-smoking-early'));
  await t.step(4);
  eq((await st()).charm, 5, 'charm still 5 on frame 14');
  await t.step(1);
  eq((await st()).charm, 6, 'charm +1 on frame 15');
  await t.step(25);
  await t.shot(shotPath('inventory-smoking-puff'));
  await t.step(19);
  ok(await page.evaluate(() => !!document.querySelector('[data-id="smoking"]')), 'animation still running on frame 59');
  await t.step(1);
  ok(await page.evaluate(() => !document.querySelector('[data-id="smoking"]') && !!document.querySelector('[data-id="inv-smokes"]')),
    'back to the list after frame 60, smokes still there (1 left)');
  // the last pack: the slot disappears
  await t.clickUI('inv-smokes');
  await t.step(60);
  s = await st();
  eq(s.items.smokes, 0, 'last pack smoked');
  eq(s.charm, 7, 'second smoke: +1 charm');
  eq(await page.evaluate(() => !!document.querySelector('[data-id="inv-smokes"]')), false, 'no smokes slot at 0 packs');
  // refused when hp <= 10 or time >= 24 (silently, as in the original)
  await page.evaluate(() => SRPG.city.closePanel());
  await t.set({ hp: 10, time: 10, items: { smokes: 2 } });
  await page.evaluate(() => SRPG.city.openPanel('inventory'));
  await t.clickUI('inv-smokes');
  s = await st();
  ok(s.hp === 10 && s.items.smokes === 2 && s.time === 10, 'no smoking at 10 HP');
  await page.evaluate(() => SRPG.city.closePanel());
  await t.set({ hp: 20, time: 24 });
  await page.evaluate(() => SRPG.city.openPanel('inventory'));
  await t.clickUI('inv-smokes');
  s = await st();
  ok(s.hp === 20 && s.items.smokes === 2 && s.time === 24, 'no smoking at 24:00');
  await page.evaluate(() => SRPG.city.closePanel());
  // karma is not clamped by the smoke itself
  await t.set({ hp: 20, time: 10, karma: -100, charm: 999 });
  await page.evaluate(() => SRPG.city.openPanel('inventory'));
  await t.clickUI('inv-smokes');
  eq((await st()).karma, -101, 'karma goes to -101 (the original only clamps when STATS opens)');
  await t.step(10);
  eq((await st()).charm, 999, 'charm capped at 999');
  await t.step(50);
  // closing during the first 10 frames loses the charm point (the X leaves before frame 15)
  await t.set({ hp: 20, time: 10, karma: 0, charm: 50 });
  await t.clickUI('inv-smokes');
  await t.step(3);
  await t.clickUI('close');
  await t.step(20);
  s = await st();
  ok(s.charm === 50 && s.hp === 10 && !(await page.evaluate(() => !!SRPG.city.st.panel)), 'closed mid-drag: HP and pack spent, no charm');
  // a second click on the (already vanished) smokes slot does not light another one
  await t.set({ hp: 25, time: 10, karma: 0, charm: 50, items: { smokes: 3 } });
  await page.evaluate(() => SRPG.city.openPanel('inventory'));
  await page.evaluate(() => { const e = document.querySelector('[data-id="inv-smokes"]'); e.click(); e.click(); });
  s = await st();
  ok(s.hp === 15 && s.items.smokes === 2 && s.time === 11 && s.karma === -1, 'double click smokes once: ' + JSON.stringify([s.hp, s.items.smokes, s.time, s.karma]));
  // the animation advances one frame per game tick even if both the city scene and the panel's
  // own hook drive it (city.js may call panel.tick() itself)
  const frames = await page.evaluate(() => {
    const p = SRPG.panels.active;
    const a = p.animFrame;
    SRPG.engine.step(1);
    p.tick(); p.tick();
    return [a, p.animFrame];
  });
  eq(frames[1] - frames[0], 1, 'one animation frame per tick');
  await t.step(60);
  eq((await st()).charm, 51, 'charm +1 once');
  await page.evaluate(() => SRPG.city.closePanel());

  // ---------------------------------------------------------------- go home (button 763)
  const haveHome = await page.evaluate(() => !!SRPG.locations.home);
  const haveMansion = await page.evaluate(() => !!SRPG.locations.mansion);
  await t.newGame({ pname: 'Tester' });
  if (haveHome) {
    await page.evaluate(() => SRPG.city.openPanel('inventory'));
    await t.clickUI('gohome');
    s = await st();
    ok(s.mapx === 1054 && s.mapy === 748, 'go home sets the apartment door position');
    eq(await scene(), 'location:home', 'go home opens the apartment (dwelling 1)');
  } else console.log('skip: home location not registered');
  if (haveMansion) {
    await page.evaluate(() => SRPG.engine.go('city', { fade: false }));
    await t.set({ dwelling: 4 });
    await page.evaluate(() => SRPG.city.openPanel('inventory'));
    await t.clickUI('gohome');
    s = await st();
    ok(s.mapx === 447 && s.mapy === 900, 'go home sets the mansion door position');
    eq(await scene(), 'location:mansion', 'go home opens the mansion (dwelling 4)');
  } else console.log('skip: mansion location not registered');

  // ---------------------------------------------------------------- STATS
  await t.newGame({ pname: 'Anonymous', gamelength: 100 });
  await t.set({ charm: 7, intelligence: 4, strength: 10, karma: 0, cash: 100, job: 1, hp: 25, hpmax: 25 });
  await page.evaluate(() => SRPG.city.openPanel('stats'));
  await t.step(1);
  let text = (await t.uiText()).replace(/\s+/g, ' ');
  ok(/STATS/.test(text) && /Anonymous/.test(text), 'stats heading and name');
  ok(/JOB TITLE: 'McSlave'/.test(text), "job title in quotes: " + text);
  ok(/CHARM: 7/.test(text) && /INTELLIGENCE: 4/.test(text) && /STRENGTH: 10/.test(text) && /KARMA: 0/.test(text), 'stat values');
  ok(/NET WORTH : \$ 100/.test(text), 'net worth');
  ok(/100 Days/.test(text), 'game length');
  ok(/MUSIC: ON OFF/.test(text) && /OPTIMIZE: ON OFF/.test(text) && /SHOW FPS: ON OFF/.test(text) && /QUIT/.test(text), 'switch rows');
  await t.shot(shotPath('stats'));
  await page.evaluate(() => SRPG.city.closePanel());
  // net worth = cash + bank - loans; unlimited game; karma clamped to +-100 when opened
  await t.set({ cash: 1234, bankcash: 500, bankloan: 100, gamelength: 0, karma: 150, job: 3 });
  await page.evaluate(() => SRPG.city.openPanel('stats'));
  text = (await t.uiText()).replace(/\s+/g, ' ');
  ok(/NET WORTH : \$ 1634/.test(text), 'net worth = cash + bank - loans: ' + text);
  ok(/Unlimited/.test(text), 'unlimited game length');
  ok(/'Mail Room Clerk'/.test(text), 'job 3 title');
  eq((await st()).karma, 100, 'karma clamped to 100 when STATS opens');
  await page.evaluate(() => SRPG.city.closePanel());
  await t.set({ karma: -140 });
  await page.evaluate(() => SRPG.city.openPanel('stats'));
  eq((await st()).karma, -100, 'karma clamped to -100 when STATS opens');

  // switches: the option in force is pale and does nothing
  await t.set({ music: 1, optimize: 1, fps: 0 });
  await page.evaluate(() => { SRPG.city.closePanel(); SRPG.city.openPanel('stats'); });
  await t.clickUI('on-music');
  eq((await st()).music, 1, 'MUSIC ON while on: no change');
  await t.clickUI('off-music');
  eq((await st()).music, 0, 'MUSIC OFF');
  eq(await page.evaluate(() => SRPG.sound.musicOn), false, 'music stopped');
  await t.clickUI('on-music');
  eq((await st()).music, 1, 'MUSIC ON');
  eq(await page.evaluate(() => SRPG.sound.musicOn), true, 'music started');
  await t.clickUI('off-optimize');
  eq((await st()).optimize, 0, 'OPTIMIZE OFF');
  await t.shot(shotPath('stats-toggles'));
  await t.clickUI('on-optimize');
  eq((await st()).optimize, 1, 'OPTIMIZE ON');
  // SHOW FPS
  await t.clickUI('on-fps');
  eq((await st()).fps, 1, 'SHOW FPS ON');
  const fpsShown = await page.evaluate(() => { SRPG.hud.fpsSample(Date.now() + 2000); SRPG.hud.fpsUpdate(); const e = document.querySelector('.fps-shower'); return [getComputedStyle(e).display, e.textContent]; });
  eq(fpsShown[0], 'block', 'fps counter visible');
  ok(/^\d+ fps$/.test(fpsShown[1]), 'fps text "n fps": ' + fpsShown[1]);
  await t.shot(shotPath('stats-fps-on'));
  await t.clickUI('off-fps');
  eq((await st()).fps, 0, 'SHOW FPS OFF');
  eq(await page.evaluate(() => getComputedStyle(document.querySelector('.fps-shower')).display), 'none', 'fps counter hidden');
  // opening STATS with fps == 1 shows the counter (root frame 6)
  await page.evaluate(() => SRPG.city.closePanel());
  await t.set({ fps: 1 });
  eq(await page.evaluate(() => getComputedStyle(document.querySelector('.fps-shower')).display), 'none', 'fps == 1 alone does not show it');
  await page.evaluate(() => SRPG.city.openPanel('stats'));
  eq(await page.evaluate(() => getComputedStyle(document.querySelector('.fps-shower')).display), 'block', 'opening STATS with fps on shows the counter');
  await page.evaluate(() => SRPG.city.closePanel());
  await t.step(1);
  await t.shot(shotPath('map-fps'));
  await t.set({ fps: 0 });
  await page.evaluate(() => SRPG.city.openPanel('stats'));

  // QUIT -> ARE YOU SURE YOU WANT TO QUIT? (statusbox frame 2)
  await t.clickUI('quit');
  text = (await t.uiText()).replace(/\s+/g, ' ');
  ok(/ARE YOU SURE YOU WANT TO QUIT\?/.test(text) && /YES/.test(text) && /NO/.test(text), 'quit confirmation');
  ok(!/SHOW FPS/.test(text), 'the SHOW FPS row is not on the confirm frame');
  await t.shot(shotPath('stats-quit-confirm'));
  await t.clickUI('close-inert');
  ok(await page.evaluate(() => !!SRPG.city.st.panel && SRPG.panels.active && SRPG.panels.active.confirming), 'X does nothing on the confirm frame');
  await t.clickUI('no');
  text = (await t.uiText()).replace(/\s+/g, ' ');
  ok(!/ARE YOU SURE/.test(text) && /SHOW FPS/.test(text), 'NO returns to the stats');
  await t.clickUI('quit');
  const ends = await page.evaluate(() => {
    let n = 0;
    const orig = SRPG.game.endGame;
    SRPG.game.endGame = function () { n++; return orig.apply(this, arguments); };
    const y = document.querySelector('[data-id="yes"]');
    y.click(); y.click();
    SRPG.game.endGame = orig;
    return n;
  });
  eq(ends, 1, 'YES clicked twice ends the game once');
  eq(await scene(), 'results', 'YES ends the game (results)');
  eq((await st()).over, true, 'game over');

  // ---------------------------------------------------------------- menu CSS vs McSticks
  await t.newGame({ pname: 'Tester' });
  await t.set({ hp: 15, hpmax: 25, time: 10, cash: 100 });
  await page.evaluate(() => {
    SRPG.registerLocation({
      id: '__uitest',
      view: () => ({
        quote: 'Hi there, welcome to McSticks! What can I get ya?',
        buttons: [
          { icon: 'milkshake', label: 'MILKSHAKE <span class="hp">(+12 HP)</span> &nbsp;- &nbsp;<span class="big">$8</span>', col: 0, row: 0, w: 175, id: 'b1', onClick() {} },
          { icon: 'fries', label: 'FRIES <span class="hp">(+20 HP)</span> &nbsp;- &nbsp;<span class="big">$12</span>', col: 0, row: 1, w: 175, id: 'b2', onClick() {} },
          { icon: 'burger', label: 'CHEESEBURGER<br><span class="hp">(+40 HP)</span> &nbsp;- &nbsp;<span class="big">$25</span>', col: 0, row: 2, id: 'b3', onClick() {} },
          { icon: 'tripleburger', label: 'TRIPLE BURGER<br><span class="hp">(+80 HP)</span> &nbsp;- &nbsp;<span class="big">$50</span>', col: 0, row: 3, id: 'b4', onClick() {} },
          { icon: 'work', label: 'WORK - COOK<br><span class="big">($6/HR)</span>', col: 1, row: 1, id: 'b5', onClick() {} },
          { icon: 'beer', label: 'DRINK BEER - $20<br>(+2 CHARM)', col: 1, row: 0, id: 'b6', onClick() {} },
          { icon: 'darts', label: 'PLAY DRUNKEN<br>DARTS', col: 1, row: 2, id: 'b7', onClick() {} },
        ],
      }),
    });
  });
  await t.open('__uitest');
  await t.step(12);
  await t.shot(shotPath('menu-test'));
  const menu = await page.evaluate(() => {
    const cs = (sel, p) => getComputedStyle(document.querySelector(sel))[p];
    return {
      panelBg: cs('.fpanel', 'backgroundColor'), tileBg: cs('.ibtn .ico', 'backgroundColor'), label: cs('.ibtn .lbl', 'color'),
      hp: cs('.ibtn .lbl .hp', 'color'), quoteSize: cs('.quote', 'fontSize'), buttons: document.querySelectorAll('.ibtn').length,
      tile: document.querySelector('.ibtn .ico').getBoundingClientRect().width,
    };
  });
  eq(menu.buttons, 8, '7 buttons + LEAVE');
  eq(menu.panelBg, 'rgba(72, 132, 255, 0.898)', 'panel colour');
  eq(menu.tileBg, 'rgb(51, 153, 255)', 'tile colour');
  eq(menu.label, 'rgb(0, 51, 153)', 'label colour');
  eq(menu.hp, 'rgb(204, 0, 0)', 'HP colour');
  eq(menu.quoteSize, '12px', 'quote size');
  ok(Math.abs(menu.tile - 36) < 0.6, 'tile drawn at 36 px (' + menu.tile + ')');
  await page.mouse.move(205, 123);
  await t.step(1);
  const hov = await page.evaluate(() => {
    const b = document.querySelector('[data-id="b1"]');
    return [getComputedStyle(b.querySelector('.ico')).backgroundColor, getComputedStyle(b.querySelector('.lbl')).color];
  });
  eq(hov[0], 'rgb(149, 202, 255)', 'hovered tile turns pale');
  eq(hov[1], 'rgb(174, 215, 255)', 'hovered label turns pale');
  await t.shot(shotPath('menu-test-hover'));
  await page.mouse.move(10, 390);

  // Compare the panel with the reference screenshot (test-only: both images are read in a
  // separate blank page; the game never loads reference art).
  const refFile = path.join(REF, 'mcsticks.png');
  if (fs.existsSync(refFile)) {
    const cmp = await t.browser.newPage();
    const mine = fs.readFileSync(shotPath('menu-test')).toString('base64');
    const ref = fs.readFileSync(refFile).toString('base64');
    const res = await cmp.evaluate(async ([a, b]) => {
      async function load(src) { const im = new Image(); im.src = 'data:image/png;base64,' + src; await im.decode(); return im; }
      const A = await load(a), B = await load(b);
      function px(im, x, y, scale) {
        const c = document.createElement('canvas'); c.width = 1; c.height = 1;
        const g = c.getContext('2d'); g.drawImage(im, x * scale, y * scale, 1, 1, 0, 0, 1, 1);
        return Array.from(g.getImageData(0, 0, 1, 1).data.slice(0, 3));
      }
      // stage points: panel interior (over the plain grey background in mine), a tile, a panel edge
      return {
        tileMine: px(A, 190, 110, 2), tileRef: px(B, 190, 110, 2),
        tile2Mine: px(A, 375, 262, 2), tile2Ref: px(B, 375, 262, 2),
      };
    }, [mine, ref]);
    await cmp.close();
    const d = (p, q) => Math.max(Math.abs(p[0] - q[0]), Math.abs(p[1] - q[1]), Math.abs(p[2] - q[2]));
    ok(d(res.tileMine, res.tileRef) < 20, 'tile colour matches the reference ' + JSON.stringify(res));
    ok(d(res.tile2Mine, res.tile2Ref) < 20, 'LEAVE tile (4th row) lines up with the reference ' + JSON.stringify(res));
    // location.js's default panel vs the original's shape 105 at (359.4, 172.05) x (1, 1.25)
    const pr = await page.evaluate(() => { const r = document.querySelector('.fpanel').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
    console.log('info: default menu panel', pr.map((v) => +v.toFixed(1)).join(','), 'original 181.5,45.9,356,252.4');
  }

  const errs = t.errors.filter((e) => !/requestfailed|ERR_FILE_NOT_FOUND/.test(e));
  eq(errs.length, 0, 'no page errors ' + errs.join(' | '));
  await t.close();
  console.log(failures ? failures + ' of ' + checks + ' checks FAILED' : 'ui: all ' + checks + ' checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
