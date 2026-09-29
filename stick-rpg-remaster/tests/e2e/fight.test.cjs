// tests/e2e/fight.test.cjs — owner: W2-Night. The Fight engine through Sticky's card on the real
// index.html (BUILD_PLAN §4.8; GDD §4.12, §6.3; BALANCE B-13; UI §5.8):
//   the row's start (3 h, -2 karma, +5 Heat, the open record) and the frame (the `fight` context);
//   AP, moves and damage ranges per B-13; a scripted fight replays exactly with SR.rules.fight on a
//   copy of the stream (real rolls from host.rng); the enemy table and the quirks; a Standard loss
//   (HP 1, the 10 % tab, never the hospital), Relaxed and Hardcore losses, the KO's ink blot; on
//   Hardcore a won fight (the wallet panel, the Quick fight) replaces the pending loss, so a tab
//   closed then reloads the win; the wallet (-3 karma) and the drink (P1); Run; the Quick fight (Auto) is a real sample; the "(it
//   froze)" joke; taunts and the accessible mirror; leaving mid-fight runs away; the hit shake
//   honours Reduced Motion (the setting and the system preference) and the screen-shake setting;
//   zero console errors.
// Screenshots: shots/W2-Night/fight-*.png.   node tests/e2e/fight.test.cjs
'use strict';
const K = require('./night-kit.cjs');

