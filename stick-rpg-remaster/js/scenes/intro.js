// js/scenes/intro.js — owner: W2-Front. The `intro` scene (UI §5.4): about 25 s in five beats with
// captions (js/art/intro.js draws the first four): a desk at night, you doze off, the sheet curls and
// pulls you in, you fall past floating paper cities, then the camera pulls out of your apartment's
// roof (the real renderer) to show the city floating in the sky and the card "Day 1. 08:00. $100.
// Mind the edges." The game then starts inside the apartment (the home door's building in the mode
// the door resolver gives: Live). Holding any key, a button or the screen for 0.6 s skips it (a
// hold-to-skip ring); a short press only shows the hint. SR.debug.fast() (tests) skips it at once.
// Load-time rule: registers the scene only.
(function () {
  'use strict';
  var SR = window.SR;

  var HOLD_SEC = 0.6;                   // UI §5.4: hold any key for 0.6 s
  var CARD_FROM = 21.5;                 // the "Day 1" card shows from here to the end
  var ZOOM = [1.25, 0.3];               // beat 5: the pull-out, from the roof to the whole sheet in the sky
  var ROOF_UP = 150;                    // u above the home door: the apartment's roof
  var RING_R = 22, RING_C = 2 * Math.PI * 22;

  var I = null;   // the running intro

  function D() { return SR.ui.dom; }
  function h() { return D().h.apply(null, arguments); }
  function text(k, v) { return SR.text(k, v); }
  function art() { return SR.art.intro; }
  function duration() { return art() ? art().DURATION : 25; }

  /** Starts the game inside the apartment (UI §5.4; B-02 startPlace). */
  function enterHome() {
    var s = SR.state;
    if (!s) { SR.scenes.go('title'); return; }
    var target = null;
    var home = SR.reg.home && SR.reg.home[s.homes.living];
    var W = SR.world;
    if (W && W.ready && typeof W.place === 'function') { try { W.place('homeDoor', s); } catch (e) { /* the map is missing */ } }
    if (home && home.door && W && W.doors && typeof W.doors.resolve === 'function') {
      try { target = W.doors.resolve(home.door, s); } catch (e) { target = null; }
    }
    if (target && target.id && SR.reg.scene.building) SR.scenes.go('building', { id: target.id, params: target.params || {} }, { transition: 'fade' });
    else SR.scenes.go(SR.reg.scene.city ? 'city' : 'title', null, { transition: 'fade' });
  }

  function finish() {
    if (!I || I.done) return;
    I.done = true;
    enterHome();
  }

  // ---- hold-to-skip: keys, pointers and pad buttons ----
  /** @returns {boolean} the intro is the top scene (a press in an overlay above it does not skip it). */
  function onTop() { var top = SR.scenes.top(); return !!(top && top.id === 'intro'); }
  function onKey(e) {
    if (!I || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.key === 'Tab') return;
    var k = 'k:' + (e.code || e.key);
    if (e.type !== 'keydown') { delete I.held[k]; return; }
    if (!onTop()) return;
    I.held[k] = true;
    I.hint = 1.2;
  }
  function onPointer(e) {
    if (!I) return;
    if (e.type === 'pointerdown') { if (onTop()) { I.held.pointer = true; I.hint = 1.2; } } else delete I.held.pointer;
  }
  function onInput(ev) {
    if (!I || !ev || ev.device !== 'pad' && ev.code) return;          // keys come through onKey
    var k = 'a:' + ev.action;
    if (ev.down) { if (!ev.repeat && onTop()) { I.held[k] = true; I.hint = 1.2; } } else delete I.held[k];
  }

  function holding() { for (var k in I.held) if (I.held[k]) return true; return false; }

  function caption(i) {
    if (!I || I.cap === i) return;
    I.cap = i;
    var key = 'front.intro.beat' + (i + 1);
    I.capEl.textContent = text(key);
    I.capEl.classList.remove('is-in'); void I.capEl.offsetWidth; I.capEl.classList.add('is-in');
    D().announce(text(key));
  }

  function renderReveal(ctx, alpha, k) {
    var s = SR.state, W = SR.world;
    var hd = W && W.ready && s ? W.homeDoor(s) : null;
    var x = hd ? hd.x : 1000, y = hd ? hd.y - ROOF_UP : 1000;
    var cx = SR.world && SR.world.geometry && SR.world.geometry.bounds ? SR.world.geometry.bounds : null;
    var e = SR.util.easeInOut(Math.max(0, Math.min(1, k)));
    var z = ZOOM[0] + (ZOOM[1] - ZOOM[0]) * e;
    var tx = cx ? x + ((cx[0] + cx[2]) / 2 - x) * e : x, ty = cx ? y + ((cx[1] + cx[3]) / 2 - y) * e : y;
    if (SR.render && typeof SR.render.frame === 'function' && W && W.ready) {
      SR.render.setView({ x: tx, y: ty, zoom: z, min: s ? s.clock.min : 480, day: 1, weather: 'clear', tween: false });
      SR.render.frame(ctx, alpha);
    } else {
      ctx.fillStyle = SR.art.draw.color('ui.paper-1');
      ctx.fillRect(0, 0, SR.W, SR.H);
    }
  }

  SR.scenes.register('intro', {
    kind: 'base',
    music: 'paper_sky',
    enter: function () {
      I = { t: 0, hold: 0, held: {}, hint: 0, done: false, cap: -1, beat: null, offs: [], view: false };
      window.addEventListener('keydown', onKey, true);
      window.addEventListener('keyup', onKey, true);
      I.offs.push(function () { window.removeEventListener('keydown', onKey, true); window.removeEventListener('keyup', onKey, true); });
      if (SR.input && typeof SR.input.on === 'function') I.offs.push(SR.input.on('*', onInput));
      if (SR.render && SR.render.actors && typeof SR.render.actors.source === 'function') {
        SR.render.actors.source('front.hide', function () { return I && I.view ? [{ kind: 'player', x: 0, y: 0, visible: false }] : null; }, 'player');
      }
    },
    exit: function () {
      if (I) I.offs.forEach(function (f) { f(); });
      if (SR.render && typeof SR.render.setView === 'function') SR.render.setView({ x: null, y: null, zoom: null, min: null, day: null, weather: null });
      if (SR.render && SR.render.actors && typeof SR.render.actors.source === 'function') SR.render.actors.source('front.hide', null);
      I = null;
    },
    update: function (dt) {
      if (!I || I.done) return;
      if (D().fast()) { finish(); return; }
      I.t += dt;
      I.hint = Math.max(0, I.hint - dt);
      I.hold = holding() ? I.hold + dt : 0;
      if (I.hold >= HOLD_SEC) { finish(); return; }
      var b = art() ? art().beatAt(I.t) : { i: Math.min(4, Math.floor(I.t / 5)), k: 0 };
      I.beat = b;
      caption(b.i);
      if (I.ringEl) {
        I.ringEl.parentNode.parentNode.hidden = !(I.hold > 0 || I.hint > 0);
        I.ringEl.setAttribute('stroke-dashoffset', String(RING_C * (1 - Math.min(1, I.hold / HOLD_SEC))));
      }
      if (I.cardEl) I.cardEl.hidden = I.t < CARD_FROM;
      if (I.t >= duration()) finish();
    },
    render: function (ctx, alpha) {
      if (!I || !ctx) return;
      var b = I.beat || { i: 0, k: 0 };
      if (b.i >= 4) { I.view = true; renderReveal(ctx, alpha, b.k); return; }
      I.view = false;
      if (art()) art().draw(ctx, I.t, { still: D().reduced() });
    },
    ui: {
      mount: function (root) {
        if (!I) return;
        var s = SR.state;
        I.capEl = h('p', { class: 'intro-caption', 'data-id': 'intro-caption', 'aria-hidden': 'true' });
        var ring = D().svg('svg', { class: 'intro-ring-svg', viewBox: '0 0 56 56', 'aria-hidden': 'true' },
          D().svg('circle', { class: 'intro-ring-track', cx: 28, cy: 28, r: RING_R }),
          D().svg('circle', { class: 'intro-ring-fill', cx: 28, cy: 28, r: RING_R, 'stroke-dasharray': String(RING_C), 'stroke-dashoffset': String(RING_C) }));
        I.ringEl = ring.lastChild;
        var skip = h('div', { class: 'intro-skip', 'data-id': 'intro-skip', hidden: true }, h('span', { class: 'intro-ring' }, ring), h('span', { class: 'intro-skip-text' }, text('front.intro.skip')));
        I.cardEl = h('div', { class: 'intro-card paper', 'data-id': 'intro-card', role: 'status', hidden: true },
          h('p', { class: 'intro-card-text' }, text('front.intro.card', {
            day: s ? s.clock.day : 1, time: SR.text.time(s ? s.clock.min : 480), money: SR.text.money(s ? s.money.cash : 0) })));
        var tap = h('button', { type: 'button', class: 'intro-tap vh', 'data-id': 'intro-skip-button' }, text('front.intro.skipNow'));
        tap.addEventListener('click', function () { finish(); });
        var box = h('div', { class: 'intro', 'data-id': 'intro' }, I.capEl, skip, I.cardEl, tap);
        root.appendChild(box);
        box.addEventListener('pointerdown', onPointer);
        window.addEventListener('pointerup', onPointer);
        window.addEventListener('pointercancel', onPointer);
        I.offs.push(function () { window.removeEventListener('pointerup', onPointer); window.removeEventListener('pointercancel', onPointer); });
      },
      unmount: function () {},
    },
    onAction: function (action, ev) { if (ev) ev.consumed = true; return true; },     // the hold listeners decide; nothing else acts
    /** @returns {object|null} the intro's clock (tests). */
    info: function () { return I ? { t: I.t, beat: I.beat ? I.beat.id || I.beat.i : null, hold: I.hold, done: I.done, caption: I.cap } : null; },
    /** Skips to the end (the skip button's path; tests). */
    skip: function () { finish(); },
  });
})();
