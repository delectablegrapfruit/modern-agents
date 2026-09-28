// City map art and top-down sprites: the static city against the original's full-map render, the
// sky's time-of-day fade, what is shown for each dwelling, the sprite animations (idle / sleep,
// walking, skating, driving, falling off the edge, knocked flat, waking up), the traffic colours
// and the edge-fall of the cars, the animated signs, plus screenshots of every part of the map.
// Screenshots go to $OUT (default: the scratchpad shots/map folder).
//   node tests/map.cjs
const h = require('./harness.cjs');
const fs = require('fs');
const path = require('path');

const SCR = '/tmp/claude-0/-home-user-modern-agents/e8aaa668-44cd-5f53-8561-931f113fdf41/scratchpad';
const OUT = process.env.OUT || path.join(SCR, 'shots/map');
const REF = process.env.REF || path.join(SCR, 'ref/map-full-original.png');
fs.mkdirSync(OUT, { recursive: true });

let failures = 0;
function check(cond, msg) {
  if (cond) console.log('  ok   ' + msg);
  else { failures++; console.log('  FAIL ' + msg); }
}

// The city renderWorld with the requested SRPG.mapArt.drawAnimated call after the static layer
// (see core_requests); installed in the page so screenshots show the animated signs.
function installAnimatedHook(page) {
  return page.evaluate(() => {
    if (SRPG.city.__animHook) return;
    SRPG.city.__animHook = true;
    const orig = SRPG.city.renderWorld;
    const draw = SRPG.mapArt.drawStatic;
    // run drawAnimated right after the static city image is blitted
    const origDrawImage = CanvasRenderingContext2D.prototype.drawImage;
    SRPG.city.renderWorld = function (ctx) {
      const s = SRPG.game.s;
      const B = SRPG.mapArt.BOUNDS;
      let done = false;
      ctx.drawImage = function (img, x, y) {
        origDrawImage.apply(this, arguments);
        if (!done && img && img.width === B.w && img.height === B.h && arguments.length === 3) {
          done = true;
          SRPG.mapArt.drawAnimated(this, s, SRPG.engine.frame);
        }
      };
      try { orig.call(this, ctx); } finally { delete ctx.drawImage; }
      return draw;
    };
  });
}

