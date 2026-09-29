// tests/node/art.test.cjs — owner: W1-A. Node checks of the art kit (BUILD_PLAN §3.6):
// - palette.js, icons.js and interiors/kit.js load in Node (the validator's mode all) and so do the
//   pure-at-load-time stick.js, vehicles.js and logo.js;
// - the palette carries ART_AUDIO §2 / §5.2 / §9, BALANCE B-04c and the UI.md §2.1 tokens verbatim
//   (read from the docs), every leaf is a colour, every interior has its neutral set;
// - every icon name of ART_AUDIO §10 is registered as a draw function;
// - every palette-key literal in the W1-A files resolves; no colour literal outside palette.js; no
//   Math.random;
// - the rig: every clip evaluates to 12 finite numbers, karma bands per B-04c, every look and
//   accessory resolves; vehicles and the logo's letterforms cover their sets.
//   node tests/node/art.test.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const { load, suite, ROOT } = require('./load.cjs');

const T = suite('art (W1-A)');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const BOOT = ['js/boot/namespace.js', 'js/boot/util.js', 'js/boot/events.js', 'js/core/rng.js', 'js/core/text.js'];
const MINE_NODE = ['js/art/palette.js', 'js/art/icons.js', 'js/art/interiors/kit.js'];
const MINE_PURE = ['js/art/draw.js', 'js/art/stick.js', 'js/art/vehicles.js', 'js/art/logo.js', 'js/art/portraits.js', 'js/art/paper.js', 'js/art/bible.js'];
const MINE = MINE_NODE.concat(MINE_PURE);

T.section('loading');
let res;
try {
  res = load({ files: BOOT.concat(MINE_NODE) });
  T.ok(true, 'palette.js, icons.js, interiors/kit.js load and boot in Node');
} catch (e) {
  T.ok(false, 'palette.js, icons.js, interiors/kit.js load and boot in Node', e.message);
  T.done();
  process.exit(1);
}
const R = load({ files: BOOT.concat(MINE_NODE, MINE_PURE) });
const SR = R.SR;
T.ok(typeof SR.art.interior === 'function', 'SR.art.interior is the factory');
T.ok(typeof SR.art.icon === 'function' && typeof SR.art.iconURL === 'function', 'SR.art.icon and SR.art.iconURL exist');
try {
  const all = load({ mode: 'all' });
  T.ok(all.errors.length === 0, 'the whole mode-all set loads and boots with the W1-A files in it');
} catch (e) {
  T.ok(false, 'the whole mode-all set loads and boots with the W1-A files in it', e.message);
}
for (let seed = 1; seed <= 3; seed++) {
  try {
    load({ mode: 'all', shuffle: seed * 7919 });
    T.ok(true, 'mode all loads in shuffled order (seed ' + seed * 7919 + ')');
  } catch (e) {
    T.ok(!/js\/art\//.test(e.message), 'shuffled load (seed ' + seed * 7919 + ') has no W1-A failure', e.message);
  }
}

// ---- palette ---------------------------------------------------------------------------------------
T.section('palette');
const P = SR.art.palette;
const HEX = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8}|[0-9A-Fa-f]{3})$/;
const leaves = [];
(function walk(node, prefix) {
  Object.keys(node).forEach((k) => {
    const v = node[k];
    const key = prefix ? prefix + '.' + k : k;
    if (v && typeof v === 'object') walk(v, key);
    else leaves.push([key, v]);
  });
})(P, '');
const bad = leaves.filter(([k, v]) => !(typeof v === 'string' && HEX.test(v)) && !/^sky\.\d+\.(h|light)$/.test(k));
T.eq(bad, [], 'every leaf is a hex colour (sky keyframes also carry h and light numbers)');
T.ok(leaves.length > 400, 'the palette has ' + leaves.length + ' entries');

// B-04c karma bands, verbatim
const balance = read('docs/BALANCE.md');
const kgood = /\| good \|([^\n]+)\|/.exec(balance)[1].split('|').map((s) => s.trim());
const kevil = /\| evil \|([^\n]+)\|/.exec(balance)[1].split('|').map((s) => s.trim());
T.eq(P.karma.good, kgood, 'karma.good[0..9] = BALANCE B-04c');
T.eq(P.karma.evil, kevil, 'karma.evil[0..9] = BALANCE B-04c');

