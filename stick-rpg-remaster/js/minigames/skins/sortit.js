// js/minigames/skins/sortit.js — owner: W2-Money. The `sortit` skin of the Shift Rush engine (GDD
// §4.6, §6.5; B-05 hustle.sortit): the Janitor's and the Mail Room Clerk's hustle at New Lines Inc.
// (P1 `hustles`; the Hustle button of nli.work). Items slide down a belt; Left / Down / Right (or
// 1-3, or a tap) sends the front one to one of three bins. The Janitor sorts the fourth floor's
// leftovers (Trash, Recycling, Lost and found); the Mail Room sorts the Monday pile (Inbox, Outbox,
// Shredder): the run's `set`, else your NLI rank, picks the set. Every number is the engine's, read
// from SR.tuning (m = clamp(0.7 + 0.075 × correct - 0.1 × wrong, 0.7, 1.3), one correct per three
// items, streaks ×1.1 to ×1.5; Auto m = 1.0 exactly).
// Art: each item and bin drawn in ink and palette colours; an office wall behind the belt.
// Node-loadable: nothing draws at load time.
(function () {
  'use strict';
  var SR = window.SR;

  // Each set: its three bins (in ← ↓ → order) and six items with the bin they belong in.
  var SETS = {
    janitor: { bins: ['trash', 'recycle', 'lost'], items: [['peel', 0], ['crumbs', 0], ['cup', 1], ['can', 1], ['keys', 2], ['glasses', 2]] },
    mail: { bins: ['inbox', 'outbox', 'shred'], items: [['memo', 0], ['invoice', 0], ['parcel', 1], ['letter', 1], ['junk', 2], ['secret', 2]] },
  };

  function col(key) { return SR.art.draw.color(key); }
  function ink() { return col('inkLine'); }
  function stroke(ctx, w) { ctx.lineWidth = w; ctx.strokeStyle = ink(); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); }
  function fill(ctx, key) { ctx.fillStyle = col(key); ctx.fill(); }
  function rect(ctx, x, y, w, h, key, lw) { ctx.beginPath(); ctx.rect(x, y, w, h); fill(ctx, key); stroke(ctx, lw); }
  function lines(ctx, x0, x1, ys, lw, key) {
    ctx.beginPath();
    ys.forEach(function (y) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); });
    ctx.lineWidth = lw; ctx.strokeStyle = key ? col(key) : ink(); ctx.stroke();
  }
  /** A sheet of paper: a rectangle with ruled lines. */
  function sheet(ctx, r, key) {
    rect(ctx, -r * 0.7, -r * 0.85, r * 1.4, r * 1.7, key || 'kit.paper', r * 0.08);
    lines(ctx, -r * 0.45, r * 0.45, [-r * 0.45, -r * 0.15, r * 0.15, r * 0.45], r * 0.06, 'kit.metalDark');
  }

  /** The drawings, centred at the origin; r = about half the box side. */
  var DRAW = {
    // ---- the janitor's bins and items
    trash: function (ctx, r) {
      ctx.beginPath(); ctx.moveTo(-r * 0.7, -r * 0.6); ctx.lineTo(r * 0.7, -r * 0.6); ctx.lineTo(r * 0.55, r * 0.9); ctx.lineTo(-r * 0.55, r * 0.9); ctx.closePath();
      fill(ctx, 'kit.metal'); stroke(ctx, r * 0.09);
      rect(ctx, -r * 0.85, -r * 0.85, r * 1.7, r * 0.25, 'kit.metalDark', r * 0.09);
      ctx.beginPath(); for (var i = -1; i <= 1; i++) { ctx.moveTo(i * r * 0.3, -r * 0.4); ctx.lineTo(i * r * 0.25, r * 0.7); } stroke(ctx, r * 0.06);
    },
    recycle: function (ctx, r) {
      rect(ctx, -r * 0.75, -r * 0.7, r * 1.5, r * 1.6, 'kit.plant', r * 0.09);
      ctx.beginPath();
      for (var k = 0; k < 3; k++) {
        var a = -Math.PI / 2 + k * 2 * Math.PI / 3, b = a + 1.6;
        ctx.moveTo(Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42 + r * 0.1);
        ctx.arc(0, r * 0.1, r * 0.42, a, b);
      }
      ctx.lineWidth = r * 0.12; ctx.strokeStyle = col('kit.paper'); ctx.stroke();
    },
    lost: function (ctx, r) {
      rect(ctx, -r * 0.85, -r * 0.35, r * 1.7, r * 1.2, 'kit.wood', r * 0.09);
      ctx.beginPath(); ctx.moveTo(-r * 0.85, -r * 0.35); ctx.lineTo(-r * 0.6, -r * 0.8); ctx.lineTo(r * 0.6, -r * 0.8); ctx.lineTo(r * 0.85, -r * 0.35); ctx.closePath();
      fill(ctx, 'kit.woodLight'); stroke(ctx, r * 0.09);
      ctx.font = SR.art.draw.font(r * 0.7, 900, 'display'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = ink();
      ctx.fillText('?', 0, r * 0.28);
    },
    peel: function (ctx, r) {
      ctx.beginPath(); ctx.moveTo(0, -r * 0.2);
      [[-r * 0.8, r * 0.5], [-r * 0.15, r * 0.7], [r * 0.5, r * 0.75], [r * 0.9, r * 0.3]].forEach(function (p) { ctx.quadraticCurveTo(p[0] * 0.4, -r * 0.1, p[0], p[1]); ctx.quadraticCurveTo(p[0] * 0.3, r * 0.2, 0, -r * 0.2); });
      fill(ctx, 'kit.beer'); stroke(ctx, r * 0.08);
      rect(ctx, -r * 0.1, -r * 0.7, r * 0.2, r * 0.5, 'kit.beer', r * 0.08);
      rect(ctx, -r * 0.1, -r * 0.8, r * 0.2, r * 0.12, 'kit.woodDark', r * 0.05);
    },
    crumbs: function (ctx, r) {
      ctx.beginPath(); ctx.ellipse(0, r * 0.3, r * 0.9, r * 0.4, 0, 0, Math.PI * 2); fill(ctx, 'kit.paper'); stroke(ctx, r * 0.08);
      [[-0.4, 0.2], [0.1, 0.35], [0.45, 0.15], [-0.1, 0.05], [0.25, 0.45]].forEach(function (p) {
        ctx.beginPath(); ctx.arc(p[0] * r, p[1] * r, r * 0.12, 0, Math.PI * 2); fill(ctx, 'kit.wood'); stroke(ctx, r * 0.04);
      });
      ctx.beginPath(); ctx.moveTo(-r * 0.3, -r * 0.1); ctx.quadraticCurveTo(0, -r * 0.8, r * 0.35, -r * 0.1); ctx.closePath(); fill(ctx, 'kit.woodLight'); stroke(ctx, r * 0.07);
    },
    cup: function (ctx, r) {
      ctx.beginPath(); ctx.moveTo(-r * 0.55, -r * 0.8); ctx.lineTo(r * 0.55, -r * 0.8); ctx.lineTo(r * 0.38, r * 0.85); ctx.lineTo(-r * 0.38, r * 0.85); ctx.closePath();
      fill(ctx, 'kit.paper'); stroke(ctx, r * 0.09);
      ctx.beginPath(); ctx.moveTo(-r * 0.49, -r * 0.3); ctx.lineTo(r * 0.49, -r * 0.3); ctx.lineTo(r * 0.44, 0); ctx.lineTo(-r * 0.44, 0); ctx.closePath(); fill(ctx, 'kit.red');
    },
    can: function (ctx, r) {
      rect(ctx, -r * 0.45, -r * 0.75, r * 0.9, r * 1.6, 'kit.red', r * 0.09);
      ctx.beginPath(); ctx.ellipse(0, -r * 0.75, r * 0.45, r * 0.14, 0, 0, Math.PI * 2); fill(ctx, 'kit.chrome'); stroke(ctx, r * 0.06);
      lines(ctx, -r * 0.45, r * 0.45, [r * 0.05], r * 0.14, 'kit.paper');
    },
    keys: function (ctx, r) {
      ctx.beginPath(); ctx.arc(-r * 0.35, -r * 0.35, r * 0.3, 0, Math.PI * 2); stroke(ctx, r * 0.1);
      [[0, 0.9], [0.5, 0.55]].forEach(function (k) {
        ctx.save(); ctx.translate(-r * 0.2, -r * 0.2); ctx.rotate(k[1]);
        rect(ctx, r * 0.05, -r * 0.1, r * 1.0, r * 0.2, 'kit.gold', r * 0.06);
        rect(ctx, r * 0.75, r * 0.1, r * 0.12, r * 0.18, 'kit.gold', r * 0.05);
        ctx.restore();
      });
    },
    glasses: function (ctx, r) {
      [-1, 1].forEach(function (s) { ctx.beginPath(); ctx.arc(s * r * 0.45, 0, r * 0.35, 0, Math.PI * 2); fill(ctx, 'kit.glass'); stroke(ctx, r * 0.1); });
      ctx.beginPath(); ctx.moveTo(-r * 0.1, -r * 0.05); ctx.quadraticCurveTo(0, -r * 0.2, r * 0.1, -r * 0.05);
      ctx.moveTo(-r * 0.8, -r * 0.1); ctx.lineTo(-r * 1.0, -r * 0.35); ctx.moveTo(r * 0.8, -r * 0.1); ctx.lineTo(r * 1.0, -r * 0.35); stroke(ctx, r * 0.09);
    },
    // ---- the mail room's bins and items
    inbox: function (ctx, r) { tray(ctx, r, 'kit.fabric', 1); },
    outbox: function (ctx, r) { tray(ctx, r, 'kit.woodLight', -1); },
    shred: function (ctx, r) {
      rect(ctx, -r * 0.8, -r * 0.35, r * 1.6, r * 1.2, 'kit.metalDark', r * 0.09);
      rect(ctx, -r * 0.9, -r * 0.7, r * 1.8, r * 0.4, 'kit.metal', r * 0.09);
      lines(ctx, -r * 0.6, r * 0.6, [-r * 0.5], r * 0.08);
      ctx.beginPath(); for (var j = -3; j <= 3; j++) { ctx.moveTo(j * r * 0.18, -r * 0.2); ctx.lineTo(j * r * 0.18, r * 0.6); }
      ctx.lineWidth = r * 0.07; ctx.strokeStyle = col('kit.paper'); ctx.stroke();
    },
    memo: function (ctx, r) {
      sheet(ctx, r);
      ctx.beginPath(); ctx.arc(r * 0.45, -r * 0.62, r * 0.14, 0, Math.PI * 2); fill(ctx, 'kit.red'); stroke(ctx, r * 0.04);
    },
    invoice: function (ctx, r) {
      sheet(ctx, r, 'kit.counterTop');
      ctx.font = SR.art.draw.font(r * 0.8, 900, 'display'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = col('kit.felt');
      ctx.fillText('$', 0, r * 0.05);
    },
    parcel: function (ctx, r) {
      rect(ctx, -r * 0.8, -r * 0.55, r * 1.6, r * 1.2, 'kit.wood', r * 0.09);
      lines(ctx, -r * 0.8, r * 0.8, [r * 0.05], r * 0.1, 'kit.woodDark');
      ctx.beginPath(); ctx.moveTo(0, -r * 0.55); ctx.lineTo(0, r * 0.65); ctx.lineWidth = r * 0.1; ctx.strokeStyle = col('kit.woodDark'); ctx.stroke();
      rect(ctx, r * 0.3, -r * 0.45, r * 0.35, r * 0.3, 'kit.red', r * 0.05);
    },
    letter: function (ctx, r) {
      rect(ctx, -r * 0.85, -r * 0.55, r * 1.7, r * 1.1, 'kit.paper', r * 0.09);
      ctx.beginPath(); ctx.moveTo(-r * 0.85, -r * 0.55); ctx.lineTo(0, r * 0.1); ctx.lineTo(r * 0.85, -r * 0.55); stroke(ctx, r * 0.07);
      rect(ctx, r * 0.4, -r * 0.45, r * 0.3, r * 0.3, 'kit.red', r * 0.05);
    },
    junk: function (ctx, r) {
      ctx.beginPath();
      for (var i = 0; i < 10; i++) { var a = i * Math.PI / 5, rr = i % 2 ? r * 0.55 : r * 0.9; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      ctx.closePath(); fill(ctx, 'kit.slushA'); stroke(ctx, r * 0.08);
      ctx.font = SR.art.draw.font(r * 0.45, 900, 'display'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = ink();
      ctx.fillText('!!', 0, 0);
    },
    secret: function (ctx, r) {
      rect(ctx, -r * 0.8, -r * 0.6, r * 1.6, r * 1.3, 'kit.poster', r * 0.09);
      rect(ctx, -r * 0.8, -r * 0.8, r * 0.6, r * 0.22, 'kit.poster', r * 0.07);
      ctx.save(); ctx.rotate(-0.25);
      rect(ctx, -r * 0.7, -r * 0.12, r * 1.4, r * 0.3, 'kit.red', r * 0.05);
      ctx.restore();
    },
  };
  // An in / out tray: a shallow box with a sheet and an arrow (dir 1: down into it, -1: up out of it).
  function tray(ctx, r, key, dir) {
    sheet(ctx, r * 0.7);
    ctx.beginPath(); ctx.moveTo(-r * 0.9, r * 0.2); ctx.lineTo(r * 0.9, r * 0.2); ctx.lineTo(r * 0.75, r * 0.8); ctx.lineTo(-r * 0.75, r * 0.8); ctx.closePath();
    fill(ctx, key); stroke(ctx, r * 0.09);
    ctx.beginPath(); ctx.moveTo(r * 0.55, -r * 0.2 * dir - r * 0.3); ctx.lineTo(r * 0.55, r * 0.4 * dir - r * 0.3);
    ctx.moveTo(r * 0.4, r * 0.25 * dir - r * 0.3); ctx.lineTo(r * 0.55, r * 0.4 * dir - r * 0.3); ctx.lineTo(r * 0.7, r * 0.25 * dir - r * 0.3);
    stroke(ctx, r * 0.1);
  }

  /** @returns {string} the item set of a run: params.set, else by your NLI rank (Mail Room: mail). */
  function setOf(state, run) {
    if (run && SETS[run.set]) return run.set;
    var rank = state && state.job && state.job.ranks ? state.job.ranks.nli : null;
    return rank === 'mail' ? 'mail' : 'janitor';
  }

  SR.def.skin('sortit', {
    engine: 'shiftrush',
    music: 'tick_tock_trouble',
    /** Run params: the conveyor mode, the set's bins and items (the engine brings every number). */
    params: function (state, run) {
      var id = setOf(state, run), set = SETS[id];
      return {
        mode: 'conveyor', set: id, subtitle: 'mg.sortit.subtitle.' + id,
        bins: set.bins.map(function (b) { return { id: b, label: 'mg.sortit.' + b }; }),
        items: set.items.map(function (it) { return { id: it[0], label: 'mg.sortit.' + it[0], bin: it[1] }; }),
      };
    },
    text: { title: 'mg.sortit.title' },
    art: {
      /** @returns {boolean} true: the item or bin was drawn (the engine then skips its placeholder). */
      item: function (ctx, id, x, y, size) {
        var d = DRAW[id];
        if (!d) return false;
        ctx.save();
        ctx.translate(x, y);
        d(ctx, size * 0.42);
        ctx.restore();
        return true;
      },
      /** The office after hours: the NLI wall, a baseboard and a floor under the bins. */
      backdrop: function (ctx, w, h) {
        ctx.save();
        ctx.fillStyle = col('int.nli.wallHi');
        ctx.fillRect(0, 0, w, 392);
        ctx.fillStyle = col('int.nli.floorA');
        ctx.fillRect(0, 392, w, h - 392);
        ctx.fillStyle = col('int.nli.trim');
        ctx.fillRect(0, 386, w, 8);
        // the stacked-lines logo, faint, on the right-hand wall
        ctx.globalAlpha = 0.35;
        for (var i = 0; i < 3; i++) {
          ctx.fillStyle = col('bld.nli.trim');
          ctx.fillRect(1010 + i * 14, 236 + i * 30, 170 - i * 28, 16);
        }
        ctx.restore();
      },
    },
  });
})();
