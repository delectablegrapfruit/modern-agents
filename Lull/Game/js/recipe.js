// Lull — the board recipe: what a Relaxed board is made of, beyond its size. Its shapes, its modifiers (Mirror)
// and its mode (Plain, Classic, Descent, Battle), chosen in the New board window and fixed for the board's life. Pure data and
// rules, no DOM; the parts that give each option its behaviour register here (Recipe.part) and are always run in
// ascending `order`, never in script load order.
//
//   recipe = { v: 1, shapes: { preset: 'normal' }, mods: { mirror: false }, mode: 'plain', physics?: { material }
//              (js/physics.js), classic?: { type, level, … } (js/classic.js), descent?: { level, stage } (js/descent.js), battle?: { level, size: { w, rows } } }
//
// The default recipe is today's board exactly: the seven in a 7-bag, no modifier, plain play. A part:
//   { key, order, owns: [paths it writes], mod?: 'mirror' (a modifier it brings: its switch, modName its name),
//     mode?: 'descent' (a mode it brings),
//     options?: { path: [values] } (what the New board window offers, for resolve),
//     normalize(raw, out) (writes its own keys of the recipe from raw), label(r, short), thin(r), valid(g, r),
//     rules(r, R, w), limits(r, lim), clampSize(size, r, lim, asked), conflicts(r, out),
//     engine(game, saved, o) -> ext | null (game.recipe, rules, rng and seed are set, o the Game's options; the hooks
//     are listed in js/engine.js), controller(play, game) -> ctl | null (Free Play's; every part's is composed over
//     the plain one: Recipe.compose), summary(saved, g), stats? (store.js merges it under state.stats) }
// Achievements a part adds go through Achievements.group / Achievements.add (js/achievements.js).
// Orders: core 0, shapes 10, mirror 20, physics 30, classic 45, descent 47, battle 50.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});

  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  function freeze(o) { if (o && typeof o === 'object') { Object.values(o).forEach(freeze); Object.freeze(o); } return o; }
  /** JSON with every object's keys sorted: two recipes are the same iff their canonical JSON is. */
  function canon(v) {
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    if (isObj(v)) return '{' + Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
    return JSON.stringify(v === undefined ? null : v);
  }
  const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
  function setPath(o, p, v) {
    const ks = p.split('.'), last = ks.pop();
    let a = o;
    for (const k of ks) { if (!isObj(a[k])) a[k] = {}; a = a[k]; }
    a[last] = v;
  }

  // ---- the parts ----------------------------------------------------------------------------------------------------

  const PARTS = [], VIEWS = [], UIS = [];
  const byOrder = (a, b) => (a.order || 0) - (b.order || 0) || String(a.key).localeCompare(String(b.key));
  /** The modifiers the parts bring, in the order a label names them (by key), and their names. */
  const MODS = [];
  const modName = (k) => { const p = PARTS.find((x) => x.mod === k); return (p && p.modName) || k.charAt(0).toUpperCase() + k.slice(1); };

  /** The modes a recipe can have: Plain, and one for each part that brings one. */
  const modes = () => ['plain'].concat(PARTS.filter((p) => p.mode).map((p) => p.mode));

  // The core part: today's board. It writes every key of the recipe (so a recipe is always whole) and lets a feature
  // part own its keys only once that part is there: an option nothing implements falls back to the default.
  const CORE = {
    key: 'core', order: 0, owns: ['v', 'mode'],
    options: {},
    normalize(raw, out) {
      out.v = 1;
      out.shapes = { preset: 'normal' };
      out.mods = {};
      for (const k of MODS) out.mods[k] = isObj(raw.mods) ? raw.mods[k] === true : false;
      out.mode = modes().includes(raw.mode) ? raw.mode : 'plain';
    },
    label(r) {
      const on = MODS.filter((k) => r.mods && r.mods[k]).map(modName);
      return on.join(', ');
    },
  };

  let DEFAULT = null;
  function refresh() {
    PARTS.sort(byOrder);
    MODS.length = 0;
    for (const k of PARTS.filter((p) => p.mod).map((p) => p.mod).sort()) if (!MODS.includes(k)) MODS.push(k);
    CORE.options = { mode: modes() };
    for (const k of MODS) CORE.options['mods.' + k] = [false, true];
    DEFAULT = freeze(normalize({}));
    Recipe.DEFAULT = DEFAULT;
  }

  /** Registers a feature part (its engine, rules and labels). A part with a key already there replaces it. */
  function part(def) {
    if (!def || !def.key) throw new Error('Recipe.part: a key');
    const i = PARTS.findIndex((p) => p.key === def.key);
    if (i >= 0) PARTS.splice(i, 1, def); else PARTS.push(def);
    refresh();
    return def;
  }
  /** Takes a part away (tests; a part that is not there is nothing). */
  function unpart(key) {
    const i = PARTS.findIndex((p) => p.key === key);
    if (i < 0 || key === 'core') return false;
    PARTS.splice(i, 1);
    refresh();
    return true;
  }
  /** The view half of a part (render.js reads these): painters, overlays, previews. */
  function viewPart(def) { const i = VIEWS.findIndex((p) => p.key === def.key); if (i >= 0) VIEWS.splice(i, 1, def); else VIEWS.push(def); VIEWS.sort(byOrder); return def; }
  /** The UI half of a part (the New board window and the library read these). */
  function uiPart(def) { const i = UIS.findIndex((p) => p.key === def.key); if (i >= 0) UIS.splice(i, 1, def); else UIS.push(def); UIS.sort(byOrder); return def; }
  const parts = () => PARTS.slice();
  const get = (key) => PARTS.find((p) => p.key === key) || null;

  // ---- recipes ------------------------------------------------------------------------------------------------------

  /** A recipe made whole and safe: unknown keys dropped, anything invalid (or not implemented here) the default. */
  function normalize(raw) {
    raw = isObj(raw) ? raw : {};
    const out = {};
    for (const p of PARTS) if (p.normalize) p.normalize(raw, out);
    return out;
  }
  /** The canonical form: two recipes with the same key are the same board. */
  function key(r) { return canon(normalize(r)); }
  function equal(a, b) { return key(a) === key(b); }
  function isDefault(r) { return equal(r, DEFAULT); }

  /**
   * What a board is, in words: '' for the default. Each part adds its own ("Frantic", "Mirror", "Descent Easy · Stage 3"),
   * in order; short is the library row's form.
   */
  function label(r, short) {
    r = normalize(r);
    if (equal(r, DEFAULT)) return '';
    // The modifiers ("Mirror", the core's) read after the shapes: "Frantic · Physics · Classic A".
    const segs = PARTS.map((p) => ({ at: p === CORE ? 15 : p.order || 0, text: p.label ? p.label(r, !!short) : '' }));
    return segs.sort((a, b) => a.at - b.at).map((x) => x.text).filter(Boolean).join(' \u00b7 ');
  }

  /** A copy to keep with a retired board: small (a part turns long lists into counts), and never read back as a recipe to play. */
  function thin(r) {
    const out = clone(normalize(r));
    for (const p of PARTS) if (p.thin) p.thin(out);
    return out;
  }

  // ---- sizes --------------------------------------------------------------------------------------------------------

  const BASE = Object.freeze({ w: Object.freeze([4, 20]), h: Object.freeze([8, 40]) });
  /** The sizes a board of this recipe can have, after every part has raised the minimums: { w: [lo, hi], h: [lo, hi] }. */
  function limits(r) {
    r = normalize(r);
    const lim = { w: BASE.w.slice(), h: BASE.h.slice() };
    for (const p of PARTS) if (p.limits) p.limits(r, lim);
    lim.w[0] = Math.min(lim.w[0], lim.w[1]); lim.h[0] = Math.min(lim.h[0], lim.h[1]);
    return lim;
  }
  const clampTo = (v, [lo, hi], d) => (typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : Math.max(lo, Math.min(hi, d)));
  /** Any { w, h } made a size a board of this recipe can have (Standard where a number is missing). */
  function clampSize(size, r) {
    const lim = limits(r), o = isObj(size) ? size : {};
    let out = { w: clampTo(o.w, lim.w, 10), h: clampTo(o.h, lim.h, 20) };
    for (const p of PARTS) if (p.clampSize) out = p.clampSize(out, normalize(r), lim, o) || out;
    return out;
  }
  const inRange = (v, [lo, hi]) => Number.isInteger(v) && v >= lo && v <= hi;
  /** A size a board of this recipe can have. */
  function sizeOk(w, h, r) { const lim = limits(r); return inRange(w, lim.w) && inRange(h, lim.h); }

  // ---- choosing -----------------------------------------------------------------------------------------------------

  /** The options this recipe rules out, given its other choices: { 'path=value': reason }. */
  function conflicts(r) {
    r = normalize(r);
    const out = {};
    for (const p of PARTS) if (p.conflicts) p.conflicts(r, out);
    return out;
  }
  /** Every option a part offers: [{ path, values, owner }], in order. */
  function options() {
    const out = [];
    for (const p of PARTS) for (const [path, values] of Object.entries(p.options || {})) out.push({ path, values, owner: p });
    return out;
  }
  const idOf = (path, v) => path + '=' + (typeof v === 'string' ? v : JSON.stringify(v));

  /**
   * The last choice wins: after `changed` (a path) was set in r, every other option that now conflicts moves to an
   * allowed value (the first of its values that is allowed, the default first), and the value it had is remembered in
   * memo; a remembered value that is allowed again comes back. Returns { recipe, changes: [{ path, from, to }], memo }.
   */
  function resolve(r, changed, memo) {
    memo = memo || {};
    let cur = normalize(r);
    const changes = [];
    for (let pass = 0; pass < 6; pass++) {
      let moved = false;
      const bad = conflicts(cur);
      for (const o of options()) {
        if (o.path === changed) continue;
        const v = getPath(cur, o.path);
        if (!bad[idOf(o.path, v)]) continue;
        const d = getPath(DEFAULT, o.path);
        const to = [d].concat(o.values).find((x) => x !== undefined && !bad[idOf(o.path, x)]);
        if (to === undefined || to === v) continue;
        if (!(o.path in memo)) memo[o.path] = v;
        const next = clone(cur);
        setPath(next, o.path, to);
        cur = normalize(next);
        changes.push({ path: o.path, from: v, to });
        moved = true;
        break;
      }
      if (moved) continue;
      // Asked for before and allowed again: back it comes.
      for (const path of Object.keys(memo)) {
        if (path === changed) { delete memo[path]; continue; }
        const want = memo[path], v = getPath(cur, path);
        if (canon(want) === canon(v)) { delete memo[path]; continue; }
        const trial = clone(cur);
        setPath(trial, path, want);
        const t = normalize(trial);
        if (canon(getPath(t, path)) !== canon(want) || conflicts(t)[idOf(path, want)]) continue;
        cur = t;
        delete memo[path];
        changes.push({ path, from: v, to: want });
        moved = true;
        break;
      }
      if (!moved) break;
    }
    return { recipe: cur, changes, memo };
  }

  // ---- rules --------------------------------------------------------------------------------------------------------

  /**
   * How a board of this recipe w wide plays and pays (R):
   *   u (block scale: Big is 2), copies (Mirror: 2; Full Blast and Event Horizon count one copy's share), E (mean cells a piece), rated, undo, hints, timed, noFeats,
   *   refuse: { itemId: reason }, k (Battle's buffer rows), and derived: f = min(1, 4/E) (pay per cell never above
   *   Standard's), lk = (w/10)·f (what a row is worth in Standard lines), wEff = w/(u·copies), feats (the Free Play
   *   feats count here), quad = 4u (rows a quad needs).
   */
  function rules(r, w) {
    r = normalize(r);
    w = typeof w === 'number' && w > 0 ? w : 10;
    const R = { u: 1, copies: 1, E: 4, rated: true, undo: true, hints: true, timed: false, noFeats: false, refuse: {}, k: 0 };
    for (const p of PARTS) if (p.rules) p.rules(r, R, w);
    R.f = Math.min(1, 4 / R.E);
    R.lk = (w / 10) * R.f;
    R.wEff = w / (R.u * R.copies);
    R.feats = !!R.rated && R.wEff >= 10 && !R.noFeats;
    R.quad = 4 * R.u;
    if (!R.rated) {
      if (!R.refuse.double) R.refuse.double = 'Needs Normal shapes';
      if (!R.refuse.net) R.refuse.net = 'Needs Normal shapes';
    }
    return R;
  }

  /** A saved board (Game.toJSON) every part accepts: a recipe that is an object (or none: the default), and each part's own check. */
  function valid(g) {
    if (!isObj(g)) return false;
    if (g.recipe !== undefined && g.recipe !== null && !isObj(g.recipe)) return false;
    const r = normalize(g.recipe);
    for (const p of PARTS) if (p.valid && !p.valid(g, r)) return false;
    return true;
  }

  // ---- the engine's extensions and the stats' defaults ----------------------------------------------------------------

  /**
   * A game's extensions: each part's engine(game, saved, o) that gives one (game.recipe is set; saved is what its ext's
   * save() gave, from the save's x; o the Game's options), in order, each knowing its key and order.
   */
  function engine(game, x, o) {
    const out = [];
    for (const p of PARTS) {
      if (!p.engine) continue;
      const e = p.engine(game, x && isObj(x) ? x[p.key] : undefined, o || {});
      if (e) { e.key = p.key; e.order = p.order || 0; out.push(e); }
    }
    return out;
  }
  /** Every controller the parts give for this board (Free Play: play), in order, each knowing its part. */
  function controllers(play, game) {
    const out = [];
    for (const p of PARTS) { const c = p.controller && p.controller(play, game); if (c) out.push({ part: p.key, ctl: c }); }
    return out;
  }
  /** The first controller a part gives for this board (null: none). */
  function controller(play, game) { const c = controllers(play, game)[0]; return c ? c.ctl : null; }

  // How the controllers' hooks meet (compose): these run for every part, earlier parts first; these ask each part in
  // turn until one takes it (true).
  const RUN_ALL = ['frame', 'pause', 'attach', 'detach'], FIRST = ['onKey', 'action'];
  /**
   * Free Play's controller for a board: `plain` (today's Free Play) with each part's controller over it, in the parts'
   * order ([{ part, ctl }] or [ctl]). A hook a part gives replaces the one before it, which that part reaches while its
   * hook runs as this.base.<hook> (this.base: the controller as it stood before that part; plain for the first). These
   * gather every part's instead:
   *   frame, pause, attach, detach   each part's runs, earlier parts first
   *   input(kind, v, pos)            chained: each gets the answer before it; null, false or true (taken) ends it
   *   onKey(e), action(a, rep)       asked in turn until one takes it (true)
   *   tiles(game)                    joined
   *   status(parts, o)               each gets the list before it as o.prev, and returns the list
   *   cards                          merged by kind
   * Fields (timed, view, a part's own state) are copied onto the one controller every hook runs with (this = it). A
   * controller's name is `id`; a string `key` is taken as its name, a function `key` as onKey. With no part's, plain
   * itself.
   */
  function compose(plain, list) {
    list = (list || []).map((c) => (c && c.ctl ? c.ctl : c)).filter((c) => c && typeof c === 'object');
    if (!list.length) return plain;
    const ctl = {};
    const bound = (t) => { const o = {}; for (const [k, v] of Object.entries(t)) o[k] = typeof v === 'function' ? (...a) => v.apply(ctl, a) : v; return o; };
    let table = Object.assign({}, plain);
    for (const own0 of list) {
      const own = Object.assign({}, own0);
      if (typeof own.key === 'function') { if (!own.onKey) own.onKey = own.key; delete own.key; }
      else if (typeof own.key === 'string') { if (!own.id) own.id = own.key; delete own.key; }
      delete own.base;
      const prev = table, base = bound(prev), next = Object.assign({}, prev);
      // The part's hook, run with this = the controller and this.base = the controller before it.
      const wrap = (fn) => function (...a) { const was = ctl.base; ctl.base = base; try { return fn.apply(ctl, a); } finally { ctl.base = was; } };
      for (const [k, v] of Object.entries(own)) {
        if (k === 'cards') { next.cards = Object.assign({}, prev.cards || {}, v || {}); continue; }
        if (typeof v !== 'function') { next[k] = v; continue; }
        const fn = wrap(v), was = prev[k];
        if (typeof was !== 'function') next[k] = fn;
        else if (RUN_ALL.includes(k)) next[k] = (...a) => { was.apply(ctl, a); return fn(...a); };
        else if (FIRST.includes(k)) next[k] = (...a) => { const r = was.apply(ctl, a); return r === true || (k === 'action' && r) ? r : fn(...a); };
        else if (k === 'input') next[k] = (kind, x, pos) => { const b = was.call(ctl, kind, x, pos); return b === null || b === false || b === true ? b : fn(kind, b, pos); };
        else if (k === 'tiles') next[k] = (g) => (was.call(ctl, g) || []).concat(fn(g) || []);
        else if (k === 'status') next[k] = (parts, o) => { const before = was.call(ctl, parts, o); return fn(parts, Object.assign({}, o, { prev: before })) || before; };
        else next[k] = fn;
      }
      table = next;
    }
    Object.assign(ctl, table);
    // Outside a part's hook, base is the plain controller.
    ctl.base = bound(Object.assign({}, plain));
    return ctl;
  }
  /**
   * A board's own numbers for its summary, by part: from a Game, each extension's summary(game); from a saved one
   * (Game.toJSON), each part's summary(saved x, g). {} on a default board.
   */
  function summary(g) {
    const out = {};
    if (!g || typeof g !== 'object') return out;
    if (Array.isArray(g.ext)) {
      for (const e of g.ext) if (typeof e.summary === 'function') { const v = e.summary(g); if (v != null) out[e.key] = v; }
      return out;
    }
    if (!g.recipe) return out;
    for (const p of PARTS) if (p.summary) { const v = p.summary(isObj(g.x) ? g.x[p.key] : undefined, g); if (v != null) out[p.key] = v; }
    return out;
  }

  /** Every part's stats defaults, merged (store.js puts them under stats). */
  function stats() {
    const out = {};
    const merge = (a, b) => { for (const [k, v] of Object.entries(b)) { if (isObj(v)) merge(isObj(a[k]) ? a[k] : (a[k] = {}), v); else if (!(k in a)) a[k] = clone(v); } };
    for (const p of PARTS) if (p.stats) merge(out, typeof p.stats === 'function' ? p.stats() : p.stats);
    return out;
  }

  // ---- editing a board's rules ----------------------------------------------------------------------------------------

  /** What an edit of a board's rules costs, in lines, for each section of the New board window that changed. */
  const EDIT_PRICE = 20;
  const SECTIONS = ['size', 'shapes', 'mods', 'mode'];
  /**
   * The sections an edit from recipe a at size sa to recipe b at size sb changes, and its price: EDIT_PRICE for each
   * (Size, Shapes, Modifiers, Mode; a mode's own settings are its section), nothing when nothing changed. A path a part
   * lists in freeEdit (Classic's music) changes for nothing. { sections: [...], cost }.
   */
  function editPrice(a, b, sa, sb) {
    a = normalize(a); b = normalize(b);
    const out = [];
    if (sa && sb && (sa.w !== sb.w || sa.h !== sb.h)) out.push('size');
    if (canon(a.shapes) !== canon(b.shapes)) out.push('shapes');
    if (canon(a.mods) !== canon(b.mods)) out.push('mods');
    const rest = (r) => { const o = clone(r); delete o.shapes; delete o.mods; return o; };
    const ra = rest(a), rb = rest(b);
    for (const p of PARTS) for (const path of p.freeEdit || []) {
      const va = getPath(ra, path);
      if (va !== undefined && getPath(rb, path) !== undefined) setPath(rb, path, clone(va));
    }
    if (canon(ra) !== canon(rb)) out.push('mode');
    return { sections: SECTIONS.filter((k) => out.includes(k)), cost: out.length * EDIT_PRICE };
  }
  /**
   * The options an edit of a board made as `from` may not choose, beyond the recipe's own conflicts: a mode a part
   * keeps for the board's life (editFixed: Descent) is neither entered nor left, nor are its settings changed; a
   * modifier kept so (editFixed: Physics) is neither switched on nor off.
   * { 'path=value': reason }.
   */
  function editConflicts(from, r) {
    from = normalize(from); r = normalize(r);
    const out = {};
    for (const p of PARTS) {
      // A modifier kept for the board's life (Physics): never switched on or off by an edit.
      if (p.editFixed && p.mod) {
        const name = p.modName || p.mod.charAt(0).toUpperCase() + p.mod.slice(1);
        if (from.mods && from.mods[p.mod]) out[idOf('mods.' + p.mod, false)] = 'A ' + name + ' board stays ' + name;
        else out[idOf('mods.' + p.mod, true)] = name + ' starts on a new board';
        continue;
      }
      if (!p.editFixed || !p.mode) continue;
      const name = p.name || p.mode.charAt(0).toUpperCase() + p.mode.slice(1);
      if (from.mode === p.mode) {
        for (const m of modes()) if (m !== p.mode) out[idOf('mode', m)] = 'A ' + name + ' board stays ' + name;
        for (const [path, values] of Object.entries(p.options || {})) {
          const keep = getPath(from, path);
          for (const v of values) if (canon(v) !== canon(keep)) out[idOf(path, v)] = 'Set when the board was made';
        }
      } else out[idOf('mode', p.mode)] = name + ' starts on a new board';
    }
    return out;
  }

  const Recipe = {
    DEFAULT: null, MODS, BASE, EDIT_PRICE, editPrice, editConflicts,
    part, unpart, viewPart, uiPart, parts, get, views: () => VIEWS.slice(), uis: () => UIS.slice(),
    normalize, equal, key, isDefault, label, thin, limits, clampSize, sizeOk, conflicts, options, resolve, rules, valid,
    engine, controller, controllers, compose, stats, summary, canon, getPath, setPath,
  };
  L.Recipe = Recipe;
  part(CORE);
})(typeof globalThis !== 'undefined' ? globalThis : this);
