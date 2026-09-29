// tests/e2e/casino.test.cjs — owner: W2-Night. The Silver Lining Casino on the real index.html
// (BUILD_PLAN §4.8; GDD §4.13; BALANCE B-14a-c; UI §5.8), every check through the UI:
//   the card (three tables, no time); Paper Jackpot: each pull pays per B-14a (checked against the
//   BALANCE table here, not the rules), the reels land on the rules' stops, the pull is committed
//   ~1 s in (the cash never gives it away), stop early, bets 5 / 25 / 100 ($500 at VIP Silver, P1),
//   Auto-spin 10 pulls, holding Spin keeps pulling, a refusal (never a win's flash) shown under the
//   reels, cash out; blackjack with crafted shoes: 3:2 naturals, double, split, the dealer standing
//   on soft 17, a bust, H / S / D in the `blackjack` context only (never the city's down / right /
//   minimal HUD), the 60-hand day, a hand abandoned mid-play is lost (its cards and hole card stay
//   dealt and counted), a decided hand is applied when you leave during its reveal, Hardcore's
//   pending hand, "By the book", a sampled Auto moves the saved shoe; roulette with forced pockets: every bet type placed by mouse and by
//   keyboard pays per B-14c, 0 and 00 lose the outside bets, C clears, the table limit, no Auto;
//   karma -1 per pull, spin and hand, at most -10 a day; #aria for every game; zero console errors.
// Screenshots: shots/W2-Night/casino-*.png.   node tests/e2e/casino.test.cjs
'use strict';
const K = require('./night-kit.cjs');

// BALANCE B-14a and B-14c, copied here so the checks do not read the rules' own tables.
const PAYS = { dollar3: 700, seven3: 100, bar3: 40, bell3: 20, cherry3: 15, cherry2: 5, cherry1: 1 };
const RED = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const RPAY = { straight: 35, split: 17, street: 11, corner: 8, sixLine: 5, dozen: 2, column: 2, red: 1, black: 1, odd: 1, even: 1, low: 1, high: 1 };

function lineOf(r) {
  if (r[0] === r[1] && r[1] === r[2] && r[0] !== 'blank') return r[0] + '3';
  if (r[0] === 'cherry' && r[1] === 'cherry') return 'cherry2';
  if (r[0] === 'cherry') return 'cherry1';
  return null;
}
/** B-14c: the net of a bet list on a pocket (0-36, 37 = 00), from the table above. */
function rouletteNet(bets, pocket) {
  let net = 0;
  bets.forEach((b) => {
    const p = pocket, n = typeof b.n === 'string' ? 37 : b.n;
    let win = false;
    const nums = (b.nums || []).map((x) => (x === '00' ? 37 : x));
    switch (b.type) {
      case 'straight': win = n === p; break;
      case 'split': case 'street': case 'corner': case 'sixLine': win = nums.indexOf(p) >= 0; break;
      case 'dozen': win = p >= 1 && p <= 36 && Math.ceil(p / 12) === b.n; break;
      case 'column': win = p >= 1 && p <= 36 && ((p - 1) % 3) + 1 === b.n; break;
      case 'red': win = RED.indexOf(p) >= 0; break;
      case 'black': win = p >= 1 && p <= 36 && RED.indexOf(p) < 0; break;
      case 'odd': win = p >= 1 && p <= 36 && p % 2 === 1; break;
      case 'even': win = p >= 1 && p <= 36 && p % 2 === 0; break;
      case 'low': win = p >= 1 && p <= 18; break;
      case 'high': win = p >= 19 && p <= 36; break;
      default: break;
    }
    net += win ? b.amount * RPAY[b.type] : -b.amount;
  });
  return net;
}

