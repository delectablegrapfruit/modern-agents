// js/ui/screens/title.js — owner: W2-Front. The title screen (UI §5.2) and the backdrop the front
// end shares (SR.ui.title):
//   backdrop     the real renderer in title mode: the live city at 19:00 with a slow camera drift
//                (SR.render.setView; traffic and pedestrians follow the view, the player is hidden);
//                none with Reduced Motion. enter() / exit() / update(dt) / render(ctx, alpha); the
//                title, the new-game wizard and the credits use it.
//   mount(root, { gate })  the screen: the "Press any key or click" card first after boot (UI §5.1:
//                the logo draws itself in 1.2 s, the fan note; a pad-only player reads "Press A to
//                start. Sound begins after one click or key press."), then the menu (Continue, New
//                Game, Load, Classic, Hall of Fame (P1 `achievements`), Achievements → profile,
//                Settings, Credits), the save card of the most recent save, the one-time "What's new"
//                card, the fan note and the version with the Old School badge.
//   classic()    the Classic confirm, then ../stick-rpg/index.html in the same tab after a suspend
//                save when a game is running (ARCHITECTURE §15; GDD §5); Sticky's cabinet (P1) calls it.
//   swallowClick()  eats the click of a tap that already acted (the boot card, the intro's hold-to-skip)
//                so it cannot land on the next screen.
// Colours come from css/screens.css (tokens) and SR.art.palette; text from en-front / en-ui.
// Load-time rule: defines functions only.
(function () {
  'use strict';
  var SR = window.SR;

  var CLASSIC_URL = '../stick-rpg/index.html';   // the untouched recreation, same tab (ARCHITECTURE §15)
  var TITLE_MIN = 1140;                          // the backdrop's hour: 19:00, dusk (UI §5.2)
  var DRIFT = { x: 2480, y: 2200, ax: 420, ay: 220, wx: 0.021, wy: 0.034 };   // u and rad/s: a slow Lissajous drift
  var ZOOM = 0.6;                                // wide enough to see blocks and people at once
  var IDLE = { x: 0, y: 0, skate: false };       // the world steps with no input behind the menu
  var LOGO_W = 480, LOGO_H = 170;                // the menu's logo canvas (CSS px)
  var GATE_LOGO_W = 900, GATE_LOGO_H = 260;      // the boot card's logo canvas
  var PAD_NOTE_SEC = 0.5;                        // how often the pad-only sound note is re-judged
  var SWALLOW_MS = 600;                          // a tap's click follows its release within this
  var HIDE = [{ kind: 'player', x: 0, y: 0, visible: false }];   // a hidden stand-in replaces the player

  function D() { return SR.ui.dom; }
  function h() { return D().h.apply(null, arguments); }
  function text(k, v) { return SR.text(k, v); }
  function fast() { return D().fast(); }

  // ------------------------------------------------------------------------------------------------
  // The backdrop (UI §5.2: "the real renderer in title mode")
  // ------------------------------------------------------------------------------------------------
  var B = { on: 0, t: 0 };

  function world() { return SR.world && SR.world.ready ? SR.world : null; }
  function setLive(on) {
    var W = world();
    if (!W) return;
    if (W.traffic) W.traffic.live = on;
    if (W.pedestrians) W.pedestrians.live = on;
  }
  function driftAt(t) {
    if (D().reduced()) return { x: DRIFT.x, y: DRIFT.y };
    return { x: DRIFT.x + DRIFT.ax * Math.sin(t * DRIFT.wx), y: DRIFT.y + DRIFT.ay * Math.sin(t * DRIFT.wy) };
  }

  var backdrop = {
    /** Starts the title-mode view (idempotent while another front-end scene keeps it). */
    enter: function () {
      B.on++;
      var p = driftAt(B.t);
      if (SR.render && typeof SR.render.setView === 'function') {
        SR.render.setView({ x: p.x, y: p.y, zoom: ZOOM, min: TITLE_MIN, day: 1, weather: 'clear', tween: false });
      }
      if (SR.render && SR.render.actors && typeof SR.render.actors.source === 'function') {
        SR.render.actors.source('front.hide', function () { return HIDE; }, 'player');
      }
      setLive(true);
    },
    /** Gives the view back to the world and the state. */
    exit: function () {
      B.on = Math.max(0, B.on - 1);
      if (B.on) return;
      if (SR.render && typeof SR.render.setView === 'function') {
        SR.render.setView({ x: null, y: null, zoom: null, min: null, day: null, weather: null, tween: false });
      }
      if (SR.render && SR.render.actors && typeof SR.render.actors.source === 'function') SR.render.actors.source('front.hide', null);
      setLive(false);
    },
    /** One fixed step: the drift, and the world's traffic and walkers (only while no game runs). */
    update: function (dt) {
      B.t += dt;
      var p = driftAt(B.t);
      if (SR.render && SR.render.view) { SR.render.view.x = p.x; SR.render.view.y = p.y; }
      var W = world();
      if (W && !SR.state) W.update(dt, IDLE);
    },
    /** Draws the city (or plain paper while the render core or the map is missing). */
    render: function (ctx, alpha) {
      if (!ctx) return;
      if (SR.render && typeof SR.render.frame === 'function' && world()) { SR.render.frame(ctx, alpha); return; }
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = SR.art.draw.color('ui.paper-1');
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.restore();
    },
    /** @returns {{x: number, y: number}} the drift's centre now (tests). */
    at: function () { return driftAt(B.t); },
  };

  // ------------------------------------------------------------------------------------------------
  // Saves, the profile and the Classic link
  // ------------------------------------------------------------------------------------------------
  function profile() { try { return SR.save.profile(); } catch (e) { return null; } }
  /** @returns {boolean} a gamepad is connected (the boot card then names its button, UI §5.2). */
  function padConnected() {
    var list = [];
    try { list = navigator.getGamepads ? navigator.getGamepads() : []; } catch (e) { list = []; }
    for (var i = 0; list && i < list.length; i++) if (list[i] && list[i].connected !== false) return true;
    return false;
  }
  function saveProfile(p) { try { SR.save.saveProfile(p); } catch (e) { SR.util.warnOnce('front.profile', 'title: the profile could not be saved (' + e.message + ')'); } }

  /** Sets a profile badge once (UI §5.18: "Old School", "Met the Artist"). */
  function badge(id) {
    var p = profile();
    if (!p) return;
    if (!p.badges[id]) { p.badges[id] = new Date().toISOString().slice(0, 10); saveProfile(p); }
  }

  /** Goes to a page in the same tab (tests may replace it). */
  function navigate(url) { window.location.assign(url); }

  /**
   * Swallows the click that ends a press which has already acted: the boot card folds on
   * pointerdown and the intro skips on a held press, and a touch's click is dispatched where the
   * finger lifts, so without this it lands on whatever the next screen put there (a title menu item,
   * an apartment row). Only a pointer's click counts (js/ui/focus.js activates with a scripted
   * el.click(), and Chrome's keyboard click has pointerType ''), and only up to SWALLOW_MS after the
   * release; the next press ends it either way. @returns {function} ends it now
   */
  function swallowClick() {
    var upAt = null;
    function off() {
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointerdown', off, true);
    }
    function onUp(e) { upAt = e.timeStamp; }
    function onClick(e) {
      if (!e.isTrusted || e.pointerType === '') return;
      off();
      if (upAt !== null && e.timeStamp - upAt > SWALLOW_MS) return;
      e.preventDefault();
      e.stopPropagation();
    }
    window.addEventListener('click', onClick, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointerdown', off, true);
    return off;
  }

  /**
   * The Classic link (GDD §5; ARCHITECTURE §15): a confirm, then the recreation in the same tab
   * after a suspend save when a game is running; the browser's Back button returns to the title,
   * where Continue resumes. Earns the "Old School" badge.
   * @returns {Promise<boolean>} whether the page is leaving
   */
  function classic() {
    var body = h('p', { class: 'modal-text', 'data-id': 'classic-back' }, text('front.classic.back'));
    return SR.ui.confirm({ id: 'classic', title: 'front.classic.title', text: 'front.classic.text', body: body, yes: 'front.classic.go' })
      .then(function (ok) {
        if (!ok) return false;
        if (SR.state && !SR.state.over && SR.ui.saveload) {
          try { SR.ui.saveload.suspend(); } catch (e) { SR.ui.toast({ key: 'ui.save.failed', kind: 'warning' }); return false; }
        }
        badge('oldSchool');
        SR.ui.title.navigate(CLASSIC_URL);
        return true;
      });
  }

  // ------------------------------------------------------------------------------------------------
  // The screen
  // ------------------------------------------------------------------------------------------------
  /** A logo canvas sized in CSS px, with a backing store for the UI zoom and the device ratio. */
  function logoCanvas(w, hh, id) {
    var cv = h('canvas', { class: 'title-logo', 'data-id': id, 'aria-hidden': 'true', style: { width: w + 'px', height: hh + 'px' } });
    cv.logicalW = w; cv.logicalH = hh;
    return cv;
  }
  function paintLogo(cv, t, opts) {
    if (!cv || !SR.art.logo || typeof SR.art.logo.draw !== 'function') return;
    var k = ((SR.stage && SR.stage.uiK) || 1) * (window.devicePixelRatio || 1);
    var bw = Math.round(cv.logicalW * k), bh = Math.round(cv.logicalH * k);
    if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
    var ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.clearRect(0, 0, cv.logicalW, cv.logicalH);
    SR.art.logo.draw(ctx, t, opts);
  }

  function difficultyName(id) { return SR.text.has('front.diff.' + id) ? text('front.diff.' + id) : String(id || ''); }
  function playTime(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var hrs = Math.floor(sec / 3600), mins = Math.floor((sec % 3600) / 60);
    return hrs ? text('front.time.hm', { h: hrs, m: mins }) : text('front.time.m', { m: mins });
  }

  /** The lines of a save's meta (the title's save card and the save slots). */
  function metaLines(meta) {
    var len = meta.length ? text('front.save.dayOf', { day: meta.day, length: meta.length }) : text('front.save.day', { day: meta.day });
    var job = meta.title && SR.text.has('job.' + meta.title) ? text('job.' + meta.title) : text('job.none');
    return [
      text('front.save.who', { name: meta.name || text('front.save.nameless'), days: len }),
      text('front.save.what', { title: job, money: SR.text.money(meta.netWorth || 0) }),
      text('front.save.how', { difficulty: difficultyName(meta.difficulty), time: playTime(meta.playSec) }),
    ];
  }

  function thumb(meta, cls) {
    if (meta && meta.thumb && /^data:image\//.test(meta.thumb)) return h('img', { class: cls, src: meta.thumb, alt: '', 'aria-hidden': 'true', draggable: 'false' });
    return h('span', { class: cls + ' is-empty', 'aria-hidden': 'true' });
  }

  function mount(root, opts) {
    opts = opts || {};
    var T = { root: root, gateOn: false, scope: null, gateScope: null, logoT: 0, logoDirty: true, padT: 0, destroyed: false, keyOff: null };
    var el = h('div', { class: 'title-screen', 'data-id': 'title' });
    root.appendChild(el);

    // ---- the menu side ----
    var logo = logoCanvas(LOGO_W, LOGO_H, 'title-logo');
    var menu = h('nav', { class: 'title-menu', 'data-id': 'title-menu', 'aria-label': text('front.menu.label') });
    var news = h('div', { class: 'title-news-slot' });
    var left = h('div', { class: 'title-left paper' },
      h('h1', { class: 'vh', 'data-id': 'title-name' }, text('game.title') + ' · ' + text('game.tag')), logo, menu);
    var card = h('section', { class: 'title-card paper', 'data-id': 'title-save', 'aria-label': text('front.save.card') });
    var padNote = h('p', { class: 'title-padnote', 'data-id': 'title-padnote', hidden: true }, text('front.gate.sound'));
    var version = h('p', { class: 'title-ver', 'data-id': 'title-version' });
    var foot = h('footer', { class: 'title-foot' },
      h('p', { class: 'title-fan', 'data-id': 'title-fan' }, text('ui.fanNote')), padNote, version);
    var main = h('div', { class: 'title-main', 'data-id': 'title-main' }, left, card, news, foot);
    el.appendChild(main);

    function items() {
      var hasSave = !!(SR.ui.saveload && SR.ui.saveload.latest());
      var list = [];
      if (hasSave) list.push({ id: 'continue', label: 'front.menu.continue', run: function () { SR.ui.saveload.continueLatest(); } });
      list.push({ id: 'new', label: 'front.menu.new', run: function () { SR.scenes.go('newgame'); } });
      list.push({ id: 'load', label: 'front.menu.load', run: function () { SR.scenes.push('saveload', { mode: 'load' }); } });
      list.push({ id: 'classic', label: 'front.menu.classic', run: classic });
      if (SR.features.achievements) list.push({ id: 'hof', label: 'front.menu.hof', run: function () { SR.scenes.go('halloffame'); } });
      list.push({ id: 'achievements', label: 'front.menu.achievements', run: function () { SR.scenes.go('profile'); } });
      list.push({ id: 'settings', label: 'front.menu.settings', run: function () { SR.scenes.push('settings'); } });
      list.push({ id: 'credits', label: 'front.menu.credits', run: function () { SR.scenes.go('credits'); } });
      return list;
    }

    function buildMenu() {
      D().clear(menu);
      items().forEach(function (it) {
        menu.appendChild(SR.ui.button({ id: 'title-' + it.id, label: it.label, variant: 'ghost', cls: 'title-item', onClick: it.run }));
      });
    }

    function buildCard() {
      D().clear(card);
      var e = SR.ui.saveload ? SR.ui.saveload.latest() : null;
      card.hidden = !e;
      if (!e) return;
      var lines = metaLines(e.meta);
      card.appendChild(thumb(e.meta, 'title-thumb'));
      card.appendChild(h('p', { class: 'title-card-name', 'data-id': 'title-save-name' }, lines[0]));
      card.appendChild(h('p', { class: 'title-card-line' }, lines[1]));
      card.appendChild(h('p', { class: 'title-card-line' }, lines[2]));
    }

    function buildNews() {
      D().clear(news);
      var p = profile();
      if (!p || p.hintsSeen.whatsNew) return;
      var list = h('ul', { class: 'title-news-list' });
      ['front.news.1', 'front.news.2', 'front.news.3', 'front.news.4'].forEach(function (k) { list.appendChild(h('li', null, text(k))); });
      var got = SR.ui.button({ id: 'title-news-ok', label: 'front.news.ok', size: 's', onClick: function () {
        var q = profile();
        if (q) { q.hintsSeen.whatsNew = true; saveProfile(q); }
        var first = menu.querySelector('[data-nav]');
        D().clear(news);
        if (first) SR.ui.focus.focus(first);
      } });
      news.appendChild(h('section', { class: 'title-news paper', 'data-id': 'title-news', 'aria-label': text('front.news.title') },
        h('h2', { class: 'title-news-head' }, text('front.news.title')), list, got));
    }

    function buildFoot() {
      var p = profile();
      var v = text('front.title.version', { v: SR.VERSION });
      if (p && p.badges.oldSchool) v += ' · ' + text('front.title.oldSchool');
      version.textContent = v;
    }

    /** Re-reads the saves and the profile (after an overlay closes, or the page came back). */
    T.refresh = function () {
      if (T.destroyed) return;
      var had = SR.ui.focus.focused();
      var hadId = had && had.getAttribute('data-id');
      buildMenu(); buildCard(); buildNews(); buildFoot();
      paintLogo(logo, undefined, { x: LOGO_W / 2, y: 100, width: 420 });
      if (T.scope && !T.gateOn) {
        var back = hadId ? el.querySelector('[data-id="' + hadId + '"]') : null;
        SR.ui.focus.focus(back || menu.querySelector('[data-nav]'));
      }
    };

    // ---- the boot card ("Press any key or click", UI §5.1) ----
    var gateLogo = null, gatePress = null, gate = null, gateWrap = null;
    function padOnly() { return (SR.input && SR.input.last === 'pad') || padConnected(); }
    function gateText() {
      if (!gatePress) return;
      var glyph = SR.ui.keyHint && typeof SR.ui.keyHint.glyph === 'function' ? SR.ui.keyHint.glyph('Pad0') : 'A';
      var line = padOnly() ? text('front.gate.pad', { button: glyph }) : text('front.gate.press');
      if (gatePress.textContent !== line) gatePress.textContent = line;   // re-judged twice a second: write only a change
    }
    /** @returns {boolean} the stage's "turn your device" card is up (it keeps its focus and its keys). */
    function portraitUp() {
      var c = document.querySelector('[data-id="stage-portrait"]');
      return !!(c && c.getClientRects().length);
    }
    function onGateKey(e) {
      if (!T.gateOn) return;
      var top = SR.scenes.top();
      if (!top || top.id !== 'title') return;                  // a scene above the title (a test's minigame, #debug) keeps its keys
      var ae = document.activeElement;
      if (portraitUp() || (ae && ae !== document.body && !root.contains(ae))) return;   // focus outside the card keeps its keys
      var k = e.key || '';
      if (e.ctrlKey || e.metaKey || e.altKey || k === 'Tab' || /^F\d+$/.test(k)) return;   // focus moves and browser keys pass
      e.preventDefault();
      e.stopPropagation();      // taken here: SR.input never turns this press into a menu action
      T.dismissGate();
    }
    if (opts.gate) {
      T.gateOn = true;
      main.hidden = true;
      gateLogo = logoCanvas(GATE_LOGO_W, GATE_LOGO_H, 'title-gate-logo');
      gatePress = h('span', { class: 'title-gate-press', 'data-id': 'title-gate-press' });
      gate = h('button', { type: 'button', class: 'title-gate nav-inset', 'data-id': 'title-gate', 'data-nav': '' },
        h('span', { class: 'vh' }, text('game.title') + '. '), gateLogo,
        h('span', { class: 'title-gate-fan' }, text('ui.fanNote')), gatePress);
      gate.addEventListener('pointerdown', function (e) { e.preventDefault(); if (T.dismissGate()) swallowClick(); });
      gateWrap = h('div', { class: 'title-gate-wrap paper' }, gate);
      el.appendChild(gateWrap);
      gateText();
      T.gateScope = SR.ui.focus.push(gateWrap, { id: 'title-gate', initial: gate, autofocus: !portraitUp() });
      window.addEventListener('keydown', onGateKey, true);
      T.keyOff = function () { window.removeEventListener('keydown', onGateKey, true); };
      paintLogo(gateLogo, fast() ? undefined : 0, { x: GATE_LOGO_W / 2, y: 150, width: 760 });
    }

    function openMenu() {
      main.hidden = false;
      T.refresh();
      T.scope = SR.ui.focus.push(main, { id: 'title', initial: menu.querySelector('[data-nav]') });
    }

    /** Folds the boot card away and shows the menu (any key, click, tap or pad button). */
    T.dismissGate = function () {
      if (!T.gateOn || T.destroyed) return false;
      T.gateOn = false;
      if (T.keyOff) { T.keyOff(); T.keyOff = null; }
      if (T.gateScope) { SR.ui.focus.pop(T.gateScope); T.gateScope = null; }
      if (gateWrap && gateWrap.parentNode) gateWrap.parentNode.removeChild(gateWrap);
      gate = null; gateWrap = null;
      D().sfx('open');
      openMenu();
      D().announce(text('game.title') + '. ' + text('game.tag'));
      return true;
    };

    /** Per fixed step: the boot card's logo clock, the pad-only sound note. */
    T.update = function (dt) {
      if (T.destroyed) return;
      if (T.gateOn && gateLogo) {
        var total = SR.art.logo ? SR.art.logo.duration + 0.3 : 1.5;
        if (T.logoT < total + 0.1) { T.logoT += dt; T.logoDirty = true; }
      }
      T.padT += dt;
      if (T.padT >= PAD_NOTE_SEC) {
        T.padT = 0;
        gateText();
        var locked = SR.audio && typeof SR.audio.state === 'function' && SR.audio.state() === 'locked';
        padNote.hidden = !(locked && SR.input && SR.input.last === 'pad' && !T.gateOn);
      }
    };

    /** Per rendered frame: paints the boot card's logo once when its clock moved (a catch-up frame runs several steps). */
    T.render = function () {
      if (T.destroyed || !T.logoDirty || !T.gateOn || !gateLogo) return;
      T.logoDirty = false;
      var total = SR.art.logo ? SR.art.logo.duration + 0.3 : 1.5;
      paintLogo(gateLogo, fast() || D().reduced() ? undefined : Math.min(T.logoT, total), { x: GATE_LOGO_W / 2, y: 150, width: 760 });
    };

    T.destroy = function () {
      T.destroyed = true;
      if (T.keyOff) { T.keyOff(); T.keyOff = null; }
      if (T.gateScope) { SR.ui.focus.pop(T.gateScope); T.gateScope = null; }
      if (T.scope) { SR.ui.focus.pop(T.scope); T.scope = null; }
    };
    T.el = el;
    T.menu = menu;

    if (!opts.gate) openMenu();
    return T;
  }

  SR.ui.title = {
    mount: mount,
    backdrop: backdrop,
    classic: classic,
    navigate: navigate,
    swallowClick: swallowClick,
    badge: badge,
    metaLines: metaLines,
    playTime: playTime,
    difficultyName: difficultyName,
    thumb: thumb,
    CLASSIC_URL: CLASSIC_URL,
  };
})();
