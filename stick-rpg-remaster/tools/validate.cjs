// tools/validate.cjs — owner: W1-Q. The content validator of ARCHITECTURE §18 (BUILD_PLAN §3.11;
// CONTRACT §3.5 D28): loads mode `all` (plus js/audio/music.js for SR.audio.validate, D31) in Node
// and checks what no boot hook may check, because it crosses owners:
//   - load and registration errors (DOM at load time, duplicate ids, bad defs), boot-hook failures;
//   - every id reference resolves: text keys, icons, sfx, songs, skins and engines, sub-screens
//     (the frozen ids of CONTRACT §10), buildings, actions, named fns, items, jobs, homes,
//     furniture, perks, achievements, feature flags, palette keys (D32), tuning paths, cities;
//   - only known condition and effect names (SR.rules.conditions.names / effects.names), known
//     rule events for `emit` and arc stages (§9.1), known HP-0 causes for `hurt`;
//   - `p` on every def of the flagged kinds and `feature` (a known flag) on every def with p ≥ 1;
//   - `repeatable` only where allowed; every HP-costing voluntary def has `hpAbove` ≥ its worst case;
//   - text only in js/data/text/en-*.js; text length limits by prefix (GDD §6.11);
//   - song and sfx data formats (SR.audio.validate, with a structural fallback while it is a stub);
//   - arc stages reachable; `open` actions have their `:resolve`;
//   - no colour literal (#rgb…, rgb(, rgba(, hsl(, hsla() in js/** or css/** outside
//     js/art/palette.js and css/tokens.css; no Math.random in the pure files (rules and data).
//
//   node tools/validate.cjs                strict: every problem is an error (the release gate)
//   node tools/validate.cjs --wave N       during wave N: a reference whose owner file is still a
//                                          stub (the `/* stub, owner: … */` marker) is a warning
//   options: --root <dir> (validate another tree; its own tests/node/load.cjs loads it), --json,
//            --quiet (errors only), --selftest (plants each kind of error and checks it is caught)
//
//   const { validate } = require('./tools/validate.cjs');
//   validate({ root, wave, plant: { 'js/data/x.js': code }, isStub(rel) }) → { errors, warnings, info }
'use strict';
const fs = require('fs');
const path = require('path');
const S = require('./shingles.cjs');

const ROOT = path.resolve(__dirname, '..');

// ------------------------------------------------------------------------------------------------
// Frozen vocabularies (CONTRACT §8-§14)

const RULE_EVENTS = ['enter', 'talk', 'gift', 'buy', 'sell', 'eat', 'shift', 'train', 'promote', 'graduate', 'night', 'trip',
  'rob', 'jail', 'release', 'fight', 'gamble', 'fall', 'carHit', 'carCrash', 'down', 'loan', 'home', 'election', 'decree',
  'encounter', 'scrap', 'stat'];
const GROUPS = ['eat', 'buy', 'work', 'train', 'services', 'crime', 'special'];
const OWNERS = ['world', 'bag', 'phone', 'jail', 'trip', 'hospital'];
const TIME_RULES = ['robbery', 'trip', 'free'];
const ENGINES = ['fight', 'darts', 'slots', 'blackjack', 'roulette', 'scratch', 'shiftrush', 'timingring', 'duel'];
const HP_CAUSES = ['fall', 'carHit', 'carCrash', 'fight', 'mugger', 'goons', 'other'];
const INVOLUNTARY = ['fall', 'carHit', 'carCrash', 'fight', 'mugger', 'goons'];   // CONTRACT §8.2: exempt from hpAbove
const LIMITS = { act: 28, bark: 60, toast: 80, greet: 140, news: 220, vm: 280, card: 400 };
const BUSES = ['music', 'sfx', 'ambience', 'ui', 'voice'];
const PRESETS = ['bass', 'slap', 'lead', 'whistle', 'keys', 'clav', 'pluck', 'pad', 'brass', 'bell', 'vibes', 'organ', 'harmonica', 'kit'];
// Kinds whose every def carries p (BUILD_PLAN Appendix B); any def that has p ≥ 1 needs feature.
const P_KINDS = ['action', 'item', 'subscreen', 'decree', 'perk', 'achievement', 'encounter', 'event', 'arc', 'contact'];
// CONTRACT §10: the frozen sub-screen ids and their files.
const SUBSCREENS = {
  'bank.deposit': 'bank', 'bank.withdraw': 'bank', 'bank.loan': 'bank', 'bank.rates': 'bank', 'bank.cds': 'bank',
  'bank.realestate': 'realestate', 'nli.jobs': 'jobs', 'home.stocks': 'stocks', 'home.tv': 'tv', 'home.messages': 'messages',
  'furniture.browse': 'furniture', 'pawn.shop': 'shop', 'uofs.transcript': 'transcript', 'cityhall.campaign': 'campaign',
  'bus.board': 'bus', 'cityhall.mayor': 'mayor', 'casino.vip': 'vip',
};
// Effects and named fns that make an action irreversible (crime, loans, fights, property, election;
// CONTRACT §8.2): such an action may not be `repeatable`.
const IRREVERSIBLE_EMITS = ['rob', 'jail', 'fight', 'loan', 'home', 'election', 'decree', 'trip'];
const IRREVERSIBLE_FN = /^(crime|trade|fight|election)\.|^bank\.(loan|repay|openCd|breakCd)$|^homes\.(buy|sell|moveIn|letOut|endLet|buyFurniture|upgrade)$/;

// ------------------------------------------------------------------------------------------------
// The text-key owner map (CONTRACT §7; the --wave downgrade follows it). A key's first two
// segments decide its file.

const T = (name) => 'js/data/text/' + name + '.js';
const BUILDING_TEXT = {
  home: 'en-home', mcsticks: 'en-food', store: 'en-food', pawn: 'en-goods', furniture: 'en-goods', bank: 'en-money',
  nli: 'en-money', uofs: 'en-civic', cityhall: 'en-civic', bar: 'en-night', casino: 'en-night', bus: 'en-transit',
  trip: 'en-transit', jail: 'en-transit', hospital: 'en-transit', street: 'en-street', harold: 'en-street', kid: 'en-street',
  dealer: 'en-street', junker: 'en-street', park: 'en-park', world: 'en-world', bag: 'en-pocket', phone: 'en-pocket',
};
const MODULE_TEXT = {
  stats: 'en-prog', perks: 'en-prog', time: 'en-prog', act: 'en-prog', jobs: 'en-econ', training: 'en-econ', night: 'en-econ',
  health: 'en-econ', homes: 'en-econ', stocks: 'en-econ', crime: 'en-conflict', trade: 'en-conflict', fight: 'en-conflict',
  election: 'en-conflict',
};
const MG_TEXT = {
  frame: 'en-ui', shiftrush: 'en-ui', timingring: 'en-ui', duel: 'en-ui', fight: 'en-night', darts: 'en-night', slots: 'en-night',
  blackjack: 'en-night', roulette: 'en-night', scratch: 'en-food', orderup: 'en-food', holdup: 'en-food', sortit: 'en-money',
  pitch: 'en-money', boardroom: 'en-money', debate: 'en-civic', hotwire: 'en-street', interview: 'en-events',
  interrogation: 'en-events', tourhook: 'en-transit',
};
const NPC_TEXT = {
  harold: 'en-street', kid: 'en-street', skid: 'en-street', dealer: 'en-street', red: 'en-street', newguy: 'en-street',
  junker: 'en-street', mcholland: 'en-street', mel: 'en-food', dee: 'en-food', vinnie: 'en-goods', sofia: 'en-goods',
  penny: 'en-money', bea: 'en-money', gil: 'en-money', frankie: 'en-money', terry: 'en-money', quill: 'en-civic',
  plume: 'en-civic', board: 'en-civic', doodle: 'en-civic', crayon: 'en-civic', sticky: 'en-night', lou: 'en-night',
  tabby: 'en-transit', crease: 'en-park', margin: 'en-park', preacher: 'en-park', ori: 'en-world',
};

