// Shops and street people: the convenience store (and robbing it), pawn shop, Fine Line
// Furnishings, McSticks, the dealer, Homeless Harold, the smokes kid and the parked car.
// Checks every price / effect / limit / time rule against the original, then screenshots each
// screen to $OUT (default: the scratchpad's shots/shops) at 2x, the size of the reference shots.
const h = require('./harness.cjs');
const path = require('path');
const fs = require('fs');
const OUT = process.env.OUT || '/tmp/claude-0/-home-user-modern-agents/e8aaa668-44cd-5f53-8561-931f113fdf41/scratchpad/shots/shops';

let failures = 0, passes = 0;
function check(name, cond, extra) {
  if (cond) passes++;
  else { failures++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra) : ''); }
}
function eq(name, a, b) { check(name + ' (' + JSON.stringify(a) + ' vs ' + JSON.stringify(b) + ')', JSON.stringify(a) === JSON.stringify(b), undefined); }

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const t = await h.open({ scale: 2 });
  const { page } = t;
  const shot = (name) => t.shot(path.join(OUT, name + '.png'));
  const S = () => t.state();
  const ids = () => page.evaluate(() => Array.from(document.querySelectorAll('#ui [data-id]')).map((e) => e.getAttribute('data-id')));
  const has = async (id) => (await ids()).indexOf(id) >= 0;
  const scene = () => page.evaluate(() => SRPG.engine.sceneName + (SRPG.location.current ? ':' + SRPG.location.current : ''));
  const text = () => page.evaluate(() => document.getElementById('ui').innerText.replace(/\s+/g, ' '));
  // Count error / purchase sounds by wrapping SRPG.sound.play.
  await page.evaluate(() => {
    window.__snd = [];
    const orig = SRPG.sound.play;
    SRPG.sound.play = function (n) { window.__snd.push(n); return orig.apply(this, arguments); };
  });
  // Record music changes too.
  await page.evaluate(() => {
    window.__music = [];
    const om = SRPG.sound.music;
    SRPG.sound.music = function (n) { window.__music.push(n); return om.apply(this, arguments); };
  });
  const lastMusic = () => page.evaluate(() => window.__music[window.__music.length - 1]);
  // Position of a button's icon tile in stage px (for layout checks against the references).
  const tile = (id) => page.evaluate((id) => {
    const e = document.querySelector('#ui [data-id="' + id + '"] .ico');
    if (!e) return null;
    const r = e.getBoundingClientRect(), st = document.getElementById('stage').getBoundingClientRect(), k = 550 / st.width;
    return [(r.left - st.left) * k, (r.top - st.top) * k];
  }, id);
  const near = (name, a, b, tol) => check(name + ' (' + JSON.stringify(a) + ' ~ ' + JSON.stringify(b) + ')', a && Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol);
  const sounds = async () => { const s = await page.evaluate(() => window.__snd.filter((n) => n !== 'click')); await page.evaluate(() => { window.__snd = []; }); return s; };
  const fresh = async (o) => { await t.newGame(Object.assign({ pname: 'Tester' }, o || {})); await sounds(); };
  const visit = async (id, patch) => { if (patch) await t.set(patch); await t.open(id); await t.step(12); };

  // ============================== convenience store ==============================
  await fresh({ cash: 100, hp: 10, hpmax: 20, time: 8 });
  await visit('store');
  await shot('store');
  eq('store buttons', (await ids()).filter((i) => i !== 'npc-text').sort(), ['candybar', 'leave', 'nachos', 'pills', 'slushee', 'smokes'].sort());
  check('no rob button without a gun', !(await has('rob')));

  await t.clickUI('slushee');
  let s = await S();
  eq('slushee cash/hp/time', [s.cash, s.hp, s.time], [99, 11, 9]);
  eq('slushee sound', await sounds(), ['drink']);
  await t.clickUI('candybar');
  s = await S();
  eq('candy bar', [s.cash, s.hp, s.time], [97, 14, 10]);
  eq('candy sound', await sounds(), ['eat']);
  await t.clickUI('nachos');
  s = await S();
  eq('nachos', [s.cash, s.hp, s.time], [93, 20, 11]); // 14+7 capped at 20
  eq('nachos sound', await sounds(), ['eat']);
  // HP full: all three refuse
  for (const b of ['slushee', 'candybar', 'nachos']) await t.clickUI(b);
  s = await S();
  eq('full hp refuses food', [s.cash, s.hp, s.time], [93, 20, 11]);
  eq('full hp errors', await sounds(), ['error', 'error', 'error']);
  // not enough cash
  await t.set({ hp: 5, cash: 3 });
  await t.clickUI('nachos');
  s = await S();
  eq('nachos needs $4', [s.cash, s.hp], [3, 5]);
  await t.set({ cash: 1 });
  await t.clickUI('candybar');
  eq('candy needs $2', (await S()).cash, 1);
  await t.set({ cash: 0 });
  await t.clickUI('slushee');
  eq('slushee needs $1', (await S()).hp, 5);
  eq('no-cash errors', await sounds(), ['error', 'error', 'error']);
  // 24:00 limit
  await t.set({ cash: 50, time: 24 });
  for (const b of ['slushee', 'candybar', 'nachos']) await t.clickUI(b);
  s = await S();
  eq('no food at 24:00', [s.cash, s.hp, s.time], [50, 5, 24]);
  await t.set({ time: 23 });
  await t.clickUI('candybar');
  s = await S();
  eq('food at 23:00', [s.cash, s.hp, s.time], [48, 8, 24]);
  await sounds();
  // smokes and pills: no time cost, 99 max
  await t.set({ cash: 1000, time: 12, items: { smokes: 0, pills: 0 } });
  await t.clickUI('smokes');
  await t.clickUI('pills');
  s = await S();
  eq('smokes + pills', [s.cash, s.items.smokes, s.items.pills, s.time], [945, 1, 1, 12]);
  eq('purchase sounds', await sounds(), ['purchase', 'purchase']);
  await t.set({ items: { smokes: 99, pills: 99 } });
  await t.clickUI('smokes');
  await t.clickUI('pills');
  s = await S();
  eq('99 limit', [s.cash, s.items.smokes, s.items.pills], [945, 99, 99]);
  await t.set({ cash: 9, items: { smokes: 0, pills: 0 } });
  await t.clickUI('smokes');
  await t.set({ cash: 44 });
  await t.clickUI('pills');
  s = await S();
  eq('smokes/pills need cash', [s.cash, s.items.smokes, s.items.pills], [44, 0, 0]);
  eq('limit errors', await sounds(), ['error', 'error', 'error', 'error']);

  // --- robbery ---
  // The button needs a gun and at least 10 bullets when you walk in.
  await visit('store', { items: { gun: 1, ammo: 9 } });
  check('no rob with 9 bullets', !(await has('rob')));
  await visit('store', { items: { gun: 1, ammo: 10 } });
  check('rob button with gun + 10 bullets', await has('rob'));
  await t.set({ cash: 100, charm: 600, time: 12, day: 3, karma: 0, gamelength: 0 });
  await t.set({ hp: 20, hpmax: 25 });
  await shot('store-rob');
  // Find a seed that succeeds and predict the draws: ammo -= random(5)+5, random(charm) > 40, random(500).
  const pred = await page.evaluate(() => {
    for (let n = 1; n < 500; n++) {
      SRPG.rng.seed(n);
      const a = SRPG.rng.random(5) + 5, roll = SRPG.rng.random(600), amt = SRPG.rng.random(500);
      if (roll > 40) { SRPG.rng.seed(n); return { n, a, roll, amt }; }
    }
  });
  await t.clickUI('rob');
  s = await S();
  eq('robbery success', [s.time, s.items.ammo, s.cash, s.day], [24, 10 - pred.a, 100 + pred.amt, 3]);
  eq('robbery screen', await page.evaluate(() => document.querySelector('[data-screen]') && document.querySelector('[data-screen]').getAttribute('data-screen')), 'robbed');
  check('robbed amount shown', (await text()).indexOf('$ ' + pred.amt) >= 0, await text());
  eq('robbery sound', await sounds(), ['work']);
  await shot('store-robbed');
  await t.set({ mapx: 100, mapy: 100 });
  await t.clickUI('ok');
  s = await S();
  eq('after robbery: karma -10, back at the start', [s.karma, s.mapx, s.mapy], [-10, 456, 630]);
  eq('after robbery scene', await scene(), 'city');
  // The OK button (unlike every LEAVE) never switches the store's loop back to the street music.
  eq('store music keeps playing after the robbery', await lastMusic(), 'inside');

  // failure: charm 41 can never pass (random(41) <= 40)
  await visit('store', { items: { gun: 1, ammo: 20 }, charm: 41, time: 20, day: 3, karma: 0, cash: 100 });
  await page.evaluate(() => SRPG.rng.seed(7));
  await t.clickUI('rob');
  s = await S();
  check('failed robbery ammo 11..15', s.items.ammo >= 11 && s.items.ammo <= 15, s.items.ammo);
  eq('jail: 5 days, midnight, no cash', [s.day, s.time, s.cash], [8, 24, 100]);
  eq('jail screen', await page.evaluate(() => document.querySelector('[data-screen]').getAttribute('data-screen')), 'jail');
  await shot('store-jail');
  await t.clickUI('ok');
  s = await S();
  eq('after jail', [s.karma, s.mapx, s.mapy, s.day], [-10, 456, 630, 8]);
  eq('after jail scene', await scene(), 'city');
  // robbing from 21:00 on is refused
  await visit('store', { items: { gun: 1, ammo: 20 }, charm: 600, time: 21, day: 3, cash: 100 });
  await sounds();
  await t.clickUI('rob');
  s = await S();
  eq('no robbery at 21:00', [s.time, s.items.ammo, s.day, s.cash], [21, 20, 3, 100]);
  eq('rob refused sound', await sounds(), ['error']);
  eq('still in store', await scene(), 'location:store');
  // jail past the end of a timed game ends it
  await visit('store', { items: { gun: 1, ammo: 20 }, charm: 5, time: 10, day: 12, gamelength: 15 });
  await t.clickUI('rob');
  eq('day 17 of 15', (await S()).day, 17);
  await t.clickUI('ok');
  check('jail past the last day -> results', /^results/.test(await scene()), await scene());
  // One robbery per visit: the result replaces the whole menu (ROB included). Jail that ends on
  // the last day (15 of 15) keeps the game going; the -10 karma is clamped at -100.
  await fresh({ charm: 41, time: 8, karma: -95, cash: 50, items: { gun: 1, ammo: 10 }, gamelength: 15, day: 10 });
  await visit('store');
  await t.clickUI('rob');
  check('result screen has no store buttons', !(await has('rob')) && !(await has('slushee')) && (await has('ok')));
  s = await S();
  check('10 bullets -> 1..5 left', s.items.ammo >= 1 && s.items.ammo <= 5, s.items.ammo);
  await t.clickUI('ok');
  s = await S();
  eq('jail to day 15 of 15', [await scene(), s.day, s.time, s.karma, s.cash], ['city', 15, 24, -100, 50]);
  await visit('store', { time: 8 });
  check('no ROB with the bullets left over', !(await has('rob')));
  // karma +10 after the win's -10 (clamped the other way round too)
  await fresh({ charm: 999, time: 8, karma: 100, items: { gun: 1, ammo: 99 } });
  await visit('store');
  await page.evaluate(() => SRPG.rng.seed(3));
  await t.clickUI('rob');
  const won = await page.evaluate(() => document.querySelector('[data-screen]').getAttribute('data-screen'));
  await t.clickUI('ok');
  s = await S();
  eq('karma after OK', s.karma, 90);
  check('robbery result was a win or jail', won === 'robbed' || won === 'jail', won);
  await page.evaluate(() => SRPG.rng.unseed());

  // ============================== pawn shop ==============================
  await fresh({ cash: 1000 });
  await visit('pawn');
  await shot('pawn');
  eq('pawn buttons', (await ids()).sort(), ['alarm', 'cellphone', 'gun', 'knife', 'leave'].sort());
  await t.clickUI('gun');
  s = await S();
  eq('hand gun', [s.cash, s.items.gun], [600, 1]);
  const afterGun = await ids();
  check('gun gone, ammo not until next visit', afterGun.indexOf('gun') < 0 && afterGun.indexOf('ammo') < 0, afterGun);
  await t.clickUI('knife');
  await t.clickUI('alarm');
  await t.clickUI('cellphone');
  s = await S();
  eq('knife/alarm/phone', [s.cash, s.items.knife, s.items.alarm, s.items.cellPhone], [100, 1, 1, 1]);
  eq('pawn sounds', await sounds(), ['purchase', 'purchase', 'purchase', 'purchase']);
  eq('only leave left', await ids(), ['leave']);
  await visit('pawn');
  eq('next visit: ammo', (await ids()).sort(), ['ammo', 'leave']);
  await shot('pawn-ammo');
  await t.clickUI('ammo');
  s = await S();
  eq('ammo +5 for $10', [s.cash, s.items.ammo], [90, 5]);
  await t.set({ items: { ammo: 94 } });
  await t.clickUI('ammo');
  eq('ammo 94 -> 99', (await S()).items.ammo, 99);
  await t.clickUI('ammo');
  eq('ammo stops at 95+', (await S()).items.ammo, 99);
  await t.set({ cash: 9, items: { ammo: 0 } });
  await t.clickUI('ammo');
  eq('ammo needs $10', [(await S()).cash, (await S()).items.ammo], [9, 0]);
  eq('ammo sounds', await sounds(), ['purchase', 'purchase', 'error', 'error']);
  await fresh({ cash: 399 });
  await visit('pawn');
  await t.clickUI('gun');
  await t.set({ cash: 99 });
  await t.clickUI('knife');
  await t.set({ cash: 199 });
  await t.clickUI('alarm');
  await t.clickUI('cellphone');
  s = await S();
  eq('pawn needs the cash', [s.cash, s.items.gun, s.items.knife, s.items.alarm, s.items.cellPhone], [199, 0, 0, 0, 0]);
  eq('pawn errors', await sounds(), ['error', 'error', 'error', 'error']);

  // ============================== Fine Line Furnishings ==============================
  const furn = async (patch) => { await visit('furniture', patch); return (await ids()).filter((i) => i !== 'leave').sort(); };
  await fresh({ cash: 50000 });
  eq('apartment: bed only', await furn({ dwelling: 1 }), ['bed']);
  await shot('furniture-apartment');
  eq('bigger apartment: + computer', await furn({ dwelling: 2 }), ['bed', 'computer']);
  eq('penthouse: + tv, freezer', await furn({ dwelling: 3 }), ['bed', 'computer', 'freezer', 'tv']);
  eq('mansion, nothing owned', await furn({ dwelling: 4 }), ['bed', 'computer', 'freezer', 'tv']);
  await shot('furniture-mansion');
  await t.clickUI('bed');
  await t.clickUI('tv');
  await t.clickUI('computer');
  await t.clickUI('freezer');
  s = await S();
  eq('first tier bought', [s.cash, s.items.bed, s.items.tv, s.items.computer, s.items.freezer], [50000 - 500 - 2500 - 2000 - 2500, 1, 1, 1, 1]);
  eq('upgrades wait for the next visit', await ids(), ['leave']);
  eq('mansion, first tier owned', await furn({}), ['books', 'minibar', 'satellite', 'treadmill']);
  await shot('furniture-upgrades');
  eq('penthouse never shows upgrades', await furn({ dwelling: 3 }), []);
  await visit('furniture', { dwelling: 5, cash: 13499 });
  await sounds();
  await t.clickUI('treadmill');
  await t.clickUI('satellite');
  await t.clickUI('books');
  await t.clickUI('minibar');
  s = await S();
  eq('upgrades bought (minibar short $1)', [s.cash, s.items.treadmill, s.items.satellite, s.items.books, s.items.minibar], [13499 - 3500 - 3000 - 2000, 1, 1, 1, 0]);
  eq('furniture sounds', await sounds(), ['purchase', 'purchase', 'purchase', 'error']);
  await t.set({ cash: 5000 });
  await t.clickUI('minibar');
  eq('minibar $5000', [(await S()).cash, (await S()).items.minibar], [0, 1]);
  const prices = { bed: 500, tv: 2500, computer: 2000, freezer: 2500 };
  for (const k of Object.keys(prices)) {
    await fresh({ cash: prices[k] - 1, dwelling: 3 });
    await visit('furniture');
    await t.clickUI(k);
    check(k + ' needs $' + prices[k], (await S()).items[k] === 0 && (await S()).cash === prices[k] - 1);
    await t.set({ cash: prices[k] });
    await t.clickUI(k);
    check(k + ' bought for $' + prices[k], (await S()).items[k] === 1 && (await S()).cash === 0);
  }

  // ============================== McSticks ==============================
  await fresh({ cash: 200, hp: 1, hpmax: 200, time: 8, job: 1, karma: 0 });
  await visit('mcsticks');
  await shot('mcsticks');
  eq('mcsticks buttons', (await ids()).sort(), ['burger', 'cook', 'fries', 'leave', 'milkshake', 'tripleburger'].sort());
  await t.clickUI('milkshake');
  await t.clickUI('fries');
  await t.clickUI('burger');
  await t.clickUI('tripleburger');
  s = await S();
  eq('mcsticks food', [s.cash, s.hp, s.time], [200 - 8 - 12 - 25 - 50, 1 + 12 + 20 + 40 + 80, 12]);
  eq('mcsticks sounds', await sounds(), ['drink', 'eat', 'eat', 'eat']);
  await t.set({ hp: 190 });
  await t.clickUI('tripleburger');
  eq('triple burger capped', (await S()).hp, 200);
  await t.clickUI('milkshake');
  eq('full hp refuses', [(await S()).hp, (await S()).cash], [200, 55]);
  await t.set({ hp: 10, cash: 7 });
  await t.clickUI('milkshake');
  await t.set({ cash: 11 });
  await t.clickUI('fries');
  await t.set({ cash: 24 });
  await t.clickUI('burger');
  await t.set({ cash: 49 });
  await t.clickUI('tripleburger');
  eq('mcsticks needs cash', (await S()).hp, 10);
  await t.set({ cash: 100, time: 24 });
  await t.clickUI('fries');
  eq('no food at 24:00', [(await S()).hp, (await S()).cash], [10, 100]);
  await sounds();
  // work: 6 hours, $36, +1 karma, only before 19:00
  await t.set({ time: 18, cash: 0, karma: 100 });
  await t.clickUI('cook');
  s = await S();
  eq('cook shift', [s.time, s.cash, s.karma], [24, 36, 101]);
  await t.set({ time: 19 });
  await t.clickUI('cook');
  s = await S();
  eq('no shift from 19:00', [s.time, s.cash, s.karma], [19, 36, 101]);
  eq('work sounds', await sounds(), ['work', 'error']);
  await visit('mcsticks', { job: 2, hp: 15, hpmax: 25, time: 12, cash: 100, karma: 0 });
  check('no cook button once promoted', !(await has('cook')));
  await shot('mcsticks-janitor');

  // ============================== street people ==============================
  // dealer
  await fresh({ cash: 400, mapx: 150, mapy: -380 });
  await visit('dealer');
  await shot('npc-dealer');
  await t.clickUI('cocaine');
  s = await S();
  eq('1g cocaine', [s.cash, s.items.cocaine, s.time], [0, 1, 8]);
  await t.set({ cash: 399 });
  await t.clickUI('cocaine');
  await t.set({ cash: 1000, items: { cocaine: 99 } });
  await t.clickUI('cocaine');
  s = await S();
  eq('dealer limits', [s.cash, s.items.cocaine], [1000, 99]);
  eq('dealer sounds', await sounds(), ['purchase', 'error', 'error']);
  await t.clickUI('leave');
  eq('dealer leave -> city', await scene(), 'city');

  // Homeless Harold
  await fresh({ cash: 100, charm: 5, karma: 0, time: 8, booze: 0, mapx: 490, mapy: 140 });
  await visit('hobo');
  check('no GIVE BOOZE without beer', !(await has('givebooze')));
  await t.clickUI('give10');
  s = await S();
  eq('first $10', [s.cash, s.time, s.karma, s.charm, s.hoboMoney], [90, 9, 2, 11, 1]);
  check('charm message', /CHARM INCREASED BY 6/.test(await text()));
  await t.clickUI('give10');
  s = await S();
  eq('second $10: no charm', [s.cash, s.time, s.karma, s.charm], [80, 10, 4, 11]);
  await t.set({ karma: 99 });
  await t.clickUI('give10');
  eq('karma capped at 100', (await S()).karma, 100);
  await t.set({ cash: 9 });
  await t.clickUI('give10');
  await t.set({ cash: 50, time: 24 });
  await t.clickUI('give10');
  s = await S();
  eq('give $10 refused', [s.cash, s.time], [50, 24]);
  eq('hobo sounds', await sounds(), ['purchase', 'purchase', 'purchase', 'error', 'error']);
  await visit('hobo', { booze: 2, time: 10, karma: 0 });
  check('GIVE BOOZE with beer', await has('givebooze'));
  await shot('npc-hobo');
  await t.clickUI('givebooze');
  s = await S();
  eq('first booze', [s.booze, s.time, s.charm, s.karma, s.hoboBooze], [1, 11, 19, 0, 1]);
  check('booze message', /CHARM INCREASED BY 8/.test(await text()));
  await shot('npc-hobo-booze');
  await t.clickUI('givebooze');
  s = await S();
  eq('second booze', [s.booze, s.time, s.charm], [0, 12, 19]);
  check('button stays until you leave', await has('givebooze'));
  await t.clickUI('givebooze');
  eq('no beer left', (await S()).time, 12);
  await t.set({ booze: 3, time: 24 });
  await t.clickUI('givebooze');
  eq('no booze at 24:00', (await S()).booze, 3);
  eq('booze sounds', await sounds(), ['error', 'error']);

  // the smokes kid
  await fresh({ time: 8, karma: 0, items: { smokes: 0 }, mapx: 456, mapy: 630 });
  await visit('smokes');
  await shot('npc-smokes');
  await t.clickUI('givesmokes');
  eq('no smokes', [(await S()).packNumber, await sounds()], [0, ['error']]);
  await t.set({ items: { smokes: 20 } });
  await t.clickUI('givesmokes');
  s = await S();
  eq('first pack: skateboard', [s.items.smokes, s.packNumber, s.karma, s.time, s.items.skateboard, s.smokesKid], [19, 1, -2, 9, 1, 1]);
  check('skateboard message', /SKATEBOARD RECEIVED/.test(await text()));
  await shot('npc-smokes-skateboard');
  for (let i = 2; i <= 9; i++) await t.clickUI('givesmokes');
  s = await S();
  eq('nine packs', [s.packNumber, s.karma, s.time, s.msgs.length], [9, -18, 17, 1]);
  check('kid still there', await has('givesmokes'));
  await t.clickUI('givesmokes');
  s = await S();
  eq('tenth pack kills him', [s.packNumber, s.karma, s.time, s.msgs.length], [10, -50, 18, 2]);
  check('police message', /Detective/.test(s.msgs[1]));
  check('GIVE SMOKES gone', !(await has('givesmokes')));
  await shot('npc-smokes-dead');
  await visit('smokes', { karma: -99 });
  await t.clickUI('leave');
  await t.set({ items: { smokes: 1 }, time: 8 });
  // the kid is gone from the map: clicking where he stands does nothing
  const kidClick = await page.evaluate(() => {
    const s = SRPG.game.s, p = SRPG.MAP.toStage(s, SRPG.MAP.npcs.smokes.x, SRPG.MAP.npcs.smokes.y);
    SRPG.city.onClick(p.x, p.y);
    return SRPG.engine.sceneName;
  });
  eq('kid gone from the street', kidClick, 'city');
  // later visits: the coughing greeting, and karma past -100 unclamped by the -30
  await fresh({ karma: -90, smokesKid: 1, packNumber: 9, items: { smokes: 1 }, mapx: 456, mapy: 630 });
  await visit('smokes');
  check('returning greeting', /wheeze/.test(await text()));
  await t.clickUI('givesmokes');
  eq('karma -92 then -30 (no clamp)', (await S()).karma, -122);
  await fresh({ smokesKid: 1, packNumber: 0, items: { smokes: 1 }, time: 24 });
  await visit('smokes');
  await t.clickUI('givesmokes');
  eq('no smokes at 24:00', (await S()).items.smokes, 1);

  // the parked car
  await fresh({ intelligence: 349, time: 8, mapx: 1054, mapy: 748 });
  await visit('parkedcar');
  await shot('npc-car');
  await t.clickUI('hotwire');
  s = await S();
  eq('hotwire fails under 350', [s.items.car, s.time], [0, 9]);
  check('fail text', /wires/.test(await text()));
  await shot('npc-car-fail');
  await t.set({ intelligence: 350 });
  await t.clickUI('hotwire');
  s = await S();
  eq('hotwired', [s.items.car, s.time], [1, 10]);
  check('hotwire button gone', !(await has('hotwire')));
  await shot('npc-car-done');
  await t.clickUI('leave');
  const carClick = await page.evaluate(() => {
    const s = SRPG.game.s, pc = SRPG.MAP.parkedCar, p = SRPG.MAP.toStage(s, pc.x + 10, pc.y + 10);
    SRPG.city.onClick(p.x, p.y);
    return SRPG.engine.sceneName;
  });
  eq('parked car gone from the lawn', carClick, 'city');

  // street dialogs close without moving you
  for (const id of ['dealer', 'hobo', 'smokes', 'parkedcar']) {
    await fresh({ mapx: 300, mapy: 300 });
    await visit(id);
    await t.clickUI('leave');
    s = await S();
    eq(id + ' leave: no nudge', [s.mapx, s.mapy, await scene()], [300, 300, 'city']);
  }

  // ============================== layout vs the references ==============================
  // Tile positions measured on the original's screenshots (stage px, top-left of the tile).
  await fresh({ cash: 1000 });
  await visit('pawn');
  near('pawn: HAND GUN tile', await tile('gun'), [192.1, 142.3], 0.6);
  near('pawn: KNIFE tile', await tile('knife'), [192.1, 194.8], 0.6);
  near('pawn: ALARM tile', await tile('alarm'), [192.3, 245.9], 0.6);
  near('pawn: CELL PHONE tile', await tile('cellphone'), [378.8, 142.7], 0.6);
  await visit('store');
  near('store: SLUSHEE tile', await tile('slushee'), [187.1, 148], 0.6);
  near('store: LEAVE tile', await tile('leave'), [372.1, 246.1], 0.6);
  await visit('mcsticks');
  near('mcsticks: FRIES tile', await tile('fries'), [187.2, 152], 0.6);
  for (const id of ['dealer', 'hobo', 'smokes', 'parkedcar']) {
    await visit(id);
    near(id + ': LEAVE tile', await tile('leave'), [357, 229], 0.6);
  }

  // ============================== text policy ==============================
  // No run of 6+ words of dialogue copied from the original (only checked where the decompiled
  // text is available).
  const SCR = '/tmp/claude-0/-home-user-modern-agents/e8aaa668-44cd-5f53-8561-931f113fdf41/scratchpad';
  if (fs.existsSync(SCR + '/srpg_as.txt') && fs.existsSync(SCR + '/texts.txt')) {
    const words = (t) => (t.toLowerCase().replace(/\u2019/g, "'").match(/[a-z0-9]+(?:'[a-z]+)?/g) || []);
    const orig = fs.readFileSync(SCR + '/srpg_as.txt', 'utf8').replace(/\\n/g, ' ') + '\n' +
      fs.readFileSync(SCR + '/texts.txt', 'utf8').replace(/\\n(.)\\n/g, ' $1').replace(/\\n/g, ' ');
    const grams = new Set();
    orig.split('\n').forEach((line) => { const w = words(line); for (let i = 0; i + 6 <= w.length; i++) grams.add(w.slice(i, i + 6).join(' ')); });
    const copied = [];
    for (const f of ['js/locations/shops.js', 'js/locations/npcs.js']) {
      const src = fs.readFileSync(path.join(h.ROOT, f), 'utf8').replace(/(['"])\s*\+\s*\n\s*\1/g, '');
      const lits = src.match(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g) || [];
      lits.forEach((l) => {
        const w = words(l.slice(1, -1).replace(/\\n/g, ' ').replace(/\\'/g, "'").replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' '));
        for (let i = 0; i + 6 <= w.length; i++) if (grams.has(w.slice(i, i + 6).join(' '))) copied.push(f + ': ' + w.slice(i, i + 6).join(' '));
      });
    }
    eq('no 6-word runs copied from the original', copied, []);
  }

  // ============================== leaving buildings ==============================
  for (const id of ['store', 'pawn', 'furniture', 'mcsticks']) {
    await fresh({ mapx: 300, mapy: 300 });
    await visit(id);
    await t.clickUI('leave');
    s = await S();
    const nudge = await page.evaluate((id) => SRPG.MAP.exitNudge[id], id);
    eq(id + ' leave nudge', [s.mapx - 300, s.mapy - 300, await scene()], [nudge.mapx || 0, nudge.mapy || 0, 'city']);
  }

  const errs = t.errors.filter((e) => !/requestfailed|ERR_FILE_NOT_FOUND|Failed to load resource/.test(e));
  eq('page errors', errs, []);
  console.log(passes + ' passed, ' + failures + ' failed');
  await t.close();
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
