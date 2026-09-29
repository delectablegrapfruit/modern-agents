// js/minigames/skins/hotwire.js — owner: W2-Street. The `hotwire` skin of the Timing Ring engine
// (GDD §4.18, §6.5; BALANCE B-26 junker.ring, B-21 tinkerer): the P1 (`arcs`) attempt on the junker
// on the apartment lawn with INT 200-349 (150 with Tinkerer). Unlock mode at step 0: up to 5
// presses; 3 hits start the car, 3 misses trip the alarm; the sweet arc is clamp(20° + (INT - 200)
// / 5, 8°, 70°) (the engine reads street.junker.ring.arc), and Tinkerer widens it by half
// (perks.tinkerer.sweet: the clamp's base, slope and bounds scaled alike). Every miss is a -15 HP
// shock, so each round is stake-bearing (Hardcore's pending hook). The rules of the outcome are
// the :resolve's (js/data/buildings/street.js, junker.ringResolve).
// Art: the junker's yellow dashboard with its ignition lock and three wires (red, blue, yellow)
// drawn in the ring's centre; each hit lights a spark at a wire's copper tip. The engine draws the
// running "hits / 3" under it. Node-loadable: nothing draws at load time.
(function () {
  'use strict';
  var SR = window.SR;

  function col(key) { return SR.art.draw.color(key); }

  // The three wires: colour, where the tip hangs relative to the centre (play-area units).
  // Everything sits above the needle's hub (the centre), so the needle stays readable below it.
  var WIRES = [
    { key: 'acc.red', tip: [-36, -26], bend: [-40, -40] },
    { key: 'acc.denim', tip: [0, -22], bend: [7, -34] },
    { key: 'acc.yellow', tip: [36, -26], bend: [42, -42] },
  ];

  /** @returns {number} the hits of the round on screen (0 while none is open, e.g. a contact sheet). */
  function hitsNow() {
    var cur = SR.minigame && typeof SR.minigame.current === 'function' ? SR.minigame.current() : null;
    var p = cur && cur.inst && typeof cur.inst.peek === 'function' ? cur.inst.peek() : null;
    return p && typeof p.hits === 'number' ? p.hits : 0;
  }

  /** A four-point spark at (x, y) of radius r. */
  function spark(ctx, x, y, r) {
    ctx.beginPath();
    for (var i = 0; i < 8; i++) {
      var a = i * Math.PI / 4, rr = i % 2 ? r * 0.35 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = col('kit.bulb');
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = col('inkLine');
    ctx.stroke();
  }

  /**
   * The ring's centre (ART_AUDIO §1.1: flat fills, ink outlines): the dashboard, the lock, the wires.
   * @returns {boolean} false: the engine still draws the running score beneath
   */
  function center(ctx, x, y) {
    var D = SR.art.draw, ink = col('inkLine');
    ctx.save();
    // the dashboard under the steering column
    D.roundRect(ctx, x - 64, y - 104, 128, 48, 12);
    ctx.fillStyle = col('car.junker');
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = ink;
    ctx.stroke();
    D.roundRect(ctx, x - 64, y - 64, 128, 10, 5);
    ctx.fillStyle = col('car.junkerRust');
    ctx.fill();
    // the ignition lock with its empty key slot
    ctx.beginPath();
    ctx.arc(x, y - 82, 16, 0, Math.PI * 2);
    ctx.fillStyle = col('kit.metal');
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y - 82, 9, 0, Math.PI * 2);
    ctx.fillStyle = col('kit.metalDark');
    ctx.fill();
    ctx.fillStyle = col('ink');
    ctx.fillRect(x - 2, y - 89, 4, 14);
    // the wires hanging from under the column, bare copper at the ends
    var lit = hitsNow();
    for (var i = 0; i < WIRES.length; i++) {
      var w = WIRES[i], tx = x + w.tip[0], ty = y + w.tip[1];
      ctx.beginPath();
      ctx.moveTo(x + (i - 1) * 12, y - 56);
      ctx.quadraticCurveTo(x + w.bend[0], y + w.bend[1], tx, ty);
      ctx.lineCap = 'round';
      ctx.lineWidth = 7;
      ctx.strokeStyle = ink;
      ctx.stroke();
      ctx.lineWidth = 4;
      ctx.strokeStyle = col(w.key);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(tx, ty, 4, 0, Math.PI * 2);
      ctx.fillStyle = col('kit.brass');
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = ink;
      ctx.stroke();
      if (i < lit) spark(ctx, tx, ty + 2, 10);
    }
    ctx.restore();
    return false;
  }

  SR.def.skin('hotwire', {
    engine: 'timingring',
    stake: true,
    /** The round's params: unlock mode, step 0 (GDD §6.5); Tinkerer widens the sweet arc by half. */
    params: function (state) {
      var p = { mode: 'unlock', step: 0 };
      var perks = SR.rules && SR.rules.perks;
      if (state && perks && typeof perks.has === 'function' && perks.has(state, 'tinkerer')) {
        var a = SR.tuning.street.junker.ring.arc, k = SR.tuning.perks.tinkerer.sweet;
        p.arc = { stat: 'int', base: a.base * k, per: a.perInt * k, from: a.from, min: a.min * k, max: a.max * k };
      }
      return p;
    },
    text: { title: 'mg.hotwire.title', subtitle: 'mg.hotwire.subtitle' },
    art: { center: center },
  });
})();
