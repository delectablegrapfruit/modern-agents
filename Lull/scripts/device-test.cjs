// What the device can do, and what the page offers for it. A phone (a Safari tab and the Home Screen) has no window,
// no mouse or trackpad and no keyboard: the Mac's window settings, the pointer's and the keyboard's are gone, and Keys
// is Gestures. A desktop browser, the macOS app (its bridge stubbed) and a tablet with a trackpad keep them, and a
// pointer or a keyboard coming or going changes it all live. Screenshots of every Settings section on the phone, in
// both themes. Run by browser-test.cjs: require('./device-test.cjs')({ browser, check, PAGE, OUT }).
'use strict';
const path = require('path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Everything in Settings that only a Mac window, a pointer or a keyboard can use: by touch alone none of it shows.
const POINTER_ROWS = ['Mouse control', 'Pause when the pointer leaves', 'Fade when the pointer leaves'];
const WINDOW_ROWS = ['Float above other windows', 'Show and hide', 'Tint strength'];
const KEY_ROWS = ['Repeat delay', 'Repeat rate'];

/** Opens Settings on each section in turn and reads what is there (and whether the list fits). */
const readSettings = () => {
  while (Lull.UI.modalOpen()) Lull.UI.closeTopModal();
  Lull.UI.openSettings(Lull.app);
  const modal = document.querySelector('.modal-settings'), nav = modal.querySelector('.set-nav'), out = { nav: [], icons: [], sections: {} };
  const mr = modal.getBoundingClientRect();
  out.navFits = nav.scrollWidth <= nav.clientWidth + 1 && [...nav.querySelectorAll('button')].every((b) => { const r = b.getBoundingClientRect(); return r.left >= mr.left - 0.5 && r.right <= mr.right + 0.5; });
  for (const b of [...nav.querySelectorAll('button')]) {
    out.nav.push(b.textContent);
    out.icons.push(b.querySelector('.ni').innerHTML.startsWith('<svg') ? 'svg' : 'none');
    b.click();
    const pane = modal.querySelector('.set-pane');
    out.sections[b.textContent] = {
      cards: [...pane.querySelectorAll('.set-card')].map((c) => { const t = c.querySelector('.set-card-title'); return t ? t.textContent : ''; }),
      rows: [...pane.querySelectorAll('.set-row .lbl')].map((l) => l.firstChild.textContent),
      rowsByCard: Object.fromEntries([...pane.querySelectorAll('.set-card')].map((c) => [(c.querySelector('.set-card-title') || {}).textContent || '', [...c.querySelectorAll('.set-row .lbl')].map((l) => l.firstChild.textContent)])),
      hints: [...pane.querySelectorAll('.set-row .hint')].map((l) => l.textContent),
      tiles: [...pane.querySelectorAll('.tile span:last-child')].map((t) => t.textContent),
      kbd: [...pane.querySelectorAll('kbd')].map((k) => k.textContent),
      gest: [...pane.querySelectorAll('.gest')].map((k) => k.textContent),
      text: pane.textContent,
      empty: pane.children.length === 0,
    };
  }
  Lull.UI.closeTopModal();
  return out;
};
const bodyState = () => ({
  only: document.body.classList.contains('touch-only'), keyless: document.body.classList.contains('keyless'),
  app: document.getElementById('app').className, bg: Lull.app.settings.bg, native: Lull.native.available,
});
const noneOf = (list, names) => names.filter((n) => list.includes(n));

module.exports = async function deviceTests({ browser, check, PAGE, OUT }) {
  console.log('devices');
  const errors = [];
  const open = async (opts, init) => {
    const ctx = await browser.newContext(opts);
    for (const fn of init || []) await ctx.addInitScript(fn);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message + '\n' + e.stack));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(PAGE);
    await page.waitForTimeout(400);
    // (The welcome is closed from script: a key press would be a keyboard.)
    await page.evaluate(() => { while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); });
    const ev = (fn, arg) => page.evaluate(fn, arg);
    return { ctx, page, ev };
  };
  const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true };
  const standalone = () => Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true });

  // ---- a phone: a Safari tab, then the Home Screen ----------------------------------------------------------------------
  for (const [where, init] of [['Safari tab', []], ['Home Screen', [standalone]]]) {
    const tag = where === 'Safari tab' ? 'tab' : 'home';
    const P = await open(Object.assign({ colorScheme: 'dark' }, PHONE), init);
    const { page, ev } = P;
    const cdp = await P.ctx.newCDPSession(page);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 0, radiusX: 4, radiusY: 4, force: 1 }] });
    const longPress = async (sel) => {
      const r = await ev((s) => { const b = document.querySelector(s).getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; }, sel);
      await touch('touchStart', r[0], r[1]); await sleep(700);
      const tip = await ev(() => { const t = document.querySelector('#app > .tip'); return t && !t.classList.contains('hidden') ? { body: t.querySelector('.tip-body').textContent, foot: (t.querySelector('.tip-foot') || {}).textContent || '' } : null; });
      await touch('touchEnd'); await sleep(100);
      return tip;
    };

    const b0 = await ev(bodyState);
    check(`phone (${where}): touch alone, no keyboard, not the app`, b0.only && b0.keyless && !b0.native && (tag === 'tab' || (await ev(() => document.body.classList.contains('webapp')))), JSON.stringify(b0));
    check(`phone (${where}): drawn solid, the saved Glass background left as it was`, b0.app === 'bg-solid' && b0.bg === 'glass', JSON.stringify(b0));

    const S = await ev(readSettings);
    const all = Object.values(S.sections);
    const rows = all.flatMap((x) => x.rows), cards = all.flatMap((x) => x.cards);
    check(`phone (${where}): Settings lists Look, Controls, Sound, Gestures, Data (no Window, no Keys), each with an icon and something in it, and the list fits`,
      S.nav.join() === 'Look,Controls,Sound,Gestures,Data' && S.icons.every((i) => i === 'svg') && all.every((x) => !x.empty) && S.navFits, JSON.stringify({ nav: S.nav, fits: S.navFits }));
    check(`phone (${where}): no window background, window, pointer or key-repeat settings`,
      !noneOf(rows, POINTER_ROWS.concat(WINDOW_ROWS, KEY_ROWS)).length && !cards.includes('Window background') && !cards.includes('Keyboard') && !cards.includes('Mouse') && !cards.includes('Classic')
      && !S.sections.Look.tiles.includes('Glass'), JSON.stringify(noneOf(rows, POINTER_ROWS.concat(WINDOW_ROWS, KEY_ROWS)).concat(cards)));
    check(`phone (${where}): Look keeps Theme, Accent and Motion`, S.sections.Look.cards.join() === 'Theme,Accent,Motion', S.sections.Look.cards.join());
    check(`phone (${where}): Lower repeat (Classic's resting finger) sits in the Touch card`, (S.sections.Controls.rowsByCard.Touch || []).includes('Lower repeat'), JSON.stringify(S.sections.Controls.rowsByCard));
    check(`phone (${where}): Sound and Data are all there (Export and Import move a save between the tab and the Home Screen)`,
      ['Mute', 'Classic music', 'Announcer', 'Announcer in Relaxed', 'Sound pack'].every((r) => S.sections.Sound.rows.includes(r)) && /Export/.test(S.sections.Data.text) && /Import/.test(S.sections.Data.text));
    const G = S.sections.Gestures || { gest: [], kbd: [], cards: [], text: '' };
    check(`phone (${where}): Gestures lists only the gestures: no keys, no key caps, no card title`,
      G.gest.length === 8 && G.kbd.length === 0 && G.cards.join() === '' && !/⌘|Space|Shift|Backspace|click|Wheel/i.test(G.text), JSON.stringify(G));
    check(`phone (${where}): the Counter-clockwise puzzles hint names tap left and two fingers`, S.sections.Controls.hints.includes('New puzzles use tap left and two fingers'), JSON.stringify(S.sections.Controls.hints));

    // Tap to turn: Clockwise: the hint and the gestures follow (no tap turns counter-clockwise then).
    await ev(() => { Lull.UI.openSettings(Lull.app, 'controls'); });
    await page.tap('.modal .seg button[data-v="cw"]');
    const cw = await ev(() => [...document.querySelectorAll('.set-row .hint')].map((h) => h.textContent));
    await ev(() => { Lull.UI.closeTopModal(); Lull.UI.openSettings(Lull.app, 'keys'); });
    const cwGest = await ev(() => [...document.querySelectorAll('.gest')].map((g) => g.textContent));
    check(`phone (${where}): Tap to turn: Clockwise changes the hint to two-finger taps, and Gestures to one Tap`,
      cw.includes('New puzzles use two-finger taps') && cwGest.includes('Tap') && !cwGest.includes('Tap left') && !cwGest.includes('Tap right'), JSON.stringify({ cw, cwGest }));
    await ev(() => { Lull.UI.closeTopModal(); Lull.app.settings.tapTurn = 'sides'; });

    // No window to roll up: no chevron, no ⌘J, no double tap; a save rolled up on the Mac opens, and keeps saying so.
    const col = await ev(() => {
      const btn = document.getElementById('btn-collapse');
      Lull.Collapse.toggle();
      const sp = document.querySelector('#titlebar .spacer');
      sp.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyJ', key: 'j', metaKey: true, bubbles: true }));
      return { btn: getComputedStyle(btn).display, on: Lull.Collapse.on, cls: document.body.classList.contains('collapsed'), saved: Lull.app.state.collapsed };
    });
    check(`phone (${where}): nothing rolls the window up (no chevron; the button, a double tap and ⌘J do nothing)`, col.btn === 'none' && !col.on && !col.cls && !col.saved, JSON.stringify(col));
    await ev(() => { Lull.app.state.collapsed = true; Lull.app.store.touch(); Lull.app.saveNow(); });
    await page.reload();
    await page.waitForTimeout(400);
    const re = await ev(() => ({ on: Lull.Collapse.on, cls: document.body.classList.contains('collapsed'), main: getComputedStyle(document.getElementById('main')).display, h: Math.round(document.getElementById('app').getBoundingClientRect().height), saved: Lull.app.state.collapsed, exported: JSON.parse(Lull.app.store.serialize()).collapsed }));
    check(`phone (${where}): a save rolled up on the Mac opens here, whole (and an Export keeps it rolled up for the Mac)`, !re.on && !re.cls && re.main !== 'none' && re.h > 600 && re.saved === true && re.exported === true, JSON.stringify(re));
    await ev(() => { Lull.app.state.collapsed = false; Lull.app.store.touch(); });

    // The pointer leaving means nothing to a finger: no dimming, Classic plays on.
    const away = await ev(() => {
      document.documentElement.dispatchEvent(new MouseEvent('mouseleave'));
      return document.body.classList.contains('away');
    });
    check(`phone (${where}): no fading or dimming when a "pointer leaves"`, !away);

    // Tooltips by long press: a name, never a key; the seed's Daily date and a difficulty's share can be reached.
    await ev(() => Lull.app.setTab('play'));
    const tipSettings = await longPress('#btn-settings');
    await ev(() => Lull.app.setTab('puzzle'));
    await page.waitForTimeout(200);
    const tipSeed = await longPress('#puz-seed');
    const tipDiff = await longPress('#puz-diff button');
    check(`phone (${where}): a long press shows a tooltip's name with no key (Settings, not ⌘,)`, tipSettings && tipSettings.body === 'Settings' && tipSettings.foot === '', JSON.stringify(tipSettings));
    check(`phone (${where}): a long press on the seed tells which date's Daily it is; on a difficulty, its share`,
      tipSeed && /^Copy seed · the Daily (for|in) /.test(tipSeed.body) && tipDiff && /of 4,294,967,296 \w+ puzzles solved/.test(tipDiff.body), JSON.stringify({ tipSeed, tipDiff }));
    await ev(() => Lull.app.setTab('play'));

    // Every section, in both themes.
    if (OUT) {
      for (const theme of ['dark', 'light']) {
        await ev((t) => { Lull.app.settings.theme = t; Lull.app.applySettings(); document.getElementById('toasts').replaceChildren(); }, theme);
        for (const id of ['look', 'controls', 'sound', 'keys', 'data']) {
          await ev((s) => { while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); Lull.UI.openSettings(Lull.app, s); }, id);
          await page.waitForTimeout(80);
          await page.screenshot({ path: path.join(OUT, `76-phone-${tag}-${theme}-settings-${id}.png`) });
          if (await ev(() => { const p = document.querySelector('.set-pane'); if (p.scrollHeight <= p.clientHeight + 2) return false; p.scrollTop = 1e6; return true; })) {
            await page.waitForTimeout(60);
            await page.screenshot({ path: path.join(OUT, `76-phone-${tag}-${theme}-settings-${id}-end.png`) });
          }
        }
        await ev(() => { while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); });
      }
      await ev(() => { Lull.app.settings.theme = 'dark'; Lull.app.applySettings(); });
    }

    if (tag === 'tab') {
      // A keyboard (a Bluetooth one, or an iPad's): the first key brings its settings back; still no mouse ones.
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(50);
      const k = await ev(bodyState);
      const K = await ev(readSettings);
      const keys = K.sections.Keys || {};
      check('phone with a keyboard: once a key is pressed, Keys (Touch and Keyboard) and Repeat delay are back; no mouse lines, no ⌘J',
        k.only && !k.keyless && K.nav.join() === 'Look,Controls,Sound,Keys,Data' && (keys.cards || []).join() === 'Touch,Keyboard' && keys.kbd.includes('Space') && !keys.kbd.includes('⌘J') && !keys.kbd.some((x) => /click|Wheel|Mouse/.test(x))
        && (K.sections.Controls.rowsByCard.Keyboard || []).join() === 'Repeat delay,Repeat rate,Lower repeat' && !K.sections.Controls.rows.includes('Mouse control') && K.navFits, JSON.stringify({ k, nav: K.nav, keys: keys.kbd, controls: K.sections.Controls.rowsByCard }));
      // A Classic board's Start card (the board in play put back after).
      const caps = await ev(() => { Lull.app.setTab('play'); const pm = Lull.app.modes.play, keep = pm.game.toJSON(); pm.setGame(new Lull.Game({ w: 10, h: 20, recipe: { mode: 'classic' } })); const kb = document.querySelector('#play-overlay kbd'); const d = kb ? getComputedStyle(kb).display : 'missing'; pm.setGame(new Lull.Game({ saved: keep, previewCount: Lull.app.settings.preview })); return d; });
      check('phone with a keyboard: key caps are back on the buttons', caps !== 'none' && caps !== 'missing', caps);
      await ev(() => Lull.app.setTab('play'));
    }
    await P.ctx.close();
  }

  // ---- a desktop browser: all of it, as before ------------------------------------------------------------------------
  {
    const D = await open({ viewport: { width: 520, height: 760 }, deviceScaleFactor: 2 });
    const b = await D.ev(bodyState);
    const S = await D.ev(readSettings);
    const rows = Object.values(S.sections).flatMap((x) => x.rows);
    check('desktop browser: not touch alone; the Glass background drawn as saved', !b.only && !b.keyless && b.app === 'bg-glass', JSON.stringify(b));
    check('desktop browser: Settings has Look (with the window background), Controls (Keyboard, Mouse, pointer pause), Sound, Keys, Data',
      S.nav.join() === 'Look,Controls,Sound,Keys,Data' && S.sections.Look.cards[0] === 'Window background' && S.sections.Look.rows.includes('Tint strength')
      && ['Repeat delay', 'Repeat rate', 'Lower repeat', 'Mouse control', 'Pause when the pointer leaves'].every((r) => rows.includes(r)) && (S.sections.Controls.rowsByCard.Keyboard || []).includes('Lower repeat'), JSON.stringify({ nav: S.nav, rows }));
    check('desktop browser: Keys lists the keyboard, ⌘J and the mouse', ['⌘J', '⌘1 – ⌘7', 'Space', 'Left click', 'Wheel'].every((k) => S.sections.Keys.kbd.includes(k)) && S.sections.Keys.gest.length === 0, JSON.stringify(S.sections.Keys.kbd));
    const col = await D.ev(() => { Lull.Collapse.toggle(); const on = Lull.Collapse.on; Lull.Collapse.toggle(); return { on, off: !Lull.Collapse.on }; });
    check('desktop browser: the window still rolls up and down', col.on && col.off, JSON.stringify(col));
    const away = await D.ev(() => { document.documentElement.dispatchEvent(new MouseEvent('mouseleave')); const a = document.body.classList.contains('away'); document.documentElement.dispatchEvent(new MouseEvent('mouseenter')); return a; });
    check('desktop browser: the pointer leaving still dims it', away);

    // Touch comes and goes live (a touch screen emulated, then taken away): Settings, the background and the list follow.
    await D.ev(() => Lull.UI.openSettings(Lull.app, 'controls'));
    const cdp = await D.ctx.newCDPSession(D.page);
    const live = async () => D.ev(() => ({ b: { only: document.body.classList.contains('touch-only'), app: document.getElementById('app').className },
      nav: [...document.querySelectorAll('.set-nav button')].map((x) => x.textContent).join(), cards: [...document.querySelectorAll('.set-pane .set-card-title')].map((x) => x.textContent).join(), open: Lull.UI.modalOpen() }));
    // The media queries' change events arrive a little after the switch (later on a busy machine): wait for the page to
    // follow, up to two seconds, then read it.
    const settle = (touchOnly) => D.page.waitForFunction((t) => document.body.classList.contains('touch-only') === t, touchOnly, { timeout: 2000 }).catch(() => {});
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await settle(true); await sleep(50);
    const on = await live();
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    await settle(false); await sleep(50);
    const off = await live();
    check('live: a mouse taken away turns an open Settings into the phone\'s (Gestures, no Keyboard or Mouse card), drawn solid',
      on.open && on.b.only && on.b.app === 'bg-solid' && on.nav === 'Look,Controls,Sound,Gestures,Data' && on.cards === 'Touch,Board,Puzzles', JSON.stringify(on));
    check('live: and a mouse back brings it all back', off.open && !off.b.only && off.b.app === 'bg-glass' && off.nav === 'Look,Controls,Sound,Keys,Data' && /^Keyboard,.*Mouse,Board,Classic,Puzzles$/.test(off.cards), JSON.stringify(off));
    await D.ctx.close();
  }

  // ---- the macOS app (its bridge stubbed), even on a touch screen: the Window section and everything else -------------
  {
    const nativeInit = () => { window.webkit = { messageHandlers: { lull: { postMessage: () => {} } } }; };
    const N = await open(Object.assign({ colorScheme: 'dark' }, PHONE, { viewport: { width: 520, height: 760 } }), [nativeInit]);
    const b = await N.ev(bodyState);
    const S = await N.ev(readSettings);
    const rows = Object.values(S.sections).flatMap((x) => x.rows);
    check('the app: never touch alone, whatever the screen', b.native && !b.only && !b.keyless && b.app === 'bg-glass', JSON.stringify(b));
    check('the app: Settings has Window (float, fade, show and hide), the background, Keyboard, Mouse and Keys',
      S.nav.join() === 'Look,Window,Controls,Sound,Keys,Data' && ['Float above other windows', 'Fade when the pointer leaves', 'Show and hide', 'Tint strength', 'Repeat delay', 'Mouse control', 'Pause when the pointer leaves'].every((r) => rows.includes(r))
      && S.sections.Keys.kbd.includes('⌘J'), JSON.stringify({ nav: S.nav, rows }));
    await N.ctx.close();
  }

  // ---- a tablet with a trackpad: touch first, but a pointer too (its media queries stubbed: Chromium cannot say both) --
  {
    const trackpad = () => {
      const real = window.matchMedia.bind(window), state = { '(any-pointer: fine)': true, '(any-hover: hover)': true }, lists = {};
      window.__trackpad = (on) => { for (const q of Object.keys(state)) { state[q] = on; for (const f of lists[q] || []) f({ matches: on, media: q }); } };
      window.matchMedia = (q) => (q in state ? {
        media: q, get matches() { return state[q]; },
        addEventListener: (t, f) => (lists[q] = lists[q] || []).push(f), removeEventListener() {}, addListener: (f) => (lists[q] = lists[q] || []).push(f), removeListener() {},
      } : real(q));
    };
    const T = await open(Object.assign({ colorScheme: 'dark' }, PHONE, { viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2 }), [trackpad]);
    const b = await T.ev(bodyState);
    const S = await T.ev(readSettings);
    const rows = Object.values(S.sections).flatMap((x) => x.rows);
    check('tablet with a trackpad: not touch alone; the pointer\'s settings, the background, and Keys with Touch and Keyboard',
      !b.only && !b.keyless && b.app === 'bg-glass' && S.nav.join() === 'Look,Controls,Sound,Keys,Data' && ['Mouse control', 'Pause when the pointer leaves', 'Tint strength', 'Repeat delay', 'Drag sensitivity'].every((r) => rows.includes(r))
      && S.sections.Keys.cards.join() === 'Touch,Keyboard' && S.sections.Keys.kbd.includes('Left click'), JSON.stringify({ b, nav: S.nav, rows }));
    const rolled = await T.ev(() => { Lull.Collapse.set(true); return Lull.Collapse.on; });
    await T.ev(() => { Lull.UI.openSettings(Lull.app, 'controls'); window.__trackpad(false); });
    await sleep(100);
    const gone = await T.ev(() => ({ only: document.body.classList.contains('touch-only'), on: Lull.Collapse.on, saved: Lull.app.state.collapsed, nav: [...document.querySelectorAll('.set-nav button')].map((x) => x.textContent).join(), mouse: !!document.querySelector('.switch[data-setting="mouse"]') }));
    check('tablet: the trackpad taken away opens a rolled-up window and turns Settings to the phone\'s, live', rolled && gone.only && !gone.on && gone.saved && gone.nav === 'Look,Controls,Sound,Gestures,Data' && !gone.mouse, JSON.stringify({ rolled, gone }));
    await T.ev(() => window.__trackpad(true));
    await sleep(100);
    const back = await T.ev(() => ({ only: document.body.classList.contains('touch-only'), nav: [...document.querySelectorAll('.set-nav button')].map((x) => x.textContent).join(), mouse: !!document.querySelector('.switch[data-setting="mouse"]') }));
    check('tablet: the trackpad back brings the Mouse card and Keys back', !back.only && back.nav === 'Look,Controls,Sound,Keys,Data' && back.mouse, JSON.stringify(back));
    await T.ctx.close();
  }

  check('no page errors (devices)', errors.length === 0, errors.slice(0, 5).join('\n'));
};

// On its own: node Lull/scripts/device-test.cjs [screenshot-dir]
if (require.main === module) {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch (e) {
    try { ({ chromium } = require(path.join(process.execPath, '..', '..', 'lib', 'node_modules', 'playwright'))); } catch (e2) { console.error('Playwright is not installed; skipping.'); process.exit(0); }
  }
  let failures = 0;
  const check = (name, ok, extra) => { console.log((ok ? '  ok   ' : '  FAIL ') + name + (extra && !ok ? ' — ' + extra : '')); if (!ok) failures++; };
  (async () => {
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    await module.exports({ browser, check, PAGE: 'file://' + path.join(__dirname, '..', 'Game', 'index.html'), OUT: process.argv[2] || null });
    await browser.close();
    console.log(failures ? failures + ' failed' : 'all passed');
    process.exit(failures ? 1 : 0);
  })().catch((e) => { console.error(e); process.exit(1); });
}
