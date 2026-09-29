// js/core/debug.js — owner: W1-K. SR.debug: the test and debug API (ARCHITECTURE §20;
// docs/CONTRACT.md §17), always present; tests/harness.cjs drives the game through it. Also the
// URL flags: index.html#debug shows the FPS and perf overlay, index.html#artbible opens the
// 'artbible' scene (registered here, D25), which draws SR.art.bible.draw (W1-A).
// Every function checks that the module it drives has landed and says clearly when it has not.
// Load-time clean: registers the artbible scene and boot hooks only.
(function () {
  'use strict';
  var SR = window.SR;
  var hasOwn = Object.prototype.hasOwnProperty;

  var OVERLAY_MS = 250;                // overlay refresh period
  var UI_TEXT_MAX = 160;               // characters of text per element in ui()
  var UI_ITEMS_MAX = 400;
  var DEFAULT_SEED = 12345;            // newGame without a seed (the schema's example seed)

  var flags = { grid: false, time: false, projected: false };
  var fastOn = false;
  var overlay = null, overlayTimer = null;

  function need(obj, name, owner) {
    if (!obj) throw new Error('SR.debug: ' + name + ' is not available yet (' + owner + ')');
    return obj;
  }
  function state() { return need(SR.state, 'a running game (SR.state)', 'newGame first'); }
  function ctx(source) { var s = state(); return { rng: SR.rng.rules, now: s.clock.min, source: source || 'debug' }; }
  function hashFlags() {
    if (typeof location === 'undefined') return [];
    return String(location.hash || '').replace(/^#/, '').split(/[&,#]/).filter(Boolean);
  }

  /** @returns {*} the value at a dotted path of obj ('stats.hp', 'msgs.0.key'). */
  function at(obj, path) {
    if (path === undefined || path === null || path === '') return obj;
    var seg = String(path).split('.');
    for (var i = 0; i < seg.length; i++) {
      if (obj === null || obj === undefined) return undefined;
      obj = obj[seg[i]];
    }
    return obj;
  }

  // ------------------------------------------------------------------------------------------
  // ui(): a JSON summary of what is visible in #ui.

  function visible(el) {
    if (!el.getClientRects || !el.getClientRects().length) return false;
    var cs = window.getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  }
  function txt(el) { return String(el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, UI_TEXT_MAX); }
  function disabled(el) {
    return !!(el.disabled || el.getAttribute('aria-disabled') === 'true' || el.hasAttribute('data-disabled') ||
      (el.closest && el.closest('[aria-disabled="true"]')));
  }

  function uiSummary() {
    var out = { scenes: SR.scenes.stack() };
    var top = SR.scenes.top();
    out.top = top ? top.id : null;
    if (SR.input && typeof SR.input.contexts === 'function') out.contexts = SR.input.contexts();
    if (typeof document === 'undefined') return out;
    var root = document.getElementById('ui');
    if (!root) return out;
    var items = [], rows = [], toasts = [];
    var list = root.querySelectorAll('[data-id]');
    for (var i = 0; i < list.length && items.length < UI_ITEMS_MAX; i++) {
      var el = list[i];
      if (!visible(el)) continue;
      var id = el.getAttribute('data-id');
      var item = { id: id, tag: el.tagName.toLowerCase(), text: txt(el), enabled: !disabled(el) };
      if (el === document.activeElement) item.focused = true;
      items.push(item);
      if (/^row[-.:]/.test(id)) {                        // ActionRows: data-id="row-<action id>" (W1-D)
        var chips = [];
        var cl = el.querySelectorAll('[data-id^="chip"], [data-chip]');
        for (var j = 0; j < cl.length; j++) chips.push(txt(cl[j]));
        rows.push({ id: id, action: id.replace(/^row[-.:]/, ''), text: item.text, enabled: item.enabled, chips: chips });
      }
      if (/^toast/.test(id)) toasts.push({ id: id, text: item.text });
    }
    out.items = items;
    out.rows = rows;
    out.toasts = SR.ui.toast && typeof SR.ui.toast.list === 'function' ? SR.ui.toast.list() : toasts;
    if (SR.ui && SR.ui.card && typeof SR.ui.card.debug === 'function') {
      try { out.card = SR.ui.card.debug(); } catch (e) { out.card = { error: String(e && e.message) }; }
    }
    return out;
  }

  // ------------------------------------------------------------------------------------------
  // fast(): skip animations (the CSS side: html.sr-fast).

  function fastStyle(on) {
    if (typeof document === 'undefined') return;
    var root = document.documentElement;
    if (on) root.classList.add('sr-fast'); else root.classList.remove('sr-fast');
    if (on && !document.querySelector('style[data-id="sr-fast"]')) {
      var st = document.createElement('style');
      st.setAttribute('data-id', 'sr-fast');
      st.textContent = 'html.sr-fast *, html.sr-fast *::before, html.sr-fast *::after {' +
        ' transition-duration: 0s !important; transition-delay: 0s !important;' +
        ' animation-duration: 0s !important; animation-delay: 0s !important; }';
      document.head.appendChild(st);
    }
  }

  // ------------------------------------------------------------------------------------------
  // The #debug overlay.

  function f1(v) { return typeof v === 'number' ? (Math.round(v * 100) / 100).toFixed(2) : '-'; }

  function overlayText() {
    var p = SR.loop ? SR.loop.perf : null;
    var st = SR.stage || {};
    var lines = [];
    if (p) {
      lines.push('fps ' + (SR.loop.paused ? '-' : p.fps) + '   upd ' + f1(p.update.p50) + ' / ' + f1(p.update.p95) + ' ms   rnd ' + f1(p.render.p50) + ' / ' + f1(p.render.p95) + ' ms');
      lines.push('draws ' + p.draws + '   img p95 ' + p.drawImages.p95 + '   fill p95 ' + p.fills.p95 + '   steps ' + SR.loop.steps + (SR.loop.paused ? '   PAUSED' : ''));
    }
    if (SR.quality) lines.push('quality ' + SR.quality.preset + (SR.quality.auto ? ' (auto)' : ''));
    if (st.box) {
      var b = st.box;
      lines.push('k ' + f1(st.k) + '   uiK ' + f1(st.uiK) + '   dpr ' + f1(st.dpr) + '   backing ' + b.backingW + 'x' + b.backingH + (st.compact ? '   compact' : ''));
    }
    if (SR.render && typeof SR.render.stats === 'function') {
      try {
        var rs = SR.render.stats();
        if (rs && typeof rs === 'object') {
          lines.push('render ' + Object.keys(rs).map(function (k) {
            var v = rs[k];
            return k + ' ' + (v && typeof v === 'object' ? (v.count !== undefined ? v.count + (v.max !== undefined ? '/' + v.max : '') : '…') : v);
          }).join('   ').slice(0, 100));
        }
      } catch (e) { /* ignore */ }
    }
    lines.push('scenes ' + SR.scenes.stack().join(' > ') + (SR.input ? '   input ' + SR.input.last : ''));
    if (SR.state && SR.state.clock) lines.push('day ' + SR.state.clock.day + '   ' + SR.text.time(SR.state.clock.min, false));
    return lines.join('\n');
  }

  function showOverlay(on) {
    if (typeof document === 'undefined') return;
    if (!on) {
      if (overlayTimer) { clearInterval(overlayTimer); overlayTimer = null; }
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      overlay = null;
      return;
    }
    if (overlay) return;
    overlay = document.createElement('pre');
    overlay.setAttribute('data-id', 'debug-overlay');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.cssText = 'position:fixed;left:4px;bottom:4px;z-index:1000;margin:0;padding:6px 8px;pointer-events:none;' +
      'font:11px/1.35 monospace;white-space:pre;background:var(--ink-900);color:var(--paper-0);opacity:0.85;border-radius:4px';
    (document.getElementById('app') || document.body).appendChild(overlay);
    var paint = function () { try { overlay.textContent = overlayText(); } catch (e) { overlay.textContent = String(e && e.message); } };
    paint();
    overlayTimer = setInterval(paint, OVERLAY_MS);
  }

  // ------------------------------------------------------------------------------------------
  // The art-bible scene (#artbible).

  var bibleDirty = true, bibleOff = null;
  SR.scenes.register('artbible', {
    kind: 'base',
    enter: function () {
      bibleDirty = true;
      bibleOff = SR.events.on('stage:resized', function () { bibleDirty = true; });
    },
    exit: function () {
      if (bibleOff) { bibleOff(); bibleOff = null; }
      var c = SR.stage && SR.stage.ctx;
      if (c) c.clearRect(0, 0, SR.W, SR.H);
    },
    render: function (c) {
      if (!bibleDirty || !c) return;
      bibleDirty = false;
      c.clearRect(0, 0, SR.W, SR.H);
      if (SR.art.bible && typeof SR.art.bible.draw === 'function') {
        c.save();
        try { SR.art.bible.draw(c); } finally { c.restore(); }
      } else {
        SR.util.warnOnce('debug:bible', 'SR.debug: SR.art.bible.draw is not available yet (W1-A); the art bible is blank');
      }
    },
    onAction: function (action) {
      if (action !== 'back') return;
      // Drop #artbible from the URL (no history entry), so the route can be opened again.
      try { if (/artbible/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ }
      SR.scenes.go('title');
    },
  });

  // ------------------------------------------------------------------------------------------

  SR.debug = {
    /** Reseeds the rules stream (and the running game's seed, if any). */
    seed: function (n) {
      SR.rng.rules.seed(n);
      if (SR.state) { SR.state.seed = n; SR.state.rng = { rules: SR.rng.rules.state() }; }
      return SR.rng.rules.state();
    },
    /** Turns a feature flag (BUILD_PLAN Appendix B) on or off at runtime. */
    feature: function (flag, on) {
      if (!hasOwn.call(SR.features, flag)) throw new Error('SR.debug.feature: unknown flag "' + flag + '"');
      SR.features[flag] = !!on;
      return SR.features[flag];
    },
    /** Replaces the scene stack with sceneId (no transition). @returns {string[]} the stack */
    goto: function (sceneId, params) { SR.scenes.go(sceneId, params, { transition: false }); return SR.scenes.stack(); },

    /**
     * Starts a new game from SR.rules.state.create(opts) and makes it live (SR.save.load: the rules
     * stream, the world stream, the play clock). opts.scene / opts.sceneParams go to a scene.
     * @returns {object} the new state
     */
    newGame: function (opts) {
      var mod = need(SR.rules.state && typeof SR.rules.state.create === 'function' ? SR.rules.state : null, 'SR.rules.state.create', 'W1-R');
      opts = Object.assign({ seed: DEFAULT_SEED }, opts || {});
      var scene = opts.scene, sceneParams = opts.sceneParams;
      delete opts.scene; delete opts.sceneParams;
      var s = mod.create(opts);
      SR.save.load(s);
      if (scene) SR.scenes.go(scene, sceneParams, { transition: false });
      return SR.state;
    },
    /** Deep-merges patch into the live state (objects merge, arrays replace). @returns {object} the state */
    set: function (patch) { SR.util.merge(state(), patch || {}); return SR.state; },
    /** @returns {*} the live state, or the value at a dotted path ('stats.hp'). */
    get: function (path) { return at(SR.state, path); },
    /** Runs an action through SR.act. @returns {object} the Result */
    act: function (id, params) { need(typeof SR.act === 'function' ? SR.act : null, 'SR.act', 'W1-R'); state(); return SR.act(id, params); },
    /** @returns {object} SR.preview(id, params) */
    preview: function (id, params) { need(typeof SR.preview === 'function' ? SR.preview : null, 'SR.preview', 'W1-R'); state(); return SR.preview(id, params); },
    /**
     * Opens a building as its door would: door ids and 'home' go through SR.world.doors.resolve
     * (Live / Owned / For Sale), anything else opens that building def.
     * @returns {string[]} the scene stack
     */
    enter: function (buildingId) {
      var target = { id: buildingId, params: {} };
      var doors = SR.world.doors;
      var door = buildingId;
      if (buildingId === 'home' && SR.state && SR.state.homes) {
        var h = SR.reg.home[SR.state.homes.living];
        if (h && h.door) door = h.door;
      }
      if (doors && typeof doors.resolve === 'function' && SR.state) {
        try {
          var r = doors.resolve(door, SR.state);
          if (r && r.id) target = { id: r.id, params: r.params || {} };
        } catch (e) { /* not a door id: open the building def directly */ }
      }
      SR.scenes.go('building', { id: target.id, params: target.params }, { transition: false });
      return SR.scenes.stack();
    },
    /** Moves the player (world entity and saved position). @returns {{x: number, y: number}} */
    teleport: function (x, y) {
      var s = SR.state;
      if (s && s.player) { s.player.x = x; s.player.y = y; }
      if (typeof SR.world.teleport === 'function') return SR.world.teleport(x, y) || { x: x, y: y };   // W1-W: doors disarmed, camera snapped
      var p = SR.world.player;
      if (p && typeof p.teleport === 'function') p.teleport(x, y);
      else if (p && typeof p.x === 'number') { p.x = x; p.y = y; p.vx = 0; p.vy = 0; if (Array.isArray(p.path)) p.path.length = 0; }
      else if (p && p.entity && typeof p.entity.x === 'number') { p.entity.x = x; p.entity.y = y; }
      var cam = SR.world.camera;
      if (cam && typeof cam.snap === 'function') cam.snap();
      return { x: x, y: y };
    },
    /** Sets the clock (0..1440) and emits time:advanced. @returns {number} the minute */
    setTime: function (min) {
      var s = state();
      var from = s.clock.min;
      s.clock.min = SR.util.clamp(Math.round(min), 0, 1440);
      SR.events.emit('time:advanced', { from: from, to: s.clock.min, reason: 'debug' });
      return s.clock.min;
    },
    /** Sets the day (the world stream follows it). @returns {number} the day */
    setDay: function (d) {
      var s = state();
      s.clock.day = Math.max(1, Math.floor(d));
      SR.rng.reseedWorld(s.seed, s.clock.day);
      return s.clock.day;
    },
    /** Runs exactly n fixed steps and one render (SR.loop.step). @returns {number} n */
    step: function (frames) { return need(SR.loop, 'SR.loop', 'W1-K').step(frames === undefined ? 1 : frames); },
    /** Presses and releases an action (SR.input.inject). */
    press: function (action) { var i = need(SR.input, 'SR.input', 'W1-K'); i.inject(action, true); i.inject(action, false); return true; },
    /** Holds an action for n steps, then releases it. */
    hold: function (action, frames) {
      var i = need(SR.input, 'SR.input', 'W1-K');
      i.inject(action, true);
      try { SR.loop.step(frames === undefined ? 1 : frames); } finally { i.inject(action, false); }
      return true;
    },
    /** Forces the next minigame's result (SR.minigame.force, W1-M). @returns {number} results queued */
    mg: function (result) { return need(typeof SR.minigame.force === 'function' ? SR.minigame.force : null, 'SR.minigame.force', 'W1-M')(result); },
    /** Skips animations and typewriters (html.sr-fast; scenes skip transitions). @returns {boolean} the flag */
    fast: function (on) {
      if (on === undefined) return fastOn;
      fastOn = !!on;
      fastStyle(fastOn);
      return fastOn;
    },
    /** @returns {object} loop perf, quality, stage scale and the render caches' stats. */
    perf: function () {
      var out = { loop: SR.loop ? SR.loop.perf : null };
      if (SR.quality) out.quality = { preset: SR.quality.preset, auto: SR.quality.auto, params: SR.quality.params };
      if (SR.stage && SR.stage.box) out.stage = { k: SR.stage.k, uiK: SR.stage.uiK, dpr: SR.stage.dpr, scale: SR.stage.scale, compact: SR.stage.compact, box: SR.stage.box };
      if (SR.render && typeof SR.render.stats === 'function') { try { out.render = SR.render.stats(); } catch (e) { out.render = null; } }
      return out;
    },
    /** @returns {string} a PNG data URL of canvas#world. */
    shot: function () { return need(SR.stage && SR.stage.world, 'SR.stage.world', 'W1-K').toDataURL('image/png'); },
    /** @returns {object} the visible UI: scene stack, contexts, [data-id] items, card rows with chips, toasts. */
    ui: uiSummary,
    /** Debug overlays drawn by the world and render modules, which read SR.debug.flags. */
    grid: function (on) { return setFlag('grid', on); },
    time: function (on) { return setFlag('time', on); },
    projected: function (on) { return setFlag('projected', on); },
    flags: flags,
    /**
     * Runs a night (SR.rules.night.run), re-emits the Report's events and then finishes the night
     * as the report scene does (day:started { day, report }: the world stream is reseeded for the
     * new day, the HUD and card refresh, the autosave runs). @returns {object} the Report
     */
    night: function (kind) {
      var night = need(SR.rules.night && typeof SR.rules.night.run === 'function' ? SR.rules.night : null, 'SR.rules.night.run', 'W1-E');
      var s = state();
      var rep = night.run(s, ctx(), { kind: kind || 'sleep' });
      if (rep && Array.isArray(rep.events)) rep.events.forEach(function (e) { if (e && e.name) SR.events.emit(e.name, e.payload); });
      if (SR.state === s && s.clock) SR.events.emit('day:started', { day: rep && typeof rep.day === 'number' ? rep.day : s.clock.day, report: rep });
      return rep;
    },
    /** Forces HP 0 through SR.rules.health.down and emits player:down. @returns {object} the Down */
    down: function (cause) {
      var health = need(SR.rules.health && typeof SR.rules.health.down === 'function' ? SR.rules.health : null, 'SR.rules.health.down', 'W1-E');
      var s = state();
      cause = cause || 'other';
      s.stats.hp = 0;
      var d = health.down(s, cause, ctx());
      SR.events.emit('player:down', { cause: cause, outcome: d ? d.outcome : null, down: d });
      return d;
    },
    /** Pins a quality preset (SR.quality.set). @returns {string} the effective preset */
    quality: function (preset) { return need(SR.quality, 'SR.quality', 'W1-K').set(preset); },
    /** Shows or hides the #debug overlay. @returns {boolean} */
    overlay: function (on) { showOverlay(on !== false); return !!overlay; },
  };

  function setFlag(name, on) {
    flags[name] = on === undefined ? !flags[name] : !!on;
    SR.events.emit('debug:changed', { flag: name, on: flags[name] });
    if (SR.render && typeof SR.render.invalidate === 'function') { try { SR.render.invalidate('all'); } catch (e) { /* ignore */ } }
    return flags[name];
  }

  // #artbible replaces the first scene; #debug shows the overlay. Both also follow hash changes.
  SR.onBoot(90, function (opts) {
    if (hashFlags().indexOf('artbible') >= 0 && (opts.scene === undefined || opts.scene === 'boot')) opts.scene = 'artbible';
  });
  SR.onBoot(50, function () {
    if (typeof window.addEventListener !== 'function' || typeof document === 'undefined') return;
    showOverlay(hashFlags().indexOf('debug') >= 0);
    window.addEventListener('hashchange', function () {
      var f = hashFlags();
      showOverlay(f.indexOf('debug') >= 0);
      var top = SR.scenes.top();
      if (f.indexOf('artbible') >= 0 && (!top || top.id !== 'artbible')) SR.scenes.go('artbible');
      else if (f.indexOf('artbible') < 0 && top && top.id === 'artbible') SR.scenes.go('title');
    });
  });
})();
