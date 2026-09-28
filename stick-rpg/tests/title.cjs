// Title area checks: title -> NEW GAME -> CREATE CHARACTER -> intro (and SKIP) -> city with the
// chosen stats; the roll / +- rules; the cheat name; instructions paging; CONTINUE with and
// without a save; the intro's shift and drop frames against the original's extents; YOU DIED
// (pose timeline, the HP bar sweeping while the label reads 0) -> results (count-up formula,
// flash, stamp, rank and its one-line stamp, DONE back to a title that fades in, save
// untouched). Screenshots go to $OUT (default: the scratchpad's shots/title) and are compared
// with the original's reference screenshots (mean pixel difference).
//   node tests/title.cjs
const fs = require('fs');
const path = require('path');
const h = require('./harness.cjs');

const SCR = '/tmp/claude-0/-home-user-modern-agents/e8aaa668-44cd-5f53-8561-931f113fdf41/scratchpad';
const OUT = process.env.OUT || path.join(SCR, 'shots/title');
const REF = process.env.REF || path.join(SCR, 'ref');
fs.mkdirSync(OUT, { recursive: true });

let pass = 0, fail = 0;
function ok(cond, msg, extra) {
  if (cond) { pass++; console.log('  ok  ' + msg); } else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
}
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg + ' (' + JSON.stringify(a) + ')', b); }

