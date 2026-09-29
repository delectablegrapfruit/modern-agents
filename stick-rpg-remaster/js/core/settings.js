// js/core/settings.js — owner: W1-K. SR.settings: the per-profile preferences (ARCHITECTURE §16;
// docs/CONTRACT.md §16): the schema and its defaults, get / set by dotted key with type and range
// checks, persistence in localStorage 'sr1.settings' (through SR.save.storage, which falls back to
// memory), reset, and the settings:changed event. Per-save values (the pill toggle, the tutorial)
// live in the state, never here. Loaded lazily on first use, so boot-hook order does not matter.
// Load-time clean: no browser API is touched until a function is called (Node tests load it).
(function () {
  'use strict';
  var SR = window.SR;
  var hasOwn = Object.prototype.hasOwnProperty;

  var KEY = 'sr1.settings';

  // ARCHITECTURE §16, verbatim.
  var DEFAULTS = {
    game: { clock24: true, hints: true, alwaysAuto: false, confirmSpendOver: 1000, holdRepeat: true,
            rightClickBack: false, skateToggle: false, minimalHud: false, minimap: true },
    audio: { master: 0.8, music: 0.7, sfx: 0.8, ambience: 0.6, ui: 0.7, mono: false },
    display: { quality: 'auto', fpsCap: 60, fullscreen: false, screenShake: true, lean: false },
    access: { textScale: 1, highContrast: false, colorblind: 'none', reducedMotion: 'system',
              flashReduction: false, captions: false, assist: false, safeEdges: false, noGusts: false,
              typewriterCps: 60, haptics: true },
    controls: { keys: {}, pad: {}, contexts: {} },
  };

  // Allowed values where a type check is not enough (UI.md §5.15, §8). typewriterCps 0 = instant.
  var ENUMS = {
    'display.quality': ['auto', 'high', 'medium', 'low'],
    'display.fpsCap': [60, 30],
    'access.textScale': [1, 1.25, 1.5],
    'access.colorblind': ['none', 'protan', 'deutan', 'tritan'],
    'access.reducedMotion': ['system', 'on', 'off'],
    'access.typewriterCps': [30, 60, 120, 0],
  };
  var RANGES = {
    'audio.master': [0, 1], 'audio.music': [0, 1], 'audio.sfx': [0, 1], 'audio.ambience': [0, 1], 'audio.ui': [0, 1],
    'game.confirmSpendOver': [0, 1e9],
  };

  var data = null;     // the live settings (loaded on first use)

  /** @returns {object} the storage in use (SR.save.storage, or a private memory map in isolation). */
  var memory = null;
  function store() {
    if (SR.save && SR.save.storage) return SR.save.storage;
    if (!memory) {
      var m = {};
      memory = {
        get: function (k) { return hasOwn.call(m, k) ? m[k] : null; },
        set: function (k, v) { m[k] = String(v); },
        remove: function (k) { delete m[k]; },
      };
    }
    return memory;
  }

  /** @returns {boolean} value is acceptable for the leaf at path (whose default is def). */
  function validLeaf(path, def, value) {
    if (hasOwn.call(ENUMS, path)) return ENUMS[path].indexOf(value) >= 0;
    if (typeof def === 'number') {
      if (typeof value !== 'number' || !isFinite(value)) return false;
      var r = RANGES[path];
      return !r || (value >= r[0] && value <= r[1]);
    }
    return typeof value === typeof def;
  }

  /** @returns {boolean} a controls map: { action: [binding strings] } (contexts: { ctx: { action: [...] } }). */
  function validControls(path, value) {
    function bindMap(m) {
      if (!SR.util.isObject(m)) return false;
      return Object.keys(m).every(function (a) {
        return m[a] === null || (Array.isArray(m[a]) && m[a].every(function (b) { return typeof b === 'string' && b.length > 0; }));
      });
    }
    var seg = path.split('.');
    if (seg.length === 1) {
      return SR.util.isObject(value) && ['keys', 'pad', 'contexts'].every(function (k) { return !hasOwn.call(value, k) || validControls('controls.' + k, value[k]); });
    }
    if (seg[1] === 'keys' || seg[1] === 'pad') {
      if (seg.length === 2) return bindMap(value);
      if (seg.length === 3) return value === null || bindMap({ a: value });
      return false;
    }
    if (seg[1] === 'contexts') {
      if (seg.length === 2) return SR.util.isObject(value) && Object.keys(value).every(function (c) { return bindMap(value[c]); });
      if (seg.length === 3) return bindMap(value);
      if (seg.length === 4) return value === null || bindMap({ a: value });
    }
    return false;
  }

  /** Copies the known, valid values of raw over a fresh copy of the defaults. */
  function sanitize(raw) {
    var out = SR.util.clone(DEFAULTS);
    if (!SR.util.isObject(raw)) return out;
    Object.keys(DEFAULTS).forEach(function (group) {
      var src = raw[group];
      if (!SR.util.isObject(src)) return;
      if (group === 'controls') {
        ['keys', 'pad', 'contexts'].forEach(function (k) {
          if (hasOwn.call(src, k) && validControls('controls.' + k, src[k])) out.controls[k] = SR.util.clone(src[k]);
        });
        return;
      }
      Object.keys(DEFAULTS[group]).forEach(function (leaf) {
        if (hasOwn.call(src, leaf) && validLeaf(group + '.' + leaf, DEFAULTS[group][leaf], src[leaf])) out[group][leaf] = src[leaf];
      });
    });
    return out;
  }

  /** Loads the stored settings once (defaults when missing or unreadable). */
  function ensure() {
    if (data) return data;
    var raw = null;
    try { raw = store().get(KEY); } catch (e) { raw = null; }
    var parsed = null;
    if (raw) {
      try { parsed = JSON.parse(raw); } catch (e) {
        SR.util.warnOnce('settings:parse', 'SR.settings: stored settings were unreadable; using the defaults');
      }
    }
    data = sanitize(parsed);
    return data;
  }

  function persist() {
    try {
      store().set(KEY, JSON.stringify(data));
    } catch (e) {
      SR.util.warnOnce('settings:write', 'SR.settings: could not save the settings (' + (e && e.message) + ')');
    }
  }

  /** @returns {{parent: object, leaf: string, def: *}|null} where a dotted key lives, or null if unknown. */
  function locate(key, obj) {
    if (typeof key !== 'string' || !key) return null;
    var seg = key.split('.');
    var node = obj, def = DEFAULTS;
    for (var i = 0; i < seg.length - 1; i++) {
      if (!SR.util.isObject(node) || !hasOwn.call(node, seg[i])) {
        // Below controls the maps are free-form (per action, per context).
        if (seg[0] === 'controls' && SR.util.isObject(node)) { node[seg[i]] = {}; } else return null;
      }
      node = node[seg[i]];
      def = def && SR.util.isObject(def) && hasOwn.call(def, seg[i]) ? def[seg[i]] : undefined;
    }
    var leaf = seg[seg.length - 1];
    if (seg[0] !== 'controls' && (!SR.util.isObject(def) || !hasOwn.call(def, leaf))) return null;
    return { parent: node, leaf: leaf, def: def ? def[leaf] : undefined };
  }

  /**
   * Reads a setting.
   * @param {string} key a dotted path ('game.clock24', 'controls.keys'); undefined for an unknown key
   * @returns {*} the value (objects are copies)
   */
  function get(key) {
    var d = ensure();
    if (key === undefined) return SR.util.clone(d);
    var seg = String(key).split('.');
    var node = d;
    for (var i = 0; i < seg.length; i++) {
      if (!SR.util.isObject(node) || !hasOwn.call(node, seg[i])) return undefined;
      node = node[seg[i]];
    }
    return SR.util.clone(node);
  }

  /**
   * Changes a setting, saves the settings and emits settings:changed { key, value } (when it changed).
   * Throws on an unknown key or an invalid value (a programmer error).
   * @param {string} key a dotted path
   * @param {*} value
   * @returns {*} the stored value
   */
  function set(key, value) {
    var d = ensure();
    var isControls = typeof key === 'string' && (key === 'controls' || key.indexOf('controls.') === 0);
    if (isControls) {
      if (!validControls(key, value)) throw new Error('SR.settings.set: invalid controls value for "' + key + '"');
    }
    var at = key === 'controls' ? { parent: d, leaf: 'controls', def: DEFAULTS.controls } : locate(key, d);
    if (!at) throw new Error('SR.settings.set: unknown key "' + key + '"');
    if (!isControls) {
      if (SR.util.isObject(at.def)) throw new Error('SR.settings.set: "' + key + '" is a group; set its fields one by one');
      if (!validLeaf(key, at.def, value)) throw new Error('SR.settings.set: invalid value ' + JSON.stringify(value) + ' for "' + key + '"');
    }
    var before = at.parent[at.leaf];
    if (value === null && isControls) delete at.parent[at.leaf];
    else at.parent[at.leaf] = SR.util.clone(value);
    if (key === 'controls') data.controls = sanitize({ controls: value }).controls;
    if (SR.util.equal(before, value)) return SR.util.clone(value);
    persist();
    if (SR.events) SR.events.emit('settings:changed', { key: key, value: SR.util.clone(value) });
    return SR.util.clone(value);
  }

  /**
   * Restores one key (or, with no key, every setting) to its default, saves and emits.
   * @param {string=} key
   */
  function reset(key) {
    ensure();
    if (key === undefined) {
      data = SR.util.clone(DEFAULTS);
      persist();
      if (SR.events) SR.events.emit('settings:changed', { key: '*', value: SR.util.clone(data) });
      return;
    }
    var seg = key.split('.');
    var def = DEFAULTS;
    for (var i = 0; i < seg.length; i++) {
      if (!SR.util.isObject(def) || !hasOwn.call(def, seg[i])) { def = undefined; break; }
      def = def[seg[i]];
    }
    if (def === undefined) {
      if (seg[0] === 'controls' && seg.length > 1) { set(key, null); return; }
      throw new Error('SR.settings.reset: unknown key "' + key + '"');
    }
    if (SR.util.isObject(def) && seg[0] !== 'controls') {
      Object.keys(def).forEach(function (leaf) { set(key + '.' + leaf, def[leaf]); });
      return;
    }
    set(key, def);
  }

  SR.settings = {
    get: get,
    set: set,
    reset: reset,
    /** @returns {object} a deep copy of every setting. */
    all: function () { return SR.util.clone(ensure()); },
    /** @returns {object} a deep copy of the defaults (ARCHITECTURE §16). */
    defaults: function () { return SR.util.clone(DEFAULTS); },
    /** Forgets the loaded copy so the next read comes from storage again (tests). */
    reload: function () { data = null; return SR.util.clone(ensure()); },
  };
})();
