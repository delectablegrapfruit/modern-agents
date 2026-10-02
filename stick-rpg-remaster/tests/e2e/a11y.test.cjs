// tests/e2e/a11y.test.cjs — owner: W1-Q. The accessibility audit (ARCHITECTURE §18; UI.md §6, §8):
// tab through every building card, Pocket tab and menu (focus order, a visible focus ring, ARIA
// names) and a computed-style contrast audit (text ≥ 4.5:1, large text ≥ 3:1), plus roles, image
// alternatives, dialog names and the #aria live region.
//
// Targets (each only once its owner has landed; a missing one is listed as pending, not failed):
//   - the game page: the title (the kernel's stub until W2-Front), every registered building card
//     (SR.debug.enter), a card sub-screen, a dialog and a confirm (W1-D), the pause, settings and
//     save/load menus and every Pocket tab (W2);
//   - W1-D's test buildings (tests/sheets/components-fixtures.js), so the card chrome is audited
//     before wave 2's buildings exist;
//   - the components gallery (tests/sheets/components.html) in the default, high-contrast and protan
//     modes: every [data-nav] takes focus with a visible ring; names, roles and contrast.
// Screenshots with the focus ring: shots/W1-Q/a11y/ (git-ignored).
//   node tests/e2e/a11y.test.cjs
//
// Other suites may reuse the audit: const A = require('./a11y.test.cjs'); await t.eval(A.audit, '#ui');
// await A.tabWalk(t) → { n, seq, issues }.
'use strict';
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const h = require('../harness.cjs');

const SHOTS = path.join(h.ROOT, 'shots', 'W1-Q', 'a11y');
const FIXTURES = path.join(h.ROOT, 'tests', 'sheets', 'components-fixtures.js');
const GALLERY = pathToFileURL(path.join(h.ROOT, 'tests', 'sheets', 'components.html')).href;

// ------------------------------------------------------------------------------------------------
// In-page functions (serialised into the page by page.evaluate: self-contained).

/**
 * Audits the subtree at rootSel: controls have names and roles, images have alternatives, dialogs
 * have names, text meets its contrast minimum and is at least 12 px.
 * @returns {{issues: string[], checked: number, controls: number}}
 */