(async () => {
  const T = K.h.suite('e2e casino');
  const k = await K.open({});
  const { t, E } = k;

  async function atCasino(opts, patch, min) {
    await t.newGame(Object.assign({ seed: 31337 }, opts || {}));
    await t.setTime(min === undefined ? 21 * 60 : min);
    await t.set(Object.assign({ money: { cash: 5000 } }, patch || {}));
    await t.enter('casino');
    await t.step(2);
    await k.quiet();
    await k.clearLogs();
  }
  const gambles = async (id) => (await k.acted()).filter((a) => a.id === id && a.ok).map((a) => a.events.filter((e) => e.name === 'gamble')[0].payload);
  const key = async (code, n) => { await t.key(code); await t.step(n === undefined ? 1 : n); };

  // ------------------------------------------------------------------------------------------
  T.section('the card: three tables, no time (orig)');
  await atCasino();
  await t.step(40);
  T.eq(await k.audit('#ui'), [], 'the casino card passes the a11y audit');
  const rows = (await t.ui()).rows.map((r) => r.action);
  T.eq(rows, ['casino.slots', 'casino.blackjack', 'casino.roulette'], 'Paper Jackpot, blackjack and roulette (the VIP desk is P1)');
  const pvs = await E(() => ['casino.slots', 'casino.blackjack', 'casino.roulette'].map((id) => SR.preview(id).cost.min));
  T.eq(pvs, [0, 0, 0], 'gambling takes no time');
  await t.step(120);   // the drawn clock eases 1.5 s after a jump (the render core's tween)
  await k.shot('casino-night');
  await atCasino({}, null, 13 * 60);
  await t.step(120);   // the drawn clock eases 1.5 s after a jump (the render core's tween)
  await k.shot('casino-day');
  const inter = await E(() => { const d = SR.reg.interior.casino; return { owner: d.owner.id, props: d.props.map((x) => x.type), info: SR.ui.building.info() }; });
  T.ok(inter.info.interior && inter.owner === 'lou' && ['chandelier', 'reels', 'slot', 'cardtable', 'roulette', 'fountain'].every((x) => inter.props.indexOf(x) >= 0),
    'the interior: Lucky Lou at the tables, the chandelier, the reel wall, slots, blackjack, roulette and the fountain (ART_AUDIO §9)', inter);
  const greet = await E(() => {
    const g = SR.reg.fn['greet.casino'], base = JSON.parse(JSON.stringify(SR.state)), ctx = { rng: SR.rng.create(5) };
    const at = (patch, night) => {
      const s = JSON.parse(JSON.stringify(base));
      s.clock.min = 20 * 60;
      patch(s);
      const was = SR.features.nightlife;
      SR.features.nightlife = !!night;
      try { return g(s, {}, ctx).key; } finally { SR.features.nightlife = was; }
    };
    return {
      broke: at((s) => { s.money.cash = 4; }), notBroke: at((s) => { s.money.cash = 5; }),
      saint: at((s) => { s.stats.karma = 80; }), notSaint: at((s) => { s.stats.karma = 79; }),
      whale: at((s) => { s.casino.points = 500; }, true), notWhale: at((s) => { s.casino.points = 499; }, true),
      barred: at((s) => { s.casino.barredUntil = s.clock.day + 3; }, true),
    };
  });
  T.eq([greet.broke, greet.saint, greet.whale, greet.barred], ['greet.casino.broke', 'greet.casino.saint', 'greet.casino.whale', 'greet.casino.barred'],
    'Lou\'s greeting: under the smallest bet ($5), Angelic karma (80), VIP Silver points (500, P1), the back-off (P1)');
  T.ok([greet.notBroke, greet.notSaint, greet.notWhale].every((x) => /^greet\.casino\.[1-4]$/.test(x)), 'just short of each threshold: a plain line', greet);
  await atCasino();

  // ------------------------------------------------------------------------------------------
  T.section('Paper Jackpot: the pull is committed ~1 s in, the reels land on the rules\' stops (B-14a)');
  await k.row('casino.slots');
  let cur = await k.cur();
  T.eq([cur && cur.id, cur && cur.context], ['slots', 'slots'], 'the slots engine with its `slots` context');
  let p = await k.peek();
  T.eq(p.bets, [5, 25, 100], 'bets $5 / $25 / $100 (orig)');
  await key('Digit2');
  T.eq((await k.peek()).bet, 25, '2 picks the $25 bet');
  const cash0 = (await k.state()).money.cash;
  await key('Space', 30);
  p = await k.peek();
  T.ok(p.spinning && !p.committed && (await k.state()).money.cash === cash0, 'half a second in: the reels spin blind and nothing is taken yet');
  await t.step(40);
  p = await k.peek();
  T.ok(p.committed && (await k.state()).money.cash !== undefined, 'after ~1 s the pull is committed (casino.slots.pull:resolve)');
  await t.step(90);
  p = await k.peek();
  let g = (await gambles('casino.slots.pull:resolve'))[0];
  const strip = await E(() => SR.rules.casino.slots.strip());
  T.ok(!p.spinning && p.pos.join() === g.stops.join(), 'the reels stop on the rules\' stops', [p.pos, g.stops]);
  T.eq(g.stops.map((s) => strip[s]), g.reels, 'the strip symbols at those stops are the reels announced');
  T.eq(g.net, 25 * (PAYS[lineOf(g.reels)] || 0) - 25, 'the pull pays bet × the B-14a line (stake included) - bet');
  T.ok(await k.heard(g.line ? 'mg.slots.lineAria' : 'mg.slots.noLine'), 'the line is announced ("Line: … Pays …")');
  await k.shot('casino-slots');
  T.eq(await k.audit(), [], 'the slots frame passes the a11y audit');

  T.section('Paper Jackpot: every pull pays per B-14a; stop early; karma -1 a pull');
  await k.clearLogs();
  const k0 = (await k.state()).stats.karma;
  for (let i = 0; i < 6; i++) {
    await key('Space', 20);
    await key('Space', 30);   // Stop: the reels stop early (already committed)
  }
  await t.step(40);
  const pulls = await gambles('casino.slots.pull:resolve');
  T.eq(pulls.length, 6, 'six pulls, stopped early, each applied once');
  T.ok(pulls.every((x) => x.net === x.bet * (PAYS[lineOf(x.reels)] || 0) - x.bet), 'every pull: net = bet × pays(line) - bet', pulls.map((x) => [x.reels.join(' '), x.net]));
  T.eq((await k.state()).stats.karma - k0, -6, 'karma -1 per pull (orig)');
  const tbl = await E(() => SR.rules.casino.slots.pays(SR.state));
  T.eq(tbl, PAYS, 'the pay table shown is B-14a');

  T.section('Paper Jackpot: Auto-spin plays 10 pulls, each applied like a played one');
  await k.clearLogs();
  await E(() => { SR.state.daily.gambleKarma = 0; });
  await t.clickUI('mg-auto');
  await k.closed();
  const auto = await gambles('casino.slots.pull:resolve');
  const ad = (await k.done()).filter((d) => d.id === 'slots').pop();
  T.eq(auto.length, 10, 'Auto-spin: 10 pulls (B-14a)');
  const sessionNet = [g].concat(pulls, auto).reduce((a, x) => a + x.net, 0);
  T.eq([ad.result.rounds, ad.result.net, ad.result.auto], [1 + 6 + 10, sessionNet, true], 'the session result sums every pull of the visit (1 + 6 played, 10 Auto)');
  T.ok((await k.acted()).some((a) => a.id === 'casino.slots:resolve' && a.ok && a.toasts.some((x) => /^toast\.casino\./.test(x))), 'leaving says how the visit went');
  T.eq((await k.state()).stats.karma - k0, -6 - 10, 'karma -1 per Auto pull too');

  T.section('gambling karma: at most -10 a day');
  await k.quiet();
  await k.row('casino.slots');
  await E(() => SR.debug.fast(true));
  const k1 = (await k.state()).stats.karma;
  for (let i = 0; i < 3; i++) await key('Space', 2);
  T.eq((await k.state()).stats.karma, k1, 'past -10 today, pulls cost no more karma (the cap)');
  T.section('Paper Jackpot: refused without the bet; cash out');
  await E(() => { SR.state.money.cash = 3; });
  await key('Digit1');
  const nPulls = (await gambles('casino.slots.pull:resolve')).length;
  await key('Space', 3);
  T.eq((await gambles('casino.slots.pull:resolve')).length, nPulls, 'with $3 the $5 pull is refused');
  T.ok(await k.heard('reason.needCash'), 'and the reason is announced');
  T.eq((await k.peek()).error, 'reason.needCash', 'and shown under the reels');
  await E(() => { SR.state.money.cash = 5000; });
  await t.clickUI('mg-slots-cashout');
  await k.closed();
  T.ok((await k.done()).some((d) => d.id === 'slots' && !d.result.auto), 'Cash out ends the session');
  await E(() => SR.debug.fast(false));

  T.section('Paper Jackpot: a win\'s flash never reads as a refusal; holding Spin keeps pulling (UI §5.8)');
  await atCasino();
  await k.row('casino.slots');
  const slotSeed = (wins) => E((wins) => {
    const S = SR.rules.casino.slots;
    for (let s = 1; s < 20000; s++) if (!!S.spin(SR.rng.create(s), 5, S.pays(SR.state)).line === wins) return s;
    return null;
  }, wins);
  await k.rngSeed(await slotSeed(true));
  await key('Space', 1);
  await key('Space', 40);   // stopped early: a winning line (its flash runs 1.2 s)
  T.ok(!!(await k.peek()).last.line, 'a winning pull', (await k.peek()).last);
  await k.rngSeed(await slotSeed(false));
  await key('Space', 1);
  await key('Space', 30);   // the next pull, stopped early while the win still flashes: no line
  p = await k.peek();
  T.ok(!p.spinning && !p.last.line && p.error === null, 'a losing pull right after a win shows no refusal (the win flash is not an error)', [p.last, p.error]);
  await k.clearLogs();
  await t.page.keyboard.down('Space');
  await t.step(330);   // the first pull, then one more after each settles (2 s reels + 0.5 s)
  await t.page.keyboard.up('Space');
  await t.step(200);
  const held = (await gambles('casino.slots.pull:resolve')).length;
  T.ok(held >= 2 && held <= 3, 'holding Space pulls again after each pull settles', held);
  await t.step(200);
  T.eq((await gambles('casino.slots.pull:resolve')).length, held, 'releasing it stops the pulls');
  await t.clickUI('mg-slots-cashout');
  await k.closed();

  T.section('Paper Jackpot: $500 at VIP Silver (P1 `nightlife`)');
  await E(() => SR.debug.feature('nightlife', true));
  await atCasino({}, { casino: { points: 500 } });
  await k.row('casino.slots');
  T.eq((await k.peek()).bets, [5, 25, 100, 500], 'VIP Silver adds the $500 bet');
  await t.clickUI('mg-exit');
  await k.closed();
  await E(() => SR.debug.feature('nightlife', false));

  // ------------------------------------------------------------------------------------------
  // Blackjack with crafted shoes: card c has rank c % 13 + 1 (0 = ace, 9 = ten, 12 = king).
  const A = 0, R = (n) => n - 1;   // R(2..10), faces 10-12
  async function shoe(front) {
    await E((front) => {
      const cards = front.slice();
      for (let i = 0; cards.length < 312; i++) cards.push(i % 52);
      SR.state.casino.shoe = { decks: 6, cards, pos: 0, cut: 234, running: 0, hole: -1 };
    }, front);
  }
  async function bjOpen() {
    await k.quiet();
    await k.row('casino.blackjack');
    await key('Digit2');   // $5 + $25 = $30
  }
  const lastHand = async () => (await gambles('casino.blackjack.hand:resolve')).pop();
  const settle = async () => { for (let i = 0; i < 200; i++) { const q = await k.peek(); if (q.phase === 'bet' || q.phase === 'outcome') return q; await t.step(5); } return k.peek(); };

  T.section('blackjack: a natural pays 3:2');
  await atCasino();
  await shoe([A, R(5), 12, R(9)]);
  const kb0 = (await k.state()).stats.karma;
  await bjOpen();
  cur = await k.cur();
  T.eq([cur.id, cur.context, (await k.peek()).bet], ['blackjack', 'blackjack', 30], 'the table with its `blackjack` context; chips add to the $5 minimum');
  await key('Enter', 2);
  await settle();
  T.eq((await lastHand()).net, 45, 'A + K against a 5 up: +$45 on $30 (3:2)');
  T.ok(await k.heard('mg.blackjack.natural'), '"Blackjack!" is announced');
  T.eq((await k.state()).stats.karma - kb0, -1, 'karma -1 per hand (orig)');

  T.section('blackjack: double (one card, twice the bet), and H / S / D stay in the table\'s context');
  await shoe([R(6), R(6), R(5), R(10), R(10), R(10)]);
  const pos0 = await k.state('player');
  await k.clearLogs();
  await key('Enter', 30);
  p = await k.peek();
  T.eq(p.phase, 'play', 'dealt: 6 + 5 against a 6');
  await k.shot('casino-blackjack');
  T.eq(await k.audit(), [], 'the blackjack frame passes the a11y audit (a hand out, Split disabled)');
  await key('KeyD', 2);
  await settle();
  T.eq((await lastHand()).net, 60, 'double on 11 draws a 10 (21); the dealer busts: +$60 on $30');
  const acts = await k.acts();
  T.ok(acts.some((a) => a.a === 'double' && a.ctx === 'blackjack'), 'D fires `double` in the blackjack context');
  T.ok(!acts.some((a) => a.a === 'right' || a.a === 'down' || a.a === 'minimalHud'), 'D never reaches the city\'s right, nor S its down, nor H the minimal HUD');
  T.eq(await k.state('player'), pos0, 'the player never moved');

  T.section('blackjack: split once, the dealer stands on soft 17, a bust');
  await shoe([R(8), R(7), R(8), R(10), R(3), R(10), R(9)]);
  await k.clearLogs();
  await key('Enter', 30);
  await key('KeyP', 30);
  p = await k.peek();
  T.eq([p.round.hands.length, p.round.hands.map((h) => h.cards.length).join()], [2, '2,2'], 'P splits the eights into two hands of two cards');
  await key('KeyH', 30);   // hand 1: 8 + 3 + 9 = 20
  await key('KeyS', 30);
  await key('KeyS', 30);   // hand 2: 8 + 10 = 18; the dealer holds 17
  await settle();
  let h = await lastHand();
  T.eq([h.net, h.bet], [60, 60], 'both hands beat the dealer\'s 17: +$60 on $60 wagered');
  await shoe([R(10), A, R(8), R(6)]);
  await key('Enter', 30);
  await key('KeyS', 60);
  await settle();
  h = await lastHand();
  T.eq(h.net, 30, 'the dealer stands on soft 17 (A + 6); 18 wins');
  await shoe([R(10), R(9), R(6), R(9), R(10)]);
  await key('Enter', 30);
  await key('KeyH', 60);
  await settle();
  T.eq((await lastHand()).net, -30, 'a hit to 26 busts: -$30');
  T.ok(await k.heard('mg.blackjack.dealerShows') && await k.heard('mg.blackjack.youHave'), '"Dealer shows … You have …" is announced');
  const hands = await k.state('daily.bjHands');
  T.eq(hands, 5, 'every hand counts toward the day');

  T.section('blackjack: a hand left mid-play is lost');
  await shoe([R(10), R(9), R(6), R(5), R(10)]);   // you 10 + 6 against a 9 up; the hole card is a 5
  await key('Enter', 30);
  const c0 = (await k.state()).money.cash;
  await t.clickUI('mg-exit');
  await t.step(2);
  T.eq((await k.cur()).panel, 'exit', 'Exit asks while a hand is out');
  await key('Digit2');
  await k.closed();
  T.eq((await k.state()).money.cash, c0 - 30, 'walking away mid-hand loses the $30 on the table');
  T.ok((await k.acted()).some((a) => a.id === 'casino.blackjack:resolve' && a.toasts.indexOf('toast.casino.forfeit') >= 0), 'casino.sessionEnd applied the forfeit');
  const left = await k.state('casino.shoe');
  T.eq([left.pos, left.hole, left.running], [4, -1, 1], 'its four cards stay dealt, and the hole card (a 5: Hi-Lo +1) is counted as it is swept');

  T.section('blackjack: leaving while the dealer turns the cards applies the decided hand');
  await shoe([R(10), R(6), R(9), R(10), R(10)]);   // you 19; the dealer 6 + 10 draws a 10 and busts
  await bjOpen();
  await key('Enter', 30);
  const c1 = (await k.state()).money.cash;
  await k.clearLogs();
  await key('KeyS', 3);
  T.eq((await k.peek()).phase, 'reveal', 'you stand: the hand is decided while the dealer\'s cards turn over');
  await t.clickUI('mg-exit');
  await t.step(2);
  await key('Digit2');
  await k.closed();
  T.eq((await k.state()).money.cash, c1 + 30, 'leaving now pays the decided win (+$30), never a forfeit');
  T.ok(!(await k.acted()).some((a) => a.toasts.indexOf('toast.casino.forfeit') >= 0) && (await lastHand()).net === 30, 'the hand was applied as played (casino.blackjack.hand:resolve)');

  T.section('blackjack: 60 hands a day');
  await E(() => { SR.state.daily.bjHands = 59; });
  await bjOpen();
  await key('Enter', 30);
  await key('KeyS', 60);
  await settle();
  await k.clearLogs();
  await key('Enter', 5);
  T.eq((await k.peek()).phase, 'bet', 'hand 61 is not dealt');
  T.ok(await k.heard('reason.dailyLimit'), 'the reason is announced (60 hands a day)');
  await t.clickUI('mg-bj-cashout');
  await k.closed();
  const bjRow = (await t.ui()).rows.filter((r) => r.action === 'casino.blackjack')[0];
  T.ok(bjRow && !bjRow.enabled, 'the blackjack row is disabled for the rest of the day');

  T.section('blackjack by gamepad: the D-pad picks and places chips, A deals and hits, B stands');
  await atCasino();
  await E(() => {
    window.__pad = { id: 'Mock pad (Xbox)', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    navigator.getGamepads = () => [window.__pad];
  });
  const pad = async (b) => {
    await E((b) => { window.__pad.buttons[b].pressed = true; window.__pad.buttons[b].value = 1; }, b);
    await t.step(1);
    await E((b) => { window.__pad.buttons[b].pressed = false; window.__pad.buttons[b].value = 0; }, b);
    await t.step(1);
  };
  await shoe([R(10), R(9), R(8), R(9)]);
  await k.quiet();
  await k.row('casino.blackjack');
  await pad(15);   // D-pad right: the $25 chip
  await pad(12);   // D-pad up: place it
  T.eq((await k.peek()).bet, 30, 'D-pad right then up adds the $25 chip');
  await pad(0);    // A: hit = deal while betting
  T.eq((await k.peek()).phase, 'play', 'A deals');
  await pad(1);    // B: stand (the context shadows Back)
  await settle();
  h = await lastHand();
  T.eq([h.bet, h.net], [30, 0], 'B stands: 18 against 18 pushes');
  T.ok((await k.acts()).some((a) => a.a === 'stand' && a.ctx === 'blackjack'), 'pad B fires `stand` in the blackjack context');
  await t.clickUI('mg-bj-cashout');
  await k.closed();

  T.section('blackjack on Hardcore: a dealt hand is pending; "By the book"');
  await atCasino({ difficulty: 'hardcore' });
  await shoe([R(10), R(9), R(6), R(9), R(10)]);
  await bjOpen();
  await key('Enter', 30);
  const pend = await k.state('pending');
  T.ok(pend && pend.resolve === 'casino.blackjack:resolve' && pend.worst.live === 30, 'Hardcore: the hand out is written to state.pending as a $30 loss', pend);
  const bb = await E(() => {
    const c = SR.minigame.current(), q = c.inst.peek();
    return { round: q.round, rng: SR.rng.rules.state(), shoe: JSON.parse(JSON.stringify(SR.state.casino.shoe)) };
  });
  await t.clickUI('mg-auto');
  await k.closed();
  const byBook = await lastHand();
  const expect = await E((bb) => {
    // Replay "by the book" from the dealt hand: the engine's shoe is the state's copy advanced by the deal.
    const B = SR.rules.casino.bj, sh = bb.shoe; sh.pos = 4; sh.running = B.hilo(sh.cards[0]) + B.hilo(sh.cards[1]) + B.hilo(sh.cards[2]);
    const rng = SR.rng.create(1); rng.setState(bb.rng);
    return B.playBook(bb.round, sh, rng);
  }, bb);
  T.eq(byBook.net, Math.round(expect), 'Auto plays the hand by basic strategy (SR.rules.casino.bj.playBook)');
  T.eq(await k.state('pending'), null, 'the applied hand clears the pending stake');

  T.section('blackjack: a sampled Auto (the simulator) deals new cards each time');
  const sampled = await E(() => {
    const pos = [SR.state.casino.shoe.pos], hands = [SR.state.daily.bjHands];
    for (let i = 0; i < 3; i++) {
      const r = SR.minigame.auto('blackjack', { bet: 5 });
      SR.act('casino.blackjack:resolve', r);
      pos.push(SR.state.casino.shoe.pos);
      hands.push(SR.state.daily.bjHands);
    }
    return { pos, hands };
  });
  T.ok(sampled.pos.every((x, i) => i === 0 || x > sampled.pos[i - 1]), 'each applied sample moves the saved shoe past its cards', sampled.pos);
  T.eq(sampled.hands.map((x) => x - sampled.hands[0]), [0, 1, 2, 3], 'and counts toward the 60-hand day');

  // ------------------------------------------------------------------------------------------
  // Roulette: pockets forced by setting the rules stream to a seed whose next draw is the pocket.
  const seedFor = (pocket) => E((pocket) => { for (let s = 1; s < 100000; s++) if (SR.rng.create(s).int(0, 37) === pocket) return s; return null; }, pocket);
  async function spinOn(pocket) {
    const s = await seedFor(pocket);
    await k.rngSeed(s);
    await key('Space', 1);
    for (let i = 0; i < 400; i++) { const q = await k.peek(); if (!q.spinning) break; await t.step(10); }
  }
  const G = { x: 494, y: 40, cw: 54, rh: 64 };
  const box = async () => E(() => { const c = document.querySelector('[data-id="mg-canvas"]').getBoundingClientRect(); return { x: c.left, y: c.top, w: c.width, h: c.height }; });
  let bx;
  const click = async (x, y) => { await t.page.mouse.click(bx.x + x * bx.w / 1280, bx.y + y * bx.h / 576); await t.step(1); };

  T.section('roulette: every bet type placed by mouse pays per B-14c (pocket 17)');
  await atCasino();
  await k.row('casino.roulette');
  cur = await k.cur();
  T.eq([cur.id, cur.context], ['roulette', 'roulette'], 'the roulette engine with its `roulette` context');
  T.ok(await E(() => document.querySelector('[data-id="mg-auto"]').style.display === 'none'), 'roulette has no Auto');
  bx = await box();
  const cx = (c) => G.x + (c + 0.5) * G.cw, cy = (r) => G.y + (r + 0.5) * G.rh;
  const bottom = G.y + 3 * G.rh;
  await click(cx(5), cy(1));                    // straight 17
  await click(G.x + 6 * G.cw, cy(1));           // split 17-20
  await click(cx(5), G.y + G.rh);               // split 17-18
  await click(G.x + 6 * G.cw, G.y + G.rh);      // corner 17-18-20-21
  await click(cx(5), bottom + 10);              // street 16-18
  await click(G.x + 6 * G.cw, bottom + 10);     // six line 16-21
  await click(G.x + 6 * G.cw, bottom + 20 + 24);   // dozen 2
  await click(G.x + 12 * G.cw + 27, cy(1));     // column 2
  for (let o = 0; o < 6; o++) await click(G.x + (o + 0.5) * 2 * G.cw, bottom + 20 + 48 + 24);   // 1-18 even red black odd 19-36
  p = await k.peek();
  const types = p.bets.map((b) => b.type).sort();
  T.eq(types, ['black', 'column', 'corner', 'dozen', 'even', 'high', 'low', 'odd', 'red', 'sixLine', 'split', 'split', 'straight', 'street'],
    'one chip on each: straight, two splits, corner, street, six line, dozen, column and the six even-money boxes');
  const placed = p.bets;
  await k.shot('casino-roulette-bets');
  T.eq(await k.audit(), [], 'the roulette frame passes the a11y audit');
  await k.clearLogs();
  await spinOn(17);
  let rg = (await gambles('casino.roulette.spin:resolve'))[0];
  T.eq(rg.pocket, 17, 'the ball lands in 17 (the rules\' draw)');
  T.eq(rg.net, rouletteNet(placed, 17), 'every bet pays per B-14c (35 / 17 / 17 / 8 / 11 / 5 / 2 / 2 / 1 …)');
  T.ok(await k.heard('mg.roulette.resultWin') || await k.heard('mg.roulette.resultLose'), '"Black 17. You win …" is announced');
  T.eq((await k.peek()).last, 17, 'the wheel and the board show 17');
  await k.shot('casino-roulette-17');

  T.section('roulette: 0 and 00 lose every outside bet');
  await k.clearLogs();
  await spinOn(0);
  rg = (await gambles('casino.roulette.spin:resolve'))[0];
  T.eq([rg.pocket, rg.net], [0, -placed.reduce((a, b) => a + b.amount, 0)], 'pocket 0: every bet on the table loses (the bets stay for the next spin)');
  await k.clearLogs();
  await spinOn(37);
  rg = (await gambles('casino.roulette.spin:resolve'))[0];
  T.eq([rg.pocket, rg.net], ['00', rouletteNet(placed, 37)], 'pocket 00 likewise');

  T.section('roulette by keyboard: C clears, arrows move, Enter places, 1-4 chips, Space spins');
  await key('KeyC');
  T.eq((await k.peek()).bets.length, 0, 'C clears the bets');
  // From the last box clicked (19 to 36) walk up into the grid, left to the zeros and up to 00;
  // place $25 there, then walk down to 0 and place $5.
  await key('Digit2');
  for (let i = 0; i < 5; i++) await key('ArrowUp');
  for (let i = 0; i < 40 && (await k.peek()).active.X > -2; i++) await key('ArrowLeft');
  for (let i = 0; i < 4 && (await k.peek()).active.Y > 0; i++) await key('ArrowUp');
  p = await k.peek();
  T.eq(p.active.bet, { type: 'straight', n: '00' }, 'the arrows reach 00');
  await key('Enter');
  await key('Digit1');
  for (let i = 0; i < 6 && JSON.stringify((await k.peek()).active.bet) !== JSON.stringify({ type: 'straight', n: 0 }); i++) await key('ArrowDown');
  await key('Enter');
  p = await k.peek();
  T.eq(p.bets.map((b) => [b.type, b.n, b.amount]), [['straight', '00', 25], ['straight', 0, 5]], '$25 on 00 and $5 on 0');
  T.ok(await k.heard('mg.roulette.placed'), 'each chip is announced');
  await k.clearLogs();
  await spinOn(37);
  rg = (await gambles('casino.roulette.spin:resolve'))[0];
  T.eq(rg.net, 25 * 35 - 5, 'a straight on 00 pays 35:1');
  T.eq((await k.peek()).history.slice(0, 4), [37, 37, 0, 17], 'the last pockets are listed (00 first)');

  T.section('roulette: the table limit ($2,000 a spin, orig)');
  await key('KeyC');
  await key('Digit4');
  for (let i = 0; i < 5; i++) await key('Enter');
  T.eq((await k.peek()).total, 2000, 'four $500 chips reach the limit; the fifth is refused');
  T.ok(await k.heard('mg.roulette.limit'), 'the limit is announced');
  const km = (await k.state()).stats.karma;
  await E(() => { SR.state.daily.gambleKarma = 9; });
  await spinOn(5);
  await spinOn(6);
  T.eq((await k.state()).stats.karma, km - 1, 'the day\'s tenth gamble costs karma, the eleventh does not (-10 a day)');
  await key('Backspace', 2);
  T.eq((await k.cur()).panel, 'pause', 'Backspace stays Back (the pause panel)');
  await key('Escape', 2);
  await t.clickUI('mg-roulette-cashout');
  await k.closed();
  T.ok((await k.acted()).some((a) => a.id === 'casino.roulette:resolve' && a.ok), 'cash out resolves the session');

  T.section('no console errors');
  T.eq(t.errors(), [], 'zero console errors, page errors or failed requests');
  await t.close();
  T.done();
})().catch((e) => { console.error(e); process.exit(1); });