(async () => {
  const T = K.h.suite('e2e fight');
  const k = await K.open({});
  const { t, E } = k;

  /** A new game at Sticky's, 20:00, with the given stats and state patch. */
  async function atBar(opts, patch) {
    await t.newGame(Object.assign({ seed: 4242 }, opts || {}));
    await t.setTime(20 * 60);
    if (patch) await t.set(patch);
    await t.enter('bar');
    await t.step(2);
    await k.quiet();
    await k.clearLogs();
  }
  const entries = async () => (await k.peek()).entries.map((e) => e.id);
  const key = async (code, n) => { await t.key(code); await t.step(n === undefined ? 2 : n); };

  // ------------------------------------------------------------------------------------------
  T.section('the bar fight row opens the engine');
  await atBar({ stats: { str: 60 } });
  const before = await k.state();
  const pv = await t.preview('bar.fight');
  T.eq([pv.ok, pv.cost.min, pv.repeatable], [true, 180, false], 'Start a bar fight: 3 h (B-13 startCost), never repeatable');
  await k.row('bar.fight');
  const cur = await k.cur();
  T.eq([cur && cur.id, cur && cur.context, cur && cur.contextPushed], ['fight', 'fight', true], 'the frame runs the fight engine with its `fight` context pushed');
  T.ok(cur && cur.params.fight && cur.params.fight.kind === 'bar' && cur.params.stake === true, 'the engine plays the Fight the rules made (stake: the Hardcore hook)', cur && cur.params);
  const after = await k.state();
  T.eq([after.stats.karma - before.stats.karma, after.stats.heat - before.stats.heat, after.clock.min - before.clock.min], [-2, 5, 180],
    'the start costs -2 karma, +5 Heat and 3 h (B-13)');
  T.eq(after.fight.open && [after.fight.open.kind, after.fight.open.n, after.fight.open.fighter], ['bar', 1, 'wobbly_pete'], 'the open record: rung 1 (fights won + 1), Wobbly Pete');
  T.ok(await k.heard('taunt.wobbly_pete.1'), 'the opponent opens with his first taunt (announced)');
  const mirror = await E(() => { const n = document.querySelector('[data-id="mg-label-hp"]'); return n ? n.textContent : ''; });
  T.ok(/75/.test(mirror) && /Wobbly Pete/.test(mirror) && /4/.test(mirror), 'the accessible mirror names both HPs and the AP left', mirror);
  await k.shot('fight-start');
  T.eq(await k.audit(), [], 'the fight frame passes the a11y audit (names, roles, contrast)');

  // ------------------------------------------------------------------------------------------
  T.section('AP, moves and damage ranges (B-13)');
  let p = await k.peek();
  const apMax = Math.min(Math.floor(60 / 20) + 1, 15);
  T.eq(p.fight.me.apMax, apMax, 'AP = min(floor(STR / 20) + 1, 15) = 4 at STR 60');
  T.eq(await entries(), ['punch', 'kick', 'fireball', 'inkBeam', 'endTurn', 'run'], 'the move bar: Punch, Kick, Fireball, Ink Beam, End turn, Run (Guard is P1)');
  const hint0 = await E(() => document.querySelector('[data-id="mg-hint-0"]').textContent);
  T.ok(/^1-6/.test(hint0), 'the key hint spans the six buttons (1-6)', hint0);
  const mv = {}; p.entries.forEach((e) => { mv[e.id] = e; });
  T.eq([mv.punch.ap, mv.kick.ap, mv.fireball.ap, mv.inkBeam.ap], [1, 2, 3, 4], 'move costs 1 / 2 / 3 / 4 AP');
  // B-13 at STR 60, no gear, Buzz 0: punch rand((STR+10)/10) → 0..6; kick rand(STR/4.5) + 1 → 1..13;
  // fireball rand(STR/2.5) → 0..23; ink beam rand(STR/1.5) → 0..39; minimum 1; a crit ×1.5 (floor).
  const r15 = (v) => Math.floor(v * 1.5);
  T.eq([mv.punch.min, mv.punch.max], [1, r15(Math.floor(70 / 10) - 1)], 'punch 1-9 (a crit of 6)');
  T.eq([mv.kick.min, mv.kick.max], [1, r15(Math.floor(60 / 4.5) - 1 + 1)], 'kick 1-19 (a crit of 13)');
  T.eq([mv.fireball.min, mv.fireball.max], [1, r15(Math.floor(60 / 2.5) - 1)], 'fireball 1-34');
  T.eq([mv.inkBeam.min, mv.inkBeam.max], [1, r15(Math.floor(60 / 1.5) - 1)], 'ink beam 1-58');
  const btnText = await E(() => document.querySelector('[data-id="mg-fight-kick"]').textContent);
  T.ok(/2 AP/.test(btnText) && /1-19/.test(btnText), 'the Kick button shows its AP and damage range chips', btnText);

  // ------------------------------------------------------------------------------------------
  T.section('a scripted fight replays exactly on the rules (real rolls from host.rng)');
  const start = await E(() => ({ fight: JSON.parse(JSON.stringify(SR.minigame.current().params.fight)), rng: SR.rng.rules.state() }));
  await E(() => SR.debug.fast(true));
  let apSeen = [];
  for (let i = 0; i < 400; i++) {
    p = await k.peek();
    if (!p || p.phase === 'win' || p.phase === 'over') break;
    if (p.phase === 'player' && !p.queue && !p.beat) {
      apSeen.push(p.fight.me.ap);
      await key('Digit1', 1);   // punch: 1 AP
    } else await t.step(2);
  }
  T.ok(apSeen.slice(0, 4).join() === '4,3,2,1', 'each punch spends 1 AP; at 0 AP the enemy strikes', apSeen.slice(0, 6));
  T.ok(apSeen.indexOf(4, 1) > 0, 'a new turn starts with full AP', apSeen.slice(0, 10));
  const engine = p && p.fight;
  const replica = await E((start) => {
    const F = SR.rules.fight, f = JSON.parse(JSON.stringify(start.fight)), rng = SR.rng.create(1);
    rng.setState(start.rng);
    for (let i = 0; i < 2000 && f.phase !== 'over'; i++) {
      const r = F.playerMove(f, 'punch', rng);
      if (r.turnOver) F.endTurn(f, rng);
    }
    return f;
  }, start);
  T.eq([engine.outcome, engine.me.hp, engine.foe.hp, engine.turn], [replica.outcome, replica.me.hp, replica.foe.hp, replica.turn],
    'outcome, both HPs and the turn equal a replay on SR.rules.fight with the same stream');
  T.eq(engine.log, replica.log, 'every move, roll and hit of the log is the rules\' (B-13)');
  T.ok(engine.log.filter((e) => e.who === 'foe').every((e) => e.move === 'punch' || e.move === 'kick'),
    'rung 1 (P = 15): the enemy roll 1..15 only reaches punch (≤ 10) and kick (> 10)');
  T.ok(p.phase === 'win' && p.winOpen && p.picks === 1, 'the win panel offers the wallet only (P0)', p && [p.phase, p.winOpen, p.picks]);
  const walletSub = await E(() => document.querySelector('[data-id="mg-fight-pick-wallet"]').textContent);
  T.ok(new RegExp('karma ' + String(-3)).test(walletSub), 'the wallet\'s line names its karma from B-13 (tuning.fight.wallet.karma)', walletSub);
  await E(() => SR.debug.fast(false));
  await t.step(2);
  await k.shot('fight-win');
  const pre = await k.state();
  await key('Digit1');
  await k.closed();
  const post = await k.state();
  const wallet = post.money.cash - pre.money.cash;
  T.ok(wallet >= 10 + 15 && wallet <= 10 + 25, 'the wallet: $10 + 15n + rand(0..10n) at n = 1', wallet);
  T.eq([post.stats.karma - pre.stats.karma, post.stats.str - pre.stats.str, post.stats.hpMax - pre.stats.hpMax], [-3, 3, 3],
    'taking the wallet: -3 karma; the win: +3 STR and HP max with it (B-13)');
  T.eq([post.fight.won, post.fight.open, post.records.fightsWon], [1, null, 1], 'the ladder counter moves on and the open record closes');
  T.ok((await k.acted()).some((a) => a.id === 'bar.fight:resolve' && a.ok && a.toasts.indexOf('toast.fight.wallet') >= 0), 'bar.fight:resolve applied it (toast.fight.wallet)');

  // ------------------------------------------------------------------------------------------
  T.section('the enemy table and the quirks (B-13, GDD §6.3)');
  const table = await E(() => {
    const F = SR.rules.fight;
    const f0 = F.create(SR.state, 'bar', 6, SR.rng.create(3));        // Two-Beers Ted: P = 60, no quirk
    const stub = (vals) => { let i = 0; return { int: () => vals[i++] || 0, chance: () => false, float: () => 0 }; };
    const pick = (v) => { const f = JSON.parse(JSON.stringify(f0)); f.phase = 'player'; return F.endTurn(f, stub([v, 0])).move; };
    const acct = F.create(SR.state, 'bar', 3, SR.rng.create(3));
    const prof = F.create(SR.state, 'bar', 8, SR.rng.create(3));
    const profMove = (v) => { const f = JSON.parse(JSON.stringify(prof)); return F.endTurn(f, stub([v, 0])).move; };
    return { P: f0.foe.P, moves: [40, 39, 20, 19, 10, 9, 0].map(pick), acct: F.endTurn(acct, stub([0, 0])).move, profP: prof.foe.P,
      prof: [0, 40].map(profMove) };
  });
  T.eq(table.P, 6 + 9 * 6, 'ladder power P = 6 + 9n (rung 6: 60)');
  T.eq(table.moves, ['inkBeam', 'fireball', 'fireball', 'kick', 'kick', 'punch', 'punch'],
    'roll = rand(P) + 1: > 40 Ink Beam, > 20 fireball, > 10 kick, else punch');
  T.eq(table.acct, 'kick', 'The Accountant always kicks');
  T.eq(table.prof, ['fireball', 'inkBeam'], 'The Professor: the fireball band ×2 wide (every roll 1..40 is a fireball)');

  // ------------------------------------------------------------------------------------------
  T.section('a Standard loss: HP 1, 10 % of cash on the tab, never the hospital');
  await atBar({ stats: { str: 7 } }, { fight: { won: 11 }, money: { cash: 500 } });
  await E(() => SR.debug.fast(true));
  await k.row('bar.fight');
  p = await k.peek();
  T.eq([p.fight.n, p.fight.fighter], [12, 'old_man_knuckles'], 'eleven wins in: rung 12, Old Man Knuckles');
  const endIdx = (await entries()).indexOf('endTurn') + 1;
  for (let i = 0; i < 200 && (await t.scenes()).indexOf('minigame') >= 0; i++) { await key('Digit' + endIdx, 3); }
  await k.closed();
  let s = await k.state();
  T.eq([s.stats.hp, s.money.cash], [1, 450], 'Standard: HP 1 and $50 (10 % of $500) on the tab (B-13 lose.standard)');
  T.eq(await t.scenes(), ['building'], 'the bouncer throws you out: still at Sticky\'s, no hospital scene');
  T.ok((await k.acted()).some((a) => a.id === 'bar.fight:resolve' && a.toasts.indexOf('toast.fight.lose') >= 0 && !a.events.some((e) => e.name === 'down')),
    'the resolve raises no `down` event (HP 0 is never reached)');
  T.eq(s.fight.won, 11, 'a loss does not move the ladder');

  T.section('a Relaxed loss: HP 1, no cash lost');
  await atBar({ stats: { str: 7 }, difficulty: 'relaxed' }, { fight: { won: 11 } });
  const cash0 = (await k.state()).money.cash;
  await k.row('bar.fight');
  for (let i = 0; i < 200 && (await t.scenes()).indexOf('minigame') >= 0; i++) { await key('Digit' + endIdx, 3); }
  await k.closed();
  s = await k.state();
  T.eq([s.stats.hp, s.money.cash], [1, cash0], 'Relaxed: HP 1 and no tab (B-13 lose.relaxed)');

  T.section('a Hardcore loss goes through SR.rules.health.down (cause fight)');
  await atBar({ stats: { str: 7 }, difficulty: 'hardcore' }, { fight: { won: 11 } });
  await k.row('bar.fight');
  const pend = await k.state('pending');
  T.ok(pend && pend.resolve === 'bar.fight:resolve' && pend.worst && pend.worst.outcome === 'lose', 'Hardcore: the fight is a live stake (state.pending holds the loss)', pend);
  for (let i = 0; i < 200 && (await t.scenes()).indexOf('minigame') >= 0; i++) { await key('Digit' + endIdx, 3); }
  await k.closed();
  const downEv = (await k.acted()).filter((a) => a.id === 'bar.fight:resolve').map((a) => a.events.filter((e) => e.name === 'down')[0])[0];
  T.ok(downEv && downEv.payload.cause === 'fight' && /death|secondWind/.test(downEv.payload.outcome), 'Hardcore: HP 0 → health.down(cause fight): death unless Second Wind', downEv);
  await E(() => SR.debug.fast(false));

  T.section('Hardcore: a decided fight is no longer a stake (the wallet panel, the Quick fight)');
  // The frame saves the loss as `pending` when the fight opens; closing the tab while the wallet
  // panel waits for a pick must not reload as a KO (HP 0: death) for a fight you won.
  await atBar({ stats: { str: 999 }, difficulty: 'hardcore' });
  await k.row('bar.fight');
  await E(() => SR.debug.fast(true));
  await k.until((q) => q.phase === 'player' && !q.queue && !q.beat, 50, 1);
  await key('Digit4', 3);   // Ink Beam at STR 999 fells rung 1
  p = await k.until((q) => q.phase === 'win', 100, 2);
  let pendW = await k.state('pending');
  T.ok(p.phase === 'win' && pendW && pendW.resolve === 'bar.fight:resolve' && pendW.worst.outcome === 'win' && pendW.worst.choice === 'wallet',
    'the won fight replaces the pending loss (the wallet, the default pick)', pendW && pendW.worst);
  await t.reload();                                    // the tab closes at the wallet panel
  await K.install(t.page);
  const reloaded = await E(() => { SR.save.load('ironman'); const s = SR.state; return { over: s.over, hp: s.stats.hp, str: s.stats.str, won: s.fight.won, open: s.fight.open, pending: s.pending }; });
  T.ok(!reloaded.over && reloaded.hp > 0 && reloaded.won === 1 && reloaded.open === null && reloaded.pending === null,
    'reloading the ironman save applies the win: alive, the ladder moves on', reloaded);
  T.eq(reloaded.str, 999, 'the win\'s +3 STR (capped at 999)');
  await atBar({ stats: { str: 45 }, difficulty: 'hardcore' }, { fight: { won: 2 } });
  await k.row('bar.fight');
  await t.clickUI('mg-auto');
  await t.step(2);
  pendW = await k.state('pending');
  const qhc = await k.peek();
  T.ok(qhc.phase === 'over' && pendW && pendW.worst.outcome === qhc.fight.outcome && pendW.worst.hpLeft === qhc.fight.me.hp,
    'the Quick fight\'s result replaces it during the 2 s replay', [pendW && pendW.worst, qhc.fight.outcome]);
  await k.closed();
  T.eq(await k.state('pending'), null, 'the resolve clears it');

  T.section('the KO: an ink blot covers the fight before the result (ART_AUDIO §12)');
  await atBar({ stats: { str: 7 } }, { fight: { won: 11 } });
  await k.row('bar.fight');
  let koP = null;
  for (let i = 0; i < 600 && !(koP && koP.ko !== null); i++) {
    koP = await k.peek();
    if (!koP) break;
    if (koP.phase === 'player' && !koP.queue && !koP.beat) await key('Digit' + endIdx, 1); else await t.step(3);
  }
  const koCur = await k.cur();
  T.ok(koP && koP.ko !== null && koP.phase === 'over' && koCur && !koCur.finished, 'knocked out: the blot grows while the round is still open', koP && [koP.ko, koP.phase]);
  await t.step(40);   // 0.4 s of blot, then a short hold
  const koEnd = await k.cur();
  T.ok(!koEnd || koEnd.finished, 'then the round ends');
  await k.closed();
  T.eq((await k.done()).filter((d) => d.id === 'fight').pop().result.outcome, 'lose', 'with the loss');

  // ------------------------------------------------------------------------------------------
  T.section('Buy him a drink (P1 `nightlife`) and Guard');
  await E(() => SR.debug.feature('nightlife', true));
  await atBar({ stats: { str: 999 } });
  await k.row('bar.fight');
  T.ok((await entries()).indexOf('guard') === 4, 'with `nightlife` the Guard button sits after Ink Beam (1 AP)');
  T.ok(/^1-7/.test(await E(() => document.querySelector('[data-id="mg-hint-0"]').textContent)), 'and the key hint spans seven (1-7)');
  await E(() => SR.debug.fast(true));
  p = await k.until((q) => { return q.phase === 'win' || (q.phase === 'player' && !q.queue && !q.beat); }, 50, 1);
  await key('Digit4');   // Ink Beam at STR 999 fells rung 1
  p = await k.until((q) => q.phase === 'win', 100, 2);
  T.eq([p.phase, p.picks], ['win', 2], 'the win panel offers the wallet and the drink');
  const d0 = await k.state();
  await key('Digit2');
  await k.closed();
  const d1 = await k.state();
  T.eq([d1.money.cash - d0.money.cash, d1.stats.karma - d0.stats.karma, d1.stats.cha - d0.stats.cha], [-5, 1, 1],
    'Buy him a drink: -$5, +1 karma, +1 CHA (B-13 drink)');
  // Without $5 the rules would pay the wallet instead (-3 karma): the drink must be refused, not swapped.
  await atBar({ stats: { str: 999 } }, { money: { cash: 3 } });
  await k.row('bar.fight');
  await k.until((q) => q.phase === 'player' && !q.queue && !q.beat, 50, 1);
  await key('Digit4');
  p = await k.until((q) => q.phase === 'win', 100, 2);
  const drinkOff = await E(() => document.querySelector('[data-id="mg-fight-pick-drink"]').getAttribute('aria-disabled'));
  await key('Digit2');
  const stillWin = (await k.peek()).phase;
  await E(() => document.querySelector('[data-id="mg-fight-pick-drink"]').click());   // Playwright will not click an aria-disabled control
  await t.step(2);
  T.ok(drinkOff === 'true' && stillWin === 'win' && (await k.peek()).phase === 'win' && await k.heard('reason.needCash'),
    'with $3 the drink is shown refused ("Need $5"): neither 2 nor a click turns it into the wallet', [drinkOff, stillWin]);
  const w0 = await k.state();
  await key('Digit1');
  await k.closed();
  T.eq((await k.state()).stats.karma - w0.stats.karma, -3, 'the wallet is still there (-3 karma)');
  await E(() => { SR.debug.feature('nightlife', false); SR.debug.fast(false); });

  // ------------------------------------------------------------------------------------------
  T.section('Run away: no further cost');
  await atBar({ stats: { str: 30 } });
  await k.row('bar.fight');
  const r0 = await k.state();
  await key('Digit' + ((await entries()).indexOf('run') + 1));
  await k.closed();
  const r1 = await k.state();
  T.eq([r1.stats.hp, r1.money.cash, r1.stats.karma, r1.fight.open], [r0.stats.hp, r0.money.cash, r0.stats.karma, null], 'Run: HP, cash and karma as they were; the fight is closed');
  T.ok((await k.done()).some((d) => d.id === 'fight' && d.result.outcome === 'run'), 'the engine resolved { outcome: run }');

  // ------------------------------------------------------------------------------------------
  T.section('the Quick fight (Auto) is a real sample');
  await atBar({ stats: { str: 45 } }, { fight: { won: 2 } });
  await k.row('bar.fight');
  const qs = await E(() => ({ fight: JSON.parse(JSON.stringify(SR.minigame.current().params.fight)), rng: SR.rng.rules.state(), state: JSON.parse(JSON.stringify(SR.state)) }));
  await t.clickUI('mg-auto');
  await t.step(2);
  const qp = await k.peek();
  T.ok(qp.phase === 'over', 'Auto ends the fight at once (then the 2 s fast-forward)');
  await k.shot('fight-quick');
  await k.closed();
  const qd = (await k.done()).filter((d) => d.id === 'fight').pop();
  const qr = await E((qs) => {
    const rng = SR.rng.create(1); rng.setState(qs.rng);
    return SR.rules.fight.autoPlay(qs.state, JSON.parse(JSON.stringify(qs.fight)), rng);
  }, qs);
  T.eq([qd.result.outcome, qd.result.hpLeft, qd.result.turns, qd.result.auto], [qr.outcome, qr.hpLeft, qr.turns, true],
    'the Quick fight equals SR.rules.fight.autoPlay on the same stream: real rolls, can lose');
  const auto2 = await E(() => {
    const out = {};
    for (let seed = 1; seed <= 200; seed++) {
      const st = SR.rules.state.create({ seed, stats: { str: 7 } });
      const r = SR.minigame.auto('fight', { kind: 'bar', n: 12 }, SR.rng.create(seed), st);
      out[r.outcome] = (out[r.outcome] || 0) + 1;
    }
    return out;
  });
  T.ok(auto2.lose > 150 && !auto2.run, 'SR.minigame.auto(fight) samples: STR 7 against rung 12 mostly loses, never runs', auto2);

  // ------------------------------------------------------------------------------------------
  T.section('"(it froze)": a fake 2 s freeze, a wink, then the fight resumes');
  await atBar({ stats: { str: 30 } });
  await k.row('bar.fight');
  await t.clickUI('mg-fight-froze');
  await t.step(1);
  p = await k.peek();
  T.ok(p.frozen, 'the fight appears frozen');
  T.ok(await k.heard('mg.fight.frozeAria'), 'screen readers are told it is not really frozen');
  await key('Digit1', 60);
  p = await k.peek();
  T.ok(p.frozen && p.fight.me.ap === p.fight.me.apMax, 'while frozen, input does nothing (1 s in)');
  await k.shot('fight-froze');
  await t.step(80);
  T.ok(await k.heard('mg.fight.wink'), 'after 2 s: the wink');
  await t.step(60);
  p = await k.peek();
  T.ok(!p.frozen, 'then the fight resumes');
  await key('Digit1', 1);
  p = await k.peek();
  T.ok(p.fight.me.ap === p.fight.me.apMax - 1, 'and moves work again');
  const acts = await k.acts();
  T.ok(acts.some((a) => a.a === 'move1' && a.ctx === 'fight') && !acts.some((a) => a.a === 'row1'), 'Digit1 fires move1 in the `fight` context, never the card\'s row1');

  T.section('leaving mid-fight is running away');
  await t.clickUI('mg-exit');
  await t.step(2);
  T.eq((await k.cur()).panel, 'exit', 'Exit asks first (a live stake)');
  await key('Digit2');
  await k.closed();
  const lastDone = (await k.done()).filter((d) => d.id === 'fight').pop();
  T.eq([lastDone.result.outcome, lastDone.result.exited], ['run', true], 'walking away resolves as a run (orig: no further cost)');

  // ------------------------------------------------------------------------------------------
  T.section('the hit shake follows Reduced Motion and the screen-shake setting (ART_AUDIO §12; UI §7)');
  await atBar({ stats: { str: 30 } });
  await k.row('bar.fight');
  T.ok((await k.peek()).shakeOk, 'by default a hit shakes the frame (6 u)');
  await E(() => SR.settings.set('display.screenShake', false));
  T.ok(!(await k.peek()).shakeOk, 'Screen shake off: no shake');
  await E(() => { SR.settings.set('display.screenShake', true); SR.settings.set('access.reducedMotion', 'on'); });
  T.ok(!(await k.peek()).shakeOk, 'Reduced Motion on: no shake');
  await E(() => SR.settings.set('access.reducedMotion', 'system'));
  await t.page.emulateMedia({ reducedMotion: 'reduce' });
  await t.page.waitForTimeout(1100);   // the render core re-reads the system preference once a second
  T.ok(!(await k.peek()).shakeOk, 'Reduced Motion "system" while the system asks for reduced motion: no shake');
  await t.page.emulateMedia({ reducedMotion: 'no-preference' });
  await t.page.waitForTimeout(1100);
  T.ok((await k.peek()).shakeOk, 'and the shake returns when the system preference does');
  await key('Digit' + ((await entries()).indexOf('run') + 1));
  await k.closed();

  // ------------------------------------------------------------------------------------------
  T.section('no console errors');
  T.eq(t.errors(), [], 'zero console errors, page errors or failed requests');
  await t.close();
  T.done();
})().catch((e) => { console.error(e); process.exit(1); });
