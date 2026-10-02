// js/scenes/minigame.js — owner: W1-M. The 'minigame' overlay scene: the shared frame of UI §5.8
// (top bar with Exit, title, stake, cash, Auto and Assist; the canvas play area; the bottom bar
// with key hints, Pause and a status line), the engine's input context (pushed on open, popped on
// close and while another overlay covers the frame), the pause and exit-confirm panels, the Auto
// replay and result banner, the accessible state mirror (host.label, host.aria), and the music: a
// game's own song while it plays, else the song below held 6 dB down (ART_AUDIO §13.4).
// params = { id: engineId, skin: skinId|null, params } (CONTRACT §11.3); SR.minigame.run pushes it.
//
// The host an engine receives (ARCHITECTURE §10, CONTRACT §13, plus the W1-M additions marked +):
//   state (a read-only copy of SR.state) · rng (SR.rng.rules) · fx (SR.rng.fx) · ui (a DOM layer
//   over the play area; pointer-events none, its children get them) · audio { sfx, stinger }
//   (no-ops for unregistered sounds) · assist · device · finish(result) · text · aria(text) ·
//   label(id, text) ('info' and 'status' are the visible top- and bottom-bar slots, other ids a
//   visually hidden mirror) · +params · +skin · +skinId · +area { w, h } (1280 × 576 play units)
//   · +t (seconds of unpaused play) · +interactive() · +hints(list) · +haptic(ms) · +color(token) (a css/tokens.css
//   custom property, e.g. 'ink-900') · +font(px, weight, display) · +chance(stat, D, checkId) ·
//   +roll(p) · +el(tag, attrs, kids) · +button(opts) · +chip(text, kind) · +ring(node, on)
(function () {
  'use strict';
  var SR = window.SR;
  var hasOwn = Object.prototype.hasOwnProperty;

  // UI §2.2: top bar 0-64, play area 64-640, bottom bar 640-720 of the 1280 × 720 stage.
  var AREA_W = 1280;
  var AREA_H = 576;
  var TOP_H = 64;
  var BOTTOM_H = 80;
  var MAX_BACKING = 2560;       // ARCHITECTURE §2: backing stores are capped at 2560 px wide
  var REPLAY_DEFAULT = 0.9;     // s: the Auto replay (UI §5.8: ≤ 2 s including the result)
  var REPLAY_MAX = 2;
  var RESULT_HOLD = 1.1;        // s the result banner stays; any press skips it (UI §7)
  var MAX_ARIA_LINES = 4;       // lines of ours kept in #aria
  var DUCK_DB = 6;              // ART_AUDIO §13.4: minigames duck the song 6 dB

  var assistPref = null;        // the session's Assist toggle (null: the access.assist setting)
  var S = null;                 // the open session

  function t(key, vars) { return SR.text(key, vars); }

  // ---- DOM helpers ---------------------------------------------------------------------------

  /** @returns {HTMLElement} tag with attributes (style: an object; on<Event>: listeners) and children. */
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === undefined || v === null || v === false) return;
        if (k === 'style') Object.assign(n.style, v);
        else if (k === 'text') n.textContent = v;
        else if (/^on[A-Z]/.test(k)) n.addEventListener(k.slice(2).toLowerCase(), v);
        else n.setAttribute(k, v === true ? '' : String(v));
      });
    }
    (kids || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }

  var HIDDEN = { position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', margin: '-1px', padding: '0', border: '0' };

  function btnStyle(variant) {
    var s = {
      height: '44px', padding: '0 16px', borderRadius: 'var(--r-m)', border: 'var(--line)',
      background: 'var(--paper-0)', color: 'var(--ink-900)', boxShadow: 'var(--e-1)',
      font: '700 calc(16px * var(--ui-scale, 1)) var(--font-ui)', cursor: 'pointer', whiteSpace: 'nowrap',
      display: 'inline-flex', alignItems: 'center', gap: '8px', flex: 'none', pointerEvents: 'auto',
      fontVariantNumeric: 'tabular-nums',
    };
    if (variant === 'primary') { s.background = 'var(--primary-600)'; s.color = 'var(--primary-ink)'; }
    if (variant === 'ghost') { s.border = '0'; s.padding = '0 18px'; s.boxShadow = 'none'; s.background = 'none'; }
    return s;
  }

  /** Visible focus (UI §2.3): a 3 px --focus ring with an ink outer line, offset 2 px. */
  function ring(node, on) {
    if (!node) return;
    node.style.outline = on ? '3px solid var(--focus)' : '';
    node.style.outlineOffset = on ? '2px' : '';
    node.style.boxShadow = on ? '0 0 0 2px var(--paper-0), 0 0 0 6px var(--ink-900)' : (node.getAttribute('data-shadow') || '');
    if (on) node.setAttribute('data-selected', '1'); else node.removeAttribute('data-selected');
  }

  /**
   * A frame-styled button. Buttons never take DOM focus (a focused button would also be clicked by
   * the Enter that SR.input turns into an action); keyboard and pad reach them through actions.
   * @param {{id: string, label: string, sub: string, chips: Array, variant: string, onPress: function,
   *   aria: string, width: string, badge: string}} o
   */
  function button(o) {
    var st = btnStyle(o.variant);
    if (o.width) st.width = o.width;
    if (o.tall) { st.height = 'auto'; st.minHeight = '64px'; st.padding = '8px 16px'; st.flexDirection = 'column'; st.alignItems = 'flex-start'; st.gap = '4px'; st.textAlign = 'left'; st.whiteSpace = 'normal'; }
    var b = el('button', { type: 'button', tabindex: '-1', 'data-id': o.id, 'aria-label': o.aria || null, style: st });
    b.setAttribute('data-shadow', st.boxShadow);
    var head = o.tall ? el('span', { style: { display: 'flex', alignItems: 'center', gap: '8px', width: '100%' } }) : b;
    if (o.badge) head.appendChild(el('span', { 'aria-hidden': 'true', style: badgeStyle() }, [o.badge]));
    head.appendChild(el('span', { 'data-part': 'label', style: { flex: o.tall ? '1 1 auto' : 'none' } }, [o.label || '']));
    if (o.tall) b.appendChild(head);
    if (o.chips && o.chips.length) {
      var row = el('span', { 'data-part': 'chips', style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } });
      o.chips.forEach(function (c) { row.appendChild(chip(c.text, c.kind)); });
      b.appendChild(row);
    }
    if (o.sub) b.appendChild(el('span', { 'data-part': 'sub', style: { font: '600 calc(14px * var(--ui-scale, 1)) var(--font-ui)', color: 'var(--ink-700)' } }, [o.sub]));
    b.addEventListener('mousedown', function (e) { e.preventDefault(); });
    b.addEventListener('click', function (e) {
      if (b.disabled || b.getAttribute('aria-disabled') === 'true') return;
      noteDevice(e.pointerType === 'touch' || (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) ? 'touch' : 'mouse');
      if (o.onPress) o.onPress(e);
    });
    return b;
  }

  function badgeStyle() {
    return {
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '20px', height: '20px',
      padding: '0 4px', borderRadius: 'var(--r-xs)', border: '2px solid var(--ink-900)', background: 'var(--paper-2)',
      font: '700 12px var(--font-ui)', color: 'var(--ink-900)', flex: 'none',
    };
  }

  /** A chip (UI §2.3): kind is a meaning token (money, hp, str, int, cha, time, heat) or 'plain'. */
  function chip(text, kind) {
    var k = kind && kind !== 'plain' ? kind : null;
    return el('span', {
      'data-part': 'chip',
      style: {
        display: 'inline-flex', alignItems: 'center', height: '24px', padding: '0 8px', borderRadius: 'var(--r-s)',
        background: k ? 'var(--' + k + '-100)' : 'var(--paper-2)', color: k ? 'var(--' + k + '-ink)' : 'var(--ink-700)',
        font: '700 calc(14px * var(--ui-scale, 1)) var(--font-ui)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
      },
    }, [text]);
  }

  // ---- the session ---------------------------------------------------------------------------

  function settingAssist() {
    try {
      return !!(SR.settings && typeof SR.settings.get === 'function' && SR.settings.get('access.assist'));
    } catch (e) { return false; }
  }

  function noteDevice(d) {
    if (!S || !d || d === S.device) return;
    S.device = d;
    renderHints();
  }

  function currentDevice() {
    if (S && S.device) return S.device;
    return (SR.input && SR.input.last) || 'kb';
  }

  /** SR.debug.fast(true) skips the Auto replay and the result banner (tests). */
  function fast() {
    try { return !!(SR.debug && typeof SR.debug.fast === 'function' && SR.debug.fast() === true); } catch (e) { return false; }
  }

  function interactive() { return !!S && !S.finished && !S.replay && !S.panel && !S.closed; }

  function summary(result) {
    if (!S || !result) return '';
    try { return S.def.summary ? String(S.def.summary(result, SR.text, S.skin, S.params) || '') : ''; } catch (e) { return ''; }
  }

  function pushContext() {
    var inp = SR.input;
    if (!S || S.ctxPushed || !inp || typeof inp.pushContext !== 'function') return;
    if (!S.keys || !Object.keys(S.keys).length) return;
    inp.pushContext(S.ctxName, S.keys, { shadow: true });
    S.ctxPushed = true;
  }

  function popContext() {
    var inp = SR.input;
    if (!S || !S.ctxPushed) return;
    S.ctxPushed = false;
    if (inp && typeof inp.popContext === 'function') inp.popContext(S.ctxName);
  }

  /** Plays a song: an id, or { id, variant } (the variant only when one is named). */
  function playMusic(song) {
    var id = song && typeof song === 'object' ? song.id : song;
    if (id && SR.audio && typeof SR.audio.music === 'function') {
      try {
        if (song && typeof song === 'object' && song.variant) SR.audio.music(id, { variant: song.variant });
        else SR.audio.music(id);
      } catch (e) { /* audio is optional */ }
    }
  }

  /**
   * ART_AUDIO §13.4: a minigame without its own song ducks the one below 6 dB while the frame is
   * open (a held duck: SR.audio.duck(db, Infinity) until its release function; W1-S request 6).
   * @returns {function|null} the release
   */
  function holdDuck() {
    if (!SR.audio || typeof SR.audio.duck !== 'function') return null;
    try { var r = SR.audio.duck(DUCK_DB, Infinity); return typeof r === 'function' ? r : null; } catch (e) { return null; }
  }

  /**
   * The song of the scene the frame returns to. A building plays its building's song: the named fn
   * `music.<building>` (a song id, or { id, variant }) when it exists, as js/scenes/building.js does
   * on entering (W2-Civic request 5: City Hall's march while you hold office), else def.music.
   * @returns {string|{id: string, variant: (string|undefined)}|null}
   */
  function musicBelow() {
    var top = SR.scenes.top();
    if (!top) return null;
    if (top.id === 'building' && top.params && SR.reg.building[top.params.id]) {
      var def = SR.reg.building[top.params.id];
      var fn = SR.reg.fn && SR.reg.fn['music.' + def.id];
      if (typeof fn === 'function' && SR.state) {
        try {
          var r = fn(SR.state, top.params.params || {}, { source: 'ui', now: SR.state.clock ? SR.state.clock.min : 0 });
          if (typeof r === 'string' && r) return r;
          if (r && typeof r.id === 'string') return { id: r.id, variant: r.variant || undefined };
        } catch (e) { SR.util.warnOnce('mg.musicFn.' + def.id, 'minigame: music.' + def.id + ' threw: ' + e.message); }
      }
      return def.music || null;
    }
    return top.def && top.def.music || null;
  }

  var audio = {
    /** Plays a registered sfx (unregistered names are skipped quietly). */
    sfx: function (name, opts) {
      if (!name || !SR.audio || typeof SR.audio.sfx !== 'function' || !hasOwn.call(SR.reg.sfx, name)) return null;
      try { return SR.audio.sfx(name, opts); } catch (e) { return null; }
    },
    stinger: function (id) {
      if (!SR.audio || typeof SR.audio.stinger !== 'function') return;
      try { SR.audio.stinger(id); } catch (e) { /* optional */ }
    },
  };

  /** A css/tokens.css colour for canvas drawing ('ink-900'), else the palette's UI mirror. */
  function color(token) {
    if (!S) return '';
    if (hasOwn.call(S.colors, token)) return S.colors[token];
    var v = '';
    try { if (S.el) v = getComputedStyle(S.el.frame).getPropertyValue('--' + token).trim(); } catch (e) { v = ''; }
    if (!v) {
      var ui = SR.art && SR.art.palette && SR.art.palette.ui;
      if (ui) {
        var camel = token.replace(/-([a-z0-9])/g, function (m, c) { return c.toUpperCase(); });
        var names = [token, camel, token.replace(/-/g, '_'), token.replace(/-/g, '')];
        for (var i = 0; i < names.length && !v; i++) if (typeof ui[names[i]] === 'string') v = ui[names[i]];
      }
    }
    S.colors[token] = v;
    return v;
  }

  function fontFamily(display) {
    var key = display ? '--font-display' : '--font-ui';
    if (S && hasOwn.call(S.fonts, key)) return S.fonts[key];
    var v = '';
    try { if (S && S.el) v = getComputedStyle(S.el.frame).getPropertyValue(key).trim(); } catch (e) { v = ''; }
    v = v || 'sans-serif';
    if (S) S.fonts[key] = v;
    return v;
  }

  function label(id, text) {
    if (!S || !S.el) return;
    var s = text === undefined || text === null ? '' : String(text);
    if (id === 'info') { S.el.info.textContent = s; return; }
    if (id === 'status') { S.el.status.textContent = s; return; }
    var n = S.labels[id];
    if (!n) {
      n = el('p', { 'data-id': 'mg-label-' + id });
      S.labels[id] = n;
      S.el.mirror.appendChild(n);
    }
    n.textContent = s;
  }

  function aria(text) {
    if (!S || text === undefined || text === null || text === '') return;
    var s = String(text);
    S.announced.push(s);
    var region = typeof document !== 'undefined' ? document.getElementById('aria') : null;
    if (!region) return;
    region.appendChild(el('p', { 'data-mg': '1' }, [s]));
    var mine = region.querySelectorAll('[data-mg]');
    for (var i = 0; i < mine.length - MAX_ARIA_LINES; i++) region.removeChild(mine[i]);
  }

  function makeHost() {
    var host = {
      rng: SR.rng.rules,
      fx: SR.rng.fx,
      audio: audio,
      text: SR.text,
      area: { w: AREA_W, h: AREA_H },
      finish: function (result) { if (S && host === S.host && !S.replay) finish(result); },
      aria: aria,
      label: label,
      interactive: interactive,
      hints: function (list) { if (S) { S.hints = list || []; renderHints(); } },
      color: color,
      font: function (px, weight, display) { return (weight || 400) + ' ' + px + 'px ' + fontFamily(display); },
      /** UI §6: a 30 ms vibration on hits and rewards (W1-D's helper honours access.haptics). */
      haptic: function (ms) {
        var d = SR.ui && SR.ui.dom;
        if (d && typeof d.haptic === 'function') { try { d.haptic(ms || 30); } catch (e) { /* optional */ } }
      },
      chance: function (stat, D, checkId) { return SR.minigame.chance(stat, D, { s: host.state || SR.state, checkId: checkId }); },
      roll: function (p) { return SR.minigame.roll(host.rng, p); },
      el: el,
      button: button,
      chip: chip,
      ring: ring,
    };
    Object.defineProperty(host, 'state', { get: function () { return S ? S.stateView : null; }, enumerable: true });
    Object.defineProperty(host, 'params', { get: function () { return S ? S.params : null; }, enumerable: true });
    Object.defineProperty(host, 'skin', { get: function () { return S ? S.skin : null; }, enumerable: true });
    Object.defineProperty(host, 'skinId', { get: function () { return S ? S.L.skinId : null; }, enumerable: true });
    Object.defineProperty(host, 'ui', { get: function () { return S && S.el ? S.el.ui : null; }, enumerable: true });
    Object.defineProperty(host, 'assist', { get: function () { return !!(S && S.assist); }, enumerable: true });
    Object.defineProperty(host, 'device', { get: currentDevice, enumerable: true });
    Object.defineProperty(host, 't', { get: function () { return S ? S.t : 0; }, enumerable: true });
    Object.defineProperty(host, 'paused', { get: function () { return !!(S && (S.panel || S.covered)); }, enumerable: true });
    return host;
  }

  // ---- the frame -----------------------------------------------------------------------------

  function titleText() {
    var sk = S.skin && S.skin.text || {};
    var main = sk.title || S.def.title;
    var sub = sk.subtitle || S.params.subtitle;
    var s = main ? t(main) : S.L.id;
    return sub ? s + ' · ' + t(sub) : s;
  }

  function buildFrame(root) {
    var frame = el('div', {
      'data-id': 'mg-frame', role: 'group', 'aria-label': titleText(),
      style: {
        // Over the scene below: its HUD (--z-hud) and card (--z-card) live in other scene roots,
        // which make no stacking context (wave-1 integration: the slice's minigame over the city).
        position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', zIndex: 'var(--z-overlay)', display: 'flex',
        flexDirection: 'column', background: 'var(--paper-1)', color: 'var(--ink-900)',
        font: '400 calc(16px * var(--ui-scale, 1)) var(--font-ui)', userSelect: 'none', overflow: 'hidden',
      },
    });
    var exitBtn = button({ id: 'mg-exit', label: '◀ ' + t('mg.frame.exit'), variant: 'ghost', onPress: function () { if (interactive()) requestExit(); } });
    var title = el('h2', {
      'data-id': 'mg-title',
      style: {
        flex: '1 1 auto', minWidth: '0', margin: '0', font: '900 calc(24px * var(--ui-scale, 1)) var(--font-display)',
        textTransform: 'uppercase', letterSpacing: '0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      },
    }, [titleText()]);
    var info = el('span', { 'data-id': 'mg-info', style: { flex: 'none', font: '600 calc(16px * var(--ui-scale, 1)) var(--font-ui)', color: 'var(--ink-700)', fontVariantNumeric: 'tabular-nums' } });
    var cash = el('span', { 'data-id': 'mg-cash', style: { flex: 'none', font: '900 calc(20px * var(--ui-scale, 1)) var(--font-ui)', color: 'var(--money-ink)', fontVariantNumeric: 'tabular-nums' } });
    var autoBtn = button({ id: 'mg-auto', label: t('mg.frame.auto'), onPress: function () { if (interactive()) startAuto(); } });
    var assistBtn = button({ id: 'mg-assist', label: t('mg.frame.assist'), onPress: function () { if (interactive()) toggleAssist(); } });
    var top = el('div', {
      'data-id': 'mg-top',
      style: {
        flex: 'none', height: TOP_H + 'px', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: '12px',
        padding: '0 16px', background: 'var(--paper-0)', borderBottom: 'var(--line)',
      },
    }, [exitBtn, title, info, cash, autoBtn, assistBtn]);

    var canvas = el('canvas', { 'data-id': 'mg-canvas', 'aria-hidden': 'true', style: { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', display: 'block' } });
    // host.ui: a 1280 × 576 layer in play-area units, scaled like the canvas content (measure()).
    var uiInner = el('div', { 'data-id': 'mg-ui', style: { position: 'absolute', left: '0', top: '0', width: AREA_W + 'px', height: AREA_H + 'px', transformOrigin: '0 0', pointerEvents: 'none' } });
    var uiLayer = el('div', { 'data-id': 'mg-ui-layer', style: { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', pointerEvents: 'none', overflow: 'hidden' } }, [uiInner]);
    var banner = el('div', {
      'data-id': 'mg-banner', role: 'status',
      style: {
        position: 'absolute', left: '50%', top: '44%', transform: 'translate(-50%, -50%) rotate(-4deg)', display: 'none',
        flexDirection: 'column', alignItems: 'center', gap: '4px', padding: '16px 32px', background: 'var(--paper-0)',
        border: '4px double var(--ink-900)', borderRadius: 'var(--r-m)', boxShadow: 'var(--e-3)', pointerEvents: 'none', textAlign: 'center',
      },
    });
    var panel = el('div', {
      'data-id': 'mg-panel',
      style: {
        position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', display: 'none', alignItems: 'center',
        justifyContent: 'center', background: 'var(--scrim)', pointerEvents: 'auto',
      },
    });
    var area = el('div', {
      'data-id': 'mg-area',
      style: { position: 'relative', flex: '1 1 auto', minHeight: '0', touchAction: 'none', overflow: 'hidden', background: 'var(--paper-2)' },
    }, [canvas, uiLayer, banner, panel]);

    var hints = el('div', { 'data-id': 'mg-hints', style: { flex: '1 1 auto', display: 'flex', alignItems: 'center', gap: '20px', minWidth: '0', overflow: 'hidden' } });
    var pauseBtn = button({ id: 'mg-pause', label: '', variant: 'ghost', onPress: function () { if (interactive()) openPanel('pause'); } });
    var status = el('span', { 'data-id': 'mg-status', style: { flex: 'none', font: '700 calc(16px * var(--ui-scale, 1)) var(--font-ui)', fontVariantNumeric: 'tabular-nums', color: 'var(--ink-900)' } });
    var bottom = el('div', {
      'data-id': 'mg-bottom',
      style: {
        flex: 'none', height: BOTTOM_H + 'px', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: '16px',
        padding: '0 16px', background: 'var(--paper-0)', borderTop: 'var(--line)',
      },
    }, [hints, pauseBtn, status]);
    var mirror = el('div', { 'data-id': 'mg-mirror', style: HIDDEN });

    frame.appendChild(top);
    frame.appendChild(area);
    frame.appendChild(bottom);
    frame.appendChild(mirror);
    root.appendChild(frame);
    return {
      root: root, frame: frame, top: top, exit: exitBtn, title: title, info: info, cash: cash, auto: autoBtn, assist: assistBtn,
      area: area, canvas: canvas, ui: uiInner, banner: banner, panel: panel, bottom: bottom, hints: hints, pause: pauseBtn,
      status: status, mirror: mirror, ctx: canvas.getContext ? canvas.getContext('2d') : null,
    };
  }

  function glyphFor(action) {
    var dev = currentDevice();
    if (dev === 'touch') return '';
    var codes = SR.minigame.bindings(action, hasOwn.call(S.keys, action) ? S.ctxName : null, S.keys);
    var pad = codes.filter(function (c) { return /^Pad/.test(c); });
    var kb = codes.filter(function (c) { return !/^(Pad|Mouse|Wheel)/.test(c); });
    var pick = dev === 'pad' ? pad[0] || kb[0] : kb[0] || pad[0];
    return pick ? SR.minigame.glyph(pick) : '';
  }

  function hintNode(glyphText, text, id) {
    var kids = [];
    if (glyphText) kids.push(el('span', { 'aria-hidden': 'true', style: badgeStyle() }, [glyphText]));
    kids.push(el('span', null, [text]));
    return el('span', { 'data-id': id || null, style: { display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', font: '600 calc(16px * var(--ui-scale, 1)) var(--font-ui)' } }, kids);
  }

  function renderHints() {
    if (!S || !S.el) return;
    var box = S.el.hints;
    while (box.firstChild) box.removeChild(box.firstChild);
    var dev = currentDevice();
    var family = dev === 'pad' ? 'pad' : dev === 'touch' ? 'touch' : 'kb';
    (S.hints || []).forEach(function (h, i) {
      // `only`: 'kb' (keyboard and mouse), 'pad' or 'touch'; omitted shows on every device
      if (h.only && h.only !== family) return;
      if (family === 'touch' && h.only !== 'touch' && !h.touch) return;
      var g = '';
      if (h.range) g = glyphFor(h.range[0]) + (glyphFor(h.range[1]) ? '-' + glyphFor(h.range[1]) : '');
      else if (h.actions) g = h.actions.map(glyphFor).filter(Boolean).join(' ');
      else if (h.action) g = glyphFor(h.action);
      box.appendChild(hintNode(g, h.label ? t(h.label, h.vars) : '', 'mg-hint-' + i));
    });
    var pb = S.el.pause;
    while (pb.firstChild) pb.removeChild(pb.firstChild);
    var pg = glyphFor('pause');
    if (pg) pb.appendChild(el('span', { 'aria-hidden': 'true', style: badgeStyle() }, [pg]));
    pb.appendChild(el('span', null, [t('mg.frame.pause')]));
  }

  function refreshCash() {
    if (!S || !S.el) return;
    var s = SR.state;
    S.el.cash.textContent = s && s.money && typeof s.money.cash === 'number' ? SR.text.money(s.money.cash) : '';
  }

  /** @returns {boolean} the round offers Auto (a skin with auto: false never does; roulette has none). */
  function autoAvailable() {
    if (!S || (S.skin && S.skin.auto === false)) return false;
    return !!(S.inst && S.inst.auto) || !!SR.minigame.autoPolicy(S.L);
  }

  function refreshButtons() {
    if (!S || !S.el) return;
    var hasAuto = autoAvailable();
    S.el.auto.style.display = hasAuto ? '' : 'none';
    S.el.assist.style.display = S.def.assist === false ? 'none' : '';
    S.el.assist.setAttribute('aria-pressed', S.assist ? 'true' : 'false');
    S.el.assist.style.background = S.assist ? 'var(--primary-100)' : 'var(--paper-0)';
    var off = !interactive();
    [S.el.exit, S.el.auto, S.el.assist, S.el.pause].forEach(function (b) {
      b.setAttribute('aria-disabled', off ? 'true' : 'false');
      b.style.opacity = off ? '0.55' : '';
    });
  }

  function showBanner(head, line) {
    if (!S || !S.el) return;
    var b = S.el.banner;
    while (b.firstChild) b.removeChild(b.firstChild);
    b.appendChild(el('span', {
      'data-part': 'head',
      style: { font: '900 calc(44px * var(--ui-scale, 1)) var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.02em', color: 'var(--ink-900)' },
    }, [head]));
    if (line) b.appendChild(el('span', { 'data-part': 'line', style: { font: '700 calc(20px * var(--ui-scale, 1)) var(--font-ui)', color: 'var(--ink-700)' } }, [line]));
    b.style.display = 'flex';
  }

  // ---- panels: pause and the exit confirm ----------------------------------------------------

  function panelItems(kind) {
    if (kind === 'exit') {
      return [
        { id: 'stay', label: t('mg.frame.stay'), run: closePanel },
        { id: 'leave', label: t('mg.frame.quit'), variant: 'danger', run: leaveNow },
      ];
    }
    var items = [{ id: 'resume', label: t('mg.frame.resume'), variant: 'primary', run: closePanel }];
    if (autoAvailable()) items.push({ id: 'auto', label: t('mg.frame.auto'), run: function () { closePanel(); startAuto(); } });
    if (S.def.assist !== false) {
      items.push({ id: 'assist', label: t(S.assist ? 'mg.frame.assistOn' : 'mg.frame.assistOff'), run: function () { toggleAssist(); openPanel('pause', 'assist'); } });
    }
    items.push({ id: 'exit', label: t('mg.frame.exit'), run: requestExit });
    return items;
  }

  function openPanel(kind, focusId) {
    if (!S || !S.el || S.finished || S.replay) return;
    var wasOpen = !!S.panel;
    S.panel = kind;
    S.panelItems = panelItems(kind);
    S.panelIndex = 0;
    if (focusId) S.panelItems.forEach(function (it, i) { if (it.id === focusId) S.panelIndex = i; });
    var p = S.el.panel;
    while (p.firstChild) p.removeChild(p.firstChild);
    var heading = kind === 'exit' ? t('mg.frame.quitTitle') : t('mg.frame.paused');
    var body = el('div', {
      'data-id': 'mg-panel-' + kind, role: 'dialog', 'aria-label': heading,
      style: {
        width: '480px', boxSizing: 'border-box', padding: '24px', background: 'var(--paper-0)', border: 'var(--line)',
        borderRadius: 'var(--r-l)', boxShadow: 'var(--e-3)', display: 'flex', flexDirection: 'column', gap: '12px',
      },
    }, [el('h3', { style: { margin: '0 0 4px', font: '900 calc(24px * var(--ui-scale, 1)) var(--font-display)', textTransform: 'uppercase' } }, [heading])]);
    if (kind === 'exit') {
      var why = SR.minigame.isStake(S.L) ? 'mg.frame.quitText' : 'mg.frame.quitLoss';
      body.appendChild(el('p', { 'data-id': 'mg-panel-text', style: { margin: '0 0 8px', color: 'var(--ink-700)' } }, [t(why)]));
    }
    S.panelNodes = S.panelItems.map(function (it, i) {
      var b = button({
        id: 'mg-panel-' + it.id, label: it.label, variant: it.variant === 'danger' ? null : it.variant, width: '100%', badge: String(i + 1),
        onPress: function () { if (S && S.panel === kind) { S.panelIndex = i; it.run(); } },
      });
      b.style.justifyContent = 'flex-start';
      if (it.variant === 'danger') { b.style.background = 'var(--danger)'; b.style.color = 'var(--primary-ink)'; }
      body.appendChild(b);
      return b;
    });
    p.appendChild(body);
    p.style.display = 'flex';
    selectPanel(S.panelIndex);
    refreshButtons();
    if (!wasOpen || kind === 'exit') aria(heading);
    popContext();   // while the panel is up, Enter and the digits mean confirm and rows again
  }

  function selectPanel(i) {
    if (!S || !S.panelNodes) return;
    var n = S.panelNodes.length;
    S.panelIndex = ((i % n) + n) % n;
    S.panelNodes.forEach(function (b, j) { ring(b, j === S.panelIndex); });
  }

  function closePanel() {
    if (!S || !S.el || !S.panel) return;
    S.panel = null;
    S.panelNodes = null;
    S.el.panel.style.display = 'none';
    while (S.el.panel.firstChild) S.el.panel.removeChild(S.el.panel.firstChild);
    pushContext();
    refreshButtons();
    aria(t('mg.frame.resumed'));
  }

  function panelAction(action, ev) {
    if (ev.repeat && action !== 'up' && action !== 'down') return;
    if (action === 'up' || action === 'left') { selectPanel(S.panelIndex - 1); aria(S.panelItems[S.panelIndex].label); return; }
    if (action === 'down' || action === 'right') { selectPanel(S.panelIndex + 1); aria(S.panelItems[S.panelIndex].label); return; }
    var m = /^row(\d)$/.exec(action);
    if (m) {
      var k = +m[1] - 1;
      if (k < S.panelItems.length) { S.panelIndex = k; S.panelItems[k].run(); }
      return;
    }
    if (action === 'confirm') { S.panelItems[S.panelIndex].run(); return; }
    if (action === 'back' || action === 'pause') {
      if (S.panel === 'exit') openPanel('pause', 'exit');
      else closePanel();
    }
  }

  // ---- Auto, Assist, exit, finish ------------------------------------------------------------

  function toggleAssist() {
    if (!S || S.def.assist === false) return;
    S.assist = !S.assist;
    assistPref = S.assist;
    if (S.inst && S.inst.assistChanged) S.inst.assistChanged(S.assist);
    refreshButtons();
    aria(t(S.assist ? 'mg.frame.assistOn' : 'mg.frame.assistOff'));
  }

  function startAuto() {
    if (!S || S.finished || S.replay || S.closed) return;
    if (!autoAvailable()) return;
    var policy = SR.minigame.autoPolicy(S.L);
    if (S.panel) closePanel();
    // The engine continues from the current position unless the skin brings its own whole-round policy.
    var own = S.inst && S.inst.auto && !(S.skin && typeof S.skin.auto === 'function');
    var r = own ? S.inst.auto(S.host.rng) : policy(S.stateView || SR.state || {}, S.params, S.host.rng);
    if (!r) return;
    var dur = fast() ? 0 : typeof S.def.replay === 'number' ? S.def.replay : REPLAY_DEFAULT;
    S.replay = { result: r, t: 0, dur: Math.min(REPLAY_MAX, Math.max(0, dur)) };
    if (S.inst && S.inst.replay) S.inst.replay(r);
    showBanner(t('mg.frame.replay'), '');
    refreshButtons();
    aria(t('mg.frame.autoDone'));
  }

  function skipReplay() {
    var r = S.replay.result;
    S.replay = null;
    finish(r);
  }

  function requestExit() {
    if (!S || S.finished || S.replay) return;
    if (exitAsks()) openPanel('exit');
    else leaveNow();
  }

  /**
   * Exit asks first with a live stake, or as the engine says (W2-Night request 7): the instance's
   * `exitRisk()` → boolean when it has one (asked now, without side effects: blackjack asks only
   * while a hand is out), else the def's `confirmExit`: `true` always, or `confirmExit(progress,
   * params)` → boolean by the round's progress. A function that throws asks.
   */
  function exitAsks() {
    if (SR.minigame.isStake(S.L)) return true;
    if (S.inst && typeof S.inst.exitRisk === 'function') {
      try { return !!S.inst.exitRisk(); } catch (e) { return true; }
    }
    var c = S.def.confirmExit;
    if (typeof c !== 'function') return c === true;
    try { return !!c(S.inst && S.inst.progress ? S.inst.progress() : null, S.L.params); } catch (e) { return true; }
  }

  function leaveNow() {
    if (!S || S.finished) return;
    var progress = S.inst && S.inst.progress ? S.inst.progress() : null;
    S.exited = true;
    finish(SR.minigame.forfeit(S.L, progress), { quiet: true });
  }

  /** Ends the round with result: the banner shows its summary, then the scene pops with it. */
  function finish(result, opts) {
    if (!S || S.finished || S.closed) return;
    // No result would reach run() as "the frame was removed": treat it as leaving the round.
    if (result === undefined || result === null) result = SR.minigame.forfeit(S.L, S.inst && S.inst.progress ? S.inst.progress() : null);
    S.finished = true;
    S.result = result;
    S.holdT = 0;
    S.replay = null;
    settlePending(result);
    if (S.panel && S.el) { S.panel = null; S.el.panel.style.display = 'none'; }
    var line = summary(result);
    if (line) aria(line);
    if ((opts && opts.quiet) || fast()) { close(); return; }
    showBanner(t('mg.frame.result'), line);
    refreshButtons();
  }

  /**
   * Hardcore (ARCHITECTURE §15): `pending.worst` makes closing the tab mid-round a loss. Once the
   * round is decided it is no longer mid-round, so the decided result replaces it in the ironman
   * slot; a tab closed during the result banner then resolves the round as it was played.
   */
  function settlePending(result) {
    var s = SR.state;
    if (!s || !s.pending || !s.mode || s.mode.difficulty !== 'hardcore') return;
    s.pending.worst = SR.util.clone(result);
    if (SR.save && typeof SR.save.write === 'function') {
      try { SR.save.write('ironman'); } catch (e) { SR.util.warnOnce('mg-ironman', 'minigame: ironman write failed (' + e.message + ')'); }
    }
  }

  function close() {
    if (!S || S.closed) return;
    // pop() removes the top scene: while another overlay covers the frame, wait for resume().
    var top = SR.scenes.top();
    if (top && top.id !== 'minigame') { S.popWhenTop = true; return; }
    S.closed = true;
    var done = { id: S.L.id, skin: S.L.skinId, result: S.result };
    SR.scenes.pop(S.result);
    // After the pop, so a listener may open the next round at once (two rounds in a row).
    SR.events.emit('minigame:done', done);
  }

  // ---- canvas sizing and pointer input -------------------------------------------------------

  function measure() {
    if (!S || !S.el || !S.el.ctx) return;
    var area = S.el.area, c = S.el.canvas;
    var w = area.clientWidth || AREA_W, h = area.clientHeight || AREA_H;
    var r = area.getBoundingClientRect();
    var zoom = r.width > 0 ? r.width / w : 1;   // the CSS zoom of #ui (ARCHITECTURE §2)
    var dpr = typeof window !== 'undefined' && window.devicePixelRatio || 1;
    if (SR.stage && typeof SR.stage.dpr === 'number' && SR.stage.dpr > 0) dpr = SR.stage.dpr;
    var q = SR.quality && SR.quality.params;
    var ds = zoom * dpr * (q && q.renderScale > 0 ? q.renderScale : 1);
    if (w * ds > MAX_BACKING) ds = MAX_BACKING / w;
    c.width = Math.max(1, Math.round(w * ds));
    c.height = Math.max(1, Math.round(h * ds));
    var fit = Math.min(w / AREA_W, h / AREA_H);
    S.view = { w: w, h: h, ds: ds, fit: fit, ox: (w - AREA_W * fit) / 2, oy: (h - AREA_H * fit) / 2 };
    S.el.ui.style.transform = 'translate(' + S.view.ox + 'px, ' + S.view.oy + 'px) scale(' + fit + ')';
    S.colors = {};
    S.fonts = {};
  }

  function toArea(ev) {
    var r = S.el.canvas.getBoundingClientRect();
    var v = S.view;
    var lx = r.width > 0 ? (ev.clientX - r.left) * (v.w / r.width) : 0;
    var ly = r.height > 0 ? (ev.clientY - r.top) * (v.h / r.height) : 0;
    return { x: (lx - v.ox) / v.fit, y: (ly - v.oy) / v.fit };
  }

  function onPointer(kind) {
    return function (ev) {
      if (!S || !S.inst || !S.view) return;
      if (kind === 'down') noteDevice(ev.pointerType === 'mouse' ? 'mouse' : 'touch');
      if (kind === 'down' && (S.finished || S.replay)) {
        ev.preventDefault();
        if (S.finished) close(); else skipReplay();
        return;
      }
      if (!interactive() || !S.inst.pointer) return;
      if (kind === 'down') {
        ev.preventDefault();
        try { S.el.canvas.setPointerCapture(ev.pointerId); } catch (e) { /* not capturable */ }
      }
      var p = toArea(ev);
      S.inst.pointer(kind, p.x, p.y, ev);
    };
  }

  // ---- scene lifecycle -----------------------------------------------------------------------

  function enter(params) {
    params = params || {};
    var def = SR.reg.minigame[params.id];
    if (!def) {
      if (typeof console !== 'undefined') console.error('minigame scene: unknown engine "' + params.id + '"');
      S = null;
      SR.scenes.pop(undefined);
      return;
    }
    var skin = params.skin && hasOwn.call(SR.reg.skin, params.skin) ? SR.reg.skin[params.skin] : null;
    var L = { id: params.id, def: def, skinId: skin ? params.skin : null, skin: skin, params: params.params || {} };
    S = {
      L: L, def: def, skin: skin, params: L.params, keys: def.keys || {},
      // CONTRACT §12.3: engines name their contexts after their engine id (Shift Rush's def names
      // `orderup`, the context §12.3 lists for its keys); a skin may name its own.
      ctxName: (skin && skin.context) || def.context || L.id, ctxPushed: false, covered: false, popWhenTop: false,
      stateView: SR.state ? SR.util.clone(SR.state) : null,
      assist: def.assist === false ? false : assistPref !== null ? assistPref : settingAssist(),
      t: 0, panel: null, finished: false, closed: false, replay: null, result: null, holdT: 0, exited: false,
      hints: [], labels: {}, colors: {}, fonts: {}, announced: [], device: null, unsub: [], view: null,
      music: (skin && skin.music) || def.music || null, inst: null, el: null, unduck: null,
    };
    S.host = makeHost();
    pushContext();
    playMusic(S.music);
    if (!S.music) S.unduck = holdDuck();
    var on = function (name, fn) { S.unsub.push(SR.events.on(name, fn)); };
    on('money:changed', refreshCash);
    on('input:device', function (p) { if (p && p.device) noteDevice(p.device); });
    on('stage:resized', function () { measure(); });
    on('settings:changed', function () { if (S) { S.colors = {}; S.fonts = {}; } });
  }

  function mount(root) {
    if (!S) return;
    S.el = buildFrame(root);
    var down = onPointer('down'), move = onPointer('move'), up = onPointer('up');
    S.el.canvas.addEventListener('pointerdown', down);
    S.el.canvas.addEventListener('pointermove', move);
    S.el.canvas.addEventListener('pointerup', up);
    S.el.canvas.addEventListener('pointercancel', up);
    S.el.panel.addEventListener('pointerdown', function (ev) { if (ev.target === S.el.panel) ev.preventDefault(); });
    var onResize = function () { measure(); };
    window.addEventListener('resize', onResize);
    S.unsub.push(function () { window.removeEventListener('resize', onResize); });
    // Keep Tab and spatial navigation inside the frame (the building card below keeps its focus
    // for when the frame closes); the frame's own controls are reached through input actions.
    if (SR.ui && SR.ui.focus && typeof SR.ui.focus.push === 'function') {
      try { S.focusScope = SR.ui.focus.push(S.el.frame, { id: 'minigame', autofocus: false }); } catch (e) { S.focusScope = null; }
    }
    var a = document.activeElement;   // the scope remembered it; nothing under the frame keeps focus
    if (a && a !== document.body && a.blur && root.parentNode && root.parentNode.contains(a)) a.blur();
    measure();
    aria(titleText());   // first, so the title is read before the engine's opening line (a Duel's beat 1)
    try {
      S.inst = S.def.create(S.host, S.params) || {};
    } catch (e) {
      if (typeof console !== 'undefined') console.error('minigame "' + S.L.id + '": create() threw', e);
      S.inst = {};
      S.finished = true;
      S.result = SR.minigame.forfeit(S.L, null);
      close();
      return;
    }
    if (typeof S.params.stake === 'number' && !S.el.info.textContent) label('info', t('mg.frame.stake', { money: SR.text.money(S.params.stake) }));
    refreshCash();
    renderHints();
    refreshButtons();
    if (S.params.auto === true) startAuto();
  }

  function unmount() {
    if (S && S.el && S.el.frame.parentNode) S.el.frame.parentNode.removeChild(S.el.frame);
  }

  function exit() {
    if (!S) return;
    var s = S;
    if (s.inst && typeof s.inst.destroy === 'function') {
      try { s.inst.destroy(); } catch (e) { if (typeof console !== 'undefined') console.error('minigame destroy() threw', e); }
    }
    popContext();
    s.unsub.forEach(function (fn) { fn(); });
    if (s.focusScope && SR.ui && SR.ui.focus) { try { SR.ui.focus.pop(s.focusScope); } catch (e) { /* already gone */ } }
    if (s.music) playMusic(musicBelow());
    if (s.unduck) { try { s.unduck(); } catch (e) { /* audio is optional */ } s.unduck = null; }
    if (typeof document !== 'undefined') {
      // Clear the round's lines from #aria but keep the last one (the result summary), which a
      // quiet exit or SR.debug.fast() appends in the same task as the close.
      var region = document.getElementById('aria');
      var mine = region ? Array.prototype.slice.call(region.querySelectorAll('[data-mg]')) : [];
      mine.slice(0, -1).forEach(function (n) { region.removeChild(n); });
      if (mine.length) mine[mine.length - 1].removeAttribute('data-mg');
    }
    S = null;
  }

  function update(dt) {
    if (!S || !S.inst || S.closed) return;
    // Covered by another overlay (the tab-return pause, a confirm): every timer stays frozen, even
    // under an overlay that does not block updates (ARCHITECTURE §10: pause freezes every timer).
    if (S.covered) return;
    if (S.finished) {
      S.holdT += dt;
      if (S.holdT >= RESULT_HOLD) close();
      return;
    }
    if (S.replay) {
      S.replay.t += dt;
      if (S.inst.replay && S.inst.update) S.inst.update(dt);
      if (S && S.replay && S.replay.t >= S.replay.dur) skipReplay();
      return;
    }
    if (S.panel) return;   // Pause freezes every timer (ARCHITECTURE §10)
    S.t += dt;
    if (S.inst.update) S.inst.update(dt);
  }

  function render() {
    if (!S || !S.el || !S.el.ctx || !S.view) return;
    var c = S.el.ctx, v = S.view;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, S.el.canvas.width, S.el.canvas.height);
    c.setTransform(v.ds, 0, 0, v.ds, 0, 0);
    var edge = color('paper-2');
    if (edge) { c.fillStyle = edge; c.fillRect(0, 0, v.w, v.h); }
    c.translate(v.ox, v.oy);
    c.scale(v.fit, v.fit);
    c.save();
    c.beginPath();
    c.rect(0, 0, AREA_W, AREA_H);
    c.clip();
    var bg = color('paper-1');
    if (bg) { c.fillStyle = bg; c.fillRect(0, 0, AREA_W, AREA_H); }
    if (S.inst && S.inst.render) {
      try { S.inst.render(c); } catch (e) { SR.util.warnOnce('mg-render-' + S.L.id, 'minigame "' + S.L.id + '": render() threw: ' + e.message); }
    }
    c.restore();
  }

  function onAction(action, ev) {
    if (!S || !S.inst || S.closed) return;
    ev = ev || {};
    if (ev.device) noteDevice(ev.device);
    if (action === 'interact') return;                          // E / Enter / Space also fire confirm
    if (action === 'back' && alsoPause(ev.code)) return;        // Esc fires back and pause: toggle once
    if (S.finished) { if (!ev.repeat && isPress(action)) close(); return; }
    if (S.replay) { if (!ev.repeat && isPress(action)) skipReplay(); return; }
    if (S.panel) { panelAction(action, ev); return; }
    if (action === 'pause' || action === 'back') { if (!ev.repeat) openPanel('pause'); return; }
    if (S.inst.onAction) S.inst.onAction(action, ev);
  }

  /**
   * @returns {boolean} the binding that fired `back` also fires `pause` (Esc by default), so the
   * press is handled once, as pause; a remapped pause leaves Esc working as back.
   */
  function alsoPause(code) {
    if (!code) return false;
    var inp = SR.input, list = null;
    if (inp && typeof inp.bindings === 'function') { try { list = inp.bindings('pause'); } catch (e) { list = null; } }
    return (list || SR.minigame.bindings('pause', null, null)).indexOf(code) >= 0;
  }

  /** Presses that skip the banner: confirm, back, pause and every action of the engine's context. */
  function isPress(action) {
    return action === 'confirm' || action === 'back' || action === 'pause' || hasOwn.call(S.keys, action);
  }

  SR.scenes.register('minigame', {
    kind: 'overlay',
    blocksUpdate: true,
    blocksRender: true,
    enter: enter,
    exit: exit,
    // Another overlay (the tab-return pause, a confirm) covers the frame: give its keys back and
    // freeze the round until the frame is on top again.
    pause: function () { if (S) S.covered = true; popContext(); },
    resume: function () {
      if (!S) return;
      S.covered = false;
      if (S.popWhenTop) { S.popWhenTop = false; close(); return; }
      if (!S.panel) pushContext();
    },
    update: update,
    render: render,
    onAction: onAction,
    ui: { mount: mount, unmount: unmount },
  });

  /**
   * The open round, for tests and tools (null when no minigame is open).
   * @returns {{id: string, skin: (string|null), params: object, t: number, panel: (string|null),
   *   finished: boolean, replaying: boolean, result: *, assist: boolean, device: string,
   *   context: string, announced: string[], inst: object, host: object}|null}
   */
  SR.minigame.current = function () {
    if (!S) return null;
    return {
      id: S.L.id, skin: S.L.skinId, params: S.params, t: S.t, panel: S.panel, finished: S.finished,
      replaying: !!S.replay, result: S.result, assist: S.assist, device: currentDevice(), context: S.ctxName,
      contextPushed: S.ctxPushed, announced: S.announced.slice(), inst: S.inst, host: S.host,
    };
  };
})();