// ART_AUDIO §2.1 world, §2.3 NPC heads, §5.2 identity, §9 McSticks, §2.2 sky
const art = read('docs/ART_AUDIO.md');
const worldRows = art.split('### 2.1 World')[1].split('### 2.2')[0].split('\n').filter((l) => /^\| `/.test(l));
let worldChecked = 0;
worldRows.forEach((row) => {
  const cells = row.split('|').map((s) => s.trim());
  const names = cells[1].replace(/`/g, '').split('/').map((s) => s.trim());
  const hexes = cells[2].split('/').map((s) => s.trim());
  names.forEach((n, i) => {
    const m = /(#[0-9A-Fa-f]{6})(?:\s*\((\d+) %\))?/.exec(hexes[i] || '');
    if (!m) return;
    let want = m[1].toUpperCase();
    if (m[2]) want += Math.round(255 * Number(m[2]) / 100).toString(16).toUpperCase().padStart(2, '0');
    T.eq(String(P[n]).toUpperCase(), want, 'world ' + n + ' = ' + want);
    worldChecked++;
  });
});
T.ok(worldChecked >= 27, 'ART_AUDIO §2.1 checked (' + worldChecked + ' entries)');
const npcLine = /NPC head colours[^:]*:([^\n]+(?:\n  [^\n]+)*)/.exec(art)[1];
const npcPairs = [...npcLine.matchAll(/([a-z]+)\s+(#[0-9A-F]{6})/g)];
T.ok(npcPairs.length === 12, '12 NPC head colours in ART_AUDIO §2.3');
npcPairs.forEach((m) => T.eq(P.npc[m[1]], m[2], 'npc.' + m[1]));
const idRows = art.split('### 5.2 Identity table')[1].split('**Reacting')[0].split('\n').filter((l) => /^\| `/.test(l));
idRows.forEach((row) => {
  const cells = row.split('|').map((s) => s.trim());
  const id = cells[1].replace(/`/g, '');
  const vals = cells[3].split('/').map((s) => s.trim());
  if (id === 'skybus') { T.eq([P.bld.skybus.walls, P.bld.skybus.stripe], ['#F3EBDD', '#1CB5F5'], 'bld.skybus walls and stripe'); return; }
  const want = vals.map((v) => {
    if (v === 'stone') return P.stone;
    if (v === 'stoneShade') return P.stoneShade;
    return /#[0-9A-F]{6}/.exec(v)[0];
  });
  T.eq([P.bld[id].walls, P.bld[id].shade, P.bld[id].roof, P.bld[id].trim], want, 'bld.' + id + ' walls / shade / roof / trim');
});
T.eq(idRows.length, 16, 'ART_AUDIO §5.2 has 16 identity rows, all checked');
T.eq([P.int.mcsticks.wall, P.int.mcsticks.floorA, P.int.mcsticks.floorB, P.int.mcsticks.light],
  ['#F3E3B0', '#F4F1EA', '#D92D20', '#FFF3C4'], 'int.mcsticks.* as ART_AUDIO §9 defines them');
const skyRows = art.split('### 2.2 Sky keyframes')[1].split('Weather modifies')[0].split('\n').filter((l) => /^\| \d/.test(l));
skyRows.forEach((row) => {
  const c = row.split('|').map((s) => s.trim());
  const hours = c[1].split('-').map(Number);
  const cols = c[2].split('→').map((s) => s.trim());
  hours.forEach((h) => {
    const k = P.sky.find((e) => e.h === h);
    T.ok(k && k.top === cols[0] && k.horizon === cols[1] && k.ambient === c[3] && k.light === Number(c[4]),
      'sky keyframe ' + h + 'h = ' + cols.join(' → ') + ', ' + c[3] + ', ' + c[4]);
  });
});

// UI.md §2.1 tokens mirrored in palette.ui
const ui = read('docs/UI.md').split('### 2.1 Tokens')[1].split('### 2.2')[0];
let tokens = 0;
for (const m of ui.matchAll(/--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})\b/g)) {
  T.eq(P.ui[m[1]], m[2].toUpperCase(), 'ui.' + m[1] + ' mirrors --' + m[1]);
  tokens++;
}
T.ok(tokens >= 40, 'every hex token of UI.md §2.1 is mirrored (' + tokens + ')');
T.eq(P.ui.scrim, '#1B1D2B73', 'ui.scrim = rgba(27, 29, 43, .45)');
T.eq(P.ui.ink900, P.ui['ink-900'], 'camelCase alias ui.ink900 resolves');
T.ok(!Object.keys(P.ui).includes('ink900'), 'aliases are not enumerable (walkers see each colour once)');
const tokCss = fs.existsSync(path.join(ROOT, 'css/tokens.css')) ? (/:root\s*\{[^}]*\}/.exec(read('css/tokens.css')) || [''])[0] : '';
const drift = [];
for (const m of tokCss.matchAll(/--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})\b/g)) {
  if (P.ui[m[1]] && P.ui[m[1]] !== m[2].toUpperCase()) drift.push(m[1] + ' ' + m[2] + ' vs ' + P.ui[m[1]]);
}
if (drift.length) console.log('  note: css/tokens.css differs from UI.md for ' + drift.join(', '));