function audit(rootSel) {
  const root = typeof rootSel === 'string' ? document.querySelector(rootSel) : rootSel;
  if (!root) return { issues: ['no element matches ' + rootSel], checked: 0, controls: 0 };
  const issues = [];
  const tag = (el) => '<' + el.tagName.toLowerCase() + (el.getAttribute('data-id') ? ' data-id="' + el.getAttribute('data-id') + '"' : el.className && typeof el.className === 'string' ? ' class="' + el.className.slice(0, 40) + '"' : '') + '>';
  const visible = (el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 1 && r.height > 1 && !el.closest('[hidden], [inert]');
  };
  const nameOf = (el) => {
    const al = el.getAttribute('aria-label');
    if (al && al.trim()) return al.trim();
    const lb = el.getAttribute('aria-labelledby');
    if (lb) { const t = lb.split(/\s+/).map((id) => (document.getElementById(id) || {}).textContent || '').join(' ').trim(); if (t) return t; }
    if (el.labels && el.labels.length) { const t = Array.from(el.labels).map((l) => l.textContent).join(' ').trim(); if (t) return t; }
    const img = el.querySelector && el.querySelector('img[alt]');
    const txt = (el.textContent || '').trim() || (img ? img.getAttribute('alt').trim() : '') || (el.getAttribute('title') || '').trim();
    return txt || (el.tagName === 'INPUT' ? (el.getAttribute('placeholder') || '').trim() : '');
  };
  const implicit = (el) => {
    const t = el.tagName;
    if (t === 'BUTTON') return 'button';
    if (t === 'A' && el.hasAttribute('href')) return 'link';
    if (t === 'SELECT') return 'combobox';
    if (t === 'TEXTAREA') return 'textbox';
    if (t === 'INPUT') {
      const ty = (el.getAttribute('type') || 'text').toLowerCase();
      return ty === 'checkbox' ? 'checkbox' : ty === 'radio' ? 'radio' : ty === 'range' ? 'slider' : ty === 'number' ? 'spinbutton' : ty === 'hidden' ? '' : ty === 'button' || ty === 'submit' ? 'button' : 'textbox';
    }
    return '';
  };
  const INTERACTIVE = /^(button|link|slider|switch|tab|radio|option|checkbox|textbox|spinbutton|menuitem|menuitemradio|menuitemcheckbox|combobox|searchbox|treeitem|gridcell)$/;
  let controls = 0;
  root.querySelectorAll('[data-nav], button, input, select, textarea, a[href], [role], [tabindex]').forEach((el) => {
    if (!visible(el) || el.closest('[aria-hidden="true"]')) return;
    const role = el.getAttribute('role') || implicit(el);
    const nav = el.hasAttribute('data-nav');
    if (!INTERACTIVE.test(role) && !nav) return;
    controls++;
    if (!nameOf(el)) issues.push('no accessible name: ' + tag(el));
    if (nav && !role) issues.push('a focusable element without a role: ' + tag(el));
    if (role === 'tab' && !el.closest('[role="tablist"]')) issues.push('a tab outside a tablist: ' + tag(el));
    if ((role === 'radio' || role === 'menuitemradio') && !el.closest('[role="radiogroup"], [role="menu"], [role="tablist"]') && el.tagName !== 'INPUT') issues.push('a radio outside a radiogroup: ' + tag(el));
    if (role === 'option' && !el.closest('[role="listbox"]')) issues.push('an option outside a listbox: ' + tag(el));
    if (role === 'slider' && el.tagName !== 'INPUT' && !el.hasAttribute('aria-valuenow')) issues.push('a slider without aria-valuenow: ' + tag(el));
    if ((role === 'switch' || role === 'checkbox') && el.tagName !== 'INPUT' && !el.hasAttribute('aria-checked')) issues.push(role + ' without aria-checked: ' + tag(el));
  });
  root.querySelectorAll('img').forEach((img) => {
    if (visible(img) && !img.hasAttribute('alt') && !img.closest('[aria-hidden="true"]')) issues.push('an image without alt: ' + tag(img));
  });
  root.querySelectorAll('[role="dialog"], [role="alertdialog"]').forEach((d) => {
    if (visible(d) && !(d.getAttribute('aria-label') || d.getAttribute('aria-labelledby'))) issues.push('a dialog without a name (aria-label / aria-labelledby): ' + tag(d));
  });
  // contrast of every visible text node against its effective background (opacity blended)
  const parse = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return null; const v = m[1].split(',').map(Number); return { r: v[0], g: v[1], b: v[2], a: v.length > 3 ? v[3] : 1 }; };
  const lum = (c) => [c.r, c.g, c.b].map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }).reduce((s, x, i) => s + x * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a, b) => { const x = lum(a); const y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const bgOf = (el) => {
    // the ancestors' backgrounds (html included) composited from the first opaque one (else the
    // browser's white canvas) up to the element: a translucent panel shows what lies beneath it
    const layers = [];
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (let n = el; n; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (!c || c.a <= 0) continue;
      if (c.a >= 0.999) { base = c; break; }
      layers.push(c);
    }
    for (let k = layers.length - 1; k >= 0; k--) {
      const c = layers[k];
      base = { r: c.r * c.a + base.r * (1 - c.a), g: c.g * c.a + base.g * (1 - c.a), b: c.b * c.a + base.b * (1 - c.a), a: 1 };
    }
    return base;
  };
  const opacityOf = (el) => { let o = 1; for (let n = el; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity); return o; };
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n;
  let checked = 0;
  while ((n = walker.nextNode())) {
    if (!n.textContent.trim()) continue;
    const el = n.parentElement;
    if (!el || !visible(el) || el.closest('.vh, .sr-only, [aria-hidden="true"], .tip, figcaption')) continue;
    const cs = getComputedStyle(el);
    const fg = parse(cs.color);
    const bg = bgOf(el);
    if (!fg || !bg) continue;
    const o = opacityOf(el) * fg.a;
    if (o < 0.05) continue;
    const eff = { r: fg.r * o + bg.r * (1 - o), g: fg.g * o + bg.g * (1 - o), b: fg.b * o + bg.b * (1 - o) };
    const size = parseFloat(cs.fontSize);
    const bold = Number(cs.fontWeight) >= 700;
    const min = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
    const r = ratio(eff, bg);
    checked++;
    if (r + 1e-6 < min) issues.push('contrast ' + r.toFixed(2) + ' < ' + min + ': "' + n.textContent.trim().slice(0, 30) + '" ' + tag(el));
    if (size < 11.5) issues.push('text below 12 px (' + size + ' px): "' + n.textContent.trim().slice(0, 30) + '" ' + tag(el));
  }
  return { issues, checked, controls };
}

