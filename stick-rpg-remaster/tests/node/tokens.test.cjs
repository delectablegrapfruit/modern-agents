// tests/node/tokens.test.cjs — owner: W1-D. The design tokens (UI.md §2.1; ARCHITECTURE §18):
// parses css/tokens.css and asserts
//   - every token of the UI.md §2.1 block is present with its specified value (verbatim),
//   - every contrast pair of UI.md §2.1 (each -ink on its -100 ≥ 4.5:1, white on --primary-600
//     and on --danger ≥ 4.5:1, --ink-500 on --paper-0/1/2 ≥ 5.0:1) in every mode: default, high
//     contrast, each colour-blind table and high contrast with a colour-blind table,
//   - the extra text pairs the components use (reasons, cash, crumbs, tooltips) ≥ 4.5:1,
//   - the karma bands equal BALANCE B-04c, and SR.art.palette's mirror agrees where it names a token,
//   - no colour literal in the other W1-D files (the validator's rule, ARCHITECTURE §18).
//   node tests/node/tokens.test.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const { load, suite, ROOT } = require('./load.cjs');

const T = suite('tokens (W1-D)');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const css = read('css/tokens.css').replace(/\/\*[\s\S]*?\*\//g, '');

// ---------------------------------------------------------------- parsing
/** @returns {{selector: string, vars: object}[]} the rule blocks of a stylesheet (flat CSS only). */
function blocks(text) {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(text))) {
    const vars = {};
    m[2].split(';').forEach((decl) => {
      const i = decl.indexOf(':');
      if (i < 0) return;
      const k = decl.slice(0, i).trim();
      if (k.indexOf('--') === 0) vars[k] = decl.slice(i + 1).trim();
    });
    out.push({ selector: m[1].trim(), vars });
  }
  return out;
}
const B = blocks(css);
const find = (sel) => B.filter((b) => b.selector.split(',').map((s) => s.trim()).indexOf(sel) >= 0);
const merged = (sels) => Object.assign({}, ...sels.map((s) => Object.assign({}, ...find(s).map((b) => b.vars))));

const MODES = {
  default: merged([':root']),
  hc: merged([':root', ':root.hc']),
  protan: merged([':root', ':root[data-cb="protan"]']),
  deutan: merged([':root', ':root[data-cb="deutan"]']),
  tritan: merged([':root', ':root[data-cb="tritan"]']),
  'hc+protan': merged([':root', ':root.hc', ':root[data-cb="protan"]', ':root.hc[data-cb]']),
  'hc+tritan': merged([':root', ':root.hc', ':root[data-cb="tritan"]', ':root.hc[data-cb]']),
};

