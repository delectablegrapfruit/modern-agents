// The tab bar at the bottom (500 px wide and under; css/lull.css, the end): Play, Puzzles and Factory in a bar along the
// bottom of the window, the views and the Play menu ending above it, toasts kept off it, rolled up with the rest; wider,
// back in the title bar. Every place still fits with the bar there — a Relaxed board, Puzzles, the Factory, Mural and
// Battle — at 400 × 700 (a window), 390 × 844 and 320 × 568 (phones), light and dark: nothing under the bar, nothing
// sideways, the bar's buttons 44 px by touch. Run by browser-test.cjs.
'use strict';
const path = require('path');

/** In the page: a board of a recipe in play on the Play tab (Mural or Battle), cards closed. */
const SCENE = (mode) => {
  const m = Lull.app.modes.play, R = Lull.Recipe;
  while (Lull.UI.modalOpen()) Lull.UI.closeTopModal();
  Lull.app.setTab('play');
  m.hideCard();
  const r = R.normalize(mode === 'mural' ? { mode: 'mural', mural: { pic: 'coast', level: 3 } } : mode === 'battle' ? { mode: 'battle', battle: { level: 'steady' } } : {});
  const z = mode === 'battle' ? { w: 10, h: 14 } : mode === 'mural' ? R.clampSize({}, r) : { w: 10, h: 20 };
  m.setGame(new Lull.Game({ w: z.w, h: z.h, seed: 3, recipe: r, previewCount: m.settings.preview }));
  m.hideCard();
  m.renderStatus(); m.renderItems();
  m.view.resize(); m.view.dirty = true;
};

/** In the page: where the bar is, and whether the active view keeps clear of it. */
const MEASURE = () => {
  const R = (el) => el.getBoundingClientRect();
  const tabs = R(document.getElementById('tabs')), title = R(document.getElementById('titlebar')), view = document.querySelector('.view.active');
  const v = R(view), app = R(document.getElementById('app'));
  // A view that scrolls (the Factory, where it does not fit) is checked by its own box: its content scrolls inside it.
  const scrolls = /auto|scroll/.test(getComputedStyle(view).overflowY);
  const kids = scrolls ? [] : Array.from(view.querySelectorAll(':scope > *, .boardwrap canvas')).filter((e) => e.offsetParent && getComputedStyle(e).display !== 'none' && !e.classList.contains('overlay'));
  const under = kids.filter((e) => R(e).height > 0 && (R(e).bottom > tabs.top + 0.5 || R(e).right > innerWidth + 0.5 || R(e).left < -0.5)).map((e) => e.id || e.className);
  const btns = Array.from(document.querySelectorAll('#tabs button')).map((b) => R(b));
  return {
    bottom: Math.abs(tabs.bottom - app.bottom) <= 2 && tabs.top > title.bottom, inTitle: tabs.top >= title.top - 0.5 && tabs.bottom <= title.bottom + 0.5,
    viewEnd: Math.round(tabs.top - v.bottom), under, sideways: document.documentElement.scrollWidth > innerWidth || view.scrollWidth > view.clientWidth + 1,
    minH: Math.round(Math.min(...btns.map((b) => b.height))), minW: Math.round(Math.min(...btns.map((b) => b.width))),
    labels: Array.from(document.querySelectorAll('#tabs .lbl')).filter((l) => l.offsetParent).length,
  };
};