/** @returns {{ring: boolean, name: string, id: string}} the focused element's ring and name. */
function focusInfo() {
  const el = document.activeElement;
  if (!el || el === document.body) return { ring: false, name: '', id: '(body)', idx: null, inScope: false };
  const probe = document.createElement('i');
  probe.style.color = 'var(--focus)';
  document.body.appendChild(probe);
  const focus = getComputedStyle(probe).color;
  probe.remove();
  const rgb = /rgba?\(([^)]+)\)/.exec(focus);
  const key = rgb ? rgb[1].split(',').slice(0, 3).map((x) => x.trim()).join(', ') : '255, 210, 63';
  const ringOn = (n) => {
    if (!n) return false;
    const cs = getComputedStyle(n);
    if (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2) return true;
    return !!cs.boxShadow && cs.boxShadow !== 'none' && cs.boxShadow.indexOf(key) >= 0;
  };
  const ring = ringOn(el) || ringOn(el.parentElement) || ringOn(el.closest('[data-focus-ring]'));
  const name = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || (el.labels && el.labels[0] && el.labels[0].textContent) || '').trim();
  const F = window.SR && window.SR.ui && window.SR.ui.focus;
  const scope = F && typeof F.current === 'function' ? F.current() : null;
  return {
    ring, name: name.slice(0, 40), id: el.getAttribute('data-id') || el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : ''),
    idx: el.hasAttribute('data-a11y-idx') ? Number(el.getAttribute('data-a11y-idx')) : null,
    inScope: scope ? scope.root.contains(el) : !!document.getElementById('ui') && document.getElementById('ui').contains(el),
  };
}

/** Marks the navigables of the current focus scope (or of #ui) in DOM order; @returns {number} how many. */
function markNavigables() {
  const F = window.SR && window.SR.ui && window.SR.ui.focus;
  const scope = F && typeof F.current === 'function' ? F.current() : null;
  const root = scope ? scope.root : document.getElementById('ui');
  const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[hidden], [inert]'); };
  let list = F && typeof F.navigables === 'function' && scope ? F.navigables(root)
    : Array.from(root.querySelectorAll('[data-nav], button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])')).filter(visible);
  list = list.filter((el) => !el.disabled);
  document.querySelectorAll('[data-a11y-idx]').forEach((el) => el.removeAttribute('data-a11y-idx'));
  list.forEach((el, k) => el.setAttribute('data-a11y-idx', String(k)));
  if (scope && (!document.activeElement || !root.contains(document.activeElement)) && list[0]) F.focus(list[0]);
  return { n: list.length, scoped: !!scope };
}

// ------------------------------------------------------------------------------------------------
// Node-side helpers

/**
 * Tabs through the current focus scope with the real keyboard: every navigable is reached in DOM
 * order (wrapping), focus stays in the scope and each stop shows the ring and has a name.
 * @returns {Promise<{n: number, seq: object[], issues: string[]}>}
 */
