// tests/e2e/run40.test.cjs — owner: lead (the wave-2 exit gate, BUILD_PLAN §4.14 "Remastered
// Original"). A scripted 40-day run: a bot drives a Medium (40-day) Standard game through SR.debug
// and SR.act (and the card's rows where a row opens a minigame, a sub-screen or a confirm) from the
// city to the Final Edition. It works (McSticks, then New Lines Inc. once INT allows), studies,
// trains, eats when hurt, buys the bed and the TV at Fine Line and the alarm clock at the pawn shop,
// robs the Five-O once (the Hold-up played on Auto; a lost one serves its Jail Days), smuggles once
// (the alarm and a caffeine pill wake it at 00:00 for the red-eye; whatever the trip brings), falls
// off the south edge once at low HP (the Stick General night, presented without the fast skip) and
// sleeps every other night at home through the report scene. Every morning, and after every action,
// it checks the invariants: money ≥ 0 (cash, bank, no NaN), HP ≤ HP max = 15 + STR, the clock
// within the day (0-1440), stats and karma, Heat and Buzz in range, and the day count (each night
// adds exactly one day). The last night leads to the results, which show a rank. Zero console
// errors. Screenshots in shots/W2-Exit/ (git-ignored).
// The wave-2 save fixture (BUILD_PLAN §4.14, §5: the v2 migration's input): `--capture` stops the
// bot on the morning of day 20 for a debug-assisted purchase (the cash for the TV and the P0
// satellite, bought at Fine Line through SR.act), lets it work its morning shift and writes slot 1
// from inside the home to tests/fixtures/save-v1-wave2.json (meta.savedAt, meta.playSec and the
// thumbnail normalised, so a capture is reproducible); the run then goes on to the results as
// usual. Every run (capture or not) ends by loading that fixture into this build: it reads as a
// v1 save, deep-fills and validates, the satellite's channels are on, and it survives a night.
//   node tests/e2e/run40.test.cjs              the run and the fixture check
//   node tests/e2e/run40.test.cjs --capture    the same, re-capturing the fixture first
'use strict';
const fs = require('fs');
const path = require('path');
const h = require('../harness.cjs');

const FIXTURE = path.join(h.ROOT, 'tests', 'fixtures', 'save-v1-wave2.json');
const CAPTURE = process.argv.includes('--capture');
const CAPTURE_DAY = 20;

const SHOTS = path.join(h.ROOT, 'shots', 'W2-Exit');
const DAYS = 40;
const HP_BASE = 15;                       // BALANCE B-02 hpMaxBase: HP max = 15 + STR
const ROB_FROM = 8, SMUGGLE_FROM = 14, FALL_FROM = 22;   // the earliest day of each one-off

