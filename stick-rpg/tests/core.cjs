// Engine core checks against the original's scripts (srpg_as.txt): a new game's values (root frame
// 1), save / load, the walk clip (sprite 720: keys, speeds, facings, walls, doors, falls, its two
// frames), traffic (spawn, lanes, speed, colours, collision, hit / crash), the knock-down (root
// frame 3), street-people click areas, city entry (root frame 2), the night's sleep, rank, karma
// and its colours, the black fades, music, exit nudges, input, sound (effects and loops rendered
// offline and measured against the original's samples), and the text policy.
//   node tests/core.cjs
const fs = require('fs');
const path = require('path');
const h = require('./harness.cjs');

const SCR = '/tmp/claude-0/-home-user-modern-agents/e8aaa668-44cd-5f53-8561-931f113fdf41/scratchpad';
const OUT = process.env.OUT || SCR + '/shots/core';
fs.mkdirSync(OUT, { recursive: true });

let failures = 0;
let checks = 0;
function ok(cond, msg, extra) {
  checks++;
  if (cond) console.log('  ok   ' + msg);
  else { failures++; console.log('  FAIL ' + msg + (extra !== undefined ? ' ' + JSON.stringify(extra) : '')); }
}
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }

(async () => {
  const t = await h.open();
  const { page } = t;
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const scene = () => ev(() => SRPG.engine.sceneName + (SRPG.location.current ? ':' + SRPG.location.current : ''));
  // record sounds and music
  await ev(() => {
    window.__sfx = [];
    window.__mus = [];
    const play = SRPG.sound.play, music = SRPG.sound.music;
    SRPG.sound.play = function (n) { window.__sfx.push(n); return play.apply(this, arguments); };
    SRPG.sound.music = function (n, f) { window.__mus.push([n, !!f]); return music.apply(this, arguments); };
  });
  const sfx = () => ev(() => window.__sfx.splice(0));
  const mus = () => ev(() => window.__mus.splice(0));
  // a fresh game standing at (mapx, mapy) with the road cleared
  const fresh = async (patch) => {
    await t.newGame(Object.assign({ pname: 'Core', strength: 10, intelligence: 10, charm: 10 }, patch || {}));
    await ev(() => { SRPG.city.clearTraffic(); SRPG.city.st.walkFrame = 1; });
    await sfx(); await mus();
  };

  // ---------------------------------------------------------------------------------------------
  console.log('New game (root frame 1)');
  const ng = await ev(() => {
    SRPG.rng.seed(77);
    const r = SRPG.rng.random;
    const want = { bankrate: r(50) / 10 + 1, prices: [1, 2, 3, 4, 5, 6].map(() => r(10) + 1) };
    SRPG.rng.seed(77);
    const s = SRPG.newState({ pname: 'N', strength: 7, intelligence: 3, charm: 4 });
    SRPG.rng.unseed();
    return { want, s };
  });
  const s0 = ng.s;
  eq(s0.bankrate, ng.want.bankrate, 'bank rate random(50)/10 + 1, drawn before the stock prices');
  eq(SRPG_STOCKS(s0).map((k) => s0.stocks[k].price), ng.want.prices, 'six stock prices random(10) + 1 in order');
  ok(SRPG_STOCKS(s0).every((k) => s0.stocks[k].prev === s0.stocks[k].price && s0.stocks[k].units === 0 && s0.stocks[k].bought === 0), 'prev = price, no units, nothing bought');
  eq([s0.cash, s0.bankcash, s0.bankloan, s0.bankloandays], [100, 0, 0, -1], 'cash 100, no savings, no loan (days -1)');
  eq([s0.hpmax, s0.hp, s0.karma, s0.job, s0.barfight, s0.dwelling], [22, 22, 0, 1, 1, 1], 'hpmax = strength + 15, karma 0, McSlave, barfight 1, apartment');
  eq([s0.time, s0.day, s0.gamelength, s0.music, s0.optimize, s0.fps, s0.driving], [8, 1, 0, 1, 1, 0, 0], '8 AM, day 1 (root frame 2 turns day 0 into 1), unlimited, music and optimize on');
  eq([s0.mapx, s0.mapy], [456, 630], 'start position mapx 456, mapy 630');
  ok(Object.keys(s0.items).every((k) => s0.items[k] === 0) && s0.booze === 0 && s0.packNumber === 0, 'no items, no booze, no packs given');
  eq([s0.msgs.length, s0.electionMessage, s0.dealMessages], [1, 0, [0, 0, 0, 0, 0]], 'one message (the McSticks job), no election or deal messages');
  eq([s0.hoboMoney, s0.hoboBooze, s0.smokesKid], [0, 0, 0], 'street people\'s one-off gifts not given');

  // ---------------------------------------------------------------------------------------------
  console.log('Flash string-to-number (SRPG.util.flashNumber / flashInt, the typed amounts)');
  // Number(x) and int(x) of each string, traced by the original SWF running in Ruffle.
  const NUM = [
    ['12e', '12', '12'], ['12e+', '12', '12'], ['12e-', '12', '12'], ['12E', '12', '12'], ['1.5e', '1.5', '1'],
    ['5.e2', '500', '500'], ['1e+2', '100', '100'], ['1e2.5', 'NaN', '0'], ['12e5x', 'NaN', '0'],
    ['+.5', '0.5', '0'], ['-.5e1', '-5', '-5'], ['0x10', '16', '16'], ['-0x10', 'NaN', '0'],
    ['+0x10', 'NaN', '0'], ['0x-1', '-1', '-1'], [' 0x10', 'NaN', '0'], ['0x10 ', 'NaN', '0'],
    ['0010', '8', '8'], ['0019', '19', '19'], ['-010', '-8', '-8'], ['+010', '8', '8'],
    ['010.5', '10.5', '10'], ['0.1', '0.1', '0'], ['00.5', '0.5', '0'], ['1e', '1', '1'], ['e', 'NaN', '0'],
    ['.', '0', '0'], ['-', 'NaN', '0'], ['+', 'NaN', '0'], ['1.2.3', 'NaN', '0'], ['5 ', 'NaN', '0'],
    [' 5', '5', '5'], ['\t5', '5', '5'], ['\r5', '5', '5'], ['5\t', 'NaN', '0'],
    ['1e0010', '10000000000', '1410065408'], ['1e+010', '10000000000', '1410065408'], ['0e5', '0', '0'],
    ['0x7FFFFFFF', '2147483647', '2147483647'], ['0xFFFFFFFF', '-1', '-1'], ['0x100000000', '0', '0'],
    ['99999999999', '99999999999', '1215752191'], ['-99999999999', '-99999999999', '-1215752191'],
    ['3000000000', '3000000000', '-1294967296'], ['1.9999999999', '1.9999999999', '1'],
    ['Infinity', 'NaN', '0'], ['-Infinity', 'NaN', '0'], ['NaN', 'NaN', '0'], ['\u0663', 'NaN', '0'],
    ['\uff15', 'NaN', '0'], ['1e309', 'Infinity', '0'], ['4e9', '4000000000', '-294967296'],
    ['0777777777777', '-1', '-1'], [' 010', '10', '10'], ['-0019', '-19', '-19'], ['0x+10', '16', '16'],
    ['-00', '0', '0'], ['00', '0', '0'], ['-0', '0', '0'], ['0x', 'NaN', '0'], ['0X-F', '-15', '-15'],
    ['-077777777777', '1', '1'], ['0x80000000', '-2147483648', '-2147483648'],
    ['0x7fffffff', '2147483647', '2147483647'], ['1.e', '1', '1'], ['.e1', '0', '0'], ['-.', '0', '0'],
    ['+.', '0', '0'], ['.5e', '0.5', '0'], ['1e+', '1', '1'], ['1ee', 'NaN', '0'], ['0x1e', '30', '30'],
    ['5e-', '5', '5'], [' 12e', '12', '12'], ['\n5', '5', '5'], ['\u00a05', 'NaN', '0'],
    ['\u20035', 'NaN', '0'], ['0 ', 'NaN', '0'], ['010e2', '1000', '1000'], ['-0x', 'NaN', '0'],
    ['0xg', 'NaN', '0'], ['1e-', '1', '1'], ['12e+3', '12000', '12000'], ['+-5', 'NaN', '0'],
    ['--5', 'NaN', '0'], ['-+010', 'NaN', '0'], ['0x0x1', 'NaN', '0'], ['08.5', '8.5', '8'],
    ['0o10', 'NaN', '0'], ['1d', 'NaN', '0'], ['1f', 'NaN', '0'], ['0.', '0', '0'], ['-0.', '0', '0'],
    ['07e1', '70', '70'], ['007', '7', '7'], ['-7', '-7', '-7'], ['0x-80000000', '-2147483648', '-2147483648'],
    ['0x-FFFFFFFF', '1', '1'],
  ];
  const nums = await ev((tab) => tab.filter(([v, n, i]) => String(SRPG.util.flashNumber(v)) !== n || String(SRPG.util.flashInt(v)) !== i)
    .map(([v, n, i]) => [v, n, i, String(SRPG.util.flashNumber(v)), String(SRPG.util.flashInt(v))]), NUM);
  eq(nums, [], NUM.length + ' strings convert as in Ruffle (exponent mark without digits ignored, signed octal, 32-bit hex, only space/tab/CR/LF skipped)');
  eq(await ev(() => [SRPG.util.flashNumber(12.5), SRPG.util.flashInt(-7.9), SRPG.util.flashInt(undefined)]), [12.5, -7, 0], 'numbers pass through; int() truncates toward 0; undefined is 0');

  // ---------------------------------------------------------------------------------------------
  console.log('Save / load (saveGame / loadGame)');
  const sl = await ev(() => {
    SRPG.save.remove();
    const s = SRPG.newState({ pname: 'Saver' });
    Object.assign(s, { day: 9, time: 13, cash: 1234, bankcash: 50, bankloan: 700, bankloandays: 4, bankrate: 2.5, karma: -33,
      job: 5, barfight: 4, dwelling: 3, packNumber: 3, booze: 7, hoboMoney: 1, hoboBooze: 1, smokesKid: 1, electionMessage: 2,
      dealMessages: [1, 0, 1, 0, 1], music: 0, optimize: 0, fps: 0, mapx: 12, mapy: 34, driving: 1, rot: 90 });
    s.items.car = 1; s.items.freezer = 1; s.items.skateboard = 1;
    s.stocks.SAR.units = 12; s.stocks.SAR.bought = 3; s.msgs.push('x');
    const first = SRPG.save.write(s);
    const second = SRPG.save.write(s);
    const r = SRPG.save.read();
    return { first, second, r, s };
  });
  eq([sl.first, sl.second], ['Game saved', 'Previous game overwritten'], 'save messages');
  const same = ['pname', 'day', 'time', 'cash', 'bankcash', 'bankloan', 'bankloandays', 'bankrate', 'karma', 'job', 'barfight', 'dwelling',
    'packNumber', 'booze', 'hoboMoney', 'hoboBooze', 'smokesKid', 'electionMessage', 'music', 'optimize'].filter((k) => JSON.stringify(sl.r[k]) !== JSON.stringify(sl.s[k]));
  eq(same, [], 'every saved variable comes back');
  ok(JSON.stringify(sl.r.items) === JSON.stringify(sl.s.items) && JSON.stringify(sl.r.stocks) === JSON.stringify(sl.s.stocks) &&
    JSON.stringify(sl.r.msgs) === JSON.stringify(sl.s.msgs) && JSON.stringify(sl.r.dealMessages) === JSON.stringify(sl.s.dealMessages), 'items, stocks, messages and deal messages come back');
  eq([sl.r.mapx, sl.r.mapy, sl.r.driving, sl.r.fps, sl.r.over], [456, 622, 0, 1, false], 'load: start junction 8 px up (mapy - 8), on foot, SHOW FPS on');
  // continuing into the city: the arrival sequence
  await ev(() => { const s = SRPG.save.read(); SRPG.game.start(s); SRPG.engine.go('city', { fade: 19 }); });
  const arr = await ev(() => ({ black: SRPG.engine.black, rot: SRPG.game.s.rot, cars: SRPG.city.cars.map((c) => [c.s, c.placed]) }));
  eq(arr, { black: 11, rot: 0, cars: [[3, false], [3, false]] }, 'arrival: black clip from frame 11, facing up, traffic starts over (car1s = car2s = 3)');
  eq(await mus(), [['main', true]], 'arrival starts main.mp3 even with music switched off (loadGame\'s loopB.start)');
  await t.step(1);
  ok(await ev(() => SRPG.city.cars.every((c) => c.placed && c.s < 2)), 'both cars come on the first walk frame');
  await t.step(17);
  ok(await ev(() => SRPG.engine.black === 29 && SRPG.engine.blackAlpha() > 0), 'still fading after 18 ticks');
  await t.step(1);
  eq(await ev(() => [SRPG.engine.black, SRPG.engine.blackAlpha()]), [30, 0], 'black clip frames 11-30: clear after 19 ticks');
  await t.step(5);
  eq(await ev(() => SRPG.engine.black), 30, 'and stops at frame 30');

  // ---------------------------------------------------------------------------------------------
  console.log('Walk clip frame 1: keys, facings, speeds');
  const keys = await ev(() => {
    const s = SRPG.newState();
    const rk = (inp, items, driving) => {
      s.items.skateboard = items ? items.skateboard || 0 : 0; s.items.car = items ? items.car || 0 : 0; s.driving = driving || 0; s.rot = -1;
      const m = SRPG.MAP.readKeys(s, Object.assign({ left: false, right: false, up: false, down: false, shift: false }, inp));
      return [m.xmove, m.ymove, m.walkspeed, s.rot, m.step];
    };
    return {
      left: rk({ left: true }), right: rk({ right: true }), up: rk({ up: true }), down: rk({ down: true }),
      lr: rk({ left: true, right: true }), ud: rk({ up: true, down: true }),
      lu: rk({ left: true, up: true }), ur: rk({ up: true, right: true }), rd: rk({ right: true, down: true }), dl: rk({ down: true, left: true }),
      all: rk({ left: true, right: true, up: true, down: true }), lru: rk({ left: true, right: true, up: true }),
      rdl: rk({ right: true, down: true, left: true }), udr: rk({ up: true, down: true, right: true }),
      none: rk({}), skate: rk({ up: true, shift: true }, { skateboard: 1 }), noboard: rk({ up: true, shift: true }),
      car: rk({ up: true }, { car: 1 }, 1), sports: rk({ up: true }, { car: 2 }, 1), parked: rk({ up: true }, { car: 1 }, 0),
    };
  });
  eq(keys.left, [4, 0, 1, 270, 4], 'left: xmove 4, facing 270');
  eq(keys.right, [-4, 0, 1, 90, 4], 'right: xmove -4, facing 90');
  eq(keys.up, [0, 4, 1, 0, 4], 'up: ymove 4, facing 0');
  eq(keys.down, [0, -4, 1, 180, 4], 'down: ymove -4, facing 180');
  // (confirmed in Ruffle with the original SWF: holding both arrows of a pair walks left / up)
  eq(keys.lr, [4, 0, 1, 270, 4], 'left + right: left wins (if / else: the left branch jumps past the right test)');
  eq(keys.ud, [0, 4, 1, 0, 4], 'up + down: up wins');
  eq(keys.lu, [3, 3, 1, 315, 4], 'left + up: 315, both cut to 3 (footstep counter still +4)');
  eq(keys.ur, [-3, 3, 1, 45, 4], 'up + right: 45');
  eq(keys.rd, [-3, -3, 1, 180, 4], 'right + down: the original\'s empty test, still facing down');
  eq(keys.dl, [3, -3, 1, 225, 4], 'down + left: 225');
  eq(keys.all, [3, 3, 1, 225, 4], 'all four keys: left and up win (moving up-left), the facing tests end at 225');
  eq(keys.lru, [3, 3, 1, 45, 4], 'left + right + up: moves up-left but faces 45 (the facings test the keys, last match wins)');
  eq(keys.rdl, [3, -3, 1, 225, 4], 'right + down + left: moves down-left, facing 225');
  eq(keys.udr, [-3, 3, 1, 45, 4], 'up + down + right: moves up-right, facing 45');
  eq(keys.none, [0, 0, 1, -1, 0], 'no keys: no move, facing kept');
  eq(keys.skate[2], 2, 'Shift with the skateboard: walkspeed 2');
  eq(keys.noboard[2], 1, 'Shift without it: 1');
  eq([keys.car[2], keys.sports[2], keys.parked[2]], [3, 5, 1], 'driving the junker 3, the sports car 5, parked car not in use 1');

  // speeds in the city: 4 px per tick per walkspeed (both walk frames step)
  const speed = async (patch, keysDown) => {
    await fresh(Object.assign({ mapx: 300, mapy: 630 }, patch));
    const x0 = (await t.state()).mapx;
    await t.hold(keysDown, 4);
    return (await t.state()).mapx - x0;
  };
  eq(await speed({}, ['ArrowLeft']), 16, 'walking: 4 px a tick (frames 1 and 2 both step)');
  eq(await speed({ items: { skateboard: 1 } }, ['ArrowLeft', 'Shift']), 32, 'skating: 8 px a tick');
  eq(await speed({ items: { car: 1 }, driving: 1 }, ['ArrowLeft']), 48, 'the junker: 12 px a tick');
  eq(await speed({ items: { car: 2 }, driving: 1 }, ['ArrowLeft']), 80, 'the sports car: 20 px a tick');
  eq(await speed({}, ['a']), 16, 'A walks left too');
  eq(await speed({}, ['d']), -16, 'D walks right');
  eq(await speed({}, ['ArrowLeft', 'ArrowRight']), 16, 'left and right held together: walks left');
  eq(await speed({}, ['d', 'ArrowLeft']), 16, 'D with the left arrow: still left (each test is arrow || letter)');
  await fresh({ mapx: 300, mapy: 630 });
  await t.hold(['ArrowUp', 'ArrowDown'], 4);
  eq((await t.state()).mapy, 646, 'up and down held together: walks up');

  // footsteps: +4 on each frame 1, a sound at 12
  await fresh({ mapx: 300, mapy: 630 });
  await ev(() => { SRPG.city.st.stepcount = 0; });
  await t.hold(['ArrowLeft'], 12);
  eq((await sfx()).filter((n) => n === 'footstep').length, 2, 'a footstep every 6 ticks (3 walk frames 1)');
  await fresh({ mapx: 300, mapy: 630, items: { skateboard: 1 } });
  await ev(() => { SRPG.city.st.stepcount = 0; });
  await t.hold(['ArrowLeft', 'Shift'], 12);
  eq((await sfx()).filter((n) => n === 'skate').length, 2, 'skating: the skate sound, same count');
  await fresh({ mapx: 300, mapy: 630, items: { car: 1 }, driving: 1 });
  await t.hold(['ArrowLeft'], 12);
  eq((await sfx()).filter((n) => n === 'footstep' || n === 'skate').length, 0, 'driving: no steps');

  // ---------------------------------------------------------------------------------------------
  console.log('Walls, doors and edges (the walk loop)');
  const loop = (st, move, doors) => ev(([st, move, doors]) => {
    const s = SRPG.newState();
    Object.assign(s, st);
    const m = Object.assign({ xmove: 0, ymove: 0, walkspeed: 1 }, move);
    const r = SRPG.MAP.walkLoop(s, m, doors);
    return { mapx: s.mapx, mapy: s.mapy, door: r.event && r.event.door || null, fall: !!(r.event && r.event.fall), falls: r.falls, m: [m.xmove, m.ymove] };
  }, [st, move, doors !== false]);
  const R = { xmove: -4 }, L = { xmove: 4 }, D = { ymove: -4 }, U = { ymove: 4 };
  // walls
  eq((await loop({ mapx: 120, mapy: 400 }, R)).mapx, 116, 'right: free while mapx > 119');
  eq((await loop({ mapx: 119, mapy: 400 }, R)).mapx, 119, 'right: wall at mapx 119 outside the east road');
  eq((await loop({ mapx: 119, mapy: 327 }, R)).mapx, 115, 'right: the east road (mapy -4..328) goes on');
  eq((await loop({ mapx: 119, mapy: 328 }, R)).mapx, 119, 'right: mapy 328 is outside it');
  eq((await loop({ mapx: 446, mapy: 200 }, L)).mapx, 450, 'left: free while mapx < 447');
  eq((await loop({ mapx: 447, mapy: 200 }, L)).mapx, 447, 'left: wall at 447 outside the west road');
  eq((await loop({ mapx: 447, mapy: 425 }, L)).mapx, 451, 'left: the west road (mapy 424..758) goes on');
  eq((await loop({ mapx: 447, mapy: 758 }, L)).mapx, 447, 'left: mapy 758 is outside it');
  eq((await loop({ mapx: 450, mapy: -600 }, D)).mapy, -604, 'down: the main road (mapx 116..451) goes on');
  eq((await loop({ mapx: 118, mapy: -1 }, D)).mapy, -5, 'down: mapx 117-118 counts as the main road');
  eq((await loop({ mapx: 100, mapy: -1 }, D)).mapy, -1, 'down: the east part stops at mapy -1');
  eq((await loop({ mapx: 100, mapy: 0 }, D)).mapy, -4, 'down: ...and is open above it');
  eq((await loop({ mapx: 451, mapy: 427 }, D)).mapy, 427, 'down: the west part stops at mapy 427');
  eq((await loop({ mapx: 449, mapy: 700 }, U)).mapy, 704, 'up: the main road (mapx 116..450) goes on');
  eq((await loop({ mapx: 100, mapy: 325 }, U)).mapy, 325, 'up: the east part stops at mapy 325');
  eq((await loop({ mapx: 450, mapy: 754 }, U)).mapy, 754, 'up: the west part stops at mapy 754');
  // frame 2's copy: the last test sits outside the else
  eq((await loop({ mapx: 449, mapy: 700 }, U, false)).mapy, 708, 'frame 2: at mapx 449 a step up moves twice');
  eq((await loop({ mapx: 448, mapy: 600 }, D, false)).mapy, 592, 'frame 2: at mapx 448 a step down moves twice');
  eq((await loop({ mapx: 449, mapy: 700 }, U, true)).mapy, 704, 'frame 1: once');
  eq(await Promise.all([447, 448, 449, 450, 451].map(async (x) => (await loop({ mapx: x, mapy: 600 }, D, false)).mapy)), [596, 592, 592, 592, 596],
    'frame 2 down: two steps at mapx 448-450 (447 < mapx < 451, south of 427), one at 447 and 451');
  eq(await Promise.all([448, 449, 450].map(async (x) => (await loop({ mapx: x, mapy: 700 }, U, false)).mapy)), [704, 708, 704],
    'frame 2 up: two steps only at mapx 449 (448 < mapx < 450, north of 754)');
  eq((await loop({ mapx: 450, mapy: 400 }, D, false)).mapy, 396, 'frame 2 down at 450 but north of mapy 427: once');
  // doors, both edges of each window (exclusive) and no doors in frame 2 or in the car
  const doors = [
    ['store', R, 'mapy', -226, -167, { mapx: 119 }], ['nli', R, 'mapy', 485, 541, { mapx: 119 }],
    ['bank', R, 'mapy', 758, 781, { mapx: 119 }], ['pawn', R, 'mapy', -524, -501, { mapx: 119 }],
    ['bar', L, 'mapy', 65, 97, { mapx: 447 }], ['casino', L, 'mapy', -511, -467, { mapx: 447 }],
    ['mcsticks', L, 'mapy', 302, 346, { mapx: 447 }], ['mansion', L, 'mapy', 888, 920, { mapx: 447, dwelling: 4 }],
    ['bus', D, 'mapx', -538, -497, { mapy: -1 }], ['furniture', D, 'mapx', 889, 930, { mapy: 427 }],
    ['uofs', U, 'mapx', -426, -405, { mapy: 325 }], ['home', U, 'mapx', 1043, 1069, { mapy: 754 }],
  ];
  for (const [id, mv, axis, lo, hi, base] of doors) {
    const at = (v, extra, f) => loop(Object.assign({}, base, { [axis]: v }, extra || {}), mv, f);
    const a = await at(lo + 1), b = await at(hi - 1), c = await at(lo), d = await at(hi);
    const e = await at(lo + 1, { driving: 1 }), f2 = await at(lo + 1, {}, false);
    ok(a.door === id && b.door === id && c.door === null && d.door === null && e.door === null && f2.door === null,
      id + ': door for ' + axis + ' ' + (lo + 1) + '..' + (hi - 1) + ', not at ' + lo + ' / ' + hi + ', not driving, not on frame 2', [a.door, b.door, c.door, d.door, e.door, f2.door]);
  }
  eq((await loop({ mapx: 447, mapy: 900, dwelling: 3 }, L)).door, null, 'mansion door only with the mansion or castle');
  eq((await loop({ mapx: 447, mapy: 900, dwelling: 5 }, L)).door, 'mansion', '...the castle uses it too');
  eq((await loop({ mapx: 1050, mapy: 754, dwelling: 4 }, U)).door, 'oldapartment', 'home door leads to the old apartment once you have moved out');
  const dd = await loop({ mapx: 447, mapy: 320 }, { xmove: 3, ymove: 3 });
  // A door or a fall sends the root timeline away and the walk clip's script stops there (Ruffle):
  // no step on the other axis, no further sub-step (diagonal replays of the original match this).
  eq([dd.door, dd.mapx, dd.mapy, dd.m], ['mcsticks', 447, 320, [0, 3]], 'a door zeroes xmove and ends the walk: no y step after it');
  const sk = await loop({ mapx: 447, mapy: 320 }, { xmove: 4, walkspeed: 2 });
  eq([sk.door, sk.mapx], ['mcsticks', 447], 'skating into a door: no further sub-step');
  const dn = await loop({ mapx: 117, mapy: 540 }, { xmove: -3, ymove: 3 });
  eq([dn.door, dn.mapx, dn.mapy], ['nli', 117, 540], 'up-right into the NLI door at mapy 540: in at 540 (Ruffle), not 543');
  const fx = await loop({ mapx: 1228, mapy: 600 }, { xmove: 3, ymove: 3 });
  eq([fx.fall, fx.falls, fx.mapx, fx.mapy, fx.m], [true, 1, 1211, 600, [0, 3]], 'up-left off the west edge: pushed back 20, no y step after the fall');
  const fd = await loop({ mapx: -658, mapy: 207 }, { xmove: -3, ymove: -3 }, false);
  eq([fd.fall, fd.mapx, fd.mapy], [true, -641, 207], 'frame 2 falls the same way (down-right off the east edge, no y step)');
  const fs5 = await loop({ mapx: 1225, mapy: 600, driving: 1 }, { xmove: 4, walkspeed: 5 });
  eq([fs5.falls, fs5.mapx], [1, 1213], 'the sports car (5 sub-steps) stops at the fall: no more steps back towards the edge');
  // edges
  const edges = [['east edge (right)', { mapx: -657, mapy: 100 }, R, 'mapx', -641], ['west edge (left)', { mapx: 1227, mapy: 600 }, L, 'mapx', 1211],
    ['south edge (down)', { mapx: 200, mapy: -687 }, D, 'mapy', -671], ['north edge (up)', { mapx: 200, mapy: 1011 }, U, 'mapy', 995]];
  for (const [name, st, mv, axis, want] of edges) {
    const r = await loop(st, mv);
    ok(r.fall && r.falls === 1 && r[axis] === want, name + ': past the limit, pushed back 20 and a fall', r);
    const r2 = await loop(st, mv, false);
    ok(r2.fall && r2[axis] === want, name + ': frame 2 falls the same', r2);
  }
  eq((await loop({ mapx: -656, mapy: 100 }, R)).fall, false, 'east limit: mapx -660 itself is still ground');

  // in the city: doors on walk frame 1 only
  await fresh({ mapx: 447, mapy: 320 });
  await ev(() => { SRPG.city.st.walkFrame = 2; SRPG.city.st.move = { xmove: 4, ymove: 0, walkspeed: 1 }; });
  await t.hold(['ArrowLeft'], 1);
  eq(await scene(), 'city', 'walk frame 2 has no doors');
  await t.hold(['ArrowLeft'], 1);
  eq(await scene(), 'location:mcsticks', 'walk frame 1 goes in');
  eq(await ev(() => [SRPG.engine.black, SRPG.engine.blackAlpha()]), [1, 1], 'a building fades in from black (black clip frame 1)');
  eq(await mus(), [['inside', false]], 'inside.mp3 instead of main.mp3');
  eq((await sfx()).filter((n) => n === 'door').length, 0, 'no door sound (the original has none)');
  await t.step(8);
  ok(await ev(() => SRPG.engine.black === 9 && SRPG.engine.blackAlpha() > 0), 'still fading after 8 ticks');
  await t.step(1);
  eq(await ev(() => [SRPG.engine.black, SRPG.engine.blackAlpha()]), [10, 0], 'clear after 9 ticks (frame 10 stops)');
  await ev(() => SRPG.location.leave());
  eq(await ev(() => [SRPG.engine.sceneName, SRPG.engine.black, SRPG.game.s.mapx]), ['city', 10, 439], 'LEAVE: back on the map, no fade, mapx - 8');
  eq(await mus(), [['main', false]], 'main.mp3 again');

  // ---------------------------------------------------------------------------------------------
  console.log('Exit nudges (each LEAVE button)');
  const nudges = { store: [8, 0], nli: [8, 0], bank: [8, 0], pawn: [8, 0], bar: [-8, 0], casino: [-8, 0], mcsticks: [-8, 0],
    mansion: [0, -8], bus: [8, 0], furniture: [0, 8], uofs: [0, -8], home: [0, -8], oldapartment: [0, -8] };
  for (const id of Object.keys(nudges)) {
    await fresh({ mapx: 300, mapy: 300, dwelling: id === 'mansion' || id === 'oldapartment' ? 4 : 1 });
    const d = await ev((id) => {
      if (!SRPG.locations[id]) return null;
      SRPG.location.open(id);
      const s = SRPG.game.s;
      const x = s.mapx, y = s.mapy;
      SRPG.location.leave();
      return [s.mapx - x, s.mapy - y, SRPG.engine.sceneName];
    }, id);
    eq(d, nudges[id].concat('city'), id + ' LEAVE nudge');
  }
  await fresh({ mapx: 300, mapy: 300 });
  await ev(() => {
    SRPG.registerLocation({ id: 'coretest', view: () => ({ quote: 'test', buttons: [{ icon: 'ok', label: 'A', col: 0, row: 0, id: 'core-a', onClick() {} }] }) });
    SRPG.location.open('coretest');
  });
  await t.clickUI('core-a');
  await t.clickUI('leave');
  await ev(() => SRPG.city.openPanel('stats'));
  await ev(() => SRPG.city.closePanel());
  eq((await sfx()).filter((n) => n === 'click'), [], 'no click sound on menu buttons, LEAVE or the HUD buttons (the original never starts _click.wav)');
  await fresh({ mapx: 300, mapy: 300 });
  const ov = await ev(() => { SRPG.engine.black = 0; SRPG.location.open('hobo'); const b = SRPG.engine.black; SRPG.location.leave(); return [b, SRPG.game.s.mapx, SRPG.game.s.mapy]; });
  eq(ov, [0, 300, 300], 'street dialogs: no fade, no nudge');
  eq(await mus(), [['main', false], ['main', false]], 'street dialogs keep main.mp3 playing');

  // ---------------------------------------------------------------------------------------------
  console.log('Traffic');
  await t.newGame({ pname: 'Cars' });
  const sp = await ev(() => {
    SRPG.rng.seed(4242);
    const r = SRPG.rng.random;
    const want = [0, 1].map(() => { const chk = r(2), tran = r(100), t1 = r(2), dir = r(2); return { chk, tran, t1, dir }; });
    SRPG.rng.seed(4242);
    SRPG.engine.step(1);
    SRPG.rng.unseed();
    return { want, cars: SRPG.city.cars.map((c) => ({ s: c.s, x: c.x, y: c.y, rot: c.rot, tint: c.tint, clip: c.clip })) };
  });
  const expCar = (w) => w.dir === 0 ? { s: 1, x: 15, y: 825, rot: 0 } : { s: 0, x: -75, y: -800, rot: 180 };
  ok(sp.cars.every((c, i) => { const e = expCar(sp.want[i]); return c.s === e.s && c.x === e.x && c.y === e.y && c.rot === e.rot && c.clip === 1; }),
    'car1s = car2s = 3: both come on the first frame; random(2) == 0 -> up lane (x 15 from y 825), else down lane (x -75 from y -800)', sp);
  ok(sp.cars.every((c, i) => { const w = sp.want[i]; return c.tint.b === 150 && c.tint.r === 100 - w.t1 * w.tran && c.tint.g === 100 - (1 - w.t1) * w.tran; }),
    'colour transform: blue 150, red 100 - t1*tran, green 100 - (1-t1)*tran', sp.cars.map((c) => c.tint));
  const y0 = sp.cars.map((c) => c.y);
  await t.step(3);
  const y3 = await ev(() => SRPG.city.cars.map((c) => c.y));
  ok(y3.every((y, i) => Math.abs(y - y0[i]) === 18), '6 px a tick', [y0, y3]);
  // leaving the road
  await ev(() => { const c = SRPG.city.cars[0]; c.s = 1; c.y = -880; });
  await t.step(1);
  eq(await ev(() => [SRPG.city.cars[0].s, SRPG.city.cars[0].clip]), [2, 2], 'past y -885: carNs = 2, the clip rolls off the edge');
  await t.step(30);
  eq(await ev(() => [SRPG.city.cars[0].s, SRPG.city.cars[0].clip]), [2, 32], 'still rolling 30 ticks later');
  await t.step(1);
  eq(await ev(() => [SRPG.city.cars[0].s, SRPG.city.cars[0].clip]), [500, 33], 'clip frame 33: carNs = 500');
  // count-down on walk frame 1 only
  const cd2 = await ev(() => {
    const a = SRPG.city.cars[0], b = SRPG.city.cars[1];
    for (let seed = 1; seed < 500; seed++) {
      SRPG.rng.seed(seed);
      const r = SRPG.rng.random;
      if (r(499) > 2 && r(4999) > 2 && r(498) > 2 && r(4998) > 2 && r(497) > 2 && r(4997) > 2) {
        a.s = 500; a.clip = 33; b.s = 5000; b.clip = 33;
        SRPG.city.st.walkFrame = 1;
        SRPG.rng.seed(seed);
        const seen = [];
        for (let i = 0; i < 6; i++) { SRPG.engine.step(1); seen.push(a.s); }
        SRPG.rng.unseed();
        return seen;
      }
    }
    return null;
  });
  eq(cd2, [499, 499, 498, 498, 497, 497], 'count-down: one per walk frame 1 (every other tick)');
  const sp3 = await ev(() => {
    const out = [];
    for (let k = 0; k < 20; k++) {
      const c = SRPG.city.cars[0];
      c.s = 3; c.clip = 33;
      SRPG.city.st.walkFrame = 1;
      SRPG.engine.step(1);
      out.push(c.s < 2);
    }
    return out.every(Boolean);
  });
  ok(sp3, 'carNs 3 -> 2 -> random(2) <= 2: a new car every time');

  // collision: walk frame 2, against the cars' positions as last set, person at (247.15, 197.55)
  const hitAt = (sx, sy, driving) => ev(([sx, sy, driving]) => {
    const s = SRPG.game.s;
    s.hp = 100; s.driving = driving ? 1 : 0; s.items.car = driving ? 1 : 0;
    SRPG.city.st.stun = 0;
    SRPG.city.clearTraffic();
    const c = SRPG.city.cars[1];
    c.placed = true; c.s = 5000; c.clip = 1; c.x = sx - s.mapx; c.y = sy - s.mapy; c.sx = sx; c.sy = sy;
    SRPG.city.st.walkFrame = 2;
    SRPG.city.st.move = { xmove: 0, ymove: 0, walkspeed: 1 };
    const m0 = s.msgs.length;
    SRPG.engine.step(1);
    const r = { stun: SRPG.city.st.stun, kind: SRPG.city.st.stunKind, hp: s.hp, msgs: s.msgs.length - m0 };
    SRPG.city.st.stun = 0;
    return r;
  }, [sx, sy, driving]);
  await fresh({ mapx: 232, mapy: 200 });
  const box = [[282, 200, true], [283, 200, false], [218, 200, true], [217, 200, false], [250, 249, true], [250, 250, false], [250, 143, true], [250, 142, false]];
  for (const [x, y, want] of box) {
    const r = await hitAt(x, y);
    ok((r.stun > 0) === want, 'car at stage (' + x + ', ' + y + '): ' + (want ? 'hit' : 'missed') + ' (x - 35 < 247.15 < x + 30, y - 52 < 197.55 < y + 55)', r);
  }
  await sfx();
  const hw = await hitAt(250, 200, false);
  eq([hw.stun, hw.kind, hw.hp, hw.msgs], [40, 'hit', 90, 1], 'on foot: knocked flat, -10 HP, a lawyer / reporter message');
  eq((await sfx()).includes('carhit'), true, 'the car-hit sound');
  const hd = await hitAt(250, 200, true);
  eq([hd.stun, hd.kind, hd.hp, hd.msgs], [40, 'crash', 90, 0], 'driving: a crash, -10 HP, no message');
  eq((await sfx()).includes('crash'), true, 'the crash sound');
  const f1 = await ev(() => {
    const s = SRPG.game.s;
    s.driving = 0;
    SRPG.city.clearTraffic();
    const c = SRPG.city.cars[1];
    c.placed = true; c.s = 5000; c.clip = 1; c.sx = 250; c.sy = 200; c.x = 250 - s.mapx; c.y = 200 - s.mapy;
    SRPG.city.st.walkFrame = 1;
    SRPG.engine.step(1);
    return SRPG.city.st.stun;
  });
  eq(f1, 0, 'no collision test on walk frame 1');
  // Which car: the source reads "car1's box or car2's box", but the compiled jumps make it
  // ((car1's box) || px > car2.x - 35) && px < car2.x + 30 && py > car2.y - 52 && py < car2.y + 55,
  // so only car2 knocks you down (Ruffle: car1 alone drives straight through the player).
  const hit2 = (c1, c2) => ev(([c1, c2]) => {
    const s = SRPG.game.s;
    s.hp = 100; s.driving = 0;
    SRPG.city.st.stun = 0;
    SRPG.city.clearTraffic();
    [c1, c2].forEach((p, i) => {
      if (!p) return;
      const c = SRPG.city.cars[i];
      c.placed = true; c.s = 5000; c.clip = 1; c.x = p[0] - s.mapx; c.y = p[1] - s.mapy; c.sx = p[0]; c.sy = p[1];
    });
    SRPG.city.st.walkFrame = 2;
    SRPG.city.st.move = { xmove: 0, ymove: 0, walkspeed: 1 };
    SRPG.engine.step(1);
    const r = [SRPG.city.st.stun > 0, s.hp];
    SRPG.city.st.stun = 0;
    return r;
  }, [c1, c2]);
  eq(await hit2([250, 200], null), [false, 100], 'car1 right over the player: no hit (car1 never knocks you down)');
  eq(await hit2([250, 200], [250, 600]), [false, 100], '...nor with car2 elsewhere on the road');
  eq(await hit2(null, [250, 200]), [true, 90], 'car2 over the player: hit');
  eq(await hit2(null, [290, 200]), [false, 100], 'car2 just right of the player (x - 35 = 255 > 247.15): miss');
  eq(await hit2([250, 200], [290, 200]), [true, 90], '...but with car1 over the player it hits: car1 stretches car2\'s box to the left');
  eq(await hit2([250, 200], [210, 200]), [false, 100], 'car2 too far left (x + 30 = 240 < 247.15): car1 does not help');
  // the hit tick: walk frame 2 moved the cars once before its test, then its script stops (the cars
  // are not placed again); root frame 3 moves and places them from the next tick
  const ht = await ev(() => {
    const s = SRPG.game.s;
    s.hp = 100; s.driving = 0;
    SRPG.city.st.stun = 0;
    SRPG.city.clearTraffic();
    const c = SRPG.city.cars[1];
    c.placed = true; c.s = 1; c.clip = 1; c.x = 250 - s.mapx; c.y = 206 - s.mapy; c.sx = 250; c.sy = 206;
    SRPG.city.st.walkFrame = 2;
    SRPG.city.st.move = { xmove: 0, ymove: 0, walkspeed: 1 };
    const y0 = c.y;
    SRPG.engine.step(1);
    const r = [SRPG.city.st.stun, c.y - y0, c.sy];
    SRPG.engine.step(1);
    r.push(SRPG.city.st.stun, c.y - y0, c.sy);
    SRPG.city.st.stun = 0;
    return r;
  });
  eq(ht, [40, -6, 206, 39, -12, 194], 'hit tick: the car moved 6 px (not placed again); next tick root frame 3: fcount 1, 6 px more, placed');

  // a door on walk frame 1: the walk clip is gone, so no traffic that tick
  await fresh({ mapx: 447, mapy: 320 });
  const dt = await ev(() => {
    const [a, b] = SRPG.city.cars;
    a.placed = true; a.s = 1; a.clip = 1; a.x = 15; a.y = 300;
    b.s = 3; b.clip = 33; // would come on for sure on this frame 1
    SRPG.engine.keys.ArrowLeft = true;
    SRPG.engine.step(1);
    SRPG.engine.keys.ArrowLeft = false;
    const r = [SRPG.engine.sceneName, SRPG.location.current, a.y, b.s];
    SRPG.location.leave();
    return r;
  });
  eq(dt, ['location', 'mcsticks', 300, 3], 'walking into a door: the cars neither move, count down nor come on that tick');

  // ---------------------------------------------------------------------------------------------
  console.log('Knock-down (root frame 3)');
  await fresh({ mapx: 200, mapy: 1011, hp: 50 });
  await ev(() => {
    const [a, b] = SRPG.city.cars;
    a.placed = true; a.s = 1; a.clip = 1; a.x = 15; a.y = 0;
    b.s = 3; b.clip = 33; // would come on for sure on this frame 1
  });
  await t.hold(['ArrowUp'], 1);
  const k0 = await ev(() => ({ stun: SRPG.city.st.stun, kind: SRPG.city.st.stunKind, hp: SRPG.game.s.hp, mapy: SRPG.game.s.mapy, cy: SRPG.city.cars[0].y, c2: SRPG.city.cars[1].s }));
  eq([k0.stun, k0.kind, k0.hp, k0.mapy], [40, 'fall', 40, 995], 'falling off: -10 HP, pushed back 20; root frame 3 counts from the next tick');
  eq([k0.cy, k0.c2], [0, 3], 'the fall tick has no traffic: the walk clip stops at the fall (Ruffle: the cars move 0 px)');
  eq((await sfx()).includes('fall'), true, 'the fall sound');
  eq(await ev(() => SRPG.hud.hit(477, 21)), null, 'no HUD buttons while down');
  await ev(() => { SRPG.game.s.intelligence = 1500; SRPG.city.cars[1].s = 500; SRPG.city.cars[1].clip = 33; });
  const during = await ev(() => {
    const out = [];
    SRPG.engine.keys.ArrowDown = true;
    for (let i = 0; i < 39; i++) { SRPG.engine.step(1); out.push([SRPG.game.s.mapy, SRPG.city.st.stun]); }
    return out;
  });
  ok(during.every((p) => p[0] === 995) && during[38][1] === 1, 'no walking for 39 ticks (fcount 1-39), keys held', during.slice(-1));
  eq(await ev(() => [SRPG.city.cars[0].y, SRPG.city.cars[1].s]), [-6 * 39, 500], 'moving cars drive on 6 px a tick, no count-down');
  await t.step(1);
  await ev(() => { SRPG.engine.keys.ArrowDown = false; });
  const k40 = await ev(() => ({ stun: SRPG.city.st.stun, mapy: SRPG.game.s.mapy, int: SRPG.game.s.intelligence, cy: SRPG.city.cars[0].y, wf: SRPG.city.st.walkFrame }));
  eq([k40.stun, k40.mapy, k40.int], [0, 987, 999], 'fcount 40: back to root frame 2 (stat caps), and the new walk clip runs both its frames that tick (two steps)');
  eq([k40.cy, k40.wf], [-6 * 39 - 18, 1], '...the cars move 18 px on it (root frame 3, walk frames 1 and 2, as Ruffle logs), and the next tick is walk frame 1');

  // clicking a street person while down
  await fresh({ mapx: 400, mapy: 200 });
  await ev(() => { SRPG.city.st.stun = 20; SRPG.city.st.stunKind = 'fall'; });
  await ev(() => SRPG.city.onClick(400 - 248, 200 + 55));
  eq(await scene(), 'location:hobo', 'the street people can be clicked while knocked down');
  await ev(() => SRPG.location.leave());
  eq(await ev(() => SRPG.city.st.stun), 0, 'back from the dialog on root frame 2: the knock-down is over');

  // driving off the edge: person clip 328 -> 360 sets car2s = 500
  await fresh({ mapx: 200, mapy: 1011, items: { car: 1 }, driving: 1, hp: 50 });
  await ev(() => { const c = SRPG.city.cars[1]; c.placed = true; c.s = 0; c.clip = 1; c.x = -75; c.y = -300; });
  await t.hold(['ArrowUp'], 1);
  eq(await ev(() => SRPG.city.st.stunKind), 'fall', 'driving off the edge: a fall');
  await t.step(31);
  const c31 = await ev(() => [SRPG.city.cars[1].s, SRPG.city.cars[1].y]);
  await t.step(1);
  const c32 = await ev(() => [SRPG.city.cars[1].s, SRPG.city.cars[1].y, SRPG.city.cars[1].clip]);
  await t.step(3);
  const c35 = await ev(() => SRPG.city.cars[1].y);
  ok(c31[0] === 0 && c32[0] === 500 && c32[2] === 1 && c35 === c32[1], '32 ticks later car2 stops dead where it is (car2s = 500, still drawn)', [c31, c32, c35]);

  // under a street dialog (root frames 7-10) the walk clip is gone but the car and person clips play on
  await fresh({ mapx: 400, mapy: 200, items: { car: 1 }, driving: 1, hp: 50 });
  await ev(() => {
    const [a, b] = SRPG.city.cars;
    a.placed = true; a.s = 2; a.clip = 2; a.x = 15; a.y = -890;
    b.placed = true; b.s = 0; b.clip = 1; b.x = -75; b.y = 100;
    SRPG.city.st.walkFrame = 1;
    SRPG.city.st.stun = 30; SRPG.city.st.stunKind = 'fall'; SRPG.city.st.car2At = SRPG.engine.frame + 20; // fell while driving
    SRPG.city.onClick(400 - 248, 200 + 55); // Harold, while still down
  });
  eq(await scene(), 'location:hobo', 'street dialog opened while down');
  await t.step(19);
  const dg19 = await ev(() => SRPG.city.cars.map((c) => [c.s, c.clip, c.y]));
  await t.step(12);
  const dg31 = await ev(() => SRPG.city.cars.map((c) => [c.s, c.clip, c.y]));
  ok(dg19[1][0] === 0 && dg19[1][2] === 100 && dg31[1][0] === 500 && dg31[1][2] === 100,
    'under the dialog the driving car stands still (no walk clip), and the person clip\'s car2s = 500 lands on time', [dg19, dg31]);
  eq(dg31[0].slice(0, 2), [500, 33], 'a car rolling off the road finishes its roll under the dialog (carNs = 500)');
  await ev(() => SRPG.location.leave());
  eq(await ev(() => [SRPG.city.st.stun, SRPG.city.st.car2At, SRPG.city.cars[1].s, SRPG.city.cars[1].y]), [0, 0, 500, 100],
    'back on the map (root frame 2): the knock-down is over and car2 stays frozen where it stood, counting down to a new car');

  // back from a building: new clips
  await fresh({ mapx: 440, mapy: 320 });
  await ev(() => {
    const [a, b] = SRPG.city.cars;
    a.placed = true; a.s = 2; a.clip = 10; a.x = 15; a.y = -890; a.rot = 0;
    b.placed = true; b.s = 0; b.clip = 1; b.x = -75; b.y = 100; b.rot = 180; b.tint = { r: 20, g: 100, b: 150 };
    SRPG.game.s.rot = 270;
    SRPG.location.open('mcsticks');
    SRPG.location.leave();
  });
  const rb = await ev(() => ({ a: SRPG.city.cars[0], b: SRPG.city.cars[1], rot: SRPG.game.s.rot }));
  eq([rb.a.clip, rb.a.s, rb.b.clip, rb.b.rot, rb.b.tint, rb.a.tint, rb.rot], [1, 2, 1, 0, { r: 100, g: 100, b: 150 }, null, 0],
    'after a building: car clips back at frame 1 with their placement colours, facing up; the player faces up');
  await t.step(100);
  eq(await ev(() => [SRPG.city.cars[0].s, SRPG.city.cars[0].y, SRPG.city.cars[0].clip]), [2, -890, 1], 'a car that was rolling off the edge stays stuck there (carNs 2, clip stopped at frame 1)');
  eq(await ev(() => SRPG.city.cars[1].y), 100 + 6 * 100, 'a driving car drives on');

  // ---------------------------------------------------------------------------------------------
  console.log('Driving toggle (the walk clip\'s c key)');
  await fresh({ mapx: 300, mapy: 630 });
  await page.keyboard.press('c');
  eq(await ev(() => SRPG.game.s.driving), 0, 'no car: nothing');
  await ev(() => { SRPG.game.s.items.car = 1; SRPG.engine.black = 10; });
  await sfx();
  await page.keyboard.press('c');
  eq(await ev(() => [SRPG.game.s.driving, SRPG.engine.black]), [1, 1], 'in: driving, black clip from frame 1');
  eq(await sfx(), ['ignition'], 'the ignition');
  await t.step(12);
  await page.keyboard.press('c');
  // the handler's first jump only skips the ignition, so the fade plays both ways (Ruffle-checked)
  eq(await ev(() => [SRPG.game.s.driving, SRPG.engine.black]), [0, 1], 'out: on foot, black clip from frame 1');
  eq(await sfx(), [], '...and no sound');
  await ev(() => { SRPG.city.st.stun = 5; });
  await page.keyboard.press('c');
  eq(await ev(() => SRPG.game.s.driving), 0, 'not while knocked down (no walk clip on root frame 3)');
  await page.keyboard.press('i');
  eq(await ev(() => !!SRPG.city.st.panel), false, 'the I / Esc shortcuts (this version\'s, for the HUD buttons) do nothing while knocked down');
  await ev(() => { SRPG.city.st.stun = 0; SRPG.city.st.walkFrame = 2; });
  await page.keyboard.press('i');
  eq(await ev(() => !!SRPG.city.st.panel), true, 'I opens the inventory');
  await page.keyboard.press('Escape');
  eq(await ev(() => [!!SRPG.city.st.panel, SRPG.city.st.walkFrame]), [false, 1], 'Esc closes it like its X (back to root frame 2)');
  // shift + W: the engine's keys are lower case
  await page.keyboard.down('Shift');
  await page.keyboard.down('W');
  const kw = await ev(() => [!!SRPG.engine.keys.w, !!SRPG.engine.keys.Shift]);
  await page.keyboard.up('W');
  await page.keyboard.up('Shift');
  eq(kw, [true, true], 'Shift + W reads as w (and Shift)');

  // ---------------------------------------------------------------------------------------------
  console.log('Street people and the parked car (button hit shapes)');
  await fresh({ mapx: 456, mapy: 630 });
  const click = (mapPt, st) => ev(([p, st]) => {
    const s = SRPG.game.s;
    Object.assign(s, st || {});
    SRPG.engine.go('city', { fade: false });
    SRPG.city.onClick(s.mapx + p[0], s.mapy + p[1]);
    const r = SRPG.location.current;
    if (r) SRPG.location.leave();
    return r;
  }, [mapPt, st]);
  const npcs = [
    ['smokes', [-249.96, -226.17, -613.45, -585.4], { mapx: 500, mapy: 800 }],
    ['hobo', [-263.65, -231.85, 39.18, 70.98], { mapx: 400, mapy: 200 }],
    ['dealer', [143.1, 175.6, 563.45, 628.95], { mapx: 200, mapy: -400 }],
  ];
  for (const [id, b, pos] of npcs) {
    const ins = [await click([b[0] + 0.5, b[2] + 0.5], pos), await click([b[1] - 0.5, b[3] - 0.5], pos), await click([(b[0] + b[1]) / 2, (b[2] + b[3]) / 2], pos)];
    const outs = [await click([b[0] - 1, b[2] + 5], pos), await click([b[1] + 1, b[2] + 5], pos), await click([b[0] + 5, b[2] - 1], pos), await click([b[0] + 5, b[3] + 1], pos)];
    ok(ins.every((r) => r === id) && outs.every((r) => r === null), id + ': opens inside its hit rectangle only', [ins, outs]);
  }
  eq(await click([-238, -600], { mapx: 500, mapy: 800, packNumber: 10 }), null, 'the smokes kid is gone after 10 packs');
  eq(await click([-917, -593], { mapx: 1100, mapy: 800, packNumber: 0 }), 'parkedcar', 'the parked car');
  eq(await click([-964, -620], { mapx: 1100, mapy: 800 }), null, 'its hit shape is the car, not its box');
  eq(await click([-917, -593], { mapx: 1100, mapy: 800, items: Object.assign({}, s0.items, { car: 1 }) }), null, 'no parked car once hotwired');
  await fresh({ mapx: 400, mapy: 200 });
  await ev(() => SRPG.city.openPanel('inventory'));
  eq(await ev(() => SRPG.hud.hit(477, 21)), null, 'no HUD buttons under a panel (root frames 5 / 6)');
  await ev(() => SRPG.city.onClick(400 - 248, 200 + 55));
  eq([await scene(), await ev(() => !!SRPG.city.st.panel)], ['location:hobo', false], 'the street people stay clickable under a panel, which goes away');
  await ev(() => SRPG.location.leave());
  await ev(() => { SRPG.engine.black = 10; SRPG.location.open('casino', { resume: true }); });
  eq(await ev(() => SRPG.engine.black), 10, 'a minigame handing back (resume): no fade');
  await ev(() => { SRPG.location.open('casino', { resume: true, fade: true }); });
  eq(await ev(() => SRPG.engine.black), 1, '...unless it asks for the entry fade');
  await ev(() => SRPG.location.leave());

  // ---------------------------------------------------------------------------------------------
  console.log('Root frame 2 on every return: nominations and caps');
  const nom = await ev(() => {
    const g = SRPG.game;
    const base = { cash: 200000, dwelling: 5, electionMessage: 0, intelligence: 777, strength: 777, charm: 777 };
    const run = (patch) => {
      const s = SRPG.newState();
      Object.assign(s, base, patch);
      s.msgs = [];
      g.s = s;
      g.onEnterCity();
      return [s.electionMessage, s.msgs.length];
    };
    const r = {
      dictator: run({ karma: -1 }), president: run({ karma: 1, intelligence: 666, strength: 666, charm: 666 }),
      neutral: run({ karma: 0 }), poor: run({ karma: -1, cash: 199999 }), mansion: run({ karma: -1, dwelling: 4 }),
      weak: run({ karma: -1, charm: 776 }), again: run({ karma: -1, electionMessage: 3 }),
      presBar: run({ karma: 5, intelligence: 665 }),
    };
    const s = SRPG.newState();
    Object.assign(s, { intelligence: 1001, strength: 1200, charm: 999.5, day: 0 });
    g.s = s;
    g.onEnterCity();
    r.caps = [s.intelligence, s.strength, s.charm, s.day];
    return r;
  });
  eq(nom.dictator, [1, 1], 'Dictator: $200,000, castle, all stats 777, karma < 0');
  eq(nom.president, [2, 1], 'President: all stats 666, karma > 0');
  eq([nom.neutral, nom.poor, nom.mansion, nom.weak, nom.again, nom.presBar], [[0, 0], [0, 0], [0, 0], [0, 0], [3, 0], [0, 0]], 'no nomination at karma 0, short of cash, in the mansion, a stat short, or already asked');
  eq(nom.caps, [999, 999, 999, 1], 'stats capped at 999, day 0 becomes day 1');
  await fresh({ mapx: 300, mapy: 630 });
  await ev(() => SRPG.city.openPanel('stats'));
  await ev(() => { SRPG.game.s.charm = 1500; });
  await t.clickUI('close');
  eq(await ev(() => [SRPG.game.s.charm, !!SRPG.city.st.panel, SRPG.city.st.walkFrame]), [999, false, 1], 'closing a panel returns to root frame 2 (caps, a new walk clip)');

  // ---------------------------------------------------------------------------------------------
  console.log('HP runs out on the map');
  await fresh({ mapx: 300, mapy: 630 });
  await t.set({ hp: 0 });
  await t.step(1);
  eq(await scene(), 'death', 'YOU DIED');

  // ---------------------------------------------------------------------------------------------
  console.log('Sleep (frames 65 / 78)');
  const sleep = (patch, mansion, seed) => ev(([patch, mansion, seed]) => {
    const s = SRPG.newState();
    Object.assign(s, { day: 3, time: 20, hp: 5, hpmax: 100 }, patch);
    if (patch.items) s.items = Object.assign(s.items, patch.items);
    SRPG.game.s = s;
    const before = JSON.parse(JSON.stringify(s));
    if (seed) SRPG.rng.seed(seed);
    const out = SRPG.game.sleep(mansion);
    SRPG.rng.unseed();
    return { out, s, before };
  }, [patch, mansion, seed || 0]);
  const sl1 = await sleep({ bankcash: 1000, bankloan: 999, bankrate: 10 }, false, 9);
  eq([sl1.s.day, sl1.s.time, sl1.s.hp], [4, 8, 25], 'next day, 8 AM, +20 HP');
  eq([sl1.s.bankcash, sl1.s.bankloan], [1100, 1098], 'interest at the old rate, int() truncated (999 * 10% -> 99)');
  ok(Math.round((sl1.s.bankrate - 10) * 10) >= -5 && Math.round((sl1.s.bankrate - 10) * 10) <= 4, 'then the rate drifts -0.5..+0.4', sl1.s.bankrate);
  const stk = Object.keys(sl1.s.stocks).map((k, i) => { const a = sl1.before.stocks[k].price, b = sl1.s.stocks[k]; return b.prev === a && Math.abs(b.price - a) <= (i === 0 ? 0.25 : 1) + 1e-9 && b.price >= 1; });
  ok(stk.every(Boolean), 'stocks: prev = old price, XGS moves up to 0.25, the others up to 1, never below 1');
  eq((await sleep({ bankrate: 0.2 }, false, 3)).s.bankrate >= 0, true, 'the rate never goes below 0');
  eq((await sleep({ bankloandays: 5, bankloan: 10 }, false)).out.bank, '4 days left to pay back your loan ($10)', 'loan: a day off');
  const l2 = await sleep({ bankloandays: 2, bankloan: 10 }, false);
  eq([l2.s.bankloandays, l2.out.dead, l2.s.hp], [0, true, 0], 'loan: from 2 days the chained tests reach 0 the same night: YOU DIED (after the rest of the night)');
  eq([(await sleep({ bankloandays: -1 }, false)).s.bankloandays, (await sleep({ bankloandays: -1 }, false)).out.dead], [-1, false], 'no loan: nothing');
  eq((await sleep({ items: { bed: 1 } }, false)).s.hp, 35, 'a bed: +30');
  eq((await sleep({ items: { bed: 1, freezer: 1 } }, false)).s.hp, 35, 'the Deep Freeze does nothing in the apartment');
  eq((await sleep({ items: { bed: 1, freezer: 1 } }, true)).s.hp, 45, 'bed + Deep Freeze in the mansion: +40');
  eq((await sleep({ items: { freezer: 1 } }, true)).s.hp, 25, 'Deep Freeze without the bed: +20');
  const pl = await sleep({ items: { pills: 2, alarm: 1 } }, false);
  eq([pl.s.hp, pl.s.time, pl.s.items.pills, pl.out.pills], [5, 0, 1, '(CAFFEINE PILLS USED)'], 'pills: 20 HP less, 4 hours earlier, one used; the alarm 4 more');
  eq((await sleep({ hp: 95 }, false)).out.hp, '5 HP RESTORED!', 'restore capped at max HP, the number shows what was restored');
  const st9 = await sleep({ intelligence: 999, charm: 5, strength: 999, hpmax: 100, items: { books: 1, minibar: 1, treadmill: 1 } }, false);
  eq([st9.s.intelligence, st9.s.charm, st9.s.strength, st9.s.hpmax], [999, 6, 999, 101], 'books / minibar / treadmill +1 (capped at 999; the treadmill still adds max HP)');
  eq([(await sleep({ job: 8 }, true)).s.cash, (await sleep({ job: 9 }, false)).s.cash], [5100, 100], 'political salary $5000, only in the mansion');
  const y365 = await sleep({ day: 364 }, false);
  eq([y365.s.day, y365.s.items.car, y365.s.msgs.length], [365, 2, 2], 'day 365: the sports car and a message');
  eq([(await sleep({ day: 15, gamelength: 15 }, false)).out.ended, (await sleep({ day: 14, gamelength: 15 }, false)).out.ended, (await sleep({ day: 50, gamelength: 0 }, false)).out.ended],
    [true, false, false], 'a timed game ends after its last day (unlimited never)');

  // ---------------------------------------------------------------------------------------------
  console.log('Rank and net worth (frame 130)');
  const rk = await ev(() => {
    const r = (cash, karma, bank, loan) => SRPG.game.rank({ cash, karma: karma || 0, bankcash: bank || 0, bankloan: loan || 0 });
    return {
      n: [r(0), r(1), r(100), r(101), r(500), r(501), r(1000), r(1001), r(4000), r(4001), r(10000), r(10001), r(100000), r(100001), r(250001),
        r(1000000), r(1000001), r(2000001), r(10000001), r(100000001), r(1000000001), r(-5)],
      good: [r(1001, 21), r(250001, 21), r(1000000001, 21)], evil: [r(1001, -21), r(100001, -21), r(1000000001, -21)],
      edge: [r(1001, 20), r(1001, -20)], worth: [r(900, 0, 200, 50), SRPG.game.netWorth({ cash: 900, bankcash: 200, bankloan: 50 })],
    };
  });
  eq(rk.n, ['HOPELESS', 'UTTER FAILURE', 'UTTER FAILURE', 'LOSER', 'LOSER', 'INCOMPETENT', 'INCOMPETENT', 'NOVICE', 'NOVICE', 'MEDIOCRE', 'MEDIOCRE', 'EXCEPTIONAL',
    'EXCEPTIONAL', 'GENIUS', 'GENIUS', 'GENIUS', 'MILLIONAIRE', 'MULTIMILLIONAIRE', 'DEMI GOD', 'GOD', 'BILLIONAIRE GOD', 'HOPELESS'],
  'thresholds (> 0, 100, 500, 1000, 4000, 10000, then the $250,000 test before $100,000 so EXTRAORDINARY never shows)');
  eq(rk.good, ['WUSS', 'EXTRAORDINARILY GOOD', 'MR. DOG'], 'karma > 20: the good names');
  eq(rk.evil, ['JUVENILE DELINQUENT', 'EXTRAORDINARILY EVIL', 'MR. NATAS'], 'karma < -20: the evil names');
  eq(rk.edge, ['NOVICE', 'NOVICE'], 'karma 20 and -20 are neutral');
  eq(rk.worth, ['NOVICE', 1050], 'net worth = cash + savings - loan');

  // ---------------------------------------------------------------------------------------------
  console.log('Karma: clamping and the body colour (personColor, sprite 478)');
  const kc = await ev(() => {
    const g = SRPG.game;
    g.s = SRPG.newState();
    g.s.karma = 99; g.addKarma(5); const up = g.s.karma;
    g.s.karma = -98; g.addKarma(-5); const down = g.s.karma;
    g.s.karma = 150; g.addKarma(-1); const over = g.s.karma;
    const ks = [];
    for (let k = -110; k <= 110; k += 0.5) ks.push(k);
    return { up, down, over, colors: ks.map((k) => [k, g.personColor(k)]) };
  });
  eq([kc.up, kc.down, kc.over], [100, -100, 100], 'addKarma = karma + n, then karmaAdjust (clamp to +-100)');
  const GOOD = [0x0066cc, 0x017cf8, 0x218ffe, 0x45a2fe, 0x70b7fe, 0x8fc8fe, 0xbfdfff, 0xdfefff, 0xeef7ff, 0xffffff];
  const EVIL = [0x0066cc, 0x0110c9, 0x6500ca, 0x9700ca, 0xba01c9, 0xc9018d, 0xca005b, 0xca001a, 0xca0000, 0xca0000];
  const orig = (k) => { // the original's chain of tests, last match wins
    let c = null;
    for (let i = 0; i < 10; i++) if ((i === 0 ? k >= 0 : k > i * 10) && k <= (i + 1) * 10) c = GOOD[i];
    if (k > 100) c = 0xffffff;
    for (let i = 0; i < 10; i++) if (k >= -(i + 1) * 10 && k < -i * 10) c = EVIL[i];
    if (k <= -100) c = 0xca0000;
    return '#' + c.toString(16).padStart(6, '0');
  };
  const badc = kc.colors.filter(([k, c]) => c !== orig(k));
  eq(badc, [], 'every karma from -110 to 110 (half steps) gets the original\'s colour (0-10 blue, > 10 lighter per 10, < 0 darker per 10)');

  // ---------------------------------------------------------------------------------------------
  console.log('Sound (sound.js rendered offline, measured against the original\'s samples)');
  {
    // js/core/sound.js runs on its own page with an OfflineAudioContext behind a Proxy (virtual
    // currentTime and timers), and each render is measured there: K-weighted loudness (BS.1770,
    // ungated) and length of the part within 40 dB of the peak, as in the audio audit.
    const rp = await t.browser.newPage();
    await rp.setContent('<html><body></body></html>');
    const SRC = fs.readFileSync(path.join(h.ROOT, 'js/core/sound.js'), 'utf8');
    const render = (jobs) => rp.evaluate(async ({ SRC, jobs }) => {
      const SR = 44100;
      function biquad(x, b, a) {
        const y = new Float64Array(x.length);
        let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
        for (let i = 0; i < x.length; i++) {
          const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
          x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
        }
        return y;
      }
      function rbj(type, f0, Q) { // RBJ cookbook low/high-pass
        const w = 2 * Math.PI * f0 / SR, al = Math.sin(w) / (2 * Q), c = Math.cos(w), a0 = 1 + al;
        const b = type === 'lp' ? [(1 - c) / 2, 1 - c, (1 - c) / 2] : [(1 + c) / 2, -(1 + c), (1 + c) / 2];
        return [b.map((v) => v / a0), [1, -2 * c / a0, (1 - al) / a0]];
      }
      function kweight(x) {
        let K = Math.tan(Math.PI * 1681.974450955533 / SR), Q = 0.7071752369554196;
        const Vh = Math.pow(10, 3.999843853973347 / 20), Vb = Math.pow(Vh, 0.4996667741545416);
        let a0 = 1 + K / Q + K * K;
        const y = biquad(x, [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0], [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0]);
        K = Math.tan(Math.PI * 38.13547087602444 / SR); Q = 0.5003270373238773; a0 = 1 + K / Q + K * K;
        return biquad(y, [1, -2, 1], [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0]);
      }
      const ms = (x, i0, i1) => { let e = 0; i0 = Math.max(0, i0 | 0); i1 = Math.min(x.length, i1 | 0); for (let i = i0; i < i1; i++) e += x[i] * x[i]; return e / Math.max(1, i1 - i0); };
      const db = (v) => 10 * Math.log10(v + 1e-20);
      const r1 = (v) => Math.round(v * 10) / 10;
      const r3 = (v) => Math.round(v * 1000) / 1000;
      function analyze(x, o) {
        const out = {};
        let pk = 0;
        for (let i = 0; i < x.length; i++) pk = Math.max(pk, Math.abs(x[i]));
        out.peak = r1(20 * Math.log10(pk + 1e-12));
        const hop = Math.round(SR * 0.005), win = 2 * hop, env = [];
        for (let i = 0; i + win <= x.length; i += hop) env.push(db(ms(x, i, i + win)));
        const top = Math.max.apply(null, env);
        const act = env.map((v, i) => (v > top - 40 && v > -140 ? i : -1)).filter((i) => i >= 0);
        if (!act.length) return { silent: true, peak: out.peak };
        const a0 = act[0], a1 = act[act.length - 1];
        out.start = r3(a0 * 0.005);
        out.dur = r3((a1 - a0 + 1) * 0.005);
        const k = kweight(x);
        out.lufs = r1(-0.691 + db(ms(k, a0 * hop, (a1 + 2) * hop)));
        if (o.win) out.lufsWin = o.win.map((w) => r1(-0.691 + db(ms(k, w[0] * SR, w[1] * SR))));
        if (o.win) out.peakWin = o.win.map((w) => { let m = 0; for (let i = Math.round(w[0] * SR); i < w[1] * SR; i++) m = Math.max(m, Math.abs(x[i])); return r1(20 * Math.log10(m + 1e-12)); });
        if (o.period) { // correlation of the waveform with itself `lag` seconds later
          const [a, n, lag] = o.period.map((v) => Math.round(v * SR));
          let c = 0, e1 = 0, e2 = 0;
          for (let i = a; i < a + n; i++) { c += x[i] * x[i + lag]; e1 += x[i] * x[i]; e2 += x[i + lag] * x[i + lag]; }
          out.pcorr = r3(c / Math.sqrt(e1 * e2 + 1e-20));
        }
        const E = ms(x, 0, x.length);
        let hi = x;
        for (let s = 0; s < 4; s++) hi = biquad(hi, ...rbj('hp', 5512, 0.7071));
        out.above5k = r3(ms(hi, 0, x.length) / E);
        out.lo150 = r3(ms(biquad(x, ...rbj('lp', 150, 0.7071)), 0, x.length) / E);
        out.hp300 = r3(ms(biquad(x, ...rbj('hp', 300, 0.7071)), 0, x.length) / E);
        if (o.trig !== undefined) {
          const t = Math.round(o.trig * SR);
          let head = 0, rest = 0;
          for (let i = t - 2; i <= t + 2; i++) head = Math.max(head, Math.abs(x[i]));
          for (let i = t + 44; i < x.length; i++) rest = Math.max(rest, Math.abs(x[i]));
          out.head = r3(head); out.rest = r3(rest);
        }
        if (o.gaps) { // share of 5 ms frames more than 20 dB under the loudest
          const e5 = [];
          for (let i = Math.round(o.gaps[0] * SR); i + hop <= o.gaps[1] * SR; i += hop) e5.push(db(ms(x, i, i + hop)));
          const m = Math.max.apply(null, e5);
          out.gaps = r3(e5.filter((v) => v < m - 20).length / e5.length);
        }
        if (o.after !== undefined) { let m = 0; for (let i = Math.round(o.after * SR); i < x.length; i++) m = Math.max(m, Math.abs(x[i])); out.after = m; }
        if (o.pitch) { // strongest autocorrelation lag (60-600 Hz) over a window
          const i0 = Math.round(o.pitch[0] * SR), n = Math.round((o.pitch[1] - o.pitch[0]) * SR);
          let best = 0, bl = 0;
          const e0 = ms(x, i0, i0 + n) * n;
          for (let lag = Math.round(SR / 600); lag <= Math.round(SR / 60); lag++) {
            let c = 0;
            for (let i = i0; i < i0 + n; i++) c += x[i] * x[i + lag];
            if (c / e0 > best) { best = c / e0; bl = lag; }
          }
          out.f0 = r1(SR / bl); out.ac = r3(best);
        }
        return out;
      }
      const results = [];
      for (const job of jobs) {
        const off = new OfflineAudioContext(1, Math.round(SR * job.dur), SR);
        let T = 0, id = 0;
        const q = [];
        let seed = job.seed || 12345; // the same noise on every run (mulberry32)
        Math.random = function () {
          seed = (seed + 0x6d2b79f5) | 0;
          let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
          r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
          return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
        };
        window.SRPG = {};
        window.AudioContext = function () {
          return new Proxy(off, { get(t, k) {
            if (k === 'currentTime') return T;
            if (k === 'state') return 'running';
            const v = t[k];
            return typeof v === 'function' ? v.bind(t) : v;
          } });
        };
        window.setTimeout = function (fn, ms) { q.push({ t: T + ms / 1000, fn, id: ++id }); return id; };
        window.clearTimeout = function (n) { const i = q.findIndex((e) => e.id === n); if (i >= 0) q.splice(i, 1); };
        (0, eval)(SRC);
        const snd = SRPG.sound;
        snd.unlock();
        const ev = job.seq.slice().sort((a, b) => a[0] - b[0]);
        let ei = 0;
        for (;;) {
          q.sort((a, b) => a.t - b.t);
          const nt = q.length ? q[0].t : Infinity, ne = ei < ev.length ? ev[ei][0] : Infinity;
          if (Math.min(nt, ne) > job.dur) break;
          if (ne <= nt) {
            const [t, a] = ev[ei++];
            T = t;
            if (a === '!stop') snd.stopAll();
            else if (a === '!off') snd.setMusic(false);
            else if (a.indexOf('!vol:') === 0) snd.setVolume(+a.slice(5));
            else if (a.indexOf('!music:') === 0) snd.music(a.slice(7), true);
            else snd.play(a);
          } else {
            const e = q.shift();
            T = e.t;
            e.fn();
          }
        }
        const buf = await off.startRendering();
        results.push(analyze(buf.getChannelData(0), job));
      }
      return results;
    }, { SRC, jobs });

    // The original's samples (11 kHz MP3s, trimmed; the part the script plays): start of the
    // sound, its length and loudness (LUFS), from the audio audit.
    const ORIG = {
      error: [0.15, 0.135, -26.7], eat: [0, 0.364, -22.5], drink: [0.04, 0.659, -18.1], work: [0.005, 0.878, -20.6],
      purchase: [0, 0.873, -17.8], fall: [0.04, 0.763, -11.8], carhit: [0, 0.384, -18.1], crash: [0, 2.624, -16.8],
      footstep: [0.04, 0.269, -34.8], skate: [0, 0.259, -31.8], ansmachine: [0.07, 1.003, -24.0], roulette: [0, 7.378, -17.5],
      reel1: [0.02, 0.813, -25.4], reel2: [0.03, 0.958, -26.8], reel3: [0.03, 0.853, -26.3], handle: [0.035, 1.736, -32.4],
      win: [0, 1.901, -25.2], ignition: [0, 2.045, -15.4], breath: [0.19, 1.971, -16.1], punch: [0, 0.21, -11.1],
      kick: [0, 0.958, -12.5], fireball: [0, 2.878, -10.9], energy: [0, 1.761, -8.8], stamp: [0, 0.224, -12.3],
    };
    const names = Object.keys(ORIG);
    const fx = await render(names.map((n) => ({ dur: n === 'roulette' ? 8.5 : 3.5, seq: [[0, n]] })));
    names.forEach((n, i) => {
      const [st, du, lu] = ORIG[n], m = fx[i];
      ok(Math.abs(m.lufs - lu) <= 1.5 && Math.abs(m.dur - du) <= Math.max(0.06, 0.1 * du) && Math.abs(m.start - st) <= 0.03,
        n + ': loudness, length and start within 1.5 LU / 10% / 30 ms of the original (' + [st, du, lu].join(' / ') + ')', m);
      ok(m.above5k < 0.05, n + ': band-limited like the 11 kHz original (' + (m.above5k * 100).toFixed(1) + '% above 5.5 kHz)');
    });
    eq(new Set([1, 2, 3].map((k) => fx[names.indexOf('reel' + k)].dur)).size, 3, 'three different reel sounds');
    ok(fx[names.indexOf('footstep')].lufs - fx[names.indexOf('roulette')].lufs < -12, 'balance: the footstep ~17 LU under the roulette wheel, as in the original');

    const [snore, click, clickK, stop, sw, cnt, win, v50, v100, skate] = await render([
      { dur: 3, seq: [[0, 'breath']], pitch: [0.9, 1.3] },
      { dur: 5, seq: [[4.4, 'footstep']], trig: 4.4 }, // the start time that made noise() click
      { dur: 5.5, seq: [[4.4, 'kick']], trig: 4.4 },
      { dur: 4, seq: [[0, 'roulette'], [2.2, '!stop']], after: 2.21 },
      { dur: 2, seq: [[0, '!off'], [0, 'crash'], [0.5, '!music:inside'], [0.5, '!off']], after: 0.52 },
      // results count-up: SFXwork.stop(); SFXwork.start() on every tick for 3 s
      { dur: 3.2, seq: [].concat(...Array.from({ length: 105 }, (_, i) => [[i / 35, '!stop'], [i / 35, 'work']])), win: [[0, 104 / 35]] },
      { dur: 3, seq: [[0, 'win']] },
      { dur: 1, seq: [[0, '!vol:50'], [0, 'footstep']] },
      { dur: 1, seq: [[0, 'footstep']] },
      { dur: 3, seq: Array.from({ length: 17 }, (_, i) => [i * 6 / 35, 'skate']), gaps: [0.3, 2.7] },
    ]);
    ok([131, 262, 393, 524].some((f) => Math.abs(snore.f0 / f - 1) < 0.04) && snore.ac > 0.5, 'intro breath: a harmonic snore on ~131 Hz, not noise', snore);
    ok(click.head < 0.01 && clickK.head < 0.01, 'no one-sample click when a voice starts (the gain starts at 0)', [click, clickK]);
    eq(stop.after, 0, 'stopAll() cuts the 7.3 s roulette roll dead (the original\'s LoopX.stop() on a global Sound)');
    ok(sw.after < 0.001, 'a change of music loop stops the effects still playing (even with music off)', sw.after);
    ok(Math.abs(cnt.lufsWin[0] - -41.1) <= 2 && cnt.peakWin[0] < -20, 'count-up: stop + work every tick is a quiet crackle (original -41.1 LUFS, peak -24 dBFS)', cnt);
    ok(Math.abs(win.dur - 1.9) < 0.1, 'win: one call is the whole 1.9 s (start(0.1, 3): three loops)', win.dur);
    ok(Math.abs(v50.lufs - v100.lufs + 6) < 0.3, 'setVolume(50): 6 dB down (the title\'s global volume)', [v50.lufs, v100.lufs]);
    ok(skate.gaps < 0.05, 'skating: a skate every 6 ticks makes a continuous roll (no gaps)', skate.gaps);

    // Music: tempo and loop length from the original's loops; loudness, register and repetition
    // measured on the render. The title loop plays at the title's 50% volume.
    const info = await ev(() => ['beginning', 'main', 'inside', 'fight'].map((n) => SRPG.sound.loopInfo(n)));
    eq(info.map((l) => [l.bpm, Math.round(l.seconds * 100) / 100]), [[159.7, 6.01], [100, 57.6], [140, 6.86], [140, 6.86]],
      'loops: title 159.7 bpm / 6.01 s, main 100 bpm / 57.6 s, inside and fight 140 bpm / 6.86 s');
    const L = info.map((l) => l.seconds);
    // (our loops start 0.05 s after the call: one whole loop is measured)
    const mu = await render([
      { dur: 0.05 + L[0], seq: [[0, '!vol:50'], [0, '!music:beginning']], win: [[0.05, 0.05 + L[0]]] },
      { dur: 0.05 + L[1], seq: [[0, '!music:main']], win: [[0.05, 0.05 + L[1]], [0.05, 0.05 + 8 * 2.4]], period: [0.05, 2.4, 4 * 2.4] },
      { dur: 0.05 + 2 * L[2], seq: [[0, '!music:inside']], win: [[0.05, 0.05 + L[2]]], period: [0.05, L[2] - 0.1, L[2]] },
      { dur: 0.05 + L[3], seq: [[0, '!music:fight']], win: [[0.05, 0.05 + L[3]]] },
    ]);
    const [ti, ma, ins, fi] = mu;
    ok(Math.abs(ti.lufsWin[0] - -26.2) <= 1.5 && ti.hp300 > 0.9, 'title loop: -26.2 LUFS at 50% volume, no bass (400-1600 Hz)', ti);
    ok(Math.abs(ma.lufsWin[0] - -22.8) <= 1.5 && ma.lo150 > 0.75, 'main loop: -22.8 LUFS, a ~65 Hz bass (most energy under 100 Hz)', ma);
    ok(ma.lufsWin[1] < ma.lufsWin[0] - 1.5, 'main loop: bars 1-8 quieter than the whole (original -25.2 vs -22.8)', ma.lufsWin);
    ok(Math.abs(ins.lufsWin[0] - -32.1) <= 1.5 && ins.lo150 > 0.4 && ins.lo150 < 0.9, 'inside loop: -32.1 LUFS, a quiet bass at 55-150 Hz', ins);
    ok(Math.abs(fi.lufsWin[0] - -23.2) <= 1.5 && fi.lo150 > 0.75, 'fight loop: -23.2 LUFS, a heavy ~65 Hz bass', fi);
    ok(ins.pcorr > 0.95, 'inside loop repeats every 6.86 s (16 beats at 140 bpm)', ins.pcorr);
    ok(ma.pcorr > 0.95, 'main loop: its 4-bar pattern repeats every 9.6 s (100 bpm)', ma.pcorr);
    await rp.close();
  }
  {
    // In the game: a building's frame script (LoopB.stop() on a global Sound) stops every sound
    // and starts inside.mp3 from the top, also when a minigame or animation goes back to it.
    await fresh({ mapx: 456, mapy: 630 });
    const g = await ev(() => {
      SRPG.sound.unlock();
      const out = { city: SRPG.sound.state() };
      SRPG.sound.play('crash');
      out.crash = SRPG.sound.state().sources;
      SRPG.location.open('mcsticks');
      out.enter = SRPG.sound.state();
      SRPG.sound.play('crash');
      SRPG.location.open('mcsticks', { resume: true, fade: true });
      out.back = SRPG.sound.state();
      SRPG.sound.play('crash');
      SRPG.location.leave();
      out.leave = SRPG.sound.state();
      SRPG.sound.play('crash');
      SRPG.location.open('hobo');
      out.street = SRPG.sound.state().sources;
      SRPG.location.leave();
      return out;
    });
    ok(g.city.music === 'main' && g.crash > 10, 'city: main.mp3, and the crash is playing', g);
    ok(g.enter.music === 'inside' && g.enter.step <= 4 && g.enter.sources <= 6, 'entering a building: the crash is cut, inside.mp3 from the top', g.enter);
    ok(g.back.music === 'inside' && g.back.step <= 4 && g.back.sources <= 6, 'back to the root frame: every sound stops, inside.mp3 from the top again', g.back);
    ok(g.leave.music === 'main' && g.leave.sources <= 6, 'LEAVE (LoopD.stop()): every sound stops, main.mp3', g.leave);
    ok(g.street > 10, 'a street dialog leaves the sounds alone', g.street);
  }

  // ---------------------------------------------------------------------------------------------
  console.log('Engine');
  eq(await ev(() => [SRPG.FPS, SRPG.W, SRPG.H]), [35, 550, 400], '35 ticks a second on a 550 x 400 stage');
  const live = await ev(() => new Promise((res) => {
    // real time: with the clock running, about 35 ticks in a second
    SRPG.engine.pause(false);
    const f0 = SRPG.engine.frame, t0 = performance.now();
    setTimeout(() => { const n = SRPG.engine.frame - f0, dt = performance.now() - t0; SRPG.engine.pause(true); res(n / (dt / 1000)); }, 1500);
  }));
  ok(live > 30 && live < 38, '~35 ticks per second of real time', live);

  // ---------------------------------------------------------------------------------------------
  console.log('Text policy');
  if (fs.existsSync(SCR + '/srpg_as.txt') && fs.existsSync(SCR + '/texts.txt')) {
    const words = (x) => x.replace(/\\n/g, ' ').toLowerCase().match(/[a-z0-9$']+/g) || [];
    const src = fs.readFileSync(SCR + '/srpg_as.txt', 'latin1') + '\n' + fs.readFileSync(SCR + '/texts.txt', 'latin1');
    const grams = new Set();
    for (const o of [src, src.replace(/(["\s(])([A-Za-z])\\n/g, '$1$2')]) {
      const w = words(o);
      for (let i = 0; i + 6 <= w.length; i++) grams.add(w.slice(i, i + 6).join(' '));
    }
    const files = ['js/core/namespace.js', 'js/core/draw.js', 'js/core/ui.js', 'js/core/sound.js', 'js/core/engine.js', 'js/core/state.js',
      'js/core/game.js', 'js/scenes/city.js', 'js/scenes/location.js', 'js/world/map.js', 'js/main.js', 'index.html'];
    const hits = [];
    for (const f of files) {
      const w = words(fs.readFileSync(path.join(h.ROOT, f), 'utf8'));
      for (let i = 0; i + 6 <= w.length; i++) if (grams.has(w.slice(i, i + 6).join(' '))) hits.push(f + ': ' + w.slice(i, i + 6).join(' '));
    }
    eq(hits, [], 'no 6-word run of the original in the core files');
  } else console.log('  (decompiled sources not found: text check skipped)');

  // Map buttons act on release like Flash buttons: a press dragged off does nothing, a right or
  // middle click does nothing, a normal click opens the backpack.
  await fresh({ mapx: 456, mapy: 630 });
  await t.step(2);
  const bp = await ev(() => { const b = SRPG.hud.INVENTORY_BOX; return { x: b.x + b.w / 2, y: b.y + b.h / 2 }; });
  await page.mouse.move(bp.x, bp.y);
  await page.mouse.down();
  eq(await ev(() => !!SRPG.city.st.panel), false, 'backpack: nothing on the press');
  await page.mouse.move(300, 300);
  await page.mouse.up();
  eq(await ev(() => !!SRPG.city.st.panel), false, 'backpack: pressed and dragged off, nothing');
  await page.mouse.click(bp.x, bp.y, { button: 'right' });
  await page.mouse.click(bp.x, bp.y, { button: 'middle' });
  eq(await ev(() => !!SRPG.city.st.panel), false, 'backpack: right and middle clicks do nothing');
  await page.mouse.click(bp.x, bp.y);
  eq(await ev(() => !!SRPG.city.st.panel), true, 'backpack: a click opens it on release');
  await ev(() => SRPG.city.closePanel());

  // Flash keyboard focus: Tab walks the buttons in stage order, Enter presses the focused one and
  // repeats while held; 'c' is a keyPress handler, so its key repeat keeps toggling the car.
  await fresh({ mapx: 456, mapy: 630 });
  await ev(() => { SRPG.debug.set({ hp: 1, cash: 100, time: 8 }); SRPG.debug.open('mcsticks'); });
  await page.keyboard.press('Tab');
  eq(await ev(() => document.activeElement.getAttribute('data-id')), 'milkshake', 'Tab: focus on the first button (top left)');
  eq(await ev(() => getComputedStyle(document.activeElement).outlineColor), 'rgb(255, 255, 0)', 'Tab: yellow focus box');
  await page.keyboard.press('Tab');
  const second = await ev(() => document.activeElement.getAttribute('data-id'));
  ok(second && second !== 'milkshake', 'Tab again: the next button (' + second + ')');
  await page.keyboard.down('Shift'); await page.keyboard.press('Tab'); await page.keyboard.up('Shift');
  await page.keyboard.down('Enter');
  await page.keyboard.down('Enter'); // an auto-repeat
  await page.keyboard.up('Enter');
  await new Promise((r) => setTimeout(r, 50));
  eq(await ev(() => [SRPG.game.s.cash, SRPG.game.s.time]), [84, 10], 'held Enter: the focused MILKSHAKE bought twice');
  eq(await ev(() => document.activeElement.getAttribute('data-id')), 'milkshake', 'focus stays on the button after the menu rebuilds');
  await fresh({ mapx: 456, mapy: 630 });
  await ev(() => { SRPG.game.s.items.car = 1; });
  await page.keyboard.down('c');
  await page.keyboard.down('c');
  await page.keyboard.down('c');
  await page.keyboard.up('c');
  eq(await ev(() => SRPG.game.s.driving), 1, "held 'c': three toggles (press + 2 repeats) end in the car");

  await fresh({ mapx: 456, mapy: 630 });
  await t.step(2);
  await t.shot(path.join(OUT, 'core-city.png'));

  const errs = t.errors.filter((e) => !/requestfailed|ERR_FILE_NOT_FOUND/.test(e));
  ok(errs.length === 0, 'no page errors', errs);
  await t.close();
  console.log(failures ? failures + ' FAILED of ' + checks : checks + ' passed, 0 failed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

function SRPG_STOCKS(s) { return Object.keys(s.stocks); }
