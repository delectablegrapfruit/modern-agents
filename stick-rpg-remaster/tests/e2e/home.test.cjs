// tests/e2e/home.test.cjs — owner: W2-Home. The homes (BUILD_PLAN §4.3): sleep from each home
// (B-07), pills and the alarm, the Daily Fold (every section of GDD §4.7, no free tip or forecast,
// the B-29 headline, the Stick General, election-night and jail editions, the last day and a
// Hardcore default leading to the results; ↑ / ↓ scrolling a long page, a press settling the
// election needle), the home door's three modes in 8 ownership states (and the first morning's
// greeting), Tour → bank.realestate buying a home and Move in (the greeting following the door;
// moving up to Paperview's top floor in place), furniture drawn in the interior, the TV, the
// messages (archive, the 150 cap, the Pocket without a phone), the computer's trades (fee, spread,
// cap, no shorts, the tip only once revealed), the Save row, the P1 rows behind `homesPlus`, the
// a11y audit of the new screens, screenshots in shots/W2-Home/, and zero console errors.
//   node tests/e2e/home.test.cjs
'use strict';
const path = require('path');
const h = require('../harness.cjs');
const A = require('./a11y.test.cjs');

const SHOTS = path.join(h.ROOT, 'shots', 'W2-Home');
// BALANCE B-07 and B-08a, copied here (not read from tuning) so the test checks the transcription.
const B07 = { base: 0.25, flat: 15, bed: [0, 0.10, 0.20], freezer: 0.05, pill: 20,
  home: { apt: 0, apt2: 0.05, pent: 0.10, mansion: 0.15, castle: 0.20 } };
const DOORS = { home_apt: ['apt', 'apt2'], home_pent: ['pent'], home_mansion: ['mansion'], home_castle: ['castle'] };
const LIVE_P0 = ['home.sleep', 'home.tv', 'home.messages', 'home.computer', 'home.save'];