// sets
const INTERIORS = ['home', 'apt', 'apt2', 'pent', 'mansion', 'castle', 'mcsticks', 'store', 'pawn', 'furniture', 'bank', 'nli',
  'uofs', 'cityhall', 'bar', 'casino', 'bus', 'jail', 'hospital', 'trip', 'news', 'default'];
const FIELDS = ['wall', 'wallHi', 'wallShade', 'trim', 'floorA', 'floorB', 'counter', 'accent', 'light'];
INTERIORS.forEach((id) => T.eq(FIELDS.filter((f) => !P.int[id] || !HEX.test(P.int[id][f])), [], 'int.' + id + ' has the neutral set'));
T.eq(Object.keys(P.city).sort(), ['crayonburg', 'eraser', 'glitter', 'gusty', 'pegas', 'rustbelt'], 'city.<id> for the six B-12a cities');
T.ok(Array.isArray(P.fighter) && P.fighter.length === 13, 'fighter.0 (the Ring) .. fighter.12');
const karmaHues = P.karma.good.concat(P.karma.evil).slice(1);
T.eq(Object.values(P.npc).filter((c) => karmaHues.includes(c)), [], 'no NPC head colour is a karma band colour');
T.ok(['compact', 'sedan', 'taxi', 'van', 'police', 'junker', 'sports', 'skybus'].every((k) => HEX.test(P.car[k])), 'car.<type> for the 8 vehicle types');

