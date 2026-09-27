// Core smoke test: boot, new game, walk, fall, panels, a door, save/load. Screenshots to $OUT.
const h = require('./harness.cjs');
const OUT = process.env.OUT || '/tmp';
(async () => {
  const t = await h.open();
  const { page } = t;
  const log = (...a) => console.log(...a);
  log('scene', await page.evaluate(() => SRPG.engine.sceneName));
  await t.newGame({ pname: 'Tester' });
  await t.shot(OUT + '/smoke-city.png');
  let s = await t.state();
  log('start', s.mapx, s.mapy, s.hp);
  await t.hold(['ArrowLeft'], 20);
  s = await t.state();
  log('after left 20', s.mapx, s.mapy, 'rot', s.rot);
  await t.hold(['ArrowUp'], 30);
  s = await t.state();
  log('after up 30', s.mapx, s.mapy);
  await t.shot(OUT + '/smoke-walk.png');
  // panels
  await page.evaluate(() => SRPG.city.openPanel('inventory'));
  await t.shot(OUT + '/smoke-inv.png');
  await page.evaluate(() => SRPG.city.closePanel());
  await page.evaluate(() => SRPG.city.openPanel('stats'));
  await t.shot(OUT + '/smoke-stats.png');
  await page.evaluate(() => SRPG.city.closePanel());
  await page.evaluate(() => { if (!SRPG.locations.mcsticks) SRPG.registerLocation({ id: 'mcsticks', view: () => ({ quote: 'stub', buttons: [] }) }); });
  // walk into McSticks: mapx must reach 447 with mapy in 302..346
  await t.set({ mapx: 440, mapy: 320 });
  await t.hold(['ArrowLeft'], 5);
  log('scene after mcsticks walk', await page.evaluate(() => SRPG.engine.sceneName + ' ' + (SRPG.location.current || '')));
  await t.shot(OUT + '/smoke-loc.png');
  await t.clickUI('leave');
  log('after leave', await page.evaluate(() => SRPG.engine.sceneName), (await t.state()).mapx);
  // fall off the south edge
  await page.evaluate(() => { SRPG.engine.go('city', { fade: false }); });
  await t.set({ mapx: 200, mapy: -680 });
  await t.hold(['ArrowDown'], 5);
  s = await t.state();
  log('after fall', s.mapy, s.hp, await page.evaluate(() => SRPG.city.st.stunKind));
  await t.step(10);
  await t.shot(OUT + '/smoke-fall.png');
  log('save', await page.evaluate(() => SRPG.save.write(SRPG.game.s)), await page.evaluate(() => !!SRPG.save.read()));
  log('errors', t.errors);
  await t.close();
})().catch((e) => { console.error(e); process.exit(1); });