/** @returns {string|null} the root-relative text file that owns a key, by its prefix (CONTRACT §7). */
function textOwner(key) {
  const seg = String(key).split('.');
  const a = seg[0];
  const b = seg[1];
  let f = null;
  if (a === 'game' || a === 'ui' || a === 'hud' || a === 'set' || a === 'key' || a === 'cap') f = 'en-ui';
  else if (a === 'mg') f = MG_TEXT[b] || null;
  else if (a === 'reason' || a === 'perk' || a === 'ach' || a === 'advisor') f = 'en-prog';
  else if (['item', 'job', 'home', 'furn', 'stock', 'rank', 'report'].indexOf(a) >= 0) f = 'en-econ';
  else if (['city', 'fighter', 'decree', 'crime', 'trip'].indexOf(a) >= 0) f = 'en-conflict';
  else if (a === 'place' || a === 'door' || a === 'ori') f = 'en-world';
  else if (a === 'news') f = 'en-news';
  else if (a === 'tv') f = 'en-home';
  else if (a === 'front') f = 'en-front';
  else if (a === 'enc' || a === 'arc' || a === 'event') f = 'en-events';
  else if (a === 'taunt') f = 'en-night';
  else if (a === 'contact' || a === 'pocket') f = 'en-pocket';
  else if (a === 'sub' || a === 'act' || a === 'desc' || a === 'greet' || a === 'card') f = BUILDING_TEXT[b] || null;
  else if (a === 'toast' || a === 'stamp') f = MODULE_TEXT[b] || BUILDING_TEXT[b] || null;
  else if (a === 'bark') f = b === 'ped' ? 'en-city' : NPC_TEXT[b] || null;
  else if (a === 'vm') f = b === 'carhit' ? 'en-city' : NPC_TEXT[b] || null;
  return f ? T(f) : null;
}

// ------------------------------------------------------------------------------------------------
// Helpers