async function tabWalk(t, opts) {
  opts = opts || {};
  const m = await t.eval(markNavigables);
  const seq = [];
  const issues = [];
  if (!m.n) return { n: 0, seq, issues };        // nothing to tab through (a screen without controls)
  const steps = Math.min(m.n + 1, opts.max || 80);
  for (let k = 0; k < steps; k++) {
    await t.page.keyboard.press('Tab');
    seq.push(await t.eval(focusInfo));
  }
  const reached = new Set(seq.map((s) => s.idx).filter((x) => x !== null));
  if (m.n && reached.size < Math.min(m.n, steps)) issues.push('Tab reached ' + reached.size + ' of ' + m.n + ' controls');
  for (let k = 0; k < seq.length; k++) {
    const s = seq[k];
    if (!s.inScope) { issues.push('Tab ' + (k + 1) + ' left the focus scope (' + s.id + ')'); continue; }
    if (!s.ring) issues.push('no visible focus ring on ' + s.id);
    if (!s.name) issues.push('no name on focused ' + s.id);
    if (k > 0 && m.scoped && seq[k - 1].idx !== null && s.idx !== null && m.n > 1 && s.idx !== (seq[k - 1].idx + 1) % m.n) issues.push('Tab went from #' + seq[k - 1].idx + ' to #' + s.idx + ' (not DOM order)');
  }
  await t.eval(() => document.querySelectorAll('[data-a11y-idx]').forEach((el) => el.removeAttribute('data-a11y-idx')));
  return { n: m.n, seq, issues: Array.from(new Set(issues)) };
}

/**
 * Walks the current focus scope with the arrows (SR.ui.focus.move, the spatial navigation the
 * keyboard's arrows and the D-pad drive): each stop stays in the scope, shows the ring and has a
 * name, and the walk reaches more than one control. For a scope where Tab is not navigation (the
 * Pocket closes on Tab: CONTRACT §15.5, D57; docs/requests/W2-Pocket.md 1).
 * @returns {Promise<{n: number, reached: number, issues: string[]}>}
 */
async function arrowWalk(t) {
  const m = await t.eval(markNavigables);
  const issues = [];
  const seen = new Set();
  if (!m.n) return { n: 0, reached: 0, issues };
  for (const dir of ['down', 'right', 'down', 'up', 'left']) {
    for (let k = 0; k < Math.min(m.n, 30); k++) {
      const moved = await t.eval((d) => window.SR.ui.focus.move(d), dir);
      const s = await t.eval(focusInfo);
      if (!s.inScope) issues.push('the arrows left the focus scope (' + s.id + ')');
      if (!s.ring) issues.push('no visible focus ring on ' + s.id);
      if (!s.name) issues.push('no name on focused ' + s.id);
      if (s.idx !== null) seen.add(s.idx);
      if (!moved) break;
    }
  }
  if (m.n > 1 && seen.size < 2) issues.push('the arrows reached ' + seen.size + ' of ' + m.n + ' controls');
  await t.eval(() => document.querySelectorAll('[data-a11y-idx]').forEach((el) => el.removeAttribute('data-a11y-idx')));
  return { n: m.n, reached: seen.size, issues: Array.from(new Set(issues)) };
}

/** Audits one target: the static audit, then the Tab walk (or the arrow walk), then a screenshot. */
async function check(T, t, label, rootSel, opts) {
  opts = opts || {};
  const a = await t.eval(audit, rootSel);
  T.eq(a.issues, [], label + ': names, roles and contrast (' + a.controls + ' controls, ' + a.checked + ' text nodes)');
  if (opts.tab !== false) {
    const w = await tabWalk(t, opts);
    T.eq(w.issues, [], label + ': Tab walks ' + w.n + ' controls in order, in scope, ringed and named');
  } else if (opts.arrows) {
    const w = await arrowWalk(t);
    T.eq(w.issues, [], label + ': the arrows walk ' + w.reached + ' of ' + w.n + ' controls, in scope, ringed and named');
  }
  fs.mkdirSync(SHOTS, { recursive: true });
  await t.page.screenshot({ path: path.join(SHOTS, label.replace(/[^\w.-]+/g, '-') + '.png') });
}

// ------------------------------------------------------------------------------------------------

