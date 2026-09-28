// Sticky's bar, the bar fight and drunken darts: rules from the original (root frames 35-37,
// 75-76) and screenshots of every screen. Run: node tests/bar.cjs  (screenshots go to $OUT).
const h = require('./harness.cjs');
const OUT = (process.env.OUT || '/tmp/claude-0/-home-user-modern-agents/e8aaa668-44cd-5f53-8561-931f113fdf41/scratchpad/shots/bar') + '/';
require('fs').mkdirSync(OUT, { recursive: true });

let failures = 0;
function check(cond, msg, extra) {
  if (cond) console.log('  ok   ' + msg);
  else { failures++; console.log('  FAIL ' + msg + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); }
}

(async () => {
  const t = await h.open({ scale: 2 });
  const { page } = t;
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const scene = () => ev(() => SRPG.engine.sceneName + (SRPG.engine.sceneName === 'location' ? ':' + SRPG.location.current : ''));
  const fight = () => ev(() => { const F = SRPG.fight.st; return { hp2: F.hp2, hpmax2: F.hpmax2, attpts: F.attpts, attmode: F.attmode, att: F.att, hit: F.hit, fb: F.fbugfix, p1: F.p1.frame, p2: F.p2.frame, fwin: F.fwin, froze: F.froze, itfroze: F.itfroze }; });
  const shot = (n) => t.shot(OUT + n + '.png');
  // Run ticks until cond() (evaluated in the page) is true; returns ticks used.
  const until = (cond, max = 2000) => ev(([c, max]) => {
    const f = new Function('return (' + c + ')');
    for (let i = 0; i < max; i++) { if (f()) return i; SRPG.engine.step(1); }
    return -1;
  }, [cond, max]);
  // Buttons make no sound of their own: the original loads _click.wav but never starts it.
  // Every sound played goes to window.__snd.
  await ev(() => {
    window.__clicks = 0;
    window.__snd = [];
    const play = SRPG.sound.play;
    SRPG.sound.play = function (n) { window.__snd.push(n); if (n === 'click') window.__clicks++; return play.apply(this, arguments); };
  });
  const snd = () => ev(() => window.__snd.splice(0));

  // ---------------------------------------------------------------------------------------------
  console.log('Bar: drink, bottle, conditions');
  await t.newGame({ strength: 10, hp: 15, charm: 5 });
  await t.open('bar');
  await t.step(12);
  await shot('bar');
  // Canvas pixel [r, g, b] at stage (x, y).
  const px = (x, y) => ev(([x, y]) => {
    SRPG.engine.draw();
    const k = SRPG.engine.pixelScale || 1;
    return Array.from(document.getElementById('game').getContext('2d').getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data.slice(0, 3));
  }, [x, y]);
  const isWood = (c) => c[0] > 110 && c[0] < 145 && c[1] > 50 && c[1] < 80 && c[2] < 25;
  // The chairs are seen from behind at 3/4 (the original's view): under the seat the back's two
  // stretchers (y 279.5-283 and 293-297 for the front chair) with the wall showing between them.
  check(isWood(await px(105, 281)) && !isWood(await px(105, 288)) && isWood(await px(105, 295)), 'front chair: 3/4 back view with two stretchers',
    [await px(105, 281), await px(105, 288), await px(105, 295)]);
  check(isWood(await px(74, 264)) && isWood(await px(100, 232)) && !isWood(await px(84.5, 250)), 'front chair: seat side, crest rail and slat gaps',
    [await px(74, 264), await px(100, 232), await px(84.5, 250)]);
  let s = await t.state();
  check((await t.uiText()).indexOf('DRINK BEER - $20') >= 0 && (await t.uiText()).indexOf('BUY BOTTLE OF') >= 0, 'menu labels shown');
  await t.clickUI('drink');
  s = await t.state();
  check(s.cash === 80 && s.time === 10 && s.charm === 5, 'DRINK BEER: -$20, +2 hours, charm not yet', [s.cash, s.time, s.charm]);
  await t.step(6);
  await shot('bar-drink-lift');
  await t.step(6);
  s = await t.state();
  check(s.charm === 7, 'charm +2 on the animation\'s frame 11', s.charm);
  await shot('bar-drink-gulp');
  await t.step(9);
  await shot('bar-drink-toss');
  await t.step(6);
  check((await scene()) === 'location:bar' && (await t.uiText()).indexOf('DRINK BEER') >= 0, 'menu back after 25 frames');
  await t.set({ charm: 998 });
  await t.clickUI('drink');
  await t.step(30);
  check((await t.state()).charm === 999, 'charm capped at 999', (await t.state()).charm);
  await t.set({ time: 23, cash: 100 });
  await t.clickUI('drink');
  s = await t.state();
  check(s.cash === 100 && s.time === 23, 'DRINK BEER refused at 23:00 (needs time < 23)', [s.cash, s.time]);
  await t.set({ time: 22, cash: 19 });
  await t.clickUI('drink');
  s = await t.state();
  check(s.cash === 19 && s.time === 22, 'DRINK BEER refused with $19', [s.cash, s.time]);
  await t.set({ time: 22, cash: 20 });
  await t.clickUI('drink');
  s = await t.state();
  check(s.cash === 0 && s.time === 24, 'DRINK BEER at 22:00 with $20 -> 24:00, $0', [s.cash, s.time]);
  await t.step(30);

  await t.set({ time: 23, cash: 100, booze: 0 });
  await t.clickUI('bottle');
  await t.clickUI('bottle');
  await t.clickUI('bottle');
  s = await t.state();
  check(s.cash === 10 && s.booze === 3 && s.time === 23, 'BUY BOTTLE: $30 each, no time cost (even at 23:00)', [s.cash, s.booze, s.time]);
  await t.clickUI('bottle');
  s = await t.state();
  check(s.cash === 10 && s.booze === 3, 'BUY BOTTLE refused with $10', [s.cash, s.booze]);
  await t.set({ cash: 30 });
  await t.clickUI('bottle');
  s = await t.state();
  check(s.cash === 0 && s.booze === 4, 'BUY BOTTLE with exactly $30', [s.cash, s.booze]);

  await t.set({ time: 22 });
  await t.clickUI('barfight');
  check((await scene()) === 'location:bar' && (await t.state()).time === 22, 'BAR FIGHT refused at 22:00 (needs time < 22)');
  await t.set({ time: 13 });
  await t.clickUI('darts');
  check((await scene()) === 'darts' && (await t.state()).time === 13, 'PLAY DRUNKEN DARTS: free, no time');
  await t.clickUI('darts-ok');
  check((await scene()) === 'location:bar', 'darts OK -> back to the bar');
  s = await t.state();
  const mx = s.mapx;
  await t.clickUI('leave');
  s = await t.state();
  check((await scene()) === 'city' && s.mapx === mx - 8, 'LEAVE: back to the street, mapx - 8', [s.mapx, mx]);

  // ---------------------------------------------------------------------------------------------
  console.log('Fight: setup, formulas');
  await t.newGame({ strength: 10, hp: 15, cash: 100, karma: 0 });
  await t.open('bar');
  await ev(() => SRPG.rng.seed(11));
  await t.set({ time: 21 });
  await t.clickUI('barfight');
  let f = await fight();
  s = await t.state();
  check((await scene()) === 'fight' && s.time === 24, 'BAR FIGHT at 21:00: +3 hours -> 24:00', s.time);
  check(s.karma === -2, 'entering a fight: karma -2', s.karma);
  check(f.hpmax2 >= 5 && f.hpmax2 <= 9 && f.hp2 === f.hpmax2, 'opponent HP random(barfight*5)+barfight*5 = 5..9 at barfight 1', f.hpmax2);
  check(f.attpts === 1, 'attack points min(int(10/20)+1, 15) = 1', f.attpts);
  await t.step(3);
  await shot('fight-start');
  // The backdrop's wall runs into the floor band with no horizon line (the original has none).
  const lum = (c) => (c[0] + c[1] + c[2]) / 3;
  check(Math.abs(lum(await px(100, 188)) - lum(await px(100, 185))) < 6, 'fight backdrop: no line at y=188', [await px(100, 185), await px(100, 188)]);
  // The opponent's "hp/ max" is the HUD's label at 125%: Arial Black 12.5 (ink about 21 x 8.5 px
  // for "7/ 7" at x 405-426.5, y 14-22.5 in the original).
  const lbl = await ev(() => {
    SRPG.engine.draw();
    const k = SRPG.engine.pixelScale || 1, x0 = 395, y0 = 8, w = 50, h = 20;
    const d = document.getElementById('game').getContext('2d').getImageData(x0 * k, y0 * k, w * k, h * k).data;
    let l = 1e9, t0 = 1e9, r = -1, b = -1;
    for (let y = 0; y < h * k; y++) for (let x = 0; x < w * k; x++) {
      const i = (y * w * k + x) * 4;
      if (d[i] > 230 && d[i + 1] > 230 && d[i + 2] > 230) { l = Math.min(l, x); r = Math.max(r, x); t0 = Math.min(t0, y); b = Math.max(b, y); }
    }
    return [x0 + l / k, y0 + t0 / k, x0 + r / k, y0 + b / k];
  });
  check(lbl[2] - lbl[0] >= 19 && lbl[3] - lbl[1] >= 8 && Math.abs(lbl[1] - 14) <= 1 && Math.abs(lbl[3] - 22.5) <= 1,
    'opponent HP label: Arial Black 12.5 size and place', lbl);

  // Formulas: re-seed, roll the same way the original does, and compare.
  const roll = (kind, str, knife) => ev(([kind, str, knife]) => {
    const r = (n) => SRPG.rng.random(Math.floor(n));
    SRPG.rng.seed(4242);
    let exp;
    if (kind === 'punch') exp = Math.floor(r((str + 10) / 10) + knife * 2);
    if (kind === 'kick') exp = Math.floor(r(str / 4.5) + knife * 2 + 1);
    if (kind === 'fireball') exp = Math.floor(r(str / 2.5));
    if (kind === 'energy') exp = Math.floor(r(str / 1.5));
    if (exp === 0) exp = 1;
    const s = SRPG.game.s;
    s.strength = str;
    s.items.knife = knife;
    const F = SRPG.fight.st;
    F.attmode = 0; F.attpts = 15; F.hp2 = 999; F.p1.frame = 1;
    SRPG.rng.seed(4242);
    SRPG.fight.attack(kind);
    const got = F.hit;
    F.attmode = 0; F.p1.frame = 1; F.hp2 = F.hpmax2;
    return [exp, got];
  }, [kind, str, knife]);
  for (const [kind, str, knife] of [['punch', 95, 0], ['punch', 95, 1], ['kick', 300, 0], ['kick', 300, 1], ['fireball', 500, 1], ['energy', 900, 0], ['punch', 5, 0]]) {
    const [exp, got] = await roll(kind, str, knife);
    check(exp === got, kind + ' damage (strength ' + str + ', knife ' + knife + ') = ' + exp, got);
  }
  // Cost and refusal: 1 point cannot pay for a kick.
  await ev(() => { const F = SRPG.fight.st; F.attpts = 1; F.attmode = 0; SRPG.game.s.strength = 10; });
  check(!(await ev(() => SRPG.fight.attack('kick'))), 'KICK refused with 1 attack point');
  check(!(await ev(() => SRPG.fight.attack('energy'))), 'PURE ENERGY refused with 1 attack point');
  await ev(() => { SRPG.fight.st.attpts = 4; });
  check(await ev(() => SRPG.fight.attack('energy')) && (await fight()).attpts === 0, 'PURE ENERGY costs 4 points');
  check(!(await ev(() => SRPG.fight.attack('punch'))), 'no second attack while one is playing (attmode 1)');
  check(!(await ev(() => SRPG.fight.runAway())), 'RUN AWAY refused mid-attack');
  check(!(await ev(() => SRPG.fight.done())), 'DONE refused mid-attack (attmode 1, fbugfix 0)');
  await t.step(20);
  await shot('fight-energy-orb');
  await t.step(20);
  await shot('fight-energy-beam');

  // The opponent's reply scales with YOUR strength (kept quirk): r = random(strength)+1 picks it.
  await t.set({ hp: 9999, hpmax: 9999 });
  const reply = (str) => ev((str) => {
    const r = (n) => SRPG.rng.random(Math.floor(n));
    SRPG.rng.seed(99);
    const k = Math.floor(r(str)) + 1;
    let frame, hit;
    if (k > 40) { frame = 151; hit = Math.floor(r(str / 1.5)); }
    else if (k > 20) { frame = 90; hit = Math.floor(r(str / 2.5)); }
    else if (k > 10) { frame = 55; hit = Math.floor(r(str / 4.5)); }
    else { frame = 11; hit = Math.floor(r(str / 10)) + 1; }
    if (hit === 0) hit = 1;
    const F = SRPG.fight.st;
    SRPG.game.s.strength = str;
    F.attmode = 0; F.fbugfix = 0; F.p2.frame = 1; F.hp2 = 50;
    SRPG.rng.seed(99);
    SRPG.fight.done();
    return [frame, hit, F.p2.frame, F.hit, F.att, F.attpts];
  }, str);
  for (const str of [8, 15, 30, 200]) {
    const [frame, hit, gotFrame, gotHit, att, pts] = await reply(str);
    check(frame === gotFrame && hit === gotHit && att === 2, 'DONE: opponent move for strength ' + str + ' (frame ' + frame + ', hit ' + hit + ')', [gotFrame, gotHit]);
    check(pts === Math.min(Math.floor(str / 20) + 1, 15), '  attack points refilled to ' + pts, pts);
    if (str === 200) { await t.step(24); await shot('fight-enemy-orb'); await t.step(24); await shot('fight-enemy-beam'); }
    await ev(() => { const F = SRPG.fight.st; F.p2.frame = 1; F.attmode = 0; });
  }

  // An opponent fireball (red: the clip is filtered to its red channel).
  await ev(() => {
    const s = SRPG.game.s; s.strength = 30;
    for (let seed = 1; seed < 500; seed++) {
      SRPG.rng.seed(seed);
      if (SRPG.rng.random(30) + 1 > 20) { SRPG.rng.seed(seed); break; }
    }
    const F = SRPG.fight.st; F.attmode = 0; F.fbugfix = 0; F.p2.frame = 1; F.hp2 = 50;
    SRPG.fight.done();
  });
  check((await fight()).p2 === 90, 'strength 30: some rolls give the opponent a fireball', (await fight()).p2);
  await t.step(30);
  await shot('fight-enemy-fireball');
  await ev(() => { const F = SRPG.fight.st; F.p2.frame = 1; F.attmode = 0; });
  check((await scene()) === 'fight', 'still fighting');

  // ---------------------------------------------------------------------------------------------
  console.log('Fight: a whole fight won');
  await t.newGame({ strength: 60, hp: 75, cash: 100, karma: 0, barfight: 2 });
  await t.set({ hpmax: 75 });
  await ev(() => SRPG.rng.seed(5));
  await t.open('bar');
  await t.clickUI('barfight');
  f = await fight();
  check(f.hpmax2 >= 10 && f.hpmax2 <= 19, 'barfight 2: opponent HP 10..19', f.hpmax2);
  check(f.attpts === 4, 'strength 60 -> 4 attack points', f.attpts);
  // Punch, then kick: points 4 -> 3 -> 1 ...
  await snd();
  await t.clickUI('punch');
  check((await fight()).attpts === 3, 'PUNCH: 1 point');
  let hp2Before = (await fight()).hp2;
  await t.step(14);
  await shot('fight-punch-run');
  await t.step(3);
  check((await fight()).hp2 === hp2Before - (await fight()).hit, 'punch lands on frame 27', await fight());
  await shot('fight-punch-hit');
  await t.step(14);
  await shot('fight-punch-flip');
  await until('SRPG.fight.st.attmode === 0');
  check(JSON.stringify(await snd()) === '["punch","punch"]', 'PUNCH: the punch sound twice (clip frames 25 and 27)');
  await t.clickUI('kick');
  check((await fight()).attpts === 1, 'KICK: 2 points');
  await t.step(12);
  await shot('fight-kick');
  await until('SRPG.fight.st.attmode === 0');
  check(JSON.stringify(await snd()) === '["kick"]', 'KICK: the kick sound (clip frame 65)');
  await t.clickUI('punch');
  await until('SRPG.fight.st.att === 2 || SRPG.fight.st.hp2 <= 0');
  f = await fight();
  if (f.hp2 > 0) check(f.att === 2 && f.fb === 1, 'points spent: the opponent replies by itself (fbugfix 1)', f);
  // Keep fighting with the cheapest winning plan: fireballs + punches.
  let guard = 0;
  while (guard++ < 60) {
    f = await fight();
    if (f.p2 >= 216) break;
    if (f.attmode === 0) {
      if (f.attpts >= 3) await t.clickUI('fireball');
      else if (f.attpts >= 1) await t.clickUI('punch');
    }
    await t.step(10);
  }
  f = await fight();
  check(f.p2 >= 216, 'opponent knocked out', f);
  check(await ev(() => SRPG.sound.state().music === null && SRPG.sound.state().sources === 0), 'KO: LoopC.stop() at frame 216 silences the music and every sound');
  await t.step(10);
  await shot('fight-ko-fall');
  const before = await t.state();
  await until('SRPG.fight.st.p2.frame >= 300');
  await shot('fight-win-strength');
  f = await fight();
  check(!f.itfroze && (await ev(() => document.querySelector('[data-id="itfroze"]').style.display)) === 'none', '(IT FROZE) hidden once he is down (frame 234)');
  check(!(await ev(() => SRPG.fight.st.hpbar2)) && (await ev(() => SRPG.fight.st.p1.playing)) === false, 'KO: his health bar hidden, you freeze');
  check(!(await ev(() => SRPG.fight.runAway())) && !(await ev(() => SRPG.fight.done())), 'no RUN AWAY / DONE after the KO');
  s = await t.state();
  check(s.strength === before.strength + 3 && s.hpmax === before.hpmax + 3, 'win: strength +3, max HP +3', [s.strength, s.hpmax]);
  await until('SRPG.fight.st.p2.frame >= 360');
  await shot('fight-win');
  f = await fight();
  s = await t.state();
  check(f.fwin >= 10 && f.fwin <= 19 && s.cash === before.cash + f.fwin, 'prize random(barfight*5)+barfight*5 = $10..19 added', [f.fwin, s.cash]);
  check(s.barfight === 3, 'barfight + 1', s.barfight);
  check((await t.uiText()).indexOf('OK') >= 0, 'OK shown under the winnings');
  check(s.karma === -2, 'karma -2 so far', s.karma);
  // Button 2133's karma - 3 has no karmaAdjust() after it: from -99 it goes to -102.
  await t.set({ karma: -99 });
  await t.clickUI('fight-ok');
  s = await t.state();
  check(s.karma === -102 && (await scene()) === 'location:bar', 'OK: karma -3 more, unclamped (-99 -> -102), back in the bar', [s.karma, await scene()]);
  check((await ev(() => SRPG.engine.black)) === 1, 'OK: back at root frame 35, whose script replays the black clip');
  await ev(() => SRPG.rng.unseed());

  // ---------------------------------------------------------------------------------------------
  console.log('Fight: lost');
  await t.newGame({ strength: 30, hp: 1, cash: 100 });
  await ev(() => SRPG.rng.seed(3));
  await t.open('bar');
  await t.clickUI('barfight');
  await t.clickUI('done');
  f = await fight();
  check(f.att === 2 && f.attmode === 1, 'DONE: the opponent attacks at once');
  const died = await until('SRPG.engine.sceneName === "death"', 400);
  s = await t.state();
  check(died > 0 && s.hp <= 0 && s.over, 'HP <= 0 -> YOU DIED', [died, s.hp]);
  await shot('fight-lost');
  await ev(() => SRPG.rng.unseed());

  // ---------------------------------------------------------------------------------------------
  console.log('Fight: run away, (IT FROZE)');
  await t.newGame({ strength: 10, hp: 20, cash: 100 });
  await t.open('bar');
  await t.set({ time: 12 });
  await t.clickUI('barfight');
  await t.clickUI('run');
  s = await t.state();
  check((await scene()) === 'location:bar' && s.time === 15 && s.karma === -2, 'RUN AWAY: back to the bar, 3 hours and 2 karma gone', [s.time, s.karma]);
  // Frame 75's karma - 2 has no karmaAdjust() after it either: at -100 a fight leaves you at -102.
  await t.set({ karma: -100, time: 12 });
  await t.clickUI('barfight');
  check((await t.state()).karma === -102, 'entering a fight at -100 karma: -102 (unclamped, as the original)', (await t.state()).karma);
  await t.clickUI('run');
  await t.clickUI('barfight');
  await page.hover('[data-id="itfroze"]');
  await t.step(2);
  await shot('fight-froze-hover');
  await t.clickUI('itfroze');
  await t.step(2);
  check((await fight()).froze, '(IT FROZE) -> apology screen');
  await shot('fight-froze');
  await t.clickUI('froze-done');
  check((await scene()) === 'location:bar', 'its DONE -> back to the bar');
  await page.mouse.move(10, 10);

  // ---------------------------------------------------------------------------------------------
  console.log('Darts');
  await t.newGame({ hp: 14, strength: 10, time: 11 });
  await t.open('bar');
  await t.clickUI('darts');
  await page.mouse.move(380, 188);
  await t.step(1);
  await shot('darts');
  // Frame 37's texts: Arial Black 12 (#95caff) for the instruction, DARTS REMAINING: and POINTS,
  // 16.85 between lines; the dart count and points are 22, the last-throw line 14.
  const dtext = await ev(() => {
    const out = {};
    document.querySelectorAll('#ui [data-screen="darts"] > div').forEach((e) => {
      const c = getComputedStyle(e);
      out[e.getAttribute('data-id') || e.textContent] = [c.fontSize, c.lineHeight, c.color, e.innerText.split('\n').length];
    });
    return out;
  });
  const pale = 'rgb(149, 202, 255)';
  check(JSON.stringify(dtext['darts-help']) === JSON.stringify(['12px', '16.85px', pale, 2]), 'instruction: 12 px on two lines 16.85 apart', dtext['darts-help']);
  check((await ev(() => document.querySelector('#ui [data-id="darts-help"]').innerText.split('\n')[1])).indexOf('DART') === 0,
    'the instruction breaks before its last word, as the original');
  check(JSON.stringify(dtext['DARTSREMAINING:']) === JSON.stringify(['12px', '16.85px', pale, 2]), 'DARTS REMAINING: 12 px', dtext['DARTSREMAINING:']);
  check(JSON.stringify(dtext.POINTS) === JSON.stringify(['12px', '16.85px', pale, 1]), 'POINTS: 12 px', dtext.POINTS);
  check(dtext['darts-left'][0] === '22px' && dtext['darts-points'][0] === '22px' && dtext['darts-last'][0] === '14px',
    'dart count and points 22 px, last throw 14 px', [dtext['darts-left'], dtext['darts-points'], dtext['darts-last']]);
  const dpos = (which) => ev((w) => { const d = SRPG.darts; return d.boardPos(w, d.st.bf); }, which);
  const click = async (x, y) => { await page.mouse.click(x, y); };
  let d = await ev(() => SRPG.darts.st);
  check(d.throws === 10 && d.points === 0, '10 darts, 0 points');
  // Board frame 1: both boards almost on top of each other; hit the bull.
  await ev(() => { SRPG.darts.st.bf = 1; });
  let g = await dpos('ghost');
  await snd();
  await click(g.x + 1.1, g.y);
  d = await ev(() => SRPG.darts.st);
  check(d.points === 50 && d.throws === 9, 'bullseye: 50', d.points);
  check(JSON.stringify(await snd()) === '["footstep"]', 'a scoring throw plays the footstep sound (SFXfootstep: there is no dart sound)');
  // Frame 10: the boards are 63px apart. The ghost (on top) takes clicks inside its rings.
  await ev(() => { SRPG.darts.st.bf = 10; });
  let m = await dpos('main');
  g = await dpos('ghost');
  await click(m.x + 1.1, m.y); // the solid board's bull is inside the ghost's 5 ring
  d = await ev(() => SRPG.darts.st);
  check(d.points === 55, 'solid bull under the ghost\'s outer ring scores the ghost: 5', d.points);
  await click(g.x + 0.9, g.y + 10); // 35 ring of the ghost
  await click(g.x + 0.5, g.y - 30); // 15 ring
  d = await ev(() => SRPG.darts.st);
  check(d.points === 105, '35 and 15 rings', d.points);
  await click(m.x + 0.5, m.y + 70); // solid board's 5 ring, outside the ghost
  d = await ev(() => SRPG.darts.st);
  check(d.points === 110, 'solid board 5 ring', d.points);
  await snd();
  await click(60, 60); // on the wall: a miss
  d = await ev(() => SRPG.darts.st);
  check(d.points === 110 && d.throws === 4 && /sad/.test(d.last), 'miss: 0 points, still uses a dart', d);
  check(JSON.stringify(await snd()) === '[]', 'a miss is silent');
  await click(200, 350); // on the panel: not a throw
  check((await ev(() => SRPG.darts.st.throws)) === 4, 'clicks below the room do nothing');
  await ev(() => SRPG.engine.draw());
  await shot('darts-thrown');
  for (let i = 0; i < 6; i++) await click(60, 60);
  d = await ev(() => SRPG.darts.st);
  check(d.throws === 0, 'all darts thrown', d.throws);
  await click(g.x + 1.1, g.y);
  check((await ev(() => SRPG.darts.st.points)) === 110, 'no more throws after 10');
  // The wobble adds up while the mouse is still, and stops over OK.
  await page.mouse.move(300, 150);
  await ev(() => SRPG.rng.seed(1));
  await t.step(60);
  d = await ev(() => SRPG.darts.st);
  check(d.dx !== 300 || d.dy !== 150, 'the dart drifts while the mouse is still', [d.dx, d.dy]);
  await page.hover('[data-id="darts-ok"]');
  const d0 = await ev(() => [SRPG.darts.st.dx, SRPG.darts.st.dy, SRPG.darts.st.stopShake]);
  await t.step(30);
  const d1 = await ev(() => [SRPG.darts.st.dx, SRPG.darts.st.dy]);
  check(d0[2] === 1 && d0[0] === d1[0] && d0[1] === d1[1], 'no wobble while over OK');
  check((await ev(() => SRPG.engine.sceneName)) === 'darts' && (await t.state()).time === 11, 'darts cost no time');
  await t.clickUI('darts-ok');
  check((await scene()) === 'location:bar' && (await ev(() => document.getElementById('stage').style.cursor)) === '', 'OK: back to the bar, pointer shown');
  check((await ev(() => SRPG.engine.black)) === 1, 'darts OK: back at root frame 35, fading in');

  // ---------------------------------------------------------------------------------------------
  console.log('Fight: the opponent\'s two ways of replying');
  await t.newGame({ strength: 15, hp: 500, cash: 100 });
  await t.set({ hpmax: 500 });
  await t.open('bar');
  await t.clickUI('barfight');
  // A seed where random(15)+1 > 10 (kick) and random(int(15 / 4.5)) = 0.
  const zseed = await ev(() => {
    for (let n = 1; n < 5000; n++) {
      SRPG.rng.seed(n);
      const a = SRPG.rng.random(15) + 1;
      const b = SRPG.rng.random(3);
      if (a > 10 && b === 0) return n;
    }
    return -1;
  });
  // Automatic reply (points spent): the 0 stays 0.
  await ev((n) => { const F = SRPG.fight.st; F.attpts = 0; F.attmode = 0; F.fbugfix = 0; F.hp2 = 50; F.p1.frame = 1; F.p2.frame = 1; SRPG.rng.seed(n); }, zseed);
  await until('SRPG.fight.st.att === 2');
  f = await fight();
  check(zseed > 0 && f.hit === 0 && f.p2 >= 55 && f.p2 < 60 && f.fb === 1 && f.attpts === 0, 'automatic reply: a kick can do 0 damage, fbugfix set, points not yet back', f);
  // While that reply plays, fbugfix lets DONE through once: it restarts his attack.
  await t.step(4);
  await ev((n) => SRPG.rng.seed(n), zseed);
  check(await ev(() => SRPG.fight.done()), 'DONE accepted mid-reply while fbugfix is 1');
  f = await fight();
  check(f.hit === 1 && f.fb === 0 && f.p2 >= 55 && f.p2 < 60 && f.attpts === 1, 'DONE reply: same roll, 0 becomes 1; fbugfix cleared, points back', f);
  check(!(await ev(() => SRPG.fight.done())), 'a second DONE mid-reply is refused');
  const hpBefore = (await t.state()).hp;
  await until('SRPG.fight.st.attmode === 0');
  check((await t.state()).hp === hpBefore - 1, 'the restarted kick lands for 1', (await t.state()).hp);
  // Leave and come back: a fresh opponent and a fresh turn.
  await t.clickUI('run');
  await t.clickUI('barfight');
  f = await fight();
  check(f.hit === '!' && f.att === 0 && f.attmode === 0 && f.fb === 0 && f.attpts === 1 && f.hp2 === f.hpmax2 && f.itfroze && !f.froze && f.p1 === 1 && f.p2 === 5, 'a new fight starts clean', f);
  await t.clickUI('run');

  // ---------------------------------------------------------------------------------------------
  console.log('Robustness: real double-clicks, right-clicks, save');
  const idAt = (x, y) => ev(([x, y]) => { const e = document.elementFromPoint(x, y); const b = e && e.closest('[data-id]'); return b ? b.getAttribute('data-id') : null; }, [x, y]);
  // Win a fight fast (his HP set to 0 -> the knockout), up to the OK under the winnings.
  const winToOk = async () => {
    await t.clickUI('barfight');
    await ev(() => { SRPG.fight.st.hp2 = 0; });
    await until('SRPG.fight.st.p2.frame >= 355');
  };
  await t.newGame({ strength: 60, hp: 75, cash: 100, karma: 0, time: 10 });
  await t.open('bar');
  for (const [y, under] of [[150, 'drink'], [171.5, 'barfight']]) {
    await winToOk();
    check((await idAt(265, y)) === 'fight-ok', 'OK is at y ' + y);
    const b = await t.state();
    await page.mouse.dblclick(265, y);
    s = await t.state();
    check((await idAt(265, y)) === under, '  in the bar, ' + under + ' sits under that spot');
    check((await scene()) === 'location:bar' && s.time === b.time && s.cash === b.cash && s.karma === b.karma - 3 && !(await ev(() => SRPG.location.g.drink)),
      '  double-click on OK: back in the bar once, the second click does not ' + (under === 'drink' ? 'buy a beer' : 'start another fight'), [s.time, s.cash, s.karma]);
  }
  // A fresh click there afterwards works as usual.
  s = await t.state();
  await page.mouse.click(265, 150);
  check((await t.state()).time === s.time + 2 && (await ev(() => !!SRPG.location.g.drink)), 'a new single click on DRINK BEER still works');
  await t.step(30);
  // Clicking on and on in the bar: once the menu is back after the drink, the next click counts
  // even as part of a click run (it began in the bar).
  s = await t.state();
  await page.mouse.click(265, 150, { clickCount: 2 });
  check((await t.state()).time === s.time + 2, 'after the drink, a click run on DRINK BEER keeps working', (await t.state()).time);
  await t.step(30);
  // Buying bottles as fast as you can click: every click counts.
  await t.set({ cash: 100, booze: 0 });
  await page.mouse.dblclick(379, 136);
  s = await t.state();
  check(s.booze === 2 && s.cash === 40, 'double-click on BUY BOTTLE buys two', [s.booze, s.cash]);
  // Double-click on PLAY DRUNKEN DARTS: the second press is not a throw.
  await page.mouse.dblclick(378.6, 189);
  check((await scene()) === 'darts' && (await ev(() => SRPG.darts.st.throws)) === 10, 'double-click into darts: no dart thrown');
  await page.mouse.click(60, 60, { button: 'right' });
  check((await ev(() => SRPG.darts.st.throws)) === 10, 'right-click: no dart thrown');
  await page.mouse.click(60, 60);
  check((await ev(() => SRPG.darts.st.throws)) === 9, 'left click: a dart');
  await t.clickUI('darts-ok');
  // State stays plain JSON and survives a save.
  s = await t.state();
  const same = await ev(() => {
    const s = SRPG.game.s;
    const j = JSON.stringify(s);
    const back = JSON.parse(j);
    SRPG.save.write(s);
    const r = SRPG.save.read();
    SRPG.save.remove();
    return JSON.stringify(back) === j && r && r.barfight === s.barfight && r.booze === s.booze && r.strength === s.strength;
  });
  check(same && s.barfight === 3, 'state is plain JSON; barfight / booze / strength survive a save', s.barfight);

  // Prose is paraphrased: no 6-word run of the original's text in these files (skipped when the
  // decompiled sources are not around).
  const fs = require('fs');
  const SRC = '/tmp/claude-0/-home-user-modern-agents/e8aaa668-44cd-5f53-8561-931f113fdf41/scratchpad/';
  if (fs.existsSync(SRC + 'srpg_as.txt') && fs.existsSync(SRC + 'texts.txt')) {
    const words = (x) => x.replace(/\\n/g, ' ').toLowerCase().match(/[a-z0-9$']+/g) || [];
    const orig = fs.readFileSync(SRC + 'srpg_as.txt', 'latin1') + '\n' + fs.readFileSync(SRC + 'texts.txt', 'latin1');
    const grams = new Set();
    for (const src of [orig, orig.replace(/(["\s(])([A-Za-z])\\n/g, '$1$2')]) {
      const w = words(src);
      for (let i = 0; i + 6 <= w.length; i++) grams.add(w.slice(i, i + 6).join(' '));
    }
    const hits = [];
    for (const file of ['js/locations/bar.js', 'js/minigames/fight.js', 'js/minigames/darts.js']) {
      const w = words(fs.readFileSync(require('path').join(__dirname, '..', file), 'utf8'));
      for (let i = 0; i + 6 <= w.length; i++) if (grams.has(w.slice(i, i + 6).join(' '))) hits.push(file + ': ' + w.slice(i, i + 6).join(' '));
    }
    check(hits.length === 0, 'no 6-word run copied from the original', hits);
  }

  check((await ev(() => window.__clicks)) === 0, 'no button played a click sound', await ev(() => window.__clicks));
  const errs = t.errors.filter((e) => !/requestfailed|ERR_FILE_NOT_FOUND/.test(e));
  check(errs.length === 0, 'no page errors', errs);
  await t.close();
  console.log(failures ? failures + ' FAILED' : 'all passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