// ---- key resolution, literals, randomness -------------------------------------------------------------
T.section('files');
const D = SR.art.draw;
const warnings = [];
const origWarn = console.warn;
console.warn = (m) => { warnings.push(String(m)); };
const unresolved = [];
const KEY_RE = /'((?:ui|karma|npc|stick|acc|fighter|bld|int|kit|mat|car|city|prop|fx|light|weather|sky)\.[A-Za-z0-9_.-]+|grass|grassShade|grassHi|parkGrass|asphalt|asphaltSpeck|lanePaint|zebra|sidewalk|sidewalkJoint|path|plaza|plazaJoint|paperEdge|strata1|strata2|fibre|paperBack|backPrint|water|waterHi|glass|glassLit|ink|inkLine|shadow|white|railing|stone|stoneShade|cloud|cloudLine|cloudShadow|sawhorse|sawhorseStripe)'/g;
MINE.forEach((rel) => {
  const src = read(rel);
  for (const m of src.matchAll(KEY_RE)) {
    const k = m[1];
    if (/\.$/.test(k) || /\.<|\.\d+\.$/.test(k)) continue;
    if (/^(bld|int|city|karma)\.[a-z_]+$/.test(k) && P[k.split('.')[0]] && typeof P[k.split('.')[0]][k.split('.')[1]] === 'object') continue; // a set prefix
    if (/^(karma\.good|karma\.evil|fx\.confetti|sky)$/.test(k) || /^ui\.bible\./.test(k)) continue; // sets; ui.bible.* are text keys
    const v = D.color(k);
    if (typeof v !== 'string' || v === k) unresolved.push(rel + ': ' + k);
  }
});
console.warn = origWarn;
T.eq(unresolved, [], 'every palette-key literal in the W1-A files resolves');
const LIT = [/#[0-9a-fA-F]{3,8}\b/, /\brgba?\(/, /\bhsla?\(/];
MINE.filter((f) => f !== 'js/art/palette.js').forEach((rel) => {
  const src = read(rel);
  const hit = LIT.map((re) => re.exec(src)).filter(Boolean).map((m) => m[0]);
  T.eq(hit, [], rel + ': no colour literal');
  T.ok(!/Math\.random/.test(src), rel + ': no Math.random');
});
T.ok(!/Math\.random/.test(read('js/art/palette.js')), 'js/art/palette.js: no Math.random');
MINE.forEach((rel) => {
  const first = read(rel).split('\n')[0];
  T.ok(first.startsWith('// ' + rel + ' — owner: W1-A.'), rel + ': header names its path and owner');
  T.ok(!/stub, owner/.test(read(rel)), rel + ': no stub marker left');
});

// ---- icons -------------------------------------------------------------------------------------------
T.section('icons');
const block = art.split('## 10. Icons')[1].split('```')[1];
const wanted = [];
block.split('\n').forEach((line) => {
  const words = line.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return;
  if (/^\s/.test(line)) { words.forEach((w) => wanted.push(w)); return; } // a wrapped line continues its category
  const cat = words[0];
  words.slice(1).forEach((w) => wanted.push(w));
  if (!['general', 'stats', 'food', 'store', 'pawn', 'furniture', 'bank', 'nli', 'uofs', 'bar', 'casino', 'bus', 'city', 'street', 'park', 'fight', 'weather', 'vehicle'].includes(cat)) {
    T.ok(false, 'unexpected icon category line: ' + cat);
  }
});
const missingIcons = wanted.filter((n) => typeof SR.reg.icon[n] !== 'function');
T.eq(missingIcons, [], 'every ART_AUDIO §10 icon is registered as a draw function (' + wanted.length + ' names)');
T.ok(Object.keys(SR.reg.icon).length >= 150, Object.keys(SR.reg.icon).length + ' icons registered');
T.eq(Object.keys(SR.art.icon.CATEGORIES).reduce((n, c) => n + SR.art.icon.CATEGORIES[c].length, 0), Object.keys(SR.reg.icon).length, 'every icon is in exactly one sheet category');
const iconKeys = [];
Object.keys(SR.art.icon.TABLE).forEach((name) => {
  const e = SR.art.icon.TABLE[name];
  const keys = [e[0]];
  (function scan(v) { if (Array.isArray(v)) v.forEach(scan); else if (typeof v === 'string' && /\./.test(v)) keys.push(v.replace(/!$/, '')); })(e[1]);
  keys.forEach((k) => { if (/^[a-z]+\.[\w.-]+$/.test(k) && D.color(k) === k) iconKeys.push(name + ': ' + k); });
});
T.eq(iconKeys, [], 'every palette key named by an icon resolves');

// ---- the rig ----------------------------------------------------------------------------------------
T.section('stick');
const S = SR.art.stick;
const CLIPS = ['idle', 'walk', 'skate', 'drive', 'sit', 'talk', 'eat', 'drink', 'work', 'study', 'lift', 'cheer', 'wave', 'cower',
  'knocked', 'fall', 'guard', 'punch', 'kick', 'fireball', 'inkbeam', 'hurt', 'win', 'lose', 'sleep', 'happy', 'shock'];
T.eq(CLIPS.filter((c) => !S.clips[c]), [], 'every clip ART_AUDIO §7 names exists (plus happy / shock of UI.md §5.6)');
let finite = true;
Object.keys(S.clips).forEach((c) => {
  for (let t = -0.3; t < 3; t += 0.37) {
    const p = S.clip(c, t, new Array(12));
    if (p.length !== 12 || !p.every(Number.isFinite)) finite = false;
  }
});
T.ok(finite, 'every clip evaluates to 12 finite numbers at any t');
T.eq(S.clip('walk', 0.5).map((v) => +v.toFixed(6)), S.clip('walk', 0).map((v) => +v.toFixed(6)), 'walk loops every 0.5 s');
T.eq(S.clip('punch', 99).map((v) => +v.toFixed(6)), S.poses.guard.map((v) => +v.toFixed(6)), 'a one-shot clip holds its last key');
const fightKeys = new Set();
['guard', 'punch', 'kick', 'fireball', 'inkbeam', 'hurt', 'win', 'lose'].forEach((c) => S.clips[c].keys.forEach((k) => fightKeys.add(k[1])));
T.ok(fightKeys.size >= 12, 'the fight clips use ' + fightKeys.size + ' keyed poses (ART_AUDIO §7: 12)');
const band = (k) => S.karmaColor(k);
[[0, 'good', 0], [10, 'good', 0], [11, 'good', 1], [20, 'good', 1], [21, 'good', 2], [91, 'good', 9], [100, 'good', 9],
  [-1, 'evil', 0], [-11, 'evil', 1], [-55, 'evil', 5], [-100, 'evil', 9]].forEach(([k, side, i]) => {
  T.eq(band(k), P.karma[side][i], 'karma ' + k + ' → karma.' + side + '.' + i);
});
const m = S.metrics('city', false), mc = S.metrics('city', true), ms = S.metrics('side', false);
const standTop = -S.joints('stand', {}).head[1] + m.head;
T.ok(Math.abs(standTop - 52) <= 1.5, 'an adult city stick stands ' + standTop.toFixed(1) + ' u tall (52)');
const childTop = -S.joints('stand', { child: true }).head[1] + mc.head;
T.ok(Math.abs(childTop - 38) <= 1.5, 'a child stands ' + childTop.toFixed(1) + ' u tall (38)');
T.eq([m.head, m.limb, ms.head, ms.limb], [8, 3, 28, 7], 'head r 8 / limbs 3 u in the city; head r 28 / limbs 7 u in side view');
const NAMED = ['harold', 'kid', 'dealer', 'mcholland', 'sticky', 'mel', 'dee', 'vinnie', 'sofia', 'penny', 'bea', 'gil', 'frankie',
  'terry', 'lou', 'tabby', 'quill', 'plume', 'crease', 'preacher', 'ori', 'doodle', 'crayon'];
T.eq(NAMED.filter((id) => !S.looks[id]), [], 'every named person of ART_AUDIO §7 has a look');
const ACC_NEEDED = ['cap', 'beanie', 'glasses', 'bowtie', 'scarf', 'headphones', 'tophat', 'hardhat', 'visor', 'mortarboard', 'sash',
  'peakedcap', 'goggles', 'apron', 'tie', 'backpack', 'bag', 'camera', 'umbrella', 'glowstick'];
T.eq(ACC_NEEDED.filter((a) => !S.ACCESSORIES[a]), [], 'every accessory of ART_AUDIO §7 exists');
T.eq(['bow tie', 'Top Hat', 'peaked_cap', 'glow stick', 'hard-hat'].map(S.accessory), ['bowtie', 'tophat', 'peakedcap', 'glowstick', 'hardhat'], 'accessory names are normalised');
const lookWarn = [];
console.warn = (msg) => lookWarn.push(String(msg));
Object.keys(S.looks).concat(['skid', 'red', 'margin', 'fighter.3', 'fighter.12', 'player', 12, 39]).forEach((id) => {
  const L = S.look(id);
  if (!L || !L.layers || typeof L.headCol !== 'string' || L.headCol.charAt(0) !== '#') lookWarn.push('bad look ' + id);
});
console.warn = origWarn;
T.eq(lookWarn, [], 'every look resolves (named, aliases, fighters, pedestrians, the player) with no unknown accessory or key');
T.eq(S.look('skid'), S.look('kid'), 'person aliases: Skid is kid');
T.ok(S.look(7) === S.look(7) && S.look(7) !== S.look(8), 'pedestrian looks are deterministic per number');

// ---- vehicles, logo, kit ---------------------------------------------------------------------------------
T.section('vehicles, logo, kit');
const V = SR.art.vehicles;
T.eq(['compact', 'sedan', 'taxi', 'van', 'police', 'junker', 'sports', 'skybus', 'plane'].filter((t) => !V.TYPES.includes(t)), [], '8 vehicle types plus the Fold Rescue plane');
T.eq(V.size('sedan'), { L: 96, W: 52, H: 35 }, 'a sedan is the 96 × 52 box of GDD §3.8');
T.eq([0, Math.PI / 2, Math.PI, -Math.PI / 2, 2 * Math.PI].map(V.dirFromAngle), [0, 2, 4, 6, 0], 'dirFromAngle: 0 east, 2 south, 4 west, 6 north');
const lamps = V.lamps('sedan', 2);
T.ok(lamps.head.every((p) => p[1] > lamps.tail[0][1]), 'facing south, the headlamps are south of the tail lamps');
const lay = SR.art.logo.measure('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.!?-\'', 760);
T.ok(lay.glyphs.every((g) => g.g.strokes.length > 0), 'the logo letterforms cover A-Z, 0-9 and . ! ? - \'');
T.ok(SR.art.logo.duration === 1.2, 'the logo draws itself in 1.2 s (UI.md §5.1)');
const types = SR.art.interior.types();
T.ok(types.length >= 60, types.length + ' interior prop types (ART_AUDIO §9: about 60)');
const NEEDED_PROPS = ['counter', 'stool', 'table', 'booth', 'shelf', 'cooler', 'register', 'slot', 'cardtable', 'roulette', 'bar', 'taps',
  'dartboard', 'ringrope', 'bed', 'sofa', 'tv', 'computer', 'desk', 'lectern', 'chalkboard', 'lockers', 'barbell', 'treadmill', 'plant',
  'lamp', 'poster', 'rug', 'vault', 'teller', 'watercooler', 'filing', 'elevator', 'departures', 'ticket', 'bench', 'ballot', 'podium',
  'flags', 'menuBoard', 'fryer', 'pod', 'skydish', 'books', 'library', 'homegym', 'freezer', 'minibar', 'lounge', 'aquarium'];
T.eq(NEEDED_PROPS.filter((p) => !types.includes(p)), [], 'every prop ART_AUDIO §9 lists, and every furniture piece of B-08b');
const r1 = SR.art.interior('no_such_interior');
T.ok(r1 && typeof r1.drawStatic === 'function' && typeof r1.drawAnim === 'function', 'an unregistered id gets the placeholder renderer');
T.ok(SR.art.interior('no_such_interior') === r1, 'renderers are cached per id');
const skyAt = SR.art.interior.kit.skyAt;
T.eq([skyAt(0).top, skyAt(720).top, skyAt(23.5 * 60).top !== skyAt(720).top], [P.sky[0].top, P.sky.find((k) => k.h === 9).top, true],
  'the fallback window sky: minute 0 is midnight (not a missing clock), 720 is noon');
T.eq([V.lightPhase(0), V.lightPhase(0.26), V.lightPhase(0.51), V.lightPhase(1.01)], [0, 0, 1, 0],
  'police lights swap every 0.5 s (≤ 3 flashes a second; W1-G bakes phases at t 0.01 / 0.51)');

// ---- drawing through a recording 2D context (no canvas in Node) ------------------------------------------
T.section('drawing (a recording 2D context)');
/** A 2D context stand-in: every call is a no-op, fills and strokes are recorded with their style. */
function fakeCtx() {
  const log = [];
  const stub = new Proxy(function () {}, { get: (t, k) => (k === 'then' ? undefined : stub), apply: () => stub });
  const base = {
    canvas: { width: 1280, height: 720 }, log,
    fillStyle: '#000000', strokeStyle: '#000000', globalAlpha: 1, lineWidth: 1, font: '10px sans-serif', globalCompositeOperation: 'source-over',
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    measureText: (s) => ({ width: String(s).length * 8 }),
    createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }), createPattern: () => null,
    fill() { log.push(['fill', String(this.fillStyle)]); }, stroke() { log.push(['stroke', String(this.strokeStyle)]); },
    fillRect() { log.push(['fill', String(this.fillStyle)]); }, fillText(s) { log.push(['text', String(s)]); },
  };
  return new Proxy(base, { get: (t, k) => (k in t ? t[k] : (typeof k === 'string' ? () => stub : undefined)), set: (t, k, v) => { t[k] = v; return true; } });
}
const fills = (g) => g.log.filter((e) => e[0] === 'fill').map((e) => e[1].toUpperCase());
const RA = load({ mode: 'all', extra: MINE_PURE });
const SA = RA.SR, SS = SA.art.stick, VV = SA.art.vehicles, DD = SA.art.draw;
const warnAll = [];
console.warn = (msg) => warnAll.push(String(msg));
let threw = [];
try {
  // every clip × facing × view, with every named look
  Object.keys(SS.clips).forEach((c) => ['down', 'right', 'up', 'left'].forEach((f) => ['city', 'side'].forEach((view) => {
    try { SS.draw(fakeCtx(), c, { view, facing: f, t: 0.3, look: 'harold', mood: 'happy' }); } catch (e) { threw.push(c + ' ' + f + ' ' + view + ': ' + e.message); }
  })));
  Object.keys(SS.looks).forEach((id) => { try { SS.draw(fakeCtx(), 'idle', { look: id, t: 0 }); SA.art.portraits.draw(fakeCtx(), id, 56, 'angry'); } catch (e) { threw.push(id + ': ' + e.message); } });
  VV.TYPES.forEach((ty) => { for (let d = 0; d < 8; d++) { try { VV.draw(fakeCtx(), ty, d, 0, 0, { t: 0.4, driver: true, brake: true, lights: true }); } catch (e) { threw.push(ty + ' ' + d + ': ' + e.message); } } });
  SA.art.interior.types().forEach((ty) => {
    try {
      const r = SA.art.interior.fromDef('node_' + ty, { window: { x: 60, y: 90, w: 200, h: 140 }, props: [{ type: ty, x: 200, y: 560 }], owner: { id: 'mel', x: 360, y: 430 }, you: { x: 250, y: 560 } });
      r.drawStatic(fakeCtx(), null); r.drawAnim(fakeCtx(), 1.3, null, { owner: { pose: 'react-happy' } });
    } catch (e) { threw.push('prop ' + ty + ': ' + e.message); }
  });
  SA.art.bible.draw(fakeCtx());
  SA.art.logo.draw(fakeCtx(), 0.6);
  DD.stamp(fakeCtx(), 'FLATLINED', 100, 100);
} catch (e) { threw.push(e.stack); }
T.eq(threw, [], 'every clip, facing, view, look, portrait, vehicle, prop type, the bible, the logo and the stamp draw without throwing');