(async () => {
  const t = await h.open({ scale: 2 });
  const { page } = t;
  const shot = (name) => t.shot(path.join(OUT, name + '.png'));
  await page.evaluate(() => SRPG.rng.seed(7));
  // lots of HP: the test falls off the map and gets run over several times
  await t.newGame({ pname: 'Mapper', strength: 500 });
  await installAnimatedHook(page);

  console.log('API');
  const api = await page.evaluate(() => ({
    bounds: SRPG.mapArt.BOUNDS,
    fns: ['drawSky', 'drawStatic', 'drawAnimated', 'skyAlpha'].map((k) => typeof SRPG.mapArt[k]),
    sp: ['player', 'npc', 'car'].map((k) => typeof SRPG.sprites[k]),
  }));
  check(api.fns.every((x) => x === 'function') && api.sp.every((x) => x === 'function'), 'mapArt and sprites APIs present');
  const B = api.bounds;
  check(B.x <= -1060 && B.y <= -960 && B.x + B.w >= 935 && B.y + B.h >= 955, 'BOUNDS cover the ground, its edges, the castle towers and the depot sign');

  console.log('Time of day (clouds._alpha = 100 + 8 * (12 - time), capped at 100%)');
  const alphas = await page.evaluate(() => [8, 12, 13, 18, 20, 24].map((h) => SRPG.mapArt.skyAlpha(h)));
  check(alphas[0] === 1 && alphas[1] === 1, 'morning to noon: clouds fully shown (' + alphas.slice(0, 2) + ')');
  check(Math.abs(alphas[2] - 0.92) < 1e-9 && Math.abs(alphas[3] - 0.52) < 1e-9 && Math.abs(alphas[4] - 0.36) < 1e-9, '1 PM 92%, 6 PM 52%, 8 PM 36%');
  check(Math.abs(alphas[5] - 0.04) < 1e-9, 'midnight: 4% of the clouds left over the night sky');
  // sky pixel: blue by day, dark at night
  const skyPx = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 550; c.height = 400;
    const x = c.getContext('2d');
    const s = SRPG.game.s;
    const px = (tm) => { s.time = tm; SRPG.mapArt.drawSky(x, s, 0); return Array.from(x.getImageData(500, 380, 1, 1).data); };
    const r = [px(8), px(24)];
    s.time = 8;
    return r;
  });
  check(skyPx[0][2] > 180 && skyPx[0][2] > skyPx[0][0], 'day sky is blue ' + skyPx[0]);
  check(skyPx[1][0] < 70 && skyPx[1][1] < 70 && skyPx[1][2] < 80, 'night sky is dark ' + skyPx[1]);

  console.log('Whole city vs the original render');
  const refB64 = fs.readFileSync(REF).toString('base64');
  const cmp = await page.evaluate(async (refB64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + refB64;
    await img.decode();
    const W = 2200, H = 2000;
    const ref = document.createElement('canvas'); ref.width = W; ref.height = H;
    ref.getContext('2d').drawImage(img, 0, 0);
    const R = ref.getContext('2d').getImageData(0, 0, W, H).data;
    // the original's render shows both the castle and the mansion; draw both for the comparison
    function render() {
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const x = c.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
      const s = JSON.parse(JSON.stringify(SRPG.game.s));
      s.dwelling = 5;
      const l = document.createElement('canvas'); l.width = W; l.height = H;
      const y = l.getContext('2d');
      y.translate(1100, 1000);
      SRPG.mapArt.drawStatic(y, s);
      SRPG.mapArt.drawBuilding(y, 'mansion');
      x.drawImage(l, 0, 0);
      return c;
    }
    const mine = render();
    const M = mine.getContext('2d').getImageData(0, 0, W, H).data;
    let n = 0, close = 0, sum = 0, cov = 0, covBoth = 0;
    for (let y = 0; y < H; y += 2) {
      for (let x = 0; x < W; x += 2) {
        const i = (y * W + x) * 4;
        const rWhite = R[i] > 245 && R[i + 1] > 245 && R[i + 2] > 245;
        const mWhite = M[i] > 245 && M[i + 1] > 245 && M[i + 2] > 245;
        if (!rWhite) cov++;
        if (!rWhite && !mWhite) covBoth++;
        if (rWhite && mWhite) continue;
        const d = Math.abs(R[i] - M[i]) + Math.abs(R[i + 1] - M[i + 1]) + Math.abs(R[i + 2] - M[i + 2]);
        n++; sum += d;
        if (d < 60) close++;
      }
    }
    // save both for the side-by-side
    const side = document.createElement('canvas'); side.width = W; side.height = H / 2;
    const sx = side.getContext('2d');
    sx.drawImage(ref, 0, 0, W / 2, H / 2);
    sx.drawImage(mine, W / 2, 0, W / 2, H / 2);
    return { close: close / n, mean: sum / n, shape: covBoth / cov, png: mine.toDataURL('image/png'), side: side.toDataURL('image/png') };
  }, refB64);
  fs.writeFileSync(path.join(OUT, 'full-map-mine.png'), Buffer.from(cmp.png.split(',')[1], 'base64'));
  fs.writeFileSync(path.join(OUT, 'full-map-side-by-side.png'), Buffer.from(cmp.side.split(',')[1], 'base64'));
  console.log('    pixels within tolerance: ' + (cmp.close * 100).toFixed(1) + '%, mean abs diff ' + cmp.mean.toFixed(1) + ', ground coverage ' + (cmp.shape * 100).toFixed(1) + '%');
  check(cmp.shape > 0.97, 'the city covers the same ground as the original (>97%)');
  check(cmp.close > 0.85, 'more than 85% of the city\'s pixels match the original render');

  console.log('Dwellings: mansion only at 4, castle only at 5 (root frame 2)');
  const dw = await page.evaluate(() => {
    const probe = (d, X, Y) => {
      const c = document.createElement('canvas'); c.width = 4; c.height = 4;
      const x = c.getContext('2d');
      x.translate(-X, -Y);
      const s = Object.assign({}, SRPG.game.s, { dwelling: d });
      SRPG.mapArt.drawStatic(x, s);
      return Array.from(x.getImageData(0, 0, 1, 1).data);
    };
    const castle = [-480, -700], mansion = [-340, -720], cone = [-450, -920];
    return [1, 2, 3, 4, 5].map((d) => ({ d, castle: probe(d, ...castle), mansion: probe(d, ...mansion), cone: probe(d, ...cone) }));
  });
  const isGrass = (p) => p[0] === 51 && p[1] === 204 && p[2] === 0;
  for (const r of dw) {
    const castle = !isGrass(r.castle) && r.castle[3] > 0 && Math.abs(r.castle[0] - r.castle[2]) < 20;
    const mansion = r.mansion[0] > 140 && r.mansion[1] < 110 && r.mansion[2] < 40;
    if (r.d <= 3) check(!castle && !mansion && isGrass(r.castle) && r.cone[3] === 0, 'dwelling ' + r.d + ': grass, no castle or mansion');
    if (r.d === 4) check(mansion && !castle, 'dwelling 4: the mansion');
    if (r.d === 5) check(castle && !mansion && r.cone[2] > 100, 'dwelling 5: the castle (and its cone above the edge)');
  }

  console.log('Player sprite: standing still (the walk clip sends the person back to frame 20 every other tick)');
  const stand = await page.evaluate(() => {
    const s = SRPG.game.s;
    const grab = () => {
      SRPG.engine.draw();
      const c = document.querySelector('canvas');
      const x = c.getContext('2d');
      const k = c.width / 550;
      return Array.from(x.getImageData(Math.round((247 - 30) * k), Math.round((197 - 30) * k), Math.round(60 * k), Math.round(60 * k)).data);
    };
    s.mapx = 456; s.mapy = 630; s.driving = 0;
    SRPG.city.cars.forEach((c) => { c.s = 500; });
    SRPG.engine.step(2);
    const a = grab();
    let same = true;
    for (let i = 0; i < 20; i++) {
      SRPG.city.cars.forEach((c) => { c.s = 500; });
      SRPG.engine.step(25);
      const b = grab();
      for (let j = 0; j < a.length; j++) if (a[j] !== b[j]) { same = false; break; }
    }
    return { same };
  });
  check(stand.same, 'standing still for 500 ticks keeps the standing pose (no stretch, no falling asleep)');

  console.log('Homeless Harold (clip 455: back to 1 at 45 unless random(5) == 0, back to 71 at 140, 165 -> 1)');
  const hobo = await page.evaluate(() => {
    const f = SRPG.sprites.hoboFrame;
    let bad = 0, drinks = 0, n45 = 0, back1 = 0;
    for (let i = 0; i < 20000; i++) {
      const a = f(i), b = f(i + 1);
      if (a === 46) drinks++;
      if (a === 44) { if (b === 45) n45++; else if (b === 1) back1++; }
      const ok = b === a + 1 || (a === 44 && b === 1) || (a === 139 && b === 71) || (a === 164 && b === 1);
      if (!ok) bad++;
    }
    return { bad, drinks, n45, back1, first: f(0) };
  });
  check(hobo.bad === 0 && hobo.first === 1, 'the hobo clip only steps or jumps as its frame scripts allow (' + hobo.bad + ' bad steps)');
  check(hobo.drinks > 0 && hobo.n45 > 0 && hobo.back1 > hobo.n45 * 2, 'he mostly sits, now and then drinks (' + hobo.n45 + ' drinks vs ' + hobo.back1 + ' repeats)');

  console.log('Cars');
  const cars = await page.evaluate(() => {
    const px = (tint) => {
      const c = SRPG.sprites.carCanvas(false, tint);
      const d = c.getContext('2d').getImageData(Math.round(c.width / 2 - 4), Math.round(c.height * 0.62), 1, 1).data;
      return Array.from(d);
    };
    return { yellow: px(null), green: px({ r: 20, g: 100, b: 150 }), orange: px({ r: 100, g: 45, b: 150 }), frames: SRPG.sprites.CARFALL_FRAMES };
  });
  check(cars.yellow[0] > 200 && cars.yellow[1] > 170 && cars.yellow[2] < 60, 'the car picture is yellow ' + cars.yellow);
  check(cars.green[1] > 150 && cars.green[0] < 60, 'red reduced by the transform -> green car ' + cars.green);
  check(cars.orange[0] > 200 && cars.orange[1] < 120, 'green reduced -> orange car ' + cars.orange);
  check(cars.frames === 26, 'a car leaving the road shrinks away over 25 frames (clip frames 2-26)');

  // ---------------------------------------------------------------------------------------------
  console.log('Screenshots');
  // the player on the sidewalk in front of each door (the original's door windows, js/world/map.js)
  const places = [
    ['start', 456, 630], ['apartment', 1056, 750], ['castle-lot', 440, 900], ['bank', 125, 770], ['nli', 125, 510],
    ['mcsticks', 440, 324], ['uofs', -415, 320], ['furniture', 910, 430], ['bar', 440, 80], ['casino', 440, -490],
    ['store', 125, -200], ['pawn', 125, -512], ['bus-depot', -517, -5], ['east-road', -300, 160], ['junction', 200, 300],
  ];
  for (const [name, mx, my] of places) {
    await t.set({ mapx: mx, mapy: my, time: 10 });
    await t.step(1);
    await shot('place-' + name);
  }
  // each dwelling at the castle lot
  for (const d of [4, 5]) {
    await t.set({ mapx: 560, mapy: 900, dwelling: d });
    await t.step(3);
    await shot('dwelling-' + d);
  }
  await t.set({ dwelling: 1 });
  // map edges (standing at each walking limit)
  const edges = [['edge-north', 200, 1010], ['edge-south', 200, -686], ['edge-west', 1226, 600], ['edge-east', -656, 150],
    ['edge-northwest', 1226, 754], ['edge-southeast', -656, 0]];
  for (const [name, mx, my] of edges) {
    await t.set({ mapx: mx, mapy: my });
    await t.step(1);
    await shot(name);
  }
  // time of day
  for (const tm of [8, 16, 20, 24]) {
    await t.set({ mapx: 200, mapy: 1010, time: tm });
    await t.step(1);
    await shot('sky-time-' + tm);
  }
  await t.set({ time: 10 });

  console.log('Falling off the north edge');
  await t.set({ mapx: 200, mapy: 1012 });
  await t.hold(['ArrowUp'], 3);
  let st = await page.evaluate(() => ({ kind: SRPG.city.st.stunKind, stun: SRPG.city.st.stun, mapy: SRPG.game.s.mapy }));
  check(st.kind === 'fall', 'walking off the edge starts the fall');
  await t.step(5); await shot('fall-05');
  await t.step(7); await shot('fall-12');
  await t.step(8); await shot('fall-20');
  await t.step(10); await shot('fall-30');
  await t.step(12);
  await t.hold(['ArrowDown'], 1);
  await shot('fall-after');
  console.log('Falling off the south edge (the clip is rotated with the player)');
  await t.set({ mapx: 200, mapy: -688 });
  await t.hold(['ArrowDown'], 3);
  await t.step(10); await shot('fall-south-10');
  await t.step(40);

  console.log('Walking, skating, standing, sleeping');
  // hold keys, run ticks and take the screenshot while they are still down
  const moving = async (keys, n, name) => {
    await page.evaluate(([keys, n]) => { keys.forEach((k) => (SRPG.engine.keys[k] = true)); SRPG.engine.step(n); SRPG.engine.draw(); }, [keys, n]);
    await shot(name);
    await page.evaluate(() => SRPG.engine.releaseAll());
  };
  await t.set({ mapx: 456, mapy: 630 });
  await moving(['ArrowLeft'], 6, 'walk-left');
  await moving(['ArrowLeft'], 7, 'walk-left-2');
  await moving(['ArrowUp', 'ArrowRight'], 5, 'walk-diagonal');
  await t.set({ items: { skateboard: 1 } });
  await moving(['ArrowUp', 'Shift'], 9, 'skate');
  await moving(['ArrowRight', 'Shift'], 9, 'skate-right');
  await t.step(1); await shot('standing');
  for (let i = 0; i < 40; i++) await t.step(10); // drawn along the way, as in the game
  await shot('standing-400-ticks');

  console.log('Driving');
  await t.set({ items: { car: 1 }, driving: 1, mapx: 30, mapy: 300, rot: 0 });
  await moving(['ArrowUp'], 10, 'drive-car-up');
  await moving(['ArrowRight'], 10, 'drive-car-right');
  await moving(['ArrowDown', 'ArrowLeft'], 6, 'drive-car-diagonal');
  await t.set({ items: { car: 2 } });
  await moving(['ArrowUp'], 8, 'drive-sportscar');
  await t.set({ driving: 0, items: { car: 0 } });

  console.log('Knocked down by a car, crashing, waking up');
  await page.evaluate(() => {
    const s = SRPG.game.s;
    s.hp = s.hpmax;
    s.mapx = 250; s.mapy = 200;
    const p = SRPG.MAP.playerPos(s);
    const c = SRPG.city.cars[0];
    c.s = 1; c.x = 15; c.y = p.y + 80; c.rot = 0;
    s.mapx = 247 - 15; // stand in the up lane
  });
  await t.step(8);
  st = await page.evaluate(() => ({ kind: SRPG.city.st.stunKind, stun: SRPG.city.st.stun }));
  check(st.kind === 'hit', 'a car running the player over knocks him flat');
  await t.step(24);
  await shot('knocked-down');
  await t.step(20);
  await page.evaluate(() => SRPG.engine.go('city', { wake: true, fade: false }));
  await t.step(4);
  await shot('wake-up');
  await t.step(40);

  console.log('Traffic, parked car, street people');
  await page.evaluate(() => {
    const c = SRPG.city.cars;
    c[0].s = 1; c[0].x = 15; c[0].y = -300; c[0].rot = 0; c[0].color = '#66dd22';
    c[1].s = 0; c[1].x = -75; c[1].y = -380; c[1].rot = 180; c[1].color = '#ff8800';
    SRPG.game.s.mapx = 220; SRPG.game.s.mapy = 560;
  });
  await t.step(1);
  await shot('traffic');
  await t.set({ mapx: 1100, mapy: 700 });
  await t.step(1); await shot('parked-car');
  await t.set({ mapx: 539, mapy: 717 });
  await t.step(1); await shot('npc-smokes-kid');
  await t.set({ mapx: 440, mapy: 110 });
  await t.step(1); await shot('npc-hobo');
  await t.set({ mapx: 125, mapy: -430 });
  await t.step(1); await shot('npc-dealer');

  console.log('Animated signs');
  const anim = await page.evaluate(() => {
    const s = Object.assign({}, SRPG.game.s, { mapx: 60, mapy: -60, dwelling: 1 });
    const c = document.createElement('canvas'); c.width = 550; c.height = 400;
    const x = c.getContext('2d');
    // ENTER's first letter at map (184.5, 333); clip frame n is engine frame n - 1
    const px = (f, X, Y, st) => { SRPG.mapArt.drawAnimated(x, st || s, f); return Array.from(x.getImageData(st ? st.mapx + X : 60 + X, st ? st.mapy + Y : -60 + Y, 1, 1).data); };
    const enter = [px(0, 184.5, 333), px(8, 184.5, 333), px(9, 184.5, 333), px(69, 184.5, 333)];
    // BUS DEPOT and the Sticky's neon: count sign-coloured pixels in their patches
    const count = (f, st, X, Y, W, H, pred) => {
      SRPG.mapArt.drawAnimated(x, st, f);
      const d = x.getImageData(st.mapx + X, st.mapy + Y, W, H).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (pred(d[i], d[i + 1], d[i + 2])) n++;
      return n;
    };
    const sb = Object.assign({}, s, { mapx: -400, mapy: -150 });
    const lit = (r, g, b) => r < 30 && g < 30 && b > 230;
    const dark = (r, g, b) => r < 30 && g < 30 && b > 130 && b < 175;
    const bus = { dark1: count(0, sb, 670, 226, 260, 24, dark), lit1: count(0, sb, 670, 226, 260, 24, lit), lit40: count(39, sb, 670, 226, 260, 24, lit), dark40: count(39, sb, 670, 226, 260, 24, dark) };
    const sn = Object.assign({}, s, { mapx: 600, mapy: 100 });
    const yel = (r, g, b) => r > 235 && g > 180 && g < 225 && b < 60;
    const org = (r, g, b) => r > 180 && r < 225 && g > 80 && g < 125 && b < 40;
    const fla = (r, g, b) => r > 235 && g > 130 && g < 170 && b < 40;
    const neon = {};
    [1, 20, 50, 66, 70].forEach((n) => {
      neon[n] = { y: count(n - 1, sn, -335, 32, 65, 164, yel), o: count(n - 1, sn, -335, 32, 65, 164, org), f: count(n - 1, sn, -335, 32, 65, 164, fla) };
    });
    return { enter, bus, neon };
  });
  const green = (p) => p[1] > 200;
  check(!green(anim.enter[0]) && !green(anim.enter[1]) && green(anim.enter[2]) && green(anim.enter[3]),
    'ENTER: the E lights at clip frame 10, not before (' + anim.enter.map((p) => p[1]).join(', ') + ')');
  check(anim.bus.dark1 > 200 && anim.bus.lit1 < 20 && anim.bus.lit40 > 200 && anim.bus.dark40 < 20,
    'BUS DEPOT: unlit at frame 1, fully lit at frame 40 ' + JSON.stringify(anim.bus));
  const nn = anim.neon;
  check(nn[1].y < 10 && nn[1].o > 100, "Sticky's neon: all tubes dark orange at frame 1 " + JSON.stringify(nn[1]));
  check(nn[20].y > 30 && nn[20].o > 100 && nn[50].y > nn[20].y && nn[50].o > 20, 'the words light up in turn (frames 20, 50) ' + JSON.stringify([nn[20], nn[50]]));
  check(nn[66].f > 100 && nn[66].y < 10, 'frames 65-69 flash orange ' + JSON.stringify(nn[66]));
  check(nn[70].y > 100 && nn[70].o < 10, 'frame 70: everything lit ' + JSON.stringify(nn[70]));

  console.log('Drawing never uses the game\'s random numbers');
  const rngSafe = await page.evaluate(() => {
    SRPG.rng.seed(99);
    const a = SRPG.rng.float();
    SRPG.rng.seed(99);
    const c = document.createElement('canvas'); c.width = 550; c.height = 400;
    const x = c.getContext('2d');
    const s = Object.assign({}, SRPG.game.s, { dwelling: 5 });
    for (let f = 0; f < 300; f += 7) {
      SRPG.mapArt.drawSky(x, s, f);
      SRPG.mapArt.drawAnimated(x, s, f);
      SRPG.sprites.npc(x, 100, 100, { kind: 'hobo', color: '#ff9900' });
      SRPG.sprites.npc(x, 100, 100, { kind: 'smokes', color: '#33ccff' });
      SRPG.sprites.player(x, 200, 200, { rot: 90, color: '#0066cc', phase: f, mode: 'walk' });
      SRPG.sprites.car(x, 300, 200, { rot: 0, tint: { r: 60, g: 100, b: 150 }, fall: f % 30 });
    }
    return SRPG.rng.float() === a;
  });
  check(rngSafe, 'sky, animated signs, street people, player and cars leave SRPG.rng untouched');
  await t.set({ mapx: 40, mapy: -250 });
  for (const f of [3, 14, 24, 55]) { await page.evaluate((f) => { SRPG.engine.frame = f; SRPG.engine.draw(); }, f); await shot('anim-enter-' + f); }
  await t.set({ mapx: 450, mapy: -490 });
  for (const f of [5, 30]) { await page.evaluate((f) => { SRPG.engine.frame = f; SRPG.engine.draw(); }, f); await shot('anim-casino-' + f); }
  await t.set({ mapx: 480, mapy: 90 });
  for (const f of [6, 30, 66]) { await page.evaluate((f) => { SRPG.engine.frame = f; SRPG.engine.draw(); }, f); await shot('anim-neon-' + f); }
  await t.set({ mapx: -470, mapy: 20 });
  for (const f of [5, 20, 40]) { await page.evaluate((f) => { SRPG.engine.frame = f; SRPG.engine.draw(); }, f); await shot('anim-bus-' + f); }

  console.log('Side by side with the original screenshots (same mapx / mapy, located on the full map)');
  // [reference, mapx, mapy, rotation]: positions found by matching each screenshot to the map
  const refs = [
    ['start-position', 457, 629, 0], ['map-car-store', 312, -258, 0], ['map-pawn-dealer', 144, -498, 90],
    ['map-stickys-hobo', 448, 110, 90], ['map-casino', 440, -330, 90], ['map-mcsticks-nli', 328, 374, 0],
    ['map-top-edge-bank', 312, 978, 0], ['hud-map', 448, 754, 0],
  ];
  for (const [ref, mx, my, rot] of refs) {
    const file = path.join(SCR, 'ref', ref + '.png');
    if (!fs.existsSync(file)) continue;
    await page.evaluate(() => { SRPG.city.cars.forEach((c) => { c.s = 500; }); });
    await t.set({ mapx: mx, mapy: my, rot, time: 8, driving: 0 });
    await t.step(1);
    const mine = (await page.screenshot()).toString('base64');
    const side = await page.evaluate(async ([a, b]) => {
      const load = async (b64) => { const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode(); return im; };
      const A = await load(a), B = await load(b);
      const c = document.createElement('canvas'); c.width = A.width + B.width + 4; c.height = Math.max(A.height, B.height);
      const x = c.getContext('2d');
      x.fillStyle = '#f0f'; x.fillRect(0, 0, c.width, c.height);
      x.drawImage(A, 0, 0); x.drawImage(B, A.width + 4, 0);
      return c.toDataURL('image/png');
    }, [fs.readFileSync(file).toString('base64'), mine]);
    fs.writeFileSync(path.join(OUT, 'vs-' + ref + '.png'), Buffer.from(side.split(',')[1], 'base64'));
  }

  const errs = t.errors.filter((e) => !/requestfailed|ERR_FILE_NOT_FOUND/.test(e));
  check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await t.close();
  console.log(failures ? failures + ' FAILED' : 'all map checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
