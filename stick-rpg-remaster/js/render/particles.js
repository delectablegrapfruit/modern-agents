// js/render/particles.js — owner: W1-G. World particles (ARCHITECTURE §9.1 step 11, ART_AUDIO §12):
// a pool of at most 400 × the preset's particle factor (dust, coins, sparks, confetti, rain
// splashes, paper scraps, cloud wisps), updated by the frame's elapsed animation time and drawn in
// batches, one path per colour. Positions are world units with a height z (screenY = y - 0.5 z);
// cosmetic randomness comes from SR.rng.fx, never from the rules stream.
(function () {
  'use strict';
  var SR = window.SR;

  var BASE_MAX = 400;
  // Per kind: life (s), size (u), gravity on z (u/s²), drag (1/s), bounce (0..1), colours (palette keys).
  var KINDS = {
    dust: { life: 0.6, size: 3.5, g: 0, drag: 4, bounce: 0, speed: 60, up: 20, col: ['fx.dust', 'path'] },
    coin: { life: 1.3, size: 4, g: 900, drag: 0.6, bounce: 0.45, speed: 120, up: 320, col: ['fx.coin', 'lanePaint'], hi: ['fx.coinHi', 'glassLit'] },
    spark: { life: 0.35, size: 2, g: 0, drag: 5, bounce: 0, speed: 260, up: 60, col: ['fx.spark', 'glassLit'] },
    confetti: { life: 2.4, size: 5, g: 260, drag: 1.8, bounce: 0, speed: 160, up: 380, flutter: true, col: ['fx.confetti'] },
    splash: { life: 0.4, size: 2, g: 600, drag: 1, bounce: 0, speed: 50, up: 120, col: ['waterHi', 'water'] },
    scrap: { life: 1.4, size: 5, g: 180, drag: 1.5, bounce: 0.2, speed: 90, up: 160, flutter: true, col: ['fx.scrap', 'paperEdge'] },
    wisp: { life: 2.2, size: 10, g: -20, drag: 0.5, bounce: 0, speed: 20, up: 10, col: ['fx.wisp', 'cloud'] },
  };

  function L() { return SR.render.lib; }

  var pool = [];
  var live = 0;

  function max() {
    var f = L().quality().particles;
    return Math.max(1, Math.round(BASE_MAX * (typeof f === 'number' ? f : 1)));
  }

  function rnd() { return SR.rng.fx.float(); }

  function colourOf(k, i) {
    var p = SR.art && SR.art.palette;
    if (k.col[0] === 'fx.confetti' && p && p.fx && Array.isArray(p.fx.confetti) && p.fx.confetti.length) {
      return p.fx.confetti[i % p.fx.confetti.length];
    }
    return L().pal(k.col, 0.8);
  }

  /**
   * Emits n particles of a kind at a world point.
   * @param {string} kind dust | coin | spark | confetti | splash | scrap | wisp
   * @param {number} x
   * @param {number} y
   * @param {number=} n how many (default 1; capped by the free pool)
   * @param {{z: number, vx: number, vy: number, spread: number, speed: number}=} opts
   * @returns {number} how many were emitted
   */
  function emit(kind, x, y, n, opts) {
    var k = KINDS[kind];
    if (!k) throw new Error('SR.render.particles.emit: unknown kind "' + kind + '"');
    opts = opts || {};
    n = n === undefined ? 1 : Math.max(0, Math.floor(n));
    var cap = max(), made = 0;
    for (var i = 0; i < n && live < cap; i++) {
      var p = pool[live] || (pool[live] = {});
      var a = rnd() * Math.PI * 2, sp = (opts.speed || k.speed) * (0.4 + rnd() * 0.8);
      p.kind = kind; p.k = k;
      p.x = x; p.y = y; p.z = opts.z || 0;
      p.vx = Math.cos(a) * sp * (opts.spread === undefined ? 1 : opts.spread) + (opts.vx || 0);
      p.vy = Math.sin(a) * sp * 0.6 * (opts.spread === undefined ? 1 : opts.spread) + (opts.vy || 0);
      p.vz = k.up * (0.6 + rnd() * 0.8);
      p.age = 0; p.life = k.life * (0.75 + rnd() * 0.5);
      p.size = k.size * (0.7 + rnd() * 0.6);
      p.rot = rnd() * Math.PI; p.vr = (rnd() - 0.5) * 12;
      p.colour = colourOf(k, Math.floor(rnd() * 97));
      live++;
      made++;
    }
    return made;
  }

  /** Advances every particle by dt seconds; the dead ones return to the pool. */
  function update(dt) {
    if (!(dt > 0)) return;
    for (var i = 0; i < live; i++) {
      var p = pool[i], k = p.k;
      p.age += dt;
      if (p.age >= p.life) {
        live--;
        pool[i] = pool[live];
        pool[live] = p;
        i--;
        continue;
      }
      var dr = Math.max(0, 1 - k.drag * dt);
      p.vx *= dr; p.vy *= dr;
      if (k.flutter) p.vx += Math.sin(p.age * 9 + p.rot * 3) * 40 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vz -= k.g * dt;
      p.z += p.vz * dt;
      if (k.flutter && p.vz < -60) p.vz = -60;
      if (p.z < 0) {
        if (k.bounce > 0 && Math.abs(p.vz) > 60) { p.z = 0; p.vz = -p.vz * k.bounce; p.vx *= 0.7; p.vy *= 0.7; }
        else if (k.g > 0) { p.z = 0; p.vz = 0; p.vx *= 0.5; p.vy *= 0.5; }
      }
      p.rot += p.vr * dt;
    }
  }

  var batches = {};
  var order = [];

  /** Draws the live particles (world transform), one path fill per colour. */
  function draw(ctx, v) {
    if (!live) return;
    L().worldTransform(ctx, v);
    order.length = 0;
    var i, p;
    for (i = 0; i < live; i++) {
      p = pool[i];
      if (p.x < v.x0 - 20 || p.x > v.x1 + 20 || p.y - 0.5 * p.z < v.y0 - 20 || p.y - 0.5 * p.z > v.y1 + 20) continue;
      var b = batches[p.colour];
      if (!b) b = batches[p.colour] = [];
      if (!b.length) order.push(p.colour);
      b.push(p);
    }
    for (var c = 0; c < order.length; c++) {
      var list = batches[order[c]];
      ctx.fillStyle = L().solid(order[c]);
      ctx.globalAlpha = L().alphaOf(order[c]);
      ctx.beginPath();
      for (var j = 0; j < list.length; j++) {
        p = list[j];
        var fade = p.age > p.life * 0.7 ? 1 - (p.age - p.life * 0.7) / (p.life * 0.3) : 1;
        var s = p.size * (p.kind === 'dust' || p.kind === 'wisp' ? 0.6 + p.age / p.life : fade);
        var sy = p.y - 0.5 * p.z;
        if (p.kind === 'coin' || p.kind === 'dust' || p.kind === 'wisp' || p.kind === 'splash') {
          ctx.moveTo(p.x + s, sy);
          ctx.ellipse(p.x, sy, s, p.kind === 'coin' ? s * Math.abs(Math.cos(p.rot)) + 0.8 : s, 0, 0, Math.PI * 2);
        } else {
          // Paper bits and sparks: a small rotated quad.
          var ca = Math.cos(p.rot) * s, sa = Math.sin(p.rot) * s * 0.6;
          ctx.moveTo(p.x - ca, sy - sa);
          ctx.lineTo(p.x + sa, sy - ca * 0.6);
          ctx.lineTo(p.x + ca, sy + sa);
          ctx.lineTo(p.x - sa, sy + ca * 0.6);
          ctx.closePath();
        }
      }
      ctx.fill();
      L().count.fills++;
      list.length = 0;
    }
    ctx.globalAlpha = 1;
  }

  /** Removes every particle. */
  function clear() { live = 0; }

  /** @returns {{live: number, max: number, pooled: number}} */
  function stats() { return { live: live, max: max(), pooled: pool.length }; }

  SR.render.particles = {
    emit: emit,
    /** Emits a burst: the ART_AUDIO §12 counts (coins 8-16 on wages and wins, dust 6-12 on landings). */
    burst: function (kind, x, y, opts) {
      var range = { coin: [8, 16], dust: [6, 12], scrap: [6, 12], spark: [8, 14], confetti: [40, 60], splash: [4, 8], wisp: [3, 5] }[kind] || [6, 10];
      return emit(kind, x, y, SR.rng.fx.int(range[0], range[1]), opts);
    },
    update: update,
    draw: draw,
    clear: clear,
    stats: stats,
    KINDS: Object.keys(KINDS),
  };
})();
