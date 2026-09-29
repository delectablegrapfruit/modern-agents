// js/art/interiors/casino.js — owner: W2-Night. SR.def.interior('casino'): the Silver Lining
// Casino (ART_AUDIO §9). A navy wallpapered hall on red carpet: the chandelier sparkling, the big
// wall of slot reels spinning in the background, a row of Paper Jackpot cabinets, the blackjack
// table with Lucky Lou behind it, the roulette table and the silver fountain. The hero prop is the
// silver-lining cloud logo over the reels (custom fn). Colours are palette keys only (int.casino.*,
// kit.*, light.*, bld.casino.*). Node-loadable: nothing draws at load time.
(function () {
  'use strict';
  var SR = window.SR;

  var LOGO = { x: 560, y: 118, r: 32 };   // the silver-lining cloud over the reel wall

  /** The silver-lining cloud: three puffs with a bright rim along the underside. */
  function cloud(ctx, kit, x, y, r, rim) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x - r * 0.9, y + r * 0.15, r * 0.62, 0, Math.PI * 2);
    ctx.arc(x, y - r * 0.2, r * 0.8, 0, Math.PI * 2);
    ctx.arc(x + r * 0.95, y + r * 0.2, r * 0.58, 0, Math.PI * 2);
    ctx.fillStyle = kit.color('kit.paper');
    ctx.fill();
    ctx.lineWidth = kit.LW;
    ctx.strokeStyle = kit.color('inkLine');
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - r * 1.45, y + r * 0.42);
    ctx.quadraticCurveTo(x, y + r * 0.95, x + r * 1.45, y + r * 0.45);
    ctx.lineWidth = 5;
    ctx.strokeStyle = kit.color(rim || 'kit.chrome');
    ctx.stroke();
    ctx.restore();
  }

  function logoStatic(ctx, kit) {
    cloud(ctx, kit, LOGO.x, LOGO.y, LOGO.r, 'kit.chrome');
  }

  /** The lining catches the chandelier light now and then (a slow glint along the rim). */
  function logoAnim(ctx, kit, t) {
    var k = (t * 0.35) % 1;
    if (k > 0.3) return;
    var a = k / 0.3, x = LOGO.x - LOGO.r * 1.4 + a * LOGO.r * 2.8;
    var y = LOGO.y + LOGO.r * 0.42 + Math.sin(a * Math.PI) * LOGO.r * 0.38;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha *= Math.sin(a * Math.PI);
    kit.line(ctx, [x - 9, y, x + 9, y], 2, kit.color('kit.bulb'));
    kit.line(ctx, [x, y - 9, x, y + 9], 2, kit.color('kit.bulb'));
    ctx.restore();
  }

  SR.def.interior('casino', {
    wall: { type: 'wallpaper', color: 'int.casino.wall', alt: 'int.casino.wallShade', trim: 'int.casino.trim', wainscotH: 84 },
    floor: { type: 'carpet', a: 'int.casino.floorA', b: 'int.casino.trim', perspective: 0.55 },
    window: { x: 36, y: 86, w: 132, h: 104 },
    props: [
      { type: 'chandelier', x: 236, y: 70, w: 180, h: 90 },
      { type: 'reels', x: 410, y: 176, w: 300, h: 100, color: 'int.casino.trim' },
      { type: 'slot', x: 36, y: 474, w: 78, h: 168, color: 'bld.casino.walls' },
      { type: 'slot', x: 128, y: 474, w: 78, h: 168, color: 'int.casino.accent' },
      { type: 'slot', x: 220, y: 474, w: 78, h: 168, color: 'bld.casino.walls' },
      { type: 'cardtable', x: 330, y: 474, w: 230, h: 70, d: 100 },
      { type: 'fountain', x: 570, y: 470, w: 180, h: 60, d: 80 },
      { type: 'roulette', x: 470, y: 640, w: 250, h: 80, d: 110 },
      { type: 'plant', x: 690, y: 420 },
    ],
    owner: { id: 'lou', x: 446, y: 438, pose: 'idle' },
    you: { x: 250, y: 600 },
    lights: [{ x: 326, y: 130, r: 260, color: 'int.casino.light', fixture: false, alpha: 0.22 }],
    custom: 'liningLogo',
    fns: { liningLogo: { static: logoStatic, anim: logoAnim } },
  });
})();
