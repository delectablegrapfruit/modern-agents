// tests/e2e/exterior.test.cjs — owner: W2-Exterior. The browser side of BUILD_PLAN §4.2 over file://:
// the contact sheet (tests/sheets/exteriors-detail.html) shows every building at 0.8 / 1.0 / 1.25 by
// day and by night with its detail, the stateful buildings in both states, every prop, the six
// islands and the glyphs, with no console error and no warning from these modules; every sprite
// bakes within 30 ms per building per zoom (× the calibration factor), mass by mass; every prop
// stays inside its sprite box; the reacting elements draw only while `cityReacts` is on; every detail
// and prop also draws without a warning with no game and for a Dictator; the detail as drawn (pixels)
// stays inside its sprite, is covered by no building drawn after it and paints over no other door's
// porch or awning (the visibility invariant with the detail drawn); then the
// game page (index.html) boots with no console error, paints the city with the detail, props and
// skyline (screenshots by day and night at every zoom), and re-bakes a building whose state key
// changes (buying the mansion takes its For Sale sign down). Screenshots: shots/W2-Exterior/.
//   node tests/e2e/exterior.test.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const h = require('../harness.cjs');

const SHOTS = path.join(h.ROOT, 'shots', 'W2-Exterior');
const SHEET = pathToFileURL(path.join(h.ROOT, 'tests', 'sheets', 'exteriors-detail.html')).href;
const BUILD_MS = 30;                 // BUILD_PLAN §4.2: sprite build ≤ 30 ms per building per zoom (calibrated)
// The sheet: these modules' warnings, and the rig's and portraits' (only the details draw people there).
const MINE = /detail\(|SR\.art\.(props|skyline|logos|stick|portraits)|palette key/;
const MINE_GAME = /detail\(|SR\.art\.(props|skyline|logos)/;           // the game page (other modules' palette keys aside)

fs.mkdirSync(SHOTS, { recursive: true });

async function canvasShot(t, id, file) {
  const url = await t.eval((id) => { const c = document.querySelector('[data-id="' + id + '"]'); return c && c.width > 2 ? c.toDataURL('image/png') : null; }, id);
  if (url) fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  return !!url;
}

(async () => {
  const T = h.suite('e2e exterior detail (W2-Exterior)');

  // -----------------------------------------------------------------------------------------------
  T.section('the contact sheet');
  const t = await h.open({ width: 1400, height: 900, url: SHEET, live: true, timeout: 60000 });
  await t.page.waitForFunction(() => window.ExteriorDetailSheet && window.ExteriorDetailSheet.ready, null, { timeout: 180000 });
  const sheet = await t.eval(() => JSON.parse(JSON.stringify(window.ExteriorDetailSheet)));
  T.eq(sheet.rows.length, 16, 'every building is on the sheet');
  T.eq(sheet.timings.length, 48, 'each at three zooms (0.8, 1.0, 1.25) by day');
  T.eq(sheet.nights, 48, 'and at the same three zooms by night (lit windows and neon)');
  T.ok(sheet.rows.every((r) => r.size[0] > 40 && r.size[1] > 40), 'every sprite is painted', sheet.rows.map((r) => [r.id, r.size]));
  T.eq(sheet.states.filter((s) => s.plain === s.reacting).map((s) => s.id), [], 'every stateful building changes between a new game and the reacting state');
  T.ok(sheet.props.length >= 40 && sheet.logos.length >= 10 && sheet.skyline && sheet.skyline.cities.length === 6, 'props, glyphs and the six islands are shown', [sheet.props.length, sheet.logos.length]);
  T.ok(sheet.skyline.stats.px <= 6 * 360 * 260 && sheet.skyline.stats.islands === 6, 'the island sprites stay small (6 × 360 × 260 px)', sheet.skyline.stats);
  T.eq(sheet.warnings.filter((w) => MINE.test(w)), [], 'no warning from the detail, props, glyphs or skyline (every palette key resolves; no detail throws)');

  // Bake timings: the best of three bakes per building and zoom, each mass a step (ARCHITECTURE §9.3).
  const perf = await t.eval((z) => {
    const E = SR.art.exterior, out = [];
    SR.state = null;
    SR.reg.worldmap.main.buildings.forEach((def) => z.forEach((zoom) => {
      let best = Infinity, maxStep = 0, steps = 0;
      for (let k = 0; k < 3; k++) {
        E.reset();
        const job = E.baker(def, zoom, 1), times = [];
        const t0 = performance.now();
        while (!job.done) { const a = performance.now(); job.step(); times.push(performance.now() - a); }
        const total = performance.now() - t0;
        if (total < best) { best = total; maxStep = Math.max.apply(null, times); steps = times.length; }
      }
      out.push({ id: def.id, zoom, total: best, maxStep, steps, masses: def.masses.length });
    }));
    return out;
  }, [0.8, 1, 1.25]);
  const factor = sheet.calibration ? Math.max(1, sheet.calibration.factor) : 1;
  const slow = perf.filter((p) => p.total > BUILD_MS * factor);
  const worst = perf.slice().sort((a, b) => b.total - a.total)[0];
  T.ok(!slow.length, 'every building bakes in ≤ ' + BUILD_MS + ' ms × ' + factor.toFixed(2) + ' per zoom (worst ' + worst.id + ' @' + worst.zoom + ': ' + worst.total.toFixed(1) + ' ms)', slow);
  T.eq(perf.filter((p) => p.steps !== p.masses + 2).map((p) => [p.id, p.steps]), [], 'each bake is spread over frames: setup, one step per mass, then the door, detail, grain and neon');
  const maxStep = perf.slice().sort((a, b) => b.maxStep - a.maxStep)[0];
  console.log('  info the longest single bake step: ' + maxStep.id + ' @' + maxStep.zoom + ' ' + maxStep.maxStep.toFixed(2) + ' ms (calibration ' + (sheet.calibration ? sheet.calibration.ms.toFixed(1) + ' ms' : 'n/a') + ')');

  // Every prop stays inside its sprite box (the render core crops sprites to it).
  const spill = await t.eval(() => {
    const P = SR.art.props, out = [], k = 1.25, m = 24;
    P.types().forEach((type) => {
      for (let v = 0; v < P.variants(type); v++) [0, 45, 90, 270].forEach((a) => {
        const s = P.size(type, v, a);
        const c = document.createElement('canvas');
        c.width = Math.ceil((s.w + 2 * m) * k); c.height = Math.ceil((s.h + 2 * m) * k);
        const x = c.getContext('2d');
        x.setTransform(k, 0, 0, k, (s.ax + m) * k, (s.ay + m) * k);
        P.draw(x, type, v, a);
        const d = x.getImageData(0, 0, c.width, c.height).data;
        const bx0 = m * k - 1.5, by0 = m * k - 1.5, bx1 = (m + s.w) * k + 1.5, by1 = (m + s.h) * k + 1.5;
        let n = 0;
        for (let yy = 0; yy < c.height; yy++) for (let xx = 0; xx < c.width; xx++) {
          if (xx >= bx0 && xx <= bx1 && yy >= by0 && yy <= by1) continue;
          if (d[(yy * c.width + xx) * 4 + 3] > 24) n++;
        }
        if (n) out.push([type, v, a, n]);
      });
    });
    return out;
  });
  T.eq(spill, [], 'every prop type, variant and angle paints inside its sprite box');

  // The reacting elements: drawn only while cityReacts is on (the pixels of a CEO's NLI and an
  // office's bank equal a new game's with the flag off, and differ with it on).
  const react = await t.eval(() => {
    const E = SR.art.exterior, wm = SR.reg.worldmap.main;
    const def = (id) => wm.buildings.filter((b) => b.id === id)[0];
    const plain = { homes: { owned: ['apt'] }, job: { ranks: { nli: null }, office: null }, election: { status: 'none' }, stats: { karma: 0, heat: 0 }, npc: { kid: { dead: false } }, player: { name: 'Stick', look: {} } };
    const rich = { homes: { owned: ['apt', 'apt2', 'mansion', 'castle', 'pent'] }, job: { ranks: { nli: 'ceo' }, office: 'president' }, election: { status: 'office', path: 'president' }, stats: { karma: 70, heat: 70 }, npc: { kid: { dead: true } }, player: { name: 'Stick', look: {} } };
    const px = (id, s, flag) => { SR.features.cityReacts = flag; SR.state = s; E.reset(); const r = E.build(def(id), 1, 1); return r.albedo.getContext('2d').getImageData(0, 0, r.albedo.width, r.albedo.height).data; };
    const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
    const out = {};
    ['nli', 'bank', 'cityhall'].forEach((id) => { out[id] = [same(px(id, plain, false), px(id, rich, false)), same(px(id, plain, true), px(id, rich, true))]; });
    // For Sale: the mansion's sign comes down once you own it (flag off: P0).
    out.sale = same(px('home_mansion', plain, false), px('home_mansion', Object.assign({}, plain, { homes: { owned: ['apt', 'mansion'] } }), false));
    SR.features.cityReacts = false; SR.state = null; E.reset();
    return out;
  });
  T.eq(Object.keys(react).filter((k) => k !== 'sale').map((k) => react[k]), [[true, false], [true, false], [true, false]], 'CEO and office change the NLI, bank and City Hall only while cityReacts is on');
  T.ok(react.sale === false, 'owning the mansion takes its For Sale sign down (P0, no flag)');

  // Every detail and prop under the states the sheet does not show (no game: the title's city; a
  // Dictator with Heat and bad karma, flag on and off) draws without a warning or a throw.
  const extra = await t.eval(() => {
    const E = SR.art.exterior, P = SR.art.props, wm = SR.reg.worldmap.main, before = window.ExteriorDetailSheet.warnings.length;
    const dict = { homes: { owned: ['apt', 'castle'] }, job: { ranks: { nli: 'ceo' }, office: null }, election: { status: 'office', path: 'dictator' },
      stats: { karma: -85, heat: 90 }, npc: { kid: { dead: true } }, player: { name: 'Stick', look: { acc: 'beanie' } } };
    const keys = {};
    [[null, false], [null, true], [dict, false], [dict, true]].forEach(([s, flag], k) => {
      SR.features.cityReacts = flag; SR.state = s; E.reset();
      wm.buildings.forEach((def) => { E.build(def, 1, 1); keys[def.id + ':' + k] = SR.art.exteriorDetail.stateKey(def.id, s); });
      const c = document.createElement('canvas'); c.width = 200; c.height = 200;
      const x = c.getContext('2d'); x.translate(100, 160);
      P.types().forEach((type) => { for (let v = 0; v < P.variants(type); v++) P.draw(x, type, v, 0); });
    });
    SR.features.cityReacts = false; SR.state = null; E.reset();
    return { warnings: window.ExteriorDetailSheet.warnings.slice(before), dictator: [keys['bank:3'], keys['home_castle:3'], keys['home_castle:2']] };
  });
  T.eq(extra.warnings.filter((w) => MINE.test(w)), [], 'no game and a Dictator (flag off and on): every detail and prop draws without a warning');
  T.ok(extra.dictator[0] === 'dictator' && /^\|#/.test(extra.dictator[1]) && extra.dictator[2] === '|', "a Dictator's banners and the castle's karma flags follow the flag", extra.dictator);

  // The detail as drawn (pixels, not rects): it stays inside the sprite's bounds (the canvas crops
  // anything outside), no building drawn after this one covers it, and it never paints over another
  // door's visible porch strip or awning (the visibility invariant with the detail drawn).
  const vis = await t.eval(() => {
    const E = SR.art.exterior, wm = SR.reg.worldmap.main, K = E.PROJ || 0.5, M = 300;
    const plain = { homes: { owned: ['apt'] }, job: { ranks: { nli: null }, office: null }, election: { status: 'none' }, stats: { karma: 0, heat: 0 }, npc: { kid: { dead: false } }, player: { name: 'Stick', look: {} } };
    const rich = { homes: { owned: ['apt', 'apt2', 'mansion', 'castle', 'pent'] }, job: { ranks: { nli: 'ceo' }, office: 'president' }, election: { status: 'office', path: 'president' }, stats: { karma: 70, heat: 70 }, npc: { kid: { dead: true } }, player: { name: 'Stick', look: {} } };
    const sortY = (b) => Math.max.apply(null, b.masses.map((m) => m.rect[3]));
    const proj = (b) => b.masses.map((m) => [m.rect[0], m.rect[1] - K * m.h, m.rect[2], m.rect[3]])
      .concat(((b.exterior && b.exterior.tops) || []).map((t) => [t.rect[0], t.rect[1] - K * t.h, t.rect[2], t.rect[3]]));
    const out = { spill: [], covered: [], porch: [] };
    [[plain, false], [rich, true]].forEach(([s, flag]) => {
      SR.features.cityReacts = flag; SR.state = s;
      wm.buildings.forEach((def) => {
        const reg = SR.reg.exterior[def.id], detail = reg.detail;
        let before = null;
        reg.detail = function (ctx) { before = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height).data; return detail.apply(this, arguments); };
        E.reset();
        const g = E.geom(def), own = g.bounds.slice();
        g.bounds = [own[0] - M, own[1] - M, own[2] + M, own[3] + M];
        let r;
        try { r = E.build(def, 1, 1); } finally { reg.detail = detail; g.bounds = own; }
        const w = r.albedo.width, h = r.albedo.height, after = r.albedo.getContext('2d').getImageData(0, 0, w, h).data;
        const later = [], doors = [];
        wm.buildings.forEach((b) => {
          if (b.id !== def.id && sortY(b) > sortY(def)) proj(b).forEach((p) => later.push([b.id, p]));
          const gb = E.geom(b);
          if (b.id !== def.id && gb.visible) doors.push([b.id, gb.visible]);
          if (b.id !== def.id && gb.awning) doors.push([b.id, gb.awning]);
        });
        const tally = (list, where, id, x, y) => list.forEach(([bid, p]) => { if (x > p[0] && x < p[2] && y > p[1] && y < p[3]) where[bid] = (where[bid] || 0) + 1; });
        const spill = { n: 0 }, cov = {}, por = {};
        for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
          const i = (y * w + x) * 4;
          const d = Math.abs(after[i] - before[i]) + Math.abs(after[i + 1] - before[i + 1]) + Math.abs(after[i + 2] - before[i + 2]) + Math.abs(after[i + 3] - before[i + 3]);
          if (d < 60) continue;
          const wx = r.bounds[0] + x / r.scale, wy = r.bounds[1] + y / r.scale;
          if (wx < own[0] - 1 || wx > own[2] + 1 || wy < own[1] - 1 || wy > own[3] + 1) spill.n++;
          tally(later, cov, def.id, wx, wy);
          tally(doors, por, def.id, wx, wy);
        }
        if (spill.n) out.spill.push([def.id, flag, spill.n]);
        Object.keys(cov).forEach((k) => out.covered.push([def.id, flag, k, cov[k]]));
        Object.keys(por).forEach((k) => out.porch.push([def.id, flag, k, por[k]]));
      });
    });
    SR.features.cityReacts = false; SR.state = null; E.reset();
    return out;
  });
  T.eq(vis.spill, [], 'the detail paints inside its sprite bounds (new game and every reacting element)');
  T.eq(vis.covered, [], 'no building drawn after another covers any of its detail');
  T.eq(vis.porch, [], "no detail paints over another building's porch strip or awning");

  for (const id of ['xd-buildings', 'xd-night', 'xd-states', 'xd-props', 'xd-skyline', 'xd-logos']) {
    T.ok(await canvasShot(t, id, path.join(SHOTS, 'sheet-' + id.slice(3) + '.png')), 'captured shots/W2-Exterior/sheet-' + id.slice(3) + '.png');
  }
  T.eq(t.errors(), [], 'the contact sheet has no console error, page error or failed request');
  await t.close();

  // -----------------------------------------------------------------------------------------------
  T.section('the game page: the city with its detail, props and skyline');
  const g = await h.open({ width: 1280, height: 720 });
  T.eq(g.errors(), [], 'index.html boots from file:// with no console error');
  const ready = await g.eval(() => {
    SR.debug.newGame({ seed: 7 });
    // A bare city painter (the city scene is W2-City's): the render core draws the frame.
    if (!SR.reg.scene['xd-city']) SR.scenes.register('xd-city', { kind: 'base', render: (ctx, a) => SR.render.frame(ctx, a) });
    SR.debug.goto('xd-city');
    return { props: typeof SR.art.props.draw, skyline: typeof SR.art.skyline.draw, logos: typeof SR.art.logos.draw, detail: Object.keys(SR.reg.exterior).length };
  });
  T.eq(ready, { props: 'function', skyline: 'function', logos: 'function', detail: 16 }, 'the game loads the four art files and the 16 details');
  const SPOTS = [
    { name: 'paperview', x: 1100, y: 760, zoom: 1 }, { name: 'main-street', x: 2480, y: 1400, zoom: 0.8 },
    { name: 'civic-plaza', x: 3860, y: 1160, zoom: 1 }, { name: 'depot-bus-hole', x: 3900, y: 2960, zoom: 1 },
    { name: 'casino-pawn', x: 2460, y: 3700, zoom: 0.8 }, { name: 'park', x: 1100, y: 3100, zoom: 0.8 },
    { name: 'mcsticks', x: 1800, y: 2080, zoom: 1.25 }, { name: 'edgeview', x: 4100, y: 3400, zoom: 1 },
  ];
  const drawn = [];
  for (const s of SPOTS) {
    for (const [tag, min] of [['day', 780], ['night', 1320]]) {
      const st = await g.eval((a) => {
        SR.render.setView({ x: a.s.x, y: a.s.y, zoom: a.s.zoom, min: a.min, day: 1 });
        SR.render.warm(); SR.loop.step(1); SR.render.warm(); SR.loop.step(1);
        const r = SR.render.stats();
        return { props: r.props.count, sprites: r.sprites.count, islands: SR.art.skyline.stats().islands };
      }, { s, min });
      drawn.push(Object.assign({ name: s.name, tag }, st));
      await g.shot(path.join(SHOTS, 'city-' + s.name + '-' + tag + '.png'));
    }
  }
  T.ok(drawn.every((d) => d.sprites > 0), 'every spot draws baked building sprites', drawn.filter((d) => !d.sprites));
  T.ok(drawn.some((d) => d.props > 0), 'props are drawn through SR.art.props (cached sprites)', drawn.map((d) => d.props));
  T.ok(drawn.some((d) => d.islands > 0), 'the distant islands are drawn through SR.art.skyline where sky shows');
  // The sky from the east rim: islands, the ribbon and its buses by day and night.
  for (const [tag, min] of [['day', 780], ['night', 1320]]) {
    await g.eval((min) => { SR.render.setView({ x: 4500, y: 2700, zoom: 0.8, min, day: 1 }); SR.render.warm(); SR.loop.step(1); }, min);
    await g.shot(path.join(SHOTS, 'city-east-rim-sky-' + tag + '.png'));
  }

  // Buying the mansion re-bakes it without its For Sale sign (the boot hook's refresh on home:changed).
  const rebake = await g.eval(() => {
    SR.render.setView({ x: 1940, y: 900, zoom: 1, min: 780 });
    SR.render.warm(); SR.loop.step(1);
    const before = SR.art.exteriorDetail.baked().home_mansion;
    const had = !!(SR.render.buildings.sprite('home_mansion') || {}).ready;
    SR.state.homes.owned.push('mansion');
    SR.events.emit('home:changed', { living: SR.state.homes.living, owned: SR.state.homes.owned.slice() });
    const dropped = !SR.render.buildings.sprite('home_mansion');
    SR.render.warm(); SR.loop.step(1);
    return { before, had, dropped, after: SR.art.exteriorDetail.baked().home_mansion, again: !!(SR.render.buildings.sprite('home_mansion') || {}).ready };
  });
  T.ok(rebake.had && /^sale/.test(rebake.before), 'the mansion is baked with its For Sale sign in a new game', rebake);
  T.ok(rebake.dropped && rebake.again && !/^sale/.test(rebake.after), 'owning it drops the sprite on home:changed and re-bakes it without the sign', rebake);
  await g.shot(path.join(SHOTS, 'city-mansion-owned.png'));
  T.eq(g.errors(), [], 'no console error while painting the city');
  T.eq(g.warnings().filter((w) => MINE_GAME.test(w)), [], 'no warning from these modules in the game');
  await g.close();
  T.done();
})().catch((e) => { console.error(e); process.exit(1); });
