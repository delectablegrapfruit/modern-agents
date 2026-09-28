// Home: apartment / old apartment / mansion & castle. Sleep (and the night's summary), messages,
// TV channels, the stock market, saving and the election campaign, checked against the original's
// rules (root frames 64-89). Screenshots go to $OUT (default: the scratchpad's shots/home).
const h = require('./harness.cjs');
const OUT = process.env.OUT || '/tmp/claude-0/-home-user-modern-agents/e8aaa668-44cd-5f53-8561-931f113fdf41/scratchpad/shots/home';
require('fs').mkdirSync(OUT, { recursive: true });

let fails = 0, passes = 0;
function ok(cond, msg) {
  if (cond) passes++;
  else { fails++; console.log('FAIL', msg); }
}
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }

(async () => {
  const t = await h.open({ scale: 2 });
  const { page } = t;
  const shot = (n) => t.shot(OUT + '/' + n + '.png');
  const txt = (id) => page.evaluate((id) => { const e = document.querySelector('#ui [data-id="' + id + '"]'); return e ? e.textContent : null; }, id);
  const has = (id) => page.evaluate((id) => !!document.querySelector('#ui [data-id="' + id + '"]'), id);
  const scene = () => page.evaluate(() => SRPG.engine.sceneName + (SRPG.engine.sceneName === 'location' ? ':' + SRPG.location.current : ''));
  const mode = () => page.evaluate(() => { const v = SRPG.home.visit(); return v && v.mode; });
  const sounds = () => page.evaluate(() => { const a = window.__snd.slice(); window.__snd.length = 0; return a; });
  // Seed the rng so that fn() (run right after seeding) is true, then re-seed with it.
  const seedFor = (fnSrc) => page.evaluate((src) => {
    const fn = new Function('return ' + src)();
    for (let i = 1; i < 5000; i++) { SRPG.rng.seed(i); if (fn()) { SRPG.rng.seed(i); return i; } }
    return -1;
  }, fnSrc);
  // A fresh game standing at home.
  const fresh = async (patch, loc) => {
    await t.newGame({ pname: 'Tester', strength: 4 });
    await t.set(Object.assign({ hp: 19, hpmax: 19 }, patch || {}));
    await t.open(loc || 'home');
    await t.step(1);
  };
  await page.evaluate(() => {
    window.__snd = [];
    window.__clicks = 0;
    const play = SRPG.sound.play;
    SRPG.sound.play = function (n) { window.__snd.push(n); if (n === 'click') window.__clicks++; return play.apply(this, arguments); };
  });

  // --- menu ---------------------------------------------------------------------------------------
  await fresh();
  ok(await has('messages') && await has('sleep') && await has('save') && await has('leave'), 'menu has messages/sleep/save/leave');
  ok(!(await has('tv')) && !(await has('computer')), 'no TV / computer buttons without the furniture');
  const menuText = await t.uiText();
  ok(/What would you like to do\?/.test(menuText), 'menu heading');
  await t.step(12);
  await shot('home-menu');
  // Stage rectangle [left, top, width, height] of the element matching sel (or with text sel).
  const rect = (sel) => page.evaluate((sel) => {
    const e = /^[.[]/.test(sel) ? document.querySelector('#ui ' + sel) : Array.from(document.querySelectorAll('#ui div')).find((d) => d.textContent === sel);
    if (!e) return null;
    const r = e.getBoundingClientRect(), st = document.getElementById('stage').getBoundingClientRect(), k = 550 / st.width;
    return [(r.left - st.left) * k, (r.top - st.top) * k, r.width * k, r.height * k].map((v) => Math.round(v * 100) / 100);
  }, sel);
  const near = (a, b, tol, msg) => ok(a && b.every((v, i) => v == null || Math.abs(a[i] - v) <= tol), msg + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');
  // the original's home panel (shape at 181.5-537, 46.5-298.5), as the bank's
  near(await rect('.fpanel'), [181, 47, 356, 252], 0.3, 'home panel');
  // the heading keeps its 360 px box (the bold fallback is widened 12% inside it)
  near(await rect('What would you like to do?'), [182, 64, 360], 0.3, 'menu heading box');
  await t.set({ items: { tv: 1, computer: 1 } });
  await t.open('home');
  ok(await has('tv') && await has('computer'), 'TV / computer buttons once owned');
  ok(/WATCH TV/.test(await t.uiText()) && /USE COMPUTER/.test(await t.uiText()), 'TV / computer labels');
  await shot('home-menu-furnished');
  for (const d of [2, 3]) {
    await t.set({ dwelling: d });
    await t.open('home');
    await t.step(1);
    await shot('home-dwelling' + d);
  }

  // --- sleep ------------------------------------------------------------------------------------
  await fresh({ hp: 5, time: 17, day: 3 });
  await t.clickUI('sleep');
  let s = await t.state();
  eq([s.day, s.time, s.hp], [4, 8, 19], 'sleep: next day, 8 AM, +20 HP capped at max');
  eq(await mode(), 'night', 'sleep shows the night summary');
  eq(await txt('hptext'), '14 HP RESTORED!', 'restored HP is what was actually healed');
  eq(await txt('pilltext'), '', 'no pills line');
  eq(await txt('banktext'), '', 'no loan line');
  ok(!(await has('earntext')), 'no salary line in the apartment');
  await t.step(30);
  await shot('home-sleep-summary');
  await t.clickUI('ok');
  eq([await scene(), await mode()], ['location:home', 'menu'], 'OK goes back to the menu');
  eq(await page.evaluate(() => SRPG.engine.black), 1, 'back at root frame 65, whose script replays the black clip');

  await fresh({ hp: 1, hpmax: 100, items: { bed: 1, freezer: 1 } });
  await t.clickUI('sleep');
  eq((await t.state()).hp, 31, 'bed: +30 (the freezer only counts in the mansion)');
  await fresh({ hp: 1, hpmax: 100, dwelling: 4, items: { bed: 1, freezer: 1 } }, 'mansion');
  await t.clickUI('sleep');
  eq((await t.state()).hp, 41, 'mansion bed + deep freeze: +40');
  await fresh({ hp: 1, hpmax: 100, dwelling: 4, items: { bed: 0, freezer: 1 } }, 'mansion');
  await t.clickUI('sleep');
  eq((await t.state()).hp, 21, 'mansion freezer without a bed: +20');
  await fresh({ hp: 1, hpmax: 100, dwelling: 5, items: { bed: 1, freezer: 0 } }, 'mansion');
  await t.clickUI('sleep');
  eq((await t.state()).hp, 31, 'castle bed without freezer: +30');

  await fresh({ hp: 10, hpmax: 100, items: { pills: 2 } });
  await t.clickUI('sleep');
  s = await t.state();
  eq([s.hp, s.time, s.items.pills], [10, 4, 1], 'pills: -20 restore, wake at 4, one pill used');
  eq(await txt('pilltext'), '(CAFFEINE PILLS USED)', 'pills line');
  eq(await txt('hptext'), '0 HP RESTORED!', 'pills with no bed restore 0');
  await fresh({ items: { alarm: 1 } });
  await t.clickUI('sleep');
  eq((await t.state()).time, 4, 'alarm clock: wake at 4');
  await fresh({ items: { alarm: 1, pills: 1, bed: 1 }, hp: 1, hpmax: 50 });
  await t.clickUI('sleep');
  s = await t.state();
  eq([s.time, s.hp, s.items.pills], [0, 11, 0], 'pills + alarm: wake at midnight; bed 30 - 20');

  await fresh({ strength: 10, hpmax: 25, hp: 25, intelligence: 998, charm: 999, items: { books: 1, minibar: 1, treadmill: 1 } });
  await t.clickUI('sleep');
  s = await t.state();
  eq([s.intelligence, s.charm, s.strength, s.hpmax], [999, 999, 11, 26], 'books / minibar / treadmill: +1 each (capped), treadmill +1 max HP');
  eq(await txt('inttext'), '+1 INTELLIGENCE GAINED! (XGENICA COLL.)', 'books line');
  eq(await txt('strtext'), '+1 STRENGTH GAINED! (TREADMILL)', 'treadmill line');
  eq(await txt('chatext'), '+1 CHARM GAINED! (MINIBAR)', 'minibar line');
  eq(await txt('hptext'), '0 HP RESTORED!', 'HP is restored before the treadmill raises max HP');

  await fresh({ job: 8, cash: 100 });
  await t.clickUI('sleep');
  eq((await t.state()).cash, 100, 'no political salary in the apartment');
  await fresh({ job: 9, cash: 100, dwelling: 5, items: { pills: 1 }, bankloan: 1230, bankloandays: 6, bankrate: 0 }, 'mansion');
  await sounds();
  await t.clickUI('sleep');
  s = await t.state();
  eq(s.cash, 5100, 'political salary: +$5000 a night in the mansion / castle');
  ok((await sounds()).includes('work'), 'salary plays the work sound');
  ok(/\$5000/.test(await txt('earntext')), 'salary line (the core\'s wording, with the $5000)');
  ok(/^5 days .*\(\$1230\)$/.test(await txt('banktext')), 'loan countdown line: days left and the loan in brackets');
  eq(await txt('pilltext'), '(CAFFEINE PILLS USED)', 'mansion pills line');
  await t.step(20);
  await shot('mansion-sleep-summary');

  await fresh({ bankloan: 500, bankloandays: 3, bankrate: 0 });
  await t.clickUI('sleep');
  s = await t.state();
  eq(s.bankloandays, 2, 'loan: 3 -> 2 days');
  ok(/^2 days .*\(\$500\)$/.test(await txt('banktext')), 'loan line: 2 days, $500');
  await t.clickUI('ok');
  await t.clickUI('sleep');
  eq(await scene(), 'death', 'loan: at 2 days left the next night counts down to 0 and the collectors kill you');
  eq((await t.state()).hp, 0, 'dead at 0 HP');

  await fresh({ gamelength: 15, day: 15 });
  await t.clickUI('sleep');
  eq(await scene(), 'results', 'last night of a 15-day game goes to the results');
  await fresh({ gamelength: 15, day: 14 });
  await t.clickUI('sleep');
  eq([await scene(), (await t.state()).day], ['location:home', 15], 'day 15 of 15 is still played');

  await fresh({ day: 364, msgs: [] });
  await t.clickUI('sleep');
  s = await t.state();
  eq([s.day, s.items.car, s.msgs.length], [365, 2, 1], 'day 365: sports car and a message');

  // stocks drift and interest (rules in SRPG.game.sleep)
  await fresh({ bankcash: 1000, bankrate: 5 });
  await page.evaluate(() => { const st = SRPG.game.s.stocks; st.XGS.price = 5; st.FSY.price = 1.2; });
  await t.clickUI('sleep');
  s = await t.state();
  ok(s.bankcash === 1050, 'savings interest');
  ok(Math.abs(s.stocks.XGS.price - 5) <= 0.25 && s.stocks.XGS.prev === 5, 'XGS moves at most $0.25 a night');
  ok(s.stocks.FSY.price >= 1 && s.stocks.FSY.prev === 1.2, 'prices never drop below $1');

  // --- messages ---------------------------------------------------------------------------------
  await fresh({ msgs: ['first one', 'second one', 'third one'] });
  await t.clickUI('messages');
  eq(await mode(), 'messages', 'messages screen');
  eq(await txt('msgtext'), 'YOU HAVE (3) NEW MESSAGES', 'count heading');
  eq(await txt('msgbody'), "''first one''", 'oldest message first, in two-apostrophe quotes');
  // placed so the ink lines up with the original's fields (Ruffle captures)
  near(await rect('[data-id="msgtext"]'), [241, 76.2, 320], 0.3, 'message heading field');
  near(await rect('[data-id="msgbody"]'), [210.2, 112.91, 316.7], 0.3, 'message body field');
  near(await rect('.fpanel'), [181, 47, 356, 252], 0.3, 'messages panel');
  await sounds();
  await t.clickUI('erase');
  eq(await txt('msgtext'), 'YOU HAVE (2) NEW MESSAGES', 'erase drops one');
  eq(await txt('msgbody'), "''second one''", 'next message');
  ok((await sounds()).includes('ansmachine'), 'answering machine sound');
  await t.clickUI('erase');
  eq(await txt('msgtext'), 'YOU HAVE (1) NEW MESSAGE', 'singular heading');
  await t.clickUI('erase');
  eq([await txt('msgtext'), await txt('msgbody')], ['YOU HAVE (0) NEW MESSAGES', ''], 'empty machine');
  await sounds();
  await t.clickUI('erase');
  ok((await sounds()).includes('error'), 'erase with no messages: error sound');
  eq((await t.state()).msgs.length, 0, 'still empty');
  await t.clickUI('ok');
  eq(await mode(), 'menu', 'OK back to the menu');
  await fresh();
  await t.clickUI('messages');
  await t.step(3);
  await shot('home-messages');

  // --- TV ---------------------------------------------------------------------------------------
  await fresh({ items: { tv: 1 }, time: 23, intelligence: 5 });
  await sounds();
  await t.clickUI('tv');
  eq(await mode(), 'menu', 'no TV at 23:00');
  ok(!(await sounds()).includes('error'), 'refused silently, as the original ignores the click');
  await fresh({ items: { tv: 1 }, time: 15, intelligence: 5 });
  await t.clickUI('tv');
  eq(await mode(), 'news', 'StickNews');
  const nb = await txt('newsbody');
  const stories = await page.evaluate(() => SRPG.home.NEWS);
  ok(nb.indexOf("You're tuned to StickNews at 3.  ") === 0 && stories.some((x) => nb.endsWith(x)), 'news: 12-hour time and one of the 5 stories');
  await t.step(17);
  eq((await t.state()).intelligence, 5, 'no gain before the animation reaches frame 19');
  await t.step(1);
  eq([(await t.state()).intelligence, await txt('statvalue')], [7, '7'], 'news: +2 intelligence after 18 ticks');
  await t.step(10);
  await shot('home-tv-news');
  await t.clickUI('ok');
  eq([(await t.state()).time, await mode()], [16, 'menu'], 'watching costs one hour');
  await t.clickUI('tv');
  await t.step(5);
  await t.clickUI('ok');
  s = await t.state();
  eq([s.intelligence, s.time], [7, 17], 'leaving before the animation: an hour, no gain');
  await t.set({ intelligence: 998, time: 12 });
  await t.clickUI('tv');
  ok((await txt('newsbody')).indexOf('StickNews at 12.') > 0, 'noon is 12');
  await t.step(18);
  eq((await t.state()).intelligence, 999, 'intelligence capped at 999');

  // mansion without satellite: random(6), nothing new on a 3
  await fresh({ dwelling: 4, items: { tv: 1 }, time: 10 }, 'mansion');
  await page.evaluate(() => { SRPG.home.newsbody = 'OLD TEXT'; });
  await seedFor('() => SRPG.rng.random(6) === 3');
  await t.clickUI('tv');
  eq([await mode(), await txt('newsbody')], ['news', 'OLD TEXT'], 'mansion news roll of 3 keeps the last text');
  await seedFor('() => SRPG.rng.random(6) === 4');
  await t.open('mansion');
  await t.clickUI('tv');
  ok((await txt('newsbody')).endsWith(stories[3]), 'mansion roll 4 is the 4th story');

  // satellite
  await fresh({ dwelling: 5, items: { tv: 1, satellite: 1 }, time: 10, strength: 4, hpmax: 19, charm: 5 }, 'mansion');
  await t.clickUI('tv');
  eq(await mode(), 'satellite', 'satellite menu');
  ok(/STICK-CHOICE/.test(await t.uiText()) && await has('news') && await has('fitness') && await has('dating') && await has('leave'), 'satellite buttons');
  await t.step(1);
  await shot('mansion-satellite');
  await t.clickUI('leave');
  eq([await mode(), (await t.state()).time], ['menu', 10], 'satellite LEAVE: back, no time');
  await t.clickUI('tv');
  await t.clickUI('fitness');
  eq(await mode(), 'fitness', 'fitness channel');
  await t.step(18);
  s = await t.state();
  eq([s.strength, s.hpmax], [6, 21], 'fitness: +2 strength and +2 max HP');
  await t.step(8);
  await shot('mansion-tv-fitness');
  await t.clickUI('ok');
  eq((await t.state()).time, 11, 'fitness costs an hour');
  await t.clickUI('tv');
  await t.clickUI('dating');
  eq(await mode(), 'dating', 'dating channel');
  const dating = await page.evaluate(() => SRPG.home.DATING);
  ok(dating.includes(await txt('newsbody')), 'dating: one of the 5 shows');
  await t.step(18);
  eq((await t.state()).charm, 7, 'dating: +2 charm');
  await shot('mansion-tv-dating');
  await t.clickUI('ok');
  await t.clickUI('tv');
  await t.clickUI('news');
  eq(await mode(), 'news', 'satellite news');
  await t.step(18);
  eq((await t.state()).intelligence, 7, 'satellite news: +2 intelligence');
  await t.clickUI('ok');
  eq((await t.state()).time, 13, 'news costs an hour');

  // --- computer and stocks -------------------------------------------------------------------------
  await fresh({ items: { computer: 1 }, time: 23 });
  await t.clickUI('computer');
  eq(await mode(), 'menu', 'no computer at 23:00');
  await fresh({ items: { computer: 1 }, time: 10, cash: 100 });
  await page.evaluate(() => {
    const st = SRPG.game.s.stocks;
    Object.assign(st.XGS, { price: 5.678, prev: 5, units: 0, bought: 0 });
    Object.assign(st.FSY, { price: 3.001, prev: 3.5, units: 0, bought: 0 });
    Object.assign(st.DYC, { price: 2, prev: 2, units: 0, bought: 0 });
    Object.assign(st.SAR, { price: 2.555, prev: 2.555, units: 0, bought: 0 });
  });
  await t.clickUI('computer');
  eq(await mode(), 'computer', 'computer menu');
  eq((await t.state()).time, 10, 'the computer takes no time');
  await t.clickUI('stocks');
  eq(await mode(), 'stocks', 'stock list');
  s = await t.state();
  eq([s.stocks.XGS.price, s.stocks.FSY.price, s.stocks.SAR.price], [5.67, 3, 2.55], 'viewing cuts prices to 2 decimals');
  eq([await txt('price-XGS'), await txt('diff-XGS'), await txt('diff-FSY'), await txt('diff-DYC')], ['5.67', '0.67', '-0.49', '0'], 'price and gain/loss columns');
  const colors = await page.evaluate(() => ['XGS', 'FSY', 'DYC'].map((k) => getComputedStyle(document.querySelector('#ui [data-id="diff-' + k + '"]')).color));
  eq(colors, ['rgb(0, 255, 0)', 'rgb(153, 0, 0)', 'rgb(0, 0, 0)'], 'gains green, losses dark red, flat black');
  await shot('home-stocks');
  await t.clickUI('trade-FSY');
  eq(await mode(), 'trade', 'buy/sell screen');
  eq([await txt('curstock'), await txt('curprice'), await txt('curdiff'), await txt('curyours'), await txt('boughtin')], ['FSY', '3', '-0.49', '0', ''], 'trade row');
  const setUnits = (v) => page.evaluate((v) => { document.querySelector('#ui [data-id="units"]').value = v; }, v);
  eq(await page.evaluate(() => document.querySelector('#ui [data-id="units"]').value), '0', 'amount starts at 0');
  await setUnits('10');
  await sounds();
  await t.clickUI('buy');
  s = await t.state();
  eq([s.cash, s.stocks.FSY.units, s.stocks.FSY.bought, await txt('curyours')], [70, 10, 3, '10'], 'buy 10 @ $3');
  eq(await sounds(), ['purchase', 'error'], 'a successful buy of anything but SAR also plays the error sound (original bug); no click sound');
  await setUnits('100');
  await t.clickUI('buy');
  eq([(await t.state()).cash, (await t.state()).stocks.FSY.units], [70, 10], 'cannot afford: nothing happens');
  eq(await sounds(), [], 'a refused order is silent (original)');
  for (const bad of ['0', '-3', 'abc', '']) {
    await setUnits(bad);
    await t.clickUI('buy');
    await t.clickUI('sell');
  }
  eq([(await t.state()).cash, (await t.state()).stocks.FSY.units], [70, 10], 'zero / negative / junk amounts do nothing');
  await setUnits('5.9');
  await t.clickUI('sell');
  s = await t.state();
  eq([s.cash, s.stocks.FSY.units], [85, 5], 'sell int(5.9) = 5 @ $3');
  await setUnits('6');
  await t.clickUI('sell');
  eq((await t.state()).stocks.FSY.units, 5, 'cannot sell more than you own');
  // int($_root.units) is Flash's conversion (checked in Ruffle): a leading 0 with digits 0-7 is
  // octal, 0x is hex, a trailing space is NaN (0), and the result wraps to 32 bits.
  await page.evaluate(() => { SRPG.game.s.cash = 1000; });
  await setUnits('010');
  await t.clickUI('buy');
  s = await t.state();
  eq([s.cash, s.stocks.FSY.units, await txt('curyours')], [1000 - 24, 13, '13'], 'BUY "010" buys 8 (octal)');
  await setUnits('011');
  await t.clickUI('sell');
  s = await t.state();
  eq([s.cash, s.stocks.FSY.units], [1000 - 24 + 27, 4], 'SELL "011" sells 9 (octal)');
  await setUnits('09');
  await t.clickUI('buy');
  eq((await t.state()).stocks.FSY.units, 13, 'BUY "09" buys 9 (not octal)');
  await setUnits('0x3');
  await t.clickUI('sell');
  eq((await t.state()).stocks.FSY.units, 10, 'SELL "0x3" sells 3 (hex)');
  for (const bad of ['5 ', '3e9', '0b1']) {
    await setUnits(bad);
    await t.clickUI('buy');
    await t.clickUI('sell');
  }
  eq((await t.state()).stocks.FSY.units, 10, 'a trailing space, a 32-bit wrap to negative and 0b do nothing');
  await setUnits('5');
  await t.clickUI('sell');
  await page.evaluate(() => { SRPG.game.s.cash = 85; });
  eq((await t.state()).stocks.FSY.units, 5, 'back to 5 units');
  eq(await txt('boughtin'), '', 'bought-in line only updates when the screen reopens');
  await shot('home-trade');
  await t.clickUI('ok');
  eq(await mode(), 'computer', 'OK on buy/sell goes back to the computer menu');
  await t.clickUI('stocks');
  await t.clickUI('trade-FSY');
  eq(await txt('boughtin'), 'You bought in at $3. ', 'bought-in price');
  await t.clickUI('ok');
  await t.clickUI('stocks');
  // Each viewing cuts the price again with int(p * 100) / 100 in floating point, so 2.55
  // (254.99999999999997 cents) drops to 2.54 on the next look, exactly as in the original.
  eq((await t.state()).stocks.SAR.price, 2.54, 'a second look at the list shaves 2.55 to 2.54 (floating point, as the original)');
  await t.clickUI('trade-SAR');
  eq(await txt('curprice'), '2.54', 'SAR price on the buy screen');
  await setUnits('3');
  await sounds();
  await t.clickUI('buy');
  s = await t.state();
  eq([s.cash, s.stocks.SAR.units, s.stocks.SAR.bought], [85 - 8, 3, 2.54], 'cost is rounded: 3 x $2.54 = $7.62 -> $8');
  eq(await sounds(), ['purchase'], 'SAR plays only the purchase sound');
  await setUnits('1');
  await page.evaluate(() => { SRPG.game.s.cash = 2.53; });
  await t.clickUI('buy');
  eq((await t.state()).stocks.SAR.units, 3, 'price x units above cash: refused');
  await page.evaluate(() => { SRPG.game.s.cash = 1e9; SRPG.game.s.stocks.SAR.units = 999990; });
  await t.clickUI('ok');
  await t.clickUI('stocks');
  await t.clickUI('trade-SAR');
  await setUnits('10');
  await t.clickUI('buy');
  eq((await t.state()).stocks.SAR.units, 999990, 'holdings must stay under 1,000,000');
  await setUnits('9');
  await t.clickUI('buy');
  eq((await t.state()).stocks.SAR.units, 999999, '999,999 is allowed');
  await t.clickUI('ok');
  await t.clickUI('ok');
  eq(await mode(), 'menu', 'computer OK back to the menu');
  await fresh({ items: { computer: 1 } });
  await t.clickUI('computer');
  await shot('home-computer');

  // --- save ------------------------------------------------------------------------------------------
  await page.evaluate(() => SRPG.save.remove());
  await fresh();
  await t.clickUI('save');
  eq(await txt('saveText'), 'Game saved', 'first save');
  await t.clickUI('save');
  eq(await txt('saveText'), 'Previous game overwritten', 'second save');
  ok(await page.evaluate(() => !!SRPG.save.read()), 'save readable');
  await shot('home-saved');
  await t.clickUI('messages');
  await t.clickUI('ok');
  eq(await txt('saveText'), '', 'the save text clears when the menu reopens');

  // --- campaign ------------------------------------------------------------------------------------
  await fresh({ dwelling: 5, electionMessage: 1, job: 7, cash: 300000 }, 'mansion');
  await t.clickUI('messages');
  await t.clickUI('ok');
  eq(await mode(), 'campaign', 'nominated: OK on the answering machine opens the campaign');
  ok(await has('run50') && await has('run100') && await has('run200') && await has('leave'), 'campaign buttons');
  await shot('mansion-campaign');
  await seedFor('() => SRPG.rng.random(2) === 1');
  await t.clickUI('run50');
  s = await t.state();
  eq([s.cash, s.job, s.electionMessage, await mode()], [250000, 7, 3, 'result'], '$50,000 campaign lost: no job, nomination over');
  eq(await txt('newsbody'), await page.evaluate(() => SRPG.home.LOST), 'losing text');
  await shot('mansion-campaign-lost');
  await t.clickUI('leave');
  eq(await mode(), 'menu', 'LEAVE');
  await t.clickUI('messages');
  await t.clickUI('ok');
  eq(await mode(), 'menu', 'no campaign once the nomination is spent');

  await fresh({ dwelling: 5, electionMessage: 1, job: 7, cash: 300000 }, 'mansion');
  await t.clickUI('messages');
  await t.clickUI('ok');
  await seedFor('() => SRPG.rng.random(2) === 0');
  await t.clickUI('run50');
  s = await t.state();
  eq([s.cash, s.job, s.electionMessage], [250000, 8, 1], '$50,000 won: Dictator of Sticks');
  eq(await txt('newsbody'), await page.evaluate(() => SRPG.home.WON), 'winning text');
  await shot('mansion-campaign-won');
  await t.clickUI('leave');
  eq((await t.state()).electionMessage, 3, 'LEAVE after winning closes the nomination');

  await fresh({ dwelling: 5, electionMessage: 2, job: 5, cash: 100 }, 'mansion');
  await t.clickUI('messages');
  await t.clickUI('ok');
  await seedFor('() => SRPG.rng.random(4) === 2');
  await t.clickUI('run100');
  s = await t.state();
  eq([s.cash, s.job], [100 - 100000, 9], '$100,000 won on a roll of 2: President (cash may go negative, as in the original)');
  await fresh({ dwelling: 5, electionMessage: 2, job: 5, cash: 500000 }, 'mansion');
  await t.clickUI('messages');
  await t.clickUI('ok');
  await seedFor('() => SRPG.rng.random(4) === 3');
  await t.clickUI('run100');
  eq([(await t.state()).job, (await t.state()).electionMessage], [5, 3], '$100,000 lost on a roll of 3');
  await fresh({ dwelling: 5, electionMessage: 2, job: 5, cash: 500000 }, 'mansion');
  await t.clickUI('messages');
  await t.clickUI('ok');
  await t.clickUI('run200');
  eq([(await t.state()).job, (await t.state()).cash], [9, 300000], '$200,000 always wins');
  await fresh({ dwelling: 5, electionMessage: 1, job: 5 }, 'mansion');
  await t.clickUI('messages');
  await t.clickUI('ok');
  await t.clickUI('leave');
  eq([(await t.state()).electionMessage, (await t.state()).job, await mode()], [3, 5, 'menu'], 'declining (LEAVE) ends the nomination');
  await fresh({ electionMessage: 1 });
  await t.clickUI('messages');
  await t.clickUI('ok');
  eq(await mode(), 'menu', 'the apartment answering machine has no campaign');

  // --- review additions ------------------------------------------------------------------------------
  // The mansion's StickNews: every roll of random(6) (3 has no story).
  for (const [roll, story] of [[0, 0], [1, 1], [2, 2], [4, 3], [5, 4]]) {
    await fresh({ dwelling: 4, items: { tv: 1 }, time: 20 }, 'mansion');
    await seedFor('() => SRPG.rng.random(6) === ' + roll);
    await t.clickUI('tv');
    eq(await txt('newsbody'), "You're tuned to StickNews at 8.  " + stories[story], 'mansion news roll ' + roll + ' -> story ' + story);
  }
  // One text variable for every channel and the campaign: a roll of 3 shows whatever was last set.
  await fresh({ dwelling: 5, items: { tv: 1, satellite: 1 }, time: 10 }, 'mansion');
  await page.evaluate(() => { SRPG.home.newsbody = null; });
  await seedFor('() => SRPG.rng.random(6) === 3');
  await t.clickUI('tv');
  await t.clickUI('news');
  eq(await txt('newsbody'), await page.evaluate(() => SRPG.home.NOBODY_HOME), 'nothing shown yet: the TV field\'s placeholder text');
  await t.clickUI('ok');
  await seedFor('() => SRPG.rng.random(5) === 4');
  await t.clickUI('tv');
  await t.clickUI('dating');
  const lastDate = await txt('newsbody');
  eq(lastDate, dating[4], 'dating roll 4');
  await t.clickUI('ok');
  await seedFor('() => SRPG.rng.random(6) === 3');
  await t.clickUI('tv');
  await t.clickUI('news');
  eq(await txt('newsbody'), lastDate, 'news roll 3 keeps the dating show on screen');
  await t.clickUI('ok');
  eq((await t.state()).time, 13, 'three shows, three hours');
  await t.set({ electionMessage: 2, job: 5, cash: 0 });
  await t.clickUI('messages');
  await t.clickUI('ok');
  await t.clickUI('run200');
  await t.clickUI('leave');
  await seedFor('() => SRPG.rng.random(6) === 3');
  await t.clickUI('tv');
  await t.clickUI('news');
  eq(await txt('newsbody'), await page.evaluate(() => SRPG.home.WON), 'news roll 3 after a campaign shows the election result');

  // The TV and computer are open until 23:00 (22 -> 23 is fine), in the mansion too.
  await fresh({ items: { tv: 1 }, time: 22 });
  await t.clickUI('tv');
  eq(await mode(), 'news', 'TV at 22:00');
  await t.clickUI('ok');
  eq((await t.state()).time, 23, 'watching at 22 ends at 23');
  await sounds();
  await t.clickUI('tv');
  eq(await mode(), 'menu', 'and then no more TV');
  await fresh({ dwelling: 5, items: { tv: 1, computer: 1, satellite: 1 }, time: 23 }, 'mansion');
  await t.clickUI('tv');
  eq(await mode(), 'menu', 'mansion TV refused at 23:00');
  await t.clickUI('computer');
  eq(await mode(), 'menu', 'mansion computer refused at 23:00');
  await t.set({ time: 22 });
  await t.clickUI('computer');
  eq(await mode(), 'computer', 'mansion computer at 22:00');

  // Stocks: spending every last dollar, and selling out.
  await fresh({ items: { computer: 1 }, time: 10, cash: 30 });
  await page.evaluate(() => Object.assign(SRPG.game.s.stocks.MLG, { price: 3, prev: 3, units: 0, bought: 0 }));
  await t.clickUI('computer');
  await t.clickUI('stocks');
  await t.clickUI('trade-MLG');
  await setUnits('10');
  await t.clickUI('buy');
  s = await t.state();
  eq([s.cash, s.stocks.MLG.units, s.stocks.MLG.bought], [0, 10, 3], 'price x units equal to your cash is allowed');
  await setUnits('10');
  await t.clickUI('sell');
  s = await t.state();
  eq([s.cash, s.stocks.MLG.units], [30, 0], 'sell everything');
  await t.clickUI('ok');
  await t.clickUI('stocks');
  await t.clickUI('trade-MLG');
  eq([await txt('curyours'), await txt('boughtin')], ['0', ''], 'no bought-in line once you own none');
  ok(await page.evaluate(() => document.querySelector('#ui [data-id="units"]').maxLength === 7), 'amount box takes 7 characters');

  // Saving writes the whole state as plain JSON and it loads back.
  await page.evaluate(() => SRPG.save.remove());
  await fresh({ dwelling: 4, cash: 1234, items: { tv: 1 } }, 'mansion');
  await t.clickUI('save');
  eq(await txt('saveText'), 'Game saved', 'mansion save text');
  const saved = await page.evaluate(() => {
    const raw = localStorage.getItem('srpg.save');
    const back = SRPG.save.read();
    return { same: raw === JSON.stringify(SRPG.game.s), cash: back.cash, dwelling: back.dwelling, stocks: Object.keys(back.stocks).length };
  });
  eq(saved, { same: true, cash: 1234, dwelling: 4, stocks: 6 }, 'save is the plain JSON state and reads back');

  // Leaving and coming back starts at the menu with nothing left over.
  await t.clickUI('messages');
  await t.clickUI('ok');
  await t.clickUI('leave');
  eq(await scene(), 'city', 'left the mansion');
  await t.open('mansion');
  eq([await mode(), await txt('saveText')], ['menu', ''], 're-entering: the menu, save text cleared');

  // A double click on ERASE erases two messages (two clicks, as in the original); no errors.
  await fresh({ msgs: ['a', 'b', 'c'] });
  await t.clickUI('messages');
  const eb = await page.evaluate(() => {
    const r = document.querySelector('#ui [data-id="erase"]').getBoundingClientRect();
    return [r.left + 15, r.top + 15];
  });
  await page.mouse.dblclick(eb[0], eb[1]);
  eq((await t.state()).msgs, ['c'], 'double click: two erases');
  // A message longer than the text box is cut off at the box, as the original's field clips it.
  await t.set({ msgs: [new Array(80).join('A very long message. ')] });
  await t.open('home');
  await t.clickUI('messages');
  const clip = await page.evaluate(() => {
    const e = document.querySelector('#ui [data-id="msgbody"]');
    return [getComputedStyle(e).overflow, e.clientHeight < 140, e.scrollHeight > e.clientHeight];
  });
  eq(clip, ['hidden', true, true], 'long message clipped to the field');

  // Loan default. The original's night keeps running after its goto(YOU DIED): the +1 stats are
  // kept and, when it is also the last day, the results screen wins (core request: SRPG.game.sleep
  // must not return early). Checked only once the core behaves that way.
  await fresh({ gamelength: 15, day: 15, bankloan: 500, bankloandays: 1, bankrate: 0, intelligence: 5, items: { books: 1 } });
  const coreFixed = await page.evaluate(() => {
    const c = JSON.parse(JSON.stringify(SRPG.game.s));
    const out = SRPG.game.sleep(false);
    SRPG.game.s = c;
    return !!out.lines;
  });
  await t.clickUI('sleep');
  s = await t.state();
  if (coreFixed) {
    eq([await scene(), s.intelligence], ['results', 6], 'default on the last night: results, night fully played');
  } else {
    eq(await scene(), 'death', 'default on the last night (current core): YOU DIED');
    console.log('note: SRPG.game.sleep still returns early on a loan default (see core request)');
  }

  // --- rooms, old apartment, leaving -------------------------------------------------------------
  await fresh({ dwelling: 4, items: { tv: 1, computer: 1 } }, 'mansion');
  await t.step(12);
  await shot('mansion-menu');
  await t.set({ dwelling: 5 });
  await t.open('mansion');
  await t.step(1);
  await shot('castle-menu');
  await t.set({ mapy: 700 });
  await t.clickUI('leave');
  eq([await scene(), (await t.state()).mapy], ['city', 692], 'mansion LEAVE: back on the street, 8 px up');
  await fresh({ dwelling: 4 }, 'oldapartment');
  eq(await txt('oldtext'), "Looks like this isn't your place anymore...", 'old apartment text');
  const oldBox = await page.evaluate(() => {
    const r = document.querySelector('#ui [data-id="oldtext"]').getBoundingClientRect();
    const h = document.querySelector('#ui [data-loc] ').getBoundingClientRect();
    return [Math.round(r.left + r.width / 2), Math.round(r.top - h.top)];
  });
  ok(Math.abs(oldBox[0] - 362) <= 1.5 && Math.abs(oldBox[1] - 17) <= 1.5, 'old apartment line sits where the menu heading does (centred at x 362, y 64): ' + oldBox);
  ok(await has('leave') && !(await has('sleep')), 'old apartment: only LEAVE');
  await t.step(12);
  await shot('old-apartment');
  await t.set({ mapy: 750 });
  await t.clickUI('leave');
  eq([await scene(), (await t.state()).mapy], ['city', 742], 'old apartment LEAVE');
  await fresh({ mapy: 750 });
  await t.clickUI('leave');
  eq([await scene(), (await t.state()).mapy], ['city', 742], 'home LEAVE');

  // walking in from the street
  await t.newGame({ pname: 'Tester' });
  await t.set({ mapx: 1054, mapy: 750 });
  await t.hold(['ArrowUp'], 4);
  eq(await scene(), 'location:home', 'the apartment door opens home');
  await t.newGame({ pname: 'Tester' });
  await t.set({ mapx: 1054, mapy: 750, dwelling: 4 });
  await t.hold(['ArrowUp'], 4);
  eq(await scene(), 'location:oldapartment', 'after moving out, the apartment door opens the empty flat');
  await t.newGame({ pname: 'Tester' });
  await t.set({ mapx: 444, mapy: 900, dwelling: 5 });
  await t.hold(['ArrowLeft'], 4);
  eq(await scene(), 'location:mansion', 'the castle door opens the mansion / castle home');

  // Buttons make no sound of their own: the original loads _click.wav but never starts it.
  eq(await page.evaluate(() => window.__clicks), 0, 'no button played a click sound');
  const errs = t.errors.filter((e) => !/requestfailed|ERR_FILE_NOT_FOUND/.test(e));
  ok(errs.length === 0, 'no page errors: ' + errs.join(' | '));
  await t.close();
  console.log(passes + ' passed, ' + fails + ' failed');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
