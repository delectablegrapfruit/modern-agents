// The bank (root frame 25) with its loan (26) and repayment (27) screens, Stickman Master Builders'
// real estate counter (24), and the ROB THE PLACE outcome screens it shares with the store (28/29).
// Rules and layout follow the original: every check below is the original button handler's.
(function () {
  'use strict';
  var SRPG = window.SRPG;
  var ui = SRPG.ui;
  var D = SRPG.draw;
  var esc = SRPG.util.escape;
  var rnd = SRPG.rng.random;
  var FONT = '"Arial Black", "Arial Bold", Arial, Helvetica, sans-serif';

  // Which of the bank's frames is showing, and the AMOUNT field (the original's _root.amount: it
  // is set to 0 whenever the main bank screen is entered and carries over into the loan screens).
  var st = { screen: 'main', amount: '0', robamount: 0 };

  function S() { return SRPG.game.s; }

  // --- Flash number conversions ---------------------------------------------------------------
  // The AMOUNT field is free text (7 characters, any keys), read with Flash's own string-to-number
  // (SRPG.util.flashNumber: '010' is 8, '0100' is 64, '09' is 9, 0x/0X is hex, a trailing space makes
  // it NaN) and AS1 int() (SRPG.util.flashInt), a 32-bit conversion: '3e9' becomes -1294967296 and a
  // DEPOSIT of it hands you $1,294,967,296 (seen in Ruffle); the original's exploit is kept.
  var num = SRPG.util.flashNumber;
  var int = SRPG.util.flashInt;
  // Flash prints numbers with 15 significant digits, so the drifting interest rate reads 3.3, not
  // 3.3000000000000003.
  function flashNum(n) {
    if (typeof n !== 'number' || !isFinite(n)) return String(n);
    if (n === Math.round(n)) return String(n);
    return String(parseFloat(n.toPrecision(15)));
  }

  // --- rules ------------------------------------------------------------------------------------
  var rules = {
    // DEPOSIT: cash >= int(amount) and amount > 0 (the raw field, not int).
    deposit: function (s, amount) {
      if (!(s.cash < int(amount)) && num(amount) > 0) {
        s.cash -= int(amount);
        s.bankcash += int(amount);
        return true;
      }
      return false;
    },
    // WITHDRAW: bankcash >= int(amount) and int(amount) > 0.
    withdraw: function (s, amount) {
      if (!(s.bankcash < int(amount)) && int(amount) > 0) {
        s.bankcash -= int(amount);
        s.cash += int(amount);
        return true;
      }
      return false;
    },
    // Loan OK: 1..1000, due in 15 days. (GET A LOAN only shows while there is no loan.)
    borrow: function (s, amount) {
      if (!(int(amount) > 1000) && int(amount) > 0) {
        s.bankloan += int(amount);
        s.cash += int(amount);
        s.bankloandays = 15;
        return true;
      }
      return false;
    },
    // Repay OK: no more than the loan, more than 0, and no more than the cash on hand. Paying it
    // all off clears the deadline.
    repay: function (s, amount) {
      if (!(int(amount) > s.bankloan) && int(amount) > 0 && !(int(s.cash) < int(amount))) {
        s.bankloan -= int(amount);
        s.cash -= int(amount);
        if (s.bankloan === 0) s.bankloandays = -1;
        return true;
      }
      return false;
    },
    // ROB THE PLACE (the store's own robbery button, placed in the bank too): needs a gun and more
    // than 9 bullets to show; only before 21:00. Uses up the rest of the day and 5-9 bullets; a
    // random(charm) above 40 gets away with random(500) dollars, otherwise 5 days in jail.
    canRob: function (s) { return s.items.gun > 0 && s.items.ammo > 9; },
    rob: function (s) {
      if (!(s.time < 21)) return null;
      s.time = 24;
      s.items.ammo -= rnd(5) + 5;
      var r = rnd(s.charm);
      if (r > 40) {
        var got = rnd(500);
        s.cash += got;
        return { ok: true, amount: got };
      }
      s.day += 5;
      return { ok: false };
    },
  };

  // Stickman Master Builders. A home is offered only while you live in something smaller; there is
  // no need to own the one before it.
  var HOMES = [
    { dwelling: 2, cost: 25000, id: 'apartment2', label: 'PURCHASE BIGGER APARTMENT - $25,000', y: 104.7 },
    { dwelling: 3, cost: 50000, id: 'penthouse', label: 'PURCHASE PENTHOUSE SUITE - $50,000', y: 143.2 },
    { dwelling: 4, cost: 100000, id: 'mansion', label: 'PURCHASE MANSION - $100,000', y: 180.7 },
    { dwelling: 5, cost: 500000, id: 'castle', label: 'PURCHASE CASTLE - $500,000', y: 218.9 },
  ];
  rules.buyHome = function (s, h) {
    if (s.cash > h.cost - 1) {
      s.cash -= h.cost;
      s.dwelling = h.dwelling;
      return true;
    }
    return false;
  };

  // --- DOM helpers (stage coordinates; the original's measured positions) -------------------------
  function text(html, x, y, opts) {
    opts = opts || {};
    var e = ui.el('div', 'nopoint', null, html);
    var css = 'position:absolute;left:' + x + 'px;top:' + y + 'px;font:bold ' + (opts.size || 12) + 'px ' + FONT +
      ';color:' + (opts.color || '#000') + ';line-height:' + (opts.lh || Math.round((opts.size || 12) * 1.4)) + 'px;' +
      'white-space:' + (opts.wrap ? 'normal' : 'pre') + ';text-align:' + (opts.align || 'left') + ';';
    if (opts.w != null) css += 'width:' + opts.w + 'px;';
    if (opts.clip) css += 'overflow:hidden;';
    if (opts.id) e.setAttribute('data-text', opts.id);
    e.style.cssText = css + (opts.css || '');
    return e;
  }

  // A number shown in one of the original's 14px dynamic fields, inside a 12px label.
  function num14(id, n) {
    return '<span data-text="' + id + '" style="font-size:14px;margin-left:3px">' + esc(String(n)) + '</span>';
  }

  function panel(x, y, w, h) {
    var p = ui.panel(x, y, w, h);
    p.setAttribute('data-loc', 'bank');
    return p;
  }

  // Square icon tile + label (the original's menu buttons). font = label px, size = tile px.
  function iconBtn(o, onClick) {
    var b = ui.iconButton(null, { icon: o.icon, label: '<span>' + o.label + '</span>', x: o.x, y: o.y, w: o.w || 150, size: o.size || 36, id: o.id },
      function () { onClick(); });
    var lbl = b.querySelector('.lbl');
    if (lbl) {
      lbl.style.fontSize = (o.font || 10.5) + 'px';
      lbl.style.marginLeft = (o.gap != null ? o.gap : 4) + 'px';
    }
    return b;
  }

  // The original's rounded blue text buttons (DEPOSIT, WITHDRAW, OK, CANCEL): #3399ff with a
  // #3366cc edge and #003399 lettering; light blue with #3399ff lettering under the mouse.
  function pill(label, x, y, w, id, onClick) {
    var b = ui.button(null, label, function () { onClick(); }, { x: x, y: y, w: w, id: id });
    b.style.cssText += ';height:26px;padding:0;line-height:24px;font-size:10.5px;border-radius:7px;background:#3399ff;' +
      'border:1px solid #3366cc;color:#003399;text-align:center;';
    b.addEventListener('mouseenter', function () { b.style.background = '#95caff'; b.style.color = '#3399ff'; b.style.borderColor = '#3399ff'; });
    b.addEventListener('mouseleave', function () { b.style.background = '#3399ff'; b.style.color = '#003399'; b.style.borderColor = '#3366cc'; });
    return b;
  }

  function leaveBtn(x, y) {
    return iconBtn({ icon: 'leave', label: 'LEAVE', x: x, y: y, w: 81, id: 'leave', gap: 4 }, function () {
      SRPG.location.leave();
    });
  }

  // AMOUNT: label, white box and the 7-character field (right aligned, like the original).
  function amountField(y) {
    text('AMOUNT:', 314, y - 25, { size: 14, color: '#000066' });
    var box = ui.el('div', 'nopoint');
    box.style.cssText = 'position:absolute;left:312px;top:' + y + 'px;width:82px;height:24px;background:#fff;border:1px solid #003399;box-sizing:border-box;';
    var inp = ui.input(null, 314, y + 1, 78, { maxLength: 7, value: st.amount });
    inp.setAttribute('data-id', 'amount');
    inp.style.cssText += ';height:22px;border:none;background:transparent;text-align:right;font:bold 14px ' + FONT + ';color:#000066;padding:0 2px;';
    inp.addEventListener('input', function () { st.amount = inp.value; });
    return inp;
  }

  function rateLines() {
    text('CURRENT INTEREST RATE:', 200, 246, { size: 10, color: '#000066', lh: 14 });
    text(esc(flashNum(S().bankrate)), 351, 244, { size: 12, color: '#000066', w: 30, align: 'right', clip: true, lh: 17, id: 'bankrate' });
    text('%', 381, 246, { size: 10, color: '#000066', lh: 14 });
    text('- Interest compounds every day\n on your closing balance', 202, 261, { size: 8, color: '#000066', lh: 11 });
  }

  // --- screens ------------------------------------------------------------------------------------
  function showMain() {
    var s = S();
    panel(181, 47, 356, 252);
    text('"Hello, this is the bank.  What can I do for you?"', 181, 55, { w: 356, align: 'center' });
    // label and number run together, as the original's fields sit right after their labels
    text('BANK BALANCE:  $' + num14('bankcash', s.bankcash), 206, 96, { color: '#000066', w: 197, clip: true, lh: 19 });
    text('CASH: $' + num14('cash', s.cash), 405, 96, { color: '#000066', w: 127, clip: true, lh: 19 });
    amountField(154);
    pill('DEPOSIT', 229, 154, 70, 'deposit', function () {
      rules.deposit(S(), st.amount);
      build();
    });
    pill('WITHDRAW', 408, 153, 80, 'withdraw', function () {
      rules.withdraw(S(), st.amount);
      build();
    });
    iconBtn({ icon: 'realestate', label: 'BUY REAL ESTATE', x: 199, y: 191, size: 23, font: 10, w: 135, id: 'realestate' }, function () {
      go('realestate');
    });
    // GET A LOAN while there is no loan (bankloandays == -1), REPAY LOAN while there is one.
    if (s.bankloandays === -1) {
      iconBtn({ icon: 'loan', label: 'GET A LOAN', x: 199, y: 220, size: 22, font: 10.5, w: 110, id: 'loan' }, function () {
        go('loan');
      });
    }
    if (s.bankloandays > -1) {
      iconBtn({ icon: 'repay', label: 'REPAY LOAN', x: 199, y: 220, size: 22, font: 10.5, w: 110, id: 'repay' }, function () {
        go('repay');
      });
    }
    if (rules.canRob(s)) {
      iconBtn({ icon: 'rob', label: 'ROB THE<br>PLACE', x: 435, y: 205, size: 36, font: 9, w: 100, id: 'rob', gap: 6 }, function () {
        var r = rules.rob(S());
        if (!r) { SRPG.sound.play('error'); build(); return; }
        st.robamount = r.amount || 0;
        if (r.ok) SRPG.sound.play('work');
        go(r.ok ? 'robbed' : 'jail');
      });
    }
    leaveBtn(433, 247);
    rateLines();
  }

  function showLoan() {
    panel(181, 47, 356, 252);
    text('"The most we can lend you is $1000,\nand you get 15 days to pay us back.\nSo, how much do you need?"', 259, 63);
    amountField(147);
    pill('OK', 408, 148, 70, 'ok', function () {
      if (rules.borrow(S(), st.amount)) backToMain();
    });
    pill('CANCEL', 446, 254, 70, 'cancel', backToMain);
    rateLines();
  }

  function showRepay() {
    var s = S();
    panel(181, 47, 356, 252);
    text('"Your current loan is: $' + num14('bankloan', s.bankloan), 258, 62, { lh: 19, w: 270, clip: true });
    text('You have <span data-text="bankloandays" style="display:inline-block;min-width:23px;text-align:center;font-size:14px">' +
      esc(String(s.bankloandays)) + '</span> days left before it comes due.\nHow much are you paying back today?"', 226, 82, { lh: 17 });
    amountField(147);
    pill('OK', 408, 148, 70, 'ok', function () {
      if (rules.repay(S(), st.amount)) backToMain();
    });
    pill('CANCEL', 446, 254, 70, 'cancel', backToMain);
    rateLines();
  }

  function showRealEstate() {
    var s = S();
    panel(181, 47, 356, 252);
    text('"Stickman Master Builders, at your service.  What\nfinancial ruin can we build for you today?"', 213, 55);
    HOMES.forEach(function (h) {
      if (s.dwelling >= h.dwelling) return; // the original hides what you already have (or better)
      iconBtn({ icon: 'realestate', label: h.label, x: 210, y: h.y, size: 35, font: 10.75, w: 300, id: h.id, gap: 5 }, function () {
        if (rules.buyHome(S(), h)) SRPG.sound.play('purchase');
        else SRPG.sound.play('error');
        build();
      });
    });
    text('Move up to a bigger home and you\'ll\nhave room for more things to put in it.', 212, 266, { size: 8, color: '#000066', lh: 11 });
    leaveBtn(433, 260);
  }

  // The robbery outcome screens. OK costs 10 karma and drops you back at the start junction; in
  // jail the game can also run out of days.
  function showRobbed() {
    panel(113, 125, 356, 162);
    text('YOU DID IT!!!', 113, 136, { size: 24, w: 356, align: 'center', lh: 34 });
    text('You scoped the joint out, then slipped back at\nmidnight and cleaned the whole place out.', 175, 174, { lh: 17 });
    text('You got away with $<span data-text="robamount" style="font-size:16px;margin-left:3px">' + esc(String(st.robamount)) + '</span>', 202, 207, { lh: 22 });
    pill('OK', 256, 246, 70, 'ok', function () { robberyDone(false); });
  }

  function showJail() {
    panel(97, 94, 356, 222);
    text('YOU GOT CAUGHT!!!', 97, 109, { size: 24, w: 356, align: 'center', lh: 34 });
    text('Maybe you weren\'t charming enough to get\naway with it, or maybe luck was against you.\nWhatever the reason, you\'re locked up\nfor 5 days.', 158, 166, { lh: 17 });
    pill('OK', 240, 271, 70, 'ok', function () { robberyDone(true); });
  }

  function robberyDone(jailed) {
    var s = S();
    SRPG.game.addKarma(-10);
    if (jailed && SRPG.game.timeUp()) {
      st.screen = 'main';
      SRPG.game.endGame();
      return;
    }
    s.mapx = SRPG.START_MAPX;
    s.mapy = SRPG.START_MAPY;
    SRPG.location.leave('none'); // no door nudge: you're back at the junction
    // The OK buttons are the store's (frames 28/29): unlike every LEAVE button they never swap the
    // inside loop back for the street music, so it keeps playing out on the map.
    SRPG.sound.music('inside');
  }

  var SCREENS = { main: showMain, loan: showLoan, repay: showRepay, realestate: showRealEstate, robbed: showRobbed, jail: showJail };

  function go(screen) {
    st.screen = screen;
    if (screen === 'main') st.amount = '0'; // frame 25's "var amount = 0"
    build();
  }
  // The loan and repayment screens' OK and CANCEL go back to root frame 25, whose script replays
  // the black clip: the bank fades in again.
  function backToMain() {
    SRPG.engine.blackPlay(1);
    go('main');
  }

  function build() {
    if (SRPG.location.current !== 'bank') return;
    SRPG.location.g.refresh();
  }

  // --- art ----------------------------------------------------------------------------------------
  function bankBackground(ctx) {
    // ceiling strip and window wall
    D.rect(ctx, 0, 0, 550, 34, '#c0c0c0');
    D.rect(ctx, 0, 34, 550, 181, '#9d8f57');
    D.line(ctx, 0, 33.5, 550, 33.5, '#000', 1);
    // teller windows: glass, reflections, speaking holes, the arched slot at the bottom
    [[-95, 87], [96, 278], [287, 470], [479, 661]].forEach(function (p) {
      var x0 = p[0], x1 = p[1], cx = (x0 + x1) / 2;
      var g = ctx.createLinearGradient(0, 39, 0, 208);
      g.addColorStop(0, '#cbf1fa');
      g.addColorStop(0.55, '#cbfaf4');
      g.addColorStop(1, '#cffad6');
      ctx.fillStyle = g;
      ctx.fillRect(x0, 39, x1 - x0, 169);
      [76.5, 130, 174].forEach(function (y) { D.line(ctx, x0, y, x1, y, '#29c5eb', 1); });
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, 39, x1 - x0, 169);
      ctx.clip();
      for (var i = 0; i < 6; i++) {
        var a = (i / 6) * Math.PI * 2;
        D.circle(ctx, cx + Math.cos(a) * 11, 107 + Math.sin(a) * 11, 2.7, null, '#6699cc', 0.9);
      }
      D.circle(ctx, cx, 107, 2.7, null, '#6699cc', 0.9);
      ctx.beginPath();
      ctx.arc(cx, 216, 43, Math.PI, 0);
      ctx.closePath();
      ctx.fillStyle = '#cffad6';
      ctx.fill();
      ctx.strokeStyle = '#66ccff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
      D.rect(ctx, x0, 39, x1 - x0, 169, null, '#000', 1);
    });
    // a deposit slip left on the glass
    ctx.save();
    ctx.translate(264, 103);
    ctx.rotate(0.22);
    D.rect(ctx, -12, -17, 24, 34, '#cbf1fa', '#0e7792', 0.8);
    for (var k = 0; k < 4; k++) D.line(ctx, -8, -10 + k * 6, 8, -10 + k * 6, '#0e7792', 0.6);
    ctx.restore();
    // counter
    D.rect(ctx, 0, 208, 550, 7, '#9d8f57');
    D.rect(ctx, 0, 215, 550, 28, '#c0c0c0');
    D.line(ctx, 0, 215, 550, 215, '#000', 1);
    D.rect(ctx, 0, 243, 550, 32, '#af8c72');
    D.line(ctx, 0, 243, 550, 243, '#000', 1);
    D.line(ctx, 0, 275, 550, 275, '#000', 1);
    D.rect(ctx, 0, 275.5, 550, 125, '#9d8f57');
    // queue railing: three boards (light top, brown face) behind square posts, a rope between two
    [[318, 324, 333], [345, 351, 360], [370.5, 376.5, 385.5]].forEach(function (r) {
      D.rect(ctx, 0, r[0], 550, r[1] - r[0], '#c2a996');
      D.rect(ctx, 0, r[1], 550, r[2] - r[1], '#af8c72');
      D.line(ctx, 0, r[0], 550, r[0], '#000', 1);
      D.line(ctx, 0, r[1], 550, r[1], '#000', 0.8);
      D.line(ctx, 0, r[2], 550, r[2], '#000', 1);
    });
    ctx.beginPath();
    ctx.moveTo(287, 350);
    ctx.quadraticCurveTo(378, 356, 468, 350);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.stroke();
    [[81, 88.5, 96.5, 306], [279, 286.5, 286.5, 306], [467.5, 475, 482.5, 303]].forEach(function (p) {
      var x0 = p[0], x1 = p[1], x2 = p[2], top = p[3];
      if (x2 > x1) {
        D.poly(ctx, [x0, top + 6, x0 + 4, top, x2, top + 3, x1, top + 6], '#c2a996', '#000', 1);
        D.poly(ctx, [x1, top + 6, x2, top + 3, x2, 400, x1, 400], '#9c7558', '#000', 1);
      } else {
        D.rect(ctx, x0, top, x1 - x0, 5, '#c2a996', '#000', 1);
      }
      D.rect(ctx, x0, top + (x2 > x1 ? 6 : 5), x1 - x0, 400, '#af8c72', '#000', 1);
    });
  }

  function estateBackground(ctx) {
    // Stickman Master Builders: pale aqua office, blue trim, a desk with a computer, orange floor.
    D.rect(ctx, 0, 0, 550, 400, '#cbfaf4');
    D.rect(ctx, 0, 33, 488, 12, '#3399cc');
    D.line(ctx, 0, 33, 488, 33, '#000', 0.8);
    D.line(ctx, 0, 45, 488, 45, '#000', 0.8);
    D.poly(ctx, [488, 0, 550, 0, 550, 400, 488, 400], '#b6f8ef');
    D.poly(ctx, [488, 33, 550, -1, 550, 8, 488, 45], '#3399cc', '#000', 0.8);
    D.line(ctx, 488, 0, 488, 319, '#000', 0.8);
    var g = ctx.createLinearGradient(0, 0, 550, 0);
    g.addColorStop(0, '#6e3a0c');
    g.addColorStop(1, '#e8892a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, 319);
    ctx.lineTo(488, 319);
    ctx.lineTo(550, 258);
    ctx.lineTo(550, 400);
    ctx.lineTo(0, 400);
    ctx.closePath();
    ctx.fill();
    D.line(ctx, 0, 319, 488, 319, '#000', 0.8);
    D.line(ctx, 488, 319, 550, 258, '#000', 0.8);
    // desk
    D.rect(ctx, 0, 142, 312, 49, '#af8c72', '#663333', 1);
    D.rect(ctx, 0, 191, 312, 128, '#916953', '#663333', 1);
    // computer: white box on a grey base, mouse on its cable
    D.poly(ctx, [49, 148, 73, 148, 73, 159, 168, 159, 168, 168, 49, 168], '#cccccc', '#000', 0.8);
    D.poly(ctx, [49, 148, 74, 160, 168, 160, 168, 182, 74, 182, 49, 168], '#999999', '#000', 0.8);
    D.rect(ctx, 74, 160, 94, 22, '#666666', '#000', 0.8);
    D.poly(ctx, [72, 75, 144, 75, 157, 104, 84, 104], '#ffffff', '#000', 0.8);
    D.poly(ctx, [72, 75, 84, 104, 84, 160, 72, 150], '#999999', '#000', 0.8);
    D.rect(ctx, 84, 104, 73, 55, '#cccccc', '#000', 0.8);
    ctx.beginPath();
    ctx.moveTo(135, 175);
    ctx.bezierCurveTo(140, 196, 175, 180, 178, 190);
    ctx.bezierCurveTo(182, 205, 205, 200, 238, 201);
    ctx.strokeStyle = '#aaa';
    ctx.lineWidth = 1;
    ctx.stroke();
    D.circle(ctx, 134, 174, 5, '#000');
  }

  // Robbery pulled off: dark green with scattered green dollar signs (frame 28, the same art as the
  // store's result screen).
  var DOLLARS = [[141, 25], [468, 5], [346, 55], [77, 80], [190, 87], [289, 106], [436, 93], [513, 93], [0, 112],
    [379, 150], [167, 176], [66, 190], [129, 234], [289, 234], [430, 227], [513, 227], [26, 291], [186, 285],
    [110, 317], [424, 305], [346, 336], [200, 375], [455, 381], [46, 395], [550, 342]];
  // A chunky outlined dollar sign centred on (x, y), about 16 x 22 px.
  function dollar(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'round';
    var gr = ctx.createLinearGradient(-8, -10, 8, 10);
    gr.addColorStop(0, '#44c400');
    gr.addColorStop(0.45, '#33a800');
    gr.addColorStop(1, '#337f00');
    function ess() {
      ctx.beginPath();
      ctx.moveTo(5.2, -4.8);
      ctx.bezierCurveTo(4, -8.6, -5.6, -8.8, -5.6, -3.9);
      ctx.bezierCurveTo(-5.6, 0.2, 5.6, -0.6, 5.6, 4);
      ctx.bezierCurveTo(5.6, 9, -4.4, 8.8, -5.8, 4.6);
    }
    ess();
    ctx.lineWidth = 6.6;
    ctx.strokeStyle = '#1a3300';
    ctx.stroke();
    ess();
    ctx.lineWidth = 4.4;
    ctx.strokeStyle = gr;
    ctx.stroke();
    [[-2.9, -12.6, 5.2], [0.9, -12.6, 5.2], [-2.9, 7.6, 5], [0.9, 7.6, 5]].forEach(function (b) {
      D.rect(ctx, b[0], b[1], 2, b[2], '#2f9a00', '#1a3300', 0.9);
    });
    ctx.restore();
  }
  function robbedBackground(ctx) {
    D.rect(ctx, 0, 0, 550, 400, '#336600');
    DOLLARS.forEach(function (p) { dollar(ctx, p[0], p[1]); });
  }

  // Jail (frame 29): navy wall seen through steel bars. The uprights run between the three cross
  // bars and rest on the bar below with rounded ends; a mitred post and a dark pillar on the right.
  function vBar(ctx, x, y0, y1) {
    var gr = ctx.createLinearGradient(x, 0, x + 17, 0);
    gr.addColorStop(0, '#454545');
    gr.addColorStop(0.62, '#c6c6c6');
    gr.addColorStop(1, '#6e6e6e');
    D.roundRect(ctx, x, y0, 17, y1 - y0, 8, gr, '#535353', 1);
  }
  function hBar(ctx, x0, x1, y) {
    var gr = ctx.createLinearGradient(0, y, 0, y + 17);
    gr.addColorStop(0, '#9f9f9f');
    gr.addColorStop(0.3, '#cccccc');
    gr.addColorStop(1, '#9b9b9b');
    D.rect(ctx, x0, y, x1 - x0, 17, gr, '#535353', 1);
    D.rect(ctx, x0, y + 17, x1 - x0, 5, '#666666', '#535353', 1);
  }
  function jailBackground(ctx) {
    D.rect(ctx, 0, 0, 550, 400, '#003366');
    [13, 221, 325].forEach(function (y) {
      hBar(ctx, -2, 470, y);
      D.poly(ctx, [470, y, 482.5, y + 11, 482.5, y + 22, 470, y + 22], '#8a8a8a', '#535353', 1);
      hBar(ctx, 507.5, 552, y);
    });
    var tops = [-12, 35, 243, 347];
    var ends = [25, 233, 337, 412];
    [15.5, 67.5, 118.5, 170.5, 222.5, 274.5, 326.5, 378.5, 430.5, 470.5, 535].forEach(function (x) {
      for (var i = 0; i < 4; i++) vBar(ctx, x, tops[i], ends[i]);
    });
    D.rect(ctx, 482.5, -1, 25, 402, '#666666', '#555555', 1);
  }

  SRPG.registerLocation({
    id: 'bank',
    hud: 'inside',
    music: 'inside',
    exit: 'bank',
    panel: { x: 181, y: 47, w: 356, h: 252 },
    onEnter: function () {
      st.screen = 'main';
      st.amount = '0';
    },
    onLeave: function () {
      st.screen = 'main';
      st.amount = '0';
    },
    background: function (ctx) {
      // Frames 28/29 are the store's robbery screens; use its art when shops.js shares it.
      var shared = SRPG.robbery || {};
      if (st.screen === 'realestate') estateBackground(ctx);
      else if (st.screen === 'robbed') (shared.drawRobbed || robbedBackground)(ctx);
      else if (st.screen === 'jail') (shared.drawJail || jailBackground)(ctx);
      else bankBackground(ctx);
    },
    view: function () {
      (SCREENS[st.screen] || showMain)();
      return { custom: true };
    },
  });

  // Exposed for tests and for other modules that want the same numbers.
  SRPG.bank = { rules: rules, HOMES: HOMES, flashNum: flashNum, int: int, num: num, state: st, go: go };
})();
