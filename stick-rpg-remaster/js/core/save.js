// js/core/save.js — owner: W1-K. SR.save: saves (ARCHITECTURE §15; docs/CONTRACT.md §16): the
// storage wrapper (localStorage with an in-memory fallback), the envelope, the tmp → slot → remove
// tmp write order and its recovery, retention caps, migrations, deep-fill from
// SR.rules.state.defaults(), validation and quarantine, making a state the live game (the rules
// stream round trip), autosave, the Hardcore ironman write rules and `pending`, the export code
// with the clipboard's textarea fallback, file export / import and the profile.
// Load-time clean: browser APIs are touched only inside functions (Node tests load this file).
(function () {
  'use strict';
  var SR = window.SR;
  var hasOwn = Object.prototype.hasOwnProperty;

  var PREFIX = 'sr1.';
  var TMP = 'sr1.tmp';
  var PROFILE = 'sr1.profile';
  var BROKEN = 'sr1.broken.';
  var SLOTS = ['slot1', 'slot2', 'slot3', 'auto', 'suspend', 'ironman'];
  var FMT = 'sr-save';
  var CODE_PREFIX = 'PSKY1:';

  // Engine limits of ARCHITECTURE §15 (not balance numbers; stock history follows B-10 when present).
  var BUDGET_BYTES = 60 * 1024;          // one save
  var MSG_MAX = 150;                     // messages kept
  var HISTORY_DAILY_DAYS = 120;          // one history point per morning up to this day ...
  var HISTORY_WEEK = 7;                  // ... then one every 7th morning
  var LOG_MAX = 20;                      // log entries per day (§6.9; tuning.news.logMax when present)
  var RATE_HIST = 30;                    // money.rateHist points
  var STOCK_HIST = 30;                   // stocks.<t>.hist points (tuning.stocks.history when present)
  var IRONMAN_DEBOUNCE_MS = 2000;        // fallback for tuning.difficulty.<d>.ironmanDebounceMs (BALANCE B-16)
  var AUTO_GAP_MS = 60000;               // autosave on leaving a building, at most once a minute
  var THUMB_W = 160, THUMB_H = 90, THUMB_Q = 0.6;

  // ------------------------------------------------------------------------------------------
  // Storage: localStorage when it works, else memory (the game stays playable, nothing persists).

  var memory = {};
  var backend;         // undefined = not probed yet; null = memory; else the Storage object

  function probe() {
    backend = null;
    try {
      var ls = window.localStorage;
      if (ls && typeof ls.getItem === 'function') {
        ls.setItem('sr1.probe', '1');
        ls.removeItem('sr1.probe');
        backend = ls;
      }
    } catch (e) { backend = null; }
    return backend;
  }
  function ls() { return backend === undefined ? probe() : backend; }

  function isQuota(e) {
    return !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014 || e.code === 'quota');
  }

  var storage = {
    /** @returns {string|null} the stored string for key. */
    get: function (key) {
      var b = ls();
      if (b) { try { return b.getItem(key); } catch (e) { return null; } }
      return hasOwn.call(memory, key) ? memory[key] : null;
    },
    /** Stores a string; throws an Error with code 'quota' when storage is full. */
    set: function (key, value) {
      var b = ls();
      if (!b) { memory[key] = String(value); return; }
      try {
        b.setItem(key, String(value));
      } catch (e) {
        var err = new Error('storage is full (' + key + ')');
        err.code = isQuota(e) ? 'quota' : 'storage';
        err.cause = e;
        throw err;
      }
    },
    /** Removes key. */
    remove: function (key) {
      var b = ls();
      if (b) { try { b.removeItem(key); } catch (e) { /* ignore */ } return; }
      delete memory[key];
    },
    /** @returns {string[]} the stored keys that start with prefix. */
    keys: function (prefix) {
      var out = [], b = ls();
      prefix = prefix || '';
      if (b) {
        try { for (var i = 0; i < b.length; i++) { var k = b.key(i); if (k && k.indexOf(prefix) === 0) out.push(k); } } catch (e) { /* ignore */ }
      } else {
        Object.keys(memory).forEach(function (k) { if (k.indexOf(prefix) === 0) out.push(k); });
      }
      return out.sort();
    },
    /** Probes localStorage again (tests install a fake). @returns {boolean} persistent */
    detect: function () { probe(); return !!backend; },
  };
  Object.defineProperty(storage, 'persistent', { enumerable: true, get: function () { return !!ls(); } });

  // ------------------------------------------------------------------------------------------
  // Small helpers.

  function isObj(v) { return SR.util.isObject(v); }
  function num(v) { return typeof v === 'number' && isFinite(v); }
  function tuning(table, key, fallback) {
    var t = SR.tuning && SR.tuning[table];
    return t && t[key] !== undefined ? t[key] : fallback;
  }
  function loopTime() { return SR.loop && num(SR.loop.time) ? SR.loop.time : 0; }
  function now() { return Date.now(); }
  function err(reason, message) { var e = new Error(message || reason); e.reason = reason; e.code = reason; return e; }

  /** @returns {string} a canonical slot name ('slot1'...'slot3', 'auto', 'suspend', 'ironman'). */
  function slotName(slot) {
    if (typeof slot === 'number' || /^[123]$/.test(String(slot))) slot = 'slot' + slot;
    if (SLOTS.indexOf(slot) < 0) throw new Error('SR.save: unknown slot "' + slot + '" (' + SLOTS.join(', ') + ')');
    return slot;
  }
  /** @returns {object|null} the B-16 row of the state's difficulty (tuning.difficulty.<id>). */
  function difficultyRow(s) {
    var d = s && s.mode && s.mode.difficulty;
    var t = SR.tuning && SR.tuning.difficulty;
    return d && isObj(t) && isObj(t[d]) ? t[d] : null;
  }
  /** @returns {boolean} the run keeps the single ironman slot (B-16 `saves: 'ironman'`; Hardcore). */
  function hardcore(s) {
    var row = difficultyRow(s);
    if (row && typeof row.saves === 'string') return row.saves === 'ironman';
    return !!(s && s.mode && s.mode.difficulty === 'hardcore');
  }
  /** @returns {number} the ironman write debounce in ms (B-16 ironmanDebounceMs). */
  function ironmanDebounce(s) {
    var row = difficultyRow(s);
    return row && num(row.ironmanDebounceMs) && row.ironmanDebounceMs >= 0 ? row.ironmanDebounceMs : IRONMAN_DEBOUNCE_MS;
  }

  // UTF-8 base64 (pure; btoa is not available in Node's vm context and cannot take UTF-16).
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function utf8Bytes(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
        var d = str.charCodeAt(i + 1);
        if (d >= 0xdc00 && d <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++; }
      }
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }
  function utf8Decode(bytes) {
    var s = '', i = 0;
    while (i < bytes.length) {
      var b = bytes[i++], c;
      if (b < 0x80) c = b;
      else if (b >= 0xf0) { c = ((b & 7) << 18) | ((bytes[i++] & 63) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63); }
      else if (b >= 0xe0) { c = ((b & 15) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63); }
      else { c = ((b & 31) << 6) | (bytes[i++] & 63); }
      if (c > 0xffff) { c -= 0x10000; s += String.fromCharCode(0xd800 + (c >> 10), 0xdc00 + (c & 1023)); }
      else s += String.fromCharCode(c);
    }
    return s;
  }
  /** @returns {string} base64 of the UTF-8 bytes of str. */
  function b64encode(str) {
    var b = utf8Bytes(str), out = '';
    for (var i = 0; i < b.length; i += 3) {
      var n = (b[i] << 16) | ((b[i + 1] || 0) << 8) | (b[i + 2] || 0);
      out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < b.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < b.length ? B64[n & 63] : '=');
    }
    return out;
  }
  /** @returns {string} the UTF-8 text of a base64 string; throws on a character outside the alphabet. */
  function b64decode(s) {
    s = s.replace(/=+$/, '');
    if (/[^A-Za-z0-9+/]/.test(s) || s.length % 4 === 1) throw err('code', 'not base64');
    var bytes = [];
    for (var i = 0; i < s.length; i += 4) {
      var n = 0, k;
      for (k = 0; k < 4; k++) n = (n << 6) | (i + k < s.length ? B64.indexOf(s[i + k]) : 0);
      bytes.push((n >> 16) & 255);
      if (i + 2 < s.length) bytes.push((n >> 8) & 255);
      if (i + 3 < s.length) bytes.push(n & 255);
    }
    return utf8Decode(bytes);
  }
  function crcHex(s) { return SR.util.pad((SR.util.crc32(s) >>> 0).toString(16), 8); }

  // ------------------------------------------------------------------------------------------
  // Retention (ARCHITECTURE §15): keeps long Unlimited runs under the 60 KB budget.

  /** Index of the first message matching pred, or -1. */
  function firstIndex(list, pred) { for (var i = 0; i < list.length; i++) if (pred(list[i])) return i; return -1; }

  /**
   * Applies the retention caps to a state in place: messages (150; the oldest read non-archived,
   * then the oldest read archived, and only then the oldest unread), day-tagged history points
   * (daily to day 120, then every 7th morning), the log (two days of 20), rateHist and stock
   * histories (30).
   * @returns {object} s
   */
  function retain(s) {
    if (!isObj(s)) return s;
    if (Array.isArray(s.msgs) && s.msgs.length > MSG_MAX) {
      while (s.msgs.length > MSG_MAX) {
        var i = firstIndex(s.msgs, function (m) { return m && m.read && !m.archived; });
        if (i < 0) i = firstIndex(s.msgs, function (m) { return m && m.read; });
        if (i < 0) i = firstIndex(s.msgs, function (m) { return !m || !m.read; });
        s.msgs.splice(i < 0 ? 0 : i, 1);
      }
    }
    if (isObj(s.history)) {
      Object.keys(s.history).forEach(function (k) {
        var list = s.history[k];
        if (!Array.isArray(list)) return;
        // Plain numbers carry no day, so only day-tagged points ({ day } or [day, value]) are thinned.
        s.history[k] = list.filter(function (p) {
          var day = isObj(p) && num(p.day) ? p.day : Array.isArray(p) && num(p[0]) ? p[0] : null;
          return day === null || day <= HISTORY_DAILY_DAYS || (day - HISTORY_DAILY_DAYS) % HISTORY_WEEK === 0;
        });
      });
    }
    if (isObj(s.log)) {
      var logMax = tuning('news', 'logMax', LOG_MAX);
      if (!num(logMax) || logMax < 1) logMax = LOG_MAX;
      ['today', 'yesterday'].forEach(function (k) {
        if (Array.isArray(s.log[k]) && s.log[k].length > logMax) s.log[k] = s.log[k].slice(-logMax);
      });
      Object.keys(s.log).forEach(function (k) { if (k !== 'today' && k !== 'yesterday') delete s.log[k]; });
    }
    if (isObj(s.money) && Array.isArray(s.money.rateHist) && s.money.rateHist.length > RATE_HIST) {
      s.money.rateHist = s.money.rateHist.slice(-RATE_HIST);
    }
    if (isObj(s.stocks)) {
      var keep = tuning('stocks', 'history', STOCK_HIST);
      if (!num(keep) || keep < 1) keep = STOCK_HIST;
      Object.keys(s.stocks).forEach(function (t) {
        var st = s.stocks[t];
        if (isObj(st) && Array.isArray(st.hist) && st.hist.length > keep) st.hist = st.hist.slice(-keep);
      });
    }
    return s;
  }

  // ------------------------------------------------------------------------------------------
  // Validation, migration, deep-fill.

  /**
   * Checks the values a broken save would break first: the clock, money (finite, ≥ 0) and the
   * stats (in range).
   * @returns {string[]} problems (empty when the state is usable)
   */
  function validate(s) {
    var p = [];
    if (!isObj(s)) return ['state is not an object'];
    var c = s.clock;
    if (!isObj(c)) p.push('clock missing');
    else {
      if (!num(c.day) || c.day < 1 || Math.floor(c.day) !== c.day) p.push('clock.day ' + c.day);
      if (!num(c.min) || c.min < 0 || c.min > 1440) p.push('clock.min ' + c.min);
    }
    var m = s.money;
    if (!isObj(m)) p.push('money missing');
    else ['cash', 'bank'].forEach(function (k) { if (!num(m[k]) || m[k] < 0) p.push('money.' + k + ' ' + m[k]); });
    var st = s.stats;
    if (!isObj(st)) p.push('stats missing');
    else {
      var cap = tuning('start', 'statCap', 999);
      var kr = tuning('start', 'karmaRange', [-100, 100]);
      if (!Array.isArray(kr) || kr.length !== 2) kr = [-100, 100];
      ['str', 'int', 'cha'].forEach(function (k) { if (!num(st[k]) || st[k] < 0 || st[k] > cap) p.push('stats.' + k + ' ' + st[k]); });
      if (!num(st.karma) || st.karma < kr[0] || st.karma > kr[1]) p.push('stats.karma ' + st.karma);
      if (!num(st.hpMax) || st.hpMax <= 0) p.push('stats.hpMax ' + st.hpMax);
      else if (!num(st.hp) || st.hp < 0 || st.hp > st.hpMax) p.push('stats.hp ' + st.hp);
      ['heat', 'buzz'].forEach(function (k) { if (st[k] !== undefined && (!num(st[k]) || st[k] < 0)) p.push('stats.' + k + ' ' + st[k]); });
    }
    if (!num(s.seed)) p.push('seed ' + s.seed);
    return p;
  }

  /** @returns {object|null} SR.rules.state.defaults(), or null while W1-R's module is missing. */
  function defaultsState() {
    var st = SR.rules && SR.rules.state;
    if (!st || typeof st.defaults !== 'function') {
      SR.util.warnOnce('save:defaults', 'SR.save: SR.rules.state.defaults() is not available yet; loaded saves are not deep-filled');
      return null;
    }
    return st.defaults();
  }

  /**
   * Turns stored JSON into a usable state: envelope check, migrations v+1..CURRENT, deep-fill,
   * validation.
   * @returns {{state: object, meta: object}} or throws an Error whose reason is 'corrupt',
   *   'format', 'newer', 'migration' or 'invalid'
   */
  function decode(json) {
    var env;
    try { env = typeof json === 'string' ? JSON.parse(json) : json; } catch (e) { throw err('corrupt', 'the save is not valid JSON'); }
    if (!isObj(env) || env.fmt !== FMT || !isObj(env.state)) throw err('format', 'not a Paper Sky save');
    var state = env.state;
    var v = num(env.v) ? env.v : state.v;
    if (!num(v) || v < 1 || Math.floor(v) !== v) throw err('format', 'the save has no version');
    if (v > api.CURRENT) throw err('newer', 'the save comes from a newer version (v' + v + ')');
    for (var n = v + 1; n <= api.CURRENT; n++) {
      var fn = api.migrations[n];
      if (typeof fn !== 'function') throw err('migration', 'no migration to v' + n);
      try {
        var r = fn(state);
        if (r !== undefined) state = r;
      } catch (e) {
        throw err('migration', 'migration to v' + n + ' failed: ' + (e && e.message));
      }
      if (!isObj(state)) throw err('migration', 'migration to v' + n + ' returned no state');
      state.v = n;
    }
    state.v = api.CURRENT;
    var defs = defaultsState();
    if (defs) SR.util.deepFill(state, defs);
    var problems = validate(state);
    if (problems.length) throw err('invalid', 'the save has broken values: ' + problems.join(', '));
    return { state: state, meta: isObj(env.meta) ? env.meta : {} };
  }

  /**
   * Copies an unreadable raw save to sr1.broken.<timestamp> and removes the slot. When the copy
   * cannot be written (a full storage) the slot is kept as it is, so the only copy is never lost.
   * @returns {string|null} the quarantine key, or null when the copy failed
   */
  function quarantine(slot, raw, reason) {
    var key = BROKEN + now();
    var n = 1;
    while (storage.get(key) !== null) key = BROKEN + now() + '.' + (n++);
    try {
      storage.set(key, raw);
    } catch (e) {
      SR.util.warnOnce('save:quarantine', 'SR.save: could not quarantine an unreadable save (' + (e && e.message) + '); the slot is kept');
      key = null;
    }
    if (slot && key) storage.remove(PREFIX + slot);
    api.lastError = { slot: slot || null, reason: reason, key: key };
    // The UI shows "This save couldn't be read" (ARCHITECTURE §15) on this event.
    if (SR.events) SR.events.emit('save:broken', SR.util.clone(api.lastError));
    return key;
  }

  // ------------------------------------------------------------------------------------------
  // Play time and the live game.

  var run = { state: null, base: 0, t0: 0 };
  /** @returns {number} whole seconds of unpaused play in the current run. */
  function playSec() {
    var s = SR.state;
    if (!s) return 0;
    var t = loopTime();
    if (run.state !== s) { run.state = s; run.base = 0; run.t0 = t; }
    return Math.max(0, Math.floor(run.base + t - run.t0));
  }

  function thumb() {
    try {
      var src = SR.stage && SR.stage.world;
      if (!src || typeof document === 'undefined' || !src.width) return '';
      var c = document.createElement('canvas');
      c.width = THUMB_W; c.height = THUMB_H;
      c.getContext('2d').drawImage(src, 0, 0, THUMB_W, THUMB_H);
      return c.toDataURL('image/jpeg', THUMB_Q);
    } catch (e) {
      return '';
    }
  }

  function buildMeta(s, slot) {
    var title = '', nw = 0;
    try { if (SR.rules.jobs && typeof SR.rules.jobs.bestTitle === 'function') title = SR.rules.jobs.bestTitle(s) || ''; } catch (e) { title = ''; }
    try {
      nw = SR.rules.endgame && typeof SR.rules.endgame.netWorth === 'function' ? SR.rules.endgame.netWorth(s)
        : (s.money ? (s.money.cash || 0) + (s.money.bank || 0) : 0);
    } catch (e) { nw = 0; }
    return {
      slot: slot,
      name: s.player && s.player.name || '',
      day: s.clock ? s.clock.day : 1,
      min: s.clock ? s.clock.min : 0,
      length: s.mode ? s.mode.length : 0,
      difficulty: s.mode ? s.mode.difficulty : 'standard',
      inProgress: !!(s.mode && s.mode.inProgress),
      title: typeof title === 'string' ? title : '',
      netWorth: num(nw) ? nw : 0,
      savedAt: now(),
      playSec: s === SR.state ? playSec() : 0,
      thumb: s === SR.state ? thumb() : '',
    };
  }

  /** @returns {object} the envelope for s (the live state records the rules stream first). */
  function envelope(s, slot) {
    if (s === SR.state) s.rng = Object.assign({}, isObj(s.rng) ? s.rng : {}, { rules: SR.rng.rules.state() });
    retain(s);
    return { fmt: FMT, v: num(s.v) ? s.v : api.CURRENT, meta: buildMeta(s, slot), state: s };
  }

  /**
   * Makes s the live game: SR.state, the rules stream (restored from s.rng.rules, else seeded
   * with s.seed), the world stream for the day, and the play clock.
   */
  function makeLive(s, meta) {
    SR.state = s;
    var r = isObj(s.rng) ? s.rng.rules : null;
    var restored = false;
    if (Array.isArray(r) && r.length === 4) { try { SR.rng.rules.setState(r); restored = true; } catch (e) { restored = false; } }
    if (!restored) {
      SR.rng.rules.seed(s.seed);
      s.rng = Object.assign({}, isObj(s.rng) ? s.rng : {}, { rules: SR.rng.rules.state() });
    }
    SR.rng.reseedWorld(s.seed, s.clock && s.clock.day ? s.clock.day : 1);
    run = { state: s, base: meta && num(meta.playSec) ? meta.playSec : 0, t0: loopTime() };
  }

  // ------------------------------------------------------------------------------------------
  // The API.

  var lastAutoAt = -Infinity;
  var timers = { ironman: null, auto: null };

  /**
   * Writes a save: tmp, then the slot, then removes tmp. The live state records the rules stream
   * and is pruned by the retention caps first. Hardcore allows only the ironman slot.
   * @param {string|number} slot 'slot1'..'slot3' (or 1..3), 'auto', 'suspend', 'ironman'
   * @param {object=} state a state other than the live one (an imported save)
   * @returns {object} the envelope meta; throws an Error with code 'quota' when storage is full,
   *   'hardcore' for a manual slot on Hardcore, 'nogame' without a state, 'invalid' for a state
   *   the read would refuse (the slot keeps its previous save)
   */
  function write(slot, state) {
    slot = slotName(slot);
    var s = state || SR.state;
    if (!isObj(s)) throw err('nogame', 'SR.save.write: no game is running');
    if (hardcore(s) && slot !== 'ironman') throw err('hardcore', 'SR.save.write: Hardcore saves only to the ironman slot');
    // Never replace a readable save with one that the read would quarantine (a rules bug leaving
    // NaN cash, say): the slot keeps its previous save and the caller hears why.
    var problems = validate(s);
    if (problems.length) throw err('invalid', 'SR.save.write: the state has broken values (' + problems.join(', ') + '); the slot keeps its previous save');
    // A pending stake-bearing round (the minigame frame's write) is a mid-day state by definition.
    if (slot === 'ironman' && s.pending && isObj(s.mode)) s.mode.inProgress = true;
    var env = envelope(s, slot);
    var json = JSON.stringify(env);
    if (json.length > BUDGET_BYTES) SR.util.warnOnce('save:budget', 'SR.save: a save is ' + Math.round(json.length / 1024) + ' KB (budget 60 KB)');
    try {
      storage.set(TMP, json);
      storage.set(PREFIX + slot, json);
    } catch (e) {
      storage.remove(TMP);
      throw e;
    }
    storage.remove(TMP);
    if (slot === 'auto') lastAutoAt = now();
    if (SR.events) SR.events.emit('save:written', { slot: slot });
    return SR.util.clone(env.meta);
  }

  /**
   * Reads a slot into a state (not live). An unreadable save is quarantined to
   * sr1.broken.<timestamp> and the slot removed; a newer version is refused and kept.
   * @returns {object|null} the state, or null (SR.save.lastError says why)
   */
  function read(slot) {
    slot = slotName(slot);
    var raw = storage.get(PREFIX + slot);
    if (raw === null || raw === undefined) return null;
    try {
      var res = decode(raw);
      api.lastError = null;
      return res.state;
    } catch (e) {
      if (e.reason === 'newer') { api.lastError = { slot: slot, reason: 'newer', key: null }; return null; }
      quarantine(slot, raw, e.reason || 'corrupt');
      return null;
    }
  }

  /** @returns {object|null} a slot's meta without decoding its state. */
  function readMeta(slot) {
    var raw = storage.get(PREFIX + slot);
    if (raw === null || raw === undefined) return undefined;
    try {
      var env = JSON.parse(raw);
      return isObj(env) && env.fmt === FMT && isObj(env.meta) ? env.meta : null;
    } catch (e) { return null; }
  }

  /**
   * Makes a save the live game: a slot (read, deep-filled and validated) or a state object (a new
   * game from SR.rules.state.create, an imported code or file). Loading the suspend slot deletes
   * it; loading an ironman save with `pending` applies its worst result first.
   * @param {string|number|object} x a slot or a state
   * @returns {object|null} the live state, or null when the slot is missing or unreadable
   */
  function load(x) {
    var s, meta = null, slot = null;
    if (isObj(x)) {
      var defs = defaultsState();
      s = x;
      if (defs) SR.util.deepFill(s, defs);
      if (!num(s.v)) s.v = api.CURRENT;
      var problems = validate(s);
      if (problems.length) throw err('invalid', 'SR.save.load: the state has broken values: ' + problems.join(', '));
    } else {
      slot = slotName(x);
      s = read(slot);
      if (!s) return null;
      meta = readMeta(slot);
    }
    makeLive(s, meta);
    if (slot === 'suspend') storage.remove(PREFIX + 'suspend');
    if (s.pending && isObj(s.pending) && s.pending.resolve) applyPending(s);
    if (SR.events) SR.events.emit('save:loaded', { slot: slot });
    return s;
  }

  /** Hardcore: closing the tab mid-minigame is a loss, so the saved worst result is applied. */
  function applyPending(s) {
    var p = s.pending;
    s.pending = null;
    if (typeof SR.act !== 'function') {
      SR.util.warnOnce('save:pending', 'SR.save: SR.act is not available; a pending minigame result was dropped');
      return;
    }
    try { SR.act(p.resolve, p.worst); } catch (e) { if (typeof console !== 'undefined') console.error('SR.save: applying the pending result failed', e); }
    if (hardcore(s)) { try { write('ironman'); } catch (e) { SR.util.warnOnce('save:ironman', 'SR.save: ironman write failed (' + e.message + ')'); } }
  }

  /** @returns {string} 'PSKY1:' + base64(JSON of the envelope) + ':' + CRC-32 hex of the base64 part. */
  function exportCode(slot) {
    var json;
    if (slot !== undefined && !isObj(slot)) {
      json = storage.get(PREFIX + slotName(slot));
      if (json === null) throw err('empty', 'SR.save.exportCode: slot ' + slot + ' is empty');
    } else {
      var s = isObj(slot) ? slot : SR.state;
      if (!isObj(s)) throw err('nogame', 'SR.save.exportCode: no game is running');
      json = JSON.stringify(envelope(s, null));
    }
    var b = b64encode(json);
    return CODE_PREFIX + b + ':' + crcHex(b);
  }

  /**
   * Decodes a save code (prefix, checksum, then the read pipeline). Does not make it live.
   * @returns {object} the state; throws an Error whose reason is 'code', 'checksum' or a read reason
   */
  function importCode(code) {
    code = String(code === undefined || code === null ? '' : code).replace(/\s+/g, '');
    if (code.indexOf(CODE_PREFIX) !== 0) throw err('code', 'not a Paper Sky save code');
    var body = code.slice(CODE_PREFIX.length);
    var cut = body.lastIndexOf(':');
    if (cut < 0) throw err('code', 'the save code has no checksum');
    var b = body.slice(0, cut), crc = body.slice(cut + 1).toLowerCase();
    if (!/^[0-9a-f]{8}$/.test(crc) || crcHex(b) !== crc) throw err('checksum', 'the save code is damaged (checksum)');
    return decode(b64decode(b)).state;
  }

  /** Shows the code in a read-only, pre-selected textarea (the clipboard fallback of UI.md §5.16). */
  function showCodeModal(code) {
    if (typeof document === 'undefined') return null;
    var host = document.getElementById('ui') || document.body;
    var old = host.querySelector('[data-id="save-code"]');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var prevFocus = document.activeElement;
    var t = function (k) { return SR.text(k); };

    var scrim = document.createElement('div');
    scrim.setAttribute('data-id', 'save-code');
    scrim.setAttribute('role', 'dialog');
    scrim.setAttribute('aria-modal', 'true');
    scrim.setAttribute('aria-label', t('ui.save.codeTitle'));
    scrim.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;display:flex;align-items:center;' +
      'justify-content:center;background:var(--scrim);z-index:40;pointer-events:auto';
    var box = document.createElement('div');
    box.style.cssText = 'width:480px;box-sizing:border-box;padding:24px;display:flex;flex-direction:column;gap:12px;' +
      'background:var(--paper-0);color:var(--ink-900);border:var(--line);border-radius:var(--r-l);box-shadow:var(--e-3);' +
      'font-family:var(--font-ui);font-size:var(--fs-16)';
    var title = document.createElement('h2');
    title.setAttribute('data-id', 'save-code-title');
    title.style.cssText = 'margin:0;font-family:var(--font-display);font-size:var(--fs-24);font-weight:900';
    title.textContent = t('ui.save.codeTitle');
    var hint = document.createElement('p');
    hint.setAttribute('data-id', 'save-code-hint');
    hint.style.margin = '0';
    hint.textContent = t('ui.save.copyHint');
    var area = document.createElement('textarea');
    area.setAttribute('data-id', 'save-code-text');
    area.setAttribute('aria-label', t('ui.save.codeTitle'));
    area.readOnly = true;
    area.rows = 6;
    area.spellcheck = false;
    area.value = code;
    area.style.cssText = 'width:100%;box-sizing:border-box;resize:none;font-family:monospace;font-size:var(--fs-12);' +
      'word-break:break-all;border:var(--line-thin);border-radius:var(--r-s);padding:8px;background:var(--paper-1);color:var(--ink-900);touch-action:pan-y';
    var close = document.createElement('button');
    close.type = 'button';
    close.setAttribute('data-id', 'save-code-close');
    close.setAttribute('data-nav', '');
    close.textContent = t('ui.close');
    close.style.cssText = 'align-self:flex-end;min-height:44px;padding:0 16px;border:var(--line);border-radius:var(--r-m);' +
      'background:var(--primary-600);color:var(--primary-ink);font:inherit;font-weight:700;cursor:pointer';

    area.setAttribute('data-nav', '');
    var scope = null;
    function dismiss() {
      if (!scrim.parentNode) return;
      scrim.parentNode.removeChild(scrim);
      if (scope && SR.ui.focus && typeof SR.ui.focus.pop === 'function') { try { SR.ui.focus.pop(scope); } catch (e) { /* ignore */ } scope = null; }
      else if (prevFocus && typeof prevFocus.focus === 'function') { try { prevFocus.focus(); } catch (e) { /* ignore */ } }
    }
    close.addEventListener('click', dismiss);
    // The modal owns the keyboard while it has focus: Esc (and Enter / Space on its button) close
    // it, and no key press reaches SR.input's window listener (the game below never acts).
    // Releases (keyup) pass through: the key that opened the modal (Enter on "Copy save code") is
    // released inside it, and SR.input must see that release or confirm / interact stay held.
    var own = function (e) {
      var k = e.code || e.key;
      if (k === 'Escape' || (e.target === close && (k === 'Enter' || k === 'NumpadEnter' || k === 'Space' || e.key === ' '))) {
        e.preventDefault();
        dismiss();
      }
      e.stopPropagation();
    };
    scrim.addEventListener('keydown', own);
    area.addEventListener('focus', function () { area.select(); });

    box.appendChild(title); box.appendChild(hint); box.appendChild(area); box.appendChild(close);
    scrim.appendChild(box);
    host.appendChild(scrim);
    // A focus scope (W1-D) keeps Tab inside the modal and restores focus afterwards.
    if (SR.ui.focus && typeof SR.ui.focus.push === 'function') {
      try { scope = SR.ui.focus.push(scrim, { id: 'save-code', initial: area }); } catch (e) { scope = null; }
    }
    try { area.focus(); area.select(); } catch (e) { /* ignore */ }
    return scrim;
  }

  /**
   * Copies the live game's save code to the clipboard; when the clipboard is unavailable or
   * rejects, shows the textarea fallback instead.
   * @returns {Promise<{copied: boolean, code: string, fallback: boolean}>}
   */
  function copyCode() {
    var code = exportCode();
    return new Promise(function (resolve) {
      var fallback = function () { showCodeModal(code); resolve({ copied: false, code: code, fallback: true }); };
      var clip = null;
      try { clip = typeof navigator !== 'undefined' ? navigator.clipboard : null; } catch (e) { clip = null; }
      if (!clip || typeof clip.writeText !== 'function') { fallback(); return; }
      var p;
      try { p = clip.writeText(code); } catch (e) { fallback(); return; }
      Promise.resolve(p).then(function () { resolve({ copied: true, code: code, fallback: false }); }, fallback);
    });
  }

  /**
   * Downloads the live game (or a slot) as a JSON file (a Blob link; works from file://).
   * @returns {string} the file name
   */
  function exportFile(slot) {
    var json;
    if (slot !== undefined) {
      json = storage.get(PREFIX + slotName(slot));
      if (json === null) throw err('empty', 'SR.save.exportFile: slot ' + slot + ' is empty');
    } else {
      if (!isObj(SR.state)) throw err('nogame', 'SR.save.exportFile: no game is running');
      json = JSON.stringify(envelope(SR.state, null));
    }
    var env = JSON.parse(json);
    var who = String(env.meta && env.meta.name || 'save').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'save';
    var name = 'paper-sky-' + who + '-day' + (env.meta && env.meta.day || 1) + '.json';
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); if (a.parentNode) a.parentNode.removeChild(a); }, 1000);
    return name;
  }

  /**
   * Reads a save file (an exported JSON envelope, or a text file holding a save code).
   * @param {Blob|File} file
   * @returns {Promise<object>} the state (not live); rejects with an Error whose reason says why
   */
  function importFile(file) {
    return new Promise(function (resolve, reject) {
      if (!file) { reject(err('file', 'no file')); return; }
      var done = function (text) {
        try {
          text = String(text).trim();
          resolve(text.indexOf(CODE_PREFIX) === 0 ? importCode(text) : decode(text).state);
        } catch (e) { reject(e); }
      };
      if (typeof file.text === 'function') { file.text().then(done, function (e) { reject(err('file', e && e.message)); }); return; }
      var fr = new FileReader();
      fr.onload = function () { done(fr.result); };
      fr.onerror = function () { reject(err('file', 'the file could not be read')); };
      fr.readAsText(file);
    });
  }

  /** @returns {{slot: string, meta: object|null, broken: boolean}[]} the saves that exist. */
  function list() {
    var out = [];
    SLOTS.forEach(function (slot) {
      var meta = readMeta(slot);
      if (meta === undefined) return;
      out.push({ slot: slot, meta: meta ? SR.util.clone(meta) : null, broken: meta === null });
    });
    return out;
  }

  var PROFILE_DEFAULTS = { v: 1, achievements: {}, hallOfFame: {}, badges: {}, hintsSeen: {}, totals: {} };
  /** @returns {object} the profile (achievements, Hall of Fame, badges, hints seen, lifetime totals). */
  function profile() {
    var p = null, raw = storage.get(PROFILE);
    if (raw) { try { p = JSON.parse(raw); } catch (e) { p = null; SR.util.warnOnce('save:profile', 'SR.save: the profile was unreadable; starting a new one'); } }
    if (!isObj(p)) p = {};
    return SR.util.deepFill(p, PROFILE_DEFAULTS);
  }
  /** Saves the profile. */
  function saveProfile(p) {
    if (!isObj(p)) throw new Error('SR.save.saveProfile: the profile must be an object');
    storage.set(PROFILE, JSON.stringify(p));
  }

  /**
   * Finishes a write interrupted between tmp and its slot: a tmp newer than its slot is copied
   * there; tmp is always removed.
   * @returns {string|null} the slot restored, or null
   */
  function recover() {
    var raw = storage.get(TMP);
    if (raw === null) return null;
    var restored = null;
    try {
      var env = JSON.parse(raw);
      var slot = isObj(env) && isObj(env.meta) ? env.meta.slot : null;
      if (env.fmt === FMT && SLOTS.indexOf(slot) >= 0) {
        var cur = readMeta(slot);
        if (!cur || !num(cur.savedAt) || (num(env.meta.savedAt) && env.meta.savedAt > cur.savedAt)) {
          storage.set(PREFIX + slot, raw);
          restored = slot;
        }
      }
    } catch (e) { restored = null; }
    storage.remove(TMP);
    return restored;
  }

  // ------------------------------------------------------------------------------------------
  // Autosave and the Hardcore ironman slot (ARCHITECTURE §15, BALANCE B-19).

  function writeIronman(now_) {
    if (timers.ironman) { clearTimeout(timers.ironman); timers.ironman = null; }
    var go = function () {
      timers.ironman = null;
      var s = SR.state;
      if (!hardcore(s) || s.over) return;
      try { write('ironman'); } catch (e) { SR.util.warnOnce('save:ironman', 'SR.save: ironman write failed (' + e.message + ')'); }
    };
    if (now_) go(); else timers.ironman = setTimeout(go, ironmanDebounce(SR.state));
  }

  function autosave() {
    var s = SR.state;
    if (!isObj(s) || hardcore(s) || s.over) return;
    try { write('auto'); } catch (e) { SR.util.warnOnce('save:auto', 'SR.save: autosave failed (' + e.message + ')'); }
  }

  var CHANGE_KINDS = { hp: 1, hpMax: 1, cash: 1, bank: 1, karma: 1 };

  function listen() {
    var E = SR.events;
    E.on('action:done', function (p) {
      var s = SR.state;
      if (!hardcore(s)) return;
      if (s.pending && p && p.id === s.pending.resolve) s.pending = null;
      var r = p && p.result;
      var changed = r && Array.isArray(r.deltas) && r.deltas.some(function (d) { return d && CHANGE_KINDS[d.kind] && d.from !== d.to; });
      if (changed || (r && r.id && /:resolve$/.test(r.id))) {
        s.mode.inProgress = true;
        writeIronman(false);
      }
    });
    E.on('day:started', function () {
      var s = SR.state;
      if (!isObj(s)) return;
      if (hardcore(s)) { s.mode.inProgress = false; writeIronman(true); } else autosave();
    });
    E.on('door:exited', function () {
      var s = SR.state;
      if (!isObj(s) || hardcore(s)) return;
      var wait = lastAutoAt + AUTO_GAP_MS - now();
      if (wait <= 0) { autosave(); return; }
      if (!timers.auto) timers.auto = setTimeout(function () { timers.auto = null; autosave(); }, wait);
    });
    var died = function () { if (hardcore(SR.state)) { writeIronman.cancel(); storage.remove(PREFIX + 'ironman'); } };
    E.on('game:over', function (p) { if (p && p.reason === 'death') died(); });
    E.on('player:down', function (p) { if (p && p.outcome === 'death') died(); });
    // A debounced ironman write or a deferred autosave must not be lost when the tab goes away.
    var flush = function () { api.flush(); };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(); });
    if (typeof window.addEventListener === 'function') window.addEventListener('pagehide', flush);
  }
  writeIronman.cancel = function () { if (timers.ironman) { clearTimeout(timers.ironman); timers.ironman = null; } };

  var api = {
    /** The state schema version this build writes (ARCHITECTURE §15; v2 arrives in wave 3). */
    CURRENT: 1,
    /** migrations[n](state) turns a v n-1 state into v n (returns the state or mutates it). */
    migrations: {},
    /** { slot, reason, key } of the last read that failed, or null. */
    lastError: null,
    SLOTS: SLOTS.slice(),
    storage: storage,
    write: write,
    read: read,
    load: load,
    list: list,
    /** Deletes a slot. */
    remove: function (slot) { storage.remove(PREFIX + slotName(slot)); },
    exportCode: exportCode,
    importCode: importCode,
    copyCode: copyCode,
    exportFile: exportFile,
    importFile: importFile,
    profile: profile,
    saveProfile: saveProfile,
    retain: retain,
    validate: validate,
    recover: recover,
    /** @returns {number} seconds of play in the current run (meta.playSec). */
    playSec: playSec,
    /** Writes a debounced ironman or autosave immediately (tests, before a page unload). */
    flush: function () { if (timers.ironman) writeIronman(true); if (timers.auto) { clearTimeout(timers.auto); timers.auto = null; autosave(); } },
  };
  /** @returns {boolean} saves persist (localStorage works); false = memory only (the boot warns). */
  Object.defineProperty(api, 'available', { enumerable: true, get: function () { return storage.persistent; } });

  SR.save = api;

  SR.onBoot(10, function () {
    recover();
    listen();
  });
})();