// A page of planted problems: the audit and the Tab walk must catch each (and pass the clean part).
const PLANTS = '<!doctype html><html lang="en"><head><title>a11y plants</title><style>' +
  ':root { --focus: rgb(255, 210, 63); } body { background: rgb(255, 255, 255); font: 16px sans-serif; color: rgb(0, 0, 0); }' +
  'button:focus { outline: 3px solid rgb(255, 210, 63); } #ui .noring:focus { outline: none; box-shadow: none; }' +
  '.dark { background: rgb(20, 20, 20); padding: 8px; } .glass { background: rgba(255, 255, 255, 0.6); }</style></head><body>' +
  // the Tab walk's scope comes first, with a wrap-around trap like SR.ui.focus's
  '<div id="ui"><button>One</button><button class="noring">Two</button><button>Three</button></div>' +
  '<script>document.addEventListener("keydown", function (e) { var b = Array.prototype.slice.call(document.querySelectorAll("#ui button"));' +
  ' if (e.key === "Tab" && !e.shiftKey && document.activeElement === b[b.length - 1]) { e.preventDefault(); b[0].focus(); } });</script>' +
  '<div id="clean"><button>Fine</button><p>Readable text</p><img alt="A folded crane" width="20" height="20" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></div>' +
  '<div id="noname"><button data-id="bad-btn"></button></div>' +
  '<div id="faint"><p style="color: rgb(170, 170, 170)">Faint text</p></div>' +
  '<div id="tiny"><p style="font-size: 10px">Tiny text</p></div>' +
  '<div id="noalt"><img width="20" height="20" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></div>' +
  '<div id="dlg"><div role="dialog">Dialog body</div></div>' +
  '<div id="glass" class="dark"><div class="glass"><p style="color: rgb(100, 100, 100)">Grey on frosted glass over ink</p></div></div>' +
  '</body></html>';

/** The audit and the Tab walk catch planted problems (a page of their own in the same browser). */
async function selfCheck(T, t) {
  T.section('the audit catches planted problems');
  const p = await t.context.newPage();
  try {
    await p.setContent(PLANTS);
    const a = (sel) => p.evaluate(audit, sel);
    T.eq((await a('#clean')).issues, [], 'a named button, readable text and an image with alt pass');
    T.ok(/no accessible name/.test((await a('#noname')).issues.join(' ')), 'a button without a name fails');
    T.ok(/contrast 2\.\d+ < 4\.5/.test((await a('#faint')).issues.join(' ')), 'faint text (2.3:1) fails');
    T.ok(/below 12 px/.test((await a('#tiny')).issues.join(' ')), '10 px text fails');
    T.ok(/image without alt/.test((await a('#noalt')).issues.join(' ')), 'an image without alt fails');
    T.ok(/dialog without a name/.test((await a('#dlg')).issues.join(' ')), 'a dialog without a name fails');
    T.ok(/contrast 2\.\d+ < 4\.5/.test((await a('#glass')).issues.join(' ')), 'grey text on a translucent panel over ink fails (the panel is composited, not taken as opaque white)');
    const w = await tabWalk({ page: p, eval: (fn, arg) => p.evaluate(fn, arg) });
    T.ok(w.n === 3 && w.issues.length === 1 && /no visible focus ring/.test(w.issues[0]), 'the Tab walk reaches 3 controls in order and flags the one without a ring', w.issues);
  } finally {
    await p.close();
  }
}

