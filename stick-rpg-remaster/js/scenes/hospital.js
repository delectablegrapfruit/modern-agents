// js/scenes/hospital.js — owner: W2-Transit. The `hospital` scene and the player:down listener (GDD
// §4.16, §6.6; UI §3, §5.12; ARCHITECTURE §5, §6.7; CONTRACT §9.2, §11.3).
//
// The listener: SR.act (and SR.debug.down) emit player:down { cause, outcome, down } after
// SR.rules.health.down has run. 'secondWind' is a toast only; 'hospital' (Relaxed / Standard: the bill
// is charged and the hospital night has run, so it is the next day at 12:00) queues this scene;
// 'death' (Hardcore) queues js/scenes/death.js. SR.scenes.queue waits until the top of the stack is a
// base scene, so a fall inside a dialog or a minigame is presented once that closes.
//
// The scene: the Stick General ward (the 'hospital' interior of js/art/interiors/special.js, you in
// the bed) under the gag: the FLATLINED stamp over a flat line, silence and the dirge, then the
// defibrillator's "BZZT!" (a flash, the line jumps back to a beat, the ward's song starts), then
// "...JUST KIDDING", then the Stick General card (js/ui/screens/hospital.js: the bill, the part
// written off, "Discharged at 12:00"). On admission the player already stands outside the home door
// ('afterHospital') as far as the world and the state go, so a save from the ward resumes there. Its
// button runs hospital.discharge, then the Stick General edition of the report (W2-Home's `report`
// scene, pushed with the hospital night's Report); the report scene finishes the night (its events,
// day:started) and returns to the city outside your home door ('afterHospital'). If no report scene
// takes over (none registered, or it pops back here), this scene finishes the night itself and goes
// to the city, or to the results when the hospital night ended a timed game.
// Any confirm or back skips the gag to the card. With SR.debug.fast() (the tests) the presentation
// is skipped: the first update discharges and brings the city at the home door (the grey-box slice).
// Load-time rule: defines functions, registers the scene; the listener is added in a boot hook.
(function () {
  'use strict';
  var SR = window.SR;

  // The gag's beats in seconds (UI §5.12; presentation, not balance: CONTRACT D49).
  var BZZT_AT = 1.4, KIDDING_AT = 2.3, CARD_AT = 3.3, SKIP_AFTER = 0.3, FLASH_S = 0.25;
  var MONITOR = { x: 170, y: 150, w: 420, h: 230 };   // the big heart monitor of the gag (x 0-760)
  var BED = { x: 262, y: 590, scale: 0.9 };            // you in the ward's bed (js/art/interiors/special.js)
  var MUSIC = 'waiting_room';                          // the ward's song (ART_AUDIO §13.4)

  var H = null;   // the scene's state while it is on the stack

  function D() { return SR.ui.dom; }
  function fast() { return !!(SR.debug && typeof SR.debug.fast === 'function' && SR.debug.fast()); }
  /** @returns {boolean} the press came from a binding of that input action (Esc is `back` and `pause`). */
  function boundTo(ev, action) {
    var I = SR.input;
    if (!ev || !ev.code || !I || typeof I.bindings !== 'function') return false;
    try { return (I.bindings(action) || []).indexOf(ev.code) >= 0; } catch (e) { return false; }
  }

  /**
   * The compact HUD, without its Pocket button: the ward is a presentation (a cab out of it would
   * skip the Stick General edition and the hospital night's day:started). It comes with the card:
   * during the gag it would give the joke away (the next day, HP already patched up to 50 %).
   */
  function mountHud() {
    if (!H || !H.ui || H.hud) return;
    H.hud = SR.ui.hud.mount(H.ui, { compact: true }) || true;
    var pb = H.hud && H.hud.querySelector ? H.hud.querySelector('[data-id="hud-pocket"]') : null;
    if (pb) pb.hidden = true;
  }
  function reduced() { return !!(SR.ui && SR.ui.dom && D().reduced()); }

  /**
   * Re-emits a night Report's rule events and the achievements it unlocked (Report.achievements),
   * then day:started, as the report scene does (CONTRACT §8.7, §8.9).
   */
  function startDay(report) {
    if (!report || !SR.state || H && H.started) return;
    if (H) H.started = true;
    (report.events || []).forEach(function (e) { if (e && e.name) SR.events.emit(e.name, e.payload); });
    (report.achievements || []).forEach(function (id) { SR.events.emit('achievement:unlocked', { id: id }); });
    SR.events.emit('day:started', { day: typeof report.day === 'number' ? report.day : SR.state.clock.day, report: report });
  }

  /**
   * Puts the player outside the home door ('afterHospital', ARCHITECTURE §6.7) in the world and the
   * state: done on admission, so a save or a suspend from the ward resumes there, not where you fell.
   */
  function placeHome() {
    var s = SR.state;
    if (!s || !SR.world || !SR.world.ready || typeof SR.world.place !== 'function') return;
    try { SR.world.place('afterHospital', s); } catch (e) { SR.util.warnOnce('hospital.place', 'hospital: SR.world.place(afterHospital) failed: ' + e.message); }
  }

  /** The ward's song (a heart-monitor blip in tempo, ART_AUDIO §13.4): it starts when the heart does. */
  function wardMusic() {
    if (!H || H.music) return;
    H.music = true;
    if (SR.audio && typeof SR.audio.music === 'function') SR.audio.music(MUSIC);
  }

  /** Leaves the ward: the results when the story ended, else the city outside the home door. */
  function leave() {
    if (!H) return;
    var s = SR.state;
    startDay(H.down && H.down.report);
    if (s && s.over && !s.mode.keepPlaying) {
      SR.scenes.go(SR.reg.scene.results ? 'results' : 'title', { reason: (s.result && s.result.reason) || 'time', result: s.result }, { transition: 'fade' });
      return;
    }
    if (s && SR.world && SR.world.ready) SR.world.place('afterHospital', s);
    SR.scenes.go(SR.reg.scene.city ? 'city' : 'title', {}, { transition: 'fade' });
  }

  /** The card's button: hospital.discharge, then the Stick General edition of the report. */
  function discharge() {
    if (!H || H.discharged) return;
    H.discharged = true;
    if (SR.state && typeof SR.act === 'function') SR.act('hospital.discharge', {});
    var rep = H.down && H.down.report;
    if (rep && SR.reg.scene.report && !fast()) {
      var me = H;
      // The report scene (W2-Home) finishes the night (its events, day:started) and, for a hospital
      // night, steps out of the home door into the city; when the night ended the game it pops back
      // ('done') after queueing the results. Whatever pops back here leaves the ward from here.
      SR.scenes.push('report', { report: rep, next: 'city' }).then(function (result) {
        if (H !== me) return;
        if (result === 'done') H.started = true;
        var top = SR.scenes.top();
        if (top && top.id === 'hospital') leave();
      });
      return;
    }
    leave();
  }

  function toCard() {
    if (!H || H.phase === 'card') return;
    H.phase = 'card';
    if (H.dirge && typeof H.dirge.stop === 'function') { try { H.dirge.stop(); } catch (e) { /* audio gone */ } }
    H.dirge = null;
    if (H.gag) H.gag.show(null);
    wardMusic();
    mountHud();
    if (H.ui && !H.card) {
      H.card = SR.ui.hospital.card({ down: H.down, onDischarge: discharge });
      H.ui.appendChild(H.card);
      H.scope = SR.ui.focus.push(H.card, { id: 'hospital', autofocus: false });
      SR.ui.focus.focus(H.card.leave);
    }
  }

  // ---- drawing -----------------------------------------------------------------------------------
  function drawWard(ctx) {
    var r = H.interior;
    if (!r) { ctx.fillStyle = D().token('--paper-1'); ctx.fillRect(0, 0, SR.W, SR.H); return; }
    var scale = (SR.stage && SR.stage.scale) || 1;
    if (!H.cache || H.cacheScale !== scale) {
      H.cache = H.cache || document.createElement('canvas');
      H.cache.width = Math.round(SR.W * scale);
      H.cache.height = Math.round(SR.H * scale);
      var c = H.cache.getContext('2d');
      c.setTransform(scale, 0, 0, scale, 0, 0);
      try { r.drawStatic(c, SR.state); } catch (e) { SR.util.warnOnce('hospital.static', 'hospital: drawStatic failed: ' + e.message); }
      H.cacheScale = scale;
    }
    ctx.drawImage(H.cache, 0, 0, SR.W, SR.H);
    try {
      r.drawAnim(ctx, H.t, SR.state, { you: { visible: false } });
      // You, lying in the bed with your head on the pillow (the rig's 'sleep' clip lies to the left
      // when facing right), above the mattress rather than sorted behind the bed's front.
      var mood = H.phase === 'card' ? 'happy' : H.beat >= 2 ? 'surprised' : 'sleep';
      SR.art.stick.draw(ctx, 'sleep', { view: 'side', x: BED.x, y: BED.y, scale: BED.scale, player: true, facing: 'right', mood: mood, t: H.t });
    } catch (e2) { SR.util.warnOnce('hospital.anim', 'hospital: drawAnim failed: ' + e2.message); }
  }

  /** The gag's big monitor: a flat line until BZZT, then a spike and a steady beat. */
  function drawMonitor(ctx) {
    var col = SR.art.draw.color, m = MONITOR;
    var jitter = H.t >= BZZT_AT && H.t < BZZT_AT + FLASH_S && !reduced() ? Math.sin(H.t * 90) * 6 : 0;
    ctx.save();
    ctx.translate(jitter, 0);
    ctx.fillStyle = col('kit.metalDark');
    ctx.fillRect(m.x - 14, m.y - 14, m.w + 28, m.h + 28);
    ctx.fillStyle = col('kit.screen');
    ctx.fillRect(m.x, m.y, m.w, m.h);
    ctx.lineWidth = 3;
    ctx.strokeStyle = col('inkLine');
    ctx.strokeRect(m.x - 14, m.y - 14, m.w + 28, m.h + 28);
    var mid = m.y + m.h * 0.55, alive = H.t >= BZZT_AT;
    ctx.beginPath();
    for (var i = 0; i <= 60; i++) {
      var u = i / 60, x = m.x + 10 + u * (m.w - 20), y = mid;
      if (alive) {
        var ph = (u * 2.2 - (H.t - BZZT_AT) * 1.1) % 1;
        if (ph < 0) ph += 1;
        y = ph < 0.05 ? mid - m.h * 0.34 : ph < 0.09 ? mid + m.h * 0.16 : mid;
      }
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.lineWidth = 4;
    ctx.strokeStyle = col(alive ? 'kit.plant' : 'kit.red');
    ctx.stroke();
    ctx.restore();
  }

  function drawFlash(ctx) {
    var since = H.t - BZZT_AT;
    if (since < 0 || since > FLASH_S) return;
    var reduce = D().setting('access.flashReduction') ? 0.3 : 1;
    ctx.save();
    ctx.globalAlpha = (1 - since / FLASH_S) * 0.7 * reduce;
    ctx.fillStyle = SR.art.draw.color('fx.flash');
    ctx.fillRect(0, 0, SR.W, SR.H);
    ctx.restore();
  }

  function bzzt() {
    if (H.dirge && typeof H.dirge.stop === 'function') { try { H.dirge.stop(); } catch (e) { /* audio gone */ } }
    H.dirge = null;
    D().sfx('ink_beam');
    if (SR.render && SR.render.fx && typeof SR.render.fx.jolt === 'function' && !reduced()) SR.render.fx.jolt();
    if (H.gag) H.gag.show('bzzt');
    wardMusic();
  }

  SR.scenes.register('hospital', {
    kind: 'base',
    // No `music` here: the flat line plays over silence and the dirge; the ward's song (MUSIC) starts
    // with the BZZT, when the heart does (or with the card, when the gag is skipped).
    enter: function (params) {
      params = params || {};
      H = { params: params, down: params.down || null, t: 0, phase: 'gag', beat: 0, card: null, ui: null, scope: null,
        gag: null, dirge: null, discharged: false, started: false, cache: null, cacheScale: 0, skipFast: fast(), skipping: false, hud: null,
        music: false };
      if (!H.down && SR.state) H.down = { outcome: 'hospital', cause: params.cause || 'other', bill: 0, writtenOff: 0, report: null };
      H.interior = SR.art && typeof SR.art.interior === 'function' ? SR.art.interior('hospital', {}) : null;
      placeHome();
      if (!H.skipFast && SR.audio && typeof SR.audio.music === 'function') SR.audio.music(null, { fade: 0.2 });
    },
    exit: function () {
      if (H && H.dirge && typeof H.dirge.stop === 'function') { try { H.dirge.stop(); } catch (e) { /* audio gone */ } }
      H = null;
    },
    update: function (dt) {
      if (!H) return;
      if (H.skipFast) {
        // The tests' fast mode: no gag, no card, no report; the discharge at once.
        H.skipFast = false;
        H.discharged = true;
        if (SR.state && typeof SR.act === 'function') SR.act('hospital.discharge', {});
        leave();
        return;
      }
      H.t += dt;
      if (H.phase !== 'gag') return;
      if (H.beat === 0 && H.t >= BZZT_AT) { H.beat = 1; bzzt(); }
      if (H.beat === 1 && H.t >= KIDDING_AT) { H.beat = 2; H.gag.show('kidding'); D().sfx('blip'); }
      if (H.t >= CARD_AT) toCard();
    },
    render: function (ctx) {
      if (!H || !ctx) return;
      drawWard(ctx);
      if (H.phase === 'gag') { drawMonitor(ctx); drawFlash(ctx); }
    },
    /** @returns {object|null} the scene's state (tests): phase, time, card shown, discharged. */
    info: function () { return H ? { phase: H.phase, t: H.t, card: !!H.card, discharged: H.discharged, started: H.started } : null; },
    onAction: function (action, ev) {
      if (!H) return false;
      ev = ev || {};
      if (ev.down === false) return false;
      if ((action === 'confirm' || action === 'back' || action === 'interact') && SR.ui.stamp.swallow()) return true;
      if (H.phase === 'gag') {
        if ((action === 'confirm' || action === 'back' || action === 'interact') && H.t >= SKIP_AFTER && !ev.repeat && !H.skipping) {
          // The card comes once this input event is over: Enter is `interact` and `confirm`, and
          // the rest of the press must not also press the card's Discharge button.
          var me = H;
          H.skipping = true;
          SR.ui.stamp.clear();
          Promise.resolve().then(function () { me.skipping = false; if (H === me) toCard(); });
        }
        return true;
      }
      if (action === 'interact') return true;
      if (SR.ui.focus.handle(action, ev)) return true;
      if (action === 'back') { discharge(); return true; }
      // Esc is both `back` and `pause` (CONTRACT §12.1): here it skips the gag or discharges (the
      // building card's rule), so its `pause` half does nothing; Start (pad) and the HUD's pause
      // button open the menu.
      if (action === 'pause') {
        if (!boundTo(ev, 'back') && SR.reg.scene.pause) SR.scenes.push('pause');
        return true;
      }
      return false;
    },
    ui: {
      mount: function (root) {
        if (!H) return;
        root.classList.add('scene-hospital');
        H.ui = root;
        H.hud = null;
        if (H.phase === 'card') mountHud();
        H.gag = SR.ui.hospital.gag();
        root.appendChild(H.gag.el);
        if (H.skipFast) return;
        H.dirge = SR.ui.hospital.flatlined();
      },
      unmount: function () {
        if (H && H.scope) { SR.ui.focus.pop(H.scope); H.scope = null; }
        SR.ui.hud.unmount();
      },
    },
  });

  // player:down → the hospital or the death scene, once the top of the stack is a base scene.
  SR.onBoot(50, function () {
    SR.events.on('player:down', function (p) {
      if (!p || !SR.state) return;
      if (p.outcome === 'hospital' && SR.reg.scene.hospital) {
        SR.scenes.queue('hospital', { down: p.down || null, cause: p.cause }, { transition: 'fade' });
      } else if (p.outcome === 'death' && SR.reg.scene.death) {
        SR.scenes.queue('death', { down: p.down || null, cause: p.cause, reason: 'death' }, { transition: false });
      }
    });
  });
})();
