// tests/e2e/ui-kit.test.cjs — owner: W1-D. The design system on its contact sheet
// (tests/sheets/components.html; BUILD_PLAN §3.5 acceptance):
//   - every component in every state at 100 / 125 / 150 % text with no clipping (screenshots),
//   - focus is always visible, the a11y audit passes (names, roles, text contrast ≥ 4.5:1 / 3:1),
//   - the keyboard (through SR.input), a mocked gamepad and touch operate every component,
//   - a disabled control refuses with the error sound, a 120 ms shake and the reason,
//   - High contrast, Reduced motion and the colour-blind tables switch the root classes,
//   - the live overlays: toast lane (max 3, #aria), stamp queue and skip, confirm (focus trap,
//     Esc cancels), dialog (a NumberField choice resolves { choice, n }), captions.
//   node tests/e2e/ui-kit.test.cjs      (screenshots: shots/W1-D/, git-ignored)
'use strict';
const path = require('path');
const { pathToFileURL } = require('url');
const h = require('../harness.cjs');

const SHEET = pathToFileURL(path.join(h.ROOT, 'tests', 'sheets', 'components.html')).href;
const SHOTS = path.join(h.ROOT, 'shots', 'W1-D');

async function openSheet(query, opts) {
  const t = await h.open(Object.assign({ width: 1400, height: 900, url: SHEET + (query || '') }, opts || {}));
  await t.page.waitForFunction(() => window.W1D && window.W1D.ready === true);
  await t.page.evaluate(() => {
    // Record UI sounds (the audio engine may still be a stub).
    const SR = window.SR;
    window.__sfx = [];
    if (SR.reg.sfx && !SR.reg.sfx.error) SR.def.sfx('error', { bus: 'ui', gain: 0.3, layers: [] });
    const real = SR.audio.sfx;
    SR.audio.sfx = function (name) { window.__sfx.push(name); return typeof real === 'function' ? real.apply(this, arguments) : null; };
  });
  return t;
}

async function fullShot(t, file) {
  const hgt = await t.page.evaluate(() => document.documentElement.scrollHeight);
  await t.page.setViewportSize({ width: 1400, height: Math.min(hgt, 8000) });
  await t.page.waitForTimeout(250);
  await t.page.screenshot({ path: path.join(SHOTS, file), fullPage: true });
  await t.page.setViewportSize({ width: 1400, height: 900 });
  await t.page.waitForTimeout(250);          // the stage re-lays out 150 ms after a resize
}

// ---------------------------------------------------------------- in-page audits
function clipAudit() {
  const out = [];
  const visible = (el) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && (r.width > 0 || r.height > 0); };
  const hasText = (el) => Array.prototype.some.call(el.childNodes, (n) => n.nodeType === 3 && n.textContent.trim());
  document.querySelectorAll('.gal-item').forEach((fig) => {
    const root = fig.querySelector('.gal-box').firstElementChild;
    if (!root) return;
    const where = fig.getAttribute('data-comp') + ' · ' + fig.getAttribute('data-state');
    const rr = root.getBoundingClientRect();
    [root].concat(Array.from(root.querySelectorAll('*'))).forEach((el) => {
      if (el.matches('.meter-line, .vh, .vh *, [data-desc], .tip') || !visible(el)) return;
      const sc = el.parentElement && el.parentElement.closest('.scroll-y');
      if (sc && root.contains(sc)) return;                // scroll containers scroll, they do not clip
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (el !== root && (r.left < rr.left - 1 || r.right > rr.right + 1 || r.top < rr.top - 1 || r.bottom > rr.bottom + 1)) {
        out.push(where + ': <' + el.tagName.toLowerCase() + ' class="' + el.className + '"> sticks out of the component');
      }
      const clipX = /hidden|clip/.test(cs.overflowX), clipY = /hidden|clip/.test(cs.overflowY);
      if (clipX && el.scrollWidth > el.clientWidth + 1 && (hasText(el) || el.querySelector('*'))) out.push(where + ': clipped horizontally (' + el.className + ')');
      if (clipY && el.scrollHeight > el.clientHeight + 1 && !el.classList.contains('scroll-y')) out.push(where + ': clipped vertically (' + el.className + ')');
      if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) out.push(where + ': ellipsis');
    });
  });
  return out;
}

