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
T.done();
