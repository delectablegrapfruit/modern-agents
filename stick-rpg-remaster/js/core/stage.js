// js/core/stage.js — owner: W1-K. SR.stage: the 1280 × 720 logical stage (ARCHITECTURE §2;
// docs/CONTRACT.md §20): the letterboxed #stage box centred in #app and snapped to device pixels,
// the canvases sized to it with a backing store of 1280·k·dpr·renderScale (capped 2560 × 1440) and a
// context transform in logical units, #ui scaled with CSS zoom (crisp text at any k), the
// touch-compact layout (coarse pointer and k < 0.92: #ui at zoom 0.92 over the whole window), the
// portrait card ("Play anyway" keeps the letterbox), toLogical, fullscreen, the debounced resize
// with stage:resized, and the letterbox colour following the sky's horizon every 5 game minutes.
// Load-time clean: the DOM is touched only from the boot hook and the functions it enables.
(function () {
  'use strict';
  var SR = window.SR;

  var W = 1280, H = 720;
  var MAX_W = 2560, MAX_H = 1440;      // backing-store cap (§2)
  var COMPACT_K = 0.92;                // touch-compact: uiK when the stage would be smaller (§2)
  var RESIZE_DEBOUNCE_MS = 150;
  var LETTERBOX_STEP_MIN = 5;          // the letterbox colour follows the sky every 5 game minutes
  var LETTERBOX_FALLBACK = 'var(--paper-1)';

  var st = {
    ready: false, k: 1, uiK: 1, dpr: 1, sx: 1, sy: 1, compact: false, portrait: false, coarse: false,
    left: 0, top: 0, cssW: W, cssH: H, winW: W, winH: H, bw: W, bh: H,
    app: null, stage: null, world: null, fx: null, ui: null, aria: null, ctx: null, fxCtx: null,
    card: null, cardShown: false, dismissed: false, timer: null, sky: null, skyTried: false, bucket: null, bg: null,
    wasCompact: null, dprMq: null,
  };

  function coarsePointer() {
    try { return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches); } catch (e) { return false; }
  }

  // ------------------------------------------------------------------------------------------
  // Letterbox colour: the horizon of SR.art.palette.sky (ART_AUDIO §2.2), read tolerantly.

  function hexRgb(c) {
    if (typeof c !== 'string') return null;
    var m = c.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!m) return null;
    var h = m[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function rgbHex(c) {
    return '#' + c.map(function (v) { var s = Math.round(SR.util.clamp(v, 0, 255)).toString(16); return s.length < 2 ? '0' + s : s; }).join('');
  }

  /** @returns {{h: number, c: number[]}[]|null} horizon keyframes by hour, or null if none can be read. */
  function skyKeys() {
    if (st.sky || st.skyTried) return st.sky;
    var pal = SR.art && SR.art.palette;
    var sky = pal && pal.sky;
    if (!sky) return null;            // the palette may still be a stub: try again next time
    st.skyTried = true;
    var out = [];
    var horizon = function (e) {
      if (!e) return null;
      if (Array.isArray(e)) return e[1];
      return e.horizon || e.hz || e.bottom || e.low || (Array.isArray(e.sky) ? e.sky[1] : null) || (Array.isArray(e.grad) ? e.grad[1] : null);
    };
    var add = function (hour, e) { var c = hexRgb(horizon(e)); if (typeof hour === 'number' && isFinite(hour) && c) out.push({ h: hour, c: c }); };
    if (Array.isArray(sky)) {
      sky.forEach(function (e) { if (e) add(e.h !== undefined ? e.h : e.hour !== undefined ? e.hour : e.at, e); });
    } else if (SR.util.isObject(sky)) {
      Object.keys(sky).forEach(function (k) {
        var e = sky[k];
        if (isFinite(Number(k))) add(Number(k), e);
        else if (e && typeof e === 'object') add(e.h !== undefined ? e.h : e.hour, e);
      });
    }
    if (!out.length) return null;
    var scale = out.some(function (k) { return k.h > 24; }) ? 1 / 60 : 1;   // keyframes in minutes
    out.forEach(function (k) { k.h *= scale; });
    out.sort(function (a, b) { return a.h - b.h; });
    st.sky = out;
    return out;
  }

  /** @returns {string} the horizon colour at a clock minute, or the paper fallback. */
  function horizonAt(min) {
    var keys = skyKeys();
    if (!keys) return LETTERBOX_FALLBACK;
    if (keys.length === 1) return rgbHex(keys[0].c);
    var h = ((min / 60) % 24 + 24) % 24, n = keys.length, i = -1, a, b, ah, bh;
    for (var j = 0; j < n; j++) if (keys[j].h <= h) i = j;
    if (i < 0) { a = keys[n - 1]; ah = a.h - 24; b = keys[0]; bh = b.h; }        // before the first key: wrap from the last
    else if (i + 1 < n) { a = keys[i]; ah = a.h; b = keys[i + 1]; bh = b.h; }
    else { a = keys[i]; ah = a.h; b = keys[0]; bh = b.h + 24; }                 // after the last key: wrap to the first
    var t = bh > ah ? (h - ah) / (bh - ah) : 0;
    return rgbHex([0, 1, 2].map(function (j) { return SR.util.lerp(a.c[j], b.c[j], t); }));
  }

  /** Per rendered frame (from SR.loop): updates the letterbox when the game clock crossed 5 minutes. */
  function tick() {
    if (!st.ready) return;
    var s = SR.state;
    var min = s && s.clock && typeof s.clock.min === 'number' ? s.clock.min : 720;
    var bucket = Math.floor(min / LETTERBOX_STEP_MIN);
    if (bucket === st.bucket) return;
    st.bucket = bucket;
    var bg = horizonAt(bucket * LETTERBOX_STEP_MIN);
    if (bg !== st.bg) { st.bg = bg; st.app.style.background = bg; }
  }

  // ------------------------------------------------------------------------------------------
  // The portrait card.

  function portraitCard(show) {
    if (!show) {
      if (st.card) { st.card.style.display = 'none'; st.cardShown = false; }
      return;
    }
    if (!st.card) {
      var card = document.createElement('div');
      card.setAttribute('data-id', 'stage-portrait');
      card.className = 'sr-turn-card';
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-modal', 'true');
      card.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;z-index:90;display:flex;flex-direction:column;' +
        'align-items:center;justify-content:center;gap:24px;padding:32px;box-sizing:border-box;text-align:center;' +
        'background:var(--paper-1);color:var(--ink-900);font-family:var(--font-ui);pointer-events:auto';
      var msg = document.createElement('p');
      msg.setAttribute('data-id', 'stage-portrait-text');
      msg.style.cssText = 'margin:0;font-family:var(--font-display);font-size:var(--fs-32);font-weight:900;line-height:var(--lh-tight)';
      msg.textContent = SR.text('ui.stage.turn');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-id', 'stage-portrait-play');
      btn.setAttribute('data-nav', '');
      btn.style.cssText = 'min-height:48px;padding:0 24px;border:var(--line);border-radius:var(--r-m);background:var(--primary-600);' +
        'color:var(--primary-ink);font-family:var(--font-ui);font-size:var(--fs-16);font-weight:700;cursor:pointer';
      btn.textContent = SR.text('ui.stage.playAnyway');
      var play = function () { st.dismissed = true; portraitCard(false); };
      btn.addEventListener('click', play);
      // js/ui/focus.js suppresses native Enter / Space activation in #ui, so the card handles them.
      btn.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ' || e.code === 'Space') { e.preventDefault(); e.stopPropagation(); play(); }
      });
      card.setAttribute('aria-label', msg.textContent);
      card.appendChild(msg);
      card.appendChild(btn);
      st.card = card;
    }
    if (st.ui.lastChild !== st.card) st.ui.appendChild(st.card);       // stays above the scene roots
    if (!st.cardShown) {
      st.cardShown = true;
      st.card.style.display = 'flex';
      var b = st.card.querySelector('button');
      try { if (b) b.focus(); } catch (e) { /* ignore */ }
    }
  }

  // ------------------------------------------------------------------------------------------
  // Layout.

  function baseStyles() {
    var a = st.app.style, s = st.stage.style;
    a.position = 'fixed'; a.left = '0'; a.top = '0'; a.width = '100%'; a.height = '100%'; a.overflow = 'hidden'; a.margin = '0';
    s.position = 'absolute'; s.zIndex = '0'; s.margin = '0';
    [st.world, st.fx].forEach(function (c, i) {
      var cs = c.style;
      cs.position = 'absolute'; cs.left = '0'; cs.top = '0'; cs.width = '100%'; cs.height = '100%'; cs.display = 'block'; cs.zIndex = String(i);
    });
    st.world.style.touchAction = 'none';
    st.fx.style.pointerEvents = 'none';
    st.ui.style.zIndex = '2';
    var r = st.aria.style;
    r.position = 'absolute'; r.width = '1px'; r.height = '1px'; r.margin = '-1px'; r.padding = '0'; r.overflow = 'hidden';
    r.clip = 'rect(0 0 0 0)'; r.clipPath = 'inset(50%)'; r.whiteSpace = 'nowrap'; r.border = '0';
  }

  /** @returns {{maxDpr: number, renderScale: number}} the quality parameters (defaults before SR.quality). */
  function qp() {
    var p = SR.quality && SR.quality.params;
    return p && typeof p.maxDpr === 'number' ? p : { maxDpr: 2, renderScale: 1 };
  }

  /** Lays the stage out for the current window now (the resize handler debounces this). */
  function layout() {
    if (!st.ready) return;
    if (st.timer) { clearTimeout(st.timer); st.timer = null; }
    var winW = Math.max(1, window.innerWidth || document.documentElement.clientWidth || W);
    var winH = Math.max(1, window.innerHeight || document.documentElement.clientHeight || H);
    var dev = window.devicePixelRatio || 1;
    var k0 = Math.min(winW / W, winH / H);
    // k snaps the stage width to whole device pixels, so canvas and UI edges sit on the pixel grid.
    var devW = Math.max(1, Math.floor(W * k0 * dev + 1e-6));
    var k = devW / (W * dev);
    var cssW = W * k, cssH = H * k;
    var left = Math.round((winW - cssW) / 2 * dev) / dev;
    var top = Math.round((winH - cssH) / 2 * dev) / dev;
    var coarse = coarsePointer();
    st.coarse = coarse;
    st.compact = coarse && k < COMPACT_K;
    st.portrait = coarse && winH > winW;
    var uiK = st.compact ? COMPACT_K : k;
    var q = qp();                        // read after compact is known (the compact profile caps maxDpr)
    var dpr = Math.min(dev, q.maxDpr);
    var bw = Math.max(1, Math.round(W * k * dpr * q.renderScale));
    var bh = Math.max(1, Math.round(H * k * dpr * q.renderScale));
    if (bw > MAX_W || bh > MAX_H) { var f = Math.min(MAX_W / bw, MAX_H / bh); bw = Math.round(bw * f); bh = Math.round(bh * f); }

    var ss = st.stage.style;
    ss.left = left + 'px'; ss.top = top + 'px'; ss.width = cssW + 'px'; ss.height = cssH + 'px';
    if (st.world.width !== bw || st.world.height !== bh) { st.world.width = bw; st.world.height = bh; }
    if (st.fx.width !== bw || st.fx.height !== bh) { st.fx.width = bw; st.fx.height = bh; }
    var sx = bw / W, sy = bh / H;
    if (st.ctx) st.ctx.setTransform(sx, 0, 0, sy, 0, 0);
    if (st.fxCtx) st.fxCtx.setTransform(sx, 0, 0, sy, 0, 0);

    var us = st.ui.style;
    if (st.compact) {
      us.position = 'fixed'; us.left = '0'; us.top = '0';
      us.width = (winW / uiK) + 'px'; us.height = (winH / uiK) + 'px';
    } else {
      us.position = 'absolute'; us.left = '0'; us.top = '0'; us.width = W + 'px'; us.height = H + 'px';
    }
    us.zoom = String(uiK);
    st.app.setAttribute('data-layout', st.compact ? 'compact' : 'stage');
    if (st.portrait) st.app.setAttribute('data-portrait', ''); else st.app.removeAttribute('data-portrait');
    portraitCard(st.portrait && !st.dismissed);

    var changed = k !== st.k || uiK !== st.uiK || dpr !== st.dpr || sx !== st.sx || st.compact !== st.wasCompact || bw !== st.bw || bh !== st.bh;
    st.k = k; st.uiK = uiK; st.dpr = dpr; st.sx = sx; st.sy = sy; st.left = left; st.top = top;
    st.cssW = cssW; st.cssH = cssH; st.winW = winW; st.winH = winH; st.bw = bw; st.bh = bh; st.wasCompact = st.compact;
    if (changed && SR.events) SR.events.emit('stage:resized', { k: k, uiK: uiK, dpr: dpr, scale: sx, compact: st.compact });
  }

  function onResize() {
    if (st.timer) clearTimeout(st.timer);
    st.timer = setTimeout(layout, RESIZE_DEBOUNCE_MS);
  }

  // A devicePixelRatio change without a window resize (the window moved to another monitor) is
  // seen through a resolution media query, re-armed for the new ratio after each change.
  function watchDpr() {
    if (st.dprMq) {
      try { if (st.dprMq.removeEventListener) st.dprMq.removeEventListener('change', onDpr); else st.dprMq.removeListener(onDpr); } catch (e) { /* ignore */ }
      st.dprMq = null;
    }
    try {
      if (!window.matchMedia) return;
      var mq = window.matchMedia('(resolution: ' + (window.devicePixelRatio || 1) + 'dppx)');
      if (mq.addEventListener) mq.addEventListener('change', onDpr); else if (mq.addListener) mq.addListener(onDpr);
      st.dprMq = mq;
    } catch (e) { st.dprMq = null; }
  }
  function onDpr() { watchDpr(); onResize(); }

  function init() {
    st.app = document.getElementById('app');
    st.stage = document.getElementById('stage');
    st.world = document.getElementById('world');
    st.fx = document.getElementById('fx');
    st.ui = document.getElementById('ui');
    st.aria = document.getElementById('aria');
    if (!st.app || !st.stage || !st.world || !st.fx || !st.ui || !st.aria) return false;
    st.ctx = st.world.getContext('2d');
    st.fxCtx = st.fx.getContext('2d');
    baseStyles();
    st.ready = true;
    layout();
    tick();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    document.addEventListener('fullscreenchange', layout);
    document.addEventListener('webkitfullscreenchange', layout);
    // A coarse / fine pointer switch (a tablet keyboard dock) changes the layout too.
    try {
      var mq = window.matchMedia('(pointer: coarse)');
      if (mq.addEventListener) mq.addEventListener('change', layout); else if (mq.addListener) mq.addListener(layout);
    } catch (e) { /* ignore */ }
    watchDpr();
    return true;
  }

  /**
   * Maps a client (CSS pixel) point to logical stage units (may fall outside 0..1280 / 0..720 in
   * the letterbox).
   * @returns {{x: number, y: number}}
   */
  function toLogical(clientX, clientY) {
    return { x: (clientX - st.left) / st.k, y: (clientY - st.top) / st.k };
  }

  /**
   * Enters or leaves fullscreen on #app (needs a user activation: a key, click or tap).
   * @param {boolean=} toggle true enter, false leave, omitted flip
   * @returns {Promise<boolean>} whether fullscreen is on afterwards
   */
  function fullscreen(toggle) {
    if (typeof document === 'undefined' || !st.app) return Promise.resolve(false);
    var cur = document.fullscreenElement || document.webkitFullscreenElement || null;
    var want = toggle === undefined ? !cur : !!toggle;
    var settle = function () { return !!(document.fullscreenElement || document.webkitFullscreenElement); };
    try {
      if (want && !cur) {
        var req = st.app.requestFullscreen || st.app.webkitRequestFullscreen;
        if (!req) return Promise.resolve(false);
        return Promise.resolve(req.call(st.app)).then(settle, settle);
      }
      if (!want && cur) {
        var exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (!exit) return Promise.resolve(settle());
        return Promise.resolve(exit.call(document)).then(settle, settle);
      }
    } catch (e) { return Promise.resolve(settle()); }
    return Promise.resolve(settle());
  }

  SR.stage = {
    toLogical: toLogical,
    fullscreen: fullscreen,
    /** Re-lays the stage out now (the window resize handler debounces it by 150 ms). */
    resize: function () { layout(); },
    tick: tick,
    /** @returns {string} the letterbox colour at a clock minute (the sky's horizon). */
    horizon: horizonAt,
    /** Shows the portrait card again after "Play anyway" (tests, Settings). */
    resetPortrait: function () { st.dismissed = false; layout(); },
  };
  var ro = {
    k: function () { return st.k; },
    uiK: function () { return st.uiK; },
    dpr: function () { return st.dpr; },
    scale: function () { return st.sx; },
    compact: function () { return st.compact; },
    portrait: function () { return st.portrait; },
    world: function () { return st.world; },
    fx: function () { return st.fx; },
    ctx: function () { return st.ctx; },
    fxCtx: function () { return st.fxCtx; },
    /** { left, top, width, height } of the stage box in CSS pixels, and the backing store size. */
    box: function () { return { left: st.left, top: st.top, width: st.cssW, height: st.cssH, backingW: st.bw, backingH: st.bh }; },
  };
  Object.keys(ro).forEach(function (name) { Object.defineProperty(SR.stage, name, { enumerable: true, get: ro[name] }); });

  SR.onBoot(10, function () {
    if (typeof document === 'undefined') return;
    if (!init()) console.error('SR.stage: index.html is missing #app > #stage > #world, #fx, #ui, #aria');
  });
})();