function a11yAudit(rootSel) {
  const root = document.querySelector(rootSel);
  const issues = [];
  const visible = (el) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 1 && r.height > 1; };
  const nameOf = (el) => {
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label').trim();
    const lb = el.getAttribute('aria-labelledby');
    if (lb) return lb.split(' ').map((id) => (document.getElementById(id) || {}).textContent || '').join(' ').trim();
    return (el.textContent || '').trim();
  };
  const INTERACTIVE = /^(button|slider|switch|tab|radio|option|checkbox|textbox)$/;
  root.querySelectorAll('[data-nav], button, input, [role]').forEach((el) => {
    if (!visible(el) || el.closest('[aria-hidden="true"]')) return;
    const role = el.getAttribute('role') || (el.tagName === 'BUTTON' ? 'button' : el.tagName === 'INPUT' ? 'textbox' : '');
    if ((INTERACTIVE.test(role) || el.hasAttribute('data-nav')) && !nameOf(el)) issues.push('no accessible name: <' + el.tagName.toLowerCase() + ' ' + (el.getAttribute('data-id') || el.className) + '>');
    if (role === 'tab' && !el.closest('[role="tablist"]')) issues.push('tab outside a tablist');
    if (role === 'radio' && !el.closest('[role="radiogroup"]')) issues.push('radio outside a radiogroup');
    if (role === 'option' && !el.closest('[role="listbox"]')) issues.push('option outside a listbox');
    if (role === 'slider' && !el.hasAttribute('aria-valuenow')) issues.push('slider without aria-valuenow');
    if (role === 'switch' && !el.hasAttribute('aria-checked')) issues.push('switch without aria-checked');
  });
  // Text contrast: each visible text node against its effective background (opacity blended).
  const parse = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return null; const v = m[1].split(',').map(Number); return { r: v[0], g: v[1], b: v[2], a: v.length > 3 ? v[3] : 1 }; };
  const lum = (c) => [c.r, c.g, c.b].map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }).reduce((s, x, i) => s + x * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const bgOf = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a >= 0.5) return c;
    }
    return parse(getComputedStyle(document.body).backgroundColor);
  };
  const opacityOf = (el) => { let o = 1; for (let n = el; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity); return o; };
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n, checked = 0;
  while ((n = walker.nextNode())) {
    if (!n.textContent.trim()) continue;
    const el = n.parentElement;
    if (!el || !visible(el) || el.closest('.vh, [aria-hidden="true"], .tip, figcaption')) continue;
    const cs = getComputedStyle(el);
    const fg = parse(cs.color), bg = bgOf(el);
    if (!fg || !bg) continue;
    const o = opacityOf(el);
    if (o < 0.05) continue;
    const eff = { r: fg.r * o + bg.r * (1 - o), g: fg.g * o + bg.g * (1 - o), b: fg.b * o + bg.b * (1 - o) };
    const size = parseFloat(cs.fontSize), bold = Number(cs.fontWeight) >= 700;
    const min = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
    const r = ratio(eff, bg);
    checked++;
    if (r + 1e-6 < min) issues.push('contrast ' + r.toFixed(2) + ' < ' + min + ': "' + n.textContent.trim().slice(0, 30) + '" (' + el.className + ')');
  }
  return { issues, checked };
}