(async () => {
  const T = h.suite('e2e run40 (wave-2 exit: the 40-day bot)');
  const t = await h.open({ fast: true });
  const ev = (fn, a) => t.eval(fn, a);
  const log = [];                         // one line per day: what the bot did
  const bad = [];                         // invariant failures (day, where, what)
  const did = { rob: null, smuggle: null, fall: null, capture: null, bed: 0, tv: 0, alarm: 0, nights: { sleep: 0, arrest: 0, jail: 0, hospital: 0 } };
  let today = [];
  let lastDay = 1;

  // ---- page-side recorders -------------------------------------------------------------------
  await ev(() => {
    const SR = window.SR;
    window.__run = { days: [], over: [], trips: [], down: [], mg: [] };
    SR.events.on('day:started', (p) => window.__run.days.push(p.day));
    SR.events.on('game:over', (p) => window.__run.over.push(p.reason));
    SR.events.on('trip', (p) => window.__run.trips.push(p.outcome));
    SR.events.on('player:down', (p) => window.__run.down.push(p.outcome));
    SR.events.on('minigame:done', (p) => window.__run.mg.push(p.id));
  });
  const rec = () => ev(() => JSON.parse(JSON.stringify(window.__run)));

  /** The invariants of the run (BUILD_PLAN §4.14): @returns {Promise<{bad: string[], s: object}>} */
  const invariants = () => ev((base) => {
    const SR = window.SR, s = SR.state, out = [];
    if (!s) return { bad: ['no state'], s: null };
    const m = s.money, st = s.stats;
    ['cash', 'bank', 'lien'].forEach((k) => { if (!(Number.isFinite(m[k]) && m[k] >= 0)) out.push('money.' + k + ' = ' + m[k]); });
    if (m.loan && !(m.loan.amount >= 0)) out.push('loan ' + JSON.stringify(m.loan));
    if (st.hpMax !== base + st.str) out.push('HP max ' + st.hpMax + ' ≠ 15 + STR ' + st.str);
    if (!(Number.isInteger(st.hp) && st.hp >= 0 && st.hp <= st.hpMax)) out.push('HP ' + st.hp + ' / ' + st.hpMax);
    ['str', 'int', 'cha'].forEach((k) => { if (!(Number.isInteger(st[k]) && st[k] >= 0 && st[k] <= 999)) out.push(k + ' = ' + st[k]); });
    if (!(st.karma >= -100 && st.karma <= 100)) out.push('karma ' + st.karma);
    if (!(st.heat >= 0 && st.heat <= 100)) out.push('heat ' + st.heat);
    if (!(st.buzz >= 0 && st.buzz <= 5)) out.push('buzz ' + st.buzz);
    if (!(Number.isInteger(s.clock.min) && s.clock.min >= 0 && s.clock.min <= 1440)) out.push('clock.min ' + s.clock.min);
    if (!(Number.isInteger(s.clock.day) && s.clock.day >= 1)) out.push('clock.day ' + s.clock.day);
    Object.keys(s.items).forEach((k) => { const v = s.items[k]; if (typeof v === 'number' && !(v >= 0 && v <= 99)) out.push('items.' + k + ' = ' + v); });
    return { bad: out, s: JSON.parse(JSON.stringify(s)) };
  }, HP_BASE);
  const check = async (where) => {
    const r = await invariants();
    r.bad.forEach((b) => bad.push('day ' + (r.s ? r.s.clock.day : '?') + ' ' + where + ': ' + b));
    return r.s;
  };

  // ---- driving -------------------------------------------------------------------------------
  const quiet = () => ev(() => { const U = window.SR.ui; if (U.stamp && U.stamp.clear) U.stamp.clear(); if (U.toast && U.toast.clear) U.toast.clear(); });
  const scenes = () => t.scenes();
  const top = async () => (await scenes()).slice(-1)[0];
  const state = () => t.state();
  const ok = async (id, params) => { const p = await t.preview(id, params || {}); return !!(p && p.ok && !p.hidden); };
  /** Runs an action through SR.debug.act (SR.act) when its preview allows it; checks the invariants. */
  const act = async (id, params, note) => {
    if (!(await ok(id, params))) return null;
    const r = await t.act(id, params || {});
    await t.step(1);
    await check(id);
    if (r && r.ok && note !== '') today.push(note || id.replace(/^[a-z]+\./, ''));
    return r && r.ok ? r : null;
  };
  /** Back to the city from a building card (Leave), whatever sat on top. */
  const toCity = async () => {
    for (let i = 0; i < 8 && (await scenes()).join() !== 'city'; i++) {
      const sc = await scenes();
      if (sc.indexOf('results') >= 0 || sc.indexOf('jail') >= 0 || sc.indexOf('hospital') >= 0 || sc.indexOf('report') >= 0) return;
      await quiet();
      await t.press('back');
      await t.step(2);
    }
  };
  const visit = async (building) => { await toCity(); await t.enter(building); await t.step(2); };
  /** Steps until the minigame frame closes. */
  const mgClosed = async () => { for (let i = 0; i < 60 && (await scenes()).indexOf('minigame') >= 0; i++) await t.step(10); };

  /** After a night of any kind: the morning's day is exactly one more, and the invariants hold. */
  const morning = async (kind) => {
    const s = await check('morning after ' + kind);
    did.nights[kind]++;
    if (s && !s.over && s.clock.day !== lastDay + 1) bad.push('day ' + s.clock.day + ': expected day ' + (lastDay + 1) + ' after a ' + kind + ' night');
    // The morning a sleep starts: 08:00, 04:00 with the alarm, 00:00 with a pill too (B-01).
    if (s && !s.over && kind === 'sleep' && s.clock.min !== s.clock.wake) bad.push('day ' + s.clock.day + ': woke at ' + s.clock.min + ', not at the wake time ' + s.clock.wake);
    if (s && !s.over && kind === 'sleep' && s.clock.wake !== 480 - (s.items.alarm ? 240 : 0) - (did.pillNight === s.clock.day ? 240 : 0)) bad.push('day ' + s.clock.day + ': the wake time ' + s.clock.wake);
    // The HUD in the city follows the state: the day, the time and the cash.
    if (s && !s.over && (await scenes()).join() === 'city') {
      await t.step(2);
      const hud = await ev(() => ['hud-day', 'hud-time', 'hud-cash'].map((id) => { const e = document.querySelector('#ui [data-id="' + id + '"]'); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; }));
      const want = await ev((s) => [String(s.clock.day), window.SR.text.time(s.clock.min), window.SR.text.money(s.money.cash)], s);
      if (!(hud[0] && hud[0].indexOf(want[0]) >= 0 && hud[1] && hud[1].indexOf(want[1]) >= 0 && hud[2] === want[2])) bad.push('day ' + s.clock.day + ': the HUD reads ' + JSON.stringify(hud) + ', the state ' + JSON.stringify(want));
    }
    log.push('day ' + lastDay + ' [' + today.join(', ') + '] → ' + kind + (s ? ' · $' + s.money.cash + '+' + s.money.bank + ' HP ' + s.stats.hp + '/' + s.stats.hpMax + ' STR ' + s.stats.str + ' INT ' + s.stats.int + ' CHA ' + s.stats.cha : ''));
    today = [];
    if (s) lastDay = s.over ? lastDay + 1 : s.clock.day;
  };

  /** Clicks through the report scene (Continue; an election page turns first) until it is gone. */
  const throughReport = async () => {
    for (let i = 0; i < 8 && (await scenes()).indexOf('report') >= 0; i++) {
      await quiet();
      await t.press('confirm');
      await t.step(3);
    }
  };

  /** Sleeps at home: the card's Sleep row, the morning paper, its button into the next day. */
  const sleep = async () => {
    await visit('home');
    await quiet();
    await t.clickUI('row-home.sleep');
    await t.step(2);
    if ((await top()) !== 'report') bad.push('day ' + lastDay + ': Sleep did not open the report (' + (await scenes()).join(' > ') + ')');
    await throughReport();
    await t.step(2);
    await morning('sleep');
  };

  /** One Jail Day (or Walk out once released). */
  const jailDay = async () => {
    const s = await state();
    await quiet();
    if (s.jail) {
      const pick = s.stats.hp < s.stats.hpMax / 2 ? 'jail.hp' : ['jail.str', 'jail.int', 'jail.cha'][s.clock.day % 3];
      today.push(pick);
      await t.clickUI('row-' + pick);
      await t.step(2);
      await morning('jail');
    } else {
      await t.clickUI('card-leave');
      await t.step(3);
    }
  };

  /** The Stick General night, presented for real (fast off): the gag, the card, the discharge, the paper. */
  const hospital = async () => {
    for (let i = 0; i < 40; i++) {
      const sc = await scenes();
      if (sc.indexOf('hospital') < 0 && sc.indexOf('report') < 0) break;
      await quiet();
      await t.step(30);
      await t.press('confirm');
      await t.step(5);
    }
    await t.fast(true);
    await t.step(3);
    await morning('hospital');
  };

  // ---- the bot's day -------------------------------------------------------------------------
  const FOODS = ['mcsticks.tripleburger', 'mcsticks.cheeseburger', 'mcsticks.fries'];   // biggest first
  /** Eats at McSticks while HP is under 60 % (the biggest meal that fits the cash). */
  const eat = async () => {
    let s = await state();
    if (s.stats.hp >= s.stats.hpMax * 0.6) return;
    await visit('mcsticks');
    for (let i = 0; i < 3; i++) {
      s = await state();
      if (s.stats.hp >= s.stats.hpMax * 0.6) break;
      let ate = false;
      for (const id of FOODS) if (await act(id, {})) { ate = true; break; }
      if (!ate) break;
    }
  };

  /** The shopping list: the bed, the alarm, the TV (cash kept for food), the gun and ammo for the hold-up. */
  const shop = async (day) => {
    let s = await state();
    const cash = () => s.money.cash + s.money.bank;
    const buyPiece = async (piece) => {
      await visit('furniture');
      const r = await act('furniture.buy', { piece }, 'buy ' + piece);
      s = await state();
      return !!r;
    };
    if (!s.furniture.owned.bed && cash() >= 700 && s.money.cash >= 500) did.bed = (await buyPiece('bed')) ? day : 0;
    if (!s.items.alarm && s.money.cash >= 350) {
      await visit('pawn');
      if (await act('pawn.alarm', {}, 'buy alarm')) did.alarm = day;
      s = await state();
    }
    if (!did.rob && day >= ROB_FROM - 2 && (!s.items.gun || s.items.ammo < 10) && s.money.cash >= 500) {
      await visit('pawn');
      if (!s.items.gun) await act('pawn.gun', {}, 'buy gun');
      for (let i = 0; i < 2; i++) { s = await state(); if (s.items.ammo < 10) await act('pawn.ammo', {}, 'buy ammo'); }
      s = await state();
    }
    if (!s.furniture.owned.tv && s.furniture.owned.bed && s.items.alarm && (did.rob || day > ROB_FROM + 6)) {
      if (s.money.cash < 2600 && s.money.bank > 0 && cash() >= 2700) {
        await visit('bank');
        await act('bank.withdraw', { amount: Math.min(s.money.bank, 2700 - s.money.cash) }, 'withdraw');
        s = await state();
      }
      if (s.money.cash >= 2600) did.tv = (await buyPiece('tv')) ? day : 0;
    }
  };

  /** A full shift where the track has one. */
  const work = async (track) => {
    const s = await state();
    if (!s.job.ranks[track]) return;
    await visit(track);
    await act(track + '.work', { variant: 'full' }, 'work ' + track);
  };

  /** New Lines Inc.: apply once INT allows, ask for a promotion whenever the ladder allows it. */
  const career = async () => {
    const s = await state();
    if (!s.job.ranks.nli) {
      if (await ok('nli.apply', {})) { await visit('nli'); await act('nli.apply', {}, 'hired at NLI'); }
      return;
    }
    if (await ok('nli.promote', {})) { await visit('nli'); await act('nli.promote', {}, 'promoted'); }
  };

  /** Fills the rest of the day: study (INT), the gym (STR) when HP allows, a beer for CHA now and then. */
  const train = async (day) => {
    for (let i = 0; i < 12; i++) {
      const s = await state();
      if (s.clock.min > 1440 - 120) break;
      const want = s.stats.str < 40 && s.stats.hp > 12 ? 'uofs.gym' : 'uofs.study';
      if (s.stats.cha < 30 && day % 3 === 0 && s.money.cash > 200 && s.stats.buzz < 2 && (await ok('bar.beer', {}))) {
        await visit('bar');
        if (await act('bar.beer', {}, 'beer')) continue;
      }
      await visit('uofs');
      if (!(await act(want, {})) && !(await act('uofs.study', {}))) break;
    }
  };

  /** The hold-up at the Five-O: the card row, its confirm, the Duel frame on Auto. */
  const rob = async (day) => {
    const s = await state();
    if (did.rob || day < ROB_FROM || !s.items.gun || s.items.ammo < 10 || !(await ok('store.rob', {}))) return false;
    await visit('store');
    await quiet();
    await t.clickUI('row-store.rob');
    await t.step(2);
    if ((await top()) === 'confirm') { await t.clickUI('confirm-row-yes'); await t.step(2); }
    if ((await top()) !== 'minigame') { bad.push('day ' + day + ': the Hold-up did not open its frame (' + (await scenes()).join(' > ') + ')'); return false; }
    await t.clickUI('mg-auto');
    await mgClosed();
    await t.step(3);
    const after = await check('after the hold-up');
    did.rob = { day, jailed: !!(after && after.jail), loot: after ? after.money.cash - s.money.cash : 0 };
    today.push('rob → ' + (did.rob.jailed ? 'caught' : '+$' + did.rob.loot));
    await shot('run40-holdup-after');
    // Caught: the arrest night has run already (CONTRACT §8.10), the next morning in the cell.
    if (did.rob.jailed) await morning('arrest');
    return did.rob.jailed;
  };

  /** The evening before the trip: one caffeine pill (with the alarm, the wake is 00:00) and bottles. */
  const prepTrip = async (day) => {
    const s = await state();
    if (did.smuggle || day < SMUGGLE_FROM - 1 || !s.items.alarm || s.items.pills > 0 || s.money.cash < 260) return;
    await visit('store');
    if (await act('store.pills', {}, 'buy a pill')) did.pillNight = day + 1;
    await visit('bar');
    for (let i = 0; i < 5; i++) await act('bar.bottle', {}, i ? '' : 'buy bottles');
  };

  /** 00:00: the savings into the bank, then the red-eye to Gustytown (booze wanted) from the board. */
  const smuggle = async (day) => {
    let s = await state();
    await visit('bank');
    const keep = 130;
    if (s.money.cash > keep) await act('bank.deposit', { amount: s.money.cash - keep }, 'deposit');
    await visit('bus');
    await quiet();
    await t.clickUI('row-bus.board');
    await t.step(1);
    await t.clickUI('bus-redeye-gusty');
    await t.step(1);
    await t.clickUI('confirm-board-yes');
    await t.page.waitForTimeout(20);
    await t.step(2);
    if ((await top()) !== 'bustrip') { bad.push('day ' + day + ': the red-eye did not board (' + (await scenes()).join(' > ') + ')'); return; }
    s = await state();
    const outcome = s.trade.offer ? s.trade.offer.outcome : null;
    if (outcome === 'offer') { await t.clickUI('trip-take'); await t.step(2); }
    await shot('run40-trip-card');
    for (let i = 0; i < 6 && (await top()) === 'bustrip'; i++) { await quiet(); await t.press('confirm'); await t.step(3); }
    const trips = (await rec()).trips;
    did.smuggle = { day, outcome: trips.slice(-1)[0] || outcome };
    today.push('red-eye → ' + did.smuggle.outcome);
    await check('after the red-eye');
  };

  /** Down to ≤ 10 HP with smokes (-10 HP a pack smoked), then off the Main Street south end. */
  const fall = async (day) => {
    let s = await state();
    if (did.fall || day < FALL_FROM || s.clock.min > 1200) return false;
    await visit('store');
    for (let i = 0; i < 6 && (await state()).stats.hp > 10; i++) {
      s = await state();
      if (!s.items.smokes) await act('store.smokes', {}, i ? '' : 'buy smokes');
      if (!(await act('bag.smoke', {}, 'smoke'))) break;
    }
    s = await state();
    if (s.stats.hp > 10) return false;
    await toCity();
    await t.fast(false);
    await t.teleport(2489, 4040);
    const walk = await ev(() => {
      const SR = window.SR, F = SR.world.fall;
      let n = 0, fell = false;
      SR.input.inject('down', true);
      while (n < 240 && !F.active()) { SR.loop.step(1); n++; }
      SR.input.inject('down', false);
      while (n < 900 && F.active()) { fell = fell || F.phase === 'drop' || F.phase === 'catch' || F.phase === 'land'; SR.loop.step(1); n++; }
      for (let i = 0; i < 10; i++) SR.loop.step(1);
      return { fell, scenes: SR.scenes.stack(), n };
    });
    did.fall = { day, hp: s.stats.hp, fell: walk.fell, scenes: walk.scenes };
    today.push('fall at ' + s.stats.hp + ' HP');
    await shot('run40-hospital');
    return true;
  };

  const shot = async (name) => { await quiet(); await t.step(1); return t.shot(path.join(SHOTS, name + '.png')); };

  /**
   * --capture: the mid-game v1 save with the satellite (debug-assisted: the cash for the TV and the
   * satellite), written from the home card after the morning shift.
   */
  const capture = async (day) => {
    const s = await state();
    const need = (s.furniture.owned.tv ? 0 : 2500) + 3000 + 300;
    if (s.money.cash < need) await t.set({ money: { cash: need } });
    await visit('furniture');
    if (!s.furniture.owned.tv) await act('furniture.buy', { piece: 'tv' }, 'buy tv (capture)');
    await act('furniture.buy', { piece: 'satellite' }, 'buy satellite (capture)');
    await work('mcsticks');
    await toCity();
    await ev(() => window.SR.world.place('homeDoor', window.SR.state));   // walked home: the save stands at its door
    await visit('home');
    const env = await ev(() => {
      const SR = window.SR;
      SR.save.write('slot1');
      const e = JSON.parse(SR.save.storage.get('sr1.slot1'));
      SR.save.remove('slot1');
      return e;
    });
    env.meta.savedAt = 1790000000000;
    env.meta.playSec = 3600 * 6;
    env.meta.thumb = '';
    fs.writeFileSync(FIXTURE, JSON.stringify(env, null, 1) + '\n');
    today.push('captured ' + path.basename(FIXTURE));
    did.capture = { day, min: env.state.clock.min, furniture: env.state.furniture.owned };
    did.tv = did.tv || day;
  };

  try {
    T.section('a Medium Standard game: the bot\'s 40 days');
    const s0 = await t.newGame({ seed: Number(process.env.RUN40_SEED) || 4040, name: 'Botty', length: DAYS, difficulty: 'standard' });
    T.eq([s0.mode.length, s0.mode.difficulty, s0.clock.day, s0.clock.min, s0.money.cash], [DAYS, 'standard', 1, 480, 100], 'a 40-day Standard game: day 1, 08:00, $100');
    await t.goto('city');
    await t.step(2);
    await check('start');

    let guard = 0;
    while (guard++ < DAYS * 3) {
      const sc = await scenes();
      if (sc.indexOf('results') >= 0) break;
      if (sc.indexOf('jail') >= 0) { await jailDay(); continue; }
      if (sc.indexOf('hospital') >= 0 || sc.indexOf('report') >= 0) { await hospital(); continue; }
      const s = await state();
      if (!s || s.over) break;
      const day = s.clock.day;
      if (s.clock.min === 0 && !did.smuggle && s.items.booze > 0) {
        await smuggle(day);
        if ((await scenes()).indexOf('jail') >= 0) continue;
        await sleep();
        continue;
      }
      await eat();
      if (CAPTURE && day === CAPTURE_DAY && !did.capture) await capture(day);
      await shop(day);
      await work('mcsticks');
      await career();
      await work('nli');
      if (await rob(day)) continue;
      await shop(day);
      if (await fall(day)) continue;
      await prepTrip(day);
      await train(day);
      await eat();
      await sleep();
    }

    T.section('what the run did');
    console.log('  ' + log.join('\n  '));
    const R = await rec();
    const end = await state();
    T.eq(bad, [], 'every invariant held every day and after every action (money ≥ 0, HP ≤ 15 + STR, the clock within the day, one day per night)');
    T.eq(lastDay, DAYS + 1, 'the run lasted ' + DAYS + ' days (' + did.nights.sleep + ' slept, ' + (did.nights.arrest + did.nights.jail) + ' in jail, ' + did.nights.hospital + ' in hospital)');
    T.eq(R.days.length, DAYS, 'day:started once per night: ' + DAYS + ' nights');
    T.ok(did.nights.sleep >= DAYS - 8, 'the bot slept at home every free night (' + did.nights.sleep + ')');
    T.ok(end.furniture.owned.bed >= 1 && end.furniture.owned.tv >= 1 && end.items.alarm === 1,
      'it bought the bed (day ' + did.bed + '), the TV (day ' + did.tv + ') and the alarm clock (day ' + did.alarm + ')', end.furniture.owned);
    T.ok(!!did.rob && R.mg.indexOf('duel') >= 0 && end.records.robberies >= 1, 'it robbed the Five-O once, the Hold-up played on Auto', did.rob);
    T.ok(!!did.smuggle && R.trips.length === 1, 'it took the red-eye once (' + (did.smuggle && did.smuggle.outcome) + ')', R.trips);
    T.ok(!!did.fall && did.fall.fell && end.records.falls >= 1 && end.records.hospital >= 1 && R.down.indexOf('hospital') >= 0,
      'it fell off the south end at ' + (did.fall && did.fall.hp) + ' HP and spent the night at Stick General', did.fall);
    T.ok(end.job.ranks.nli && end.job.totalShifts >= DAYS / 2, 'it worked (' + end.job.totalShifts + ' shifts; NLI ' + end.job.ranks.nli + ')');
    T.ok(end.stats.int > 100, 'it studied (INT ' + end.stats.int + ')');

    T.section('the results');
    T.eq([await scenes(), R.over], [['results'], ['time']], 'the last night leads to the results (game:over once, reason time)');
    T.eq([end.over, end.result && end.result.reason], [true, 'time'], 'the game is over, its result filed');
    await t.step(200);
    const page = await ev(() => {
      const SR = window.SR, st = document.querySelector('#ui [data-id="results-stamp"]');
      const info = SR.reg.scene.results.info();
      const r = SR.state.result;
      return { stamp: st ? st.textContent.trim() : null, rank: r.rank, text: SR.text.has(r.rankKey) ? SR.text(r.rankKey) : null, phase: info && info.phase,
        known: !!SR.reg.rank[r.rank] };
    });
    T.ok(!!page.stamp && page.known && page.stamp === page.text && page.phase === 'done', 'the Final Edition stamps a rank: ' + page.stamp, page);
    T.ok(/Final Edition · Day 40 of 40/i.test(await t.uiText()), 'the Final Edition of day 40 of 40');
    T.eq(await ev(() => window.SR.text.missing()), [], 'every text key of the 40 days resolves (the papers, the cards, the toasts)');
    await shot('run40-results');
    T.eq(t.errors(), [], 'zero console errors over the 40 days');

    T.section('the wave-2 save fixture (tests/fixtures/save-v1-wave2.json) plays in this build');
    if (CAPTURE) T.ok(!!did.capture, 'captured on day ' + (did.capture && did.capture.day) + ' at ' + (did.capture && did.capture.min) + ' min', did.capture);
    const raw = fs.readFileSync(FIXTURE, 'utf8');
    const env = JSON.parse(raw);
    T.eq([env.fmt, env.v, env.state.v, env.meta.day, env.state.clock.day, env.state.mode.length, env.state.over],
      ['sr-save', 1, 1, CAPTURE_DAY, CAPTURE_DAY, DAYS, false], 'a v1 envelope of a 40-day game on day ' + CAPTURE_DAY + ', not over');
    T.eq([env.state.furniture.owned.tv, env.state.furniture.owned.satellite], [1, 1], 'with the TV and the P0 satellite (the v2 migration turns it into the SkyDish tier)');
    const loaded = await ev((raw) => {
      const SR = window.SR;
      SR.save.storage.set('sr1.slot2', raw);
      const s = SR.save.load('slot2');
      SR.save.remove('slot2');
      return s ? { day: s.clock.day, problems: SR.save.validate(s), v: s.v, sat: s.furniture.owned.satellite } : { error: SR.save.lastError };
    }, raw);
    T.eq(loaded, { day: CAPTURE_DAY, problems: [], v: 1, sat: 1 }, 'SR.save loads it: deep-filled, valid, still v1 in this build');
    await t.goto('city');
    await t.step(2);
    await t.enter('home');
    await t.step(2);
    const tv = await ev(() => ['home.tvNews', 'home.tvFitness', 'home.tvDating'].map((id) => { const p = window.SR.preview(id, {}); return !!(p && !p.hidden); }));
    T.eq(tv, [true, true, true], 'its TV shows News, and the satellite\'s Fitness and Dating');
    await quiet();
    await t.clickUI('row-home.sleep');
    await t.step(2);
    await throughReport();
    const after = await state();
    T.eq([await scenes(), after.clock.day, after.over], [['city'], CAPTURE_DAY + 1, false], 'and it sleeps a night into day ' + (CAPTURE_DAY + 1));
    T.eq(t.errors(), [], 'zero console errors with the fixture');
  } catch (e) {
    console.log('  ' + log.join('\n  '));
    T.ok(false, 'threw: ' + (e && e.stack || e));
  } finally {
    await t.close();
  }
  T.done();
})().catch((e) => { console.error(e); process.exit(1); });
