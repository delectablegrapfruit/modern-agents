// js/scenes/report.js — owner: W2-Home. The `report` scene (CONTRACT §11.3; UI §5.11): The Daily
// Fold over the scene that ran the night, laid out by js/ui/screens/report.js; and the home card's
// UI hand-offs.
//
// params = { report, next?, events?, dayStarted? }:
//   report      the night's Report (ARCHITECTURE §6.6); its edition follows report.kind and
//               report.election (the election-night front page first, even on a jail or hospital
//               night);
//   next        'city' (the default for a sleep or hospital night): the player steps out of the home
//               door into the city at the new day's wake time (after a hospital night that is
//               12:00, at the worldmap's 'afterHospital' spawn, the home door); 'pop' (the default
//               for a jail night): the scene pops itself with 'done' and the caller carries on; any
//               other registered scene id: that scene (SR.scenes.go);
//   events      false: the Report's rule events are not re-emitted (a caller that emitted them);
//   dayStarted  false: no day:started (a caller that emits it).
// Closing the paper finishes the night as CONTRACT §8.7 / §9.2 ask of the report scene: the
// Report's rule events are re-emitted, then achievement:unlocked for its achievements (P1) and
// day:started { day, report }. When the night ended the game (a timed game's last day, a Hardcore
// loan default) the button reads "Read the Final Edition" and game:over is emitted here unless
// SR.act already did for this game and day; the results scene (W2-Front) queues itself on it.
//
// The hand-offs (action:done): a sleep night's Result.report opens this scene over the home card
// (the jail's and the hospital's nights are W2-Transit's to present); the home's Save row opens the
// save screen (`saveload` in save mode, W2-Front) or, until it lands, writes the first slot; and
// (home:changed) the home card's greeting follows its door when the door's mode changes in place.
// Load-time rule: defines functions and registers the scene only.
(function () {
  'use strict';
  var SR = window.SR;

  var MUSIC = { sleep: 'morning_edition', hospital: 'waiting_room', jail: 'doing_time' };
  var FALLBACK_SLOT = 'slot1';      // the Save row's slot until W2-Front's save screen lands

  var open = null;                  // { params, page, scope, done } while the paper is up
  var overAt = null;                // { state, day } of the last game:over seen on the bus

  function D() { return SR.ui.dom; }

  /** @returns {boolean} the game is over (the night ended it). */
  function gameOver() { return !!(SR.state && SR.state.over); }

  /** @returns {boolean} game:over was emitted already for this game and day (SR.act derives it). */
  function overEmitted() {
    var s = SR.state;
    return !!(overAt && s && overAt.state === s && overAt.day === s.clock.day);
  }

  /** The button on the last page: the night's events, day:started, then where the day begins. */
  function finish(params) {
    var top = SR.scenes.top();
    if (!open || open.done || !top || top.id !== 'report' || top.params !== params) return;
    open.done = true;
    var rep = params.report || {}, s = SR.state;
    var next = params.next || (rep.kind === 'jail' ? 'pop' : 'city');
    if (params.events !== false) (rep.events || []).forEach(function (e) { if (e && e.name) SR.events.emit(e.name, e.payload); });
    (rep.achievements || []).forEach(function (id) { SR.events.emit('achievement:unlocked', { id: id }); });
    if (s && params.dayStarted !== false) SR.events.emit('day:started', { day: typeof rep.day === 'number' ? rep.day : s.clock.day, report: rep });
    if (gameOver()) {
      var reason = rep.dead ? 'death' : (s.result && s.result.reason) || 'time';
      if (!overEmitted()) SR.events.emit('game:over', { reason: reason, result: s.result });
      SR.scenes.pop('done');
      // The results scene queues itself on game:over (W2-Front); a queued change runs as soon as
      // the top is a base scene, i.e. now. If nothing took over, go there (or to the title).
      if (next === 'pop') return;
      var st = SR.scenes.stack();
      if (st.indexOf('results') >= 0 || st.indexOf('death') >= 0) return;
      if (SR.reg.scene.results) SR.scenes.queue('results', { reason: reason, result: s.result });
      else SR.scenes.go('title');
      return;
    }
    if (next === 'pop') { SR.scenes.pop('done'); return; }
    if (next !== 'city' && SR.reg.scene[next]) { SR.scenes.go(next); return; }
    // GDD §4.16 / ARCHITECTURE §6.7: after a hospital night, the worldmap's afterHospital spawn.
    if (s && SR.world && SR.world.ready && typeof SR.world.place === 'function') SR.world.place(rep.kind === 'hospital' ? 'afterHospital' : 'homeDoor', s);
    SR.scenes.go(SR.reg.scene.city ? 'city' : 'title');
  }

  SR.scenes.register('report', {
    kind: 'overlay',
    blocksUpdate: true,
    ui: {
      mount: function (root, params) {
        params = params || {};
        var rep = params.report || { kind: 'sleep', lines: [] };
        var page = SR.ui.report.build(rep, { final: gameOver(), onContinue: function () { finish(params); } });
        root.classList.add('modal-root');
        root.appendChild(D().h('div', { class: 'scrim', 'data-id': 'scrim' }));
        root.appendChild(page);
        open = { params: params, page: page, scope: SR.ui.focus.push(page, { id: 'report' }), done: false };
        SR.ui.focus.focus(page.button);
        D().sfx('open');
        var song = MUSIC[rep.kind] || MUSIC.sleep;
        if (SR.audio && typeof SR.audio.music === 'function' && SR.reg.song && SR.reg.song[song]) SR.audio.music(song);
        page.onShow();
        D().announce(SR.ui.report.headline(rep));
      },
      unmount: function () {
        if (open) SR.ui.focus.pop(open.scope);
        open = null;
      },
    },
    onAction: function (action, ev) {
      if (ev && ev.consumed) return true;
      if (SR.ui.focus.handle(action, ev)) return true;
      if (!open || (ev && ev.down === false)) return false;
      if (action === 'back') {
        if (!(ev && ev.repeat) && !open.page.next()) finish(open.params);
        return true;
      }
      // The paper is modal: the Pocket, the pause menu and the rows under it wait.
      return action === 'pocket' || action === 'pause' || action === 'interact' || /^row\d$/.test(action);
    },
  });

  // ---- the home card's greeting follows its door (UI §5.6) ------------------------------------------
  // The card picks its greeting once, at the door (greet.home). Rows switch in place when the door's
  // mode changes (Tour → buy, Move in, Let out: js/data/buildings/home.js), so the greeting follows:
  // "For sale: ..." must not stay up over the Move in row. Uses the Card component's setGreeting.
  // Checked on home:changed and after every action (a let changes no `home` Delta, so SR.act raises
  // no home:changed for it); the signature keeps it from retyping when nothing it names changed.
  var greetSig = null;              // the door's mode:home:let when the card's greeting was picked

  /** @returns {string|null} what the home card's greeting depends on at this door, or null. */
  function doorSig(params) {
    var fx = SR.reg.fn && SR.reg.fn['home.effective'], s = SR.state;
    if (!fx || !s || !params) return null;
    var e = fx(s, params), lets = s.homes.lets || {};
    return e.mode + ':' + e.homeId + ':' + (lets[e.homeId] !== undefined ? 'let' : '');
  }

  function regreet() {
    if (!SR.ui.card || SR.ui.card.current() !== 'home' || typeof SR.ui.card.debug !== 'function') return;
    var d = SR.ui.card.debug(), params = d && d.params, sig = doorSig(params);
    if (sig === null || sig === greetSig) return;
    greetSig = sig;
    var el = document.querySelector('#ui [data-id="card"]'), fn = SR.reg.fn['greet.home'];
    if (!el || typeof el.setGreeting !== 'function' || typeof fn !== 'function') return;
    var g = fn(SR.state, params, { rng: SR.rng.fx, now: SR.state.clock.min, source: 'ui' });
    if (g) el.setGreeting(typeof g === 'string' ? g : g.key, g.vars);
  }

  /** The home's Save row: the save screen in save mode, else (until W2-Front's lands) slot 1. */
  function openSave() {
    if (SR.reg.scene.saveload) { SR.scenes.push('saveload', { mode: 'save' }); return; }
    try {
      SR.save.write(FALLBACK_SLOT);
      SR.ui.toast({ key: 'toast.home.saved', vars: { slot: 1 }, kind: 'info' });
    } catch (e) {
      SR.ui.toast({ key: 'toast.home.saveFailed', kind: 'warning' });
    }
  }

  SR.onBoot(50, function () {
    SR.events.on('game:over', function () { overAt = SR.state ? { state: SR.state, day: SR.state.clock.day } : null; });
    SR.events.on('door:entered', function (p) {
      var top = SR.scenes.top();
      greetSig = p && p.id === 'home' && top && top.params ? doorSig(top.params.params) : null;
    });
    SR.events.on('home:changed', regreet);
    SR.events.on('action:done', function (p) {
      var r = p && p.result;
      if (!r || !r.ok) return;
      regreet();
      if (r.report && r.report.kind === 'sleep') {
        var top = SR.scenes.top();
        if (!(top && top.id === 'report')) SR.scenes.push('report', { report: r.report });
        return;
      }
      if (p.id === 'home.save') openSave();
    });
  });
})();