(async () => {
  const t = await h.open({ scale: 2 });
  const { page } = t;
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const scene = () => ev(() => SRPG.engine.sceneName);
  const tst = () => ev(() => { const s = SRPG.title.st; return { mode: s.mode, page: s.page, gamelength: s.gamelength, pts: s.pts, str: s.str, intl: s.intl, cha: s.cha, fade: s.fade }; });
  const shot = (name) => t.shot(path.join(OUT, name + '.png'));
  // record sounds
  await ev(() => {
    window.__snd = [];
    const play = SRPG.sound.play;
    SRPG.sound.play = function (n) { window.__snd.push(n); return play.call(SRPG.sound, n); };
    window.__music = [];
    const music = SRPG.sound.music;
    SRPG.sound.music = function (n) { window.__music.push(n); return music.call(SRPG.sound, n); };
  });
  const sounds = () => ev(() => window.__snd.splice(0));

  // mean absolute pixel difference between one of our screenshots and a reference PNG
  async function diff(ours, ref) {
    const p2 = await t.browser.newPage();
    const a = 'data:image/png;base64,' + fs.readFileSync(ours).toString('base64');
    const b = 'data:image/png;base64,' + fs.readFileSync(ref).toString('base64');
    const d = await p2.evaluate(async ([a, b]) => {
      const load = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = src; });
      const [A, B] = await Promise.all([load(a), load(b)]);
      const W = 1100, H = 800;
      const px = (img) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.drawImage(img, 0, 0, W, H); return x.getImageData(0, 0, W, H).data; };
      const da = px(A), db = px(B);
      let s = 0;
      for (let i = 0; i < da.length; i += 4) s += Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
      return s / (W * H * 3);
    }, [a, b]);
    await p2.close();
    return d;
  }

  console.log('# title screen');
  await ev(() => { SRPG.save.remove(); SRPG.rng.seed(7); SRPG.engine.go('title'); });
  eq(await scene(), 'title', 'boot shows the title');
  ok((await ev(() => window.__music.slice(-1)[0])) === 'beginning', 'title plays the Beginning loop');
  eq((await tst()).fade, 1, 'first boot fades in from black');
  await t.step(12);
  eq((await tst()).fade, 0, 'fade done after 10 frames');
  const ids = await ev(() => Array.from(document.querySelectorAll('#ui [data-id]')).map((e) => e.getAttribute('data-id')));
  eq(ids, ['start', 'continue', 'instructions'], 'START / CONTINUE / INSTRUCTIONS hotspots');
  await t.step(30);
  await shot('title');
  const bub = await ev(() => SRPG.title.st.bubbles.map((b) => b.s));
  ok(bub.length === 8 && bub.every((s) => s >= 15 && s <= 99), '8 bubbles, sizes 15..99%', bub);
  // bubbles rise size/50 px a frame and wrap to the bottom
  const b0 = await ev(() => ({ y: SRPG.title.st.bubbles[0].y, s: SRPG.title.st.bubbles[0].s }));
  await t.step(1);
  const b1 = await ev(() => SRPG.title.st.bubbles[0].y);
  ok(Math.abs(b0.y - b0.s / 50 - b1) < 1e-9 || b1 === 215, 'bubble rises size/50 per frame');
  await ev(() => { SRPG.title.st.bubbles[0].y = -224.9; SRPG.title.st.bubbles[0].s = 50; });
  await t.step(1);
  const bw = await ev(() => SRPG.title.st.bubbles[0]);
  ok(bw.y === 215 && bw.x >= -285 && bw.x <= 249 && bw.s >= 15 && bw.s <= 99, 'bubble past the top restarts at the bottom', bw);

  console.log('# CONTINUE without a save');
  await sounds();
  await t.clickUI('continue');
  eq(await scene(), 'title', 'no save: stays on the title');
  eq((await sounds()).filter((n) => n === 'error').length, 1, 'no save: error sound');

  console.log('# instructions');
  await t.clickUI('instructions');
  eq((await tst()).mode, 'instructions', 'INSTRUCTIONS opens page 1');
  eq((await tst()).page, 1, 'page 1');
  for (let p = 1; p <= 7; p++) {
    await t.step(2);
    await shot('instructions-' + p);
    eq((await tst()).page, p, 'page ' + p + ' of 7');
    await t.clickUI('next');
  }
  eq((await tst()).mode, 'title', 'NEXT on page 7 returns to the title');
  eq((await tst()).page, 1, 'instructions rewound to page 1');
  await t.clickUI('instructions');
  eq((await tst()).page, 1, 'reopening starts at page 1 again');
  for (let p = 1; p <= 7; p++) await t.clickUI('next');

  console.log('# NEW GAME');
  await t.clickUI('start');
  eq((await tst()).mode, 'newgame', 'START opens NEW GAME');
  eq((await tst()).gamelength, 0, 'UNLIMITED preselected (gamelength 0)');
  await t.step(2);
  await shot('newgame');
  for (const [id, len] of [['gl-15', 15], ['gl-40', 40], ['gl-100', 100], ['gl-0', 0], ['gl-40', 40]]) {
    await t.clickUI(id);
    eq((await tst()).gamelength, len, id + ' sets gamelength ' + len);
  }
  await t.clickUI('gl-100');
  await t.step(1);
  await shot('newgame-long');
  await t.clickUI('newgame-done');
  eq((await tst()).mode, 'makechar', 'DONE opens CREATE CHARACTER');

  console.log('# CREATE CHARACTER');
  // the rolls at title creation: pts 3..9, stats 1..10 (sprite 104 frame 1: pts, str, intl, cha)
  const expectRoll = await ev(() => { SRPG.rng.seed(4242); const r = SRPG.rng.random; return { pts: r(7) + 3, str: r(10) + 1, intl: r(10) + 1, cha: r(10) + 1 }; });
  await ev(() => { SRPG.rng.seed(4242); SRPG.title.roll(); });
  const got = await tst();
  eq({ pts: got.pts, str: got.str, intl: got.intl, cha: got.cha }, expectRoll, 'roll order pts, str, intl, cha');
  const seen = await ev(() => {
    const out = { pts: {}, str: {}, intl: {}, cha: {} };
    SRPG.rng.unseed();
    for (let i = 0; i < 600; i++) {
      document.querySelector('#ui [data-id="roll"]').click();
      const s = SRPG.title.st;
      out.pts[s.pts] = 1; out.str[s.str] = 1; out.intl[s.intl] = 1; out.cha[s.cha] = 1;
    }
    return { pts: Object.keys(out.pts).map(Number).sort((a, b) => a - b), str: Object.keys(out.str).map(Number).sort((a, b) => a - b), intl: Object.keys(out.intl).map(Number).sort((a, b) => a - b), cha: Object.keys(out.cha).map(Number).sort((a, b) => a - b) };
  });
  eq(seen.pts, [3, 4, 5, 6, 7, 8, 9], 'ROLL AGAIN: extra points 3..9');
  eq(seen.str, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'ROLL AGAIN: strength 1..10');
  eq(seen.intl, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'ROLL AGAIN: intelligence 1..10');
  eq(seen.cha, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'ROLL AGAIN: charm 1..10');
  // + and -
  await ev(() => Object.assign(SRPG.title.st, { pts: 2, cha: 2, str: 10, intl: 1 }));
  await t.clickUI('cha-plus');
  let s = await tst();
  eq([s.cha, s.pts], [3, 1], '+ moves an extra point into CHARM');
  await t.clickUI('str-plus');
  await t.clickUI('str-plus');
  s = await tst();
  eq([s.str, s.pts], [11, 0], '+ stops when no points are left');
  await t.clickUI('intl-minus');
  s = await tst();
  eq([s.intl, s.pts], [0, 1], '- takes a point back (down to 0)');
  await t.clickUI('intl-minus');
  s = await tst();
  eq([s.intl, s.pts], [0, 1], '- does nothing at 0');
  await t.clickUI('intl-plus');
  await t.clickUI('cha-minus');
  s = await tst();
  eq([s.cha, s.intl, s.pts], [2, 1, 1], 'points move freely between stats');
  // the name field: "Anonymous", 11 characters max
  eq(await ev(() => document.querySelector('#ui [data-id="name"]').value), 'Anonymous', 'name defaults to Anonymous');
  eq(await ev(() => { const cs = getComputedStyle(document.querySelector('#ui [data-id="name"]')); return [cs.textAlign, cs.color, cs.borderTopColor]; }),
    ['left', 'rgb(0, 0, 0)', 'rgb(0, 0, 0)'], 'name field: black text, left-aligned, black border (as the original)');
  await page.fill('#ui [data-id="name"]', '');
  await page.type('#ui [data-id="name"]', 'ABCDEFGHIJKLMNOP');
  eq(await ev(() => document.querySelector('#ui [data-id="name"]').value), 'ABCDEFGHIJK', 'name limited to 11 characters');
  // an empty name: DONE does nothing
  await page.fill('#ui [data-id="name"]', '');
  await t.clickUI('create-done');
  eq(await scene(), 'title', 'empty name: DONE ignored');
  await ev(() => Object.assign(SRPG.title.st, { pts: 3, cha: 2, str: 10, intl: 5 }));
  await page.fill('#ui [data-id="name"]', 'Anonymous');
  await t.step(1);
  await shot('create-character');
  await page.fill('#ui [data-id="name"]', 'Tester');
  await ev(() => Object.assign(SRPG.title.st, { pts: 3, cha: 4, str: 7, intl: 9 }));
  await t.clickUI('create-done');
  eq(await scene(), 'intro', 'DONE starts the intro');
  let g = await t.state();
  eq({ pname: g.pname, gamelength: g.gamelength, str: g.strength, intl: g.intelligence, cha: g.charm, hpmax: g.hpmax, hp: g.hp, cash: g.cash, day: g.day, time: g.time },
    { pname: 'Tester', gamelength: 100, str: 7, intl: 9, cha: 4, hpmax: 22, hp: 22, cash: 100, day: 1, time: 8 }, 'new game uses the chosen name, length and stats (leftover points dropped)');
  ok((await ev(() => window.__music.slice(-1)[0])) === null, 'title music stops for the intro');

  console.log('# intro');
  eq(await ev(() => SRPG.intro.st.f), 2, 'film starts at frame 2');
  await t.step(1);
  await shot('intro-fade');
  const f0 = await ev(() => SRPG.intro.st.black);
  ok(f0 >= 11 && f0 <= 30, 'fades in from black (black clip frames 11..30)', f0);
  for (const f of [120, 300, 399, 500, 676, 685, 764]) {
    await ev((f) => { SRPG.intro.st.f = f - 1; SRPG.intro.st.black = 0; }, f);
    await t.step(1);
    await shot('intro-' + f);
  }
  // The shift: the figure stays upright and fills the original's per-frame extent (686: ~38 tall,
  // 695: ~13), and the big falling figure's head is at x 236, y 40 + 80 per frame.
  const FXY = [255.35, 188];
  async function inkBox(f, win) {
    await ev((f) => { SRPG.intro.st.f = f - 1; SRPG.intro.st.black = 0; SRPG.intro.st.blackHold = false; }, f);
    await t.step(1);
    return ev((win) => {
      const c = document.getElementById('game');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, bx = 0, by = 0, bn = 0;
      for (let y = win[1]; y < win[3]; y++) for (let x = win[0]; x < win[2]; x++) {
        const i = (y * c.width + x) * 4;
        if (d[i] + d[i + 1] + d[i + 2] > 600) continue; // white film background
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
        if (d[i + 2] > 150 && d[i] < 60) { bx += x; by += y; bn++; } // the blue head
      }
      return { x0, y0, x1, y1, hx: bn ? bx / bn : null, hy: bn ? by / bn : null };
    }, win);
  }
  for (const [f, top, bot] of [[680, -40.9, -5.65], [686, -59.7, -21.75], [690, -54.6, -25.25], [695, -47.65, -34.3]]) {
    const b = await inkBox(f, [180, 80, 340, 220]);
    ok(Math.abs(b.y0 - (FXY[1] + top)) <= 2.5 && Math.abs(b.y1 - (FXY[1] + bot)) <= 2.5,
      'shift frame ' + f + ': figure spans y ' + (FXY[1] + top).toFixed(1) + '..' + (FXY[1] + bot).toFixed(1), b);
    ok(b.hy !== null && b.hy < (b.y0 + b.y1) / 2, 'shift frame ' + f + ': upright (head on top)', b);
  }
  for (const f of [762, 763, 764, 765]) {
    const b = await inkBox(f, [150, 0, 450, 400]);
    ok(Math.abs(b.hx - 236.3) < 2.5 && Math.abs(b.hy - (40.4 + 80 * (f - 761))) < 2.5, 'drop frame ' + f + ': head at (236, ' + (40.4 + 80 * (f - 761)).toFixed(0) + ')', b);
  }
  // no screen change before frame 850
  await ev(() => { SRPG.intro.st.f = 700; SRPG.intro.st.black = 0; });
  await sounds();
  await t.step(26);
  eq(await ev(() => SRPG.intro.st.black), 0, 'no blink at frame 726');
  await t.step(1);
  eq(await ev(() => SRPG.intro.st.black), 1, 'frame 727: black blink');
  await t.step(69);
  eq(await ev(() => [SRPG.intro.st.f, SRPG.intro.st.black, SRPG.intro.st.blackHold]), [796, 1, true], 'frame 796: black stays');
  ok((await sounds()).includes('carhit'), 'frame 796: car hit sound');
  await t.step(53);
  eq(await scene(), 'intro', 'still the intro at frame 849');
  await t.step(1);
  eq(await scene(), 'city', 'frame 850: the city');
  g = await t.state();
  eq([g.strength, g.intelligence, g.charm, g.pname], [7, 9, 4, 'Tester'], 'city with the chosen stats');
  eq(await ev(() => [SRPG.city.st.stunKind, SRPG.city.st.stun > 30]), ['wake', true], 'you start lying on the road (day-0 wake-up)');
  await t.step(45);
  await shot('city-after-intro');

  console.log('# intro SKIP');
  await ev(() => { SRPG.game.start(SRPG.newState({ pname: 'Skipper', strength: 3 })); SRPG.engine.go('intro'); });
  await t.step(100);
  await sounds();
  await t.clickUI('skip');
  eq(await ev(() => SRPG.intro.st.f), 795, 'SKIP jumps to frame 795');
  await t.step(1);
  ok((await sounds()).includes('carhit'), 'car hit right after SKIP');
  await t.step(53);
  eq(await scene(), 'intro', 'black until frame 849');
  await t.step(1);
  eq(await scene(), 'city', 'then the city');
  eq((await t.state()).pname, 'Skipper', 'same game after SKIP');

  console.log('# cheat name');
  await ev(() => { SRPG.engine.go('title'); SRPG.title.setMode('makechar'); });
  await page.fill('#ui [data-id="name"]', 'HEYZEUS!!!!');
  await t.clickUI('create-done');
  g = await t.state();
  eq({ pname: g.pname, str: g.strength, intl: g.intelligence, cha: g.charm, cash: g.cash, hp: g.hp, hpmax: g.hpmax },
    { pname: 'CHEATER!!!', str: 555, intl: 555, cha: 555, cash: 10000, hp: 570, hpmax: 570 }, 'HEYZEUS!!!! cheat');

  console.log('# CONTINUE with a save');
  const saved = await ev(() => {
    const s = SRPG.newState({ pname: 'Saver', gamelength: 40, strength: 33 });
    Object.assign(s, { day: 12, time: 15, cash: 777, bankcash: 1234, karma: -12, job: 4, dwelling: 2, fps: 0, mapx: 100, mapy: 100 });
    s.items.knife = 1;
    SRPG.save.write(s);
    return localStorage.getItem('srpg.save');
  });
  await ev(() => SRPG.engine.go('title'));
  await t.clickUI('continue');
  eq(await scene(), 'city', 'CONTINUE loads into the city');
  g = await t.state();
  eq({ pname: g.pname, day: g.day, time: g.time, cash: g.cash, bankcash: g.bankcash, karma: g.karma, job: g.job, dwelling: g.dwelling, knife: g.items.knife, gamelength: g.gamelength },
    { pname: 'Saver', day: 12, time: 15, cash: 777, bankcash: 1234, karma: -12, job: 4, dwelling: 2, knife: 1, gamelength: 40 }, 'loaded state');
  eq([g.mapx, g.mapy], [456, 622], 'loading puts you at the start junction, 8 px up');
  eq(g.fps, 1, 'loading switches SHOW FPS on (the original\'s quirk)');
  ok((await ev(() => window.__music.slice(-1)[0])) === 'main', 'city music after loading');

  console.log('# YOU DIED');
  await t.newGame({ pname: 'HEYZEUS!!!s', gamelength: 100, charm: 2, strength: 10, intelligence: 5 });
  await ev(() => SRPG.game.die());
  eq(await scene(), 'death', 'die() shows YOU DIED');
  eq((await t.state()).hp, 0, 'HP 0');
  ok((await ev(() => window.__music.slice(-1)[0])) === null, 'all music stops');
  // sprite 2334's timeline: the reeled-back pose of frame 19 comes back on 25 and is held 31..45;
  // 20..24 and 26..30 shudder; from 53 the figure lies dead
  const P = await ev(() => [19, 20, 22, 24, 25, 26, 28, 30, 31, 38, 45, 46, 53, 60, 149].map((f) => JSON.stringify(SRPG.screens.death.pose(f))));
  const [p19, p20, p22, p24, p25, p26, p28, p30, p31, p38, p45, p46, p53, p60, p149] = P;
  ok(p25 === p19 && p31 === p19 && p38 === p19 && p45 === p19, 'frames 25 and 31..45: the reeled-back pose, held still');
  ok([p20, p22, p24, p26, p28, p30].every((p) => p !== p19), 'frames 20..24 and 26..30: shudder');
  ok(p46 !== p45, 'frame 46: starts to topple');
  ok(p53 === p60 && p60 === p149 && JSON.parse(p53).dead, 'frame 53 on: lying dead');
  // the HP bar clip keeps playing (its goto frame 0 is ignored): it sweeps empty -> full every
  // 104 frames, while the label reads 0
  async function barAt(f) {
    return ev((f) => {
      SRPG.screens.death.t = f;
      const seen = [];
      const CP = CanvasRenderingContext2D.prototype, of = CP.fillText;
      CP.fillText = function (str) { seen.push(String(str)); return of.apply(this, arguments); };
      try { SRPG.engine.draw(); } finally { CP.fillText = of; }
      const d = document.getElementById('game').getContext('2d').getImageData(180, 18, 1, 1).data;
      return { rgb: [d[0], d[1], d[2]], texts: seen };
    }, f);
  }
  let bar = await barAt(100);
  ok(bar.rgb[0] > 200 && bar.rgb[1] < 60, 'YOU DIED frame 100: the bar has swept up to full (as in the reference)', bar.rgb);
  bar = await barAt(10);
  ok(bar.rgb[0] < 150, 'frame 10: the bar near empty', bar.rgb);
  bar = await barAt(108);
  ok(bar.rgb[0] < 150, 'frame 108: wrapped round to empty again', bar.rgb);
  bar = await barAt(50);
  const lbl = bar.texts.join('');
  ok(/^0\/ ?25$/.test(lbl) || /(^|[^\d])0\/ ?25/.test(lbl), 'the label reads 0/ 25 while the bar moves (half full)', bar.texts);
  await ev(() => { SRPG.screens.death.t = 1; });
  for (const f of [15, 30, 48]) { await t.step(f - (await ev(() => SRPG.screens.death.t))); await shot('death-' + f); }
  await t.step(100 - (await ev(() => SRPG.screens.death.t)));
  await shot('you-died');
  await t.step(149 - (await ev(() => SRPG.screens.death.t)));
  eq(await scene(), 'death', 'still YOU DIED at frame 149');
  await t.step(1);
  eq(await scene(), 'results', 'frame 150: the results');

  console.log('# results: count-up');
  const saveBefore = await ev(() => localStorage.getItem('srpg.save'));
  async function countRun(cash, bankcash, bankloan, karma) {
    await ev(([c, b, l, k]) => {
      SRPG.debug.newGame({ pname: 'Counter', cash: c, bankcash: b, bankloan: l, karma: k });
      SRPG.game.endGame();
    }, [cash, bankcash, bankloan, karma]);
    const final = cash + bankcash - bankloan;
    const stepN = Math.max(100, Math.round(final / 500));
    // expected sequence (frame 130 already did the first step)
    const seq = [];
    let n = -bankloan;
    for (;;) {
      if (n < final + 100) { n += stepN; seq.push(n); } else { seq.push(final); break; }
    }
    const got = [await ev(() => SRPG.results.st.netcalc)];
    await sounds();
    let guard = 0;
    while ((await ev(() => SRPG.results.st.rf)) === 131 && guard++ < 2000) {
      await t.step(1);
      got.push(await ev(() => SRPG.results.st.netcalc));
    }
    return { seq, got, final, works: (await sounds()).filter((x) => x === 'work').length };
  }
  let r = await countRun(5000, 20000, 1000, 0);
  eq(r.got, r.seq, 'count-up from -loans in steps of max(100, round(final/500)), snapping to the final');
  eq(r.works, r.got.length - 1, 'work sound on every step');
  eq(await ev(() => SRPG.results.st.rf), 133, 'then the bright flash (frame 133)');
  await t.step(1);
  await shot('results-flash');
  await t.step(15);
  eq(await ev(() => [SRPG.results.st.rf, SRPG.results.st.sf]), [149, 0], '17 frames of flash');
  await t.step(1);
  eq(await ev(() => [SRPG.results.st.rf, SRPG.results.st.sf]), [150, 1], 'frame 150: the stamp starts');
  await sounds();
  await t.step(9);
  ok((await sounds()).includes('punch'), 'stamp thud on its 10th frame');
  eq(await ev(() => Array.from(document.querySelectorAll('#ui [data-id]')).map((e) => e.getAttribute('data-id'))), [], 'no buttons while the stamp falls');
  await t.step(2);
  eq(await ev(() => SRPG.results.st.rf), 161, 'frame 161');
  eq(await ev(() => Array.from(document.querySelectorAll('#ui [data-id]')).map((e) => e.getAttribute('data-id'))), ['done'], 'DONE appears');
  eq(await ev(() => SRPG.results.st.rank), 'EXCEPTIONAL', 'rank: $24,000 neutral = EXCEPTIONAL');
  r = await countRun(10000000, 0, 0, 30);
  eq(r.got.length - 1, 501, 'big fortunes take ~500 steps (step = final/500)');
  eq(r.got[r.got.length - 1], 10000000, 'ends exactly on the final');
  eq(await ev(() => SRPG.results.st.rank), 'PHILANTHROPIST', 'rank: $10,000,000 good karma = PHILANTHROPIST');
  r = await countRun(0, 0, 5000, -50);
  eq(r.got, [-4900, -5000], 'negative net worth: one step of 100 then snaps back');
  eq(await ev(() => SRPG.results.st.rank), 'HOPELESS', 'rank: negative net worth = HOPELESS');
  await countRun(300000, 0, 0, 0);
  eq(await ev(() => SRPG.results.st.rank), 'GENIUS', 'rank: $300,000 = GENIUS (the $250k tier is unreachable, as in the original)');
  await countRun(20000, 0, 0, -40);
  eq(await ev(() => SRPG.results.st.rank), 'PETTY CRIMINAL', 'rank: $20,000 evil = PETTY CRIMINAL');
  eq(await ev(() => SRPG.game.s.karma), -40, 'karma kept (clamped to -100..100 by karmaAdjust)');
  await ev(() => { SRPG.debug.newGame({ karma: 150 }); SRPG.game.endGame(); });
  eq(await ev(() => SRPG.game.s.karma), 100, 'karmaAdjust clamps karma on the results');

  // the stamp's text box is one line tall: a long rank shows only its first wrapped line
  eq(await ev(() => ['UTTER FAILURE', 'JUVENILE DELINQUENT', 'UNDENIABLY WICKED', 'SELFLESS MILLIONAIRE', 'WHITE COLLAR CRIMINAL',
    'EXTRAORDINARILY GOOD', 'BILLIONAIRE GOD', 'MULTIMILLIONAIRE'].map(SRPG.results.stampLine)),
  ['UTTER FAILURE', 'JUVENILE', 'UNDENIABLY WICKED', 'SELFLESS', 'WHITE COLLAR', 'EXTRAORDINARILY', 'BILLIONAIRE GOD', 'MULTIMILLIONAIRE'],
  'stamp: first line of the rank only');
  await countRun(2000, 0, 0, -50);
  eq(await ev(() => SRPG.results.st.rank), 'JUVENILE DELINQUENT', 'rank: $2,000 evil = JUVENILE DELINQUENT');
  await t.step(40);
  await shot('results-long-rank');

  console.log('# results: SKIP and DONE');
  await ev(() => { SRPG.debug.newGame({ pname: 'Skip', cash: 900000, bankcash: 50000 }); SRPG.game.endGame(); });
  await t.step(5);
  ok((await ev(() => SRPG.results.st.netcalc)) < 900000, 'counting...');
  await t.clickUI('skip');
  eq(await ev(() => [SRPG.results.st.netcalc, SRPG.results.st.rf, SRPG.results.st.sf]), [950000, 150, 1], 'SKIP: final figure, straight to the stamp');
  // the reference shot: HEYZEUS!!!s, long game, $100, with the figure's hands on the hips
  await ev(() => { SRPG.debug.newGame({ pname: 'HEYZEUS!!!s', gamelength: 100, charm: 2, strength: 10, intelligence: 5 }); SRPG.game.endGame(); });
  await t.step(144);
  await shot('results');
  eq(await ev(() => SRPG.results.st.v), { pname: 'HEYZEUS!!!s', jobtitle: "'McSlave'", categ: 'Long Game (100 DAYS)', charm: 2, strength: 10, intelligence: 5, karma: 0, cash: 100, bankcash: 0, bankloan: 0 }, 'results lines');
  eq(await ev(() => SRPG.results.st.rank), 'UTTER FAILURE', 'rank: $100 = UTTER FAILURE');
  await t.clickUI('done');
  eq(await scene(), 'title', 'DONE: back to the title');
  eq((await tst()).fade, 1, 'the title fades in from black again (root frame 1 re-creates the black clip)');
  eq((await tst()).mode, 'title', 'title menu');
  eq(await ev(() => localStorage.getItem('srpg.save')), saveBefore, 'the save is untouched by dying / the results');

  console.log('# screenshots vs the original');
  const cmp = [['newgame', 'newgame-length.png', 14], ['create-character', 'create-character.png', 14], ['results', 'results-screen.png', 14],
    ['you-died', 'you-died.png', 10]];
  for (const [ours, ref, max] of cmp) {
    const d = await diff(path.join(OUT, ours + '.png'), path.join(REF, ref));
    ok(d < max, ours + ' vs ' + ref + ': mean pixel difference ' + d.toFixed(2) + ' (< ' + max + ')');
  }
  const ruf = path.join(SCR, 'ruffle/shots/01-after-start.png');
  if (fs.existsSync(ruf)) {
    const d = await diff(path.join(OUT, 'title.png'), ruf);
    ok(d < 22, 'title vs ruffle/shots/01-after-start.png: mean pixel difference ' + d.toFixed(2) + ' (< 22)');
  }

  const errs = t.errors.filter((e) => !/requestfailed|ERR_FILE_NOT_FOUND/.test(e));
  ok(errs.length === 0, 'no page errors', errs);
  await t.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
