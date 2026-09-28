// Blackjack (the original's root frame 42: sprite "BJ21"). Rules, from the code:
//  - Betting (clip frame 1): chips add $5 / $25 / $100 / $500 to BET when cash > 4 / 24 / 99 / 499;
//    the grey 0 chip returns the whole bet. LEAVE also returns the bet. There is no limit and DEAL
//    does not check for a bet (a $0 hand is allowed).
//  - DEAL decrements a "karma" variable that belongs to the blackjack clip, not the player's karma,
//    so blackjack has no karma cost (unlike slots and roulette). No time passes.
//  - Eight cards are drawn up front (value random(13)+1, suit random(4)+1, an endless deck):
//    cards 1-4 are the player's, 5-8 the dealer's. J/Q/K count 10, A counts 11.
//  - HIT ME! reveals card 3, then card 4; a fifth card never comes (the 4-card limit). After each
//    hit, while the hand is over 21 an ace (in card order) is turned into a 1. Over 21 = "BUST!".
//    The starting hand is never reduced, so A+A stands on 22.
//  - STAND: the dealer draws while under 17, at most two cards (cards 7 and 8), and only then turns
//    aces into 1s, so a soft 17 stands and a reduced hand never draws again. Result: dealer over 21
//    "DEALER BUST!" pays 2x the bet; else a higher dealer hand is "DEALER WIN"; equal hands "PUSH"
//    return the bet; a lower dealer hand "PLAYER WIN" pays 2x. There are no naturals (a blackjack
//    pays like any win). The checks run in sequence, so a 22 vs a busted 22 pays 2x then 1x more.
//  - OK goes back to betting with BET reset to 0.
(function () {
  'use strict';
  var SRPG = window.SRPG;
  var D = SRPG.draw;
  var ui = SRPG.ui;

  // Chip buttons (stage centre, radius, the original's "cash > n" check); colours from casinoArt.
  var CHIPS = [
    { v: 25, x: 55.4, y: 217.6, r: 19.45, need: 24 },
    { v: 100, x: 101.4, y: 200.15, r: 19.45, need: 99 },
    { v: 500, x: 132.25, y: 240.65, r: 19.45, need: 499 },
    { v: 5, x: 84, y: 257.45, r: 19.45, need: 4 },
    { v: 0, x: 33.85, y: 262.65, r: 13.6 },
  ];
  // Card slots (stage position, rotation in degrees), from the original's layout: 1-4 player,
  // 5-8 dealer; card 10 is the face-down cover over the dealer's second card.
  var SLOTS = [
    { x: 278.3, y: 329.2, r: -25.2 }, { x: 309.8, y: 319.85, r: -20.4 },
    { x: 341.05, y: 311.6, r: -14.8 }, { x: 374.75, y: 307.15, r: -14.8 },
    { x: 178.7, y: 122.75, r: -26.9 }, { x: 206.5, y: 110, r: -21.8 },
    { x: 242.65, y: 99.15, r: -17 }, { x: 272.85, y: 94.25, r: -12.4 },
  ];
  var CARD_SCALE = 0.75;
  var DECK = { x: 455.2, y: 99.4, r: 40.1, s: 0.745 };
  var NAMES = [null, 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

  var b = null; // table state
  var forced = null; // test hook: the next deal's cards [[value 1-13, suit 1-4] x8]

  function S() { return SRPG.game.s; }

  function fresh() {
    return { phase: 'bet', bet: 0, text: '', hover: null, press: null };
  }

  // --- rules -----------------------------------------------------------------------------------
  function addChip(c) {
    var s = S();
    if (b.phase !== 'bet') return;
    if (c.v === 0) { // the grey chip gives the bet back
      s.cash += b.bet;
      b.bet = 0;
      SRPG.sound.play('chip');
      return;
    }
    if (!(s.cash > c.need)) return; // the original's "cash > n - 1" check; nothing happens
    s.cash -= c.v;
    b.bet += c.v;
    SRPG.sound.play('chip');
  }

  function deal() {
    var rnd = SRPG.rng.random;
    if (b.phase !== 'bet') return;
    // (the original's DEAL does "karma = karma - 1" on the blackjack clip itself: no effect)
    b.phase = 'deal';
    b.text = '';
    b.ok = false;
    b.buttons = true; // HIT ME! and STAND
    b.show = { 3: false, 4: false, 7: false, 8: false, 10: true };
    b.cardn = [];
    b.cardv = [];
    b.cards = [];
    for (var i = 0; i < 8; i++) {
      var n = forced ? forced[i][0] : rnd(13) + 1;
      var suit = forced ? forced[i][1] : rnd(4) + 1;
      b.cardv.push(NAMES[n]);
      b.cards.push(suit); // 1 club, 2 spade, 3 heart, 4 diamond
      b.cardn.push(n >= 11 ? 10 : n === 1 ? 11 : n);
    }
    forced = null;
    b.pcards = 2;
    b.phand = b.cardn[0] + b.cardn[1];
    b.dcards = 2;
    b.dhand = b.cardn[4] + b.cardn[5];
    SRPG.sound.play('cards');
    build();
  }

  function sum(from, count) {
    var t = 0;
    for (var i = from; i < from + count; i++) t += b.cardn[i];
    return t;
  }

  function hit() {
    if (b.phase !== 'deal' || !b.buttons) return;
    var had = b.pcards;
    if (b.pcards === 3) { b.show[4] = true; b.phand += b.cardn[b.pcards]; b.pcards += 1; }
    if (b.pcards === 2) { b.show[3] = true; b.phand += b.cardn[b.pcards]; b.pcards += 1; }
    for (var i = 0; i < b.pcards; i++) {
      if (b.phand > 21 && b.cardn[i] === 11) {
        b.cardn[i] = 1;
        b.phand = sum(0, b.pcards);
      }
    }
    if (b.pcards !== had) SRPG.sound.play('cards'); // at the 4-card limit the button does nothing
    if (b.phand > 21) {
      b.text = 'BUST!';
      b.show[10] = false;
      b.buttons = false;
      b.ok = true;
    }
    build();
  }

  function stand() {
    var s = S();
    if (b.phase !== 'deal' || !b.buttons) return;
    b.buttons = false;
    b.show[10] = false;
    if (b.dhand < 17) { b.show[7] = true; b.dhand += b.cardn[6]; b.dcards += 1; }
    if (b.dhand < 17) { b.show[8] = true; b.dhand += b.cardn[7]; b.dcards += 1; }
    for (var i = 4; i < b.dcards + 4; i++) {
      if (b.dhand > 21 && b.cardn[i] === 11) {
        b.cardn[i] = 1;
        b.dhand = sum(4, b.dcards);
      }
    }
    if (b.dhand > 21) {
      b.text = 'DEALER BUST!';
      s.cash += b.bet * 2;
    } else if (b.dhand > b.phand) {
      b.text = 'DEALER WIN';
    }
    if (b.dhand === b.phand) {
      b.text = 'PUSH';
      s.cash += b.bet;
    }
    if (b.dhand < b.phand) {
      b.text = 'PLAYER WIN';
      s.cash += b.bet * 2;
    }
    SRPG.sound.play('cards');
    b.ok = true;
    build();
  }

  function ok() {
    if (b.phase !== 'deal' || !b.ok) return;
    b.phase = 'bet';
    b.bet = 0;
    b.text = '';
    build();
  }

  function leave() {
    var s = S();
    if (b.phase !== 'bet') return;
    s.cash += b.bet;
    b.bet = 0;
    // Back to root frame 40 (gotoAndStop(40)), whose script replays the black clip.
    SRPG.location.open('casino', { resume: true, fade: true });
  }

  // --- drawing ---------------------------------------------------------------------------------
  function suitPath(ctx, suit) {
    // drawn in a box about 16 x 22 centred on (0, 0)
    ctx.beginPath();
    if (suit === 3) { // heart
      ctx.moveTo(0, 9.5);
      ctx.bezierCurveTo(-3, 4, -8, 0, -8, -4.5);
      ctx.bezierCurveTo(-8, -9, -2.5, -11, 0, -6);
      ctx.bezierCurveTo(2.5, -11, 8, -9, 8, -4.5);
      ctx.bezierCurveTo(8, 0, 3, 4, 0, 9.5);
    } else if (suit === 4) { // diamond
      ctx.moveTo(0, -10.5);
      ctx.quadraticCurveTo(4, -4, 8.5, 0.5);
      ctx.quadraticCurveTo(4, 5, 0, 11);
      ctx.quadraticCurveTo(-4, 5, -8.5, 0.5);
      ctx.quadraticCurveTo(-4, -4, 0, -10.5);
    } else if (suit === 2) { // spade
      ctx.moveTo(0, -10.5);
      ctx.bezierCurveTo(3, -5, 7.5, -2, 7.5, 2.5);
      ctx.bezierCurveTo(7.5, 6.5, 2.5, 7.5, 0.8, 4);
      ctx.quadraticCurveTo(1.5, 8, 4, 10.5);
      ctx.lineTo(-4, 10.5);
      ctx.quadraticCurveTo(-1.5, 8, -0.8, 4);
      ctx.bezierCurveTo(-2.5, 7.5, -7.5, 6.5, -7.5, 2.5);
      ctx.bezierCurveTo(-7.5, -2, -3, -5, 0, -10.5);
    } else { // club
      ctx.arc(0, -5.5, 4.6, 0, Math.PI * 2);
      ctx.moveTo(-3.6 + 4.6, 2);
      ctx.arc(-3.6, 2, 4.6, 0, Math.PI * 2);
      ctx.moveTo(3.6 + 4.6, 2);
      ctx.arc(3.6, 2, 4.6, 0, Math.PI * 2);
      ctx.moveTo(-1, 2);
      ctx.quadraticCurveTo(-0.5, 7.5, -3.5, 10.5);
      ctx.lineTo(3.5, 10.5);
      ctx.quadraticCurveTo(0.5, 7.5, 1, 2);
      ctx.closePath();
    }
  }

  function cardShape(ctx) { D.roundRect(ctx, -45.4, -72, 90.9, 144, 7); }

  function cardFace(ctx, value, suit) {
    var red = suit === 3 || suit === 4;
    ctx.save();
    ctx.translate(2.2, 2.2);
    cardShape(ctx);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill();
    ctx.restore();
    cardShape(ctx);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = '#555';
    ctx.stroke();
    for (var k = 0; k < 2; k++) {
      ctx.save();
      if (k) ctx.rotate(Math.PI);
      ctx.fillStyle = '#000'; // the value field is black on every card; only the pip is red
      ctx.font = '27px "Times New Roman", Times, "Liberation Serif", serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      if (value === '10') {
        ctx.save();
        ctx.translate(-38, -45);
        ctx.scale(0.8, 1);
        ctx.fillText(value, 0, 0);
        ctx.restore();
      } else ctx.fillText(value, -37, -45);
      ctx.translate(-30.5, -29);
      suitPath(ctx, suit);
      ctx.fillStyle = red ? '#cc0000' : '#000';
      ctx.fill();
      ctx.restore();
    }
  }

  // The card back (measured from the original in card space): a black card with a rounded blue
  // panel, white arrowheads at both ends, and in the middle a striped tunnel (white end bars, a
  // black frame, a thin black ring and a white core) under a black-and-white checkered hourglass.
  function cardBack(ctx, shadow) {
    if (shadow) {
      ctx.save();
      ctx.translate(2.2, 2.2);
      cardShape(ctx);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fill();
      ctx.restore();
    }
    var ink = '#0d2a80';
    cardShape(ctx);
    ctx.fillStyle = '#050505';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#444';
    ctx.stroke();
    D.roundRect(ctx, -35.6, -57.2, 71.2, 114.4, 4, '#6699ff', ink, 0.8);
    D.poly(ctx, [-19, -55, 19, -55, 0, -46.5], '#fff', '#3366cc', 0.8);
    D.poly(ctx, [-19, 55, 19, 55, 0, 46.5], '#fff', '#3366cc', 0.8);
    // tunnel
    D.rect(ctx, -31, -37.5, 62, 4.5, '#fff', ink, 0.7);
    D.rect(ctx, -31, 33, 62, 4.5, '#fff', ink, 0.7);
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.rect(-25, -26.5, 50, 53);
    ctx.rect(-19, -21, 38, 42);
    ctx.fill('evenodd');
    ctx.beginPath();
    ctx.rect(-13.6, -15.2, 27.2, 30.4);
    ctx.rect(-11.6, -13.2, 23.2, 26.4);
    ctx.fill('evenodd');
    D.rect(ctx, -11.6, -13.2, 23.2, 26.4, '#fff');
    ctx.strokeStyle = ink;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    [[-31, -33], [31, -33], [-31, 33], [31, 33], [-25, -26.5], [25, -26.5], [-25, 26.5], [25, 26.5]].forEach(function (p) {
      ctx.moveTo(p[0], p[1]);
      ctx.lineTo(0, 0);
    });
    ctx.stroke();
    // checkered hourglass (squares 4.7 x 5.6)
    [-1, 1].forEach(function (dir) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(-18.2, 37.5 * dir);
      ctx.lineTo(18.2, 37.5 * dir);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = '#000';
      for (var row = 0; row < 7; row++) {
        for (var col = -5; col <= 5; col++) {
          if (((row + col) & 1) === 0) continue;
          var y = dir < 0 ? -37.5 + row * 5.6 : 37.5 - (row + 1) * 5.6;
          ctx.fillRect(-3.1 + col * 4.7, y, 4.7, 5.6);
        }
      }
      ctx.restore();
      ctx.strokeStyle = ink;
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.restore();
    });
  }

  function place(ctx, x, y, rot, scale, fn) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.scale(scale, scale);
    fn(ctx);
    ctx.restore();
  }

  function drawCard(ctx, i) {
    var sl = SLOTS[i];
    place(ctx, sl.x, sl.y, sl.r, CARD_SCALE, function (c) { cardFace(c, b.cardv[i], b.cards[i]); });
  }

  function heavy(ctx, str, x, y, size, color, opts) {
    if (SRPG.casinoArt && SRPG.casinoArt.heavyText) SRPG.casinoArt.heavyText(ctx, str, x, y, size, color, opts);
    else D.text(ctx, str, x, y, { size: size, color: color, bold: true, align: opts && opts.align });
  }

  // Chip art (shared with roulette): rot = the chip button's hover (5) / press (25) turn.
  function chip(ctx, c, rot) {
    var A = SRPG.casinoArt;
    var col = A.CHIP_COLORS[c.v];
    A.chip(ctx, { x: c.x, y: c.y, r: c.r, v: c.v, fill: col.fill, band: col.band, light: col.light, dark: col.dark }, rot);
  }

  function chipTurn(c) {
    if (b.phase !== 'bet') return 0; // during a hand the chips are plain pictures
    return b.press === c.v ? 25 : b.hover === c.v ? 5 : 0;
  }

  function render(ctx) {
    var g = ctx.createLinearGradient(0, 0, SRPG.W, SRPG.H);
    g.addColorStop(0, '#009900');
    g.addColorStop(1, '#006600');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SRPG.W, SRPG.H);
    CHIPS.forEach(function (c) { chip(ctx, c, chipTurn(c)); });
    heavy(ctx, 'BET: $', 24.2, 319, 20, '#000');
    heavy(ctx, String(b.bet), 95, 319, 20, '#000');
    if (b.phase === 'deal') {
      // player's cards (1-4), then the dealer's (5, 6 under the cover, 7, 8)
      drawCard(ctx, 0);
      drawCard(ctx, 1);
      if (b.show[3]) drawCard(ctx, 2);
      if (b.show[4]) drawCard(ctx, 3);
      drawCard(ctx, 4);
      drawCard(ctx, 5);
      if (b.show[10]) place(ctx, 207.05, 109.85, -21.8, CARD_SCALE, function (c) { cardBack(c, false); });
      if (b.show[7]) drawCard(ctx, 6);
      if (b.show[8]) drawCard(ctx, 7);
      if (b.text) {
        heavy(ctx, b.text, 292.8, 220.5, 30, '#000', { align: 'center' });
      }
    }
    place(ctx, DECK.x, DECK.y, DECK.r, DECK.s, function (c) { cardBack(c, true); });
    SRPG.hud.draw(ctx, S(), 'inside');
  }

  // --- DOM buttons -----------------------------------------------------------------------------
  function tileIcon(btn, draw) {
    var tile = btn.querySelector('.ico');
    var c = document.createElement('canvas');
    c.width = 105;
    c.height = 105;
    c.style.cssText = 'width:35px;height:35px;display:block';
    var cx = c.getContext('2d');
    cx.scale(3, 3);
    draw(cx);
    tile.appendChild(c);
  }

  // Button labels: 12 px Arial Black at the buttons' 0.75 scale.
  function labelCss(color, size) {
    size = size || 9;
    return SRPG.casinoArt && SRPG.casinoArt.heavyCss ? SRPG.casinoArt.heavyCss(size, color) : 'font-size:' + size + 'px;color:' + color;
  }

  // Icon button whose label only shows while the pointer is over it (as the original's DEAL,
  // HIT ME! and STAND buttons).
  function hoverButton(x, y, label, id, draw, onClick) {
    var btn = ui.iconButton(null, { label: label, x: x, y: y, w: 100, size: 35, id: id }, onClick);
    var lbl = btn.querySelector('.lbl');
    lbl.style.visibility = 'hidden';
    lbl.style.cssText += ';' + labelCss('#95caff');
    btn.addEventListener('mouseenter', function () { lbl.style.visibility = 'visible'; });
    btn.addEventListener('mouseleave', function () { lbl.style.visibility = 'hidden'; });
    tileIcon(btn, draw);
    return btn;
  }

  function deckIcon(c) {
    c.save();
    c.translate(17.5, 17.5);
    c.rotate(0.35);
    c.scale(0.17, 0.17);
    c.fillStyle = '#bbb';
    c.fillRect(-40, -60, 100, 140);
    c.fillStyle = '#888';
    c.fillRect(-35, 66, 95, 12);
    cardBack(c, false);
    c.restore();
  }

  function handIcon(c) {
    c.save();
    c.translate(17.5, 18);
    c.rotate(-0.3);
    c.beginPath();
    c.moveTo(-6, 12);
    c.lineTo(-9, -6);
    c.lineTo(-6, -7);
    c.lineTo(-3, 2);
    c.lineTo(-4, -12);
    c.lineTo(-1, -12.5);
    c.lineTo(1, 0);
    c.lineTo(2, -13);
    c.lineTo(5, -12.5);
    c.lineTo(5, 0);
    c.lineTo(7, -10);
    c.lineTo(10, -9);
    c.lineTo(8, 3);
    c.lineTo(12, 1);
    c.lineTo(13, 3);
    c.lineTo(6, 12);
    c.closePath();
    c.fillStyle = '#00ccff';
    c.fill();
    c.strokeStyle = '#1a3a99';
    c.lineWidth = 1.1;
    c.lineJoin = 'round';
    c.stroke();
    c.restore();
  }

  function squareIcon(c) {
    D.rect(c, 8, 8, 19, 19, '#00ccff', '#1a3a99', 1.2);
  }

  function hotspot(x, y, w, h, id, onClick) {
    var e = ui.box(x, y, w, h, '');
    e.style.cursor = 'pointer';
    e.style.borderRadius = '50%';
    e.setAttribute('data-id', id);
    e.addEventListener('click', function (ev) { ev.stopPropagation(); onClick(); });
    return e;
  }

  function build() {
    ui.clear();
    b.hover = null;
    b.press = null;
    if (b.phase === 'bet') {
      CHIPS.forEach(function (c) {
        var h = hotspot(c.x - c.r, c.y - c.r, c.r * 2, c.r * 2, 'chip' + c.v, function () { addChip(c); });
        h.addEventListener('mouseenter', function () { b.hover = c.v; });
        h.addEventListener('mouseleave', function () { b.hover = null; b.press = null; });
        h.addEventListener('mousedown', function () { b.press = c.v; });
        h.addEventListener('mouseup', function () { b.press = null; });
      });
      hoverButton(22.5, 347.5, 'DEAL', 'deal', deckIcon, function () { deal(); });
      ui.iconButton(null, { icon: 'leave', label: '<span style="position:relative;top:2px;' + labelCss('#003399', 10) + '">LEAVE</span>', x: 458.5, y: 346.5, w: 80, size: 35, id: 'leave' }, function () {
        leave();
      });
    } else {
      if (b.buttons) {
        hoverButton(22.5, 348.5, 'HIT ME!', 'hit', handIcon, function () { hit(); });
        hoverButton(114, 348.5, 'STAND', 'stand', squareIcon, function () { stand(); });
      }
      if (b.ok) {
        var okb = ui.button(null, 'OK', function () {
          ok();
        }, { x: 460.5, y: 356, w: 68, id: 'ok' });
        okb.style.cssText += ';height:24px;padding:0;line-height:22px;font-size:10px;border-radius:9px;' +
          'background:#3399ff;border:1px solid #2a70cc;color:#003399';
        okb.addEventListener('mouseenter', function () { okb.style.background = '#99ccff'; okb.style.color = '#ddeeff'; });
        okb.addEventListener('mouseleave', function () { okb.style.background = '#3399ff'; okb.style.color = '#003399'; });
      }
    }
  }

  SRPG.registerScreen('blackjack', {
    enter: function () {
      b = fresh();
      SRPG.sound.music('inside');
      build();
    },
    exit: function () { b = null; },
    render: function (ctx) {
      if (!b || !S()) return;
      render(ctx);
    },
  });

  // Test hooks: the table state, and forcing the next deal's eight cards ([value 1-13, suit 1-4]).
  SRPG.blackjack = {
    get state() { return b; },
    force: function (cards) { forced = cards; },
  };
})();