const hasOwn = (o, k) => o !== null && o !== undefined && Object.prototype.hasOwnProperty.call(o, k);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);
const short = (v) => { try { const s = JSON.stringify(v); return s && s.length > 80 ? s.slice(0, 77) + '...' : s; } catch (e) { return String(v); } };
const KEY_RE = /^[a-z][A-Za-z0-9_]*(\.[A-Za-z0-9_-]+)+$/;
const COLOUR_RE = /^(#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})|(rgba?|hsla?)\([^)]*\)|transparent)$/i;
const COLOUR_LITERALS = [/#[0-9a-fA-F]{3,8}\b/, /\brgba?\(/i, /\bhsla?\(/i];
const COLOUR_EXEMPT = ['js/art/palette.js', 'css/tokens.css'];
const PURE = [/^js\/boot\//, /^js\/core\/rng\.js$/, /^js\/core\/text\.js$/, /^js\/rules\//, /^js\/data\//];
const STUB_RE = /\/\*\s*stub, owner:\s*([^*]+?)\s*\*\//;

// Fields whose string values are text keys; arrays of text keys; palette-key fields.
const TEXT_FIELDS = ['name', 'label', 'desc', 'info', 'confirm', 'title', 'blurb', 'wants', 'quirkText', 'company', 'place', 'caption', 'sign', 'greeting', 'headline'];
const TEXT_ARRAYS = ['greetings', 'taunts', 'barks'];
const PALETTE_FIELDS = ['palette', 'color', 'colour', 'colors', 'colours', 'col', 'alt', 'trim', 'fill', 'stroke', 'tint'];
const LIST_FIELDS = ['requires', 'hidden', 'effects', 'when', 'conditions', 'unlock', 'cond', 'night', 'win', 'lose'];

// ------------------------------------------------------------------------------------------------

/**
 * Validates a tree.
 * @param {object=} opts root (default this project), wave (null = strict), plant ({ rel: code }:
 *   extra virtual files run after the real ones and scanned like them; selftest), isStub (rel → bool)
 * @returns {{errors: object[], warnings: object[], info: string[], stats: object}}
 */
function validate(opts) {
  opts = opts || {};
  const root = opts.root ? path.resolve(opts.root) : ROOT;
  const wave = opts.wave === undefined || opts.wave === null || opts.wave === false ? null : Number(opts.wave);
  const plant = opts.plant || {};
  const out = { errors: [], warnings: [], info: [], stats: {} };
  const err = (check, where, msg) => out.errors.push({ check, where, msg });
  const warn = (check, where, msg) => out.warnings.push({ check, where, msg });

  // ---- files and stubs
  const read = (rel) => (hasOwn(plant, rel) ? plant[rel] : fs.readFileSync(path.join(root, rel), 'utf8'));
  const stubCache = {};
  const stubInfo = (rel) => {
    if (hasOwn(stubCache, rel)) return stubCache[rel];
    let info;
    if (opts.isStub && opts.isStub(rel) !== undefined) info = { exists: true, stub: !!opts.isStub(rel), owner: '' };
    else {
      let src = null;
      try { src = read(rel); } catch (e) { src = null; }
      const m = src !== null ? STUB_RE.exec(src) : null;
      info = { exists: src !== null, stub: !!m, owner: m ? m[1] : '' };
    }
    stubCache[rel] = info;
    return info;
  };

  /** A reference that does not resolve: a warning under --wave when its owner file is still a stub. */
  const missing = (check, where, what, ownerRel) => {
    const owners = list(ownerRel).filter(Boolean);
    const infos = owners.map((r) => [r, stubInfo(r)]);
    const stubby = infos.find((x) => x[1].exists && x[1].stub);
    if (wave !== null && stubby) {
      warn(check, where, what + ' (its owner ' + stubby[0] + ' is still a stub' + (stubby[1].owner ? ', ' + stubby[1].owner : '') + ')');
      return;
    }
    const hint = owners.length ? ' (expected in ' + owners.join(' or ') + (infos.every((x) => !x[1].exists) ? ', which does not exist' : '') + ')' : '';
    err(check, where, what + hint);
  };

  // ---- load (mode all + the song/sfx format validator), planted files, boot
  let L;
  try { L = require(path.join(root, 'tests', 'node', 'load.cjs')); } catch (e) {
    err('load', 'tests/node/load.cjs', 'cannot load the Node loader: ' + e.message);
    return finish(out);
  }
  const logs = { warn: [], error: [] };
  const quietConsole = {
    log() {}, info() {}, debug() {}, trace() {},
    warn(...a) { logs.warn.push(a.map(String).join(' ')); },
    error(...a) { logs.error.push(a.map((x) => (x && x.stack) || String(x)).join(' ')); },
  };
  let files;
  try { files = L.files('all'); } catch (e) { err('load', 'index.html', e.message); return finish(out); }
  const extra = ['js/audio/music.js'].filter((f) => files.indexOf(f) < 0 && fs.existsSync(path.join(root, f)));
  const res = L.load({ mode: 'all', extra, boot: false, keepGoing: true, console: quietConsole });
  for (const e of res.errors) err('load', e.file, (e.error && e.error.message) || String(e.error));
  const SR = res.context.SR;
  if (!SR || !SR.registry) { err('load', 'js/boot/namespace.js', 'SR or SR.registry is missing after loading'); return finish(out); }
  for (const rel of Object.keys(plant)) {
    if (!/\.js$/.test(rel) || !/^js\//.test(rel)) continue;
    try { L.run(res.context, plant[rel], rel); } catch (e) { err('load', rel, e.message); }
  }
  for (const e of SR.registry.errors()) err('registry', e.files.join(', ') || '?', e.kind + ' "' + e.id + '": ' + e.message);
  try {
    SR.boot({ headless: true });
  } catch (e) {
    if (!/registration errors/.test(e.message)) err('boot', 'SR.boot({ headless: true })', e.message + (e.cause && e.cause.stack ? '\n' + e.cause.stack.split('\n').slice(0, 3).join('\n') : ''));
  }
  for (const m of logs.error) err('console', 'boot', m.split('\n')[0]);
  for (const m of logs.warn) if (!/^⟦|missing text key/i.test(m)) warn('console', 'boot', m.split('\n')[0]);

  // ---- indexes
  const reg = SR.reg;
  const has = (kind, id) => !!reg[kind] && typeof id === 'string' && hasOwn(reg[kind], id);
  const entries = (kind) => { try { return SR.registry.entries(kind); } catch (e) { return []; } };
  const fileOf = (kind, id) => SR.registry.file(kind, id) || '?';
  const condNames = SR.rules && SR.rules.conditions && Array.isArray(SR.rules.conditions.names) ? SR.rules.conditions.names : null;
  const effNames = SR.rules && SR.rules.effects && Array.isArray(SR.rules.effects.names) ? SR.rules.effects.names : null;
  if (!condNames) warn('vocabulary', 'js/rules/conditions.js', 'SR.rules.conditions.names is missing: condition names are not checked');
  if (!effNames) warn('vocabulary', 'js/rules/effects.js', 'SR.rules.effects.names is missing: effect names are not checked');
  let defaults = null;
  try { if (SR.rules && SR.rules.state && typeof SR.rules.state.create === 'function') defaults = SR.rules.state.create({ seed: 1 }); } catch (e) {
    warn('state', 'js/rules/state.js', 'SR.rules.state.create failed (' + e.message + '): state-key references are not checked');
  }
  const itemKeys = new Set(Object.keys(reg.item || {}));
  if (defaults && defaults.items) Object.keys(defaults.items).forEach((k) => itemKeys.add(k));
  const statKeys = defaults && defaults.stats ? Object.keys(defaults.stats) : ['str', 'int', 'cha', 'karma', 'hp', 'hpMax', 'heat', 'buzz'];
  const tracks = new Set(Object.values(reg.job || {}).map((j) => j && j.track).filter(Boolean));
  const furnIds = new Set();
  Object.values(reg.furniture || {}).forEach((f) => { if (f) { furnIds.add(f.id); if (f.base) furnIds.add(f.base); } });
  const palette = SR.art && SR.art.palette;
  const logKinds = SR.tuning && SR.tuning.news && SR.tuning.news.weights ? SR.tuning.news.weights : null;
  const flags = reg.features || {};

  // ---- reference checks
  const refText = (key, where) => {
    if (typeof key !== 'string' || !key) { err('text', where, 'a text key must be a non-empty string (' + short(key) + ')'); return; }
    if (has('text', key)) return;
    missing('text', where, 'text key "' + key + '" is not registered', textOwner(key));
  };
  const refIcon = (name, where) => {
    if (typeof name !== 'string') return;
    if (!has('icon', name)) missing('icon', where, 'icon "' + name + '" is not registered', 'js/art/icons.js');
  };
  const refSfx = (name, where) => { if (!has('sfx', name)) missing('sfx', where, 'sfx "' + name + '" is not registered', 'js/audio/sfx.js'); };
  const songFile = (id) => 'js/audio/songs/' + String(id).split('.')[0] + '.js';
  const refSong = (id, where) => { if (id && !has('song', id)) missing('song', where, 'song "' + id + '" is not registered', songFile(id)); };
  const fnFiles = (name) => {
    const area = String(name).split('.')[0];
    return ['js/rules/' + area + '.js', 'js/data/actions/' + area + '.js', 'js/data/buildings/' + area + '.js', 'js/data/' + area + '.js']
      .filter((r) => fs.existsSync(path.join(root, r)) || hasOwn(plant, r));
  };
  const refFn = (name, where) => {
    if (typeof name !== 'string') { err('fn', where, 'a named fn must be a string (' + short(name) + ')'); return; }
    if (!has('fn', name)) missing('fn', where, 'named fn "' + name + '" is not registered', fnFiles(name));
  };
  const actionFile = (id) => {
    const area = String(id).split(/[.:]/)[0];
    for (const r of ['js/data/actions/' + area + '.js', 'js/data/buildings/' + area + '.js']) if (fs.existsSync(path.join(root, r))) return r;
    return 'js/data/buildings/' + area + '.js';
  };
  const refAction = (id, where) => { if (!has('action', id)) missing('action', where, 'action "' + id + '" is not registered', actionFile(id)); };
  const refBuilding = (id, where) => { if (!has('building', id)) missing('building', where, 'building "' + id + '" is not registered', 'js/data/buildings/' + id + '.js'); };
  const refKind = (kind, file) => (id, where) => { if (!has(kind, id)) missing(kind, where, kind + ' "' + id + '" is not registered', file); };
  const refPerk = refKind('perk', 'js/data/perks.js');
  const refAch = refKind('achievement', 'js/data/achievements.js');
  const refCity = refKind('city', 'js/data/cities.js');
  const refHome = (id, where) => { if (!has('home', id)) missing('home', where, 'home "' + id + '" is not registered', 'js/data/homes.js'); };
  const refJob = (id, where) => { if (id !== 'office' && !has('job', id)) missing('job', where, 'job "' + id + '" is not registered', 'js/data/jobs.js'); };
  const refTrack = (t, where) => { if (tracks.size && !tracks.has(t)) err('job', where, 'job track "' + t + '" is not a track of any job (' + Array.from(tracks).join(', ') + ')'); };
  const refFurn = (id, where) => { if (!furnIds.has(id)) missing('furniture', where, 'furniture "' + id + '" is not registered', 'js/data/furniture.js'); };
  const refFlag = (flag, where) => { if (!hasOwn(flags, flag)) err('feature', where, 'unknown feature flag "' + flag + '" (js/data/features.js)'); };
  const refItemKey = (key, where) => {
    if (!itemKeys.size) return;
    if (typeof key !== 'string' || !itemKeys.has(key)) err('item', where, 'item "' + key + '" is neither a registered item nor a state.items key');
  };
  const refStat = (key, where) => { if (statKeys.indexOf(key) < 0) err('stat', where, 'stat "' + key + '" is not one of ' + statKeys.join(', ')); };
  const refNpc = (npc, where) => { if (defaults && defaults.npc && !hasOwn(defaults.npc, npc)) warn('npc', where, 'npc "' + npc + '" has no state.npc entry'); };
  const refStatePath = (group, key, where) => {
    if (!defaults || !defaults[group] || typeof key !== 'string') return;
    let o = defaults[group];
    for (const s of key.split('.')) o = o && typeof o === 'object' ? o[s] : undefined;
    if (o === undefined) warn('state', where, 'state.' + group + '.' + key + ' is not in the v1 schema');
  };
  const refTuning = (p, where) => {
    if (typeof p !== 'string') return;
    let o = SR.tuning;
    for (const s of p.split('.')) o = o && typeof o === 'object' ? o[s] : undefined;
    if (o === undefined) missing('tuning', where, 'tuning path "' + p + '" does not resolve', 'js/data/tuning.js');
  };
  const refSkinOrEngine = (name, where) => {
    if (ENGINES.indexOf(name) >= 0 || has('skin', name)) return;
    missing('skin', where, 'minigame "' + name + '" is neither an engine nor a registered skin', 'js/minigames/skins/' + name + '.js');
  };
  const refSubscreen = (id, where) => {
    if (has('subscreen', id)) return;
    if (!hasOwn(SUBSCREENS, id) && !/^test\./.test(id)) { err('subscreen', where, 'sub-screen "' + id + '" is not a frozen id (CONTRACT §10)'); return; }
    missing('subscreen', where, 'sub-screen "' + id + '" is not registered', hasOwn(SUBSCREENS, id) ? 'js/ui/subscreens/' + SUBSCREENS[id] + '.js' : null);
  };
  const paletteGet = (key) => {
    let o = palette;
    for (const s of key.split('.')) { if (o === null || o === undefined || typeof o !== 'object') return undefined; o = o[s]; }
    return o;
  };
  const refPalette = (key, where, o) => {
    o = o || {};
    if (typeof key !== 'string') { err('palette', where, 'a palette key must be a string (' + short(key) + ')'); return; }
    if (COLOUR_RE.test(key)) { err('palette', where, 'a colour literal "' + key + '" where a palette key belongs'); return; }
    if (!palette) { missing('palette', where, 'palette key "' + key + '" (SR.art.palette is missing)', 'js/art/palette.js'); return; }
    let v;
    if (key.charAt(0) === '@') {
      const name = key.slice(1);
      v = paletteGet('int.' + (o.interior || 'default') + '.' + name);
      if (v === undefined) v = paletteGet('int.default.' + name);
      if (v === undefined) { missing('palette', where, 'palette key "' + key + '" resolves neither int.' + (o.interior || 'default') + '.' + name + ' nor int.default.' + name, 'js/art/palette.js'); return; }
    } else v = paletteGet(key);
    if (v === undefined) { missing('palette', where, 'palette key "' + key + '" does not resolve', 'js/art/palette.js'); return; }
    if (isObj(v) || Array.isArray(v)) { if (!o.group) err('palette', where, 'palette key "' + key + '" names a group, not a colour'); return; }
    if (typeof v !== 'string' || !COLOUR_RE.test(v)) err('palette', where, 'palette key "' + key + '" is not a colour (' + short(v) + ')');
  };

  // ---- condition and effect lists
  function checkConds(l, where) {
    if (l === undefined || l === null) return;
    if (!Array.isArray(l)) { err('conditions', where, 'a condition list must be an array (' + short(l) + ')'); return; }
    l.forEach((c) => checkCond(c, where));
  }
  function checkCond(c, where) {
    if (typeof c === 'string') c = [c];
    if (!Array.isArray(c) || typeof c[0] !== 'string') { err('conditions', where, 'bad condition ' + short(c)); return; }
    const name = c[0];
    if (condNames && condNames.indexOf(name) < 0) { err('conditions', where, 'unknown condition "' + name + '"'); return; }
    switch (name) {
      case 'not': checkCond(c[1], where); break;
      case 'any': case 'all': checkConds(c[1], where); break;
      case 'fn': refFn(c[1], where); break;
      case 'item': case 'noItem': refItemKey(c[1], where); break;
      case 'stat': case 'statBelow': refStat(c[1], where); break;
      case 'feature': refFlag(c[1], where); break;
      case 'job': case 'jobAtLeast': refJob(c[1], where); break;
      case 'jobTrack': refTrack(c[1], where); break;
      case 'livesIn': case 'owns': refHome(c[1], where); break;
      case 'furniture': refFurn(c[1], where); break;
      case 'perk': refPerk(c[1], where); break;
      case 'npcStage': refNpc(c[1], where); break;
      case 'dailyBelow': refStatePath('daily', c[1], where); break;
      case 'weeklyBelow': refStatePath('weekly', c[1], where); break;
      case 'difficulty':
        if (SR.tuning && SR.tuning.difficulty) list(c[1]).forEach((d) => { if (!hasOwn(SR.tuning.difficulty, d)) err('conditions', where, 'unknown difficulty "' + d + '"'); });
        break;
      case 'weather':
        if (SR.tuning && SR.tuning.weather && Array.isArray(SR.tuning.weather.states)) list(c[1]).forEach((w) => { if (SR.tuning.weather.states.indexOf(w) < 0) err('conditions', where, 'unknown weather "' + w + '"'); });
        break;
      default: break;
    }
  }
  function checkEffects(l, where) {
    if (l === undefined || l === null) return;
    if (!Array.isArray(l)) { err('effects', where, 'an effect list must be an array (' + short(l) + ')'); return; }
    l.forEach((e) => checkEffect(e, where));
  }
  function checkEffect(e, where) {
    if (typeof e === 'string') e = [e];
    if (!Array.isArray(e) || typeof e[0] !== 'string') { err('effects', where, 'bad effect ' + short(e)); return; }
    const name = e[0];
    if (effNames && effNames.indexOf(name) < 0) { err('effects', where, 'unknown effect "' + name + '"'); return; }
    switch (name) {
      case 'chance': checkEffects(e[2], where); checkEffects(e[3], where); break;
      case 'check': refStat(e[2], where); checkEffects(e[4], where); checkEffects(e[5], where); break;
      case 'fn': refFn(e[1], where); break;
      case 'item': refItemKey(e[1], where); break;
      case 'stat': refStat(e[1], where); break;
      case 'sfx': refSfx(e[1], where); break;
      case 'toast': case 'stamp': case 'msg': refText(e[1], where); break;
      case 'open': refSkinOrEngine(e[1], where); break;
      case 'emit': if (RULE_EVENTS.indexOf(e[1]) < 0) err('events', where, 'emit "' + e[1] + '" is not a rule event (CONTRACT §9.1)'); break;
      case 'achievement': refAch(e[1], where); break;
      case 'hurt': if (e[2] !== undefined && HP_CAUSES.indexOf(e[2]) < 0) err('effects', where, 'hurt cause "' + e[2] + '" is not one of ' + HP_CAUSES.join(', ')); break;
      case 'npcStage': refNpc(e[1], where); break;
      case 'daily': refStatePath('daily', e[1], where); break;
      case 'weekly': refStatePath('weekly', e[1], where); break;
      case 'log': if (logKinds && !hasOwn(logKinds, e[1])) warn('log', where, 'log kind "' + e[1] + '" has no weight in tuning.news.weights'); break;
      default: break;
    }
  }
  /** Walks an effect list (branches included). */
  function eachEffect(l, fn) {
    list(l).forEach((e) => {
      if (typeof e === 'string') e = [e];
      if (!Array.isArray(e)) return;
      fn(e);
      if (e[0] === 'chance') { eachEffect(e[2], fn); eachEffect(e[3], fn); }
      if (e[0] === 'check') { eachEffect(e[4], fn); eachEffect(e[5], fn); }
    });
  }
  /** @returns {number} the worst-case voluntary HP loss of an effect list (Infinity when a fn computes it). */
  function worstHurt(l) {
    let sum = 0;
    list(l).forEach((e) => {
      if (typeof e === 'string' || !Array.isArray(e)) return;
      if (e[0] === 'hurt' && INVOLUNTARY.indexOf(e[2]) < 0) sum += typeof e[1] === 'number' ? Math.max(0, e[1]) : Infinity;
      else if (e[0] === 'chance') sum += Math.max(worstHurt(e[2]), worstHurt(e[3]));
      else if (e[0] === 'check') sum += Math.max(worstHurt(e[4]), worstHurt(e[5]));
    });
    return sum;
  }
  function findHpAbove(l) {
    let found = null;
    list(l).forEach((c) => {
      if (typeof c === 'string') c = [c];
      if (!Array.isArray(c)) return;
      if (c[0] === 'hpAbove' && found === null) found = c[1];
      if (c[0] === 'all' && found === null) found = findHpAbove(c[1]);
    });
    return found;
  }

  /** Generic field checks: text keys, icons, palette keys, tuning paths; lists handled by the caller. */
  function scanFields(obj, where, o, depth) {
    o = o || {};
    depth = depth || 0;
    if (depth > 6 || obj === null || typeof obj !== 'object') return;
    if (Array.isArray(obj)) { obj.forEach((v, k) => scanFields(v, where + '[' + k + ']', o, depth + 1)); return; }
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      const w = where + '.' + k;
      if (typeof v === 'function') continue;
      if (LIST_FIELDS.indexOf(k) >= 0 && Array.isArray(v)) continue;
      if (TEXT_FIELDS.indexOf(k) >= 0 && typeof v === 'string' && !o.noText) {
        if (KEY_RE.test(v)) refText(v, w);
        else if (/\s|[A-Z]/.test(v)) warn('text', w, 'literal text "' + v.slice(0, 40) + '"; use a text key (SR.text)');
        continue;
      }
      if (k === 'text' && !o.noText) {
        if (typeof v === 'string') { if (KEY_RE.test(v)) refText(v, w); else if (/\s/.test(v)) warn('text', w, 'literal text "' + v.slice(0, 40) + '"; use a text key'); continue; }
        if (isObj(v)) { Object.keys(v).forEach((kk) => { if (typeof v[kk] === 'string') refText(v[kk], w + '.' + kk); }); continue; }
      }
      if (TEXT_ARRAYS.indexOf(k) >= 0 && Array.isArray(v) && !o.noText) {
        v.forEach((x, j) => { if (typeof x === 'string') refText(x, w + '[' + j + ']'); else if (Array.isArray(x)) x.forEach((y) => typeof y === 'string' && refText(y, w + '[' + j + ']')); });
        continue;
      }
      if (k === 'icon' && typeof v === 'string') { refIcon(v, w); continue; }
      if (k === 'tuning' && typeof v === 'string') { refTuning(v, w); continue; }
      if (PALETTE_FIELDS.indexOf(k) >= 0 && !o.noPalette) {
        if (typeof v === 'string') { if (v !== 'none') refPalette(v, w, { group: k === 'palette', interior: o.interior }); continue; }
        if (isObj(v)) { Object.keys(v).forEach((kk) => { if (typeof v[kk] === 'string') refPalette(v[kk], w + '.' + kk, { interior: o.interior }); }); continue; }
      }
      if (o.interior && typeof v === 'string' && palette && (v.charAt(0) === '@' || (v.indexOf('.') > 0 && hasOwn(palette, v.split('.')[0]) && isObj(palette[v.split('.')[0]])))) {
        refPalette(v, w, { interior: o.interior });
        continue;
      }
      if (typeof v === 'object') scanFields(v, w, o, depth + 1);
    }
  }

  // ---- p and feature on every def
  const idKinds = SR.registry.kinds.filter((k) => ['tuning', 'features', 'text', 'worldmap', 'fn'].indexOf(k) < 0);
  const checkP = (def, kind, where) => {
    if (!isObj(def)) return;
    if (P_KINDS.indexOf(kind) >= 0 && def.p === undefined) err('p', where, 'no p (the priority tag, GDD §0)');
    if (def.p !== undefined && [0, 1, 2].indexOf(def.p) < 0) err('p', where, 'p must be 0, 1 or 2 (' + short(def.p) + ')');
    if (def.p >= 1 && !def.feature) err('feature', where, 'p ' + def.p + ' without a feature flag (BUILD_PLAN Appendix B)');
    if (def.feature !== undefined && def.feature !== null) refFlag(def.feature, where);
  };
  for (const kind of idKinds) for (const e of entries(kind)) checkP(e.def, kind, kind + ' "' + e.id + '" (' + e.file + ')');

  // ---- actions
  const openActions = [];
  for (const e of entries('action')) {
    const d = e.def;
    const where = 'action "' + e.id + '" (' + e.file + ')';
    if (!isObj(d)) continue;
    const resolve = /:resolve$/.test(e.id);
    const b = d.building;
    if (typeof b !== 'string' || !b) err('action', where, 'no building');
    else if (OWNERS.indexOf(b) < 0 && !/^(street|park|enc):[\w-]+$/.test(b)) refBuilding(b, where);
    if (!resolve) {
      if (GROUPS.indexOf(d.group) < 0) err('action', where, 'group "' + d.group + '" is not one of ' + GROUPS.join(', '));
      if (d.label === undefined) err('action', where, 'no label (a text key act.*)');
    } else if (d.timeRule !== 'free') err('action', where, 'a :resolve action has timeRule "free" (CONTRACT §8.2)');
    if (typeof d.label === 'string' && has('text', d.label)) {
      const v = list(reg.text[d.label]);
      v.forEach((s) => { if (Array.from(s).length > LIMITS.act) err('length', where, 'label "' + d.label + '" is ' + Array.from(s).length + ' characters (≤ ' + LIMITS.act + ')'); });
    }
    if (d.timeRule !== undefined && TIME_RULES.indexOf(d.timeRule) < 0) err('action', where, 'timeRule "' + d.timeRule + '" is not one of ' + TIME_RULES.join(', '));
    if (d.cost !== undefined) {
      if (!isObj(d.cost)) err('action', where, 'cost must be an object');
      else {
        ['cash', 'min', 'hp'].forEach((k) => { const v = d.cost[k]; if (typeof v === 'string') refFn(v, where + '.cost.' + k); else if (v !== undefined && typeof v !== 'number') err('action', where, 'cost.' + k + ' must be a number or a named fn'); });
        if (d.cost.items !== undefined) { if (!isObj(d.cost.items)) err('action', where, 'cost.items must be an object'); else Object.keys(d.cost.items).forEach((k) => refItemKey(k, where + '.cost.items')); }
      }
    }
    checkConds(d.requires, where + '.requires');
    checkConds(d.hidden, where + '.hidden');
    checkEffects(d.effects, where + '.effects');
    if (d.variants !== undefined && !(Array.isArray(d.variants) && d.variants.every((v) => typeof v === 'string'))) err('action', where, 'variants must be an array of strings');
    if (d.minigame !== undefined) {
      if (!isObj(d.minigame) || typeof d.minigame.skin !== 'string') err('action', where, 'minigame must be { skin, auto }');
      else if (d.minigame.skin.indexOf('.') > 0) refFn(d.minigame.skin, where + '.minigame.skin');
      else refSkinOrEngine(d.minigame.skin, where + '.minigame.skin');
    }
    if (d.screen !== undefined) refSubscreen(d.screen, where + '.screen');
    scanFields(d, where);
    // repeatable only where allowed (CONTRACT §8.2)
    if (d.repeatable) {
      const why = [];
      if (d.confirm) why.push('confirm');
      if (d.minigame) why.push('minigame');
      if (d.screen) why.push('screen');
      if (d.group === 'crime') why.push('group crime');
      if (d.timeRule === 'robbery' || d.timeRule === 'trip') why.push('timeRule ' + d.timeRule);
      eachEffect(d.effects, (x) => {
        if (x[0] === 'jail' || x[0] === 'open') why.push('effect ' + x[0]);
        if (x[0] === 'emit' && IRREVERSIBLE_EMITS.indexOf(x[1]) >= 0) why.push('emit ' + x[1]);
        if (x[0] === 'fn' && IRREVERSIBLE_FN.test(String(x[1]))) why.push('fn ' + x[1]);
      });
      if (why.length) err('repeatable', where, 'repeatable is not allowed with ' + Array.from(new Set(why)).join(', ') + ' (CONTRACT §8.2)');
    }
    // HP costs of voluntary actions need hpAbove ≥ the worst case (CONTRACT §8.2)
    if (b !== 'world' && !resolve) {
      const costHp = d.cost && d.cost.hp !== undefined ? (typeof d.cost.hp === 'number' ? Math.max(0, d.cost.hp) : Infinity) : 0;
      const worst = costHp + worstHurt(d.effects);
      if (worst > 0) {
        const hp = findHpAbove(d.requires);
        if (hp === null || hp === undefined) err('hpAbove', where, 'an HP cost (worst case ' + (worst === Infinity ? 'computed' : worst) + ') without ["hpAbove", n]');
        else if (typeof hp === 'number' && worst !== Infinity && hp < worst) err('hpAbove', where, '["hpAbove", ' + hp + '] is below the worst-case HP cost ' + worst);
      }
    }
    let opens = false;
    eachEffect(d.effects, (x) => { if (x[0] === 'open') opens = true; });
    if (opens || d.minigame) openActions.push([e.id, where, e.file]);
    if (typeof b === 'string' && reg.building && hasOwn(reg.building, b) && !resolve && e.id.indexOf(b + '.') !== 0) warn('action', where, 'the id does not start with its building "' + b + '."');
  }
  for (const [id, where, file] of openActions) {
    if (!has('action', id + ':resolve')) missing('action', where, 'opens a minigame but "' + id + ':resolve" is not registered', file);
  }

  // ---- other content kinds
  const simple = ['item', 'job', 'home', 'furniture', 'stock', 'rank', 'perk', 'achievement', 'city', 'fighter', 'person', 'contact', 'skin', 'encounter', 'event', 'decree', 'building'];
  for (const kind of simple) {
    for (const e of entries(kind)) {
      const d = e.def;
      const where = kind + ' "' + e.id + '" (' + e.file + ')';
      if (!isObj(d)) continue;
      scanFields(d, where);
      if (kind === 'item') {
        if (typeof d.use === 'string') refAction(d.use, where + '.use'); else if (Array.isArray(d.use)) checkEffects(d.use, where + '.use');
        // give: the people who accept it (npc ids), or an effect list
        if (Array.isArray(d.give) && d.give.every((x) => typeof x === 'string')) d.give.forEach((npc) => refNpc(npc, where + '.give'));
        else if (Array.isArray(d.give)) checkEffects(d.give, where + '.give');
        else if (typeof d.give === 'string') refNpc(d.give, where + '.give');
      }
      if (kind === 'decree') {
        if (['any', 'president', 'dictator'].indexOf(d.path) < 0) err('decree', where, 'path must be any, president or dictator');
        if (typeof d.once !== 'boolean') err('decree', where, 'once must be a boolean');
        checkEffects(d.effects, where + '.effects');
        checkEffects(d.night, where + '.night');
      }
      if (kind === 'fighter') {
        if (typeof d.palette !== 'string') err('fighter', where, 'palette must be a palette key fighter.<n>');
      }
      if (kind === 'contact') {
        checkConds(d.unlock, where + '.unlock');
        list(d.actions).forEach((a) => refAction(a, where + '.actions'));
      }
      if (kind === 'skin') {
        if (ENGINES.indexOf(d.engine) < 0) err('skin', where, 'engine "' + d.engine + '" is not one of ' + ENGINES.join(', '));
      }
      if (kind === 'encounter' || kind === 'event') {
        checkConds(d.conditions, where + '.conditions');
        checkConds(d.when, where + '.when');
        list(d.choices).forEach((c, k) => { if (isObj(c)) { checkConds(c.requires, where + '.choices[' + k + '].requires'); checkEffects(c.effects, where + '.choices[' + k + '].effects'); } });
      }
      if (kind === 'building') {
        refSong(d.music, where + '.music');
        if (typeof d.interior === 'string' && !has('interior', d.interior)) warn('interior', where, 'interior "' + d.interior + '" is not registered (the kit draws a neutral room)');
        if (typeof d.exteriorId === 'string' && !has('exterior', d.exteriorId)) missing('exterior', where + '.exteriorId', 'exterior "' + d.exteriorId + '" is not registered', 'js/art/exteriors-detail.js');
        list(d.groups).forEach((g) => { if (GROUPS.indexOf(g) < 0) err('building', where, 'group "' + g + '" is not one of ' + GROUPS.join(', ')); });
        if (isObj(d.modes)) Object.keys(d.modes).forEach((m) => { const v = d.modes[m]; list(Array.isArray(v) ? v : v && v.actions).forEach((a) => refAction(a, where + '.modes.' + m)); });
      }
    }
  }

  // ---- arcs: stages, events, reachability
  const npcTargets = {};
  for (const kind of ['action', 'encounter', 'event', 'decree']) {
    for (const e of entries(kind)) {
      const d = e.def;
      if (!isObj(d)) continue;
      const lists = [d.effects].concat(list(d.choices).map((c) => c && c.effects));
      lists.forEach((l) => eachEffect(l, (x) => { if (x[0] === 'npcStage') (npcTargets[x[1]] = npcTargets[x[1]] || new Set()).add(x[2]); }));
    }
  }
  for (const e of entries('arc')) {
    const d = e.def;
    const where = 'arc "' + e.id + '" (' + e.file + ')';
    if (!isObj(d) || !isObj(d.stages)) { err('arc', where, 'stages must be an object { id: { on, match, cond, effects, next } }'); continue; }
    const ids = Object.keys(d.stages);
    const start = typeof d.start === 'string' ? d.start : hasOwn(d.stages, 'start') ? 'start' : ids[0];
    if (!hasOwn(d.stages, start)) err('arc', where, 'start stage "' + start + '" does not exist');
    const next = (st) => { const n = st && st.next; return typeof n === 'string' ? [n] : Array.isArray(n) ? n : isObj(n) ? Object.values(n) : []; };
    ids.forEach((id) => {
      const st = d.stages[id];
      const w = where + '.stages.' + id;
      if (!isObj(st)) { err('arc', w, 'a stage must be an object'); return; }
      if (st.on !== undefined && RULE_EVENTS.indexOf(st.on) < 0) err('arc', w, 'on "' + st.on + '" is not a rule event (CONTRACT §9.1)');
      checkConds(st.cond, w + '.cond');
      checkEffects(st.effects, w + '.effects');
      next(st).forEach((n) => { if (typeof n === 'string' && !hasOwn(d.stages, n)) err('arc', w, 'next "' + n + '" is not a stage'); });
    });
    const seen = new Set([start]);
    const queue = [start];
    const extraTargets = npcTargets[d.npc || e.id] ? Array.from(npcTargets[d.npc || e.id]) : [];
    extraTargets.forEach((s) => { if (!seen.has(s)) { seen.add(s); queue.push(s); } });
    while (queue.length) {
      const id = queue.shift();
      const st = d.stages[id];
      next(st).forEach((n) => { if (typeof n === 'string' && hasOwn(d.stages, n) && !seen.has(n)) { seen.add(n); queue.push(n); } });
      eachEffect(st && st.effects, (x) => { if (x[0] === 'npcStage' && x[1] === (d.npc || e.id) && hasOwn(d.stages, x[2]) && !seen.has(x[2])) { seen.add(x[2]); queue.push(x[2]); } });
    }
    ids.filter((id) => !seen.has(id)).forEach((id) => err('arc', where, 'stage "' + id + '" is unreachable from "' + start + '"'));
  }

  // ---- sub-screens
  for (const e of entries('subscreen')) {
    const d = e.def;
    const where = 'subscreen "' + e.id + '" (' + e.file + ')';
    if (!isObj(d)) continue;
    if (!hasOwn(SUBSCREENS, e.id) && !/^test\./.test(e.id)) warn('subscreen', where, 'not one of the frozen ids of CONTRACT §10 (file a request)');
    if (typeof d.mount !== 'function') err('subscreen', where, 'mount(root, ctx) is missing');
    if (d.title !== undefined) refText(d.title, where + '.title'); else err('subscreen', where, 'no title (a breadcrumb text key)');
  }

  // ---- interiors and exteriors
  for (const e of entries('interior')) {
    const d = e.def;
    const where = 'interior "' + e.id + '" (' + e.file + ')';
    if (!isObj(d)) continue;
    scanFields(d, where, { interior: e.id });
    list(d.props).forEach((p, k) => { if (isObj(p) && p.type === 'menuBoard') list(p.items).forEach((it) => refIcon(it, where + '.props[' + k + '].items')); });
  }
  for (const e of entries('exterior')) {
    const d = e.def;
    const where = 'exterior "' + e.id + '" (' + e.file + ')';
    if (!isObj(d)) continue;
    if (d.detail !== undefined && typeof d.detail !== 'function') err('exterior', where, 'detail must be a function (ctx, geom, state)');
    if (d.signature !== undefined && !(Array.isArray(d.signature) && d.signature.every((r) => Array.isArray(r) && r.length === 4 && r.every((x) => typeof x === 'number')))) err('exterior', where, 'signature must be a list of [x0, y0, x1, y1] rects');
  }

  // ---- the palette itself: every leaf a colour (sky keyframes carry the numbers h and light)
  if (palette) {
    let leaves = 0;
    const walkP = (o, p) => {
      if (Array.isArray(o)) { o.forEach((v, k) => walkP(v, p + '.' + k)); return; }
      if (isObj(o)) { Object.keys(o).forEach((k) => walkP(o[k], p ? p + '.' + k : k)); return; }
      if (typeof o === 'number' && /^sky\.\d+\.(h|light)$/.test(p)) return;
      leaves++;
      if (typeof o !== 'string' || !COLOUR_RE.test(o)) err('palette', 'js/art/palette.js', p + ' is not a colour (' + short(o) + ')');
    };
    walkP(palette, '');
    out.stats.paletteLeaves = leaves;
  }

  // ---- tuning: modifier rows
  if (SR.tuning) {
    ['priceMods', 'checkMods'].forEach((tbl) => {
      list(SR.tuning[tbl]).forEach((row, k) => {
        if (!isObj(row)) return;
        const where = 'tuning.' + tbl + '[' + k + '] "' + row.id + '" (js/data/tuning.js)';
        checkConds(row.when, where + '.when');
        if (row.feature !== undefined) refFlag(row.feature, where);
        if (typeof row.value === 'string') refFn(row.value, where + '.value');
      });
    });
  }

  // ---- the worldmap (ARCHITECTURE §8.1; W1-W request 5)
  const wm = reg.worldmap && reg.worldmap.main;
  if (isObj(wm)) {
    const where = 'worldmap (' + fileOf('worldmap', 'main') + ')';
    list(wm.buildings).forEach((b, k) => {
      if (!isObj(b)) return;
      const w = where + '.buildings[' + k + '] ' + b.id;
      if (b.name !== undefined) refText(b.name, w + '.name');
      list(b.homes).forEach((h) => refHome(h, w + '.homes'));
      const x = b.exterior;
      if (isObj(x)) {
        if (x.palette !== undefined) refPalette(x.palette, w + '.exterior.palette', { group: true });
        if (x.sign !== undefined && x.sign !== null) refText(x.sign, w + '.exterior.sign');
        if (typeof x.detail === 'string' && !has('exterior', x.detail)) missing('exterior', w + '.exterior.detail', 'exterior "' + x.detail + '" is not registered', 'js/art/exteriors-detail.js');
      }
    });
    list(wm.interactables).forEach((it, k) => {
      if (!isObj(it)) return;
      const w = where + '.interactables[' + k + '] ' + it.id;
      checkP(it, 'interactable', w);
      if (typeof it.action === 'string') refAction(it.action, w + '.action');
    });
    list(wm.skyIslands).forEach((s, k) => { if (isObj(s) && typeof s.city === 'string') refCity(s.city, where + '.skyIslands[' + k + ']'); });
  }

  // ---- songs and sfx (ART_AUDIO §13.8; SR.audio.validate is W1-S's, D31)
  const audioValidate = SR.audio && typeof SR.audio.validate === 'function' ? SR.audio.validate : null;
  if (!audioValidate && (entries('song').length || entries('sfx').length)) warn('audio', 'js/audio/music.js', 'SR.audio.validate is missing: songs and sfx get the structural fallback check only');
  for (const kind of ['song', 'sfx']) {
    for (const e of entries(kind)) {
      const where = kind + ' "' + e.id + '" (' + e.file + ')';
      let problems = [];
      try { problems = audioValidate ? list(audioValidate(kind, e.def)) : kind === 'song' ? songProblems(e.def) : sfxProblems(e.def); } catch (x) { problems = ['the validator threw: ' + x.message]; }
      problems.forEach((p) => err(kind, where, String(p)));
      if (kind === 'sfx' && isObj(e.def) && e.def.caption !== undefined && e.def.caption !== null) refText(e.def.caption, where + '.caption');
    }
  }

  // ---- text: files, lengths, owners
  const textFileRe = /^js\/data\/text\/en-[\w-]+\.js$/;
  let textCount = 0;
  for (const e of entries('text')) {
    textCount++;
    const where = 'text "' + e.id + '" (' + e.file + ')';
    if (!textFileRe.test(e.file)) err('text', where, 'text is registered only in js/data/text/en-*.js (CONTRACT §7)');
    const owner = textOwner(e.id);
    if (owner && owner !== e.file && textFileRe.test(e.file)) warn('text-owner', where, 'the prefix map gives ' + owner + ' (CONTRACT §7)');
    const lim = LIMITS[e.id.split('.')[0]];
    if (lim) list(e.def).forEach((s, k) => { const n = Array.from(String(s)).length; if (n > lim) err('length', where, (Array.isArray(e.def) ? 'variant ' + k + ' is ' : 'is ') + n + ' characters (≤ ' + lim + ' for ' + e.id.split('.')[0] + '.*)'); });
  }
  out.stats.text = textCount;

  // ---- file scans: colour literals, Math.random in pure files, stubs, index coverage
  const diskFiles = S.walk(root, 'js', ['.js']).concat(S.walk(root, 'css', ['.css']));
  const allFiles = Array.from(new Set(diskFiles.concat(Object.keys(plant).filter((r) => /^(js\/.*\.js|css\/.*\.css)$/.test(r)))));
  const stubs = [];
  for (const rel of allFiles) {
    let src;
    try { src = read(rel); } catch (e) { continue; }
    if (COLOUR_EXEMPT.indexOf(rel) < 0) {
      const lines = src.split('\n');
      let n = 0;
      lines.forEach((ln, k) => {
        const m = COLOUR_LITERALS.map((re) => re.exec(ln)).find(Boolean);
        if (m) { n++; if (n <= 5) err('colour', rel + ':' + (k + 1), 'colour literal "' + m[0] + '" outside js/art/palette.js and css/tokens.css'); }
      });
      if (n > 5) err('colour', rel, (n - 5) + ' more lines with colour literals');
    }
    if (/\.js$/.test(rel) && PURE.some((re) => re.test(rel)) && src.indexOf('random') >= 0) {
      const tok = S.lex(src);
      for (let k = 0; k + 2 < tok.length; k++) {
        if (tok[k].v === 'Math' && tok[k + 1].v === '.' && tok[k + 2].v === 'random') err('random', rel + ':' + tok[k].line, 'Math.random in a pure file (use SR.rng)');
        if (tok[k].v === 'Math' && tok[k + 1].v === '[' && tok[k + 2].t === 's' && tok[k + 2].v === 'random') err('random', rel + ':' + tok[k].line, 'Math.random in a pure file (use SR.rng)');
      }
    }
    const m = STUB_RE.exec(src);
    if (m) stubs.push({ rel, owner: m[1] });
  }
  out.stats.stubs = stubs.length;
  if (wave !== null) {
    const due = stubs.filter((s) => { const w = /W(\d)/.exec(s.owner); return w && Number(w[1]) <= wave; });
    due.forEach((s) => warn('stub', s.rel, 'still a stub (' + s.owner + ') at wave ' + wave));
  }
  let indexList = [];
  try { indexList = L.indexScripts(); } catch (e) { indexList = []; }
  if (indexList.length) {
    diskFiles.filter((r) => /\.js$/.test(r) && indexList.indexOf(r) < 0).forEach((r) => warn('index', r, 'not listed in index.html (it never loads)'));
    indexList.filter((r) => !fs.existsSync(path.join(root, r))).forEach((r) => err('index', 'index.html', 'lists ' + r + ', which does not exist'));
  }
  out.stats.files = allFiles.length;
  out.stats.registrations = SR.registry.kinds.reduce((a, k) => { const n = entries(k).length; if (n) a[k] = n; return a; }, {});
  return finish(out);
}

function finish(out) {
  // one line per distinct problem
  const dedupe = (l) => { const seen = new Set(); return l.filter((x) => { const k = x.check + '|' + x.where + '|' + x.msg; if (seen.has(k)) return false; seen.add(k); return true; }); };
  out.errors = dedupe(out.errors);
  out.warnings = dedupe(out.warnings);
  return out;
}

// ------------------------------------------------------------------------------------------------
// Structural fallback for songs and sfx while SR.audio.validate is a stub (CONTRACT §14.2-§14.3).

function stepCount(str) { return String(str).split(/\s+/).filter((t) => t && t !== '|').length; }

/** @returns {string[]} problems of a song def (the frozen format's structure only). */
function songProblems(d) {
  const p = [];
  if (!isObj(d)) return ['a song must be an object'];
  if (!(typeof d.bpm === 'number' && d.bpm > 0)) p.push('bpm must be a positive number');
  const meter = Array.isArray(d.meter) ? d.meter : [4, 4];
  const spb = d.stepsPerBeat || 4;
  if (!isObj(d.inst)) p.push('inst must be an object of tracks');
  else Object.keys(d.inst).forEach((t) => { if (!isObj(d.inst[t]) || PRESETS.indexOf(d.inst[t].preset) < 0) p.push('inst.' + t + ': unknown preset ' + short(d.inst[t] && d.inst[t].preset)); });
  if (!isObj(d.patterns)) p.push('patterns must be an object');
  else Object.keys(d.patterns).forEach((name) => {
    const pt = d.patterns[name];
    if (!isObj(pt) || !(pt.bars > 0) || !isObj(pt.tracks)) { p.push('pattern ' + name + ' needs bars and tracks'); return; }
    const want = pt.bars * meter[0] * spb;
    Object.keys(pt.tracks).forEach((t) => {
      if (isObj(d.inst) && !hasOwn(d.inst, t)) p.push('pattern ' + name + ': track ' + t + ' has no inst');
      const n = stepCount(pt.tracks[t]);
      if (n !== want) p.push('pattern ' + name + ' track ' + t + ': ' + n + ' steps, want ' + want);
    });
  });
  if (!Array.isArray(d.order) || !d.order.length) p.push('order must be a non-empty list');
  else {
    d.order.forEach((o) => { if (!isObj(d.patterns) || !hasOwn(d.patterns, o)) p.push('order names a missing pattern ' + o); });
    if (d.loopFrom !== undefined && !(Number.isInteger(d.loopFrom) && d.loopFrom >= 0 && d.loopFrom < d.order.length)) p.push('loopFrom must index order');
  }
  list(d.motif).forEach((m) => { if (!isObj(m) || !isObj(d.patterns) || !hasOwn(d.patterns, m.pattern)) p.push('motif names a missing pattern'); });
  return p;
}

/** @returns {string[]} problems of an sfx recipe (structure only). */
function sfxProblems(d) {
  const p = [];
  if (!isObj(d)) return ['a recipe must be an object'];
  if (d.bus !== undefined && BUSES.indexOf(d.bus) < 0) p.push('bus must be one of ' + BUSES.join(', '));
  if (!Array.isArray(d.layers)) p.push('layers must be a list');
  else d.layers.forEach((l, k) => {
    const src = ['osc', 'noise', 'pluck', 'fm'].filter((s) => l && l[s] !== undefined && l[s] !== false);
    if (src.length !== 1) p.push('layer ' + k + ' needs exactly one source (osc, noise, pluck, fm)');
    if (l && l.env && typeof l.env.a === 'number' && l.env.a < 0.005) p.push('layer ' + k + ': env.a < 0.005');
  });
  return p;
}

// ------------------------------------------------------------------------------------------------
// Self-test: each planted problem is caught, and only it.

function selftest() {
  const { suite } = require(path.join(ROOT, 'tests', 'node', 'load.cjs'));
  const T = suite('tools/validate.cjs --selftest');
  const base = validate({ wave: 1 });
  const baseKeys = new Set(base.errors.map((e) => e.check + '|' + e.where + '|' + e.msg));
  const newErrors = (r) => r.errors.filter((e) => !baseKeys.has(e.check + '|' + e.where + '|' + e.msg));
  T.section('the current tree');
  T.ok(base.stats.registrations && Object.keys(base.stats.registrations).length > 0, 'mode all loads and boots (' + Object.keys(base.stats.registrations || {}).length + ' kinds registered)');
  const plantRel = 'js/data/actions/qa-planted.js';
  const plant = (code) => ({ [plantRel]: "(function () { 'use strict'; var SR = window.SR;\n" + code + '\n})();\n' });
  const L = "label: 'act.world.fall'";
  const cases = [
    ['a colour literal', { 'js/data/qa-colour.js': "(function () { 'use strict'; var ink = '#FF00AA'; })();\n" }, (e) => e.check === 'colour' && /qa-colour/.test(e.where)],
    ['an rgba() colour literal in css', { 'css/qa.css': '.x { color: rgba(0, 0, 0, .5); }\n' }, (e) => e.check === 'colour' && /css\/qa\.css/.test(e.where)],
    ['a P1 def without feature', plant("SR.def.action('bag.qaP1', { building: 'bag', group: 'special', " + L + ', p: 1, effects: [] });'), (e) => e.check === 'feature' && /bag\.qaP1/.test(e.where)],
    ['an unknown feature flag', plant("SR.def.action('bag.qaFlag', { building: 'bag', group: 'special', " + L + ", p: 1, feature: 'qaNoSuchFlag', effects: [] });"), (e) => e.check === 'feature' && /qaNoSuchFlag/.test(e.msg)],
    ['a def of a flagged kind without p', plant("SR.def.action('bag.qaNoP', { building: 'bag', group: 'special', " + L + ', effects: [] });'), (e) => e.check === 'p' && /bag\.qaNoP/.test(e.where)],
    ['a repeatable robbery', plant("SR.def.action('bag.qaRob', { building: 'bag', group: 'crime', " + L + ", p: 0, timeRule: 'robbery', repeatable: true, effects: [['open', 'holdup', {}]] });\nSR.def.action('bag.qaRob:resolve', { building: 'bag', p: 0, timeRule: 'free', effects: [] });"), (e) => e.check === 'repeatable' && /bag\.qaRob/.test(e.where)],
    ['a repeatable row with a confirm', plant("SR.def.action('bag.qaConfirm', { building: 'bag', group: 'buy', " + L + ", p: 0, confirm: 'act.world.fall', repeatable: true, effects: [] });"), (e) => e.check === 'repeatable' && /qaConfirm/.test(e.where)],
    ['a hurt without hpAbove', plant("SR.def.action('bag.qaHurt', { building: 'bag', group: 'train', " + L + ", p: 0, effects: [['hurt', 5, 'other']] });"), (e) => e.check === 'hpAbove' && /bag\.qaHurt/.test(e.where)],
    ['a possible hurt (in a chance branch) above its hpAbove', plant("SR.def.action('bag.qaHurt2', { building: 'bag', group: 'train', " + L + ", p: 0, requires: [['hpAbove', 5]], cost: { hp: 2 }, effects: [['chance', 0.5, [['hurt', 10, 'other']], []]] });"), (e) => e.check === 'hpAbove' && /qaHurt2/.test(e.where) && /12/.test(e.msg)],
    ['an unknown condition', plant("SR.def.action('bag.qaCond', { building: 'bag', group: 'special', " + L + ", p: 0, requires: [['qaNoSuchCondition', 1]], effects: [] });"), (e) => e.check === 'conditions' && /qaNoSuchCondition/.test(e.msg)],
    ['an unknown rule event', plant("SR.def.action('bag.qaEmit', { building: 'bag', group: 'special', " + L + ", p: 0, effects: [['emit', 'qaNoSuchEvent', {}]] });"), (e) => e.check === 'events' && /qaNoSuchEvent/.test(e.msg)],
    ['an unregistered icon', plant("SR.def.action('bag.qaIcon', { building: 'bag', group: 'special', " + L + ", icon: 'qaNoSuchIcon', p: 0, effects: [] });"), (e) => e.check === 'icon' && /qaNoSuchIcon/.test(e.msg)],
    ['an unknown palette key', plant("SR.def.fighter('qa_fighter', { n: 99, name: 'fighter.qa', palette: 'fighter.qaNoSuch', taunts: [] });"), (e) => e.check === 'palette' && /qaNoSuch/.test(e.msg)],
    ['a text key over its length limit', { 'js/data/text/en-qa.js': "(function () { 'use strict'; window.SR.def.text({ 'act.world.qaLong': 'An action label far longer than twenty-eight' }); })();\n" }, (e) => e.check === 'length' && /qaLong/.test(e.where)],
    ['a duplicate id', plant("SR.def.action('world.fall', { building: 'world', group: 'special', " + L + ', p: 0 });'), (e) => e.check === 'registry' && /duplicate/.test(e.msg)],
    ['Math.random in a pure file', { 'js/rules/qa-random.js': "(function () { 'use strict'; function roll() { return Math.random(); } })();\n" }, (e) => e.check === 'random' && /qa-random/.test(e.where)],
  ];
  T.section('each plant is caught (and only it)');
  for (const [label, files, match] of cases) {
    const r = validate({ wave: 1, plant: files });
    const fresh = newErrors(r);
    T.ok(fresh.some(match), 'fails on ' + label, fresh.slice(0, 3));
  }
  const clean = validate({ wave: 1, plant: plant("SR.def.action('bag.qaClean', { building: 'bag', group: 'train', " + L + ", p: 0, requires: [['hpAbove', 10]], cost: { min: 30, hp: 5 }, effects: [['chance', 0.5, [['hurt', 5, 'other']], []], ['stat', 'str', 1]], repeatable: true });") });
  T.eq(newErrors(clean).map((e) => e.msg), [], 'a valid planted action (hpAbove 10 ≥ worst case 10, repeatable) adds no error');

  T.section('--wave downgrades stub-owned text keys');
  const missingKey = plant("SR.def.action('bag.qaText', { building: 'bag', group: 'special', label: 'act.mcsticks.qaMissing', p: 0, effects: [] });\n" +
    "SR.def.action('bag.qaText2', { building: 'bag', group: 'special', label: 'place.qaMissing', p: 0, effects: [] });");
  const stubFood = (rel) => (rel === 'js/data/text/en-food.js' ? true : rel === 'js/data/text/en-world.js' ? false : undefined);
  const w1 = validate({ wave: 1, plant: missingKey, isStub: stubFood });
  const strict = validate({ plant: missingKey, isStub: stubFood });
  T.ok(w1.warnings.some((w) => /act\.mcsticks\.qaMissing/.test(w.msg)) && !newErrors(w1).some((e) => /act\.mcsticks\.qaMissing/.test(e.msg)),
    '--wave 1: a missing act.mcsticks.* key (en-food.js still a stub) is a warning');
  T.ok(strict.errors.some((e) => /act\.mcsticks\.qaMissing/.test(e.msg)), 'strict: the same key is an error');
  T.ok(newErrors(w1).some((e) => /place\.qaMissing/.test(e.msg)), '--wave 1: a missing place.* key (en-world.js is real) stays an error');
  T.eq(textOwner('toast.act.writtenOff'), 'js/data/text/en-prog.js', 'toast.act.* belongs to en-prog.js (W1-R request 8)');
  T.eq([textOwner('act.mcsticks.fries'), textOwner('sub.bank.deposit'), textOwner('mg.hotwire.title'), textOwner('bark.ped.1'), textOwner('vm.harold.1'), textOwner('ui.fanNote')],
    ['js/data/text/en-food.js', 'js/data/text/en-money.js', 'js/data/text/en-street.js', 'js/data/text/en-city.js', 'js/data/text/en-street.js', 'js/data/text/en-ui.js'],
    'the prefix map follows CONTRACT §7');
  T.section('structural audio fallback');
  T.eq(songProblems({ bpm: 100, inst: { d: { preset: 'kit' } }, patterns: { A: { bars: 1, tracks: { d: 'k . h . s . h . k . h . s . h .' } } }, order: ['A'], loopFrom: 0 }), [], 'a valid song passes');
  T.ok(songProblems({ bpm: 100, inst: { d: { preset: 'kit' } }, patterns: { A: { bars: 1, tracks: { d: 'k . h' } } }, order: ['A', 'B'] }).length === 2, 'a short track and a missing pattern fail');
  T.eq(sfxProblems({ bus: 'sfx', layers: [{ osc: 'square', freq: 440, env: { a: 0.005, d: 0.1, s: 0, r: 0.1 } }] }), [], 'a valid sfx passes');
  T.ok(sfxProblems({ layers: [{ osc: 'sine', noise: 'white' }] }).length === 1, 'a layer with two sources fails');
  return T.done();
}

// ------------------------------------------------------------------------------------------------
// CLI

function main(argv) {
  const has = (f) => argv.includes(f);
  const val = (f) => { const k = argv.indexOf(f); return k >= 0 ? argv[k + 1] : undefined; };
  if (has('--selftest')) { selftest(); return; }
  const t0 = Date.now();
  const wave = val('--wave') !== undefined ? Number(val('--wave')) : null;
  if (wave !== null && !(wave >= 1 && wave <= 4)) { console.error('validate.cjs: --wave takes 1-4'); process.exitCode = 2; return; }
  const r = validate({ root: val('--root'), wave });
  if (has('--json')) { console.log(JSON.stringify(r, null, 2)); process.exitCode = r.errors.length ? 1 : 0; return; }
  const fmt = (x) => '[' + x.check + '] ' + x.where + ': ' + x.msg;
  r.errors.forEach((x) => console.log('ERROR ' + fmt(x)));
  if (!has('--quiet')) {
    const byCheck = {};
    r.warnings.forEach((x) => { (byCheck[x.check] = byCheck[x.check] || []).push(x); });
    Object.keys(byCheck).forEach((c) => {
      const l = byCheck[c];
      l.slice(0, 40).forEach((x) => console.log('WARN  ' + fmt(x)));
      if (l.length > 40) console.log('WARN  [' + c + '] ... ' + (l.length - 40) + ' more');
    });
  }
  const regs = r.stats.registrations ? Object.keys(r.stats.registrations).map((k) => k + ' ' + r.stats.registrations[k]).join(', ') : '';
  console.log('tools/validate.cjs' + (wave !== null ? ' --wave ' + wave : ' (strict)') + ': ' + r.errors.length + ' errors, ' + r.warnings.length + ' warnings; ' +
    (r.stats.files || 0) + ' files, ' + (r.stats.stubs || 0) + ' stubs, ' + (r.stats.text || 0) + ' text keys; ' + regs + ' (' + (Date.now() - t0) + ' ms)');
  process.exitCode = r.errors.length ? 1 : 0;
}

module.exports = { validate, textOwner, songProblems, sfxProblems, RULE_EVENTS, ENGINES, SUBSCREENS, LIMITS };

if (require.main === module) main(process.argv.slice(2));
