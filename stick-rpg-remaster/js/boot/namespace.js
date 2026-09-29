// js/boot/namespace.js — owner: W1-K (lead). Creates window.SR: the constants, the namespace
// objects, the registries (SR.def.<kind>, SR.reg, SR.registry) and deferred boot (SR.onBoot,
// SR.boot). ARCHITECTURE §4 and §7; docs/CONTRACT.md §2-§4.
// Pure: no DOM, canvas, audio or browser API, so it loads in Node (tests/node/load.cjs).
(function () {
  'use strict';

  var hasOwn = Object.prototype.hasOwnProperty;

  // Kinds whose registrations take an id: SR.def.<kind>(id, def). The last two back the
  // load-time-safe SR.scenes.register and SR.minigame.register (CONTRACT §3.3).
  var ID_KINDS = [
    'fn', 'building', 'action', 'subscreen', 'item', 'job', 'home', 'furniture', 'stock', 'city',
    'fighter', 'decree', 'rank', 'perk', 'achievement', 'encounter', 'arc', 'event', 'person',
    'contact', 'skin', 'song', 'sfx', 'interior', 'exterior', 'icon', 'scene', 'minigame',
  ];
  // Kinds registered as a map: SR.def.<kind>({ id: value, ... }); every key is an id.
  var MAP_KINDS = ['tuning', 'features', 'text'];
  // Kinds with a single definition: SR.def.<kind>(def), stored under the id 'main'.
  var SINGLE_KINDS = ['worldmap'];
  var KINDS = ID_KINDS.concat(MAP_KINDS, SINGLE_KINDS);

  var SR = {
    VERSION: '0.1.0',
    W: 1280,
    H: 720,
    STEP: 1 / 60,
    def: {},
    reg: {},
    registry: null,
    booted: false,
    state: null,
    tuning: null,
    features: null,
    rules: {},
    world: {},
    render: {},
    art: {},
    ui: {},
    audio: {},
    // Created here (not in their module files) so registration works at load time in any order.
    scenes: {},
    minigame: {},
  };
  window.SR = SR;

  var meta = {};      // kind -> { id -> file }
  var order = {};     // kind -> [id, ...] in registration order
  var errors = [];    // { kind, id, message, files }
  var hooks = [];     // { prio, fn, headless, file, seq }
  var booting = false;

  KINDS.forEach(function (k) { SR.reg[k] = {}; meta[k] = {}; order[k] = []; });
  // The map kinds are read directly: SR.tuning.time, SR.features.weather.
  SR.tuning = SR.reg.tuning;
  SR.features = SR.reg.features;

  /**
   * The first js/ file in a stack trace other than this one (Chrome, Firefox, Safari and Node
   * formats all carry the script URL or path followed by :line:column; Node on Windows uses
   * backslashes, which are read as slashes).
   * @returns {string} a root-relative path ('js/data/features.js'), or '?'
   */
  function fileFromStack(stack) {
    var lines = String(stack || '').split('\n');
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].replace(/\\/g, '/').match(/\/js\/[\w\-.\/]*\.js(?=:\d)/);
      if (!m) continue;
      var f = 'js/' + m[0].slice(m[0].lastIndexOf('/js/') + 4);
      if (f !== 'js/boot/namespace.js') return f;
    }
    return '?';
  }

  /** @returns {string} the root-relative path of the js/ file that called into SR.def or SR.onBoot. */
  function callerFile() {
    try { return fileFromStack(new Error().stack); } catch (e) { return '?'; }
  }

  function fail(kind, id, message, files) {
    var err = { kind: kind, id: id, message: message, files: files || [] };
    if (SR.booted || booting) throw new Error('SR.def.' + kind + '(' + JSON.stringify(id) + '): ' + message);
    errors.push(err);
  }

  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

  function checkDef(kind, id, def, file) {
    if (kind === 'fn') {
      if (typeof def !== 'function') { fail(kind, id, 'def must be a function', [file]); return false; }
      return true;
    }
    if (kind === 'icon') {
      if (typeof def !== 'function' && !isObj(def)) { fail(kind, id, 'def must be a function or an object', [file]); return false; }
      return true;
    }
    if (kind === 'features') {
      if (typeof def !== 'boolean') { fail(kind, id, 'a feature flag must be true or false', [file]); return false; }
      return true;
    }
    if (kind === 'text') {
      var okText = typeof def === 'string' ||
        (Array.isArray(def) && def.length > 0 && def.every(function (s) { return typeof s === 'string'; }));
      if (!okText) { fail(kind, id, 'text must be a string or a non-empty array of strings', [file]); return false; }
      return true;
    }
    if (kind === 'tuning') return true;
    if (!isObj(def)) { fail(kind, id, 'def must be an object', [file]); return false; }
    return true;
  }

  /** Stores one registration; duplicates are reported at boot with both file names. */
  function register(kind, id, def, file) {
    if (typeof id === 'number' && isFinite(id)) id = String(id);
    if (typeof id !== 'string' || id === '' || id === '__proto__') {
      fail(kind, String(id), 'the id must be a non-empty string', [file]);
      return def;
    }
    if (hasOwn.call(SR.reg[kind], id)) {
      fail(kind, id, 'duplicate id (first in ' + meta[kind][id] + ', again in ' + file + ')', [meta[kind][id], file]);
      return def;
    }
    if (!checkDef(kind, id, def, file)) return def;
    // Object defs of id kinds carry their id (def.id), as ARCHITECTURE §7's field lists expect.
    if (ID_KINDS.indexOf(kind) >= 0 && isObj(def)) {
      if (def.id === undefined) {
        if (Object.isExtensible(def)) def.id = id;
      } else if (def.id !== id) {
        fail(kind, id, 'def.id "' + def.id + '" differs from the registered id', [file]);
        return def;
      }
    }
    SR.reg[kind][id] = def;
    meta[kind][id] = file;
    order[kind].push(id);
    return def;
  }

  ID_KINDS.forEach(function (kind) {
    SR.def[kind] = function (id, def) { return register(kind, id, def, callerFile()); };
  });
  MAP_KINDS.forEach(function (kind) {
    SR.def[kind] = function (map) {
      var file = callerFile();
      if (!isObj(map)) { fail(kind, '(map)', 'SR.def.' + kind + ' takes one object of id: value pairs', [file]); return map; }
      Object.keys(map).forEach(function (id) { register(kind, id, map[id], file); });
      return map;
    };
  });
  SINGLE_KINDS.forEach(function (kind) {
    SR.def[kind] = function (def) { return register(kind, 'main', def, callerFile()); };
  });

  // ARCHITECTURE §5 and §10 spell these registrations SR.scenes.register / SR.minigame.register.
  // They live here so a scene or engine file may register at load time in any load order;
  // js/core/scenes.js and js/minigames/framework.js add their other functions to these objects.
  SR.scenes.register = function (id, def) { return register('scene', id, def, callerFile()); };
  SR.minigame.register = function (id, def) { return register('minigame', id, def, callerFile()); };

  function formatErrors(list) {
    return list.map(function (e) { return '  ' + e.kind + ' "' + e.id + '": ' + e.message + (e.files.length ? ' [' + e.files.join(', ') + ']' : ''); }).join('\n');
  }

  SR.registry = {
    /** Every registration kind (ARCHITECTURE §7 plus scene and minigame). */
    kinds: KINDS.slice(),
    /** @returns {{id: string, def: *, file: string}[]} the kind's registrations in order. */
    entries: function (kind) {
      if (!order[kind]) throw new Error('SR.registry.entries: unknown kind "' + kind + '"');
      return order[kind].map(function (id) { return { id: id, def: SR.reg[kind][id], file: meta[kind][id] }; });
    },
    /** @returns {string|undefined} the file that registered kind/id. */
    file: function (kind, id) { return meta[kind] ? meta[kind][id] : undefined; },
    /** @returns {object[]} registration errors so far (duplicates, bad ids, bad defs). */
    errors: function () { return errors.map(function (e) { return { kind: e.kind, id: e.id, message: e.message, files: e.files.slice() }; }); },
    /** @returns {{prio: number, headless: boolean, file: string}[]} boot hooks in run order. */
    hooks: function () {
      return sortedHooks().map(function (h) { return { prio: h.prio, headless: h.headless, file: h.file }; });
    },
    /** How registrations learn their file (exposed for tests). */
    fileFromStack: fileFromStack,
  };

  function sortedHooks() {
    return hooks.slice().sort(function (a, b) { return a.prio - b.prio || a.seq - b.seq; });
  }

  /**
   * Registers a deferred initialisation hook.
   * @param {number} prio 10 core, 20 data, 30 world, 40 render caches, 50 UI, 60 audio, 90 first scene
   * @param {function(object)} fn called with the boot options
   * @param {{headless: boolean}=} opts headless: true marks a Node-safe hook
   */
  SR.onBoot = function (prio, fn, opts) {
    var file = callerFile();
    if (booting || SR.booted) throw new Error('SR.onBoot: called after SR.boot started (' + file + ')');
    if (typeof prio !== 'number' || !isFinite(prio)) throw new Error('SR.onBoot: prio must be a number (' + file + ')');
    if (typeof fn !== 'function') throw new Error('SR.onBoot: fn must be a function (' + file + ')');
    hooks.push({ prio: prio, fn: fn, headless: !!(opts && opts.headless), file: file, seq: hooks.length });
  };

  /**
   * Runs the boot hooks by priority, then starts the first scene.
   * @param {{headless: boolean, scene: (string|false), sceneParams: object}=} opts headless (Node):
   *   only { headless: true } hooks, no scene; scene: the first scene (default 'boot'), false for none
   * @returns {{hooks: number, headless: boolean}}
   */
  SR.boot = function (opts) {
    opts = opts || {};
    if (booting || SR.booted) throw new Error('SR.boot: already booted');
    if (errors.length) throw new Error('SR.boot: registration errors\n' + formatErrors(errors));
    booting = true;
    var list = sortedHooks().filter(function (h) { return !opts.headless || h.headless; });
    for (var i = 0; i < list.length; i++) {
      var h = list[i];
      try {
        h.fn(opts);
      } catch (e) {
        var err = new Error('SR.boot: hook (prio ' + h.prio + ', ' + h.file + ') failed: ' + (e && e.message));
        err.cause = e;
        throw err;
      }
    }
    if (errors.length) throw new Error('SR.boot: registration errors\n' + formatErrors(errors));
    booting = false;
    SR.booted = true;
    var first = opts.scene === undefined ? 'boot' : opts.scene;
    if (!opts.headless && first && typeof SR.scenes.go === 'function') SR.scenes.go(first, opts.sceneParams);
    return { hooks: list.length, headless: !!opts.headless };
  };
})();
