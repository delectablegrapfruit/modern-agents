// Map art: the sky behind the paper-thin city, and the static city (ground, roads, sidewalks,
// buildings, trees) drawn once into an offscreen canvas by the city scene.
// All drawing is in map coordinates (see js/world/map.js).
(function () {
  'use strict';
  var SRPG = window.SRPG;
  var MAP = SRPG.MAP;
  var D = SRPG.draw;

  var GRASS = '#33cc00';
  var WALK = '#999999';
  var ROAD = '#666666';

  function groundPath(ctx) {
    ctx.beginPath();
    MAP.ground.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
    ctx.closePath();
  }

  function sidewalk(ctx, x, y, w, h, vertical) {
    ctx.fillStyle = WALK;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#7a7a7a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (vertical) for (var yy = y; yy < y + h; yy += 60) { ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); }
    else for (var xx = x; xx < x + w; xx += 60) { ctx.moveTo(xx, y); ctx.lineTo(xx, y + h); }
    ctx.stroke();
  }

  var mapArt = (SRPG.mapArt = {
    // Offscreen canvas bounds in map coordinates (covers the castle's towers and edge dirt).
    BOUNDS: { x: -1060, y: -960, w: 2010, h: 1900 },

    drawSky: function (ctx, s, frame) {
      // The sky dims as the day goes on: the clouds layer fades out after noon.
      var a = Math.max(0, Math.min(1, (100 + 8 * (12 - s.time)) / 100));
      ctx.fillStyle = '#0b1c3a';
      ctx.fillRect(0, 0, SRPG.W, SRPG.H);
      ctx.globalAlpha = a;
      D.gradient(ctx, 0, 0, SRPG.W, SRPG.H, '#4f8fd8', '#b8d6f2');
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      var ox = ((frame || 0) * 0.15 + s.mapx * 0.3) % 700;
      for (var i = 0; i < 6; i++) {
        var cx = ((i * 190 - ox) % 700 + 700) % 700 - 80;
        var cy = 40 + ((i * 97) % 300) + s.mapy * 0.1 % 60;
        ctx.beginPath();
        ctx.ellipse(cx, cy, 70, 22, 0, 0, Math.PI * 2);
        ctx.ellipse(cx + 40, cy - 10, 45, 20, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },

    drawStatic: function (ctx, s) {
      // edge thickness (west and south faces)
      var e = MAP.edge;
      ctx.save();
      ctx.translate(-e * 0.6, e);
      groundPath(ctx);
      ctx.fillStyle = '#6b3d12';
      ctx.fill();
      ctx.restore();
      // ground
      groundPath(ctx);
      ctx.fillStyle = GRASS;
      ctx.fill();
      ctx.save();
      groundPath(ctx);
      ctx.clip();
      var R = MAP.roads;
      // sidewalks
      sidewalk(ctx, R.vertical.sidewalkL.x, -824, R.vertical.sidewalkL.w, 1722, true);
      sidewalk(ctx, R.vertical.sidewalkR.x, -824, R.vertical.sidewalkR.w, 1722, true);
      sidewalk(ctx, -995, R.west.sidewalkT.y, 784, R.west.sidewalkT.h, false);
      sidewalk(ctx, -995, R.west.sidewalkB.y, 784, R.west.sidewalkB.h, false);
      sidewalk(ctx, 141, R.east.sidewalkT.y, 777, R.east.sidewalkT.h, false);
      sidewalk(ctx, 141, R.east.sidewalkB.y, 777, R.east.sidewalkB.h, false);
      // asphalt
      ctx.fillStyle = ROAD;
      [R.vertical.asphalt, R.west.asphalt, R.east.asphalt].forEach(function (a) { ctx.fillRect(a.x, a.y, a.w, a.h); });
      // centre dashes
      var d = MAP.dash;
      ctx.fillStyle = '#ffff00';
      for (var y = -800; y < 890; y += d.period) {
        if (y > -500 && y < -290) continue;
        if (y > -60 && y < 130) continue;
        ctx.fillRect(R.vertical.center - d.width / 2, y, d.width, d.len);
      }
      for (var x = -980; x < -140; x += d.period) ctx.fillRect(x, R.west.center - d.width / 2, d.len, d.width);
      for (x = 70; x < 910; x += d.period) ctx.fillRect(x, R.east.center - d.width / 2, d.len, d.width);
      // buildings
      Object.keys(MAP.buildings).forEach(function (k) {
        var b = MAP.buildings[k];
        if (b.dwelling && b.dwelling !== s.dwelling) return;
        D.rect(ctx, b.x, b.y, b.w, b.h, '#b0a080', '#000', 2);
        D.text(ctx, b.name, b.x + b.w / 2, b.y + b.h / 2, { size: 14, align: 'center', baseline: 'middle', color: '#222' });
        if (b.door) D.rect(ctx, b.door.x, b.door.y, b.door.w, b.door.h, '#663300');
      });
      MAP.holes.forEach(function (h) { ctx.clearRect(h.x, h.y, h.w, h.h); });
      ctx.restore();
    },
  });
})();