(async () => {
  const T = h.suite('e2e ui-kit (W1-D)');

  // ------------------------------------------------------------ text sizes: no clipping
  for (const [scale, file] of [[1, 'gallery-100.png'], [1.25, 'gallery-125.png'], [1.5, 'gallery-150.png']]) {
    T.section('gallery at ' + Math.round(scale * 100) + ' % text');
    const t = await openSheet('?scale=' + scale);
    T.eq(await t.eval(() => getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim()), String(scale), '--ui-scale is ' + scale);
    const comps = await t.eval(() => Array.from(new Set(Array.from(document.querySelectorAll('.gal-item')).map((f) => f.getAttribute('data-comp')))));
    if (scale === 1) {
      const want = ['button', 'iconButton', 'chip', 'badge', 'actionRow', 'speech', 'meter', 'clockRing', 'statChip', 'karmaMedallion', 'tabs',
        'segmented', 'numberField', 'textField', 'slider', 'toggle', 'list', 'keyHint', 'tooltip', 'portrait', 'sparkline', 'lineChart',
        'progress', 'breadcrumb', 'contextPrompt', 'toast', 'stamp', 'modal', 'card', 'hud'];
      T.eq(want.filter((c) => comps.indexOf(c) < 0), [], 'the gallery shows every component of UI.md §2.3 (' + comps.length + ' kinds)');
      const states = await t.eval(() => document.querySelectorAll('.gal-item').length);
      T.ok(states >= 80, 'and their states (' + states + ' gallery items)');
    }
    const clips = await t.eval(clipAudit);
    T.eq(clips, [], 'no component clips or overflows at ' + Math.round(scale * 100) + ' %');
    await fullShot(t, file);
    T.eq(t.errors(), [], 'zero console errors');
    await t.close();
  }

  // ------------------------------------------------------------ modes
  T.section('accessibility modes switch');
  let t = await openSheet('');
  const modes = await t.eval(() => {
    const SR = window.SR, root = document.documentElement, out = {};
    const tok = (n) => getComputedStyle(root).getPropertyValue(n).trim();
    out.money0 = tok('--money');
    SR.settings.set('access.highContrast', true); out.hcOn = root.classList.contains('hc'); out.line = tok('--line');
    SR.settings.set('access.highContrast', false); out.hcOff = !root.classList.contains('hc');
    SR.settings.set('access.reducedMotion', 'on'); out.rmOn = root.classList.contains('rm');
    SR.settings.set('access.reducedMotion', 'off'); out.rmOff = !root.classList.contains('rm');
    SR.settings.set('access.colorblind', 'deutan'); out.cb = root.getAttribute('data-cb'); out.money1 = tok('--money');
    SR.settings.set('access.colorblind', 'none'); out.cbOff = !root.hasAttribute('data-cb');
    SR.settings.set('access.textScale', 1.5); out.scale = tok('--ui-scale');
    SR.settings.set('access.textScale', 1);
    return out;
  });
  T.ok(modes.hcOn && /3px/.test(modes.line) && modes.hcOff, 'High contrast adds html.hc (3 px lines) and removes it', modes);
  T.ok(modes.rmOn && modes.rmOff, 'Reduced motion adds and removes html.rm');
  T.ok(modes.cb === 'deutan' && modes.money1 !== modes.money0 && modes.cbOff, 'a colour-blind table remaps --money and switches back');
  T.eq(modes.scale, '1.5', 'the text size setting drives --ui-scale');
  await t.eval(() => window.SR.settings.set('access.highContrast', true));
  await fullShot(t, 'gallery-hc.png');
  await t.eval(() => { window.SR.settings.set('access.highContrast', false); window.SR.settings.set('access.colorblind', 'protan'); });
  await fullShot(t, 'gallery-protan.png');
  await t.eval(() => window.SR.settings.set('access.colorblind', 'none'));

  // ------------------------------------------------------------ focus visible + a11y
  T.section('focus is always visible');
  const noRing = await t.eval(() => {
    const SR = window.SR;
    const bad = [];
    const hasRing = (el) => [el, el.closest('.num-box')].filter(Boolean).some((n) => /255, 210, 63/.test(getComputedStyle(n).boxShadow));
    document.querySelectorAll('.sheet [data-nav]').forEach((el) => {
      if (!el.getClientRects().length) return;
      SR.ui.focus.focus(el);
      if (document.activeElement !== el) { bad.push('cannot focus ' + (el.getAttribute('data-id') || el.className)); return; }
      if (!hasRing(el)) bad.push('no ring on ' + (el.getAttribute('data-id') || el.className));
    });
    return { bad, n: document.querySelectorAll('.sheet [data-nav]').length };
  });
  T.eq(noRing.bad, [], 'every [data-nav] (' + noRing.n + ') takes focus and shows the --focus ring');
  T.section('a11y audit (names, roles, contrast)');
  for (const [label, set] of [['default', null], ['high contrast', ['access.highContrast', true]], ['protan', ['access.colorblind', 'protan']]]) {
    if (set) await t.eval((s) => window.SR.settings.set(s[0], s[1]), set);
    const a = await t.eval(a11yAudit, '.sheet');
    T.eq(a.issues, [], 'no a11y issue · ' + label + ' (' + a.checked + ' text nodes checked)');
    if (set) await t.eval((s) => window.SR.settings.set(s[0], s[0] === 'access.colorblind' ? 'none' : false), set);
  }

  // ------------------------------------------------------------ keyboard (SR.input actions)
  T.section('keyboard operates every component');
  const P = t.page;
  const focus = (id) => P.evaluate((id) => window.SR.ui.focus.focus(document.querySelector('[data-id="' + id + '"]')), id);
  const active = () => P.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-id'));
  const counts = () => P.evaluate(() => JSON.parse(JSON.stringify(window.W1D.counts)));
  await focus('btn-primary'); await P.keyboard.press('Enter');
  await focus('btn-primary'); await P.keyboard.press('Space');
  T.eq((await counts())['btn-primary'], 2, 'Enter and Space activate a Button once each (no double activation)');
  await focus('btn-primary'); await P.keyboard.press('ArrowRight');
  T.eq(await active(), 'btn-primary-off', '→ moves focus to the nearest control on the right');
  await P.keyboard.press('ArrowLeft');
  T.eq(await active(), 'btn-primary', '← moves it back');
  await P.keyboard.press('Tab');
  T.eq(await active(), 'btn-primary-off', 'Tab moves focus in DOM order inside the scope');
  await P.evaluate(() => { window.__sfx.length = 0; });
  await P.keyboard.press('Enter');
  const refused = await P.evaluate(() => ({ shake: document.querySelector('[data-id="btn-primary-off"]').classList.contains('is-shaking'), sfx: window.__sfx.slice(), aria: document.getElementById('aria').getAttribute('data-last'), n: window.W1D.counts['btn-primary-off'] || 0 }));
  T.ok(refused.shake && refused.sfx.indexOf('error') >= 0 && /Full HP/.test(refused.aria) && refused.n === 0, 'a disabled Button refuses: shake, error sound, the reason read out', refused);
  await focus('g-seg2'); await P.keyboard.press('ArrowRight');
  T.eq(await P.evaluate(() => document.querySelector('[data-id="g-seg2"]').value), 'b', 'Segmented: → selects the next option');
  await focus('g-tabs-journal'); await P.keyboard.press('ArrowRight');
  T.eq(await active(), 'g-tabs-map', 'Tabs: → moves to the next tab');
  await P.keyboard.press('Enter');
  T.eq(await P.evaluate(() => document.querySelector('[data-id="g-tabs-map"]').getAttribute('aria-selected')), 'true', 'Tabs: Enter selects it');
  await focus('g-num-input'); await P.keyboard.press('Control+A'); await P.keyboard.type('3000m');
  T.eq(await P.evaluate(() => document.querySelector('[data-id="g-num"]').value), 1240, 'NumberField: digits only, clamped to the maximum ($1,240); M typed nothing');
  T.eq(await P.evaluate(() => window.SR.scenes.stack()), ['test.gallery'], 'typing M opened nothing (the text-entry rule)');
  await P.keyboard.press('Enter');
  T.eq((await counts())['num-submit'], 1, 'NumberField: Enter confirms');
  await P.keyboard.press('Escape');
  T.eq(await active(), 'g-num-plus', 'NumberField: Esc leaves the field (focus on its stepper)');
  await focus('g-name-input'); await P.keyboard.press('Control+A'); await P.keyboard.type('Bo 2');
  await P.keyboard.press('Enter');
  const tf = await counts();
  T.ok(tf['text-submit'] === 1 && tf.textValue === 'Bo 2', 'TextField: typing then Enter submits', tf);
  await focus('g-slider'); await P.keyboard.press('ArrowRight');
  T.eq(await P.evaluate(() => document.querySelector('[data-id="g-slider"]').getAttribute('aria-valuenow')), '0.8', 'Slider: → steps up');
  await focus('g-toggle'); await P.keyboard.press('Enter');
  T.eq(await P.evaluate(() => document.querySelector('[data-id="g-toggle"]').getAttribute('aria-checked')), 'true', 'Toggle: Enter flips it');
  await focus('g-list-slot1'); await P.keyboard.press('ArrowDown');
  T.eq(await active(), 'g-list-slot2', 'List: ↓ moves to the next row');
  await P.keyboard.press('Enter');
  T.eq((await counts()).listLast, 'slot2', 'List: Enter selects');
  await focus('row-g.fries'); await P.keyboard.press('Enter');
  T.eq((await counts())['row-run'], 1, 'ActionRow: Enter runs it');
  await focus('row-g.work'); await P.keyboard.press('ArrowRight');
  T.eq((await counts())['row-variant'], 1, 'ActionRow: → changes the variant');
  await focus('crumb-0'); await P.keyboard.press('Enter');
  T.eq((await counts()).crumb, 1, 'Breadcrumb: Enter follows a crumb');
  await focus('g-tip'); await P.waitForTimeout(500);
  T.ok(await P.evaluate(() => { const tip = document.querySelector('.tip.is-shown'); return !!tip && /buy a paper/.test(tip.textContent); }), 'Tooltip: shows on focus after 400 ms');
  await focus('btn-ghost');

  // ------------------------------------------------------------ mocked gamepad
  T.section('a mocked gamepad operates the components');
  await P.evaluate(() => {
    const pad = window.__pad = { id: 'Xbox Wireless Controller (mock)', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad, null, null, null] });
    window.__padPress = (b) => {
      pad.buttons[b] = { pressed: true, touched: true, value: 1 }; window.W1D.step(1);
      pad.buttons[b] = { pressed: false, touched: false, value: 0 }; window.W1D.step(1);
    };
  });
  const pad = (b) => P.evaluate((b) => window.__padPress(b), b);
  await focus('btn-secondary'); await pad(0);
  T.eq((await counts())['btn-secondary'], 1, 'A activates the focused Button');
  T.eq(await P.evaluate(() => window.SR.input.last), 'pad', 'SR.input.last is pad');
  T.eq(await P.evaluate(() => document.querySelector('[data-id="btn-hint"] .keyhint').textContent), 'B', 'KeyHints switch to pad glyphs (Esc → B)');
  await pad(15);
  T.eq(await active(), 'btn-secondary-off', 'D-pad → moves focus');
  await focus('g-seg4'); await pad(15);
  T.eq(await P.evaluate(() => document.querySelector('[data-id="g-seg4"]').value), '2', 'Segmented: D-pad → selects the next option');
  await focus('g-toggle-on'); await pad(0);
  T.eq(await P.evaluate(() => document.querySelector('[data-id="g-toggle-on"]').getAttribute('aria-checked')), 'false', 'Toggle: A flips it');
  await focus('g-slider'); await pad(14);
  T.eq(await P.evaluate(() => document.querySelector('[data-id="g-slider"]').getAttribute('aria-valuenow')), '0.7', 'Slider: D-pad ← steps down');
  await focus('g-tabs-map'); await pad(5);
  T.eq(await P.evaluate(() => document.querySelector('[data-id="g-tabs-bag"]').getAttribute('aria-selected')), 'true', 'Tabs: RB selects the next tab');
  await focus('g-num2-input'); await pad(1);
  T.eq(await active(), 'g-num2-plus', 'NumberField: B leaves the field for its stepper');
  await pad(0);
  T.eq(await P.evaluate(() => document.querySelector('[data-id="g-num2"]').value), 1, 'NumberField: A on + steps up');
  await focus('g-list-slot1'); await pad(13); await pad(13); await pad(0);
  T.eq((await counts()).listLast, 'auto', 'List: D-pad ↓ ↓ then A selects the third row');
  await focus('row-g.fries'); await pad(0);
  T.eq((await counts())['row-run'], 2, 'ActionRow: A runs it');
  await P.evaluate(() => { window.__pad.connected = false; window.W1D.step(1); });

  // ------------------------------------------------------------ live overlays
  T.section('live overlays: toast, stamp, confirm, dialog, caption');
  await P.evaluate(() => window.SR.debug && window.SR.debug.fast && window.SR.debug.fast(false));
  for (let i = 0; i < 5; i++) await P.click('[data-id="live-toast"]');
  const lane = await P.evaluate(() => ({ n: document.querySelectorAll('.toast-lane .toast:not(.is-leaving)').length, aria: document.getElementById('aria').getAttribute('data-last'), list: window.SR.ui.toast.list().length }));
  T.ok(lane.n === 3 && lane.list === 3 && /Fries/.test(lane.aria), 'the toast lane keeps 3 and reads the newest out', lane);
  await P.click('[data-id="live-stamp"]'); await P.click('[data-id="live-stamp"]');
  const st1 = await P.evaluate(() => ({ busy: window.SR.ui.stamp.busy(), cur: window.SR.ui.stamp.current(), n: document.querySelectorAll('.ui-layer--stamp .stamp').length }));
  T.ok(st1.busy && st1.cur === '+2 INTELLIGENCE!' && st1.n === 1, 'stamps queue and never overlap', st1);
  await P.waitForTimeout(200);
  await P.keyboard.press('Enter');
  await P.waitForTimeout(250);
  T.ok(await P.evaluate(() => window.SR.ui.stamp.busy()), 'confirm skipped the first; the queued one shows');
  await P.waitForTimeout(1400);
  T.ok(!(await P.evaluate(() => window.SR.ui.stamp.busy())), 'the queue empties after 900 ms holds');
  await P.click('[data-id="live-confirm"]');
  T.eq(await P.evaluate(() => window.SR.scenes.stack()), ['test.gallery', 'confirm'], 'Confirm pushes the confirm overlay');
  T.eq(await active(), 'confirm-no', 'the destructive confirm focuses Cancel first');
  await P.keyboard.press('Tab'); await P.keyboard.press('Tab'); await P.keyboard.press('Tab');
  T.ok(await P.evaluate(() => !!document.activeElement.closest('.modal')), 'Tab stays inside the modal (focus trapped)');
  await P.keyboard.press('Escape');
  await P.waitForTimeout(50);
  T.ok(await P.evaluate(() => window.W1D.counts.confirm === false && window.SR.scenes.stack().join() === 'test.gallery'), 'Esc cancels (resolves false) and closes it');
  await fullShot(t, 'gallery-live.png');
  await P.click('[data-id="live-dialog"]');
  T.eq(await P.evaluate(() => window.SR.scenes.stack()), ['test.gallery', 'dialog'], 'the Dialog sheet opens as an overlay');
  await P.waitForTimeout(400);
  await P.screenshot({ path: path.join(SHOTS, 'dialog.png') });
  await focus('choice-grams-n-input'); await P.keyboard.press('Control+A'); await P.keyboard.type('5'); await P.keyboard.press('Enter');
  await P.waitForTimeout(50);
  T.eq(await P.evaluate(() => window.W1D.counts.dialog), { choice: 'grams', n: 5 }, 'a NumberField choice resolves { choice, n }');
  await P.click('[data-id="live-dialog"]');
  await P.keyboard.press('Escape');
  await P.waitForTimeout(50);
  T.eq(await P.evaluate(() => window.W1D.counts.dialog.choice), 'leave', 'Esc resolves the offered Leave');
  await P.click('[data-id="live-dialog"]');
  await P.keyboard.press('Digit1');
  await P.waitForTimeout(50);
  T.eq(await P.evaluate(() => window.W1D.counts.dialog.choice), 'give', 'hotkey 1 picks the first choice');
  await P.click('[data-id="live-caption"]');
  T.eq(await P.evaluate(() => { const c = document.querySelector('.caption'); return c && c.textContent; }), '[car horn ←]', 'a caption shows "[car horn ←]"');
  T.eq(t.errors(), [], 'zero console errors (desktop)');
  await t.close();

  // ------------------------------------------------------------ touch
  T.section('touch operates the components');
  t = await openSheet('', { touch: true, width: 1400, height: 900 });
  const Q = t.page;
  const tap = async (id) => { await Q.locator('[data-id="' + id + '"]').first().scrollIntoViewIfNeeded(); await Q.tap('[data-id="' + id + '"]'); };
  await tap('btn-ghost');
  T.eq(await Q.evaluate(() => window.W1D.counts['btn-ghost']), 1, 'a tap activates a Button');
  T.eq(await Q.evaluate(() => window.SR.input.last), 'touch', 'SR.input.last is touch');
  T.ok(await Q.evaluate(() => getComputedStyle(document.querySelector('.keyhint')).display === 'none'), 'KeyHints hide on touch');
  await tap('g-seg2-b');
  T.eq(await Q.evaluate(() => document.querySelector('[data-id="g-seg2"]').value), 'b', 'a tap selects a Segmented option');
  await tap('g-toggle');
  T.eq(await Q.evaluate(() => document.querySelector('[data-id="g-toggle"]').getAttribute('aria-checked')), 'true', 'a tap flips a Toggle');
  await tap('g-tabs-bag');
  T.eq(await Q.evaluate(() => document.querySelector('[data-id="g-tabs-bag"]').getAttribute('aria-selected')), 'true', 'a tap selects a Tab');
  await tap('g-list-auto');
  T.eq(await Q.evaluate(() => window.W1D.counts.listLast), 'auto', 'a tap selects a List row');
  await tap('row-g.fries');
  T.eq(await Q.evaluate(() => window.W1D.counts['row-run']), 1, 'a tap runs an ActionRow');
  await tap('g-num-plus');
  T.eq(await Q.evaluate(() => document.querySelector('[data-id="g-num"]').value), 51, 'a tap on + steps a NumberField');
  await tap('g-slider');
  T.ok(await Q.evaluate(() => Math.abs(Number(document.querySelector('[data-id="g-slider"]').getAttribute('aria-valuenow')) - 0.5) <= 0.1), 'a tap on a Slider sets it where tapped');
  await tap('crumb-1');
  T.eq(await Q.evaluate(() => window.W1D.counts.crumb), 1, 'a tap follows a crumb');
  const ta = await Q.evaluate(() => ({ list: getComputedStyle(document.querySelector('[data-id="g-list"]')).touchAction, btn: getComputedStyle(document.querySelector('[data-id="btn-ghost"]')).touchAction }));
  T.ok(/pan-y/.test(ta.list) && /manipulation/.test(ta.btn), 'scroll containers pan-y, controls manipulation', ta);
  T.eq(t.errors(), [], 'zero console errors (touch)');
  await t.close();

  // ------------------------------------------------------------ the stage mode of the sheet
  T.section('the sheet\'s stage mode (the real building scene)');
  t = await openSheet('#stage', { width: 1280, height: 720 });
  await t.page.waitForTimeout(450);
  T.eq(await t.eval(() => window.SR.scenes.stack()), ['building'], 'the building scene runs on the sheet');
  await t.eval(() => window.W1D.step(2));
  await t.shot(path.join(SHOTS, 'sheet-stage.png'));
  T.eq(t.errors(), [], 'zero console errors (stage mode)');
  await t.close();

  T.done();
})().catch((e) => { console.error(e); process.exit(1); });