async function run() {
  const T = h.suite('e2e a11y (W1-Q)');
  const pending = [];

  // ---------------------------------------------------------------- the game page
  const t = await h.open({ width: 1280, height: 720, fast: true });
  await selfCheck(T, t);
  T.section('the game page');
  const live = await t.eval(() => ({ aria: !!document.querySelector('#aria[role="status"][aria-live="polite"]'), lang: document.documentElement.lang, title: document.title }));
  T.ok(live.aria, '#aria is a polite live region (role status)');
  T.ok(!!live.lang && !!live.title, 'the page has a language and a title', live);
  await check(T, t, 'title', '#ui');

  const api = await t.eval(() => ({ newGame: !!(window.SR.debug && window.SR.debug.newGame), enter: !!(window.SR.debug && window.SR.debug.enter), card: !!(window.SR.ui.card && window.SR.ui.card.open), dialog: !!(window.SR.ui.dialog && window.SR.ui.dialog.open), confirm: typeof window.SR.ui.confirm === 'function' }));
  if (!api.newGame || !api.enter) pending.push('building cards (SR.debug.newGame / enter, W1-K M1)');
  else {
    await t.debug('newGame', { seed: 7 });
    const real = await t.eval(() => Object.keys(window.SR.reg.building).sort());
    if (!real.length) pending.push('registered buildings (wave 2)');
    let fixtures = [];
    if (fs.existsSync(FIXTURES)) {
      await t.page.addScriptTag({ path: FIXTURES });
      fixtures = await t.eval((before) => { window.W1D.fakes(); window.W1D.content(); return Object.keys(window.SR.reg.building).filter((id) => before.indexOf(id) < 0).sort(); }, real);
    }
    for (const id of real.concat(fixtures)) {
      T.section('building card: ' + id + (fixtures.indexOf(id) >= 0 ? ' (W1-D fixture)' : ''));
      await t.debug('goto', 'title');
      await t.enter(id);
      await t.step(2);
      await check(T, t, 'card-' + id, '#ui [data-scene="building"]');
      const hc = await t.eval(() => { if (!window.SR.settings) return false; window.SR.settings.set('access.highContrast', true); return true; });
      if (hc) {
        await t.step(1);
        const a = await t.eval(audit, '#ui [data-scene="building"]');
        T.eq(a.issues, [], 'card-' + id + ' in high contrast: names, roles and contrast');
        await t.eval(() => window.SR.settings.set('access.highContrast', false));
      }
      const sub = await t.eval(() => {
        const rows = window.SR.ui.card.rows ? window.SR.ui.card.rows() : [];
        const row = rows.find((r) => r.enabled && window.SR.reg.action[r.id] && window.SR.reg.action[r.id].screen);
        if (!row) return null;
        window.SR.ui.card.push(window.SR.reg.action[row.id].screen, window.SR.reg.action[row.id].screenParams || {});
        return window.SR.reg.action[row.id].screen;
      });
      if (sub) {
        await t.step(2);
        await check(T, t, 'card-' + id + '-sub-' + sub, '#ui [data-scene="building"]');
        await t.eval(() => window.SR.ui.card.pop && window.SR.ui.card.pop());
        await t.step(1);
      }
    }
    // Dialogs and confirms open over a scene (a building here, the city in wave 2).
    const host = real.concat(fixtures)[0];
    const toHost = async () => { await t.debug('goto', 'title'); if (host) { await t.enter(host); await t.step(2); } };
    if (api.dialog) {
      T.section('dialog');
      await toHost();
      await t.eval(() => {
        window.__dlg = window.SR.ui.dialog.open({ id: 'qa', name: 'Harold', text: 'Spare a dollar for a folded man?',
          choices: [{ id: 'give', label: 'Give $10' }, { id: 'talk', label: 'Ask about the fold' }, { id: 'leave', label: 'Leave' }] });
      });
      await t.step(2);
      await check(T, t, 'dialog', '#ui [data-scene="dialog"]');
      await t.page.keyboard.press('Escape');
      await t.step(2);
    } else pending.push('dialog (W1-D)');
    if (api.confirm) {
      T.section('confirm');
      await toHost();
      await t.eval(() => { window.__cf = window.SR.ui.confirm({ title: 'Sell the penthouse?', text: 'The deal is final.', danger: true }); });
      await t.step(2);
      await check(T, t, 'confirm', '#ui [data-scene="confirm"]');
      await t.page.keyboard.press('Escape');
      await t.step(2);
    } else pending.push('confirm (W1-D)');
  }
  // menus and the Pocket (W2-Front, W2-Pocket)
  for (const id of ['pause', 'settings', 'saveload', 'pocket']) {
    const has = await t.eval((id) => !!(window.SR.reg.scene && window.SR.reg.scene[id]), id);
    if (!has) { pending.push('the ' + id + ' ' + (id === 'pocket' ? 'notebook' : 'menu') + ' (wave 2)'); continue; }
    T.section('menu: ' + id);
    await t.debug('goto', 'title');
    await t.eval((id) => { window.SR.scenes.push(id, {}); }, id);
    await t.step(2);
    // The Pocket closes on Tab (D57; W2-Pocket request 1): its controls are walked with the arrows.
    const opts = id === 'pocket' ? { tab: false, arrows: true } : undefined;
    await check(T, t, 'menu-' + id, '#ui [data-scene="' + id + '"]', opts);
    const tabs = await t.eval((id) => Array.from(document.querySelectorAll('#ui [data-scene="' + id + '"] [role="tab"]')).map((el) => el.getAttribute('data-id') || el.textContent.trim()), id);
    for (let k = 0; k < tabs.length; k++) {
      await t.eval(([id, k]) => { const el = document.querySelectorAll('#ui [data-scene="' + id + '"] [role="tab"]')[k]; if (el) el.click(); }, [id, k]);
      await t.step(2);
      await check(T, t, 'menu-' + id + '-tab-' + tabs[k], '#ui [data-scene="' + id + '"]', opts);
    }
  }
  T.eq(t.errors(), [], 'zero console errors on the game page');
  await t.close();

  // ---------------------------------------------------------------- the components gallery
  if (fs.existsSync(path.join(h.ROOT, 'tests', 'sheets', 'components.html'))) {
    T.section('the components gallery (W1-D)');
    const g = await h.open({ width: 1400, height: 900, url: GALLERY });
    await g.page.waitForFunction(() => window.W1D && window.W1D.ready === true, null, { timeout: 15000 }).catch(() => null);
    for (const [label, set] of [['default', null], ['high contrast', ['access.highContrast', true]], ['protan', ['access.colorblind', 'protan']]]) {
      if (set) await g.eval((s) => window.SR.settings && window.SR.settings.set(s[0], s[1]), set);
      const a = await g.eval(audit, '.sheet');
      T.eq(a.issues, [], 'gallery (' + label + '): names, roles and contrast (' + a.controls + ' controls, ' + a.checked + ' text nodes)');
      if (set) await g.eval((s) => window.SR.settings && window.SR.settings.set(s[0], s[0] === 'access.colorblind' ? 'none' : false), set);
    }
    const rings = await g.eval(focusEveryNav);
    T.eq(rings.bad, [], 'every [data-nav] of the gallery (' + rings.n + ') takes focus with a visible ring');
    T.eq(g.errors(), [], 'zero console errors on the gallery');
    await g.close();
  } else pending.push('the components gallery (W1-D)');

  if (pending.length) console.log('  pending (their owners have not landed yet): ' + pending.join('; '));
  return T.done();
}

