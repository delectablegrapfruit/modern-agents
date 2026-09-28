// Silver Lining Casino: menu, SUPER SLOTS 3000, blackjack and roulette rules (the original's root
// frames 40-43), plus screenshots of every screen/state. Screenshots go to $OUT (default: tmp dir).
//   OUT=/path/to/shots node tests/casino.cjs
const h = require('./harness.cjs');
const os = require('os');
const path = require('path');
const OUT = process.env.OUT || os.tmpdir();

let failures = 0;
let passes = 0;
function check(cond, msg) {
  if (cond) passes++;
  else { failures++; console.log('FAIL: ' + msg); }
}
function eq(a, b, msg) { check(a === b, msg + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }

(async () => {
  const t = await h.open({ scale: 2 });
  const { page } = t;
  const shot = (name) => t.shot(path.join(OUT, name + '.png'));
  const scene = () => page.evaluate(() => SRPG.engine.sceneName + (SRPG.engine.sceneName === 'location' ? ':' + SRPG.location.current : ''));
  const ev = (fn, arg) => page.evaluate(fn, arg);
  // Queue the values SRPG.rng.random(n) returns (then back to the real generator).
  const forceRandom = (vals) => ev((vals) => {
    if (!SRPG.rng._real) SRPG.rng._real = SRPG.rng.random;
    const q = vals.slice();
    SRPG.rng.random = function (n) { return q.length ? q.shift() : SRPG.rng._real(n); };
  }, vals);
  const hasUI = (id) => ev((id) => !!document.querySelector('#ui [data-id="' + id + '"]'), id);

  // ------------------------------------------------------------------------------------------
  // Casino menu
  await t.newGame({ cash: 100, hp: 14, hpmax: 25, karma: 0, time: 8 });
  // walk into the door (mapx reaching 447 with mapy in -511..-467), as on the map
  await t.set({ mapx: 440, mapy: -490 });
  await t.hold(['ArrowLeft'], 6);
  eq(await scene(), 'location:casino', 'walking into the casino door opens the casino');
  await t.step(12);
  for (const id of ['slots', 'blackjack', 'roulette', 'leave']) check(await hasUI(id), 'menu has ' + id);
  const menuText = await t.uiText();
  check(/PLAY SLOTS/.test(menuText) && /PLAY BLACKJACK/.test(menuText) && /PLAY ROULETTE/.test(menuText), 'menu labels');
  check(/Silver Lining Casino/.test(menuText), 'greeting names the casino');
  await shot('casino-menu');
  await t.clickUI('leave');
  eq(await scene(), 'city', 'LEAVE goes back to the street');
  const mx = (await t.state()).mapx;
  check(mx >= 438 && mx <= 440, 'LEAVE nudges mapx - 8 from the door (the original: mapx = mapx - 8) ' + mx);
  eq((await t.state()).time, 8, 'no time passes in the casino');

  // ------------------------------------------------------------------------------------------
  // SUPER SLOTS 3000
  await t.set({ cash: 100, karma: 0 });
  await t.open('casino');
  await t.clickUI('slots');
  eq(await scene(), 'slots', 'PLAY SLOTS opens the machine');
  let sm = await ev(() => SRPG.slots.state);
  eq(sm.bet, 5, 'machine starts on $5');
  eq(sm.textwin, 0, 'WINNINGS starts at 0');
  await t.step(2);
  await shot('slots-idle');

  // One pull with forced symbols (random(3) at frames 31, 39, 46 -> sym = value + 1).
  async function pull(syms, betId) {
    if (betId) await t.clickUI(betId);
    await forceRandom(syms.map((v) => v - 1));
    const before = await t.state();
    await t.clickUI('handle');
    const after = await t.state();
    return { before, after };
  }
  // $$$ pays x15
  let r = await pull([1, 1, 1]);
  eq(r.after.cash, 95, 'pull takes the $5 bet');
  eq(r.after.karma, -1, 'pull costs 1 karma');
  sm = await ev(() => SRPG.slots.state);
  eq(sm.playing, true, 'machine runs after the pull');
  await t.step(1);
  eq((await ev(() => SRPG.slots.state)).betlock, 1, 'bets lock on frame 3');
  await t.step(20);
  await shot('slots-spinning');
  await t.clickUI('bet100');
  eq((await ev(() => SRPG.slots.state)).bet, 5, 'bet buttons are locked while spinning');
  await t.clickUI('handle');
  eq((await t.state()).cash, 95, 'handle does nothing while the reels spin');
  await t.step(23); // frame 46: nothing paid yet
  eq((await t.state()).cash, 95, 'no payout before frame 47');
  await t.step(1); // frame 47
  eq((await t.state()).cash, 95 + 75, '$$$ pays bet x15 on frame 47');
  eq((await ev(() => SRPG.slots.state)).textwin, 75, 'WINNINGS shows 75');
  await t.step(8); // frame 55 -> idle
  sm = await ev(() => SRPG.slots.state);
  eq(sm.playing, false, 'machine stops after frame 55');
  eq(sm.betlock, 0, 'bets unlock after the spin');
  eq(sm.reels.map((x) => x.f).join(','), '1,1,1', 'reels rest on the dollar frames');
  await shot('slots-win');

  const table = [
    [[2, 2, 2], 5, 'three cherries pay x5'],
    [[3, 3, 3], 2, 'three dead faces pay x2'],
    [[1, 1, 2], 0, 'two dollars pay nothing'],
    [[2, 2, 1], 0, 'two cherries pay nothing'],
    [[1, 2, 3], 0, 'mixed pays nothing'],
    [[3, 3, 1], 0, 'two dead faces pay nothing'],
  ];
  for (const [syms, mult, msg] of table) {
    await t.set({ cash: 1000 });
    await pull(syms);
    await t.step(60);
    eq((await t.state()).cash, 1000 - 5 + 5 * mult, msg);
    eq((await ev(() => SRPG.slots.state)).textwin, 5 * mult, msg + ' (WINNINGS)');
  }
  sm = await ev(() => SRPG.slots.state);
  eq(sm.reels.map((x) => x.f).join(','), '5,5,1', 'reels rest on the frames of their symbols (dead, dead, $)');
  // $25 and $100 bets
  await t.set({ cash: 1000 });
  await pull([1, 1, 1], 'bet25');
  eq((await ev(() => SRPG.slots.state)).bet, 25, '25 button picks $25');
  await t.step(60);
  eq((await t.state()).cash, 1000 - 25 + 375, '$25 x15');
  await t.set({ cash: 1000 });
  await pull([2, 2, 2], 'bet100');
  await t.step(60);
  eq((await t.state()).cash, 1000 - 100 + 500, '$100 cherries x5');
  await t.clickUI('bet5');
  eq((await ev(() => SRPG.slots.state)).bet, 5, '5 button picks $5 again');
  // not enough cash
  await t.set({ cash: 4, karma: 10 });
  await t.clickUI('handle');
  eq((await t.state()).cash, 4, 'cash < bet: the pull is ignored');
  eq((await t.state()).karma, 10, 'ignored pull costs no karma');
  eq((await ev(() => SRPG.slots.state)).playing, false, 'ignored pull does not spin');
  await t.set({ cash: 5 });
  await forceRandom([2, 1, 0]);
  await t.clickUI('handle');
  eq((await t.state()).cash, 0, 'cash == bet is enough');
  await t.step(60);
  eq((await t.state()).cash, 0, 'losing spin pays nothing');
  // leaving mid-spin abandons the spin
  await t.set({ cash: 50 });
  await forceRandom([0, 0, 0]);
  await t.clickUI('handle');
  await t.step(10);
  await t.clickUI('leave');
  eq(await scene(), 'location:casino', 'slots LEAVE returns to the casino menu');
  await t.step(60);
  eq((await t.state()).cash, 45, 'leaving mid-spin forfeits the bet');
  eq((await t.state()).time, 8, 'slots take no time');

  // ------------------------------------------------------------------------------------------
  // Blackjack
  await t.set({ cash: 100, karma: 0 });
  await t.clickUI('blackjack');
  eq(await scene(), 'blackjack', 'PLAY BLACKJACK opens the table');
  await t.step(2);
  await shot('blackjack-bet');
  const bj = () => ev(() => { const b = SRPG.blackjack.state; return JSON.parse(JSON.stringify(b)); });
  await t.clickUI('chip500');
  eq((await bj()).bet, 0, '$500 chip needs cash > 499');
  await t.clickUI('chip100');
  eq((await bj()).bet, 100, '$100 chip with exactly $100 (cash > 99)');
  eq((await t.state()).cash, 0, 'chips take the cash');
  await t.clickUI('chip5');
  eq((await bj()).bet, 100, 'no cash: chip ignored');
  await t.clickUI('chip0');
  eq((await bj()).bet, 0, '0 chip returns the bet');
  eq((await t.state()).cash, 100, '0 chip refunds');
  await t.clickUI('chip25');
  await t.clickUI('chip5');
  eq((await bj()).bet, 30, 'chips add up');
  await t.clickUI('leave');
  eq(await scene(), 'location:casino', 'blackjack LEAVE returns to the menu');
  eq((await t.state()).cash, 100, 'LEAVE refunds the bet');
  await t.clickUI('blackjack');

  // hand(cards, bet, actions) -> { text, cash delta }. cards: [value 1-13, suit 1-4] x8
  async function hand(cards, bet, actions, name) {
    await t.set({ cash: 1000 });
    const chips = { 5: 'chip5', 25: 'chip25', 100: 'chip100', 500: 'chip500' };
    let left = bet;
    for (const v of [500, 100, 25, 5]) while (left >= v) { await t.clickUI(chips[v]); left -= v; }
    await ev((c) => SRPG.blackjack.force(c), cards);
    await t.clickUI('deal');
    for (const a of actions) await t.clickUI(a);
    await t.step(2);
    if (name) await shot(name);
    const st = await bj();
    const cash = (await t.state()).cash;
    if (st.ok) await t.clickUI('ok');
    return { text: st.text, delta: cash - 1000, st };
  }
  const C = (v, s) => [v, s || 2];
  // player 10+7=17 stands; dealer 10+8=18
  r = await hand([C(10), C(7), C(2), C(3), C(10), C(8), C(5), C(5)], 50, ['stand'], 'blackjack-dealer-win');
  eq(r.text, 'DEALER WIN', 'dealer 18 beats 17');
  eq(r.delta, -50, 'dealer win: bet lost');
  // player 19 vs dealer 17 (stands on 17)
  r = await hand([C(10), C(9), C(2), C(3), C(10), C(7), C(5), C(5)], 50, ['stand']);
  eq(r.text, 'PLAYER WIN', '19 beats 17');
  eq(r.delta, 50, 'player win pays 2x (net +bet)');
  eq(r.st.dcards, 2, 'dealer stands on 17');
  // push
  r = await hand([C(10), C(8), C(2), C(3), C(12), C(8), C(5), C(5)], 50, ['stand'], 'blackjack-push');
  eq(r.text, 'PUSH', '18 vs 18 push');
  eq(r.delta, 0, 'push returns the bet');
  // dealer bust: 10+6 draws a 10
  r = await hand([C(10), C(7), C(2), C(3), C(10), C(6), C(13), C(5)], 50, ['stand'], 'blackjack-dealer-bust');
  eq(r.text, 'DEALER BUST!', 'dealer 26 busts');
  eq(r.delta, 50, 'dealer bust pays 2x');
  // player bust
  await t.set({ cash: 1000 });
  await t.clickUI('chip25');
  await ev((c) => SRPG.blackjack.force(c), [C(10, 3), C(6, 4), C(10, 1), C(3), C(10), C(9), C(5), C(5)]);
  await t.clickUI('deal');
  await t.step(1);
  await shot('blackjack-dealt');
  check(await hasUI('hit') && await hasUI('stand'), 'HIT ME! and STAND after the deal');
  check(!(await hasUI('leave')) && !(await hasUI('deal')), 'no LEAVE/DEAL during a hand');
  check(!(await hasUI('chip100')), 'chips are dead during a hand');
  await t.clickUI('hit');
  let st = await bj();
  eq(st.text, 'BUST!', '10+6+10 busts');
  eq(st.show['10'], false, 'bust reveals the dealer card');
  check(!(await hasUI('hit')), 'HIT ME! gone after a bust');
  check(await hasUI('ok'), 'OK after a bust');
  await t.step(1);
  await shot('blackjack-bust');
  eq((await t.state()).cash, 975, 'bust loses the bet');
  await t.clickUI('ok');
  st = await bj();
  eq(st.phase, 'bet', 'OK goes back to betting');
  eq(st.bet, 0, 'OK resets BET to 0');
  // four-card limit
  await t.set({ cash: 1000 });
  await t.clickUI('chip5');
  await ev((c) => SRPG.blackjack.force(c), [C(2), C(3), C(4), C(5), C(10), C(9), C(8), C(8)]);
  await t.clickUI('deal');
  await t.clickUI('hit');
  eq((await bj()).pcards, 3, 'first hit: card 3');
  await t.step(1);
  await shot('blackjack-hit');
  await t.clickUI('hit');
  st = await bj();
  eq(st.pcards, 4, 'second hit: card 4');
  eq(st.phand, 14, '2+3+4+5');
  await t.clickUI('hit');
  st = await bj();
  eq(st.pcards, 4, 'a third hit draws nothing (4-card limit)');
  eq(st.phand, 14, 'hand unchanged by the extra hit');
  await t.step(1);
  await shot('blackjack-four-cards');
  await t.clickUI('stand');
  st = await bj();
  eq(st.text, 'DEALER WIN', '14 loses to 19');
  await t.clickUI('ok');
  // soft hand: A+5, hit 10 -> 16
  r = await hand([C(1), C(5), C(10), C(3), C(10), C(7), C(5), C(5)], 5, ['hit', 'stand']);
  eq(r.st.phand, 16, 'ace drops to 1 after a hit');
  eq(r.text, 'DEALER WIN', '16 loses to 17');
  // natural pays like any win
  r = await hand([C(1), C(13), C(2), C(3), C(10), C(7), C(5), C(5)], 100, ['stand'], 'blackjack-natural');
  eq(r.text, 'PLAYER WIN', 'A+K wins');
  eq(r.delta, 100, 'blackjack pays 2x like any win (no 3:2)');
  // dealer A+6 soft 17 stands
  r = await hand([C(10), C(8), C(2), C(3), C(1), C(6), C(5), C(5)], 5, ['stand']);
  eq(r.st.dcards, 2, 'dealer stands on soft 17');
  eq(r.text, 'PLAYER WIN', '18 beats soft 17');
  // dealer A+5 draws 10 -> 26 -> ace reduced to 16 and stands there
  r = await hand([C(10), C(7), C(2), C(3), C(1), C(5), C(10), C(10)], 5, ['stand']);
  eq(r.st.dhand, 16, 'dealer reduces the ace after drawing and stands on 16');
  eq(r.st.dcards, 3, 'dealer drew one card');
  eq(r.text, 'PLAYER WIN', '17 beats the stuck 16');
  // dealer draws at most two cards
  r = await hand([C(10), C(2), C(2), C(3), C(2), C(3), C(2), C(3)], 5, ['stand'], 'blackjack-dealer-four');
  eq(r.st.dcards, 4, 'dealer drew two cards');
  eq(r.st.dhand, 10, 'dealer stops at four cards (10)');
  eq(r.text, 'PLAYER WIN', '12 beats a 4-card 10');
  // player A+A stands on 22 (no ace reduction without a hit)
  r = await hand([C(1), C(1), C(2), C(3), C(10), C(9), C(5), C(5)], 5, ['stand']);
  eq(r.st.phand, 22, 'A+A stands as 22');
  eq(r.text, 'PLAYER WIN', '22 beats 19 (original quirk)');
  // dealer A+A = 22 never draws, becomes 12
  r = await hand([C(10), C(3), C(2), C(3), C(1), C(1), C(10), C(10)], 5, ['stand']);
  eq(r.st.dhand, 12, 'dealer A+A becomes 12 without drawing');
  eq(r.text, 'PLAYER WIN', '13 beats 12');
  // A+A vs a busted 22: DEALER BUST then PUSH (paid 3x)
  r = await hand([C(1), C(1), C(2), C(3), C(10), C(6), C(6), C(5)], 10, ['stand']);
  eq(r.text, 'PUSH', 'a 22 against a busted 22 ends on PUSH');
  eq(r.delta, 20, '...having paid 2x and then 1x (original quirk)');
  // $0 hand is allowed; blackjack costs no karma
  await t.set({ karma: 5 });
  await ev((c) => SRPG.blackjack.force(c), [C(10), C(9), C(2), C(3), C(10), C(7), C(5), C(5)]);
  await t.clickUI('deal');
  eq((await bj()).phase, 'deal', 'DEAL works with no bet');
  eq((await t.state()).karma, 5, 'blackjack costs no karma');
  await t.clickUI('stand');
  await t.clickUI('ok');
  // random deck: values/suits in range
  await t.set({ cash: 1000 });
  await ev(() => SRPG.rng.seed(1234));
  await t.clickUI('deal');
  st = await bj();
  check(st.cardv.every((v) => /^(A|[2-9]|10|J|Q|K)$/.test(v)) && st.cards.every((s) => s >= 1 && s <= 4), 'random deck is well formed');
  eq(st.phand, st.cardn[0] + st.cardn[1], 'phand = first two cards');
  await t.clickUI('stand');
  await t.clickUI('ok');
  await ev(() => SRPG.rng.unseed());
  await t.clickUI('leave');

  // ------------------------------------------------------------------------------------------
  // Roulette
  await t.set({ cash: 3000, karma: 0 });
  await t.clickUI('roulette');
  eq(await scene(), 'roulette', 'PLAY ROULETTE opens the table');
  await t.step(2);
  await shot('roulette-idle');
  const rt = () => ev(() => JSON.parse(JSON.stringify(SRPG.roulette.state, (k, v) => (v === undefined ? '__undef' : v))));
  let rs = await rt();
  eq(rs.activeSpace, 'None', 'no active space at first');
  await t.clickUI('chip5');
  eq((await t.state()).cash, 3000, 'chips need an active space');
  await t.clickUI('sp-17');
  rs = await rt();
  eq(rs.activeSpace, '17', 'clicking 17 makes it active');
  eq(rs.activeBet, 0, 'active bet 0');
  await t.clickUI('chip5');
  await t.clickUI('chip25');
  await t.clickUI('chip100');
  rs = await rt();
  eq(rs.bets['17'], 130, 'chips raise the active bet');
  eq(rs.bet, 130, 'total bet');
  eq((await t.state()).cash, 2870, 'chips take the cash');
  await t.clickUI('chip0');
  rs = await rt();
  eq(rs.bets['17'], 0, '0 chip clears the active space');
  eq((await t.state()).cash, 3000, '0 chip refunds it');
  eq(rs.bet, 0, 'total bet back to 0');
  // $2000 limit
  for (let i = 0; i < 19; i++) await t.clickUI('chip100');
  eq((await rt()).bet, 1900, '19 x $100');
  await t.clickUI('chip100');
  eq((await rt()).bet, 2000, '$100 allowed at 1900 (bet < 1901)');
  await t.clickUI('chip5');
  eq((await rt()).bet, 2000, 'nothing past $2000');
  await t.clickUI('chip0');
  for (let i = 0; i < 19; i++) await t.clickUI('chip100');
  await t.clickUI('chip25');
  await t.clickUI('chip25');
  await t.clickUI('chip25');
  eq((await rt()).bet, 1975, '1975');
  await t.clickUI('chip25');
  eq((await rt()).bet, 2000, '$25 allowed at 1975 (bet < 1976)');
  await t.clickUI('clearall');
  rs = await rt();
  eq(rs.bet, 0, 'CLEAR ALL BETS');
  eq(rs.activeSpace, 'None', 'CLEAR ALL resets the active space');
  eq((await t.state()).cash, 3000, 'CLEAR ALL refunds');
  // cash checks
  await t.set({ cash: 4 });
  await t.clickUI('sp-red');
  await t.clickUI('chip5');
  eq((await rt()).bet, 0, '$5 chip needs cash > 4');
  await t.set({ cash: 5 });
  await t.clickUI('chip5');
  eq((await rt()).bet, 5, '$5 chip with $5');
  await t.clickUI('chip25');
  eq((await rt()).bet, 5, '$25 chip needs cash > 24');
  await t.clickUI('clearall');
  // col1 quirk: blank Bet, and the 0 chip zeroes the bet without refund
  await t.set({ cash: 1000 });
  await t.clickUI('sp-col1');
  await t.clickUI('chip100');
  eq((await rt()).bets.col1, 100, 'column 1 bet');
  await t.clickUI('sp-col2');
  await t.clickUI('sp-col1');
  eq((await rt()).activeBet, '__undef', 'selecting "2-1 (1-34)" shows a blank bet (original quirk)');
  await t.clickUI('chip0');
  rs = await rt();
  eq(rs.bets.col1, 0, '0 chip zeroes the column bet');
  eq((await t.state()).cash, 900, '...without a refund (original quirk)');
  eq(rs.bet, 100, '...and the total still counts it');
  await t.clickUI('clearall');
  eq((await t.state()).cash, 1000, 'CLEAR ALL returns the total');

  // spin(bets, rand) -> payout. bets: { spaceId: dollars in $5 chips }
  async function spin(bets, rand, name) {
    await t.set({ cash: 5000, karma: 0 });
    for (const [sp, amt] of Object.entries(bets)) {
      await t.clickUI('sp-' + sp);
      let left = amt;
      while (left >= 100) { await t.clickUI('chip100'); left -= 100; }
      while (left >= 25) { await t.clickUI('chip25'); left -= 25; }
      while (left >= 5) { await t.clickUI('chip5'); left -= 5; }
    }
    const total = Object.values(bets).reduce((a, b) => a + b, 0);
    eq((await t.state()).cash, 5000 - total, 'bets placed ' + JSON.stringify(bets));
    if (name) { await t.step(1); await shot(name + '-bets'); }
    await forceRandom([rand]);
    await t.clickUI('spin');
    eq((await t.state()).karma, -1, 'SPIN costs 1 karma');
    rs = await rt();
    eq(rs.spinning, true, 'wheel spinning');
    if (name) { await t.step(40); await shot(name + '-spinning'); await t.step(210); } else await t.step(250);
    rs = await rt();
    eq(rs.spinning, false, 'spin over after ~7 s');
    if (name) { await t.step(1); await shot(name + '-result'); }
    return { won: (await t.state()).cash - (5000 - total), rs };
  }
  // straight up x36 (fix) on 17; 17 is black, odd, 1-18, col2, 2nd dozen
  r = await spin({ 17: 10, red: 10, black: 10, even: 10, odd: 10, '1_18': 10, '19_36': 10, col1: 10, col2: 10, col3: 10,
    '1st12': 10, '2nd12': 10, '3rd12': 10 }, 16, 'roulette');
  eq(r.won, 360 + 20 + 20 + 20 + 30 + 30, '17 pays: straight x36, black/odd/1-18 x2, col2/2nd12 x3');
  eq(r.rs.result, '17, black!  Player gets $480.', 'result line');
  eq(r.rs.bet, 0, 'bets cleared after the spin');
  eq(r.rs.activeSpace, 'None', 'active space cleared');
  // 30 and 36 pay (fix)
  r = await spin({ 30: 5 }, 29);
  eq(r.won, 180, 'straight bet on 30 pays (decided fix)');
  r = await spin({ 36: 5, '3rd12': 5, col3: 5, red: 5, even: 5, '19_36': 5 }, 35);
  eq(r.won, 180 + 15 + 15 + 10 + 10 + 10, '36: straight, 3rd 12, col3, red, even, 19-36');
  eq(r.rs.result, '36, red!  Player gets $240.', '36 is red');
  // zeros: straight pays, every outside bet loses (fix: the original paid 19-36)
  r = await spin({ 0: 5, '00': 5, red: 5, black: 5, even: 5, odd: 5, '1_18': 5, '19_36': 5, col1: 5, col2: 5, col3: 5,
    '1st12': 5, '2nd12': 5, '3rd12': 5 }, 36);
  eq(r.won, 180, '0: only the 0 straight bet pays');
  eq(r.rs.result, '0!  Player gets $180.', '0 result line');
  r = await spin({ '00': 10, '19_36': 100, '1_18': 5 }, 37);
  eq(r.won, 360, '00: straight pays, 19-36 loses (decided fix)');
  eq(r.rs.result, '00!  Player gets $360.', '00 result line');
  // 11 counts as red on the wheel (original quirk kept)
  r = await spin({ red: 10, black: 10, 11: 5 }, 10);
  eq(r.won, 20 + 180, '11 pays red bets and its straight bet');
  eq(r.rs.result, '11, red!  Player gets $200.', '11 reads red');
  // 1: red, odd, 1-18, col1, 1st12
  r = await spin({ 1: 5, red: 5, odd: 5, '1_18': 5, col1: 5, '1st12': 5, black: 5, even: 5 }, 0);
  eq(r.won, 180 + 10 + 10 + 10 + 15 + 15, '1 pays straight, red, odd, 1-18, col1, 1st 12');
  // 24: black, even, 19-36, col3, 2nd12
  r = await spin({ 24: 5, black: 5, even: 5, '19_36': 5, col3: 5, '2nd12': 5, '3rd12': 5 }, 23);
  eq(r.won, 180 + 10 + 10 + 10 + 15 + 15, '24 pays straight, black, even, 19-36, col3, 2nd 12');
  // 35: col2, 3rd12, black, odd
  r = await spin({ col2: 5, '3rd12': 5, black: 5, odd: 5, col1: 5 }, 34);
  eq(r.won, 15 + 15 + 10 + 10, '35 pays col2, 3rd 12, black, odd');
  // every straight number pays x36
  for (let n = 1; n <= 36; n++) {
    const got = await ev((n) => {
      const st = SRPG.roulette.state;
      SRPG.game.s.cash = 0;
      st.bets = {}; st.bets[String(n)] = 5; st.bet = 5;
      if (!SRPG.rng._real) SRPG.rng._real = SRPG.rng.random;
      const real = SRPG.rng._real;
      let q = [n - 1];
      SRPG.rng.random = (m) => (q.length ? q.shift() : real(m));
      st.ball2.playing = true; st.spinning = true; st.spinT = SRPG.roulette.SPIN_TICKS; st.ball2.f = 9;
      SRPG.engine.step(1);
      return SRPG.game.s.cash;
    }, n);
    eq(got, 180, 'straight bet on ' + n + ' pays x36');
  }
  // a spin with no bets still costs karma; SPIN/LEAVE disabled while spinning
  await t.set({ cash: 100, karma: 0 });
  await t.clickUI('spin');
  eq((await t.state()).karma, -1, 'spin with no bets costs karma');
  check(await ev(() => document.querySelector('#ui [data-id="spin"]').classList.contains('disabled')), 'SPIN disabled while spinning');
  await t.clickUI('leave');
  eq(await scene(), 'roulette', 'LEAVE disabled while spinning');
  await t.clickUI('spin');
  eq((await t.state()).karma, -1, 'a second SPIN is ignored');
  // timing: result on the first lap check after 6.8 s (238 ticks)
  let ticks = 0;
  while ((await rt()).spinning && ticks < 400) { await t.step(1); ticks++; }
  check(ticks >= 238 && ticks <= 280, 'spin lasts 6.8 s + up to one lap (' + ticks + ' ticks)');
  eq((await t.state()).cash, 100, 'no bets: nothing won or lost');
  // leave refunds pending bets
  await t.clickUI('sp-5');
  await t.clickUI('chip25');
  eq((await t.state()).cash, 75, 'bet placed before leaving');
  await t.clickUI('leave');
  eq(await scene(), 'location:casino', 'roulette LEAVE returns to the menu');
  eq((await t.state()).cash, 100, 'LEAVE refunds pending bets');
  eq((await t.state()).time, 8, 'roulette takes no time');

  // ------------------------------------------------------------------------------------------
  // Review additions: original quirks and look details
  // Canvas pixel at stage (x, y) after a redraw (the backing store is 550 x 400 times
  // SRPG.engine.pixelScale).
  const px = (x, y) => ev(([x, y]) => {
    SRPG.engine.draw();
    const k = SRPG.engine.pixelScale || 1;
    const d = document.getElementById('game').getContext('2d').getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data;
    return [d[0], d[1], d[2]];
  }, [x, y]);
  const isWhite = (c) => c[0] > 235 && c[1] > 235 && c[2] > 235;
  // share of non-white pixels in a stage rectangle
  const inked = (x, y, w, h) => ev(([x, y, w, h]) => {
    SRPG.engine.draw();
    const k = SRPG.engine.pixelScale || 1;
    const d = document.getElementById('game').getContext('2d').getImageData(Math.round(x * k), Math.round(y * k), Math.round(w * k), Math.round(h * k)).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (!(d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235)) n++;
    return n / (d.length / 4);
  }, [x, y, w, h]);
  const colorOf = (c) => (c[1] > 180 && c[0] < 90 ? 'green' : c[0] > 180 && c[1] < 90 ? 'red' : c[0] < 50 && c[1] < 50 && c[2] < 50 ? 'black' : 'other ' + c.join(','));

  // Slots: reel 2 has no art on its "$" frame (the original's blank middle drum)
  await t.set({ cash: 1000, karma: 0 });
  await t.clickUI('slots');
  await t.step(1);
  check((await inked(212, 172, 28, 34)) < 0.02, 'middle reel starts blank (no art on its $ frame)');
  check((await inked(163, 172, 28, 34)) > 0.2, 'first reel shows its $ at the start');
  await forceRandom([0, 0, 0]);
  await t.clickUI('handle');
  await t.step(60);
  eq((await t.state()).cash, 1000 - 5 + 75, '$$$ pays');
  check((await inked(212, 172, 28, 34)) < 0.02, 'a $$$ win shows the middle drum blank ("$ _ $")');
  check((await inked(260, 172, 28, 34)) > 0.2, '...between two dollar signs');
  // the bet can still be changed in the tick between the pull and frame 3; the payout uses it
  await t.set({ cash: 1000 });
  await forceRandom([0, 0, 0]);
  await t.clickUI('handle');
  await t.clickUI('bet100');
  eq((await ev(() => SRPG.slots.state)).bet, 100, 'bet buttons still live until frame 3 (original quirk)');
  await t.step(60);
  eq((await t.state()).cash, 1000 - 5 + 1500, '...and the payout uses the new bet (took $5, paid $100 x15)');
  // leaving and coming back resets the machine to $5
  await t.clickUI('leave');
  await t.clickUI('slots');
  eq((await ev(() => SRPG.slots.state)).bet, 5, 'a new visit starts on $5 again');
  eq((await ev(() => SRPG.slots.state)).textwin, 0, 'a new visit starts with WINNINGS 0');
  await t.clickUI('leave');

  // Blackjack: the chips are buttons only while betting (hover/press turn them)
  await t.clickUI('blackjack');
  await ev(() => {
    const h = document.querySelector('#ui [data-id="chip25"]');
    h.dispatchEvent(new MouseEvent('mouseenter'));
    h.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });
  eq((await bj()).press, 25, 'pressing a chip turns it (press state)');
  await ev(() => document.querySelector('#ui [data-id="chip25"]').dispatchEvent(new MouseEvent('mouseleave')));
  eq((await bj()).hover, null, 'leaving the chip clears its hover');
  // HIT ME! at the 4-card limit changes nothing
  await t.set({ cash: 1000 });
  await ev((c) => SRPG.blackjack.force(c), [C(2), C(2), C(2), C(2), C(10), C(9), C(5), C(5)]);
  await t.clickUI('deal');
  await t.clickUI('hit');
  await t.clickUI('hit');
  const before4 = await bj();
  await t.clickUI('hit');
  const after4 = await bj();
  eq(JSON.stringify(after4.cardn) + after4.phand + after4.text, JSON.stringify(before4.cardn) + before4.phand + before4.text, 'a fifth HIT ME! does nothing');
  await t.clickUI('stand');
  await t.clickUI('ok');
  await t.clickUI('leave');

  // Roulette: the ball's rest spots lie in pockets of the colour the result reports
  await t.clickUI('roulette');
  for (const [rand, want] of [[16, 'black'], [0, 'red'], [36, 'green'], [37, 'green'], [10, 'red']]) {
    await forceRandom([rand]);
    await ev(() => { const st = SRPG.roulette.state; st.ball2.playing = true; st.spinning = true; st.spinT = SRPG.roulette.SPIN_TICKS; st.ball2.f = 9; st.ball.visible = false; SRPG.engine.step(1); });
    const spot = await ev(() => {
      const st = SRPG.roulette.state;
      // turn the wheel so the rest spot faces right, and hide the ball to see the pocket under it
      st.wheelRot = -Math.atan2(st.ball.y, st.ball.x) * 180 / Math.PI;
      st.ball.visible = false;
      return { x: 0.45 + Math.hypot(st.ball.x, st.ball.y), y: 214.5, result: st.result };
    });
    eq(colorOf(await px(spot.x, spot.y)), want, 'ball rest spot for ' + spot.result + ' is a ' + want + ' pocket');
    await ev(() => { SRPG.roulette.state.ball.visible = true; });
  }
  // two green pockets, opposite each other (at 262.2 and 82.2 degrees on the wheel)
  for (const a of [262.2, 82.2]) {
    await ev((a) => { SRPG.roulette.state.wheelRot = -a; }, a);
    eq(colorOf(await px(0.45 + 76, 214.5)), 'green', 'green pocket at ' + a + ' degrees');
    await ev((a) => { SRPG.roulette.state.wheelRot = -a + 11.25; }, a);
    eq(colorOf(await px(0.45 + 76, 214.5)), 'black', 'black pocket beside the green at ' + a);
  }
  // bets placed while the wheel spins still count (chips stay live, as in the original)
  await t.set({ cash: 1000, karma: 0 });
  await t.clickUI('spin');
  await t.step(20);
  await t.clickUI('sp-red');
  await t.clickUI('chip100');
  eq((await t.state()).cash, 900, 'chips still work during a spin');
  await forceRandom([0]); // 1, red
  let guard = 0;
  while ((await rt()).spinning && guard++ < 400) await t.step(5);
  eq((await t.state()).cash, 1100, 'a red bet placed mid-spin is paid 2x');
  // chip hover/press turn state is reset by a rebuild
  await ev(() => document.querySelector('#ui [data-id="chip5"]').dispatchEvent(new MouseEvent('mouseenter')));
  eq((await rt()).hover, 'chip5', 'hovering a chip');
  await t.clickUI('clearall');
  await t.clickUI('spin');
  eq((await rt()).hover, null, 'the rebuilt chips start un-hovered');
  guard = 0;
  while ((await rt()).spinning && guard++ < 400) await t.step(5);
  await t.step(1);
  await shot('roulette-after');
  await t.clickUI('leave');
  eq(await scene(), 'location:casino', 'back in the casino');
  await t.clickUI('leave');
  eq(await scene(), 'city', 'and out on the street');

  // ------------------------------------------------------------------------------------------
  const errs = t.errors.filter((e) => !/requestfailed|ERR_FILE_NOT_FOUND/.test(e));
  eq(errs.length, 0, 'no page errors ' + errs.join('\n'));
  console.log(passes + ' passed, ' + failures + ' failed');
  await t.close();
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
