// Civic buildings: the bank (deposits, loans, real estate, robbery), New Lines Incorporated (jobs),
// the University of Stick (study / class / gym) and the bus depot (commodity trips).
// Asserts the original's rules, including invalid inputs and time limits, and screenshots every
// screen to $OUT (default: the scratchpad's shots/civic/).
const h = require('./harness.cjs');
const path = require('path');
const fs = require('fs');
const OUT = process.env.OUT ||
  '/tmp/claude-0/-home-user-modern-agents/e8aaa668-44cd-5f53-8561-931f113fdf41/scratchpad/shots/civic';
fs.mkdirSync(OUT, { recursive: true });

let failures = 0;
let passes = 0;
function check(cond, msg) {
  if (cond) passes++;
  else {
    failures++;
    console.log('FAIL: ' + msg);
  }
}
function eq(a, b, msg) {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  check(ok, msg + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');
}

(async () => {
  const t = await h.open({ scale: 2 });
  const { page } = t;
  const shot = (name) => t.shot(path.join(OUT, name + '.png'));
  const ev = (fn, arg) => page.evaluate(fn, arg);
  // Enter a location the way the street does (onEnter runs), then let the fade finish.
  const enter = (id) => ev((id) => { SRPG.location.open(id); SRPG.engine.step(12); }, id);
  const game = async (patch) => {
    await t.newGame(Object.assign({ cash: 500, time: 10, hp: 25, hpmax: 25 }, patch || {}));
  };
  const s = () => t.state();
  const has = (id) => ev((id) => !!document.querySelector('#ui [data-id="' + id + '"]'), id);
  const txt = (id) => ev((id) => { const e = document.querySelector('#ui [data-text="' + id + '"]'); return e ? e.textContent : null; }, id);
  const click = (id) => t.clickUI(id);
  const amount = async (v) => { await page.fill('#ui [data-id="amount"]', v); };
  const scene = () => ev(() => SRPG.engine.sceneName + (SRPG.location.current ? ':' + SRPG.location.current : ''));
  const seed = (n) => ev((n) => SRPG.rng.seed(n), n);
  const black = () => ev(() => SRPG.engine.black);
  // Record the music changes, and count click sounds: the original loads _click.wav but never
  // starts it, so no button may play one.
  await ev(() => {
    window.__music = [];
    window.__clicks = 0;
    const m = SRPG.sound.music, p = SRPG.sound.play;
    SRPG.sound.music = function (n) { window.__music.push(n); return m.apply(this, arguments); };
    SRPG.sound.play = function (n) { if (n === 'click') window.__clicks++; return p.apply(this, arguments); };
  });
  const lastMusic = () => ev(() => window.__music[window.__music.length - 1]);
  // Stage rectangle [left, top, width, CSS width] of the #ui text element whose text is `t` (the
  // bold fallback, without Arial Black, is widened 12% by a transform).
  const rectOf = (t) => ev((t) => {
    const e = Array.from(document.querySelectorAll('#ui div')).find((d) => d.textContent === t);
    if (!e) return null;
    const r = e.getBoundingClientRect(), st = document.getElementById('stage').getBoundingClientRect(), k = 550 / st.width;
    return [(r.left - st.left) * k, (r.top - st.top) * k, r.width * k, e.offsetWidth].map((v) => Math.round(v * 100) / 100);
  }, t);
  const noBlack = await ev(() => !SRPG.hud.fonts().black);
  const near = (a, b, tol, msg) => check(a && b.every((v, i) => v == null || Math.abs(a[i] - v) <= tol), msg + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');
  // Canvas pixel [r, g, b] at stage (x, y): the game canvas, or a canvas in #ui (selector).
  const pixel = (x, y, sel) => ev(([x, y, sel]) => {
    const c = sel ? document.querySelector(sel) : document.getElementById('game');
    const k = c.width / 550;
    return Array.from(c.getContext('2d').getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data.slice(0, 3));
  }, [x, y, sel]);

  // ================================================================ BANK
  await game({ cash: 500, bankcash: 1234, bankrate: 3.5 });
  await enter('bank');
  await shot('bank-main');
  check(await has('deposit') && await has('withdraw') && await has('amount'), 'bank: deposit/withdraw/amount present');
  check(await has('loan') && !(await has('repay')), 'bank: GET A LOAN shown without a loan, REPAY hidden');
  check(!(await has('rob')), 'bank: no ROB without a gun');
  eq(await ev(() => document.querySelector('#ui [data-id="amount"]').maxLength), 7, 'bank: amount field takes 7 characters');
  eq(await ev(() => document.querySelector('#ui [data-id="amount"]').value), '0', 'bank: amount starts at 0');
  eq(await txt('bankcash'), '1234', 'bank: balance shown');
  eq(await txt('cash'), '500', 'bank: cash shown');
  eq(await txt('bankrate'), '3.5', 'bank: rate shown');
  // Text boxes sit where the original's fields put their ink (measured against Ruffle); the bold
  // fallback is widened 12% like the menus, and a sized box keeps its visual width.
  near(await rectOf('AMOUNT:'), [314, 131.75], 0.3, 'bank: AMOUNT: label');
  const rate = await rectOf('CURRENT INTEREST RATE:');
  near(rate, [200, 249], 0.3, 'bank: rate label');
  check(rate && Math.abs(rate[2] - rate[3] * (noBlack ? 1.12 : 1)) < 0.6, 'bank: fallback text widened 12% ' + JSON.stringify(rate));
  near(await rectOf('"Hello, this is the bank.  What can I do for you?"'), [181, 55, 356], 0.3, 'bank: centred quote keeps its 356 px box');

  // deposit
  await amount('200'); await click('deposit');
  let st = await s();
  eq([st.cash, st.bankcash], [300, 1434], 'deposit 200');
  await amount('301'); await click('deposit');
  st = await s();
  eq([st.cash, st.bankcash], [300, 1434], 'deposit more than cash refused');
  await amount('-50'); await click('deposit');
  eq((await s()).cash, 300, 'deposit negative refused');
  await amount('abc'); await click('deposit');
  eq((await s()).cash, 300, 'deposit text refused');
  await amount(''); await click('deposit');
  eq((await s()).cash, 300, 'deposit empty refused');
  await amount('0.5'); await click('deposit');
  eq((await s()).cash, 300, 'deposit 0.5 moves nothing');
  await amount('10.9'); await click('deposit');
  st = await s();
  eq([st.cash, st.bankcash], [290, 1444], 'deposit 10.9 deposits 10 (int)');
  await amount('290'); await click('deposit');
  st = await s();
  eq([st.cash, st.bankcash], [0, 1734], 'deposit everything');
  eq(await ev(() => document.querySelector('#ui [data-id="amount"]').value), '290', 'amount kept after deposit');
  // withdraw
  await amount('1735'); await click('withdraw');
  eq((await s()).bankcash, 1734, 'withdraw more than balance refused');
  await amount('-1'); await click('withdraw');
  eq((await s()).bankcash, 1734, 'withdraw negative refused');
  await amount('0.9'); await click('withdraw');
  eq((await s()).bankcash, 1734, 'withdraw 0.9 refused');
  await amount('x7'); await click('withdraw');
  eq((await s()).bankcash, 1734, 'withdraw text refused');
  await amount('34.99'); await click('withdraw');
  st = await s();
  eq([st.cash, st.bankcash], [34, 1700], 'withdraw 34.99 withdraws 34');
  await amount('1700'); await click('withdraw');
  st = await s();
  eq([st.cash, st.bankcash], [1734, 0], 'withdraw everything');
  // Flash's Number() on the field (checked against the original in Ruffle)
  for (const [v, n] of [[' 5', 5], ['1e2', 100], ['0x10', 16], ['5.', 5], ['.5e1', 5], ['12abc', 0]]) {
    const c0 = (await s()).cash;
    await amount(v); await click('deposit');
    eq((await s()).cash, c0 - n, 'deposit "' + v + '" moves ' + n);
  }
  await amount('9999999'); await click('withdraw');
  await amount('131'); await click('withdraw');
  st = await s();
  eq([st.cash, st.bankcash], [1734, 0], 'Number() round trip');
  // More of Flash's string-to-number (checked in Ruffle): a leading 0 means octal when every digit
  // is 0-7, 0x/0X is hex, leading spaces are skipped but trailing ones are not, no 0b/0o.
  for (const [v, n] of [['010', 8], ['0100', 64], ['09', 9], [' 010', 10], ['0XA', 10], ['0x1F', 31], ['1e+1', 10], ['12e-1', 1],
    ['1.5e1', 15], ['+5', 5], ['5 ', 0], ['0b1', 0], ['0o7', 0], ['0x', 0], ['00x10', 0], ['1e400', 0], ['-.5e1', 0]]) {
    const c0 = (await s()).cash;
    await amount(v); await click('deposit');
    eq((await s()).cash, c0 - n, 'deposit "' + v + '" moves ' + n);
  }
  // int() is a 32-bit conversion: '3e9' wraps to -1294967296, so a DEPOSIT of it pays out
  // $1,294,967,296 and leaves the balance that far negative (the original's exploit, seen in Ruffle).
  await t.set({ cash: 100, bankcash: 50 });
  await amount('3e9'); await click('deposit');
  st = await s();
  eq([st.cash, st.bankcash], [100 + 1294967296, 50 - 1294967296], 'deposit "3e9" wraps through int()');
  await amount('5e9'); await click('withdraw');
  eq((await s()).cash, 100 + 1294967296, 'withdraw "5e9" (int 705032704) refused');
  await t.set({ cash: 1734, bankcash: 0 });
  await ev(() => SRPG.location.g.refresh());
  // rate display like Flash (15 significant digits)
  await t.set({ bankrate: 0.1 + 0.2 });
  await ev(() => SRPG.location.g.refresh());
  eq(await txt('bankrate'), '0.3', 'rate 0.30000000000000004 shows as 0.3');
  await t.set({ bankrate: 3.5 - 0.5 + 0.4 - 0.2 });
  await ev(() => SRPG.location.g.refresh());
  eq(await txt('bankrate'), '3.2', 'drifted rate shows 3.2');

  // loans
  await amount('500');
  await click('loan');
  await shot('bank-loan');
  eq(await ev(() => document.querySelector('#ui [data-id="amount"]').value), '500', 'loan screen keeps the typed amount');
  check(!(await has('leave')), 'loan screen has no LEAVE');
  const cash0 = (await s()).cash;
  for (const bad of ['1001', '0', '-5', 'abc', '0.99', '', '3e9', '1e400']) {
    await amount(bad); await click('ok');
    st = await s();
    eq([st.bankloan, st.bankloandays, st.cash], [0, -1, cash0], 'loan "' + bad + '" refused');
    check(await has('cancel'), 'still on the loan screen after "' + bad + '"');
  }
  eq(await black(), 10, 'a refused loan stays on the loan screen (no fade)');
  await click('cancel');
  eq(await ev(() => document.querySelector('#ui [data-id="amount"]').value), '0', 'amount reset to 0 back at the bank');
  eq(await black(), 1, 'CANCEL goes back to root frame 25, whose script replays the black clip');
  await t.step(12);
  await click('loan');
  await amount('1000.7'); await click('ok');
  st = await s();
  eq([st.bankloan, st.bankloandays, st.cash], [1000, 15, cash0 + 1000], 'loan 1000.7 borrows 1000 for 15 days');
  eq(await black(), 1, 'loan OK: back at the bank, fading in');
  await t.step(12);
  check(await has('repay') && !(await has('loan')), 'after the loan: REPAY shown, GET A LOAN hidden');
  await shot('bank-with-loan');
  await click('repay');
  eq(await txt('bankloan'), '1000', 'repay screen shows the loan');
  eq(await txt('bankloandays'), '15', 'repay screen shows the days left');
  await shot('bank-repay');
  await amount('1001'); await click('ok');
  eq((await s()).bankloan, 1000, 'repay more than the loan refused');
  await t.set({ cash: 50 });
  await amount('100'); await click('ok');
  eq((await s()).bankloan, 1000, 'repay more than cash refused');
  await amount('-10'); await click('ok');
  eq((await s()).bankloan, 1000, 'repay negative refused');
  await amount('3e9'); await click('ok');
  eq((await s()).bankloan, 1000, 'repay "3e9" (negative after int()) refused');
  await amount('50'); await click('ok');
  st = await s();
  eq([st.bankloan, st.bankloandays, st.cash], [950, 15, 0], 'partial repay keeps the deadline');
  eq(await black(), 1, 'repay OK: back at the bank, fading in');
  check(await has('repay'), 'back at the bank after a repayment');
  // overnight: interest on the loan and one day less
  await t.set({ bankrate: 2, cash: 5000 });
  await ev(() => SRPG.game.sleep(false));
  st = await s();
  eq([st.bankloan, st.bankloandays], [969, 14], 'a night adds floor(2%) and takes a day off');
  await enter('bank');
  await click('repay');
  eq(await txt('bankloandays'), '14', 'days left updated');
  await amount('969'); await click('ok');
  st = await s();
  eq([st.bankloan, st.bankloandays], [0, -1], 'paying it all clears the loan');
  check(await has('loan') && !(await has('repay')), 'GET A LOAN offered again');
  // the deadline: at 0 days left the bank's collectors kill you (core sleep)
  await t.set({ bankloan: 100, bankloandays: 1 });
  const out = await ev(() => SRPG.game.sleep(false));
  check(out.dead === true, 'loan unpaid on the last day kills you');

  // real estate
  await game({ cash: 30000, dwelling: 1 });
  await enter('bank');
  await click('realestate');
  await shot('realestate-1');
  for (const id of ['apartment2', 'penthouse', 'mansion', 'castle']) check(await has(id), 'real estate offers ' + id);
  await click('penthouse');
  st = await s();
  eq([st.cash, st.dwelling], [30000, 1], 'penthouse unaffordable');
  await click('apartment2');
  st = await s();
  eq([st.cash, st.dwelling], [5000, 2], 'bigger apartment bought');
  check(!(await has('apartment2')) && await has('penthouse'), 'owned apartment hidden, penthouse still offered');
  await t.set({ cash: 600000 });
  await click('castle');
  st = await s();
  eq([st.cash, st.dwelling], [100000, 5], 'castle bought straight from the bigger apartment');
  for (const id of ['apartment2', 'penthouse', 'mansion', 'castle']) check(!(await has(id)), 'with the castle, ' + id + ' hidden');
  await shot('realestate-5');
  await t.set({ dwelling: 3, cash: 99999 });
  await ev(() => SRPG.location.g.refresh());
  check(!(await has('apartment2')) && !(await has('penthouse')) && await has('mansion') && await has('castle'), 'penthouse owner sees mansion + castle');
  await click('mansion');
  eq((await s()).dwelling, 3, 'mansion needs 100000');
  await t.set({ cash: 100000 });
  await click('mansion');
  st = await s();
  eq([st.cash, st.dwelling], [0, 4], 'mansion for exactly 100000');
  await shot('realestate-3');
  const mx = (await s()).mapx;
  await click('leave');
  eq(await scene(), 'city', 'real estate LEAVE goes to the street');
  eq((await s()).mapx, mx + 8, 'leaving nudges mapx + 8');

  // robbery
  await game({ items: { gun: 1, ammo: 9 } });
  await enter('bank');
  check(!(await has('rob')), 'ROB hidden with 9 bullets');
  await t.set({ items: { gun: 1, ammo: 10 } });
  await ev(() => SRPG.location.g.refresh());
  check(await has('rob'), 'ROB shown with a gun and 10 bullets');
  await shot('bank-rob');
  await t.set({ time: 21 });
  await click('rob');
  st = await s();
  eq([st.time, st.items.ammo, st.day], [21, 10, 1], 'no robbing at 21:00');
  await t.set({ time: 20, charm: 10, gamelength: 0 });
  await click('rob');
  st = await s();
  check(st.time === 24 && st.day === 6 && st.items.ammo >= 1 && st.items.ammo <= 5, 'charm 10: caught, 5 days, rest of day gone, 5-9 bullets used');
  check(await has('ok'), 'jail screen');
  await shot('bank-jail');
  near(await rectOf('YOU GOT CAUGHT!!!'), [97, 113, 356], 0.3, 'jail: title placed as the original\'s (frame 29)');
  const k0 = st.karma;
  await click('ok');
  st = await s();
  eq([st.karma, st.mapx, st.mapy, await scene()], [k0 - 10, 456, 630, 'city'], 'jail OK: -10 karma, back at the start junction');
  eq(await lastMusic(), 'inside', 'jail OK (the store\'s button) leaves the inside music playing on the map');
  // lucky robbery
  await game({ items: { gun: 1, ammo: 30 }, charm: 999, cash: 100 });
  await seed(11);
  await enter('bank');
  await click('rob');
  st = await s();
  const robbed = await ev(() => SRPG.bank.state.robamount);
  check(st.cash === 100 + robbed && robbed >= 0 && robbed < 500 && st.day === 1 && st.time === 24, 'charm 999: got away with ' + robbed);
  eq(await txt('robamount'), String(robbed), 'loot shown');
  await shot('bank-robbed');
  near(await rectOf('YOU DID IT!!!'), [113, 140, 356], 0.3, 'robbed: title placed as the original\'s (frame 28)');
  await click('ok');
  st = await s();
  eq([st.karma, st.mapx, st.mapy], [-10, 456, 630], 'robbery OK: -10 karma, start junction');
  eq(await lastMusic(), 'inside', 'robbery OK leaves the inside music playing on the map, as at the store');
  // jail past the last day ends a timed game
  await game({ items: { gun: 1, ammo: 30 }, charm: 1, gamelength: 15, day: 12 });
  await enter('bank');
  await click('rob');
  await click('ok');
  eq(await ev(() => SRPG.engine.sceneName), 'results', 'jailed past day 15: results screen');
  // leaving mid-screen and coming back always starts at the bank's main screen
  await game({ items: { gun: 1, ammo: 30 }, charm: 999, cash: 100 });
  await enter('bank');
  await click('rob');
  check(await has('ok'), 'robbery result showing');
  await enter('bank');
  check(await has('deposit') && !(await has('ok')), 're-entering the bank shows the main screen');
  await amount('77');
  await click('loan');
  await enter('bank');
  eq(await ev(() => document.querySelector('#ui [data-id="amount"]').value), '0', 're-entering resets AMOUNT');

  // ================================================================ NLI
  await game({ intelligence: 19, job: 1 });
  await enter('nli');
  await shot('nli-job1');
  check(await has('apply') && !(await has('promotion')), 'NLI: APPLY only while at McSticks');
  check(!(await has('work_janitor')), 'NLI: no work button for job 1');
  await click('apply');
  eq((await s()).job, 1, 'apply with 19 intelligence fails');
  eq(await txt('intreq'), '(NEED 20 INTELLIGENCE)', 'fail screen says what is needed');
  await shot('nli-fail');
  await t.step(12);
  await click('ok');
  check(await has('apply'), 'OK returns to the NLI menu');
  eq(await black(), 1, 'OK goes back to root frame 20, whose script replays the black clip');
  const hitAt = (x, y) => ev(([x, y]) => {
    const e = document.elementFromPoint(x, y);
    const b = e && e.closest('[data-id]');
    return b ? b.getAttribute('data-id') : null;
  }, [x, y]);
  for (const [x, y] of [[449, 318], [449, 340], [480, 329]]) {
    check((await hitAt(x, y)) !== 'leave', 'a double click on OK (' + x + ',' + y + ') does not land on LEAVE');
  }
  await t.set({ intelligence: 20 });
  const msgs0 = (await s()).msgs.length;
  await click('apply');
  st = await s();
  eq([st.job, st.karma, st.msgs.length], [2, 1, msgs0 + 1], 'hired as janitor: +1 karma, a voicemail');
  eq([await txt('jobtext'), await txt('wagetext')], ['JANITOR', 'Your pay is now $8 an hour.'], 'congratulations screen');
  await shot('nli-hired');
  // placed as the original's promotion fields (the job title's box stays 217 px wide, centred)
  near(await rectOf('CONGRATULATIONS!\nYOU ARE NOW A:'), [267, 127.5], 0.3, 'congratulations text');
  near(await rectOf('JANITOR'), [250, 208.5, 217], 0.3, 'job title field');
  near(await rectOf('Your pay is now $8 an hour.'), [212, 281, 293], 0.3, 'wage field');
  await t.step(12);
  await click('ok');
  eq(await black(), 1, 'OK after the congratulations fades the lobby in again');
  check(await has('promotion') && await has('work_janitor') && !(await has('apply')), 'janitor: promotion + janitor work');
  // the ladder: need 40/75/120/180/250, one rung per request
  const ladder = [[2, 40, 'MAIL ROOM CLERK', 10, 'work_mail'], [3, 75, 'SALESPERSON', 15, 'work_sales'],
    [4, 120, 'EXECUTIVE', 25, 'work_exec'], [5, 180, 'VICE PRESIDENT', 50, 'work_vice'], [6, 250, 'CEO', 100, 'work_ceo']];
  for (const [job, need, title, wage, workId] of ladder) {
    await t.set({ job, intelligence: need - 1, karma: 0 });
    await ev(() => SRPG.location.g.refresh());
    await click('promotion');
    eq([(await s()).job, await txt('intreq')], [job, '(NEED ' + need + ' INTELLIGENCE)'], 'job ' + job + ' with ' + (need - 1) + ' int: no promotion');
    await click('ok');
    await t.set({ intelligence: need });
    await click('promotion');
    st = await s();
    eq([st.job, st.karma, await txt('jobtext'), await txt('wagetext')], [job + 1, 3, title, 'Your pay is now $' + wage + ' an hour.'],
      'promotion to ' + title);
    await click('ok');
    check(await has(workId), title + ' work button');
  }
  check(!(await has('promotion')), 'CEO: no more promotions');
  await shot('nli-ceo');
  await t.set({ job: 2, intelligence: 999 });
  await ev(() => SRPG.location.g.refresh());
  await click('promotion');
  eq((await s()).job, 3, 'a single request climbs one rung even with 999 intelligence');
  await click('ok');
  for (const j of [8, 9]) {
    await t.set({ job: j });
    await ev(() => SRPG.location.g.refresh());
    const ids = await ev(() => Array.from(document.querySelectorAll('#ui [data-id]')).map((e) => e.getAttribute('data-id')));
    eq(ids, ['leave'], 'job ' + j + ' (politician): nothing to do at NLI');
  }
  // shifts: 6 hours, start before 19:00, 6 x wage, +1 karma (uncapped)
  const pay = { 2: ['work_janitor', 48], 3: ['work_mail', 60], 4: ['work_sales', 90], 5: ['work_exec', 150], 6: ['work_vice', 300], 7: ['work_ceo', 600] };
  for (const j of Object.keys(pay)) {
    await t.set({ job: +j, time: 10, cash: 0, karma: 0 });
    await ev(() => SRPG.location.g.refresh());
    await click(pay[j][0]);
    st = await s();
    eq([st.cash, st.time, st.karma], [pay[j][1], 16, 1], 'job ' + j + ' shift');
  }
  await t.set({ job: 2, time: 18, cash: 0 });
  await ev(() => SRPG.location.g.refresh());
  await click('work_janitor');
  eq([(await s()).cash, (await s()).time], [48, 24], 'a shift can start at 18:00 and end at midnight');
  await t.set({ time: 19, cash: 0 });
  await click('work_janitor');
  eq([(await s()).cash, (await s()).time], [0, 19], 'no shift after 19:00');
  await t.set({ time: 8, karma: 100 });
  await click('work_janitor');
  eq((await s()).karma, 101, 'work karma is not capped (the original skips karmaAdjust)');
  await t.set({ job: 4, time: 10 });
  await ev(() => SRPG.location.g.refresh());
  await shot('nli-sales');
  const nx = (await s()).mapx;
  await click('leave');
  eq([await scene(), (await s()).mapx], ['city', nx + 8], 'NLI LEAVE: street, mapx + 8');

  // ================================================================ U of S
  await game({ intelligence: 10, strength: 10, hpmax: 25, hp: 25, cash: 100, time: 10, karma: 0 });
  await enter('uofs');
  await shot('uofs-main');
  await click('study');
  st = await s();
  eq([st.time, st.karma, st.intelligence], [12, 1, 10], 'study: 2 hours and +1 karma now, intelligence later');
  check(!(await has('study')) && !(await has('leave')), 'buttons hidden during the animation');
  await t.step(8);
  eq((await s()).intelligence, 10, 'study: not yet at frame 9');
  await t.step(1);
  eq((await s()).intelligence, 11, 'study: +1 intelligence at frame 10');
  await shot('uofs-study');
  // The original redraws only the pencil: the student leans over the desk the whole time, head
  // centred at (357.5, 182.5).
  const ANIM = '#ui canvas[data-anim]';
  const isHead = (p) => p[0] < 20 && Math.abs(p[1] - 102) < 20 && Math.abs(p[2] - 204) < 20;
  check(isHead(await pixel(357.5, 182.5, ANIM)) && isHead(await pixel(357.5, 170, ANIM)) && !isHead(await pixel(357.5, 160, ANIM)),
    'study: head low over the desk at frame 10');
  await t.step(13);
  check(isHead(await pixel(357.5, 182.5, ANIM)) && !isHead(await pixel(357.5, 160, ANIM)), 'study: head still there at frame 23');
  await t.step(1);
  check(!(await has('study')), 'animation still running at frame 24');
  await ev(() => { SRPG.sound.unlock(); SRPG.sound.play('work'); });
  await new Promise((r) => setTimeout(r, 600));
  const sndA = await ev(() => SRPG.sound.state());
  await t.step(1);
  check(await has('study'), 'menu back after 25 frames');
  // gotoAndStop(60) also re-runs the frame's LoopB.stop() (a global Sound: every sound stops) and
  // LoopD.start(): inside.mp3 from the top
  const sndB = await ev(() => SRPG.sound.state());
  check(sndA.step > 4 && sndA.sources > 3 && sndB.music === 'inside' && sndB.step <= 4 && sndB.sources <= 6,
    'end of the animation: every sound stops, inside.mp3 starts from the top ' + JSON.stringify([sndA, sndB]));
  eq(await black(), 1, 'the clip\'s gotoAndStop(60) replays the menu frame\'s black clip');
  await click('class');
  st = await s();
  eq([st.time, st.cash, st.karma], [14, 80, 2], 'class: 2 hours, $20, +1 karma');
  await t.step(9);
  eq((await s()).intelligence, 11, 'class: not yet at frame 10');
  await t.step(1);
  eq((await s()).intelligence, 13, 'class: +2 intelligence at frame 11');
  await shot('uofs-class');
  check(isHead(await pixel(355, 192.5, ANIM)), 'class: the head sinks from frame 11');
  // from frame 21 the flattened head lies on the desk top, drawn in front of it
  await t.step(10);
  check(isHead(await pixel(355, 224, ANIM)) && isHead(await pixel(343, 224, ANIM)), 'class: head lying on the desk at frame 21');
  await t.step(4);
  await click('gym');
  await t.step(9);
  eq([(await s()).strength, (await s()).hpmax], [10, 25], 'gym: not yet at frame 10');
  await t.step(1);
  st = await s();
  eq([st.strength, st.hpmax, st.time, st.karma], [11, 26, 16, 3], 'gym: +1 strength, +1 max HP at frame 11');
  await shot('uofs-gym');
  await t.step(12);
  check(!(await has('gym')), 'gym animation still running at frame 23');
  await t.step(1);
  check(await has('gym'), 'gym animation is 24 frames');
  // limits
  await t.set({ cash: 19 });
  await click('class');
  await t.step(30);
  st = await s();
  eq([st.cash, st.time, st.intelligence], [19, 16, 13], 'class needs $20');
  await t.set({ time: 22, cash: 100 });
  await click('study');
  await t.step(30);
  eq([(await s()).time, (await s()).intelligence], [24, 14], 'study allowed at 22:00 (ends at midnight)');
  await t.set({ time: 23 });
  for (const b of ['study', 'class', 'gym']) {
    await click(b);
    await t.step(30);
  }
  st = await s();
  eq([st.time, st.intelligence, st.strength, st.cash], [23, 14, 11, 100], 'nothing at 23:00');
  await t.set({ time: 10, intelligence: 998, strength: 999, hpmax: 1014, karma: 100 });
  await click('class');
  await t.step(30);
  eq((await s()).intelligence, 999, 'class caps intelligence at 999');
  await click('gym');
  await t.step(30);
  st = await s();
  eq([st.strength, st.hpmax, st.karma], [999, 1015, 100], 'gym at 999 strength still adds max HP; karma capped');
  const ux = (await s()).mapy;
  await click('leave');
  eq([await scene(), (await s()).mapy], ['city', ux - 8], 'U of S LEAVE: street, mapy - 8');

  // ================================================================ BUS
  const trip = async (city, patch, seedN) => {
    await game(Object.assign({ time: 0, cash: 1000, strength: 400, charm: 100 }, patch));
    await enter('bus');
    if (seedN != null) await seed(seedN);
    await click('bus_' + city);
    return { st: await s(), trip: await ev(() => SRPG.bus.state.trip), screen: await ev(() => SRPG.bus.state.screen) };
  };
  const prices = { brooklyn: 115, detroit: 100, losangeles: 100, chicago: 115, camden: 130, lasvegas: 130 };
  const T = await ev(() => ({ nothing: SRPG.bus.TEXT.nothing, noPhone: SRPG.bus.TEXT.noPhone, busted: SRPG.bus.TEXT.busted,
    noAmmo: SRPG.bus.TEXT.noAmmo, nobody: SRPG.bus.TEXT.nobody, screwed: SRPG.bus.TEXT.screwed }));
  await game({ time: 0 });
  await enter('bus');
  await shot('bus-depot');
  for (const c of Object.keys(prices)) check(await has('bus_' + c), 'bus to ' + c);
  // The six buttons are placed one by one as in the original: 40 x 36 tiles at their own heights,
  // the three-line labels a little above them.
  const busBox = (id) => ev((id) => {
    const st = document.getElementById('stage').getBoundingClientRect(), k = 550 / st.width;
    const r = document.querySelector('#ui [data-id="' + id + '"] .ico').getBoundingClientRect();
    const l = document.querySelector('#ui [data-id="' + id + '"] .lbl').getBoundingClientRect();
    return [(r.left - st.left) * k, (r.top - st.top) * k, r.width * k, r.height * k, (l.top - st.top) * k].map((v) => Math.round(v * 100) / 100);
  }, id);
  near(await busBox('bus_brooklyn'), [171.5, 142.5, 40, 36, 141.25], 0.3, 'bus: Brooklyn button');
  near(await busBox('bus_detroit'), [171.5, 192, 40, 36, 190.1], 0.3, 'bus: Detroit button');
  near(await busBox('bus_losangeles'), [171.5, 241, 40, 36, 240.4], 0.3, 'bus: Los Angeles button');
  near(await busBox('bus_chicago'), [346.5, 143, 40, 36, 141], 0.3, 'bus: Chicago button');
  near(await busBox('bus_camden'), [345.5, 193, 40, 36, 192.4], 0.3, 'bus: Camden button');
  near(await busBox('bus_lasvegas'), [345.5, 243, 40, 36, 243.6], 0.3, 'bus: Las Vegas button');
  // time and money
  let r = await trip('detroit', { time: 1 });
  eq([r.st.cash, r.screen], [1000, 'depot'], 'bus only leaves at midnight (time 0)');
  r = await trip('detroit', { time: 8 });
  eq([r.st.cash, r.screen], [1000, 'depot'], 'no bus at 8:00');
  for (const c of Object.keys(prices)) {
    r = await trip(c, { cash: prices[c] - 1 });
    eq([r.st.cash, r.screen], [prices[c] - 1, 'depot'], c + ': ticket unaffordable');
    r = await trip(c, { cash: prices[c] });
    eq([r.st.cash, r.trip.summary], [0, T.nothing], c + ': $' + prices[c] + ' ticket, nothing to sell');
  }
  await shot('bus-nothing');
  // no gun: robbed of everything (one of three stories)
  for (const c of Object.keys(prices)) {
    r = await trip(c, { items: { cocaine: 5, gun: 0 }, booze: 3 });
    eq([r.st.cash, r.st.items.cocaine, r.st.booze, r.trip.offer], [0, 0, 0, 0], c + ': unarmed, robbed');
  }
  const stories = new Set();
  for (let n = 0; n < 12; n++) { r = await trip('camden', { items: { cocaine: 5 } }, n); stories.add(r.trip.summary); }
  eq(stories.size, 3, 'three different unarmed-robbery stories');
  await shot('bus-unarmed');
  check([...stories].some((x) => x.indexOf('Camden') >= 0), 'the story names the city');
  // gun without bullets
  r = await trip('chicago', { items: { cocaine: 5, gun: 1, ammo: 0 } });
  eq([r.st.cash, r.st.items.cocaine, r.trip.summary], [0, 0, T.noAmmo], 'empty gun: beaten and robbed');
  await shot('bus-noammo');
  // too weak: strength below the random robbery roll (100 + up to range)
  r = await trip('detroit', { strength: 99, items: { cocaine: 5, gun: 1, ammo: 3, cellPhone: 1 } });
  eq([r.st.cash, r.st.items.cocaine, r.trip.offer], [0, 0, 0], 'strength 99 is always too weak');
  await shot('bus-weak');
  let weakCount = 0;
  for (let n = 0; n < 20; n++) {
    r = await trip('camden', { strength: 210, items: { cocaine: 5, gun: 1, ammo: 3, cellPhone: 1 } }, n);
    if (r.st.cash === 0) weakCount++;
  }
  eq(weakCount, 0, 'Camden (100-210) never beats strength 210');
  weakCount = 0;
  for (let n = 0; n < 30; n++) {
    r = await trip('detroit', { strength: 210, items: { cocaine: 5, gun: 1, ammo: 3, cellPhone: 1 } }, n);
    if (r.st.cash === 0 && r.st.items.cocaine === 0) weakCount++;
  }
  check(weakCount > 0, 'Detroit (100-250) sometimes beats strength 210 (' + weakCount + '/30)');
  // no cell phone: nobody deals, nothing lost but the ticket
  r = await trip('losangeles', { items: { cocaine: 5, gun: 1, ammo: 3, cellPhone: 0 } });
  eq([r.st.cash, r.st.items.cocaine, r.trip.summary], [900, 5, T.noPhone], 'no cell phone');
  await shot('bus-nophone');
  // busted: Brooklyn at 50, the others above 50
  r = await trip('brooklyn', { day: 3, items: { cocaine: 50, gun: 1, ammo: 3, cellPhone: 1 } });
  st = r.st;
  eq([st.day, st.items.cocaine, st.items.gun, st.items.ammo, st.booze, st.cash, r.trip.summary], [8, 0, 0, 0, 0, 885, T.busted],
    'Brooklyn busts 50 grams: 5 days, goods and gun gone');
  await shot('bus-busted');
  r = await trip('brooklyn', { booze: 50, items: { gun: 1, ammo: 3, cellPhone: 1 } });
  eq(r.st.day, 6, 'Brooklyn busts 50 bottles');
  for (const c of ['detroit', 'losangeles', 'chicago', 'camden', 'lasvegas']) {
    r = await trip(c, { items: { cocaine: 50, gun: 1, ammo: 3, cellPhone: 1 } }, 1);
    check(r.st.day === 1 && r.trip.summary !== T.busted, c + ': 50 grams is fine');
    r = await trip(c, { booze: 51, items: { gun: 1, ammo: 3, cellPhone: 1 } }, 1);
    eq([r.st.day, r.trip.summary], [6, T.busted], c + ': 51 bottles busted');
  }
  // the ambush (random(10) == 3) and offers
  const armed = { items: { gun: 1, ammo: 3, cellPhone: 1 } };
  let screwedSeed = -1;
  for (let n = 0; n < 60 && screwedSeed < 0; n++) {
    r = await trip('detroit', Object.assign({ items: { cocaine: 10, gun: 1, ammo: 3, cellPhone: 1 } }), n);
    if (r.trip.summary === T.screwed) screwedSeed = n;
  }
  check(screwedSeed >= 0, 'an ambush happens for some seed');
  if (screwedSeed >= 0) {
    r = await trip('detroit', { booze: 4, items: { cocaine: 10, gun: 1, ammo: 3, cellPhone: 1 } }, screwedSeed);
    eq([r.st.items.cocaine, r.st.booze, r.st.cash, r.trip.offer], [0, 0, 900, 0], 'ambush: stash jacked, money kept');
    await shot('bus-screwed');
  }
  // Detroit / LA want cocaine, Chicago / Camden want booze
  const offers = { detroit: 1, losangeles: 1, chicago: 0, camden: 0 };
  for (const c of Object.keys(offers)) {
    const want = offers[c];
    let offered = 0;
    for (let n = 0; n < 8; n++) {
      r = await trip(c, { booze: 12, items: { cocaine: 10, gun: 1, ammo: 3, cellPhone: 1 } }, n);
      if (r.trip.summary === T.screwed) continue;
      offered++;
      eq([r.trip.which, r.trip.quantity], [want, want ? 10 : 12], c + ' buys ' + (want ? 'cocaine' : 'booze'));
    }
    check(offered > 0, c + ' made offers');
    // only the other commodity: nobody buys
    for (let n = 0; n < 4; n++) {
      r = await trip(c, want ? { booze: 12, items: armed.items } : { items: { cocaine: 10, gun: 1, ammo: 3, cellPhone: 1 } }, n);
      if (r.trip.summary === T.screwed) continue;
      eq([r.trip.offer, r.trip.summary], [0, T.nobody], c + ': nobody wants the other commodity');
    }
  }
  const whichSeen = new Set();
  for (let n = 0; n < 16; n++) {
    r = await trip('lasvegas', { booze: 12, items: { cocaine: 10, gun: 1, ammo: 3, cellPhone: 1 } }, n);
    if (r.trip.offer > 0) whichSeen.add(r.trip.which);
  }
  eq([...whichSeen].sort(), [0, 1], 'Las Vegas buyers want either');
  // prices: cocaine 2 x charm (cap 600) +/- 0..49, at least 50 a gram; booze charm/6 (cap 50) +/- 0..4, at least 5
  const priceCases = [
    ['detroit', { charm: 100 }, 1, 10, 151, 249], ['detroit', { charm: 10 }, 1, 10, 50, 69], ['detroit', { charm: 999 }, 1, 10, 551, 649],
    ['chicago', { charm: 30 }, 0, 12, 5, 9], ['chicago', { charm: 150 }, 0, 12, 21, 29], ['chicago', { charm: 999 }, 0, 12, 46, 54],
  ];
  for (const [c, p, which, q, lo, hi] of priceCases) {
    for (let n = 0; n < 6; n++) {
      r = await trip(c, Object.assign({ booze: 12, items: { cocaine: 10, gun: 1, ammo: 3, cellPhone: 1 } }, p), n);
      if (r.trip.offer === 0) continue;
      const unit = r.trip.offer / q;
      check(unit >= lo - 0.5 / q && unit <= hi + 0.5 / q, c + ' charm ' + p.charm + ': ' + r.trip.offer + ' for ' + q + ' within ' + lo + '-' + hi + ' each');
    }
  }
  // TAKE IT and HEAD BACK
  let seedOffer = 0;
  for (; seedOffer < 40; seedOffer++) {
    r = await trip('detroit', { items: { cocaine: 10, gun: 1, ammo: 3, cellPhone: 1 } }, seedOffer);
    if (r.trip.offer > 0) break;
  }
  check(r.trip.offer > 0, 'got an offer');
  await shot('bus-offer');
  const before = await s();
  await click('takeit');
  st = await s();
  eq([st.cash, st.items.cocaine, st.karma], [before.cash + r.trip.offer, 0, before.karma - 5], 'TAKE IT: paid, goods gone, -5 karma');
  check(!(await has('takeit')), 'TAKE IT can only be used once');
  const newMsgs = st.msgs.length - before.msgs.length;
  eq(newMsgs, st.dealMessages.reduce((a, b) => a + b, 0), 'a new contact at most once (msgs vs dealMessages)');
  await shot('bus-taken');
  const bx = st.mapx;
  await click('headback');
  st = await s();
  eq([await scene(), st.time, st.mapx], ['city', 24, bx + 8], 'HEAD BACK: the day is over, back on the street');
  // every contact calls only once
  let calls = 0;
  await game({ time: 0, cash: 100000, strength: 400, charm: 100, items: { gun: 1, ammo: 3, cellPhone: 1 } });
  for (let n = 0; n < 60; n++) {
    await t.set({ time: 0, items: { cocaine: 10 } });
    await enter('bus');
    await seed(100 + n);
    await click('bus_detroit');
    if (await has('takeit')) await click('takeit');
    await click('headback');
  }
  st = await s();
  calls = st.msgs.length - 1;
  eq([calls, st.dealMessages.reduce((a, b) => a + b, 0)], [calls, calls], 'deal voicemails match dealMessages');
  check(calls <= 5, 'at most five deal voicemails (' + calls + ')');
  // busted near the end of a timed game: HEAD BACK ends it
  r = await trip('brooklyn', { gamelength: 15, day: 12, items: { cocaine: 60, gun: 1, ammo: 3, cellPhone: 1 } });
  eq(r.st.day, 17, 'busted on day 12 -> day 17');
  await click('headback');
  eq(await ev(() => SRPG.engine.sceneName), 'results', 'jail past the last day ends the game');
  // LEAVE the depot
  await game({ time: 0 });
  await enter('bus');
  const lx = (await s()).mapx;
  await click('leave');
  eq([await scene(), (await s()).mapx], ['city', lx + 8], 'bus LEAVE: street, mapx + 8');

  // re-entering resets each building's sub-screen
  await game({ intelligence: 5, time: 10 });
  await enter('nli');
  await click('apply');
  check(!(await has('apply')), 'NLI fail screen');
  await enter('nli');
  check(await has('apply'), 're-entering NLI shows the menu');
  await enter('uofs');
  await click('study');
  check(!(await has('study')), 'study animation running');
  await enter('uofs');
  check(await has('study'), 're-entering U of S shows the menu');
  eq((await s()).intelligence, 5, 'leaving mid-animation forfeits the point (the timeline never reached its frame)');
  await game({ time: 0 });
  await enter('bus');
  await click('bus_detroit');
  check(await has('headback'), 'bus arrival screen');
  await enter('bus');
  check(await has('bus_detroit') && !(await has('headback')), 're-entering the depot shows the depot');
  // the state stays plain JSON with real numbers after all of the above
  const bad = await ev(() => {
    const s = SRPG.game.s;
    const out = [];
    const walk = (o, p) => {
      for (const k of Object.keys(o)) {
        const v = o[k];
        if (typeof v === 'number' && !isFinite(v)) out.push(p + k);
        else if (typeof v === 'function' || v === undefined) out.push(p + k);
        else if (v && typeof v === 'object') walk(v, p + k + '.');
      }
    };
    walk(s, '');
    return out;
  });
  eq(bad, [], 'state holds only finite numbers, strings, arrays and objects');

  eq(await ev(() => window.__clicks), 0, 'no button played a click sound');
  const errs = t.errors.filter((e) => !/requestfailed|ERR_FILE_NOT_FOUND|Failed to load resource/.test(e));
  eq(errs, [], 'no page errors');
  console.log(passes + ' passed, ' + failures + ' failed');
  await t.close();
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
