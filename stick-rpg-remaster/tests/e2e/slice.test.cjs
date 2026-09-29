// tests/e2e/slice.test.cjs — owner: W1-K (lead). The grey-box vertical slice (BUILD_PLAN §3.12),
// the wave-1 exit gate. Each step names the modules it needs; a step whose modules have not landed
// is reported as pending (skipped), so the kernel's own steps run from M1 on and the lead's
// integration run turns every step on:
//   node tests/e2e/slice.test.cjs            pending steps are listed, not failed
//   node tests/e2e/slice.test.cjs --strict   (or SLICE_STRICT=1) a pending step fails the run
// The action ids and numbers are those of BUILD_PLAN §3.12 and BALANCE B-06 / B-05; the lead
// adjusts ids here if the placeholder data names them differently.
'use strict';
const path = require('path');
const h = require('../harness.cjs');

const STRICT = process.argv.includes('--strict') || process.env.SLICE_STRICT === '1';
const SHOTS = path.join(h.ROOT, 'shots', 'W1-K-M1');

(async () => {
  const T = h.suite('e2e slice' + (STRICT ? ' (strict)' : ''));
  const t = await h.open({ fast: true });
  const { page } = t;
  const pending = [];

  /** @returns {Promise<string[]>} the needs (expressions over window, e.g. "SR.reg.action['mcsticks.fries']") that are missing. */
  const missing = (needs) => page.evaluate((needs) => needs.filter((expr) => {
    try { const v = new Function('return (' + expr + ');')(); return v === undefined || v === null; } catch (e) { return true; }
  }), needs);
  /** Runs a step when its modules exist; otherwise records it as pending. */
  const step = async (name, needs, fn) => {
    T.section(name);
    const miss = await missing(needs);
    if (miss.length) {
      pending.push(name + ' (waiting for ' + miss.join(', ') + ')');
      T.ok(!STRICT, 'pending: waiting for ' + miss.join(', '));
      return false;
    }
    try { await fn(); } catch (e) { T.ok(false, 'threw: ' + (e && e.message)); }
    return true;
  };

  await step('boot → title', [], async () => {
    T.eq(await t.scenes(), ['title'], 'the boot scene hands over to the title');
    T.ok(/PAPER SKY/i.test(await t.uiText()), 'the title shows the game title');
  });

  await step('new game (defaults)', ['SR.rules.state.create'], async () => {
    const s = await t.newGame({});
    T.eq([s.clock.day, s.clock.min, s.homes.living, s.mode.difficulty], [1, 480, 'apt', 'standard'], 'day 1, 08:00, living in the apartment, Standard');
    T.eq(await page.evaluate(() => window.SR.rng.rules.state()), s.rng.rules, 'the rules stream is the new game\'s');
  });

  await step('the apartment: the door resolver gives Paperview in Live mode, with its card', ['SR.world.doors.resolve', 'SR.reg.scene.building', 'SR.ui.card.open', 'SR.reg.building.home'], async () => {
    const r = await page.evaluate(() => window.SR.world.doors.resolve('home_apt', window.SR.state));
    T.eq([r.scene, r.id, r.params.mode, r.params.homeId], ['building', 'home', 'live', 'apt'], 'home_apt resolves to the home building, Live mode');
    await t.enter('home');
    T.eq(await t.scenes(), ['building'], 'the building scene is up');
    const ui = await t.ui();
    const rows = JSON.stringify(ui.rows) + JSON.stringify(ui.card || {});
    T.ok(/messages/i.test(rows) && /sleep/i.test(rows), 'the card lists Messages and Sleep', ui.rows);
    await t.shot(path.join(SHOTS, 'slice-apartment.png'));
  });

  await step('Leave → walk on the real map', ['SR.reg.scene.city', 'SR.reg.worldmap.main', 'SR.render.frame', 'SR.world.update'], async () => {
    await t.press('back');
    await t.step(2);
    T.eq(await t.scenes(), ['city'], 'Leave goes to the city');
    const x0 = await t.get('player.x');
    await t.hold('right', 60);
    await t.step(60);
    T.ok((await t.get('player.x')) > x0, 'holding right walks east (the world writes player.x once a second)');
    const px = await t.pixels(0, 0, 1280, 720);
    T.ok(px.data.some((v, i) => i % 4 === 3 && v > 0), 'the painter draws the city on canvas#world');
    await t.shot(path.join(SHOTS, 'slice-city.png'));
  });

  await step('McSticks: Fries and Work Full through SR.act', ['SR.act', 'SR.reg.building.mcsticks', "SR.reg.action['mcsticks.fries']", "SR.reg.action['mcsticks.work']"], async () => {
    await t.enter('mcsticks');
    T.eq(await t.scenes(), ['building'], 'McSticks opens (placeholder interior, real card)');
    await t.set({ stats: { hp: 2 }, clock: { min: 480 } });
    const s0 = await t.state();
    const fries = await t.act('mcsticks.fries');
    const s1 = await t.state();
    T.ok(fries.ok, 'Fries runs', fries.reason);
    T.eq([s1.money.cash - s0.money.cash, s1.stats.hp - s0.stats.hp, s1.clock.min - s0.clock.min], [-12, 20, 30], 'Fries: -$12, +20 HP, 30 min (B-06)');
    const work = await t.act('mcsticks.work', { variant: 'full' });
    const s2 = await t.state();
    T.ok(work.ok, 'Work Full runs', work.reason);
    T.eq([s2.money.cash - s1.money.cash, s2.clock.min - s1.clock.min, s2.stats.karma - s1.stats.karma], [42, 360, 1], 'Work Full: +$42, 6 h, +1 karma (B-05)');
  });

  await step('walk home → Sleep → a report with sections', ['SR.rules.night.run', "SR.reg.action['home.sleep']"], async () => {
    const rep = await t.night('sleep');
    T.ok(rep && Array.isArray(rep.lines) && rep.lines.length > 0 && rep.day === 2, 'the night runs and the report has lines', rep && rep.day);
    T.ok(new Set(rep.lines.map((l) => l.section)).size >= 1, 'grouped in sections');
  });

  await step('Save → reload → equal state', ['SR.rules.state.create'], async () => {
    if (!(await t.state())) await t.newGame({});
    await page.evaluate(() => window.SR.save.write('slot1'));
    const before = await t.state();
    const next = await page.evaluate(() => { const r = window.SR.rng.create(1); r.setState(window.SR.rng.rules.state()); return [r.next(), r.next()]; });
    await t.reload();
    await page.evaluate(() => window.SR.save.load('slot1'));
    T.eq(await t.state(), before, 'the reloaded state equals the saved one');
    T.eq(await page.evaluate(() => [window.SR.rng.rules.next(), window.SR.rng.rules.next()]), next, 'and the rules stream continues');
  });

  await step('a fall at the Main Street south end', ['SR.act', "SR.reg.action['world.fall']"], async () => {
    const hp0 = (await t.state()).stats.hp;
    const min0 = (await t.state()).clock.min;
    const r = await t.act('world.fall', { x: 2489, y: 4120 });
    const s = await t.state();
    T.ok(r.ok !== false, 'world.fall runs');
    T.eq([s.stats.hp - hp0, s.clock.min - min0], [-10, 0], 'a fall costs 10 HP and no time');
  });

  await step('HP 0 → the hospital night → 12:00 the next day outside Paperview', ['SR.rules.health.down'], async () => {
    await t.set({ stats: { hp: 5 }, mode: { difficulty: 'standard' } });
    const day0 = (await t.state()).clock.day;
    const d = await t.down('fall');
    const s = await t.state();
    T.eq(d && d.outcome, 'hospital', 'Standard: the hospital outcome');
    T.eq([s.clock.day, s.clock.min], [day0 + 1, 720], 'the city resumes the next day at 12:00');
  });

  await step('a test sub-screen opens from a card row', ['SR.ui.card.open', 'SR.ui.subhost.create', 'SR.reg.scene.building'], async () => {
    await page.evaluate(() => {
      const SR = window.SR;
      window.__sub = [];
      SR.def.subscreen('test.slice', {
        title: 'ui.subscreen', p: 0,
        mount(root) { window.__sub.push('mount'); const b = document.createElement('div'); b.setAttribute('data-id', 'test-slice-sub'); b.textContent = 'test sub-screen'; root.appendChild(b); },
        refresh() { window.__sub.push('refresh'); }, unmount() { window.__sub.push('unmount'); },
      });
      SR.def.building('test_slice', { name: 'ui.subscreen', owner: 'test', groups: ['services'], greetings: [] });
      SR.def.action('test_slice.open', { building: 'test_slice', group: 'services', order: 1, label: 'ui.subscreen', p: 0, screen: 'test.slice' });
    });
    await t.goto('building', { id: 'test_slice', params: {}, screen: 'test.slice' });
    await t.step(2);
    const r = await page.evaluate(() => ({ log: window.__sub.slice(), shown: !!document.querySelector('#ui [data-id="test-slice-sub"]') }));
    T.ok(r.shown && r.log[0] === 'mount', 'the building card opens the sub-screen (card.open with screen)', r);
    await t.shot(path.join(SHOTS, 'slice-subscreen.png'));
    await t.goto('title');
    T.ok((await page.evaluate(() => window.__sub)).indexOf('unmount') >= 0, 'leaving unmounts it');
  });

  await step('the minigame scene runs a Timing Ring test skin with a context map', ['SR.minigame.run', 'SR.reg.minigame.timingring', 'SR.reg.scene.minigame'], async () => {
    const r = await page.evaluate(() => {
      const SR = window.SR;
      if (!SR.reg.skin['test.ring']) SR.def.skin('test.ring', { engine: 'timingring', params: {}, art: {}, text: {} });
      window.__mg = SR.minigame.run('test.ring', {});
      return { stack: SR.scenes.stack(), contexts: SR.input.contexts() };
    });
    T.eq(r.stack[r.stack.length - 1], 'minigame', 'the minigame overlay is on top');
    T.ok(r.contexts.length > 0, 'its context map is pushed', r.contexts);
    await t.shot(path.join(SHOTS, 'slice-minigame.png'));
    await page.evaluate(() => window.SR.scenes.pop({ m: 1, hits: 0, misses: 0 }));
    T.eq(await page.evaluate(() => window.SR.input.contexts()), [], 'and popped with the frame');
  });

  await step('the sound test plays', ['SR.audio.music', 'SR.reg.song.paper_sky'], async () => {
    await page.evaluate(() => { window.SR.audio.music('paper_sky'); });
    T.ok(true, 'SR.audio.music(paper_sky) runs');
  });

  T.section('result');
  T.eq(t.errors(), [], 'zero console errors along the slice');
  if (pending.length) console.log('pending steps (' + pending.length + '):\n  - ' + pending.join('\n  - '));
  await t.close();
  T.done();
})().catch((e) => { console.error(e); process.exit(1); });
