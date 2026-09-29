// js/art/interiors/bank.js — owner: W2-Money. SR.def.interior('bank'): the Bank of the 2nd Dimension
// (ART_AUDIO §9: the vault door, a wall clock ticking, the rate board; proprietor Penny Wise). The
// original's red bank (ART_AUDIO §5.2: red walls, gold columns, a big "$") seen from the lobby: a
// cream panelled hall trimmed in the bank's red, two gold columns, the rate board (it shows today's
// rate from the state), the ticking clock, the round vault door, a gold "$" medallion over the
// teller's window, Penny behind the glass, a red carpet, ferns and a velvet rope for the queue of
// one. Composition (ART_AUDIO §9): the scene in x 0-760, only wall and floor behind the card; the
// window shows the live sky. Colours are palette keys only (int.bank.*, bld.bank.*, kit.*).
// Node-loadable: nothing draws at load time.
(function () {
  'use strict';
  var SR = window.SR;

  var COLUMNS = [192, 564];            // the gold columns' left edges on the back wall
  var COLUMN_W = 30;
  var MEDALLION = { x: 395, y: 226, r: 26 };
  var ROPE = { x0: 96, x1: 214, y: 604, h: 64 };

  /** A fluted gold column from the cornice to the floor line. */
  function column(ctx, K, x) {
    var top = 40, bottom = K.floorY;
    K.rect(ctx, x - 6, top, COLUMN_W + 12, 14, K.color('bld.bank.trim'));
    K.rect(ctx, x, top + 14, COLUMN_W, bottom - top - 28, K.color('bld.bank.trim'));
    for (var i = 1; i < 3; i++) K.line(ctx, [x + i * COLUMN_W / 3, top + 20, x + i * COLUMN_W / 3, bottom - 20], 1.5, K.tone('bld.bank.trim', -1));
    K.rect(ctx, x - 6, bottom - 14, COLUMN_W + 12, 14, K.color('bld.bank.trim'));
  }

  /** The gold "$" medallion over the teller's window (the original's big "$"). */
  function medallion(ctx, K) {
    K.circle(ctx, MEDALLION.x, MEDALLION.y, MEDALLION.r, K.color('bld.bank.trim'));
    K.circle(ctx, MEDALLION.x, MEDALLION.y, MEDALLION.r - 6, K.tone('bld.bank.trim', 1), K.DL);
    SR.art.draw.text(ctx, '$', MEDALLION.x, MEDALLION.y + 2, { size: 30, weight: 900, role: 'display', align: 'center', baseline: 'middle', color: 'bld.bank.walls' });
  }

  /** The velvet rope for the queue: two brass posts and a sagging red rope. */
  function rope(ctx, K) {
    var posts = [ROPE.x0, ROPE.x1];
    posts.forEach(function (x) {
      K.ellipse(ctx, x, ROPE.y, 16, 5, K.color('kit.brass'), K.DL);
      K.line(ctx, [x, ROPE.y, x, ROPE.y - ROPE.h], 6, K.color('kit.brass'));
      K.circle(ctx, x, ROPE.y - ROPE.h - 4, 7, K.color('kit.brass'), K.DL);
    });
    ctx.beginPath();
    ctx.moveTo(ROPE.x0, ROPE.y - ROPE.h + 6);
    ctx.quadraticCurveTo((ROPE.x0 + ROPE.x1) / 2, ROPE.y - ROPE.h + 44, ROPE.x1, ROPE.y - ROPE.h + 6);
    ctx.lineWidth = 7; ctx.strokeStyle = K.color('kit.rope'); ctx.lineCap = 'round'; ctx.stroke();
  }

  /** A small brass sign on the counter: "PLEASE WAIT TO BE SEEN" (text key card.bank.sign). */
  function sign(ctx, K) {
    var s = SR.text.has('card.bank.sign') ? SR.text('card.bank.sign') : '';
    K.rect(ctx, 468, 356, 84, 22, K.color('kit.brass'), 2);
    if (s) SR.art.draw.text(ctx, s, 510, 368, { size: 10, weight: 900, role: 'display', align: 'center', baseline: 'middle', color: 'ink', maxWidth: 78 });
  }

  SR.def.interior('bank', {
    wall: { type: 'panels', color: '@wall', alt: '@wallShade', trim: '@trim' },
    floor: { type: 'checker', a: '@floorA', b: '@floorB', perspective: 0.45 },
    window: { x: 28, y: 92, w: 150, h: 168 },
    props: [
      { type: 'rateboard', x: 240, y: 86, w: 200, h: 100 },
      { type: 'clock', x: 460, y: 96, w: 64, h: 64, alt: 'bld.bank.walls' },
      // the hero: the round vault door, half hidden behind the counter's end
      { type: 'vault', x: 612, y: 112, w: 140, h: 140 },
      { type: 'rug', x: 214, y: 712, w: 360, d: 200, color: 'kit.rug', alt: 'kit.rugTrim' },
      { type: 'plant', x: 18, y: 540, w: 76, h: 150 },
      { type: 'plant', x: 684, y: 520, w: 70, h: 140 },
      // the teller's window: the counter in the bank's dark red with a gold rail, glass above
      { type: 'teller', x: 236, y: 480, w: 320, h: 206, color: '@counter', alt: '@accent' },
    ],
    owner: { id: 'penny', x: 396, y: 452, pose: 'idle' },
    you: { x: 330, y: 612 },
    lights: [{ x: 396, y: 40, r: 280, color: '@light' }, { x: 120, y: 60, r: 180, color: '@light' }],
    custom: 'bankHall',
    fns: {
      bankHall: {
        static: function (ctx, K) {
          COLUMNS.forEach(function (x) { column(ctx, K, x); });
          medallion(ctx, K);
          rope(ctx, K);
        },
        // The counter sign sits on the teller's glass, which the kit redraws over Penny each frame.
        anim: function (ctx, K) { sign(ctx, K); },
      },
    },
  });
})();