(async () => {
  const T = h.suite('e2e home');
  const t = await h.open({ fast: true });
  const ev = (fn, arg) => t.eval(fn, arg);

  /** Runs a section; a throw fails it without stopping the suite. */
  const section = async (name, fn) => {
    T.section(name);
    try { await fn(); } catch (e) { T.ok(false, 'threw: ' + (e && e.stack || e)); }
  };
  /** A fresh game, then a deep patch of the state. */
  const fresh = async (patch) => { await t.newGame({}); if (patch) await t.set(patch); };
  /** Replaces state fields outright (set merges, and arrays or maps must be exact here). */
  const put = (o) => ev((o) => { const s = window.SR.state; Object.keys(o).forEach((k) => { const p = k.split('.'); let x = s; p.slice(0, -1).forEach((q) => { x = x[q]; }); x[p[p.length - 1]] = o[k]; }); return true; }, o);
  /** Opens a door as the city would (the resolver, then the building scene). */
  const openDoor = async (door) => {
    const r = await ev((d) => { const SR = window.SR; const r = SR.world.doors.resolve(d, SR.state); SR.scenes.go('building', { id: r.id, params: r.params }, { transition: false }); return r; }, door);
    await t.step(1);
    return r;
  };
  const rows = async () => ((await t.ui()).rows || []).map((r) => r.action || String(r.id).replace(/^row-/, ''));
  const top = () => ev(() => { const x = window.SR.scenes.top(); return x ? x.id : null; });
  const report = () => ev(() => { const x = window.SR.scenes.top(); return x && x.id === 'report' ? JSON.parse(JSON.stringify(x.params.report)) : null; });
  const text = (key, vars) => ev(([k, v]) => window.SR.text(k, v), [key, vars]);
  const reportText = () => ev(() => { const el = document.querySelector('#ui [data-id="report"]'); return el ? el.innerText : ''; });
  const bus = (names) => ev((names) => {
    (window.__busOff || []).forEach((f) => f());
    window.__bus = {};
    window.__busOff = names.map((n) => { window.__bus[n] = []; return window.SR.events.on(n, (p) => window.__bus[n].push(JSON.parse(JSON.stringify(p || {})))); });
    return true;
  }, names);
  const heard = () => ev(() => window.__bus);

  // --------------------------------------------------------------------------------------------
  await section('sleep from each home applies B-07', async () => {
    const tiers = ['apt', 'apt2', 'pent', 'mansion', 'castle'];
    const sets = [{}, { bed: 1 }, { bed: 1, freezer: 1 }, { bed: 2, freezer: 1 }];
    const bad = [];
    let n = 0;
    for (const tier of tiers) {
      for (const f of sets) {
        await fresh();
        const str = 40 + n * 7;
        await put({ 'homes.owned': ['apt', tier], 'homes.living': tier, 'furniture.owned': f, 'furniture.storage': [],
          'stats.str': str, 'stats.hpMax': 15 + str, 'stats.hp': 1, 'items.pills': 0 });
        const hpMax = 15 + str;
        const want = Math.min(hpMax - 1, Math.floor(hpMax * (B07.base + B07.bed[f.bed || 0] + (f.freezer ? B07.freezer : 0) + B07.home[tier])) + B07.flat);
        const pv = await t.preview('home.sleep', {});
        const g = (pv.gains || []).filter((x) => x.kind === 'hp')[0];
        const r = await t.act('home.sleep', {});
        const s = await t.state();
        if (!r.ok || s.stats.hp - 1 !== want || !g || g.n !== want) bad.push({ tier, f, want, got: s.stats.hp - 1, preview: g && g.n, ok: r.ok, reason: r.reason });
        n++;
      }
    }
    T.eq(bad, [], 'restore = floor(hpMax × (0.25 + bed + freezer + home)) + 15, capped, in 5 homes × 4 furniture sets (and the Sleep row previews it)');
    // B-07's own examples.
    const ex = [];
    for (const [tier, f, str, want] of [['apt', {}, 7, 20], ['apt', { bed: 1 }, 85, 50], ['castle', { bed: 2, freezer: 1 }, 585, 435]]) {
      await fresh();
      await put({ 'homes.owned': ['apt', tier], 'homes.living': tier, 'furniture.owned': f, 'furniture.storage': [], 'stats.str': str, 'stats.hpMax': 15 + str, 'stats.hp': 0, 'items.pills': 0 });
      await t.act('home.sleep', {});
      ex.push((await t.state()).stats.hp);
    }
    T.eq(ex, [20, 50, 435], 'B-07 examples: HP max 22 → 20; HP max 100 with a bed → 50; HP max 600 in the castle with the pod and the freezer → 435');
    await fresh();
    await put({ 'stats.hp': 1, 'items.pills': 2 });
    await t.act('home.sleep', {});
    T.eq((await t.state()).stats.hp, 1, 'a caffeine pill takes 20 HP off the restore (22 max: 5 + 15 - 20 = 0 restored)');
    // the row previews the furniture's nightly gains too, HP max with the STR (ARCHITECTURE §6.1)
    await fresh();
    await put({ 'furniture.owned': { treadmill: 1, books: 1 }, 'furniture.storage': [], 'stats.hp': 10 });
    const pv = await t.preview('home.sleep', {});
    const g = (kind, key) => ((pv.gains || []).filter((x) => x.kind === kind && (!key || x.key === key))[0] || {}).n;
    const s0 = await t.state();
    await t.act('home.sleep', {});
    const s1 = await t.state();
    T.eq([g('stat', 'str'), g('stat', 'int'), g('hpMax')], [s1.stats.str - s0.stats.str, s1.stats.int - s0.stats.int, s1.stats.hpMax - s0.stats.hpMax],
      'the Sleep row previews the night\'s gains: +2 STR, +2 INT and the HP max that comes with the STR', pv.gains);
  });

  await section('pills and the alarm give a 00:00 wake', async () => {
    const wakes = [];
    for (const [items, auto] of [[{ pills: 1, alarm: 1 }, true], [{ alarm: 1 }, true], [{ pills: 1 }, true], [{ pills: 1, alarm: 1 }, false], [{}, true]]) {
      await fresh();
      await put({ 'items.pills': items.pills || 0, 'items.alarm': items.alarm || 0, 'clock.pillAuto': auto });
      await t.act('home.sleep', {});
      const s = await t.state();
      wakes.push([s.clock.min, s.items.pills]);
    }
    T.eq(wakes, [[0, 0], [240, 0], [240, 0], [240, 1], [480, 0]], 'pill + alarm → 00:00 (a pill used); alarm → 04:00; pill → 04:00; the Bag toggle off keeps the pill; none → 08:00');
  });

  // --------------------------------------------------------------------------------------------
  await section('the Daily Fold: every section, the Report and nothing more', async () => {
    await fresh();
    await ev(() => { window.SR.debug.feature('stockTips', true); window.SR.debug.feature('weather', true); return true; });
    await put({ 'furniture.owned': { bed: 1, books: 1 }, 'items.pills': 1, 'stats.hp': 5, 'stats.heat': 30, 'money.bank': 3000,
      'money.loan': { amount: 800, daysLeft: 6 } });
    await ev(() => {
      const SR = window.SR, s = SR.state;
      SR.rules.log.add(s, 'fall', {});
      SR.rules.log.add(s, 'promoted', { job: 'janitor', title: SR.text('job.janitor') });
      SR.rules.effects.addMsg(s, 'vm.skywatch.windy', {});
      return true;
    });
    await bus(['day:started', 'night']);
    await openDoor('home_apt');
    await t.clickUI('row-home.sleep');
    await t.step(2);
    T.eq(await t.scenes(), ['building', 'report'], 'Sleep opens the report over the home card');
    const rep = await report();
    const secs = await ev(() => ['overnight', 'money', 'markets', 'weather', 'today'].filter((x) => document.querySelector('#ui [data-id="report-sec-' + x + '"]')));
    T.eq(secs, ['overnight', 'money', 'markets', 'weather', 'today'], 'Overnight · Your money · Markets · Weather columns and the Today strip (GDD §4.7)');
    const lineTexts = await ev((ls) => ls.map((l) => window.SR.text(l.key, l.vars)), rep.lines);
    const page = await reportText();
    T.ok(lineTexts.every((x) => page.indexOf(x) >= 0), 'every line of the Report is on the page', lineTexts.filter((x) => page.indexOf(x) < 0));
    const shown = await ev(() => Array.prototype.map.call(document.querySelectorAll('#ui [data-id="report"] [data-id^="report-line-"]'), (e) => e.textContent.replace(/\s+/g, ' ').trim()));
    T.eq(shown.length, rep.lines.length, 'and no line the Report does not have (' + shown.length + ' lines)');
    const st = await t.state();
    T.ok(st.tip && st.tip.day === st.clock.day, 'a tip was drawn for today (stockTips on)', st.tip);
    T.ok(!/tip/i.test(page), 'today\'s tip appears nowhere on the page (no source revealed it)');
    T.ok(rep.lines.every((l) => !/forecast|tomorrow/i.test(l.key)) && !/forecast|tomorrow/i.test(page), 'tomorrow\'s forecast appears nowhere (weather on)');
    const wx = rep.lines.filter((l) => l.section === 'weather').map((l) => l.key);
    T.ok(wx.length === 1 && (wx[0] === 'report.weather.' + rep.weather.today || wx[0] === 'report.weather.storm'), 'the Weather column is today\'s weather only', wx);
    T.eq(rep.headline.key, 'news.head.promoted', 'the headline is yesterday\'s heaviest entry (promoted 60 > fall 10; B-29)');
    const head = await ev(() => document.querySelector('#ui [data-id="report-headline"]').textContent);
    const want = await ev((hd) => window.SR.text(hd.key, window.SR.ui.report.newsVars(hd.vars)), rep.headline);
    T.eq(head.toLowerCase(), want.toLowerCase(), 'the page prints it with the log entry\'s title: "' + want + '"');
    T.ok(/janitor/i.test(head), 'the template names the new title');
    const a = await t.eval(A.audit, '[data-id="report"]');
    T.eq(a.issues, [], 'a11y: the paper\'s names, roles and contrast (' + a.checked + ' text nodes)');
    await t.shot(path.join(SHOTS, 'report-morning.png'));
    await t.press('confirm');
    await t.step(2);
    const s2 = await t.state();
    const door = await ev(() => window.SR.world.spawnPoint('homeDoor'));
    const b = await heard();
    T.eq([await t.scenes(), b['day:started'].map((x) => x.day), b.night.length], [['city'], [2], 1], 'Good morning: the night event, day:started (day 2), the city');
    T.eq([s2.player.x, s2.player.y], [Math.round(door.x), Math.round(door.y)], 'outside the home door');
    await ev(() => { window.SR.debug.feature('stockTips', false); window.SR.debug.feature('weather', false); return true; });
  });

  await section('the headline follows B-29 for a scripted log', async () => {
    const cases = [
      [[['storm', {}]], 'news.head.absurd', 'below minWeight 10: a city absurdity'],
      [[['fall', {}], ['carHit', {}]], 'news.head.carHit', 'carHit 15 > fall 10'],
      [[['promoted', { job: 'janitor', title: 'Janitor' }], ['jailed', { reason: 'rob', days: 3 }], ['homeBought', { home: 'apt2', name: 'Bigger Apartment' }]], 'news.head.jailed', 'jailed 80 > promoted 60 > homeBought 45'],
      [[['electionWon', { path: 'president', poll: 55 }], ['removed', { path: 'president', how: 'impeached' }]], 'news.head.electionWon', 'the election outweighs everything'],
    ];
    const got = [];
    for (const [log, key] of cases) {
      await fresh();
      await ev((log) => { const SR = window.SR; log.forEach((e) => SR.rules.log.add(SR.state, e[0], e[1])); return true; }, log);
      const r = await t.act('home.sleep', {});
      const hd = r.report && r.report.headline;
      const shown = await ev(() => { const el = document.querySelector('#ui [data-id="report-headline"]'); return el ? el.textContent : null; });
      const want = await ev((hd) => window.SR.text(hd.key, window.SR.ui.report.newsVars(hd.vars)), hd);
      got.push([hd && hd.key, !!shown && shown.toLowerCase() === want.toLowerCase() && !/[{}⟦]/.test(shown)]);
      await t.press('confirm');
      await t.step(1);
    }
    T.eq(got, cases.map((c) => [c[1], true]), cases.map((c) => c[2]).join('; '));
    // ties: the latest of equal weights
    await fresh();
    await ev(() => { const SR = window.SR; SR.rules.log.add(SR.state, 'promoted', { job: 'janitor', title: 'First' }); SR.rules.log.add(SR.state, 'promoted', { job: 'mailroom', title: 'Second' }); return true; });
    const r = await t.act('home.sleep', {});
    T.eq(r.report.headline.vars.title, 'Second', 'ties: the latest entry');
    await t.press('confirm');
    await t.step(1);
    const keys = await ev(() => {
      const SR = window.SR, kinds = Object.keys(SR.tuning.news.weights);
      return kinds.filter((k) => !SR.text.has('news.head.' + k) || !SR.text.has('news.tv.' + k));
    });
    T.eq(keys, [], 'every B-29 kind has a headline and a TV lead (news.head.<kind>, news.tv.<kind>)');
    const counts = await ev(() => {
      const R = window.SR.reg.text;
      const n = (k) => (Array.isArray(R[k]) ? R[k].length : R[k] ? 1 : 0);
      return { absurd: n('news.head.absurd'), story: n('news.story'), fitness: n('tv.fitness'), dating: n('tv.dating'), market: n('tv.market'),
        heads: Object.keys(R).filter((k) => /^news\.head\./.test(k)).reduce((a, k) => a + n(k), 0) };
    });
    T.ok(counts.heads >= 20 && counts.absurd >= 20 && counts.story === 30 && counts.fitness === 10 && counts.dating === 10 && counts.market === 8,
      'text volume: ≥ 20 headline templates (' + counts.heads + '), 20 absurdities, 30 stories, 10 fitness and 10 dating shows, 8 Market Watch segments', counts);
  });

  await section('editions: Stick General, election night, jail', async () => {
    await fresh({ mode: { difficulty: 'standard' } });
    await put({ 'money.cash': 600, 'stats.hp': 0 });
    await ev(() => { const SR = window.SR, s = SR.state; window.__d = SR.rules.health.down(s, 'carHit', { rng: SR.rng.rules, now: s.clock.min, source: 'debug' }); return true; });
    await t.goto('city');
    await ev(() => { window.SR.scenes.push('report', { report: window.__d.report }); return true; });
    await t.step(1);
    const page = await reportText();
    const [mast, bill] = await Promise.all([text('news.masthead.hospital'), ev(() => { const l = window.__d.report.lines.filter((x) => x.key === 'report.hospital.bill')[0]; return window.SR.text(l.key, l.vars); })]);
    T.ok(page.toLowerCase().indexOf(mast.toLowerCase()) >= 0 && page.indexOf(bill) >= 0, 'the Stick General masthead, the bill and the written-off part', { mast, bill });
    T.ok(await ev(() => !!document.querySelector('#ui [data-id="report-sec-hospital"]')), 'the hospital block over the usual sections');
    T.eq(await ev(() => document.querySelector('#ui [data-id="report-continue"]').textContent.indexOf(window.SR.text('news.continue.hospital')) >= 0), true, 'its button: out into the noon');
    await t.shot(path.join(SHOTS, 'report-hospital.png'));
    await t.press('confirm');
    await t.step(2);
    const s = await t.state();
    const door = await ev(() => window.SR.world.spawnPoint('afterHospital'));
    T.eq([await t.scenes(), s.clock.min, s.player.x, s.player.y], [['city'], 720, Math.round(door.x), Math.round(door.y)], 'then the city at 12:00, outside the home door');

    // election night: the front page first, then the usual edition
    await fresh();
    await put({ 'homes.owned': ['apt', 'castle'], 'homes.living': 'castle', 'election.status': 'campaign', 'election.path': 'president',
      'election.campaignDay': 7, 'election.poll': 60 });
    await openDoor('home_castle');
    const r = await t.act('home.sleep', {});
    await t.step(1);
    T.ok(r.report && r.report.election && typeof r.report.election.won === 'boolean', 'the night after campaign day 7 is election night', r.report && r.report.election);
    const front = await ev(() => ({ el: !!document.querySelector('#ui [data-id="report-election"]'), poll: !!document.querySelector('#ui [data-id="report-poll"]'),
      needle: !!document.querySelector('#ui [data-id="report-needle"]'), head: document.querySelector('#ui [data-id="report-headline"]').textContent }));
    T.ok(front.el && front.poll && front.needle, 'the election-night front page: the result, the poll bar and the swing\'s needle', front);
    const line = await ev(() => { const SR = window.SR; return [document.querySelector('#ui [data-id="report-election"]').textContent, SR.text('news.election.line', { n: SR.tuning.election.win.threshold })]; });
    T.ok(line[0].indexOf(line[1]) >= 0 && /50/.test(line[1]), 'the winning line comes from B-17 (election.win.threshold): "' + line[1] + '"');
    await t.shot(path.join(SHOTS, 'report-election.png'));
    await t.press('confirm');
    await t.step(1);
    T.eq(await top(), 'report', 'the button turns the page');
    T.ok(await ev(() => !!document.querySelector('#ui [data-id="report-sec-election"]') && !!document.querySelector('#ui [data-id="report-sec-overnight"]')), 'page 2: the morning edition, the campaign\'s lines in their block');
    await t.shot(path.join(SHOTS, 'report-election-2.png'));
    await t.press('confirm');
    await t.step(2);
    T.eq(await t.scenes(), ['city'], 'then the city');

    // a jail night pushed by the jail flow: one page, and it pops back
    await fresh();
    await ev(() => { const SR = window.SR, s = SR.state; window.__j = SR.rules.night.run(s, { rng: SR.rng.rules }, { kind: 'jail' }); return true; });
    await t.goto('city');
    const back = await ev(() => { window.__popped = null; window.SR.scenes.push('report', { report: window.__j }).then((x) => { window.__popped = x; }); return true; });
    await t.step(1);
    T.ok(back && (await reportText()).length > 0, 'a jail night shows its Cell Block edition');
    await t.press('confirm');
    await t.step(1);
    T.eq([await t.scenes(), await ev(() => window.__popped)], [['city'], 'done'], 'and pops back to its caller with "done" (next defaults to pop for jail)');
    // params.next may name another scene
    await ev(() => { window.SR.scenes.push('report', { report: window.__j, next: 'title', events: false, dayStarted: false }); return true; });
    await t.step(1);
    await t.press('confirm');
    await t.step(1);
    T.eq(await t.scenes(), ['title'], 'next: a scene id goes to that scene');
  });

  await section('the paper by keyboard: ↑ / ↓ scroll a long page; a press settles the election needle', async () => {
    await fresh();
    await t.goto('city');
    // a long night: more lines than the page holds
    await ev(() => {
      const lines = [];
      for (let i = 0; i < 40; i++) lines.push({ section: i % 2 ? 'overnight' : 'money', icon: 'hp', key: 'news.quiet', vars: {}, weight: 1 });
      window.SR.scenes.push('report', { report: { kind: 'sleep', day: 2, endedDay: 1, weekday: 1, lines, headline: { key: 'news.head.absurd', vars: { variant: 3 } },
        weather: { today: 'clear' }, election: null, events: [], ended: null, dead: null }, next: 'pop', dayStarted: false });
      return true;
    });
    await t.step(1);
    const body = () => ev(() => { const b = document.querySelector('#ui [data-id="report-body"]'); return { top: b.scrollTop, over: b.scrollHeight > b.clientHeight }; });
    const b0 = await body();
    await t.press('down');
    await t.press('down');
    const b1 = await body();
    await t.press('up');
    const b2 = await body();
    const focus = await ev(() => document.activeElement && document.activeElement.getAttribute('data-id'));
    T.ok(b0.over && b0.top === 0 && b1.top > 0 && b2.top < b1.top && focus === 'report-continue',
      'the Continue button keeps the focus while ↓ / ↑ scroll the columns', [b0, b1, b2, focus]);
    await t.press('confirm');
    await t.step(1);
    T.eq(await t.scenes(), ['city'], 'and Continue still closes it');
    // the needle: with motion on, the first press settles it (the stamp lands), the second turns the page
    const skip = await ev(() => {
      const SR = window.SR;
      SR.debug.fast(false);
      try {
        const el = SR.ui.report.build({ kind: 'sleep', day: 2, weekday: 1, lines: [], headline: { key: 'news.head.absurd', vars: { variant: 1 } },
          election: { won: false, poll: 47, roll: 1, path: 'president' }, events: [] }, {});   // a loss: no confetti over later shots
        document.getElementById('ui').appendChild(el);
        el.onShow();
        const res = el.querySelector('[data-id="report-election-result"]');
        const out = [el.page(), res.style.visibility];
        out.push(el.next(), el.page(), res.style.visibility, el.next(), el.page());
        el.remove();
        SR.ui.stamp.clear();
        return out;
      } finally { SR.debug.fast(true); }
    });
    T.eq(skip, [0, 'hidden', true, 0, 'visible', true, 1], 'the first press settles the swinging needle on the front page, the next turns it');
  });

  await section('the last day of a timed game leads to the results; a Hardcore default too', async () => {
    await fresh({ mode: { length: 15 } });
    await put({ 'clock.day': 15 });
    await bus(['game:over', 'day:started']);
    await openDoor('home_apt');
    const r = await t.act('home.sleep', {});
    await t.step(1);
    T.eq([r.report.ended, await top()], ['time', 'report'], 'day 15 of 15: the night ends the game and the paper still comes first');
    T.eq(await ev(() => document.querySelector('#ui [data-id="report-continue"]').textContent.indexOf(window.SR.text('news.continue.final')) >= 0), true, 'its button reads "Read the Final Edition"');
    T.ok(await ev(() => !!document.querySelector('#ui [data-id="report-ended"]')), 'and it says the days are up');
    await t.press('confirm');
    await t.step(2);
    const b = await heard();
    const hasResults = await ev(() => !!window.SR.reg.scene.results);
    const stack = await t.scenes();
    T.eq(b['game:over'].map((x) => x.reason), ['time'], 'game:over (time) exactly once');
    T.ok(hasResults ? stack.indexOf('results') >= 0 : stack[0] === 'title', 'then the results (or the title while W2-Front\'s results are a stub)', stack);

    await fresh({ mode: { difficulty: 'hardcore' } });
    await put({ 'money.loan': { amount: 5000, daysLeft: 1 }, 'money.cash': 0 });
    await bus(['game:over']);
    await openDoor('home_apt');
    const d = await t.act('home.sleep', {});
    await t.step(1);
    T.eq([d.report.dead, await top()], ['loan', 'report'], 'Hardcore loan default: the report first (GDD §4.7 step 13)');
    T.ok(await ev(() => !!document.querySelector('#ui [data-id="report-dead"]')), 'with the collection agents\' notice');
    await t.press('confirm');
    await t.step(2);
    T.eq((await heard())['game:over'].map((x) => x.reason), ['death'], 'game:over (death) exactly once');
  });

  // --------------------------------------------------------------------------------------------
  await section('every home door opens the right mode in 8 ownership states', async () => {
    const states = [
      [['apt'], 'apt'], [['apt', 'apt2'], 'apt'], [['apt', 'apt2'], 'apt2'], [['apt', 'pent'], 'apt'],
      [['apt', 'pent'], 'pent'], [['apt', 'mansion'], 'mansion'], [['apt', 'castle'], 'castle', 'nominated'],
      [['apt', 'apt2', 'pent', 'mansion', 'castle'], 'castle'],
    ];
    const bad = [];
    for (const [owned, living, election] of states) {
      await fresh();
      await put({ 'homes.owned': owned, 'homes.living': living, 'election.status': election || 'none' });
      for (const door of Object.keys(DOORS)) {
        const tiers = DOORS[door];
        const own = tiers.filter((x) => owned.indexOf(x) >= 0);
        const mode = tiers.indexOf(living) >= 0 ? 'live' : own.length ? 'owned' : 'forSale';
        const homeId = mode === 'live' ? living : mode === 'owned' ? own[own.length - 1] : tiers[0];
        const r = await openDoor(door);
        const got = await rows();
        let want;
        if (mode === 'live') {
          want = LIVE_P0.slice();
          if (living === 'apt') want.push('home.topFloor');   // Tour while unsold, then the listing's Move in
          if (living === 'castle' && election) want.push('home.campaign');
        } else want = mode === 'owned' ? ['home.moveIn'] : ['home.tour'];
        const vis = await ev(() => { const SR = window.SR, p = SR.scenes.top().params.params; const r = SR.art.interior('home', p); return r.def.props.filter((q) => !q.when || q.when(SR.state, p)).map((q) => q.type); });
        const okProps = mode === 'live' ? vis.indexOf('answering') >= 0 : vis.indexOf('answering') < 0;
        if (r.params.mode !== mode || r.params.homeId !== homeId || got.slice().sort().join() !== want.slice().sort().join() || !okProps) {
          bad.push({ owned, living, door, mode: [r.params.mode, mode], homeId: [r.params.homeId, homeId], rows: got, want });
        }
        if (door === 'home_pent' && mode === 'forSale' && living === 'apt' && owned.length === 1) await t.shot(path.join(SHOTS, 'door-forsale-pent.png'));
      }
    }
    T.eq(bad, [], '4 doors × 8 states: Live (the home card), Owned (Move in), For Sale (Tour); the interior has your things only where you live');
    // the For Sale sign carries the listing's exterior photo (UI §5.6), baked by SR.art.exterior
    await fresh();
    await openDoor('home_mansion');
    await t.step(2);
    // (the frame's backdrop is ui.primary-100; the paper grain moves it by a few units only)
    const photo = await t.pixels(516, 362, 128, 70);   // the sign at x 470: its photo frame from (514, 360)
    const bg = await ev(() => window.SR.art.draw.color('ui.primary-100'));
    const [br, bgg, bb] = [1, 3, 5].map((i) => parseInt(bg.slice(i, i + 2), 16));
    let drawn = 0;
    for (let i = 0; i < photo.data.length; i += 4) if (Math.abs(photo.data[i] - br) + Math.abs(photo.data[i + 1] - bgg) + Math.abs(photo.data[i + 2] - bb) > 90) drawn++;
    T.ok(drawn > 400, 'a For Sale door\'s sign shows the building\'s photo (' + drawn + ' pixels of building in its frame)');
    // the first morning's greeting (a new game holds Mel's offer: the machine is blinking, UI §9)
    await fresh();
    await openDoor('home_apt');
    const g1 = await ev(() => { const e = document.querySelector('#ui [data-id="card-greeting"]'); return e ? e.textContent : ''; });
    const st1 = await t.state();
    const want1 = await text(st1.msgs.some((m) => !m.read) ? 'greet.home.firstCall' : 'greet.home.first', { name: st1.player.name });
    T.ok(g1.indexOf(want1) >= 0, 'the first morning at home has its own greeting', [g1, want1]);
  });

  await section('Tour buys a home through bank.realestate; Move in', async () => {
    await fresh();
    await put({ 'money.cash': 45000 });
    const real = await ev(() => !!window.SR.reg.subscreen['bank.realestate']);
    await ev((real) => {
      const SR = window.SR;
      if (!SR.reg.action['test.homeBuy']) SR.def.action('test.homeBuy', { building: 'test', group: 'services', label: 'act.home.tour', p: 0, timeRule: 'free', effects: [['fn', 'homes.buy']] });
      window.__re = [];
      if (!real) {
        // W2-Money's Real Estate page is still a stub: a test stand-in with its Buy.
        SR.def.subscreen('bank.realestate', { title: 'act.home.tour', p: 0,
          mount(root, ctx) { window.__re.push(JSON.parse(JSON.stringify(ctx.params))); const b = document.createElement('button'); b.setAttribute('data-id', 'test-re-buy'); b.setAttribute('data-nav', ''); b.textContent = 'Buy'; b.onclick = () => ctx.act('test.homeBuy', { homeId: ctx.params.homeId }); root.appendChild(b); } });
      }
      return true;
    }, real);
    const r = await openDoor('home_pent');
    T.eq([r.params.mode, await rows()], ['forSale', ['home.tour']], 'the penthouse is for sale: the Tour row');
    await t.clickUI('row-home.tour');
    await t.step(1);
    T.eq(await ev(() => window.SR.ui.card.screens()), ['bank.realestate'], 'Tour opens the bank\'s Real Estate page in the home card');
    const greeting = () => ev(() => { const e = document.querySelector('#ui [data-id="card-greeting"]'); return e ? e.textContent : ''; });
    const forSaleText = await text('greet.home.forSale', { home: await text('home.pent') });
    T.ok((await greeting()).indexOf(forSaleText.slice(0, 12)) >= 0, 'the For Sale card\'s greeting gives the listing', await greeting());
    if (!real) {
      T.eq((await ev(() => window.__re))[0], { homeId: 'pent', mode: 'forSale' }, 'focused on the penthouse (params.homeId)');
      await t.clickUI('test-re-buy');
    } else {
      // W2-Money's page: the penthouse's card first, its Buy, then the confirm (property is irreversible).
      const first = await ev(() => { const s = document.querySelector('#ui [data-id="re-list"] > section[data-id^="re-"]'); return s ? s.getAttribute('data-id') : null; });
      T.eq(first, 're-pent', 'focused on the penthouse (params.homeId): its card comes first');
      await t.clickUI('re-buy-pent');
      await t.step(1);
      await t.clickUI('confirm-re-yes');
    }
    await t.step(1);
    let s = await t.state();
    T.eq([s.homes.owned.indexOf('pent') >= 0, s.money.cash], [true, 5000], 'bought: $40,000 (B-08a), the penthouse is yours');
    await t.press('back');
    await t.step(2);
    T.eq(await rows(), ['home.moveIn'], 'back on the card: the door is Owned now, with Move in');
    T.ok((await greeting()).indexOf(forSaleText.slice(0, 12)) < 0, 'and the greeting follows the door: no "For sale" over Move in', await greeting());
    await t.clickUI('row-home.moveIn');
    await t.step(2);
    s = await t.state();
    T.eq([s.homes.living, (await rows()).slice().sort()], ['pent', LIVE_P0.slice().sort()], 'Move in: you live there, and the card is the home card');
    await t.shot(path.join(SHOTS, 'moved-in-pent.png'));
    // Paperview's top floor: Tour and buy it, then move up without leaving (the door stays Live)
    await fresh();
    await put({ 'money.cash': 20000, 'furniture.owned': { bed: 1, tv: 1 } });
    await openDoor('home_apt');
    T.ok((await rows()).indexOf('home.topFloor') >= 0, 'in the apartment, while the top floor is unsold: "Top floor: Tour"');
    await t.clickUI('row-home.topFloor');
    await t.step(1);
    T.eq(!real ? (await ev(() => window.__re)).slice(-1)[0].homeId : await ev(() => { const s = document.querySelector('#ui [data-id="re-list"] > section[data-id^="re-"]'); return s ? s.getAttribute('data-id').slice(3) : null; }),
      'apt2', 'it opens Real Estate on the top floor');
    if (real) {
      await t.clickUI('re-buy-apt2');
      await t.step(1);
      await t.clickUI('confirm-re-yes');
    } else await t.act('test.homeBuy', { homeId: 'apt2' });
    await t.step(1);
    await t.press('back');
    await t.step(2);
    T.ok((await t.state()).homes.owned.indexOf('apt2') >= 0 && (await rows()).indexOf('home.topFloor') >= 0,
      'the top floor bought, the row stays while you live downstairs (its listing has Move in)');
    await t.clickUI('row-home.topFloor');
    await t.step(1);
    if (real) await t.clickUI('re-moveIn-apt2');
    else {
      await ev(() => { const SR = window.SR; if (!SR.reg.action['test.moveIn']) SR.def.action('test.moveIn', { building: 'test', group: 'services', label: 'act.home.moveIn', p: 0, timeRule: 'free', effects: [['fn', 'homes.moveIn']] }); return true; });
      await t.act('test.moveIn', { homeId: 'apt2' });
    }
    await t.step(1);
    await t.press('back');
    await t.step(2);
    const moved = await ev(() => { const SR = window.SR, p = SR.scenes.top().params.params; return { living: SR.state.homes.living, params: p.homeId,
      props: SR.art.interior('home', p).def.props.filter((q) => !q.when || q.when(SR.state, p)).map((q) => q.type) }; });
    T.ok(moved.living === 'apt2' && moved.params === 'apt' && ['balconydoor', 'bed', 'tv', 'answering'].every((x) => moved.props.indexOf(x) >= 0),
      'moved up behind the same door: the interior is the top floor\'s, with your things (the door\'s params still name the apartment)', moved);
    T.ok((await rows()).indexOf('home.topFloor') < 0, 'and the Top floor row is gone upstairs');
    await t.shot(path.join(SHOTS, 'moved-up-apt2.png'));
  });

  await section('a furniture piece you buy appears in the interior', async () => {
    await fresh();
    await put({ 'money.cash': 20000 });
    await ev(() => { const SR = window.SR; if (!SR.reg.action['test.furn']) SR.def.action('test.furn', { building: 'test', group: 'buy', label: 'act.home.tour', p: 0, timeRule: 'free', effects: [['fn', 'homes.buyFurniture']] }); return true; });
    await openDoor('home_apt');
    await t.step(2);
    const before = await t.pixels(20, 400, 280, 130);
    const props0 = await ev(() => { const SR = window.SR, p = SR.scenes.top().params.params; return SR.art.interior('home', p).def.props.filter((q) => !q.when || q.when(SR.state, p)).map((q) => q.type); });
    await t.goto('city');
    const bought = await t.act('test.furn', { piece: 'bed' });
    await t.act('test.furn', { piece: 'tv' });
    await t.act('test.furn', { piece: 'satellite' });
    T.ok(bought.ok, 'bought the Featherfold Bed, the TV and the satellite', bought.reason);
    await openDoor('home_apt');
    await t.step(2);
    const after = await t.pixels(20, 400, 280, 130);
    const props1 = await ev(() => { const SR = window.SR, p = SR.scenes.top().params.params; return SR.art.interior('home', p).def.props.filter((q) => !q.when || q.when(SR.state, p)).map((q) => q.type); });
    let diff = 0;
    for (let i = 0; i < before.data.length; i += 4) if (Math.abs(before.data[i] - after.data[i]) + Math.abs(before.data[i + 1] - after.data[i + 1]) > 40) diff++;
    T.ok(props0.indexOf('bed') < 0 && props1.indexOf('bed') >= 0 && props1.indexOf('tv') >= 0 && props1.indexOf('skydish') >= 0, 'the interior lists the bed, the TV and the dish', props1);
    T.ok(diff > 2000, 'and draws the bed at its spot (' + diff + ' pixels changed)');
    await t.shot(path.join(SHOTS, 'furniture-apt.png'));
    // tier 2 and a full house, one shot per home
    const all = { bed: 2, tv: 2, pc: 2, books: 1, treadmill: 1, freezer: 1, minibar: 1 };
    for (const tier of ['apt', 'apt2', 'pent', 'mansion', 'castle']) {
      await put({ 'homes.owned': ['apt', 'apt2', 'pent', 'mansion', 'castle'], 'homes.living': tier, 'furniture.owned': all });
      await ev(() => { window.SR.rules.homes.restock(window.SR.state); return true; });
      const r = await openDoor(DOORS.home_apt.indexOf(tier) >= 0 ? 'home_apt' : 'home_' + tier);
      await t.step(2);
      if (tier === 'castle') {
        const vis = await ev(() => { const SR = window.SR, p = SR.scenes.top().params.params; return SR.art.interior('home', p).def.props.filter((q) => !q.when || q.when(SR.state, p)).map((q) => (q.pick && q.pick(SR.state, p)) || q.type); });
        T.ok(vis.indexOf('pod') >= 0 && vis.indexOf('workstation') >= 0 && vis.indexOf('throne') >= 0, 'tier-2 pieces draw as their tier (the pod, the Workstation) in the throne room', vis);
      }
      await t.shot(path.join(SHOTS, 'interior-' + tier + '.png'));
      T.eq(r.params.homeId, tier, 'the ' + tier + ' interior');
    }
    // ART_AUDIO §9: the scene lives in x 0-760 (the card covers the rest), every piece at either tier
    const wide = await ev(() => {
      const SR = window.SR, s = SR.state, PROPS = SR.art.interior.kit.PROPS, out = [];
      const pieces = ['bed', 'tv', 'pc', 'books', 'treadmill', 'freezer', 'minibar', 'aquarium'];
      ['apt', 'apt2', 'pent', 'mansion', 'castle'].forEach((tier) => [1, 2].forEach((lvl) => {
        s.homes.living = tier;
        s.furniture.owned = {};
        pieces.forEach((k) => { s.furniture.owned[k] = k === 'freezer' || k === 'aquarium' ? 1 : lvl; });
        s.furniture.owned.satellite = 1;
        s.furniture.storage = [];
        const p = { homeId: tier, mode: 'live' };
        SR.art.interior('home', p).def.props.forEach((q) => {
          if (q.when && !q.when(s, p)) return;
          const type = (q.pick && q.pick(s, p)) || q.type, d = PROPS[type] || {};
          const right = q.x + (q.w || d.w || 0);
          if (right > 760) out.push([tier, lvl, type, right]);
        });
      }));
      return out;
    });
    T.eq(wide, [], 'every piece, at tier 1 and tier 2, stays inside the scene (x ≤ 760) in all five homes');
  });

  // --------------------------------------------------------------------------------------------
  await section('the computer: fees, spread, the position cap, no shorts, the tip only once revealed', async () => {
    await fresh();
    await put({ 'furniture.owned': { pc: 1 }, 'money.cash': 2000 });
    await openDoor('home_apt');
    await t.clickUI('row-home.computer');
    await t.step(1);
    T.eq(await ev(() => window.SR.ui.card.screens()), ['home.stocks'], 'Computer opens home.stocks');
    const list = await ev(() => ['MCS', 'NLI', 'SLC', 'PPR', 'GLU', 'SKY'].filter((k) => document.querySelector('#ui [data-id="stock-' + k + '"]')));
    T.eq(list.length, 6, 'six tickers');
    await t.shot(path.join(SHOTS, 'stocks-list.png'));
    await t.clickUI('stock-MCS');
    await t.step(1);
    await t.page.fill('#ui [data-id="stock-n-input"]', '10');
    const s0 = await t.state();
    await t.clickUI('stock-buy');
    await t.step(1);
    const s1 = await t.state();
    const p = s0.stocks.MCS.price;
    T.eq([s0.money.cash - s1.money.cash, s1.stocks.MCS.held], [Math.round(10 * p * 1.005) + 5, 10], 'Buy 10: price × 1.005 each plus the $5 fee (B-10)');
    T.ok(Math.abs(s1.stocks.MCS.basis - 10 * p * 1.005) < 0.02, 'the cost basis is what was paid for the shares');
    // the list row gives the holding and its unrealised P/L (UI §5.6)
    await t.press('back');
    await t.step(1);
    const heldRow = await ev(() => { const e = document.querySelector('#ui [data-id="stock-held-MCS"]'); return e ? e.textContent : ''; });
    const wantPl = await ev((st) => window.SR.text('sub.home.stocks.pl', { money: window.SR.text.money(Math.round(st.held * st.price - st.basis), { sign: true }) }), s1.stocks.MCS);
    T.ok(/10/.test(heldRow) && heldRow.indexOf(wantPl) >= 0, 'the list row: held and P/L ("' + heldRow + '")');
    await t.clickUI('stock-MCS');
    await t.step(1);
    await t.page.fill('#ui [data-id="stock-n-input"]', '10');
    await t.page.fill('#ui [data-id="stock-n-input"]', '11');
    await t.step(1);
    const sell11 = await ev(() => { const b = document.querySelector('#ui [data-id="stock-sell"]'); return { disabled: b.getAttribute('aria-disabled') === 'true' }; });
    const short = await t.act('home.stockSell', { ticker: 'MCS', n: 11 });
    T.ok(sell11.disabled && !short.ok && short.reason === 'reason.noShares', 'selling more than you hold is refused: no shorts', short.reason);
    await t.page.fill('#ui [data-id="stock-n-input"]', '10');
    await t.step(1);
    await t.clickUI('stock-sell');
    await t.step(1);
    const s2 = await t.state();
    T.eq([s2.money.cash - s1.money.cash, s2.stocks.MCS.held], [Math.max(0, Math.round(10 * p * 0.995) - 5), 0], 'Sell 10: price × 0.995 each less the $5 fee');
    await put({ 'money.cash': 100000, 'stats.int': 0 });
    await ev(() => { window.SR.ui.card.refresh(); return true; });
    await t.step(1);
    const capN = Math.floor(10000 / (p * 1.005) + 1e-9);
    await t.page.fill('#ui [data-id="stock-n-input"]', String(capN + 50));
    await t.step(1);
    const typed = await ev(() => document.querySelector('#ui [data-id="stock-n-input"]').value);
    const over = await t.act('home.stockBuy', { ticker: 'MCS', n: capN + 1 });
    const at = await t.preview('home.stockBuy', { ticker: 'MCS', n: capN });
    T.ok(Number(typed) === capN && over.reason === 'reason.positionCap' && at.ok, 'the position cap ($10,000 + $100 × INT a ticker): the field stops at ' + capN + ' shares, one more is refused', [typed, over.reason]);
    await t.shot(path.join(SHOTS, 'stocks-ticker.png'));
    // the tip banner (P1 stockTips): only once a source revealed it
    await ev(() => { window.SR.debug.feature('stockTips', true); const s = window.SR.state; s.tip = { day: s.clock.day, ticker: 'NLI', dir: 'up', truthful: true, size: 0.03, pct: 3, reliability: 0.55, revealed: { tv: false, paper: false, market: false, mingle: false, harold: false } }; window.SR.ui.card.refresh(); return true; });
    await t.step(1);
    const hidden = await ev(() => document.querySelector('#ui [data-id="stock-tip"]').textContent);
    await ev(() => { window.SR.state.tip.revealed.tv = true; window.SR.ui.card.refresh(); return true; });
    await t.step(1);
    const shown = await ev(() => document.querySelector('#ui [data-id="stock-tip"]').textContent);
    T.ok(hidden === (await text('sub.home.stocks.tipNone')) && /NLI ▲/.test(shown) && /TV/.test(shown) && /55 %/.test(shown), 'the tip banner: "No tip yet today" until TV revealed it, then "NLI ▲ · seen on TV · reliability 55 %"', [hidden, shown]);
    await ev(() => { window.SR.debug.feature('stockTips', false); return true; });
    const a = await t.eval(A.audit, '[data-id="card"]');
    T.eq(a.issues, [], 'a11y: the Stocks page (' + a.controls + ' controls)');
  });

  await section('the TV: channels, views left, the shows', async () => {
    await fresh();
    await put({ 'furniture.owned': { tv: 1 } });
    await openDoor('home_apt');
    await t.clickUI('row-home.tv');
    await t.step(1);
    const ch1 = await ev(() => Array.prototype.map.call(document.querySelectorAll('#ui [data-id="tv-channels"] .arow'), (r) => [r.getAttribute('data-row'), r.classList.contains('is-disabled')]));
    T.eq(ch1, [['home.tvNews', false], ['home.tvFitness', true], ['home.tvDating', true]], 'News with the TV; Fitness and Dating need the satellite (Market Watch is P1)');
    const s0 = await t.state();
    await t.clickUI('row-home.tvNews');
    await t.step(1);
    const s1 = await t.state();
    const show = await ev(() => document.querySelector('#ui [data-id="tv-text"]').textContent);
    T.eq([s1.stats.int - s0.stats.int, s1.clock.min - s0.clock.min], [2, 60], 'News: +2 INT, 1 h (B-03)');
    T.ok(show.length > 20 && !/[{}⟦]/.test(show), 'the show plays: "' + show + '"');
    await t.shot(path.join(SHOTS, 'tv.png'));
    await t.clickUI('row-home.tvNews');
    await t.step(1);
    const third = await t.act('home.tvNews', {});
    T.eq([third.ok, third.reason], [false, 'reason.dailyLimit'], 'two viewings a day per channel');
    await put({ 'furniture.owned': { tv: 1, satellite: 1 } });
    await ev(() => { window.SR.ui.card.refresh(); return true; });
    await t.step(1);
    const f0 = await t.state();
    await t.clickUI('row-home.tvFitness');
    await t.step(1);
    const f1 = await t.state();
    T.eq(f1.stats.str - f0.stats.str, 2, 'the satellite brings Fitness (+2 STR)');
    // TV News leads with yesterday's heaviest entry
    await fresh();
    await put({ 'furniture.owned': { tv: 1 } });
    await ev(() => { const SR = window.SR, s = SR.state; s.log.yesterday = [{ kind: 'promoted', weight: 60, vars: { job: 'janitor', title: 'Janitor' } }]; return true; });
    await openDoor('home_apt');
    await t.clickUI('row-home.tv');
    await t.step(1);
    await t.clickUI('row-home.tvNews');
    await t.step(1);
    const lead = await ev(() => document.querySelector('#ui [data-id="tv-text"]').textContent);
    const want = await ev(() => window.SR.text('news.tv.promoted', window.SR.ui.report.newsVars({ job: 'janitor', title: 'Janitor' })));
    T.eq(lead, want, 'the TV news leads with the same entry as the morning headline');
    // Market Watch (P1): the SkyDish, and it always reveals today's tip
    await ev(() => { window.SR.debug.feature('stockTips', true); window.SR.debug.feature('homesPlus', true); const s = window.SR.state; s.furniture.owned = { tv: 2 }; s.tip = { day: s.clock.day, ticker: 'SKY', dir: 'down', truthful: false, size: 0.04, pct: 4, reliability: 0.6, revealed: { tv: false, paper: false, market: false, mingle: false, harold: false } }; window.SR.ui.card.refresh(); return true; });
    await t.step(1);
    await t.clickUI('row-home.tvMarket');
    await t.step(1);
    const mk = await ev(() => ({ revealed: window.SR.state.tip.revealed.market, text: document.querySelector('#ui [data-id="tv-show-market"]').textContent }));
    T.ok(mk.revealed && /SKY ▼/.test(mk.text), 'Market Watch (P1) reveals the tip and says so', mk);
    // a tip the TV News revealed first: Market Watch still names it (it is a sure source, B-10)
    await fresh();
    await ev(() => { const s = window.SR.state; s.furniture.owned = { tv: 2 }; s.tip = { day: s.clock.day, ticker: 'GLU', dir: 'up', truthful: true, size: 0.03, pct: 3, reliability: 0.6, revealed: { tv: true, paper: false, market: false, mingle: false, harold: false } }; return true; });
    await openDoor('home_apt');
    await t.clickUI('row-home.tv');
    await t.step(1);
    await t.clickUI('row-home.tvMarket');
    await t.step(1);
    const mk2 = await ev(() => document.querySelector('#ui [data-id="tv-show-market"]').textContent);
    T.ok(/GLU ▲/.test(mk2), 'a tip seen on the News first is still on Market Watch', mk2);
    await ev(() => { window.SR.debug.feature('stockTips', false); window.SR.debug.feature('homesPlus', false); return true; });
    const a = await t.eval(A.audit, '[data-id="card"]');
    T.eq(a.issues, [], 'a11y: the TV page');
  });

  await section('messages: the inbox, the reader, the archive, the 150 cap', async () => {
    await fresh();
    // A new game already holds Mel's day-1 job offer (W2-Street; docs/requests/W2-Street.md 4).
    await put({ msgs: [] });
    await ev(() => { const SR = window.SR, s = SR.state; ['vm.skywatch.windy', 'vm.skywatch.fog', 'vm.crew.day365'].forEach((k) => SR.rules.effects.addMsg(s, k, {})); return true; });
    await openDoor('home_apt');
    await t.clickUI('row-home.messages');
    await t.step(1);
    const ids = await ev(() => Array.prototype.map.call(document.querySelectorAll('#ui [data-id="msg-list"] > [role="listitem"] > button[data-id^="msg-"]'), (b) => b.getAttribute('data-id')));
    const st = await t.state();
    T.eq(ids, st.msgs.map((m) => 'msg-' + m.id).reverse(), 'the inbox, newest first');
    T.eq(await ev(() => document.querySelectorAll('#ui [data-id="msg-list"] button[role]').length), 0, 'each row is a list item holding a real button (a <button> may not take the listitem role)');
    await t.shot(path.join(SHOTS, 'messages.png'));
    const newest = st.msgs[st.msgs.length - 1];
    await t.clickUI('msg-' + newest.id);
    await t.step(1);
    const body = await ev(() => document.querySelector('#ui [data-id="msg-text"]').textContent);
    const want = await text(newest.key, newest.vars);
    let s = await t.state();
    T.ok(body.indexOf(want) >= 0 && s.msgs.filter((m) => m.id === newest.id)[0].read, 'the reader plays it and it is read', body);
    T.eq(s.clock.min, st.clock.min, 'messages are free (no time)');
    await t.shot(path.join(SHOTS, 'message-read.png'));
    await t.clickUI('msg-archive');
    await t.step(1);
    s = await t.state();
    T.ok(s.msgs.filter((m) => m.id === newest.id)[0].archived, 'Archive keeps it in the archive');
    const tabs = await ev(() => [document.querySelector('#ui [data-id="msg-tabs-inbox"]').textContent, document.querySelector('#ui [data-id="msg-tabs-archive"]').textContent,
      !!document.querySelector('#ui [data-id="msg-list"]')]);
    T.eq(tabs, ['Inbox (2)', 'Archived (1)', true], 'back in the inbox list: 2 left, 1 archived');
    await t.clickUI('msg-tabs-archive');
    await t.step(1);
    T.ok(await ev((id) => !!document.querySelector('#ui [data-id="msg-' + id + '"]'), newest.id), 'the Archived tab lists it');
    // play the oldest too (read, not archived), then fill the machine to 151
    const oldest = st.msgs[0];
    await t.clickUI('msg-tabs-inbox');
    await t.step(1);
    await t.clickUI('msg-' + oldest.id);
    await t.step(1);
    await t.press('back');
    await t.step(1);
    await ev(() => { const SR = window.SR, s = SR.state; for (let i = s.msgs.length; i < 151; i++) SR.rules.effects.addMsg(s, 'vm.skywatch.fog', {}); SR.ui.card.refresh(); return true; });
    await t.step(1);
    s = await t.state();
    T.eq([s.msgs.length, s.msgs.some((m) => m.id === newest.id), s.msgs.some((m) => m.id === oldest.id)], [150, true, false],
      'the inbox holds 150: the oldest read message goes first, the archived one is kept longer (ARCHITECTURE §15)');
    T.ok(/150 of 150 kept/.test(await t.uiText()), 'and the page says so');
    const a = await t.eval(A.audit, '[data-id="card"]');
    T.eq(a.issues, [], 'a11y: the Messages page');
    // any host: the Pocket without a phone
    const pocket = await ev(() => {
      const SR = window.SR, root = document.createElement('div');
      root.setAttribute('data-id', 'test-pocket');
      document.getElementById('ui').appendChild(root);
      const host = SR.ui.subhost.create(root, { host: 'pocket', focusScope: false });
      host.push('home.messages', {});
      const txt = root.innerText;
      SR.state.items.phone = 1; host.refresh();
      const txt2 = root.innerText;
      host.destroy(); root.remove();
      return [txt.indexOf(SR.text('sub.home.messages.noPhone')) >= 0, txt2.indexOf(SR.text('sub.home.messages.noPhone')) < 0];
    });
    T.eq(pocket, [true, true], 'in the Pocket: "messages play at home" without a phone, the inbox with one');
  });

  // --------------------------------------------------------------------------------------------
  await section('Save, Hardcore and the P1 rows', async () => {
    await fresh();
    await openDoor('home_apt');
    const hasSave = await ev(() => !!window.SR.reg.scene.saveload);
    await t.clickUI('row-home.save');
    await t.step(1);
    if (hasSave) T.eq(await top(), 'saveload', 'Save opens the save screen');
    else T.ok(await ev(() => window.SR.save.list().some((x) => x.slot === 'slot1')), 'Save writes slot 1 (until W2-Front\'s save screen lands)');
    await fresh({ mode: { difficulty: 'hardcore' } });
    await openDoor('home_apt');
    T.ok((await rows()).indexOf('home.save') < 0, 'Hardcore: no Save row (the ironman slot saves itself)');
    // homesPlus (P1): nap, the perk of the home you live in, leftovers, letting
    await fresh();
    await ev(() => { window.SR.debug.feature('homesPlus', true); return true; });
    await put({ 'homes.owned': ['apt', 'apt2', 'pent'], 'homes.living': 'apt2', 'furniture.owned': { freezer: 1 }, 'stats.hp': 5 });
    await openDoor('home_apt');
    const r1 = await rows();
    T.ok(['home.nap', 'home.stargaze', 'home.leftovers', 'home.properties'].every((x) => r1.indexOf(x) >= 0) && r1.indexOf('home.party') < 0, 'with homesPlus: Nap, the balcony\'s stargazing, Leftovers, Properties', r1);
    const n0 = await t.state();
    const nap = await t.act('home.nap', { homeId: 'apt2', mode: 'live' });
    const n1 = await t.state();
    T.eq([nap.ok, n1.stats.hp - n0.stats.hp, n1.clock.min - n0.clock.min, (await t.act('home.nap', {})).reason], [true, Math.floor(0.15 * n0.stats.hpMax), 120, 'reason.dailyLimit'], 'Nap: 2 h, +15 % of HP max, once a day');
    const r2 = await openDoor('home_pent');
    T.eq([r2.params.mode, (await rows()).slice().sort()], ['owned', ['home.letOut', 'home.moveIn', 'home.sell']], 'the penthouse you own: Move in, Let it out, Sell');
    await t.clickUI('row-home.letOut');
    await t.step(1);
    T.eq([(await t.state()).homes.lets.pent !== undefined, (await rows()).slice().sort()], [true, ['home.endLet', 'home.moveIn', 'home.sell']], 'let out: End the let replaces it');
    const greetNow = () => ev(() => { const e = document.querySelector('#ui [data-id="card-greeting"] .vh'); return e ? e.textContent : ''; });
    const letText = await ev(() => { const SR = window.SR; return SR.text('greet.home.let', { home: SR.text('home.pent'), rent: SR.text.money(SR.tuning.homes.pent.rent) }); });
    T.eq(await greetNow(), letText, 'and the greeting follows the let (no home Delta, so no home:changed)');
    await t.clickUI('row-home.endLet');
    await t.step(1);
    T.ok((await greetNow()) !== letText && (await t.state()).homes.lets.pent === undefined, 'End the let: the greeting is the empty home\'s again', await greetNow());
    await ev(() => { window.SR.debug.feature('homesPlus', false); return true; });
    await fresh();
    await openDoor('home_apt');
    T.ok((await rows()).every((x) => ['home.nap', 'home.leftovers', 'home.properties', 'home.online', 'home.stargaze'].indexOf(x) < 0), 'with the flag off none of them shows');
    const a = await t.eval(A.audit, '[data-id="card"]');
    T.eq(a.issues, [], 'a11y: the home card');
  });

  T.section('result');
  T.eq(t.errors(), [], 'zero console errors');
  await t.close();
  T.done();
})().catch((e) => { console.error(e); process.exit(1); });
