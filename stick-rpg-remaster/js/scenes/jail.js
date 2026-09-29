// js/scenes/jail.js — owner: W2-Transit. The `jail` scene and the jail listener (GDD §4.10, §6.6;
// UI §3 "Jail ─ Jail Day card + one-line night report ×N → City (08:00, outside City Hall)", §5.12;
// ARCHITECTURE §5; CONTRACT §8.10, §11.3).
//
// The listener: an arrest (the rule event `jail`, then action:done with Result.jailed and the arrest
// night's Report) queues this scene once the top of the stack is a base scene (a lost Hold-up comes
// back from its minigame first). A bust on the Sky Bus is presented by the trip scene first
// (js/scenes/bustrip.js), which hands over here with the Result.
//
// The scene: the cell (the 'jail' interior of js/art/interiors/special.js: bars in front, the cot,
// the calendar's tally marks, a barred window high up) and the Jail Day card (js/ui/screens/jail.js).
// Each choice runs jail.day (the day's gain, then the jail night), plays the card's feedback, and
// finishes that night as the report scene would for a sleep (the Report's rule events, then
// day:started: the autosave, the HUD, the world stream) while the card shows the night's one-line
// summary; jail nights never open the full report (UI §5.11), except an election night, whose
// edition is pushed over the cell. On release (daysLeft 0, or Bail with P1 `police`) the card reads
// "Released at 08:00" and Walk out places you outside City Hall ('afterJail') in the city. A timed
// game that ends during a jail night ends here: the card leads to the results (the Final Edition).
// Load-time rule: defines functions, registers the scene; the listeners are added in a boot hook.
(function () {
  'use strict';
  var SR = window.SR;

  var POSES = { str: 'lift', int: 'study', cha: 'talk', hp: 'sit' };
  var MATE = { look: 'stranger', x: 600, y: 600, facing: 'left' };   // the cellmate you make friends with
  var J = null;                // the scene's state while it is on the stack
  var emitted = [];            // the Reports whose night this module finished (never twice)
  var last = { state: null, report: null };   // the latest jail night's Report and the game it belongs to
                                              // (a resumed cell shows its summary; never another game's)

  function fast() { return !!(SR.debug && typeof SR.debug.fast === 'function' && SR.debug.fast()); }

  /** Remembers a jail night's Report for this game (a loaded save or a new game is another one). */
  function remember(report) { last = { state: SR.state, report: report }; }

  /** @returns {object|null} the latest jail night's Report of the live game, if this session saw it. */
  function recalled() {
    var s = SR.state, r = last.report;
    return r && last.state === s && (typeof r.day !== 'number' || r.day === s.clock.day) ? r : null;
  }

  /** Finishes a jail night as the report scene does for a sleep: its rule events, then day:started. */
  function startDay(report) {
    if (!report || !SR.state || emitted.indexOf(report) >= 0) return;
    emitted.push(report);
    if (emitted.length > 8) emitted.shift();
    (report.events || []).forEach(function (e) { if (e && e.name) SR.events.emit(e.name, e.payload); });
    SR.events.emit('day:started', { day: typeof report.day === 'number' ? report.day : SR.state.clock.day, report: report });
  }

  /**
   * An election night on a jail night: the report scene's election edition over the cell (UI §5.11).
   * This scene has finished the night already, so the paper only shows it and pops back ('pop').
   */
  function electionNight(report) {
    if (!report || !report.election || !SR.reg.scene.report) return;
    var top = SR.scenes.top();
    if (top && top.id === 'report') return;
    SR.scenes.push('report', { report: report, next: 'pop', events: false, dayStarted: false }).then(function () { render(); });
  }

  function extra() {
    return { reason: J.reason, days: J.days, bailed: J.bailed };
  }

  function render() {
    if (!J || !J.card) return;
    var v = SR.ui.jail.view(SR.state, J.report, extra());
    if (v.days) J.days = v.days;
    J.mode = v.mode;
    J.card.render(v);
    if (J.mode !== 'day') SR.ui.focus.focus(J.card.leave);
  }

  /** Runs a Jail Day choice. */
  function choose(choice, row) {
    if (!J || J.mode !== 'day' || J.busy) return;
    J.busy = true;
    var res = SR.act('jail.day', { choice: choice });
    J.busy = false;
    SR.ui.card.feedback(res, row);
    if (!res || !res.ok) { render(); return; }
    J.pose = POSES[choice] || 'idle';
    J.poseChoice = choice;
    if (res.report) { J.report = res.report; remember(res.report); startDay(res.report); electionNight(res.report); }
    render();
  }

  function bail(row) {
    if (!J || J.mode !== 'day') return;
    var res = SR.act('jail.bail', {});
    SR.ui.card.feedback(res, row);
    if (res && res.ok) J.bailed = true;
    render();
  }

  /** Walk out (released): outside City Hall at 08:00; or the results when the story ended in jail. */
  function leave() {
    if (!J) return;
    var s = SR.state;
    if (J.mode === 'day') {
      var left = s && s.jail ? s.jail.daysLeft : 0;
      SR.ui.dom.refuse(J.card && J.card.leave, SR.ui.dom.t(left === 1 ? 'card.jail.servingOne' : 'card.jail.serving', { days: left }));
      return;
    }
    if (J.mode === 'over') {
      SR.scenes.go(SR.reg.scene.results ? 'results' : 'title', { reason: (s && s.result && s.result.reason) || 'time', result: s ? s.result : null }, { transition: 'fade' });
      return;
    }
    if (s && SR.world && SR.world.ready) SR.world.place('afterJail', s);
    SR.scenes.go(SR.reg.scene.city ? 'city' : 'title', {}, { transition: 'fade' });
  }

  function drawCell(ctx) {
    var r = J.interior;
    if (!r) { ctx.fillStyle = SR.ui.dom.token('--paper-2'); ctx.fillRect(0, 0, SR.W, SR.H); return; }
    var scale = (SR.stage && SR.stage.scale) || 1;
    var s = SR.state;
    // The kit draws served + 1 tally marks (today counts). After the release state.jail is gone: the
    // whole stretch (bailed: the days you did serve).
    if (s && s.jail) J.served = s.jail.served;
    var served = s && s.jail ? s.jail.served : J.bailed ? J.served : J.days - 1;
    if (!J.cache || J.cacheScale !== scale || J.cacheServed !== served) {
      J.cache = J.cache || document.createElement('canvas');
      J.cache.width = Math.round(SR.W * scale);
      J.cache.height = Math.round(SR.H * scale);
      var c = J.cache.getContext('2d');
      c.setTransform(scale, 0, 0, scale, 0, 0);
      // After the release the calendar still shows the whole stretch (state.jail is gone by then).
      var st = s && !s.jail && served >= 0 ? Object.assign({}, s, { jail: { served: served, daysLeft: 0 } }) : s;
      try { r.drawStatic(c, st); } catch (e) { SR.util.warnOnce('jail.static', 'jail: drawStatic failed: ' + e.message); }
      J.cacheScale = scale;
      J.cacheServed = served;   // the calendar's tally marks follow the days served
    }
    ctx.drawImage(J.cache, 0, 0, SR.W, SR.H);
    var actors = { you: { clip: J.pose, mood: J.mode === 'released' ? 'happy' : undefined } };
    if (J.poseChoice === 'cha') actors.extra = [{ look: MATE.look, x: MATE.x, y: MATE.y, clip: 'talk', facing: MATE.facing, t: J.t }];
    try { r.drawAnim(ctx, J.t, SR.state, actors); } catch (e2) { SR.util.warnOnce('jail.anim', 'jail: drawAnim failed: ' + e2.message); }
  }

  SR.scenes.register('jail', {
    kind: 'base',
    music: 'doing_time',
    enter: function (params) {
      params = params || {};
      var s = SR.state;
      var jailed = params.jailed || null;
      J = { params: params, report: params.report || (params.resume ? recalled() : null), reason: (jailed && jailed.reason) || (s && s.jail && s.jail.reason) || 'police',
        days: (jailed && jailed.days) || 0, bailed: false, mode: 'day', pose: 'idle', poseChoice: null, t: 0,
        served: s && s.jail ? s.jail.served : 0, card: null, scope: null, cache: null, cacheScale: 0, cacheServed: -2, busy: false };
      J.interior = SR.art && typeof SR.art.interior === 'function' ? SR.art.interior('jail', {}) : null;
      // The arrest night (or the night that brought you back here) is finished once, here.
      if (params.report) { remember(params.report); startDay(params.report); }
    },
    exit: function () { J = null; },
    update: function (dt) {
      if (!J) return;
      J.t += dt;
    },
    render: function (ctx) {
      if (!J || !ctx) return;
      drawCell(ctx);
    },
    /** @returns {object|null} the scene's state (tests). */
    info: function () { return J ? { mode: J.mode, reason: J.reason, days: J.days, report: J.report ? J.report.kind : null, pose: J.pose } : null; },
    onAction: function (action, ev) {
      if (!J) return false;
      ev = ev || {};
      if (ev.down === false) return false;
      if ((action === 'confirm' || action === 'back' || action === 'interact' || /^row\d$/.test(action)) && SR.ui.stamp.swallow()) return true;
      if (J.card && J.card.speech && !J.card.speech.done()) J.card.speech.complete();
      if (action === 'interact') return true;
      var m = /^row(\d)$/.exec(action);
      if (m) {
        if (ev.repeat || J.mode !== 'day') return true;
        var n = Number(m[1]);
        var c = SR.ui.jail.CHOICES[n - 1] || (n === 5 ? 'bail' : null);
        var row = c && J.card.rows[c];
        if (row && !row.hidden) { SR.ui.focus.focus(row.main); row.main.click(); }
        return true;
      }
      if (SR.ui.focus.handle(action, ev)) return true;
      if (action === 'back') { leave(); return true; }
      // The cell is the whole game while you serve (GDD §6.6): the pause menu, but no Pocket.
      if (action === 'pause' && SR.reg.scene.pause) { SR.scenes.push('pause'); return true; }
      return action === 'pocket' || action === 'map' || action === 'bag' || action === 'journal';
    },
    ui: {
      mount: function (root) {
        if (!J) return;
        root.classList.add('scene-jail');
        // The cell is the whole game while you serve (GDD §6.6): no Pocket, so the HUD's Pocket
        // button goes as well as its key (the pause button stays).
        var hud = SR.ui.hud.mount(root, { compact: true });
        var pb = hud && hud.querySelector ? hud.querySelector('[data-id="hud-pocket"]') : null;
        if (pb) pb.hidden = true;
        J.card = SR.ui.jail.card({ onChoose: choose, onBail: bail, onLeave: leave });
        root.appendChild(J.card);
        J.scope = SR.ui.focus.push(J.card, { id: 'jail', autofocus: false });
        render();
        if (J.mode === 'day') SR.ui.focus.focus(J.card.rows.str.main);
        if (fast() && J.card.speech) J.card.speech.complete();
      },
      unmount: function () {
        if (J && J.scope) { SR.ui.focus.pop(J.scope); J.scope = null; }
        SR.ui.hud.unmount();
      },
    },
  });

  SR.onBoot(50, function () {
    // An arrest: the Result carries `jailed` and the arrest night's Report. The trip scene presents a
    // bust itself and hands over; the jail scene already up needs nothing.
    SR.events.on('action:done', function (p) {
      var r = p && p.result;
      if (!r || !r.ok || !r.jailed || !SR.state || !SR.reg.scene.jail) return;
      var top = SR.scenes.top();
      if (top && (top.id === 'bustrip' || top.id === 'jail')) return;
      SR.scenes.queue('jail', { report: r.report || null, jailed: r.jailed }, { transition: 'fade' });
    });
    // Any path that finishes a night while you are in jail (a report scene over the cell, the debug
    // night) brings the cell back: the Jail Day card is where a day in jail is spent. Queued, so it
    // runs when the report closes (whether it pops back to the cell or leaves for the city).
    // A night that ended the game (a Hardcore loan default: FLATLINED; a timed game's last night)
    // is presented by the death or results scene, whichever listener hears day:started first.
    SR.events.on('day:started', function (p) {
      var s = SR.state;
      if (!s || !s.jail || s.over || !SR.reg.scene.jail || (p && p.report && p.report.dead)) return;
      var top = SR.scenes.top();
      if (top && (top.id === 'jail' || top.id === 'death' || top.id === 'results')) return;
      SR.scenes.queue('jail', { resume: true }, { transition: 'fade' });
    });
  });
})();