/** In-page: focuses every visible [data-nav] of .sheet through SR.ui.focus and checks the ring. */
function focusEveryNav() {
  const probe = document.createElement('i');
  probe.style.color = 'var(--focus)';
  document.body.appendChild(probe);
  const rgb = /rgba?\(([^)]+)\)/.exec(getComputedStyle(probe).color);
  probe.remove();
  const key = rgb ? rgb[1].split(',').slice(0, 3).map((x) => x.trim()).join(', ') : '255, 210, 63';
  const ringOn = (n) => { if (!n) return false; const cs = getComputedStyle(n); return (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2) || (cs.boxShadow !== 'none' && cs.boxShadow.indexOf(key) >= 0); };
  const bad = [];
  const list = Array.from(document.querySelectorAll('.sheet [data-nav]')).filter((el) => el.getClientRects().length);
  list.forEach((el) => {
    if (window.SR.ui.focus && window.SR.ui.focus.focus) window.SR.ui.focus.focus(el); else el.focus();
    if (document.activeElement !== el) { bad.push('cannot focus ' + (el.getAttribute('data-id') || el.className)); return; }
    if (!ringOn(el) && !ringOn(el.parentElement) && !ringOn(el.closest('[data-focus-ring]'))) bad.push('no ring on ' + (el.getAttribute('data-id') || el.className));
  });
  return { bad, n: list.length };
}

module.exports = { audit, focusInfo, markNavigables, tabWalk, check, focusEveryNav };

if (require.main === module) run().catch((e) => { console.error(e); process.exit(1); });   // exit: an open browser would keep Node alive