// a name that is both a pose and a clip: the still pose without t, the clip over time with t
const hand = (pose, o) => SS.joints(pose, o).handR.map((v) => +v.toFixed(3));
T.eq(hand('punch', {}), hand(SS.poses.punch, {}), 'draw / joints: "punch" without t is the still punch pose');
T.ok(JSON.stringify(hand('punch', { t: 0 })) !== JSON.stringify(hand('punch', { t: 0.19 })), 'draw / joints: "punch" with t plays the punch clip');
T.eq(hand('punch', { t: 0 }), hand(SS.poses.guard, {}), 'the punch clip starts from guard');

// the player's own look: the accessory chosen in the New Game wizard shows without a look option
SA.state = { player: { look: { acc: 'tophat' } }, stats: { karma: 0 } };
const withHat = fakeCtx();
SS.draw(withHat, 'idle', { player: true, t: 0 });
T.ok(fills(withHat).includes(DD.color('acc.black').toUpperCase()), 'player: true without a look draws the player\'s own accessory (a top hat)');
T.ok(fills(withHat).includes(SS.karmaColor(0).toUpperCase()), '… with the karma-coloured head');
SA.state = null;

// unknown person ids: warned once, cached (no allocation per frame)
const u1 = SS.look('no_such_person'), u2 = SS.look('no_such_person');
T.ok(u1 === u2, 'an unknown person id is normalised once and cached');
T.eq(warnAll.filter((w) => /unknown person "no_such_person"/.test(w)).length, 1, 'an unknown person id warns once');

