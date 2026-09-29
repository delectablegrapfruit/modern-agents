// js/scenes/death.js — owner: W2-Transit. The `death` scene: FLATLINED on Hardcore (GDD §4.16, §6.6;
// UI §3, §5.12; ART_AUDIO §12 "KO / FLATLINED"). HP 0 on Hardcore (after Second Wind) queues it
// through the player:down listener of js/scenes/hospital.js; a Hardcore loan default, which ends the
// game during the night, reaches it after the morning report (the day:started listener below).
// The last frame of the world, greyed, under the FLATLINED stamp, a dirge sting, then an ink blot
// that grows from the centre to cover the screen (400 ms), then the results with the DECEASED banner
// (W2-Front's `results` scene reads SR.state.result, reason 'death'; the title while it is not
// registered). Any confirm or back after a moment goes straight on; SR.debug.fast() skips it.
// Load-time rule: defines functions, registers the scene; the listener is added in a boot hook.
(function () {
  'use strict';
  var SR = window.SR;

  // Beats in seconds (presentation, CONTRACT D49): the blot starts, grows for 0.4 s, the results follow.
  var BLOT_AT = 2.6, BLOT_S = 0.4, END_AT = 3.4, SKIP_AFTER = 0.5;

  var Dz = null;   // the scene's state while it is on the stack

  function D() { return SR.ui.dom; }
  function fast() { return !!(SR.debug && typeof SR.debug.fast === 'function' && SR.debug.fast()); }

  /** A copy of the last world frame (the stage canvas still holds it when the scene enters). */
  function snapshot() {
    var src = SR.stage && SR.stage.world;
    if (!src || !src.width || typeof document === 'undefined') return null;
    var c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    try { c.getContext('2d').drawImage(src, 0, 0); } catch (e) { return null; }
    return c;
  }

  function toResults() {
    if (!Dz || Dz.done) return;
    Dz.done = true;
    var s = SR.state;
    var params = { reason: 'death', result: s ? s.result : null };
    SR.scenes.go(SR.reg.scene.results ? 'results' : 'title', params, { transition: 'fade' });
  }

  SR.scenes.register('death', {
    kind: 'base',
    enter: function (params) {
      Dz = { params: params || {}, t: 0, shot: snapshot(), done: false, skipFast: fast(), dirge: null, ui: null };
      if (SR.audio && typeof SR.audio.music === 'function') SR.audio.music(null, { fade: 0.2 });
    },
    exit: function () { Dz = null; },
    update: function (dt) {
      if (!Dz) return;
      if (Dz.skipFast) { Dz.skipFast = false; toResults(); return; }
      Dz.t += dt;
      if (Dz.t >= END_AT) toResults();
    },
    render: function (ctx) {
      if (!Dz || !ctx) return;
      var W = SR.W, Hh = SR.H, col = SR.art.draw.color;
      ctx.save();
      if (Dz.shot) ctx.drawImage(Dz.shot, 0, 0, W, Hh);
      else { ctx.fillStyle = col('ui.paper-1'); ctx.fillRect(0, 0, W, Hh); }
      // Greyscale: the saturation of white (none) over the frame, then a dim veil.
      ctx.globalCompositeOperation = 'saturation';
      ctx.fillStyle = col('white');
      ctx.fillRect(0, 0, W, Hh);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = col('fx.vignette');
      ctx.fillRect(0, 0, W, Hh);
      var k = SR.util.clamp((Dz.t - BLOT_AT) / BLOT_S, 0, 1);
      if (k > 0) {
        var R = Math.hypot(W, Hh) / 2 * SR.util.easeOut(k);
        ctx.fillStyle = col('fx.blot');
        ctx.beginPath();
        for (var i = 0; i <= 24; i++) {
          var a = i / 24 * Math.PI * 2, wob = 1 + 0.08 * Math.sin(i * 2.7) + 0.05 * Math.cos(i * 5.1);
          var x = W / 2 + Math.cos(a) * R * wob, y = Hh / 2 + Math.sin(a) * R * wob;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    },
    /** @returns {object|null} the scene's state (tests). */
    info: function () { return Dz ? { t: Dz.t, done: Dz.done, shot: !!Dz.shot } : null; },
    onAction: function (action, ev) {
      if (!Dz) return false;
      ev = ev || {};
      if (ev.down === false) return false;
      if ((action === 'confirm' || action === 'back' || action === 'interact') && Dz.t >= SKIP_AFTER && !ev.repeat && !Dz.skipping) {
        // The results come once this input event is over: one key fires several actions (Enter is
        // `interact` and `confirm`, Esc `back` and `pause`), and the rest of the press must not also
        // skip the Final Edition's count-up.
        var me = Dz;
        Dz.skipping = true;
        SR.ui.stamp.clear();
        Promise.resolve().then(function () { me.skipping = false; if (Dz === me) toResults(); });
      }
      return true;
    },
    ui: {
      mount: function (root) {
        if (!Dz) return;
        Dz.ui = root;
        var s = SR.state;
        root.appendChild(D().h('p', { 'data-id': 'death-caption', class: 't-h3',
          style: { position: 'absolute', left: '0', right: '0', bottom: '48px', textAlign: 'center', color: 'var(--paper-0)',
            textShadow: '0 3px 0 var(--ink-900)', margin: '0' } },
        D().t('card.hospital.deceased', { name: s ? s.player.name : '' })));
        if (Dz.skipFast) return;
        // FLATLINED alone over the greyed frame (UI §5.12): the fatal action's toasts (Pilot Ori's
        // rescue line after a fall, a fight's) would contradict it.
        if (SR.ui.toast && typeof SR.ui.toast.clear === 'function') SR.ui.toast.clear();
        Dz.dirge = SR.ui.hospital.flatlined();
      },
      unmount: function () {},
    },
  });

  // A Hardcore loan default ends the game in the night (GDD §4.7 step 13): after the morning report
  // (whose button emits day:started with the Report), FLATLINED and the results follow.
  SR.onBoot(50, function () {
    SR.events.on('day:started', function (p) {
      var rep = p && p.report;
      if (!rep || !rep.dead || !SR.state || !SR.reg.scene.death) return;
      var top = SR.scenes.top();
      if (top && (top.id === 'death' || top.id === 'results')) return;
      SR.scenes.queue('death', { reason: 'death', dead: rep.dead }, { transition: false });
    });
  });
})();
