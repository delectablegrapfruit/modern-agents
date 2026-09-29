// js/art/interiors/bar.js — owner: W2-Night. SR.def.interior('bar'): Sticky's (ART_AUDIO §9).
// A long bar with taps and stools, a bottle shelf behind Sticky, the neon beer mug over the
// window, a dartboard, and the ladder board: the twelve regulars of the fight ladder chalked on a
// board, the next man up marked (GDD §6.3; the marker follows state.fight.won every frame). The
// Classic cabinet's glowing screen stands in the corner while `nightlife` is on (P1). Colours are
// palette keys only (int.bar.*, kit.*, light.*). Node-loadable: nothing draws at load time.
(function () {
  'use strict';
  var SR = window.SR;

  var BOARD = { x: 424, y: 88, w: 184, h: 200, rows: 12 };   // the ladder board on the back wall

  function ladder() {
    return SR.registry.entries('fighter').map(function (e) { return e.def; })
      .filter(function (d) { return d.ladder; }).sort(function (a, b) { return a.n - b.n; });
  }
  function nameOf(d) { return d && SR.text.has(d.name) ? SR.text(d.name) : ''; }
  function rowY(i) { return BOARD.y + 40 + i * ((BOARD.h - 48) / BOARD.rows); }

  /** The ladder board: frame, chalk title and the twelve names (static layer). */
  function boardStatic(ctx, kit) {
    var b = BOARD;
    kit.rect(ctx, b.x - 8, b.y - 8, b.w + 16, b.h + 16, kit.color('kit.woodDark'));
    kit.rect(ctx, b.x, b.y, b.w, b.h, kit.color('kit.board'), kit.DL);
    SR.art.draw.text(ctx, SR.text.has('card.bar.ladder') ? SR.text('card.bar.ladder') : '', b.x + b.w / 2, b.y + 18,
      { size: 16, weight: 900, role: 'display', align: 'center', color: 'kit.chalk', maxWidth: b.w - 12 });
    kit.line(ctx, [b.x + 12, b.y + 28, b.x + b.w - 12, b.y + 28], 1.5, kit.color('kit.chalk'));
    ladder().forEach(function (d, i) {
      SR.art.draw.text(ctx, (i + 1) + '  ' + nameOf(d), b.x + 12, rowY(i) + 4,
        { size: 11, weight: 700, align: 'left', color: 'kit.chalk', maxWidth: b.w - 34 });
    });
  }

  /** The chalk marker at the next rung, and a line through each name already beaten (each frame). */
  function boardAnim(ctx, kit, t, state) {
    var f = state && state.fight;
    if (!f) return;
    var b = BOARD, won = Math.min(BOARD.rows, f.won || 0);
    ctx.save();
    ctx.strokeStyle = kit.color('kit.chalk');
    ctx.lineWidth = 1.5;
    ctx.globalAlpha *= 0.85;
    for (var i = 0; i < won; i++) {
      ctx.beginPath(); ctx.moveTo(b.x + 26, rowY(i)); ctx.lineTo(b.x + b.w - 22, rowY(i)); ctx.stroke();
    }
    ctx.restore();
    if (f.champion || won >= BOARD.rows) {
      if (SR.text.has('card.bar.champMark')) SR.art.draw.text(ctx, SR.text('card.bar.champMark'), b.x + b.w - 14, b.y + 18, { size: 16, weight: 900, align: 'center', color: 'kit.gold' });
      return;
    }
    var y = rowY(won), bob = Math.sin(t * 3) * 2;
    kit.poly(ctx, [b.x + b.w - 8 + bob, y, b.x + b.w + 6 + bob, y - 7, b.x + b.w + 6 + bob, y + 7], kit.color('light.neonYellow'), kit.DL);
  }

  SR.def.interior('bar', {
    wall: { type: 'brick', color: 'int.bar.wall', alt: 'int.bar.wallShade', trim: 'int.bar.trim', wainscotH: 96 },
    floor: { type: 'planks', a: 'int.bar.floorA', b: 'int.bar.floorB', perspective: 0.5, tile: 56 },
    window: { x: 36, y: 92, w: 160, h: 120 },
    props: [
      { type: 'neon', x: 222, y: 96, w: 112, h: 112 },
      { type: 'dartboard', x: 644, y: 104, w: 92, h: 92 },
      { type: 'poster', x: 652, y: 222, w: 76, h: 96, text: 'card.bar.poster', color: 'int.bar.accent' },
      { type: 'shelf', x: 176, y: 404, w: 236, h: 176, d: 36, color: 'kit.woodDark' },
      { type: 'bar', x: 104, y: 472, w: 470, h: 112, d: 64, color: 'int.bar.counter' },
      { type: 'taps', x: 100, y: 356, sortY: 472.5 },
      { type: 'register', x: 478, y: 360, sortY: 472.6 },
      { type: 'cabinet', x: 644, y: 468, when: function () { return !!(SR.features && SR.features.nightlife); } },
      { type: 'stool', x: 140, y: 548 },
      { type: 'stool', x: 346, y: 548 },
      { type: 'stool', x: 452, y: 548 },
      { type: 'table', x: 580, y: 640, w: 170, d: 70, color: 'kit.wood' },
    ],
    owner: { id: 'sticky', x: 360, y: 432, pose: 'idle' },
    you: { x: 250, y: 574 },
    lights: [{ x: 376, y: 150, r: 230, color: 'int.bar.light' }, { x: 640, y: 70, r: 200, color: 'int.bar.light', fixture: false, alpha: 0.18 }],
    custom: 'ladderBoard',
    fns: { ladderBoard: { static: boardStatic, anim: boardAnim } },
  });
})();