// every fighter of data/fighters.js: its palette key and accessory resolve (no warning)
const fightWarn = [];
Object.keys(SA.reg.fighter || {}).forEach((id) => {
  const f = SA.reg.fighter[id];
  if (DD.color(f.palette) === f.palette) fightWarn.push(id + ': palette ' + f.palette);
  if (!SS.accessory(f.accessory)) fightWarn.push(id + ': accessory ' + f.accessory);
  if (!SS.look(id).names.includes(SS.accessory(f.accessory))) fightWarn.push(id + ': look lacks ' + f.accessory);
});
T.ok(Object.keys(SA.reg.fighter || {}).length >= 12, Object.keys(SA.reg.fighter || {}).length + ' fighters in data/fighters.js');
T.eq(fightWarn, [], 'every fighter\'s palette key and accessory resolve, and its look wears the accessory');

// every furniture piece of data/furniture.js has a kit prop and an icon
const furnMiss = [];
Object.keys(SA.reg.furniture || {}).forEach((id) => {
  const f = SA.reg.furniture[id];
  const before = warnAll.length;
  SA.art.interior.fromDef('furn_' + id, { props: [{ type: f.draw || id, x: 100, y: 600 }] }).drawStatic(fakeCtx(), null);
  if (warnAll.slice(before).some((w) => /unknown prop type/.test(w))) furnMiss.push(id + ': prop ' + (f.draw || id));
  if (f.icon && typeof SA.reg.icon[f.icon] !== 'function') furnMiss.push(id + ': icon ' + f.icon);
});
T.ok(Object.keys(SA.reg.furniture || {}).length >= 14, Object.keys(SA.reg.furniture || {}).length + ' furniture pieces in data/furniture.js');
T.eq(furnMiss, [], 'every furniture piece (B-08b, tier 1 and tier 2) draws as a kit prop and has an icon');
T.ok(SA.art.interior.types().includes('workstation'), 'the tier-2 workstation is its own prop (not the PC again)');

