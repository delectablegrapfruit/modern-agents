// tests/e2e/results.test.cjs — owner: W2-Front. The Final Edition (BUILD_PLAN §4.11; UI.md §5.14;
// GDD §4.19; BALANCE B-18): the right rank at every B-18 boundary and in every karma column
// (debug-set net worths), the count-up and the stamp (a press skips), the banners (PRESIDENT /
// DICTATOR OF STICKS, UNVERIFIED, DECEASED, the MET THE ARTIST sticker), Copy summary in the exact
// format of UI §5.14 (the clipboard and the textarea fallback), the Hall of Fame filed once per ranked
// run (never the cheat name), Keep playing after a timed game, and how the game reaches the results
// (the paper first after the last night; FLATLINED first on Hardcore). Screenshots: shots/W2-Front/.
//   node tests/e2e/results.test.cjs
'use strict';
const path = require('path');
const h = require('../harness.cjs');
const A = require('./a11y.test.cjs');

const SHOTS = path.join(h.ROOT, 'shots', 'W2-Front');

// BALANCE B-18, copied: [floor, neutral, good (karma > +20), evil (karma < -20)]; row 0 is below $0.
const B18 = [
  [null, 'IN THE RED', 'IN THE RED', 'IN THE RED'],
  [0, 'FLAT AS PAPER', 'FLAT AS PAPER', 'FLAT AS PAPER'],
  [500, 'CRUMPLED', 'CRUMPLED', 'CRUMPLED'],
  [1500, 'STICK FIGURE', 'NICE STICK', 'TROUBLEMAKER'],
  [5000, 'DOODLE', 'HELPING HAND', 'HOODLUM'],
  [15000, 'SKETCH ARTIST', 'NEIGHBOURHOOD HERO', 'HUSTLER'],
  [40000, 'GO-GETTER', 'PILLAR OF THE COMMUNITY', 'RACKETEER'],
  [100000, 'BIG SHOT', 'HUMANITARIAN', 'CRIME BOSS'],
  [250000, 'TYCOON', 'BELOVED BENEFACTOR', 'KINGPIN'],
  [600000, 'MAGNATE', 'LIVING LEGEND', 'OVERLORD'],
  [1500000, 'MOGUL', 'PATRON OF THE PAGE', 'SUPERVILLAIN'],
  [5000000, 'PAPER TITAN', 'GUARDIAN ANGEL', 'SCOURGE OF THE SKIES'],
  [15000000, 'SUPREME SCRIBBLE', 'HALO INCARNATE', 'PURE RED MENACE'],
];

