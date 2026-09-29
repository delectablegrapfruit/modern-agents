// js/minigames/skins/orderup.js — owner: W2-Food. The `orderup` skin of the Shift Rush engine (GDD
// §6.5; B-05 hustle.orderup): the cook's and the Shift Manager's hustle at McSticks (P1 `hustles`;
// the Hustle button of mcsticks.work). Tickets list 2-5 items from six bins (bun, patty, cheese,
// lettuce, fries, shake); press them in order and serve. Every number is the engine's, read from
// SR.tuning (m = clamp(0.7 + 0.075 × correct - 0.1 × wrong, 0.7, 1.3); Auto m = 1.0 exactly).
// Art: each ingredient drawn in ink and palette colours; a tiled kitchen behind the rail.
// Node-loadable: nothing draws at load time.
(function () {
  'use strict';
  var SR = window.SR;

  var BINS = ['bun', 'patty', 'cheese', 'lettuce', 'fries', 'shake'];

  function col(key) { return SR.art.draw.color(key); }
  function ink() { return col('inkLine'); }

  function stroke(ctx, w) { ctx.lineWidth = w; ctx.strokeStyle = ink(); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); }
  function fill(ctx, key) { ctx.fillStyle = col(key); ctx.fill(); }

  /** The six ingredients at (x, y) centred, size = the box side (ART_AUDIO §1.1: flat fills, ink). */
  var DRAW = {
    bun: function (ctx, r) {
      ctx.beginPath(); ctx.moveTo(-r, r * 0.25); ctx.quadraticCurveTo(-r, -r * 0.75, 0, -r * 0.75); ctx.quadraticCurveTo(r, -r * 0.75, r, r * 0.25); ctx.closePath();
      fill(ctx, 'acc.tan'); stroke(ctx, r * 0.09);
      ctx.beginPath(); ctx.rect(-r, r * 0.25, 2 * r, r * 0.3); fill(ctx, 'kit.woodLight'); stroke(ctx, r * 0.09);
      for (var i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(-r * 0.45 + i * r * 0.3, -r * 0.35 + (i % 2) * r * 0.18, r * 0.06, r * 0.04, 0, 0, Math.PI * 2); fill(ctx, 'kit.paper'); }
    },
    patty: function (ctx, r) {
      ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.42, 0, 0, Math.PI * 2); fill(ctx, 'acc.coffee'); stroke(ctx, r * 0.09);
      for (var i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * r * 0.4 - r * 0.2, -r * 0.08); ctx.lineTo(i * r * 0.4 + r * 0.2, -r * 0.08); stroke(ctx, r * 0.05); }
    },
    cheese: function (ctx, r) {
      ctx.beginPath(); ctx.moveTo(-r * 0.9, -r * 0.7); ctx.lineTo(r * 0.9, -r * 0.7); ctx.lineTo(r * 0.9, r * 0.3); ctx.lineTo(r * 0.3, r * 0.3); ctx.lineTo(0, r * 0.8); ctx.lineTo(-r * 0.3, r * 0.3); ctx.lineTo(-r * 0.9, r * 0.3); ctx.closePath();
      fill(ctx, 'kit.poster'); stroke(ctx, r * 0.09);
      [[-0.4, -0.3, 0.12], [0.35, -0.1, 0.1], [0, 0.05, 0.07]].forEach(function (h) { ctx.beginPath(); ctx.arc(h[0] * r, h[1] * r, h[2] * r, 0, Math.PI * 2); fill(ctx, 'kit.bulb'); stroke(ctx, r * 0.04); });
    },
    lettuce: function (ctx, r) {
      ctx.beginPath();
      for (var i = 0; i <= 12; i++) {
        var a = Math.PI * (1 + i / 12), rr = i % 2 ? r * 0.8 : r;
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.75 + r * 0.25);
      }
      ctx.closePath(); fill(ctx, 'kit.plant'); stroke(ctx, r * 0.09);
      ctx.beginPath(); ctx.moveTo(0, r * 0.2); ctx.lineTo(0, -r * 0.4); ctx.moveTo(0, -r * 0.05); ctx.lineTo(-r * 0.35, -r * 0.35); ctx.moveTo(0, -r * 0.05); ctx.lineTo(r * 0.35, -r * 0.35);
      ctx.lineWidth = r * 0.06; ctx.strokeStyle = col('kit.plantHi'); ctx.stroke();
    },
    fries: function (ctx, r) {
      for (var i = 0; i < 5; i++) {
        ctx.beginPath(); ctx.rect(-r * 0.5 + i * r * 0.22, -r * 0.85 + (i % 2) * r * 0.15, r * 0.16, r * 0.9); fill(ctx, 'kit.beer'); stroke(ctx, r * 0.05);
      }
      ctx.beginPath(); ctx.moveTo(-r * 0.65, -r * 0.1); ctx.lineTo(r * 0.65, -r * 0.1); ctx.lineTo(r * 0.5, r * 0.85); ctx.lineTo(-r * 0.5, r * 0.85); ctx.closePath();
      fill(ctx, 'kit.red'); stroke(ctx, r * 0.09);
    },
    shake: function (ctx, r) {
      ctx.beginPath(); ctx.moveTo(-r * 0.5, -r * 0.45); ctx.lineTo(r * 0.5, -r * 0.45); ctx.lineTo(r * 0.38, r * 0.9); ctx.lineTo(-r * 0.38, r * 0.9); ctx.closePath();
      fill(ctx, 'kit.paper'); stroke(ctx, r * 0.09);
      ctx.beginPath(); ctx.arc(0, -r * 0.45, r * 0.5, Math.PI, 0); fill(ctx, 'kit.cushion'); stroke(ctx, r * 0.09);
      ctx.beginPath(); ctx.moveTo(r * 0.1, -r * 0.9); ctx.lineTo(r * 0.3, -r * 1.2); ctx.lineWidth = r * 0.1; ctx.strokeStyle = col('kit.red'); ctx.stroke();
      ctx.beginPath(); ctx.rect(-r * 0.44, r * 0.1, r * 0.88, r * 0.2); fill(ctx, 'kit.red');
    },
  };

  SR.def.skin('orderup', {
    engine: 'shiftrush',
    music: 'tick_tock_trouble',
    params: {
      mode: 'tickets',
      bins: BINS.map(function (id) { return { id: id, label: 'mg.orderup.' + id }; }),
    },
    text: { title: 'mg.orderup.title', subtitle: 'mg.orderup.subtitle' },
    art: {
      /** @returns {boolean} true: the ingredient was drawn (the engine then skips its placeholder). */
      item: function (ctx, id, x, y, size) {
        var d = DRAW[id];
        if (!d) return false;
        ctx.save();
        ctx.translate(x, y);
        d(ctx, size * 0.42);
        ctx.restore();
        return true;
      },
      /** The kitchen: a tiled wall behind the ticket rail and a steel pass under the bins. */
      backdrop: function (ctx, w, h) {
        ctx.save();
        ctx.fillStyle = col('int.mcsticks.wall');
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = col('int.mcsticks.wallShade');
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (var y = 40; y < 380; y += 40) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
        for (var x = 0; x < w; x += 40) { ctx.moveTo(x, 0); ctx.lineTo(x, 380); }
        ctx.stroke();
        ctx.fillStyle = col('kit.metal');
        ctx.fillRect(0, 380, w, h - 380);
        ctx.fillStyle = col('int.mcsticks.trim');
        ctx.fillRect(0, 376, w, 8);
        ctx.restore();
      },
    },
  });
})();
