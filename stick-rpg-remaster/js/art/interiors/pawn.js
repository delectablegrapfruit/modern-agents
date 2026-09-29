// js/art/interiors/pawn.js — owner: W2-Goods. SR.def.interior('pawn'): the pawn shop (ART_AUDIO §9:
// a ceiling fan, the gun case glinting, a mounted fish; proprietor Vinnie). The original's cues are
// kept: a slatted wall, a mustard counter and glass cases of watches and clocks; the pawnbroker's
// three gold balls hang on the wall, a guitar waits for a new owner and the window is barred.
// Composition (ART_AUDIO §9): the scene in x 0-760, only wall and floor behind the card; the
// window shows the live sky, and the bars are drawn again over it every frame.
// Colours are palette keys only (int.pawn.*, bld.pawn.*, kit.*). Node-loadable: nothing draws at
// load time.
(function () {
  'use strict';
  var SR = window.SR;

  var WINDOW = { x: 40, y: 96, w: 170, h: 130 };

  /** The window bars (drawn in the static layer and again over the live sky each frame). */
  function bars(ctx, K) {
    var x = WINDOW.x, y = WINDOW.y, w = WINDOW.w, h = WINDOW.h;
    for (var i = 1; i < 6; i++) K.line(ctx, [x + (w * i) / 6, y - 4, x + (w * i) / 6, y + h + 4], 5, K.color('kit.metalDark'));
    K.line(ctx, [x - 4, y + h * 0.5, x + w + 4, y + h * 0.5], 5, K.color('kit.metalDark'));
  }

  /** Three gold balls on a bracket: the pawnbroker's sign. */
  function balls(ctx, K) {
    K.line(ctx, [700, 40, 700, 70, 650, 70], 5, K.color('kit.metalDark'));
    var pts = [[634, 92], [666, 92], [650, 118]];
    for (var i = 0; i < pts.length; i++) {
      K.line(ctx, [650, 70, pts[i][0], pts[i][1] - 14], 1.5);
      K.circle(ctx, pts[i][0], pts[i][1], 14, K.color('bld.pawn.trim'));
      K.circle(ctx, pts[i][0] - 5, pts[i][1] - 5, 4, K.tone('bld.pawn.trim', 1), 0);
    }
  }

  /** A guitar on a wall hook, waiting for a new owner. */
  function guitar(ctx, K) {
    var cx = 244, top = 128;
    K.line(ctx, [cx, top - 10, cx, top], 3, K.color('kit.metalDark'));
    K.rect(ctx, cx - 6, top, 12, 110, K.color('kit.woodDark'));
    K.rect(ctx, cx - 10, top - 4, 20, 22, K.color('kit.woodDark'), 2);
    K.ellipse(ctx, cx, top + 150, 38, 34, K.color('kit.wood'));
    K.ellipse(ctx, cx, top + 200, 46, 40, K.color('kit.wood'));
    K.circle(ctx, cx, top + 165, 10, K.color('kit.screen'), 1);
    K.rect(ctx, cx - 16, top + 205, 32, 8, K.color('kit.woodDark'), 1);
    for (var i = -1; i <= 1; i++) K.line(ctx, [cx + i * 3, top + 4, cx + i * 3, top + 208], 0.8, K.color('kit.chrome'));
  }

  /** A price card taped to the wall: "CASH PAID", in the pawn's gold. */
  function sign(ctx, K) {
    var s = SR.text.has('card.pawn.sign.cash') ? SR.text('card.pawn.sign.cash') : '';
    K.rect(ctx, 520, 128, 118, 40, K.color('bld.pawn.trim'), 2);
    if (s) SR.art.draw.text(ctx, s, 579, 150, { size: 16, weight: 900, role: 'display', align: 'center', color: 'ink', maxWidth: 108 });
  }

  SR.def.interior('pawn', {
    // the slatted wall (stripes) in the pawn's lilac, purple trim from the exterior
    wall: { type: 'stripes', color: 'int.pawn.wall', alt: 'int.pawn.wallShade', trim: 'bld.pawn.walls', wainscotH: 80 },
    floor: { type: 'planks', a: 'int.pawn.floorA', b: 'int.pawn.floorB', perspective: 0.5, tile: 52 },
    window: WINDOW,
    props: [
      { type: 'fan', x: 300, y: 62, w: 200 },
      { type: 'fish', x: 300, y: 200 },
      { type: 'clock', x: 330, y: 112, w: 62, h: 62 },
      { type: 'clock', x: 410, y: 124, w: 46, h: 46, alt: 'bld.pawn.trim' },
      { type: 'shelf', x: 480, y: 400, w: 150, h: 220, color: 'kit.woodDark' },
      { type: 'shelf', x: 640, y: 400, w: 110, h: 180, color: 'kit.wood' },
      // the mustard counter (orig) with the till; Vinnie stands behind it
      { type: 'counter', x: 300, y: 480, w: 360, color: 'bld.pawn.trim', alt: 'kit.counterTop' },
      { type: 'register', x: 560, y: 392, sortY: 480 },
      // the hero: the glass case of guns and watches, glinting
      { type: 'guncase', x: 40, y: 560, w: 240 },
      { type: 'boxes', x: 600, y: 660, color: 'kit.woodLight' },
    ],
    owner: { id: 'vinnie', x: 440, y: 452, pose: 'idle' },
    you: { x: 330, y: 612 },
    lights: [{ x: 180, y: 70, r: 240, color: 'int.pawn.light' }, { x: 560, y: 70, r: 220, color: 'int.pawn.light' }],
    custom: 'pawnWall',
    fns: {
      pawnWall: {
        static: function (ctx, K) { balls(ctx, K); guitar(ctx, K); sign(ctx, K); bars(ctx, K); },
        anim: function (ctx, K) { bars(ctx, K); },
      },
    },
  });
})();
