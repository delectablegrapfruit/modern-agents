// Top-down sprites for the city map: the player (walking, skating, driving, falling, knocked
// down), street people, and cars. Positions are stage coordinates (sprite centre).
(function () {
  'use strict';
  var SRPG = window.SRPG;
  var D = SRPG.draw;

  function head(ctx, x, y, r, color) {
    D.circle(ctx, x, y, r, color, '#000', 1.3);
  }

  SRPG.sprites = {
    // opts: { rot (deg, 0 = up), color, phase (walk cycle radians or null), mode: 'walk' | 'skate' |
    //         'car' | 'sportscar', anim: null | 'fall' | 'hit' | 'crash' | 'wake', t: anim progress 0..1 }
    player: function (ctx, x, y, o) {
      ctx.save();
      ctx.translate(x, y);
      if (o.anim === 'fall') {
        var k = Math.max(0.1, 1 - o.t * 1.5);
        ctx.scale(k, k);
      }
      ctx.rotate(((o.rot || 0) * Math.PI) / 180);
      if (o.mode === 'car' || o.mode === 'sportscar') {
        SRPG.sprites.car(ctx, 0, 0, { rot: 0, color: o.mode === 'sportscar' ? '#ff2222' : '#ffd000', local: true });
        ctx.restore();
        return;
      }
      if (o.mode === 'skate') D.roundRect(ctx, -5, -14, 10, 28, 4, '#a0522d', '#000', 1);
      var sw = o.phase != null ? Math.sin(o.phase) * 4 : 0;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(-9, 2); ctx.lineTo(-13, -4 + sw); ctx.lineTo(-10, -9 + sw);
      ctx.moveTo(9, 2); ctx.lineTo(13, -4 - sw); ctx.lineTo(10, -9 - sw);
      ctx.stroke();
      head(ctx, 0, 0, 9.5, o.color || '#0066cc');
      ctx.restore();
    },

    // Street person seen from above. opts: { color, rot, phase, kind }
    npc: function (ctx, x, y, o) {
      SRPG.sprites.player(ctx, x, y, { rot: o.rot, color: o.color, phase: o.phase, mode: 'walk' });
    },

    // Car seen from above, centred on x, y. opts: { rot (0 = heading up), color }
    car: function (ctx, x, y, o) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(((o.rot || 0) * Math.PI) / 180);
      D.roundRect(ctx, -22, -45, 44, 90, 14, o.color || '#ff8800', '#000', 1.5);
      D.roundRect(ctx, -17, -28, 34, 18, 5, '#4a2a7a', '#000', 1);
      D.roundRect(ctx, -17, 18, 34, 14, 5, '#4a2a7a', '#000', 1);
      ctx.restore();
    },
  };
})();