// vehicles: the driver of a closed car shows (the karma-coloured head), a driver with a look is an NPC
const karmaHead = SS.karmaColor(40).toUpperCase();
const seen = [];
for (let d = 0; d < 8; d++) { const g = fakeCtx(); VV.draw(g, 'junker', d, 0, 0, { t: 0, driver: { karma: 40 } }); seen.push(fills(g).includes(karmaHead)); }
T.ok(seen.filter(Boolean).length >= 6, 'the player shows through the junker\'s glass in ' + seen.filter(Boolean).length + ' of 8 directions', seen);
const npc = fakeCtx();
VV.draw(npc, 'taxi', 2, 0, 0, { t: 0, driver: { look: 3, karma: 40 } });
T.ok(!fills(npc).includes(karmaHead) && fills(npc).includes(SS.look(3).headCol.toUpperCase()), 'a driver with a look is an NPC (its own head colour, not the karma band)');
const policeAt = (t) => { const g = fakeCtx(); VV.draw(g, 'police', 2, 0, 0, { t, flashReduction: false }); return fills(g).join(); };
T.ok(policeAt(0.01) !== policeAt(0.51), 'the police light bar alternates between t 0.01 and 0.51');
const sk = fakeCtx();
VV.skid(sk, 'sedan', 0, 0, 0, 80, 0.8);
T.ok(sk.log.some((e) => e[0] === 'stroke' && e[1].toUpperCase() === DD.color('car.skid').toUpperCase()), 'skid marks (ART_AUDIO §8) stroke in car.skid');
const steadyAt = (t) => { const g = fakeCtx(); VV.draw(g, 'police', 2, 0, 0, { t, flashReduction: true }); return fills(g).join(); };
T.ok(steadyAt(0.01) === steadyAt(0.51), 'with Flash Reduction the light bar is steady');

// interiors: a tall floor prop in front of a window is drawn again over the live sky
const winDef = { window: { x: 60, y: 90, w: 220, h: 150 }, props: [{ type: 'shelf', x: 120, y: 420, h: 260 }, { type: 'plant', x: 600, y: 600 }] };
const anim = fakeCtx();
SA.art.interior.fromDef('node_window', winDef).drawAnim(anim, 0.5, null, {});
const wood = DD.color('kit.wood').toUpperCase();
T.ok(fills(anim).includes(wood), 'a tall shelf standing in front of the window is redrawn over the live sky each frame');
const anim2 = fakeCtx();
SA.art.interior.fromDef('node_window2', { window: winDef.window, props: [{ type: 'shelf', x: 700, y: 420 }] }).drawAnim(anim2, 0.5, null, {});
T.ok(!fills(anim2).includes(wood), 'a shelf clear of the window stays in the cached static layer');
console.warn = origWarn;
T.eq(warnAll.filter((w) => /palette key|unknown accessory|unknown prop|unknown icon/.test(w)), [], 'no palette, accessory, prop or icon warning while drawing');
T.done();