/** Resolves var() references (one level at a time, up to 8). */
function resolve(vars, v) {
  for (let i = 0; i < 8 && /var\(/.test(v); i++) v = v.replace(/var\((--[\w-]+)\)/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
  return v;
}
function rgb(v) {
  v = String(v).trim();
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
  if (m) {
    let hx = m[1];
    if (hx.length === 3) hx = hx.split('').map((c) => c + c).join('');
    return [0, 2, 4].map((i) => parseInt(hx.substr(i, 2), 16));
  }
  m = /^rgba?\(([^)]+)\)$/i.exec(v);
  if (m) return m[1].split(',').slice(0, 3).map((x) => Number(x.trim()));
  return null;
}
function lum(c) {
  const a = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}
function ratio(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
function colour(mode, name) { return rgb(resolve(MODES[mode], MODES[mode][name] || '')); }

// ---------------------------------------------------------------- the UI.md §2.1 block, verbatim
T.section('UI.md §2.1 tokens are present with their specified values');
const ui = read('docs/UI.md');
const start = ui.indexOf('### 2.1 Tokens');
const block = ui.slice(start, ui.indexOf('```', ui.indexOf('```css', start) + 6));
const spec = {};
block.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(--[\w-]+)\s*:\s*([^;]+);/g, (m, k, v) => { spec[k] = v.trim(); return m; });
const norm = (v) => String(v).replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').trim().toLowerCase();
const specKeys = Object.keys(spec);
T.ok(specKeys.length >= 80, 'parsed the UI.md §2.1 block (' + specKeys.length + ' tokens)');
const wrong = specKeys.filter((k) => norm(MODES.default[k]) !== norm(spec[k])).map((k) => k + ': ' + MODES.default[k] + ' (spec ' + spec[k] + ')');
T.eq(wrong, [], 'every §2.1 token has its specified value in :root');
T.eq(MODES.default['--primary-600'], '#1F4FD6', '--primary-600 #1F4FD6 (filled buttons)');
T.eq(MODES.default['--str-ink'], '#963F07', '--str-ink #963F07');
T.eq(MODES.default['--ink-500'], '#5C6070', '--ink-500 #5C6070');
T.eq(MODES.default['--fs-28'], '28px', '--fs-28 28px (the HUD cash)');

// ---------------------------------------------------------------- contrast pairs in every mode
const MEANINGS = ['money', 'hp', 'str', 'int', 'cha', 'time', 'heat'];
Object.keys(MODES).forEach((mode) => {
  T.section('contrast pairs · ' + mode);
  const bad = [];
  const check = (fg, bg, min, label) => {
    const a = colour(mode, fg), b = colour(mode, bg);
    if (!a || !b) { bad.push(label + ': unresolved'); return; }
    const r = ratio(a, b);
    if (r + 1e-9 < min) bad.push(label + ' = ' + r.toFixed(2));
  };
  MEANINGS.forEach((x) => check('--' + x + '-ink', '--' + x + '-100', 4.5, x + '-ink on ' + x + '-100'));
  check('--primary-ink', '--primary-600', 4.5, 'white on primary-600');
  check('--white', '--danger', 4.5, 'white on danger');
  ['--paper-0', '--paper-1', '--paper-2'].forEach((p) => check('--ink-500', p, 5.0, 'ink-500 on ' + p));
  // Pairs the components put text on (css/components.css).
  ['--paper-0', '--paper-1', '--paper-2'].forEach((p) => {
    check('--ink-900', p, 4.5, 'ink-900 on ' + p);
    check('--ink-700', p, 4.5, 'ink-700 on ' + p);
    check('--danger-ink', p, 4.5, 'danger-ink (reasons) on ' + p);
  });
  check('--money-ink', '--paper-0', 4.5, 'money-ink (HUD cash) on paper-0');
  check('--heat-ink', '--paper-0', 4.5, 'heat-ink (HUD heat) on paper-0');
  check('--primary-600', '--paper-0', 4.5, 'primary-600 (crumbs) on paper-0');
  check('--paper-0', '--ink-900', 4.5, 'paper-0 on ink-900 (tooltips, key badges)');
  check('--ink-900', '--focus', 4.5, 'ink-900 on focus (NEW badge)');
  check('--ink-900', '--primary-100', 4.5, 'ink-900 on primary-100 (info chips)');
  check('--danger-ink', '--hp-100', 4.5, 'danger-ink on hp-100 (short chips)');
  check('--ink-900', '--paper-3', 4.5, 'ink-900 on paper-3 (locked badge)');
  T.eq(bad, [], 'every text pair ≥ its minimum (' + mode + ')');
});
T.section('high contrast swaps (UI.md §2.1)');
T.eq(resolve(MODES.hc, MODES.hc['--ink-500']).toUpperCase(), MODES.default['--ink-700'].toUpperCase(), '--ink-500 becomes --ink-700');
T.ok(/^3px solid/.test(MODES.hc['--line']), '--line is 3 px', MODES.hc['--line']);
T.eq(['--e-1', '--e-2', '--e-3'].map((k) => MODES.hc[k]), ['none', 'none', 'none'], 'shadows off');
T.eq(MEANINGS.map((x) => (MODES.hc['--' + x + '-100'] || '').toUpperCase()), MEANINGS.map(() => '#FFFFFF'), 'chip wells are white');
T.eq(MODES.hc['--grain-opacity'], '0', 'paper grain off');
T.section('colour-blind tables remap the stat and karma base colours');
['protan', 'deutan', 'tritan'].forEach((cb) => {
  const changed = MEANINGS.filter((x) => MODES[cb]['--' + x] !== MODES.default['--' + x]);
  T.ok(changed.length >= 5, cb + ' remaps the meaning colours (' + changed.join(', ') + ')');
  T.ok(MODES[cb]['--karma-evil-5'] !== MODES.default['--karma-evil-5'], cb + ' remaps the evil karma bands');
});

// ---------------------------------------------------------------- karma bands = BALANCE B-04c
T.section('karma bands (BALANCE B-04c)');
const bal = read('docs/BALANCE.md');
const kb = bal.slice(bal.indexOf('### B-04c'));
const row = (name) => {
  const m = new RegExp('^\\| ' + name + ' \\|(.*)\\|\\s*$', 'm').exec(kb);
  return m ? m[1].split('|').map((s) => s.trim()) : [];
};
const good = row('good'), evil = row('evil');
T.eq(good.length + evil.length, 20, 'parsed 10 good and 10 evil bands');
T.eq(good.map((c, i) => MODES.default['--karma-good-' + i]), good, '--karma-good-0..9 match B-04c');
T.eq(evil.map((c, i) => MODES.default['--karma-evil-' + i]), evil, '--karma-evil-0..9 match B-04c');

// ---------------------------------------------------------------- the canvas mirror (W1-A)
T.section('SR.art.palette mirrors the tokens (js/art/palette.js)');
let SR = null;
try { SR = load({ mode: 'all' }).SR; } catch (e) { T.ok(false, 'load mode all: ' + e.message); }
const pal = SR && SR.art && SR.art.palette;
if (pal && pal.karma && Array.isArray(pal.karma.good)) {
  T.eq(pal.karma.good.map((c) => String(c).toUpperCase()), good.map((c) => c.toUpperCase()), 'palette.karma.good equals the tokens');
  T.eq(pal.karma.evil.map((c) => String(c).toUpperCase()), evil.map((c) => c.toUpperCase()), 'palette.karma.evil equals the tokens');
} else T.ok(true, 'palette.karma not landed yet (skipped)');
if (pal && pal.ui && typeof pal.ui === 'object') {
  const flat = (k) => k.replace(/^--/, '').replace(/[-_]/g, '').toLowerCase();
  const byName = {};
  Object.keys(MODES.default).forEach((k) => { byName[flat(k)] = k; });
  const compared = [], mismatch = [];
  Object.keys(pal.ui).forEach((k) => {
    const tk = byName[flat(k)];
    if (!tk || typeof pal.ui[k] !== 'string') return;
    const a = rgb(pal.ui[k]), b = rgb(resolve(MODES.default, MODES.default[tk]));
    if (!a || !b) return;
    compared.push(k);
    if (a.join() !== b.join()) mismatch.push(k + ' ' + pal.ui[k] + ' vs ' + tk + ' ' + MODES.default[tk]);
  });
  T.ok(compared.length > 10, 'palette.ui names ' + compared.length + ' tokens');
  T.eq(mismatch, [], 'every palette.ui entry equals its token');
} else T.ok(true, 'palette.ui not landed yet (skipped)');

// ---------------------------------------------------------------- no colour literals elsewhere
T.section('no colour literal outside css/tokens.css (W1-D files)');
const MINE = ['css/base.css', 'css/components.css', 'js/ui/dom.js', 'js/ui/components.js', 'js/ui/focus.js', 'js/ui/toast.js',
  'js/ui/stamp.js', 'js/ui/modal.js', 'js/ui/hud.js', 'js/ui/card.js', 'js/ui/dialog.js', 'js/scenes/building.js', 'js/data/text/en-ui.js'];
const LIT = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;
MINE.forEach((f) => {
  const hits = read(f).split('\n').map((l, i) => [i + 1, l]).filter((x) => LIT.test(x[1].replace(/'#(ui|app|stage|aria|world|fx)\b/g, '')));
  T.eq(hits.map((x) => f + ':' + x[0]), [], f + ' has no colour literal');
});
T.ok(!/Math\.random/.test(read('js/data/text/en-ui.js')), 'en-ui.js has no Math.random');

// ---------------------------------------------------------------- en-ui.js is well-formed
T.section('en-ui.js text');
if (SR) {
  const keys = SR.registry.entries('text').filter((e) => e.file === 'js/data/text/en-ui.js').map((e) => e.id);
  T.ok(keys.length > 300, 'en-ui.js registers ' + keys.length + ' keys');
  const OWN = /^(game\.title|game\.tag|ui\.|hud\.|set\.|key\.|cap\.|mg\.frame\.)/;
  T.eq(keys.filter((k) => !OWN.test(k)), [], 'every key is in the en-ui namespaces (CONTRACT §7)');
  T.eq(SR.text('ui.fanNote'), 'Fan remaster. Not affiliated with or endorsed by XGen Studios.', 'the fan note (the only XGen string)');
  const xgen = keys.filter((k) => k !== 'ui.fanNote' && /xgen/i.test(String(SR.reg.text[k])));
  T.eq(xgen, [], 'XGen appears only in ui.fanNote');
  const plan = read('docs/BUILD_PLAN.md');
  const banned = plan.slice(plan.indexOf('## Appendix A')).split('```')[1].split('\n').map((s) => s.trim()).filter(Boolean);
  const hits = [];
  keys.forEach((k) => { const v = String(SR.reg.text[k]).toLowerCase(); banned.forEach((b) => { if (v.indexOf(b.toLowerCase()) >= 0) hits.push(k + ': ' + b); }); });
  T.eq(hits, [], 'no banned string (BUILD_PLAN Appendix A) in en-ui.js');
  ['cap.horn', 'cap.siren', 'cap.answering', 'cap.edgeWind', 'cap.thunder', 'cap.knock'].forEach((k) => T.ok(SR.text.has(k), 'caption ' + k));
}

T.done();
