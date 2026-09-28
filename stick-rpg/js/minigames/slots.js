// SUPER SLOTS 3000 (the original's root frame 41: sprite "slotmachine"). Rules, from the code:
//  - BET is picked with the 5 / 25 / 100 buttons (the machine starts on $5). They are locked while
//    the reels spin.
//  - Pulling the handle needs cash >= bet: it takes the bet, costs 1 karma, plays the handle sound
//    and runs the machine's 55-frame timeline: reel 1/2/3 start on frames 3/9/15; the reel sounds
//    play on frames 23/31/39; the symbols are drawn with random(3)+1 on frames 31/39/46 (each reel
//    keeps spinning until it reaches that symbol); frame 47 pays; frame 55 unlocks the bet buttons.
//  - Symbols: 1 = dollar sign, 2 = cherries, 3 = dead face. Only three of a kind pays:
//    $$$ = bet x15, cherries x3 = bet x5, dead faces x3 = bet x2 (the whole payout is added to
//    cash, the stake was already taken). WINNINGS shows the last spin's payout.
//  - No time passes. LEAVE works at any moment (a spin in progress is simply abandoned).
//  - Look quirk kept: reel 2's "$" frame has no symbol art, so the middle drum is blank at the
//    start and whenever it stops on a dollar sign (a paying $$$ reads "$ _ $").
(function () {
  'use strict';
  var SRPG = window.SRPG;
  var D = SRPG.draw;
  var ui = SRPG.ui;

  var P = 38.75; // symbol pitch on the reel strip (stage px)
  var REELS = [{ x: 177.4, y: 189 }, { x: 226.2, y: 189.3 }, { x: 274, y: 189.8 }];
  var REEL_W = 42.5, REEL_H = 87.5;
  var BETS = [5, 25, 100];
  var BET_BOX = [
    { x: 187.5, y: 276.5, w: 31, h: 31 },
    { x: 226, y: 276.5, w: 34, h: 32 },
    { x: 265, y: 276.5, w: 35, h: 32 },
  ];

  var m = null; // machine state

  function S() { return SRPG.game.s; }

  function fresh() {
    return {
      sel: 0, // bet selector frame (0 = $5, 1 = $25, 2 = $100)
      bet: 5,
      betlock: 0,
      mf: 2, // machine timeline frame; 2 = idle (stopped)
      playing: false,
      reels: [{ f: 1, playing: false }, { f: 1, playing: false }, { f: 1, playing: false }],
      sym: [0, 0, 0],
      textwin: 0,
      winLoops: 0,
      winWait: 0,
    };
  }

  // gotoFrame(1): the machine's frame-2 script (stop, unlock bets, clear the symbols).
  function frame2() {
    m.mf = 2;
    m.betlock = 0;
    m.sym = [0, 0, 0];
  }

  // Frame scripts of the machine timeline.
  function runMachineFrame(f) {
    var s = S();
    var rnd = SRPG.rng.random;
    if (f === 3) { m.reels[0].playing = true; m.betlock = 1; }
    else if (f === 9) m.reels[1].playing = true;
    else if (f === 15) m.reels[2].playing = true;
    else if (f === 23) SRPG.sound.play('reel'); // "firstReel"
    else if (f === 31) { m.sym[0] = rnd(3) + 1; SRPG.sound.play('reel'); } // "thirdReel"
    else if (f === 39) { m.sym[1] = rnd(3) + 1; SRPG.sound.play('reel'); } // "secondReel"
    else if (f === 46) m.sym[2] = rnd(3) + 1;
    else if (f === 47) {
      var cash = 0, cherry = 0, dead = 0;
      m.sym.forEach(function (v) {
        if (v === 1) cash++;
        if (v === 2) cherry++;
        if (v === 3) dead++;
      });
      m.textwin = 0;
      if (cherry === 3) m.textwin = m.bet * 5;
      if (cash === 3) m.textwin = m.bet * 15;
      if (dead === 3) m.textwin = m.bet * 2;
      s.cash += m.textwin;
      if (m.textwin > 0) { SRPG.sound.play('win'); m.winLoops = 2; m.winWait = 20; } // start(0.1, 3)
    } else if (f === 55) {
      frame2();
      m.playing = false;
    }
  }

  // Each reel is a 6-frame loop; it stops on frame 1 / 3 / 5 when its symbol is 1 / 2 / 3.
  function tickReel(r, sym) {
    if (!r.playing) return;
    r.f = (r.f % 6) + 1;
    if ((r.f === 1 && sym === 1) || (r.f === 3 && sym === 2) || (r.f === 5 && sym === 3)) r.playing = false;
  }

  function pull() {
    var s = S();
    if (m.playing || m.mf !== 2) return; // the handle is only a button while the machine idles
    if (s.cash < m.bet) return; // the original simply ignores the pull
    s.cash -= m.bet;
    SRPG.game.addKarma(-1);
    SRPG.sound.play('handle');
    frame2();
    m.playing = true;
  }

  function pickBet(i) {
    if (m.betlock !== 0 || m.sel === i) return;
    m.sel = i;
    m.bet = BETS[i];
    SRPG.sound.play('click');
  }

  // --- drawing ---------------------------------------------------------------------------------
  var impact = null;
  function hasImpact() {
    if (impact === null) {
      var c = document.createElement('canvas').getContext('2d');
      c.font = '40px monospace';
      var w = c.measureText('SUPER SLOTS 3000').width;
      c.font = '40px Impact, monospace';
      impact = c.measureText('SUPER SLOTS 3000').width !== w;
    }
    return impact;
  }

  // Impact text (the machine's lettering), squeezed to maxW if given. Without Impact installed,
  // bold Arial is narrowed and outlined in its own colour.
  function impactText(ctx, str, x, y, size, color, maxW, align) {
    var real = hasImpact();
    ctx.save();
    ctx.font = (real ? '' : 'bold ') + size + 'px ' + (real ? 'Impact' : 'Arial, Helvetica, sans-serif');
    var sx = real ? 1 : 0.82;
    var tw = ctx.measureText(str).width * sx;
    if (maxW && tw > maxW) { sx *= maxW / tw; tw = maxW; }
    ctx.translate(align === 'center' ? x - tw / 2 : x, y);
    ctx.scale(sx, 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    if (!real) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = size * 0.09;
      ctx.strokeStyle = color;
      ctx.strokeText(str, 0, 0);
    }
    ctx.fillStyle = color;
    ctx.fillText(str, 0, 0);
    ctx.restore();
  }

  function heavy(ctx, str, x, y, size, color, opts) {
    if (SRPG.casinoArt && SRPG.casinoArt.heavyText) SRPG.casinoArt.heavyText(ctx, str, x, y, size, color, opts);
    else D.text(ctx, str, x, y, { size: size, color: color, bold: true });
  }

  function poly(ctx, pts, fill, stroke, lw) { D.poly(ctx, pts, fill, stroke, lw || 1); }

  // The dollar sign: a heavy black-outlined S with a yellow-to-orange sheen and two thin bars
  // through it that poke out above and below.
  function dollar(ctx, x, y) {
    var real = SRPG.casinoArt && SRPG.casinoArt.hasArialBlack && SRPG.casinoArt.hasArialBlack();
    var g = ctx.createLinearGradient(-12, -16, 12, 16); // in the letter's own (translated) space
    g.addColorStop(0, '#ffff00');
    g.addColorStop(1, '#ff8800');
    ctx.save();
    ctx.translate(x, y + 1.5);
    if (!real) ctx.scale(1.12, 1); // bold Arial widened towards Arial Black
    ctx.font = (real ? '' : 'bold ') + '38px ' + (real ? '"Arial Black"' : 'Arial, Helvetica, sans-serif');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#000';
    ctx.strokeText('S', 0, 0);
    if (!real) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = g;
      ctx.strokeText('S', 0, 0);
    }
    ctx.fillStyle = g;
    ctx.fillText('S', 0, 0);
    ctx.restore();
    var bg = ctx.createLinearGradient(x - 12, y - 16, x + 12, y + 16);
    bg.addColorStop(0, '#ffff00');
    bg.addColorStop(1, '#ff8800');
    ctx.save();
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = '#000';
    [-2.8, 1.2].forEach(function (bx) {
      ctx.fillStyle = bg;
      ctx.fillRect(x + bx, y - 17.5, 1.6, 35);
      ctx.strokeRect(x + bx, y - 17.5, 1.6, 35);
    });
    ctx.restore();
  }

  function cherries(ctx, x, y) {
    ctx.save();
    // stems joined at the top, with a small leaf
    ctx.strokeStyle = '#1d7a12';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - 6.5, y - 1);
    ctx.quadraticCurveTo(x - 1, y - 15, x + 6.5, y - 22);
    ctx.moveTo(x + 5, y + 4);
    ctx.quadraticCurveTo(x + 4, y - 10, x + 6.5, y - 22);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 6.5, y - 22);
    ctx.quadraticCurveTo(x + 3, y - 14, x + 1, y - 9);
    ctx.quadraticCurveTo(x + 7, y - 13, x + 6.5, y - 22);
    ctx.fillStyle = '#2e9a1e';
    ctx.fill();
    [[x - 6.5, y + 1.5], [x + 5, y + 5.5]].forEach(function (c) {
      var g = ctx.createRadialGradient(c[0] - 3, c[1] - 3, 1, c[0], c[1], 9.5);
      g.addColorStop(0, '#ff5a5a');
      g.addColorStop(0.45, '#e00000');
      g.addColorStop(1, '#7a0000');
      D.circle(ctx, c[0], c[1], 9, g, '#200000', 1);
    });
    ctx.restore();
  }

  function deadFace(ctx, x, y) {
    ctx.save();
    var g = ctx.createRadialGradient(x - 4, y - 5, 2, x, y, 15);
    g.addColorStop(0, '#9be39b');
    g.addColorStop(0.6, '#55b855');
    g.addColorStop(1, '#2a7a2a');
    D.circle(ctx, x, y, 14.5, g, '#0d3d0d', 1.5);
    ctx.strokeStyle = '#1a5a1a';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    [[x - 5.5, y - 4], [x + 5.5, y - 4]].forEach(function (e) {
      ctx.moveTo(e[0] - 3, e[1] - 3); ctx.lineTo(e[0] + 3, e[1] + 3);
      ctx.moveTo(e[0] + 3, e[1] - 3); ctx.lineTo(e[0] - 3, e[1] + 3);
    });
    ctx.moveTo(x - 7, y + 5);
    ctx.quadraticCurveTo(x - 2, y + 2, x + 1, y + 5);
    ctx.quadraticCurveTo(x + 4, y + 8, x + 7, y + 4);
    ctx.stroke();
    // tongue out
    ctx.beginPath();
    ctx.moveTo(x - 1, y + 5);
    ctx.quadraticCurveTo(x + 1, y + 11, x + 4, y + 6.5);
    ctx.stroke();
    ctx.restore();
  }

  var SYMBOL_DRAW = [dollar, cherries, deadFace]; // strip order: $, cherries above it, dead above that

  function drawReel(ctx, r, i) {
    var c = REELS[i];
    var x0 = c.x - REEL_W / 2, y0 = c.y - REEL_H / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, REEL_W, REEL_H);
    ctx.clip();
    ctx.fillStyle = '#fff';
    ctx.fillRect(x0, y0, REEL_W, REEL_H);
    var off = (r.f - 1) * (P / 2); // the strip moves down half a symbol per frame
    // The original's middle reel has no strip art on its frame 1 (the "$" stop), so it shows an
    // empty white drum there: at the start and whenever reel 2 lands on a dollar sign.
    var blank = i === 1 && r.f === 1;
    for (var k = -3; k <= 3 && !blank; k++) {
      var y = c.y + k * P + off;
      if (y < y0 - P || y > y0 + REEL_H + P) continue;
      var idx = ((-k % 3) + 3) % 3;
      SYMBOL_DRAW[idx](ctx, c.x, y);
    }
    // cylinder shading: ten stepped black bands (the original's stacked translucent strips) darken
    // the top and bottom quarter of the drum, opaque at the rim (levels measured from the original)
    var g = ctx.createLinearGradient(0, y0, 0, y0 + REEL_H);
    var steps = [1, 0.9, 0.8, 0.7, 0.6, 0.52, 0.45, 0.32, 0.25, 0.18];
    steps.forEach(function (a, k) {
      var c = 'rgba(0,0,0,' + a + ')';
      g.addColorStop(k * 0.024, c);
      g.addColorStop(k * 0.024 + 0.0239, c);
      g.addColorStop(1 - k * 0.024 - 0.0239, c);
      g.addColorStop(1 - k * 0.024, c);
    });
    g.addColorStop(0.241, 'rgba(0,0,0,0)');
    g.addColorStop(0.759, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, REEL_W, REEL_H);
    ctx.restore();
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, REEL_W - 1, REEL_H - 1);
  }

  function betButton(ctx, i, selected) {
    var b = BET_BOX[i];
    var label = String(BETS[i]);
    if (selected) {
      // pressed in: a flat, lighter face
      D.rect(ctx, b.x, b.y, b.w, b.h, '#bbbb00');
      D.line(ctx, b.x, b.y + 0.5, b.x + b.w, b.y + 0.5, '#e8e84a', 1);
      D.line(ctx, b.x + 0.5, b.y, b.x + 0.5, b.y + b.h, '#e8e84a', 1);
      D.line(ctx, b.x, b.y + b.h - 0.5, b.x + b.w, b.y + b.h - 0.5, '#8a8a00', 1);
    } else {
      // raised block: lit top and left bevels, olive face
      poly(ctx, [b.x + 3, b.y, b.x + b.w, b.y, b.x + b.w, b.y + 3, b.x + 3, b.y + 3], '#ecec00');
      poly(ctx, [b.x, b.y + 2, b.x + 3, b.y, b.x + 3, b.y + b.h, b.x, b.y + b.h - 2], '#cccc00');
      D.rect(ctx, b.x + 3, b.y + 3, b.w - 3, b.h - 3, '#8c8c00');
    }
    impactText(ctx, label, b.x + b.w / 2 + (selected ? 0 : 1.5), b.y + 22.5 + (selected ? 0 : 1), 18, '#ffff00', b.w - 5, 'center');
  }

  function drawHandle(ctx) {
    // While the machine runs (frames 3-54) the handle button is swapped for the pulled lever:
    // the knob sits at the bottom, below the elbow, and the pipe stays up.
    var pulled = m.playing && m.mf >= 3;
    // bracket from the sign to the top of the pole
    ctx.fillStyle = '#663300';
    ctx.fillRect(329, 102, 20, 4);
    ctx.fillRect(345, 102, 4, 38);
    ctx.strokeStyle = '#331a00';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(329, 102, 20, 4);
    // pole and elbow into the machine side
    var top = pulled ? 134 : 146;
    var pg = ctx.createLinearGradient(337, 0, 346, 0);
    pg.addColorStop(0, '#6a6a6a');
    pg.addColorStop(0.45, '#d8d8d8');
    pg.addColorStop(1, '#6a6a6a');
    ctx.fillStyle = pg;
    ctx.fillRect(337.5, top, 8, 244 - top);
    ctx.strokeStyle = '#333';
    ctx.strokeRect(337.5, top, 8, 244 - top);
    if (pulled) D.circle(ctx, 341.5, top, 4, '#9a9a9a', '#333', 1);
    ctx.beginPath();
    ctx.moveTo(337.5, 244);
    ctx.lineTo(345.5, 244);
    ctx.quadraticCurveTo(345.5, 253, 336, 253);
    ctx.lineTo(314, 253);
    ctx.lineTo(314, 245);
    ctx.lineTo(333, 245);
    ctx.quadraticCurveTo(337.5, 245, 337.5, 244);
    ctx.closePath();
    var eg = ctx.createLinearGradient(0, 244, 0, 253);
    eg.addColorStop(0, '#d8d8d8');
    eg.addColorStop(1, '#707070');
    ctx.fillStyle = eg;
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.stroke();
    // black knob
    var ky = pulled ? 259 : top - 2;
    if (pulled) {
      ctx.fillStyle = '#8a8a8a';
      ctx.fillRect(339, 250, 5, 8);
    }
    var bg = ctx.createRadialGradient(338, ky - 4, 1, 341.5, ky, 13);
    bg.addColorStop(0, '#9a9a9a');
    bg.addColorStop(0.35, '#3a3a3a');
    bg.addColorStop(1, '#050505');
    D.circle(ctx, 341.5, ky, 12.5, bg, '#000', 1);
  }

  function drawMachine(ctx) {
    ctx.save();
    ctx.lineJoin = 'round';
    drawHandle(ctx);
    // plinth (chrome base)
    poly(ctx, [109, 310, 139, 339, 160, 342.5, 160, 372.5, 109, 342], '#9a9a9a', '#555');
    poly(ctx, [139, 339, 314, 339, 314, 327, 335, 342.5, 160, 342.5], '#b5b5b5', '#555');
    var bg = ctx.createLinearGradient(160, 0, 335, 0);
    bg.addColorStop(0, '#9c9c9c');
    bg.addColorStop(0.5, '#d4d4d4');
    bg.addColorStop(1, '#c8c8c8');
    D.rect(ctx, 160, 342.5, 175, 30, bg, '#555', 1);
    // left side face
    var sg = ctx.createLinearGradient(109, 0, 139, 0);
    sg.addColorStop(0, '#ffd21a');
    sg.addColorStop(0.5, '#e0b000');
    sg.addColorStop(1, '#c79600');
    poly(ctx, [109, 47.5, 154, 91.5, 154, 121.5, 139, 107.5, 139, 340, 109, 310], sg, '#6b5400');
    // front body
    var fg = ctx.createLinearGradient(139, 110, 314, 330);
    fg.addColorStop(0, '#7e6810');
    fg.addColorStop(0.35, '#a88f16');
    fg.addColorStop(0.55, '#8e7812');
    fg.addColorStop(1, '#c4ae1e');
    poly(ctx, [139, 107.5, 154, 121.5, 314, 121.5, 314, 340, 139, 340], fg, '#5a4a00');
    // top face
    var tg = ctx.createLinearGradient(109, 47, 330, 92);
    tg.addColorStop(0, '#d8c80e');
    tg.addColorStop(0.35, '#f8f400');
    tg.addColorStop(0.55, '#e0d60c');
    tg.addColorStop(0.8, '#ffff55');
    tg.addColorStop(1, '#f0e800');
    poly(ctx, [109, 47.5, 285, 47.5, 329, 91.5, 154, 91.5], tg, '#6b5a00');
    // sign
    D.rect(ctx, 154, 91.5, 175, 30, '#b8a41b', '#5a4a00', 1);
    impactText(ctx, 'SUPER SLOTS 3000', 160.5, 118.1, 22.4, '#ffff00', 166);
    // reel window (recessed) with a bright right edge
    D.rect(ctx, 147.5, 133.5, 160, 136.5, '#867213', '#5a4a00', 1);
    D.line(ctx, 305.5, 136, 305.5, 268, '#f7f503', 2);
    D.line(ctx, 150, 268.5, 306, 268.5, '#c8b41a', 1.5);
    for (var i = 0; i < 3; i++) drawReel(ctx, m.reels[i], i);
    // WINNINGS display
    D.rect(ctx, 156.5, 242.5, 137.5, 17.5, '#005900');
    D.rect(ctx, 158, 244, 133, 14.5, '#003300');
    D.rect(ctx, 290, 243, 4, 17, '#ccaa00');
    heavy(ctx, 'WINNINGS:', 159.6, 257.5, 14, '#00cc00');
    ctx.font = '15.5px Arial, Helvetica, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#00cc00';
    ctx.fillText(String(m.textwin), 250.2, 257.8);
    // bet row
    impactText(ctx, 'BET:', 147.6, 299.9, 20, '#ffff00');
    for (i = 0; i < 3; i++) betButton(ctx, i, m.sel === i);
    // coin slot
    D.rect(ctx, 201.5, 320, 63.5, 16, '#333', '#222', 1);
    var cg = ctx.createLinearGradient(215, 0, 262, 0);
    cg.addColorStop(0, '#444');
    cg.addColorStop(0.55, '#f2f2f2');
    cg.addColorStop(1, '#555');
    poly(ctx, [212, 322, 257, 322, 262, 334, 217, 334], cg);
    ctx.restore();
  }

  // --- DOM hot spots over the drawn machine -----------------------------------------------------
  function hotspot(x, y, w, h, id, onClick) {
    var e = ui.box(x, y, w, h, 'nohover');
    e.style.cursor = 'pointer';
    e.setAttribute('data-id', id);
    e.addEventListener('click', function (ev) { ev.stopPropagation(); onClick(); });
    return e;
  }

  function build() {
    ui.clear();
    hotspot(328, 128, 28, 128, 'handle', pull).title = 'Pull';
    BET_BOX.forEach(function (b, i) {
      hotspot(b.x, b.y, b.w, b.h, 'bet' + BETS[i], function () { pickBet(i); });
    });
    var css = SRPG.casinoArt && SRPG.casinoArt.heavyCss ? SRPG.casinoArt.heavyCss(10, '#003399') : 'font-size:10px';
    ui.iconButton(null, { icon: 'leave', label: '<span style="position:relative;top:2px;' + css + '">LEAVE</span>', x: 445, y: 338.5, w: 90, size: 35, id: 'leave' }, function () {
      SRPG.sound.play('click');
      SRPG.location.open('casino', { resume: true });
    });
  }

  SRPG.registerScreen('slots', {
    enter: function () {
      m = fresh();
      SRPG.sound.music('inside');
      build();
    },
    exit: function () { m = null; },
    tick: function () {
      var s = S();
      if (!m || !s) return;
      if (m.playing) {
        m.mf += 1;
        runMachineFrame(m.mf);
      }
      if (!m) return;
      for (var i = 0; i < 3; i++) tickReel(m.reels[i], m.sym[i]);
      if (m.winLoops > 0 && --m.winWait <= 0) { SRPG.sound.play('win'); m.winLoops -= 1; m.winWait = 20; }
    },
    render: function (ctx) {
      var s = S();
      if (!m || !s) return;
      if (SRPG.casinoArt) SRPG.casinoArt.lobby(ctx, SRPG.engine.frame);
      else { ctx.fillStyle = '#990000'; ctx.fillRect(0, 0, SRPG.W, SRPG.H); }
      drawMachine(ctx);
      SRPG.hud.draw(ctx, s, 'inside');
    },
  });

  // Test hook: the machine's state (read-only use).
  SRPG.slots = { get state() { return m; } };
})();