(async () => {
  const T = h.suite('e2e results (W2-Front)');
  const t = await h.open({ fast: true });
  const { page } = t;
  const ev = (fn, arg) => t.eval(fn, arg);
  const info = () => ev(() => { const d = window.SR.reg.scene.results; return d.info() ? JSON.parse(JSON.stringify(d.info())) : null; });
  const shot = (name) => t.shot(path.join(SHOTS, name + '.png'));
  const clearProfile = () => ev(() => { window.SR.save.storage.remove('sr1.profile'); });

  /** A fresh game whose net worth is exactly nw and karma k; opens its results (reason 'time'). */
  const setup = (o) => ev((o) => {
    const SR = window.SR;
    SR.debug.newGame({ seed: 11, name: o.name || 'Rikki', length: o.length === undefined ? 40 : o.length, difficulty: o.difficulty || 'standard' });
    const s = SR.state;
    s.money.cash = 0;
    const base = SR.rules.endgame.netWorth(s);
    if (o.nw - base >= 0) s.money.cash = o.nw - base; else s.money.loan = { amount: base - o.nw, daysLeft: 9 };
    s.stats.karma = o.karma || 0;
    s.clock.day = o.day || (o.length === 0 ? 12 : 41);
    if (o.patch) SR.util.merge(s, o.patch);
    const r = SR.rules.endgame.results(s, o.reason || 'time');
    SR.scenes.go('results', { reason: r.reason, result: r }, { transition: false });
    const st = document.querySelector('#ui [data-id="results-stamp"]');
    return { nw: SR.rules.endgame.netWorth(s), stamp: st ? st.textContent : null, rank: r.rank };
  }, o);

  // ------------------------------------------------------------------------------------------------
  T.section('the rank at every B-18 boundary, in every karma column');
  const cols = [['neutral', 0, 1], ['good', 21, 2], ['evil', -21, 3]];
  const bad = [];
  let checked = 0;
  for (const [col, karma, ci] of cols) {
    for (let i = 1; i < B18.length; i++) {
      const floor = B18[i][0];
      for (const [nw, want] of [[floor, B18[i][ci]], [floor - 1, B18[i - 1][ci]]]) {
        const r = await setup({ nw, karma });
        checked++;
        if (r.nw !== nw || r.stamp !== want) bad.push({ col, nw, got: r.stamp, want, realNw: r.nw });
      }
    }
  }
  T.eq(bad, [], 'every floor and the dollar below it stamp the B-18 cell (' + checked + ' cases)');
  const edge = [];
  for (const [karma, want] of [[20, 'GO-GETTER'], [-20, 'GO-GETTER'], [21, 'PILLAR OF THE COMMUNITY'], [-21, 'RACKETEER']]) {
    const r = await setup({ nw: 40000, karma });
    edge.push([karma, r.stamp === want]);
  }
  T.eq(edge, [[20, true], [-20, true], [21, true], [-21, true]], 'the karma columns: > +20 good, < -20 evil, ±20 neutral (orig)');

  // ------------------------------------------------------------------------------------------------
  T.section('the page: count-up, stamp, parts, photo');
  await t.fast(false);
  await clearProfile();
  await setup({ nw: 41380, karma: 34 });
  let ri = await info();
  T.eq([ri.phase, ri.shown], ['count', 0], 'the net worth starts at $0');
  await t.step(60);
  ri = await info();
  T.ok(ri.phase === 'count' && ri.shown > 0 && ri.shown < 41380, 'it counts up over 2.5 s (orig)', ri.shown);
  T.ok(!(await ev(() => document.querySelector('#ui .res-stamp-slot').classList.contains('is-shown'))), 'the stamp waits for the count');
  await shot('results-counting');
  await t.step(120);
  ri = await info();
  T.eq([ri.phase, ri.shown], ['done', 41380], 'then lands on the net worth');
  T.ok(await ev(() => document.querySelector('#ui .res-stamp-slot').classList.contains('is-shown')), 'and the rank stamp thumps on (PILLAR OF THE COMMUNITY)');
  const text1 = await t.uiText();
  T.ok(/THE DAILY FOLD/i.test(text1) && /Final Edition · Day 40 of 40/i.test(text1), 'the masthead and "Final Edition · Day 40 of 40"');
  T.ok(/\$41,380/.test(text1) && /Cash/.test(text1) && /STR 7 · INT 7 · CHA 7/.test(text1) && /Karma \+34/.test(text1), 'net worth, its parts, the stats and karma');
  T.ok(await ev(() => { const c = document.querySelector('#ui [data-id="results-photo"]'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let ink = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 90) ink++; return ink > 400; }),
    'the halftone photo of your stick (a halo for good karma)');
  await A.check(T, t, 'results', '#ui [data-scene="results"]');
  await shot('results-good');
  await setup({ nw: 41380, karma: 34 });
  await t.step(10);
  await t.press('confirm');
  ri = await info();
  T.eq([ri.phase, ri.shown], ['done', 41380], 'a press skips the count-up and lands the stamp');
  T.eq(await t.scenes(), ['results'], 'and does nothing else');
  await t.fast(true);
  await setup({ nw: -2500, karma: -60 });
  await shot('results-evil-red');
  T.ok(/IN THE RED/.test(await ev(() => document.querySelector('#ui [data-id="results-stamp"]').textContent)) && /Loan/.test(await t.uiText()), 'below $0: IN THE RED, the loan among the parts');

  // ------------------------------------------------------------------------------------------------
  T.section('banners (B-18)');
  const banners = async (o) => { await setup(o); return ev(() => Array.from(document.querySelectorAll('#ui [data-id^="results-banner-"]')).map((b) => b.textContent)); };
  T.eq(await banners({ nw: 500000, karma: 40, patch: { job: { office: 'president' } } }), ['PRESIDENT OF STICKS'], 'in office at the end: PRESIDENT OF STICKS');
  await shot('results-president');
  T.eq(await banners({ nw: 500000, karma: -40, patch: { job: { office: 'dictator' } } }), ['DICTATOR OF STICKS'], 'or DICTATOR OF STICKS');
  T.eq(await banners({ nw: 3000, name: 'PAPERGOD' }), ['UNVERIFIED'], 'the cheat name: UNVERIFIED');
  T.eq(await banners({ nw: 3000, reason: 'death', difficulty: 'hardcore', day: 9 }), ['DECEASED'], 'death: DECEASED');
  T.ok(/Final Edition · Day 9$/im.test(await t.uiText()) || /Final Edition · Day 9 of 40/i.test(await t.uiText()), 'a death mid-run names its day');
  await shot('results-deceased');
  T.eq(await banners({ nw: 3000, patch: { flags: { foldDone: true } } }), ['MET THE ARTIST'], 'the Theory of the Fold: the MET THE ARTIST sticker');

  // ------------------------------------------------------------------------------------------------
  T.section('Copy summary (UI §5.14)');
  const expected = await ev(() => {
    const SR = window.SR;
    SR.debug.newGame({ seed: 11, name: 'Rikki', length: 40 });
    const s = SR.state;
    s.money.cash = 41380 - (SR.rules.endgame.netWorth(s) - s.money.cash);
    s.stats.karma = 34; s.stats.str = 212; s.stats.int = 388; s.stats.cha = 190; s.clock.day = 41; s.job.office = 'president';
    const r = SR.rules.endgame.results(s, 'time');
    SR.scenes.go('results', { reason: 'time', result: r }, { transition: false });
    return { head: SR.ui.results.headline(r), legacy: SR.text.num(r.legacy), fan: SR.text('ui.fanNote') };
  });
  const want = [
    'PAPER SKY · Rikki · PILLAR OF THE COMMUNITY · PRESIDENT OF STICKS',
    'Day 40 of 40 · Standard · Net worth $41,380',
    'STR 212 · INT 388 · CHA 190 · Karma +34',
    'President of Sticks · Apartment · Legacy ' + expected.legacy,
    '"' + expected.head + '"',
    expected.fan,
  ].join('\n');
  await ev(() => { window.__clip = null; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (s) => { window.__clip = s; return Promise.resolve(); } } }); });
  await t.clickUI('results-copy');
  await page.waitForFunction(() => window.__clip !== null, null, { timeout: 3000 }).catch(() => {});
  T.eq(await ev(() => window.__clip), want, 'the clipboard gets the six lines of UI §5.14');
  await ev(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('denied')) } }); });
  await t.clickUI('results-copy');
  await page.waitForSelector('#ui [data-id="results-summary-text"]', { timeout: 3000 }).catch(() => {});
  const area = await ev(() => { const a = document.querySelector('#ui [data-id="results-summary-text"]'); return a ? { v: a.value, ro: a.readOnly, sel: a.selectionEnd - a.selectionStart } : null; });
  T.ok(area && area.v === want && area.ro, 'when the clipboard refuses, a read-only textarea shows the same text', area);
  await shot('results-copy-fallback');
  await t.press('back');
  await t.step(1);
  T.eq(await t.scenes(), ['results'], 'and closes with Esc');
  const unl = await ev(() => {
    const SR = window.SR;
    SR.debug.newGame({ seed: 12, name: 'Endless', length: 0 });
    SR.state.clock.day = 12;
    SR.rules.endgame.retire(SR.state);
    return SR.ui.results.summary(SR.state.result).split('\n')[1];
  });
  T.ok(/^Day 12 of Unlimited · Standard · Net worth \$/.test(unl), 'Unlimited runs read "Day 12 of Unlimited"', unl);

  // ------------------------------------------------------------------------------------------------
  T.section('the Hall of Fame and the profile (filed once; never the cheat name)');
  await clearProfile();
  await t.debug('feature', 'achievements', true);
  await setup({ nw: 20000, name: 'Famous' });
  const p1 = await ev(() => window.SR.save.profile());
  T.eq([p1.hallOfFame.medium && p1.hallOfFame.medium.length, p1.hallOfFame.medium && p1.hallOfFame.medium[0].name, p1.totals.runs], [1, 'Famous', 1], 'a ranked run is filed under its length (Medium) and counted');
  T.ok(/Hall of Fame #1 \(Medium\)/.test(await t.uiText()) && /Legacy/.test(await t.uiText()), 'the page says where it placed (P1 flag)');
  await ev(() => window.SR.scenes.go('results', { reason: 'time', result: window.SR.state.result || window.SR.rules.endgame.results(window.SR.state, 'time') }, { transition: false }));
  const p2 = await ev(() => window.SR.save.profile());
  T.eq([p2.hallOfFame.medium.length, p2.totals.runs], [1, 1], 'showing the results again files nothing twice');
  await setup({ nw: 900000, name: 'PAPERGOD' });
  const p3 = await ev(() => window.SR.save.profile());
  T.eq(p3.hallOfFame.medium.length, 1, 'the cheat name is never entered');
  await setup({ nw: 5000, name: 'Shorty', length: 15, day: 16 });
  T.eq((await ev(() => window.SR.save.profile())).hallOfFame.short.map((e) => e.name), ['Shorty'], 'a Short run files under Short');
  await t.goto('halloffame', { tab: 'short' });
  T.ok(/Shorty/.test(await t.uiText()) && /\$5,000/.test(await t.uiText()), 'and the Hall of Fame lists it');
  await t.debug('feature', 'achievements', false);

  // ------------------------------------------------------------------------------------------------
  T.section('the end of a timed game: the paper first, then the results; Keep playing');
  await ev(() => { const SR = window.SR; window.__over = []; SR.events.on('game:over', (p) => window.__over.push(p.reason)); });
  await t.newGame({ seed: 21, name: 'Lasting', length: 15 });
  await t.set({ clock: { day: 15 } });
  await t.enter('home');
  await t.step(1);
  const sl = await t.act('home.sleep', {});
  await t.step(2);
  T.eq([sl.ok, (await t.scenes()).slice(-1)[0]], [true, 'report'], 'the last night: the morning paper comes first');
  await t.press('confirm');
  await t.step(3);
  T.eq([await t.scenes(), await ev(() => window.__over)], [['results'], ['time']], 'its button leads to the results (game:over once)');
  const canKeep = await ev(() => !!document.querySelector('#ui [data-id="results-keep"]'));
  T.ok(canKeep, 'a timed game offers Keep playing');
  await t.clickUI('results-keep');
  await t.step(2);
  const kp = await t.state();
  T.eq([await t.scenes(), kp.over, kp.mode.keepPlaying, kp.result && kp.result.reason], [['city'], false, true, 'time'], 'Keep playing continues it unranked in the city (the original results kept)');
  await t.newGame({ seed: 22, name: 'Unkept', length: 0 });
  await t.set({ clock: { day: 5 } });
  await ev(() => { window.SR.rules.endgame.retire(window.SR.state); window.SR.scenes.go('results', { reason: 'retire', result: window.SR.state.result }, { transition: false }); });
  T.ok(!(await ev(() => !!document.querySelector('#ui [data-id="results-keep"]'))), 'a retired Unlimited run has no Keep playing');
  await t.clickUI('results-title');
  await t.step(1);
  T.eq([await t.scenes(), await ev(() => window.SR.state)], [['title'], null], 'Title leaves the game');

  T.section('Hardcore: FLATLINED first, then the results with DECEASED');
  await t.newGame({ seed: 23, name: 'Fragile', difficulty: 'hardcore' });
  await t.goto('city');
  await t.set({ stats: { hp: 3 } });
  await t.down('fall');
  await t.step(1);
  const first = (await t.scenes())[0];
  T.ok(first === 'death' || first === 'results', 'the death scene presents the end (the results do not jump ahead)', await t.scenes());
  for (let i = 0; i < 5 && (await t.scenes())[0] !== 'results'; i++) await t.step(30);
  T.eq((await t.scenes())[0], 'results', 'then the Final Edition');
  T.ok(/DECEASED/.test(await t.uiText()), 'with the DECEASED banner');

  T.section('result');
  T.eq(await ev(() => window.SR.text.missing()), [], 'every text key the results showed resolves');
  T.eq(t.errors(), [], 'zero console errors');
  await t.close();
  T.done();
})().catch((e) => { console.error(e); process.exit(1); });
