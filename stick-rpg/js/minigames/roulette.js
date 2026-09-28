// Roulette (the original's root frame 43). Rules, from the code:
//  - Click a board space to make it the Active Space, then click chips to raise its bet:
//    $5 / $25 / $100 need cash > 4 / 24 / 99 and a total bet (all spaces) under 1996 / 1976 / 1901,
//    i.e. a $2000 table limit. The grey 0 chip takes the active space's bet back; CLEAR ALL BETS
//    returns everything. LEAVE returns the total bet too.
//  - SPIN costs 1 karma (with or without bets), plays the wheel sound and disables SPIN and LEAVE
//    (chips and the board stay live). The ball loops the wheel until the first lap check after
//    6.8 s; then random(38) picks 1-36 (0-35), 0 (36) or 00 (37) and everything is paid at once:
//    straight bets (numbers, 0, 00) x36, red/black/even/odd/1-18/19-36 x2, columns and dozens x3
//    (all returns include the stake, which was taken when the chips were placed). All bets then
//    clear. The result line reads e.g. "17, black!  Player gets $0.". No time passes.
//  - Decided fixes (the only deviations): the original returned straight bets x35 (34:1 net); it
//    paid a straight bet on 30 / 36 only when the bet on 2 was over $30 / $36 (typo'd checks
//    "bet2 > 30", "bet2 > 36"), i.e. practically never; and its 19-36 check (number >= 19) also
//    paid on 0 and 00 (the other outside bets already lost there). Here straight bets pay x36
//    (35:1 as the table says), 30 and 36 pay, and 0/00 lose every outside bet.
//  - Kept quirks: 11 is coloured black on the board but the wheel counts it as red (red bets win
//    on it and the result says "11, red!"); selecting "2-1 (1-34)" reads a misspelt variable, so
//    its Bet shows blank and the 0 chip then zeroes that column bet without refunding it.
(function () {
  'use strict';
  var SRPG = window.SRPG;
  var D = SRPG.draw;
  var ui = SRPG.ui;

  var FIX_STRAIGHT_PAYS_36 = true; // decided fix (original: x35)
  var FIX_PAY_30_36 = true; // decided fix (original: never paid straight bets on 30 and 36)
  var FIX_ZERO_LOSES_OUTSIDE = true; // decided fix (original: 19-36 paid on 0 and 00)

  // Wheel colours as the result code assigns them (ball y -22 = red, -10 = black): note 11.
  var RED = { 1: 1, 3: 1, 5: 1, 7: 1, 9: 1, 11: 1, 12: 1, 14: 1, 16: 1, 18: 1, 19: 1, 21: 1, 23: 1, 25: 1,
    27: 1, 30: 1, 32: 1, 34: 1, 36: 1 };
  // Board colours as printed on the table (standard: 11 is black).
  var BOARD_RED = { 1: 1, 3: 1, 5: 1, 7: 1, 9: 1, 12: 1, 14: 1, 16: 1, 18: 1, 19: 1, 21: 1, 23: 1, 25: 1,
    27: 1, 30: 1, 32: 1, 34: 1, 36: 1 };

  // --- board geometry (stage px, measured from the original) ----------------------------------
  var COLS = [[201.5, 223], [225, 246.5], [248.5, 271], [273, 295.5], [297, 318.5], [320.5, 344],
    [346, 368], [370, 391.5], [393.5, 416], [418, 440], [442, 464], [466, 487.5]];
  var ROWS = [[215.5, 254.5], [174.5, 213.5], [133, 172.5]]; // bottom (1,4..), middle, top (3,6..)
  var SPACES = [];
  var BYKEY = {};

  function addSpace(key, label, x0, y0, x1, y1, text, fill) {
    var sp = { key: key, label: label, x: x0, y: y0, w: x1 - x0, h: y1 - y0, text: text, fill: fill };
    SPACES.push(sp);
    BYKEY[key] = sp;
  }
  addSpace('00', '00', 176.5, 133, 198.5, 194, '00', '#044b4f');
  addSpace('0', '0', 176.5, 196, 198.5, 254.5, '0', '#044b4f');
  for (var c = 0; c < 12; c++) {
    for (var r = 0; r < 3; r++) {
      var n = c * 3 + r + 1;
      addSpace(String(n), String(n), COLS[c][0], ROWS[r][0], COLS[c][1], ROWS[r][1], String(n), BOARD_RED[n] ? '#df0504' : '#040404');
    }
  }
  addSpace('col1', '2-1 (1-34)', 491, 215.5, 511, 254.5, '2 to 1', '#044b4f');
  addSpace('col2', '2-1 (2-35)', 491, 174.5, 511, 213.5, '2 to 1', '#044b4f');
  addSpace('col3', '2-1 (3-36)', 491, 133, 511, 172.5, '2 to 1', '#044b4f');
  addSpace('1st12', '1st 12', 202.5, 258, 294.5, 276, '-1st 12-', '#03484d');
  addSpace('2nd12', '2nd 12', 297, 258, 391, 276, '-2nd 12-', '#03484d');
  addSpace('3rd12', '3rd 12', 393.5, 258, 487, 276, '-3rd 12-', '#03484d');
  addSpace('1_18', '1-18', 202.5, 278, 246, 296, '1 - 18', '#03484d');
  addSpace('even', 'Even', 248, 278, 294.5, 296, 'Even', '#03484d');
  addSpace('black', 'Black', 297, 278, 343.5, 296, '', '#03484d');
  addSpace('red', 'Red', 345.5, 278, 391, 296, '', '#03484d');
  addSpace('odd', 'Odd', 393.5, 278, 441, 296, 'Odd', '#03484d');
  addSpace('19_36', '19-36', 443, 278, 487, 296, '19 - 36', '#03484d');

  var CHIPS = [
    { v: 100, x: 148.95, y: 327.9, r: 19.45, need: 99, limit: 1901 },
    { v: 25, x: 103, y: 355.35, r: 19.45, need: 24, limit: 1976 },
    { v: 5, x: 145.6, y: 374.2, r: 19.45, need: 4, limit: 1996 },
    { v: 0, x: 64.45, y: 376.4, r: 13.6 },
  ];

  // The spinning ball's path (sprite "ball2", 41 frames): offsets from its start point, which sits
  // on the right of the wheel; frames 1-39 loop, frame 41 is the rest position after a spin.
  var BALL_PATH = [[0, 0], [-4.6, -17.15], [-10.95, -33.9], [-21.25, -48.3], [-31.75, -62.8], [-46.55, -72.5],
    [-61.2, -82], [-77.85, -88.15], [-95.25, -91.6], [-113, -92.05], [-129.15, -90.55], [-144.6, -85.2],
    [-159.65, -78.75], [-172.4, -68.25], [-184, -56.7], [-193.75, -43.7], [-201.35, -29.2], [-206.4, -13.6],
    [-212.45, 1.9], [-209.1, 19], [-207.2, 35.25], [-202.6, 51], [-195.35, 65.9], [-185.9, 79.4],
    [-174.6, 91.35], [-161.75, 101.55], [-147.35, 109.55], [-131.8, 115], [-115.55, 117.95], [-98.9, 117.05],
    [-82, 116.25], [-65.45, 111.2], [-48.5, 106.35], [-36.1, 93], [-24, 80.7], [-13.95, 66.75],
    [-6.35, 51.2], [-1.55, 34.55], [0.45, 17.3], [0, 0], [-209.1, 19]];
  var BALL2_ORIGIN = { x: 105.45, y: 215 - 10.5 };
  var WHEEL = { x: 0.45, y: 214.5 };
  var SPIN_TICKS = Math.ceil((6800 * SRPG.FPS) / 1000); // getTimer() - spinTime >= 6800 ms

  var t = null; // table state

  function S() { return SRPG.game.s; }

  function fresh() {
    return {
      activeSpace: 'None',
      activeBet: '', // '' | number | undefined (the col1 quirk)
      bet: 0,
      bets: {},
      result: '',
      spinning: false,
      spinT: 0,
      ball2: { f: 1, visible: false, playing: false },
      rotationNumber: 0,
      wheelRot: 0, // degrees, +2 every frame
      ball: { visible: true, x: 72.45, y: -23.5 }, // the resting ball, in wheel coordinates
      hover: null,
      press: null,
    };
  }

  function betOf(key) { return t.bets[key] || 0; }

  // --- rules -----------------------------------------------------------------------------------
  function selectSpace(sp) {
    t.activeSpace = sp.label;
    // The original's col1 handler reads "_root.col1" (unset) instead of betCol1.
    t.activeBet = sp.key === 'col1' ? undefined : betOf(sp.key);
    SRPG.sound.play('click');
  }

  function activeKey() {
    for (var i = 0; i < SPACES.length; i++) if (SPACES[i].label === t.activeSpace) return SPACES[i].key;
    return null;
  }

  function addChip(ch) {
    var s = S();
    if (ch.v === 0) return clearActive();
    if (!(s.cash > ch.need && t.bet < ch.limit && t.activeSpace !== 'None')) return;
    var key = activeKey();
    s.cash -= ch.v;
    t.bet += ch.v;
    t.bets[key] = betOf(key) + ch.v;
    t.activeBet = t.bets[key];
    SRPG.sound.play('chip');
  }

  // The 0 chip: give back the active space's bet.
  function clearActive() {
    var s = S();
    if (t.activeBet === '' || t.activeSpace === 'None') return;
    var back = typeof t.activeBet === 'number' ? t.activeBet : 0; // undefined adds as 0 (Flash 6)
    s.cash += back;
    t.bet -= back;
    t.bets[activeKey()] = 0;
    t.activeBet = 0;
    SRPG.sound.play('chip');
  }

  function clearAll() {
    var s = S();
    t.activeSpace = 'None';
    s.cash += t.bet;
    t.bet = 0;
    t.activeBet = '';
    t.bets = {};
    SRPG.sound.play('chip');
  }

  function spin() {
    if (t.spinning) return;
    SRPG.sound.play('roulette');
    SRPG.game.addKarma(-1);
    t.rotationNumber = 0;
    t.ball.visible = false;
    t.ball2.visible = true;
    t.ball2.playing = true;
    t.spinning = true;
    t.result = '';
    t.spinT = 0;
    build();
  }

  // Frame 41 of the ball: pick the number and pay everything.
  function settle() {
    var s = S();
    var rand = SRPG.rng.random(38);
    t.lastRand = rand;
    var total = 0;
    var num = rand < 36 ? rand + 1 : null; // 36 = "0", 37 = "00"
    var spun = rand === 36 ? '0' : rand === 37 ? '00' : String(num);
    var color = num === null ? 'green' : RED[num] ? 'red' : 'black';
    // the ball rests in a pocket of that colour on the wheel
    t.ball.x = color === 'green' ? -11 : -80;
    t.ball.y = color === 'green' ? -80 : color === 'red' ? -22 : -10;
    // straight bets
    var straight = betOf(spun);
    if (!FIX_PAY_30_36 && (spun === '30' || spun === '36')) straight = betOf('2') > Number(spun) ? straight : 0;
    if (straight > 0) total += straight;
    total *= FIX_STRAIGHT_PAYS_36 ? 36 : 35;
    // outside bets (1:1)
    var inside = num !== null;
    if (num !== null && num % 2 === 0) total += betOf('even') * 2;
    if (num !== null && num % 2 === 1) total += betOf('odd') * 2;
    if (color === 'red') total += betOf('red') * 2;
    if (color === 'black') total += betOf('black') * 2;
    if (rand + 1 < 19) total += betOf('1_18') * 2;
    if (!(rand + 1 < 19) && (inside || !FIX_ZERO_LOSES_OUTSIDE)) total += betOf('19_36') * 2;
    // columns and dozens (2:1)
    if (inside) {
      if (num % 3 === 1) total += betOf('col1') * 3;
      if (num % 3 === 2) total += betOf('col2') * 3;
      if (num % 3 === 0) total += betOf('col3') * 3;
      if (num <= 12) total += betOf('1st12') * 3;
      else if (num <= 24) total += betOf('2nd12') * 3;
      else total += betOf('3rd12') * 3;
    }
    t.result = spun + (color === 'green' ? '' : ', ' + color) + '!  Player gets $' + total + '.';
    t.bet = 0;
    s.cash += total;
    t.ball2.playing = false;
    t.ball.visible = true;
    t.spinning = false;
    t.activeSpace = 'None';
    t.activeBet = '';
    t.bets = {};
    t.spinT = 0;
    if (total > 0) SRPG.sound.play('chip');
    build();
  }

  function tick() {
    t.wheelRot = (t.wheelRot + 2) % 360;
    if (t.spinning) t.spinT += 1;
    var b2 = t.ball2;
    if (!b2.playing) return;
    b2.f = b2.f >= 41 ? 1 : b2.f + 1;
    if (b2.f === 10 && t.spinT >= SPIN_TICKS) {
      b2.f = 41;
      settle();
      return;
    }
    if (b2.f === 40 && !t.ball.visible) {
      t.rotationNumber += 1;
      b2.f = 1;
    }
  }

  function leave() {
    var s = S();
    if (t.spinning) return;
    s.cash += t.bet;
    t.bet = 0;
    SRPG.location.open('casino', { resume: true });
  }

  // --- drawing ---------------------------------------------------------------------------------
  var BOARD_FONT = '"Tempus Sans ITC", "Trebuchet MS", "Lucida Sans", "DejaVu Sans", sans-serif';

  function drawWheel(ctx) {
    // brown rim (static)
    D.circle(ctx, 0, 215, 121, '#64370c', '#000', 1.5);
    // the rotating pocket disc, as drawn in the original: 32 pockets of 11.25 degrees, two green
    // ones opposite each other (centred at 262.2 and 82.2 degrees, where the ball's green rest
    // spot is) and red/black alternating between them, black next to each green, so the ball's
    // red and black rest spots also sit in pockets of their colour
    ctx.save();
    ctx.translate(WHEEL.x, WHEEL.y);
    ctx.rotate((t.wheelRot * Math.PI) / 180);
    var w = (11.25 * Math.PI) / 180;
    var a0 = ((262.2 - 5.625) * Math.PI) / 180;
    for (var k = 0; k < 32; k++) {
      var col = k % 16 === 0 ? '#00ff00' : k % 2 ? '#000000' : '#ff0000';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 88, a0 + k * w, a0 + (k + 1) * w);
      ctx.closePath();
      ctx.fillStyle = col;
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 0, 64, 0, Math.PI * 2);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.stroke();
    D.circle(ctx, 0, 0, 88, null, '#000', 1);
    var hg = ctx.createRadialGradient(-3, -3, 1, 0, 0, 13);
    hg.addColorStop(0, '#fff7a0');
    hg.addColorStop(0.5, '#e8c800');
    hg.addColorStop(1, '#8a6a00');
    D.circle(ctx, 0, 0, 12.5, hg, '#5a4500', 1);
    if (t.ball.visible) ball(ctx, t.ball.x, t.ball.y);
    ctx.restore();
    if (t.ball2.visible && t.ball2.f <= 41) {
      var p = BALL_PATH[t.ball2.f - 1];
      ball(ctx, BALL2_ORIGIN.x + p[0], BALL2_ORIGIN.y + p[1]);
    }
  }

  function ball(ctx, x, y) {
    var g = ctx.createRadialGradient(x - 2, y - 2, 0.5, x, y, 6.5);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.6, '#d8d8d8');
    g.addColorStop(1, '#8a8a8a');
    D.circle(ctx, x, y, 6, g, '#333', 0.8);
  }

  function boardText(ctx, str, x, y, rot, size) {
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    ctx.font = size + 'px ' + BOARD_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(str, 0, 1);
    ctx.restore();
  }

  function drawBoard(ctx) {
    D.rect(ctx, 163.5, 123.5, 358, 179, '#014400');
    D.rect(ctx, 173, 130, 341.5, 128, '#fffffb');
    D.rect(ctx, 198.5, 254.5, 292.5, 45, '#fffffb');
    SPACES.forEach(function (sp) {
      D.rect(ctx, sp.x, sp.y, sp.w, sp.h, sp.fill);
      var cx = sp.x + sp.w / 2, cy = sp.y + sp.h / 2;
      if (sp.key === 'black' || sp.key === 'red') {
        D.rect(ctx, cx - 11.5, cy - 4.5, 23, 9, sp.key === 'red' ? '#df0504' : '#030303', '#fff', 1);
      } else if (sp.w < 30) {
        var size = sp.key.indexOf('col') === 0 ? 12 : 20;
        boardText(ctx, sp.text, cx, cy, -Math.PI / 2, size); // reads bottom to top
      } else {
        boardText(ctx, sp.text, cx, cy, 0, 12);
      }
      if (betOf(sp.key) !== 0) {
        // bet marker: a translucent yellow plate over the space (the original's ind* clips)
        ctx.fillStyle = 'rgba(255,255,0,0.7)';
        ctx.fillRect(sp.x - 1, sp.y - 1, sp.w + 2, sp.h + 2);
      }
    });
  }

  // Chip art (shared with blackjack): the chip buttons turn 5 degrees on hover, 25 when pressed.
  function chip(ctx, c) {
    var A = SRPG.casinoArt;
    var col = A.CHIP_COLORS[c.v];
    var rot = t.press === c.v ? 25 : t.hover === 'chip' + c.v ? 5 : 0;
    A.chip(ctx, { x: c.x, y: c.y, r: c.r, v: c.v, fill: col.fill, band: col.band, light: col.light, dark: col.dark }, rot);
  }

  // The rules text (paraphrased from the original's instructions; the odds are the table's).
  var RULES = [
    'Click any space on the table to pick your bet, then',
    'press the chips to add to it.  Hit the \'Spin\' button',
    'once you are set.  All bets together can\'t top $2000.',
    'A single number or zero pays 35 to 1, the bottom',
    'row pays even money, and all other bets pay 2 to 1.',
  ];

  function heavy(ctx, str, x, y, size, color, opts) {
    if (SRPG.casinoArt && SRPG.casinoArt.heavyText) SRPG.casinoArt.heavyText(ctx, str, x, y, size, color, opts);
    else D.text(ctx, str, x, y, { size: size, color: color, bold: true, align: opts && opts.align });
  }

  // The result line, centred in the grey box and word-wrapped to its width (spaces kept).
  function resultText(ctx, str) {
    ctx.save();
    ctx.font = '12px Arial, Helvetica, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#0033cc';
    var lines = [str];
    if (ctx.measureText(str).width > 145) {
      var cut = str.length;
      while (cut > 0 && (str.charAt(cut) !== ' ' || ctx.measureText(str.slice(0, cut)).width > 145)) cut--;
      lines = [str.slice(0, cut).replace(/\s+$/, ''), str.slice(cut).replace(/^\s+/, '')];
    }
    lines.forEach(function (l, i) { ctx.fillText(l, 83.7, 59.5 + i * 14); });
    ctx.restore();
  }

  function render(ctx) {
    var s = S();
    var g = ctx.createLinearGradient(0, 0, SRPG.W, SRPG.H);
    g.addColorStop(0, '#009900');
    g.addColorStop(1, '#006600');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SRPG.W, SRPG.H);
    // result box
    D.rect(ctx, 9, 45, 149, 38, '#cccccc', '#000', 1);
    if (t.result) resultText(ctx, t.result);
    RULES.forEach(function (line, i) { heavy(ctx, line, 181.05, 52.8 + i * 16.85, 12, '#000'); });
    drawBoard(ctx);
    drawWheel(ctx);
    CHIPS.forEach(function (c) { chip(ctx, c); });
    // CLEAR ALL BETS
    var cc = t.hover === 'clearall' ? '#aed7ff' : '#0033cc'; // the original's up and over colours
    heavy(ctx, 'CLEAR ALL', 181.5, 356, 14, cc);
    heavy(ctx, 'BETS', 181.5, 375.65, 14, cc);
    // active space box
    D.rect(ctx, 280, 316, 127.5, 79, '#b45a01', '#000', 1);
    D.rect(ctx, 289, 322.5, 109.5, 71, '#cccccc', '#000', 1);
    heavy(ctx, 'Active Space:', 298, 336.4, 12, '#000');
    D.text(ctx, t.activeSpace, 343.1, 358.9, { size: 12.5, align: 'center', color: '#000', font: 'Arial, Helvetica, sans-serif' });
    heavy(ctx, 'Bet: $', 294, 383.8, 12, '#000');
    var ab = t.activeBet === undefined || t.activeBet === '' ? '' : String(t.activeBet);
    D.text(ctx, ab, 337.1, 384.7, { size: 12.5, color: '#000', font: 'Arial, Helvetica, sans-serif' });
    SRPG.hud.draw(ctx, s, 'inside');
  }

  // --- DOM -------------------------------------------------------------------------------------
  function hotspot(x, y, w, h, id, onClick, round) {
    var e = ui.box(x, y, w, h, '');
    e.style.cursor = 'pointer';
    if (round) e.style.borderRadius = '50%';
    e.setAttribute('data-id', id);
    e.addEventListener('click', function (ev) { ev.stopPropagation(); onClick(); });
    return e;
  }

  function build() {
    ui.clear();
    t.hover = null; // the rebuilt hot spots start un-hovered
    t.press = null;
    SPACES.forEach(function (sp) {
      hotspot(sp.x, sp.y, sp.w, sp.h, 'sp-' + sp.key, function () { selectSpace(sp); });
    });
    CHIPS.forEach(function (c) {
      var h = hotspot(c.x - c.r, c.y - c.r, c.r * 2, c.r * 2, 'chip' + c.v, function () { addChip(c); }, true);
      h.addEventListener('mouseenter', function () { t.hover = 'chip' + c.v; });
      h.addEventListener('mouseleave', function () { t.hover = null; t.press = null; });
      h.addEventListener('mousedown', function () { t.press = c.v; });
      h.addEventListener('mouseup', function () { t.press = null; });
    });
    var ca = hotspot(180, 342, 88, 37, 'clearall', clearAll);
    ca.addEventListener('mouseenter', function () { t.hover = 'clearall'; });
    ca.addEventListener('mouseleave', function () { t.hover = null; });
    var sb = ui.iconButton(null, { icon: 'roulette', label: 'SPIN', x: 452.5, y: 318.5, w: 80, size: 35, id: 'spin', disabled: t.spinning }, function () {
      spin();
    });
    var lb = ui.iconButton(null, { icon: 'leave', label: '<span style="position:relative;top:2px">LEAVE</span>', x: 452.5, y: 363.5, w: 90, size: 35, id: 'leave', disabled: t.spinning }, function () {
      SRPG.sound.play('click');
      leave();
    });
    [[sb, 12], [lb, 10]].forEach(function (p) {
      var l = p[0].querySelector('.lbl');
      l.style.cssText += ';' + (SRPG.casinoArt && SRPG.casinoArt.heavyCss ? SRPG.casinoArt.heavyCss(p[1], '#003399') : 'font-size:' + p[1] + 'px');
      if (t.spinning) p[0].style.opacity = '0.5';
    });
  }

  SRPG.registerScreen('roulette', {
    enter: function () {
      t = fresh();
      SRPG.sound.music('inside');
      build();
    },
    exit: function () { t = null; },
    tick: function () { if (t) tick(); },
    render: function (ctx) {
      if (!t || !S()) return;
      render(ctx);
    },
  });

  // Test hooks: the table state and the space list.
  SRPG.roulette = {
    get state() { return t; },
    spaces: SPACES,
    SPIN_TICKS: SPIN_TICKS,
  };
})();