module.exports = async function run({ browser, check, PAGE, OUT }) {
  console.log('tab bar');
  const open = async (w, h, touch) => {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: w, height: h }, deviceScaleFactor: 2 }, touch ? { hasTouch: true, isMobile: true } : {}));
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(PAGE); await p.waitForTimeout(500); await p.keyboard.press('Enter');
    await p.evaluate(() => { Lull.app.store.state.settings.hints = false; Lull.app.hints.sync(); });
    return { ctx, p, errors };
  };

  // Every place, at three sizes, both themes.
  for (const [w, h, touch] of [[400, 700, false], [390, 844, true], [320, 568, true]]) {
    const { ctx, p, errors } = await open(w, h, touch);
    const rows = [];
    for (const theme of ['dark', 'light']) {
      await p.evaluate((t) => { Lull.app.settings.theme = t; Lull.app.applySettings(); }, theme);
      for (const place of ['play', 'puzzle', 'factory', 'mural', 'battle']) {
        if (place === 'puzzle' || place === 'factory') await p.evaluate((t) => { while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); Lull.app.setTab(t); }, place);
        else await p.evaluate(SCENE, place);
        await p.waitForTimeout(500);
        const r = await p.evaluate(MEASURE);
        const bad = !r.bottom || r.viewEnd < 0 || r.under.length || r.sideways || r.labels !== 3 || (touch && (r.minH < 44 || r.minW < 44));
        rows.push((bad ? 'BAD ' : '') + theme + '/' + place + ' ' + JSON.stringify(r));
        if (OUT) await p.screenshot({ path: path.join(OUT, '75-tabbar-' + w + 'x' + h + '-' + theme + '-' + place + '.png') });
      }
    }
    check('the tab bar at the bottom, ' + w + '×' + h + (touch ? ' (a phone)' : '') + ': every place fits above it (Play, Puzzles, Factory, Mural, Battle), light and dark',
      rows.every((x) => !x.startsWith('BAD')), rows.join('\n         '));

    // The Play menu is a page between the title bar and the tab bar; a toast stays above the bar.
    const menu = await p.evaluate(async () => {
      while (Lull.UI.modalOpen()) Lull.UI.closeTopModal();
      Lull.app.setTab('play');
      Lull.app.modes.play.openMenu();
      await new Promise((r) => setTimeout(r, 300));
      const s = document.querySelector('.scrim.mn-scrim').getBoundingClientRect(), t = document.getElementById('tabs').getBoundingClientRect();
      const out = { gap: Math.round(t.top - s.bottom), top: Math.round(s.top - document.getElementById('titlebar').getBoundingClientRect().bottom) };
      while (Lull.UI.modalOpen()) Lull.UI.closeTopModal();
      Lull.app.setTab('factory');
      Lull.UI.toast('A note', 'good', 3000);
      await new Promise((r) => setTimeout(r, 50));
      const toast = document.querySelector('#toasts .toast:last-child').getBoundingClientRect();
      out.toastAbove = toast.bottom <= t.top + 0.5;
      return out;
    });
    check('the tab bar at the bottom, ' + w + '×' + h + ': the Play menu ends above it, and a toast stays clear of it', menu.gap >= 0 && menu.gap <= 1 && Math.abs(menu.top) <= 1 && menu.toastAbove, JSON.stringify(menu));
    check('the tab bar at the bottom, ' + w + '×' + h + ': no page errors', errors.length === 0, errors.join('\n'));
    await ctx.close();
  }

  // Wider than 500 the bar is back in the title bar (a 520 × 760 window keeps its board's height); rolled up, it goes.
  {
    const { ctx, p, errors } = await open(520, 760, false);
    const wide = await p.evaluate(MEASURE);
    check('wider than 500 px (520 × 760) the places to play stay in the title bar', wide.inTitle && !wide.bottom && wide.viewEnd < 0, JSON.stringify(wide));
    await p.setViewportSize({ width: 500, height: 760 });
    await p.waitForTimeout(300);
    const at500 = await p.evaluate(MEASURE);
    check('at 500 px the bar is at the bottom', at500.bottom && at500.viewEnd >= 0 && at500.under.length === 0, JSON.stringify(at500));
    const rolled = await p.evaluate(async () => { Lull.Collapse.toggle(); await new Promise((r) => setTimeout(r, 400)); const t = document.getElementById('tabs'); const out = { on: Lull.Collapse.on, shown: !!t.offsetParent }; Lull.Collapse.toggle(); await new Promise((r) => setTimeout(r, 400)); out.back = !!t.offsetParent; return out; });
    check('rolled up, the tab bar goes with the rest; rolled down it is back', rolled.on && !rolled.shown && rolled.back, JSON.stringify(rolled));
    check('the tab bar, wide and narrow: no page errors', errors.length === 0, errors.join('\n'));
    await ctx.close();
  }
};
