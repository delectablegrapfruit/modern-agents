// js/art/interiors/mcsticks.js — owner: W2-Food. SR.def.interior('mcsticks'): the McSticks diorama
// (ART_AUDIO §9: the example of the kit, from palette keys only). Hero prop and loops: the fryer
// bubbling and steaming, the order ticker, and the burger-on-a-stick mascot standee (an original
// character, not the original game's logo) bobbing by the door; Manager Mel behind the counter. The
// scene lives in x 0-760; behind the card (x 776-1248) only wall and floor (ART_AUDIO §9).
// Node-loadable: nothing draws at load time.
(function () {
  'use strict';
  var SR = window.SR;

  var MENU = ['milkshake', 'fries', 'cheeseburger', 'tripleburger'];   // the board, left to right (B-06 rows)
  var MENU_ICON = { milkshake: 'milkshake', fries: 'fries', cheeseburger: 'burger', tripleburger: 'tripleburger' };
  var BOARD = { x: 318, y: 82, w: 392, h: 130 };
  var MASCOT = { x: 716, y: 612, top: 432 };                           // the standee: pole foot, burger centre

  /** The prices under the menu board (B-06, before any discount) and the fries tray on the counter. */
  function heroStatic(ctx, K) {
    var items = SR.tuning && SR.tuning.items, n = MENU.length, cw = BOARD.w / n;
    for (var i = 0; i < n; i++) {
      var cx = BOARD.x + cw * (i + 0.5);
      K.rect(ctx, cx - 30, BOARD.y + BOARD.h - 36, 60, 22, K.color('kit.bulb'), K.DL);
      var r = items && items[MENU[i]];
      if (r && SR.text && SR.text.money) {
        SR.art.draw.text(ctx, SR.text.money(r.price), cx, BOARD.y + BOARD.h - 19, { size: 16, weight: 900, role: 'display', align: 'center', color: 'ink' });
      }
    }
    // a tray of fries and a paper cup on the counter (the counter top is at y 370 here)
    K.box(ctx, 452, 372, 70, 10, 26, 'kit.red');
    for (var f = 0; f < 7; f++) K.rect(ctx, 460 + f * 8, 346 - (f % 3) * 5, 5, 26 + (f % 3) * 5, K.color('kit.beer'), 1);
    K.poly(ctx, [462, 372, 510, 372, 504, 348, 468, 348], K.color('kit.red'), K.LW);
    K.poly(ctx, [534, 372, 556, 372, 560, 332, 530, 332], K.color('kit.paper'), K.LW);
    K.rect(ctx, 528, 326, 34, 7, K.color('kit.red'), K.DL);
    K.line(ctx, [548, 326, 554, 306], 3, K.color('kit.red'));
    // the mascot's pole and foot
    K.ellipse(ctx, MASCOT.x, MASCOT.y, 34, 8, K.color('kit.metalDark'));
    K.line(ctx, [MASCOT.x, MASCOT.y - 4, MASCOT.x, MASCOT.top + 36], 8, K.color('kit.woodDark'));
  }

  /** The burger-on-a-stick mascot (bobbing, eyes on the till) and its slogan pennant. */
  function heroAnim(ctx, K, t) {
    var bob = Math.sin(t * 2.2) * 4, x = MASCOT.x, y = MASCOT.top + bob;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(t * 1.1) * 0.05);
    // bottom bun, patty, cheese, lettuce, top bun (front to back: drawn bottom up)
    K.poly(ctx, [-50, 18, 50, 18, 44, 34, -44, 34], K.color('acc.tan'), K.LW);
    K.rect(ctx, -54, 4, 108, 16, K.color('acc.coffee'), K.LW);
    K.poly(ctx, [-50, 4, 50, 4, 34, 14, 22, 6, 6, 16, -14, 6, -30, 14], K.color('kit.poster'), K.DL);
    var lettuce = [-56, 0];
    for (var i = 0; i <= 8; i++) lettuce.push(-56 + i * 14, i % 2 ? 6 : -2);
    lettuce.push(56, 0);
    K.line(ctx, lettuce, 5, K.color('kit.plant'));
    ctx.beginPath();
    ctx.moveTo(-52, -2);
    ctx.quadraticCurveTo(-50, -52, 0, -54);
    ctx.quadraticCurveTo(50, -52, 52, -2);
    ctx.closePath();
    ctx.fillStyle = K.color('acc.tan');
    ctx.fill();
    ctx.lineWidth = K.LW; ctx.strokeStyle = K.color('inkLine'); ctx.stroke();
    for (var sd = 0; sd < 5; sd++) K.ellipse(ctx, -28 + sd * 14, -38 + (sd % 2) * 8, 3, 2, K.color('kit.paper'), 0);
    // the face: it keeps an eye on the till
    var look = Math.sin(t * 0.7) > 0.6 ? -3 : 1;
    K.circle(ctx, -14 + look, -22, 5, K.color('kit.paper'), 2);
    K.circle(ctx, 14 + look, -22, 5, K.color('kit.paper'), 2);
    K.circle(ctx, -14 + look - 1, -22, 2, K.color('ink'), 0);
    K.circle(ctx, 14 + look - 1, -22, 2, K.color('ink'), 0);
    ctx.beginPath(); ctx.arc(0, -12, 10, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.lineWidth = 3; ctx.strokeStyle = K.color('inkLine'); ctx.stroke();
    ctx.restore();
    // the pennant, flapping gently
    var py = MASCOT.top + 56 + bob, wave = Math.sin(t * 3) * 3;
    K.poly(ctx, [x - 2, py, x - 80, py + 4 + wave, x - 80, py + 32 + wave, x - 2, py + 28], K.color('kit.red'), K.LW);
    var s = SR.text && SR.text.has && SR.text.has('card.mcsticks.slogan') ? SR.text('card.mcsticks.slogan') : '';
    if (s) SR.art.draw.text(ctx, s, x - 40, py + 20 + wave * 0.5, { size: 9, weight: 900, role: 'display', align: 'center', color: 'white', maxWidth: 72 });
  }

  SR.def.interior('mcsticks', {
    wall: { type: 'tiles', color: 'int.mcsticks.wall', trim: 'bld.mcsticks.walls' },
    floor: { type: 'checker', a: 'int.mcsticks.floorA', b: 'int.mcsticks.floorB', perspective: 0.35 },
    window: { x: 50, y: 88, w: 220, h: 140 },
    props: [
      { type: 'menuBoard', x: BOARD.x, y: BOARD.y, w: BOARD.w, h: BOARD.h, items: MENU.map(function (m) { return MENU_ICON[m]; }) },
      { type: 'ticker', x: BOARD.x, y: 228, w: BOARD.w, h: 28 },
      { type: 'poster', x: 688, y: 244, w: 66, h: 84, color: 'kit.poster', alt: 'bld.mcsticks.trim', text: 'card.mcsticks.poster' },
      { type: 'fryer', x: 548, y: 404, anim: 'steam' },
      { type: 'counter', x: 110, y: 470, w: 540, color: 'bld.mcsticks.walls' },
      { type: 'register', x: 190, y: 372, sortY: 470 },
      { type: 'trash', x: 28, y: 626 },
    ],
    owner: { id: 'mel', x: 360, y: 430, pose: 'idle' },
    you: { x: 250, y: 560 },
    lights: [{ x: 300, y: 56, r: 230, color: 'int.mcsticks.light' }, { x: 560, y: 56, r: 200, color: 'int.mcsticks.light' }],
    custom: 'mcsticksHero',
    fns: { mcsticksHero: { static: heroStatic, anim: heroAnim } },
  });
})();
