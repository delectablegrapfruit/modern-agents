// Home: the apartment (dwelling 1-3, root frames 65-71), the old apartment once you have moved out
// (frame 64), and the mansion / castle (dwelling 4-5, frames 78-89). Sleeping and the night's
// summary, the answering machine, TV (StickNews, and the satellite's news / fitness / dating
// channels), the computer's stock market, saving, and the election campaign.
// Rules, numbers and screen layouts follow the original; the TV shows and campaign texts are
// reworded. Rooms, the TV set, the answering machine and the sleeping stick are drawn in code.
(function () {
  'use strict';
  var SRPG = window.SRPG;
  var ui = SRPG.ui;
  var D = SRPG.draw;
  var rnd = SRPG.rng.random;
  var esc = SRPG.util.escape;

  var FONT = D.FONT; // the original's type (Arial Black)
  var PLAIN = D.FONT_PLAIN; // device-font text fields (prices, units, "Game saved")
  var RED = '#cc0000'; // screen headings
  var PANEL = { x: 182, y: 47, w: 355, h: 250 };
  var STOCKS = SRPG.STOCKS; // XGS FSY DYC MLG SR2 SAR (the original's ABC XYZ RTW LLG BIX IJA)

  // --- texts ----------------------------------------------------------------------------------
  var NEWS = [
    'Police found a body behind McSticks today. Word is the victim had been drinking straight ' +
      'from the grease bin, which killed him on the spot...',
    "The city's resident coke dealer wandered out of his alley today, which means spring will " +
      'show up six weeks early...',
    'A new law now lets drivers ignore anyone in the crosswalk.  In other news, deaths from hit ' +
      'and runs jumped 2000% yesterday.',
    "People and cars tumbling off the edges of the city's sidewalks and roads is a growing " +
      "problem.  The Mayor's office had no comment at this time.",
    'Bar brawls have reached record levels.  Forget bar stools and pool cues: fighters are now ' +
      "hurling fireballs and energy blasts at each other.  We'll bring you updates as the story develops.",
  ];
  var DATING = [
    "Is 'First Base' a complete mystery to you?  Then catch tonight's brand-new 'Dating for " +
      "Dimwits' on the Dating Network.",
    'Tonight we take a peek inside the secret lives of extreme narcissists, folks so in love with ' +
      'themselves it kills them...literally.  Catch it on the Dating Network.',
    "Hit rock bottom?  Willing to go out with anyone or anything on the planet?  Then here's the " +
      "show you've been hoping for!  Animal Planet teams up with the Dating Network for 'Extreme " +
      "Blind Date'!  Up next!",
    "We now return to 'A Pimp's Tale', from director Steven Stickberg.  It contains partial " +
      'Stick-nudity, so viewer discretion is advised.',
    "Stay tuned for a paid message from the people behind Hypno-stick, Stick-scents' newest " +
      'fragrance.  Your set is now locked for sixty minutes so you can savor every second of it.',
  ];
  var CAMPAIGN = "Campaigns don't come cheap.  The more money you pour in, the better your odds of " +
    "winning.  Win, and you'll be widely admired and very well paid.  Will you run?  A chance like " +
    "this won't come around again!";
  var WON = 'You did it, the election is yours!  Welcome to your new life!  (From now on, money ' +
    'rolls in automatically every night when you go to sleep)';
  var LOST = 'Sorry to be the bearer of bad news.  The votes have been counted and you lost the ' +
    'election.  Too bad, after all that money you spent.  Oh well, nighty night!';
  // What the original's TV text field held before any show had set it (a parody of a sitcom
  // answering-machine song); the mansion news can still show it, see openNews().
  var NOBODY_HOME = "Would you believe it, George is out.  If I were in, I'd answer the phone, right?  " +
    "So where... oh where... am... I????  Would you believe it, IIIII'MMMM not IIIINNNN!!!";

  // The original's _root.newsbody: one variable shared by every TV channel and both campaign
  // screens, never saved. The mansion's news leaves it unchanged 1 time in 6.
  var newsbody = null;

  function int(v) { return v < 0 ? Math.ceil(v) : Math.floor(v); } // AS1 int(): toward zero
  function trunc2(v) { return int(v * 100) / 100; }

  // --- per-visit state ---------------------------------------------------------------------------
  // location.js builds a fresh g on every entry, so a visit's screen state lives on it.
  function V(g) {
    if (!g.home) g.home = { mode: 'menu', t: 0, saveText: '', night: null, stat: null, trade: null, arts: [] };
    return g.home;
  }
  function isMansion(g) { return g.def.id === 'mansion'; }

  function show(g, mode, patch) {
    var v = V(g);
    v.mode = mode;
    v.t = 0;
    for (var k in patch || {}) v[k] = patch[k];
    g.refresh();
  }
  // Back to the room's menu. The original re-enters the home frame, which fades in from black.
  function toMenu(g) { SRPG.location.open(g.def.id); }

  // --- DOM helpers (all positions in stage px; converted to panel-relative) ----------------------
  // Children of the panel are placed from its padding box, i.e. inside its CSS border, so the
  // stage origin of child coordinates is the panel's corner plus that border.
  var OX = PANEL.x, OY = PANEL.y;
  function blankPanel(id) {
    var p = ui.panel(PANEL.x, PANEL.y, PANEL.w, PANEL.h);
    p.setAttribute('data-loc', id);
    var cs = window.getComputedStyle(p);
    OX = PANEL.x + (parseFloat(cs.borderLeftWidth) || 0);
    OY = PANEL.y + (parseFloat(cs.borderTopWidth) || 0);
    return p;
  }
  function panel(g) {
    var p = blankPanel(g.def.id);
    p.setAttribute('data-screen', V(g).mode);
    return p;
  }

  // A text field: box at stage (x, y), width w. o: { size, color, align, font, bold, lh, id, nowrap, h }
  // Lines are o.lh apart (default 1.28 x size); the first line sits where a single line would.
  // o.h: the original field's height; text past it is cut off, as Flash clips a text field.
  function field(p, html, x, y, w, o) {
    o = o || {};
    var size = o.size || 12, lh = o.lh || size * 1.28;
    var t = ui.el('div', 'nopoint', p, html);
    t.style.cssText = 'position:absolute;box-sizing:border-box;left:' + (x - OX) + 'px;top:' + (y - OY - (lh - size * 1.28) / 2) + 'px;' +
      (w ? 'width:' + w + 'px;' : '') + (o.h ? 'height:' + (o.h + (lh - size * 1.28) / 2) + 'px;overflow:hidden;' : '') +
      'font:' + (o.bold === false ? '' : 'bold ') + size + 'px ' + (o.font || FONT) + ';color:' + (o.color || '#000') +
      ';line-height:' + lh + 'px;text-align:' + (o.align || 'left') +
      ';padding:2px 2px 0;white-space:' + (w && !o.nowrap ? 'pre-wrap' : 'pre') + ';';
    if (o.id) t.setAttribute('data-id', o.id);
    return t;
  }

  // Menu icon button: tile of `size` px with its top-left at stage (x, y); label `gap` px to the right.
  function ibtn(g, p, o, onClick) {
    var b = ui.iconButton(p, { icon: o.icon, label: o.label, x: o.x - OX, y: o.y - OY, w: o.w || 170, size: o.size || 35, id: o.id }, function () {
      onClick(g);
    });
    var l = b.querySelector('.lbl');
    l.style.marginLeft = (o.gap != null ? o.gap : 6) + 'px';
    l.style.fontSize = (o.fs || 10.5) + 'px';
    // colours and the hover (over-state) look come from the shared .ibtn style
    l.style.lineHeight = (o.lh || 15) + 'px';
    l.style.whiteSpace = 'nowrap';
    return b;
  }

  // The original's rounded light-blue text button (OK, BUY/SELL, BUY, SELL).
  function tbtn(g, p, label, x, y, w, h, id, onClick, fs) {
    var b = ui.button(p, label, function () {
      onClick(g);
    }, { x: x - OX, y: y - OY, w: w, id: id });
    // Size and shape as measured; colours and the hover look come from the shared .tbtn style.
    b.style.cssText += ';height:' + h + 'px;padding:0;line-height:' + (h - 2) + 'px;font-size:' + (fs || 10.5) + 'px;' +
      'border-width:1px;border-radius:' + Math.round(h * 0.36) + 'px;';
    return b;
  }

  // A small canvas above the panel for the original's pictures (TV set, answering machine...).
  // draw(ctx, v) is called now and again every tick while `live`.
  function art(g, p, x, y, w, h, draw, live) {
    var c = document.createElement('canvas');
    var k = 3;
    c.width = Math.ceil(w * k);
    c.height = Math.ceil(h * k);
    c.className = 'nopoint';
    c.style.cssText = 'position:absolute;left:' + (x - OX) + 'px;top:' + (y - OY) + 'px;width:' + w + 'px;height:' + h + 'px';
    p.appendChild(c);
    var a = { c: c, draw: function () {
      var ctx = c.getContext('2d');
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.clearRect(0, 0, w, h);
      draw(ctx, V(g));
    } };
    a.draw();
    if (live) V(g).arts.push(a);
    return a;
  }

  // --- the menu (frames 65 / 78) -------------------------------------------------------------------
  function buildMenu(g) {
    var s = g.s, v = V(g);
    var p = panel(g);
    field(p, 'What would you like to do?', PANEL.x, 64, 360, { size: 12, align: 'center' });
    ibtn(g, p, { icon: 'messages', label: 'CHECK MESSAGES', x: 199, y: 113.5, id: 'messages' }, function () { openMessages(g); });
    ibtn(g, p, { icon: 'sleep', label: 'SLEEP', x: 199, y: 166.5, id: 'sleep' }, function () { sleep(g); });
    ibtn(g, p, { icon: 'save', label: 'SAVE', x: 198, y: 247.5, gap: 9, w: 90, id: 'save' }, function () {
      // The original's saveGame() writes "Game saved" / "Previous game overwritten" into this
      // room's saveText field.
      v.saveText = SRPG.save.write(s) || '';
      g.refresh();
    });
    // TV and computer only once you own them (the original hides apartment_tv / apartment_comp).
    if (s.items.tv) {
      ibtn(g, p, { icon: 'tv', label: 'WATCH TV', x: 374, y: 114.5, size: 37, gap: 11.5, w: 150, id: 'tv' }, function () { watchTV(g); });
    }
    if (s.items.computer) {
      ibtn(g, p, { icon: 'computer', label: 'USE COMPUTER', x: 374, y: 166.5, size: 39, gap: 7.5, w: 160, id: 'computer' }, function () {
        if (!(s.time < 23)) return g.error();
        show(g, 'computer');
      });
    }
    ibtn(g, p, { icon: 'leave', label: 'LEAVE', x: 439, y: 247.5, w: 100, id: 'leave' }, function () { g.leave(); });
    field(p, esc(v.saveText), 298, 246, 107, { size: 12, font: PLAIN, bold: false, align: 'center', lh: 13.8, id: 'saveText' });
  }

  // --- sleep (the SLEEP button's script; the rules are SRPG.game.sleep) ------------------------
  function sleep(g) {
    var out = SRPG.game.sleep(isMansion(g));
    // A timed game past its last day goes straight to the results (the original's frame 130);
    // a defaulted loan ends in YOU DIED.
    if (out.ended) return g.endGame();
    if (out.dead) return g.die();
    if (out.earn) g.sfx('work'); // the political salary plays the work jingle
    show(g, 'night', { night: out });
  }

  // The night's summary (frames 66 / 79): fixed lines, the sleeping stick with a rising Z, OK.
  function buildNight(g) {
    var n = V(g).night || {};
    var p = panel(g);
    var lines = n.lines || [];
    function pick(key, re) {
      if (n[key] != null) return n[key];
      for (var i = 0; i < lines.length; i++) if (re.test(lines[i])) return lines[i];
      return '';
    }
    field(p, esc(pick('hp', /HP RESTORED/)), 198.2, 47.5, 316.7, { size: 16, color: '#990000', align: 'center', id: 'hptext' });
    field(p, esc(pick('int', /INTELLIGENCE/)), 198.2, 73.5, 316.7, { size: 12, color: '#ffff00', align: 'center', id: 'inttext' });
    field(p, esc(pick('str', /STRENGTH/)), 198.2, 91.5, 316.7, { size: 12, color: '#ffff00', align: 'center', id: 'strtext' });
    field(p, esc(pick('cha', /CHARM/)), 198.2, 108.5, 316.7, { size: 12, color: '#ffff00', align: 'center', id: 'chatext' });
    field(p, esc(pick('pills', /CAFFEINE/)), 201.2, 188.6, 316.7, { size: 12, color: '#66ccff', align: 'center', id: 'pilltext' });
    field(p, esc(pick('bank', /loan/)), 201.5, 222.7, 316.7, { size: 12, color: '#000066', align: 'center', id: 'banktext' });
    if (isMansion(g)) field(p, esc(pick('earn', /Political/)), 198.2, 248.6, 227.8, { size: 12, align: 'center', id: 'earntext' });
    art(g, p, 300, 110, 100, 75, drawSleeper, true);
    tbtn(g, p, 'OK', 446.5, 252.5, 69.5, 25.5, 'ok', toMenu);
  }

  // --- answering machine (frames 67 / 80) -------------------------------------------------------
  function msgTexts(s) {
    var n = s.msgs.length;
    return {
      head: n === 1 ? 'YOU HAVE (1) NEW MESSAGE' : 'YOU HAVE (' + n + ') NEW MESSAGES',
      body: n === 0 ? '' : "''" + s.msgs[0] + "''",
    };
  }
  function openMessages(g) { show(g, 'messages'); }

  function buildMessages(g) {
    var s = g.s;
    var p = panel(g);
    var m = msgTexts(s);
    art(g, p, 199, 62, 36, 48, drawMachine, true);
    field(p, esc(m.head), 241, 73, 320, { size: 16, color: RED, nowrap: true, id: 'msgtext' });
    field(p, esc(m.body), 210.2, 111.8, 316.7, { size: 14, align: 'center', lh: 19.7, h: 132.5, id: 'msgbody' });
    var b = ibtn(g, p, { label: 'ERASE / NEXT MESSAGE', x: 209, y: 246, size: 35.5, w: 200, id: 'erase' }, function () {
      // Drop the oldest message (the original shifts the array down and cuts the last slot).
      if (s.msgs.length > 0) {
        g.sfx('ansmachine');
        s.msgs.shift();
        g.refresh();
      } else g.error();
    });
    ffIcon(b.querySelector('.ico'), 35.5);
    tbtn(g, p, 'OK', 446.5, 252.5, 69.5, 25.5, 'ok', function () {
      // In the mansion, a standing nomination (electionMessage 1 or 2) leads to the campaign.
      if (isMansion(g) && (s.electionMessage === 1 || s.electionMessage === 2)) openCampaign(g);
      else toMenu(g);
    });
  }

  // --- TV (frames 68, 84-87) -------------------------------------------------------------------
  function watchTV(g) {
    var s = g.s;
    if (!(s.time < 23)) return g.error();
    if (isMansion(g) && s.items.satellite === 1) return show(g, 'satellite');
    if (isMansion(g) && s.items.satellite === 0) return openNews(g, true);
    if (!isMansion(g)) return openNews(g, false);
  }

  function newsStory(i) { return "You're tuned to StickNews at " + SRPG.util.hour12(SRPG.game.s.time) + '.  ' + NEWS[i]; }

  // StickNews: the apartment picks one of 5 stories; the mansion rolls random(6) and has no
  // story for 3 (the TV then shows whatever text it showed last).
  function openNews(g, mansion) {
    if (newsbody == null) newsbody = NOBODY_HOME;
    if (mansion) {
      var r = rnd(6);
      var map = { 0: 0, 1: 1, 2: 2, 4: 3, 5: 4 };
      if (map[r] != null) newsbody = newsStory(map[r]);
    } else {
      newsbody = newsStory(rnd(5));
    }
    show(g, 'news', { stat: { name: 'intelligence', label: 'INTELLIGENCE INCREASED!!!', done: false } });
  }
  function openDating(g) {
    if (newsbody == null) newsbody = NOBODY_HOME;
    newsbody = DATING[rnd(5)];
    show(g, 'dating', { stat: { name: 'charm', label: 'CHARM INCREASED!!!', done: false } });
  }
  function openFitness(g) {
    show(g, 'fitness', { stat: { name: 'strength', label: 'STRENGTH INCREASED!!!', done: false } });
  }

  function buildSatellite(g) {
    var p = panel(g);
    art(g, p, 185, 49, 53, 60, drawTV);
    field(p, 'STICK-CHOICE<br>SATELLITE TV', 296.5, 58, 160, { size: 16, color: RED, lh: 22.5, nowrap: true });
    // All three channels use the small TV picture in the original.
    ibtn(g, p, { icon: 'tv', label: 'WATCH NEWS', x: 269, y: 121.5, size: 39, gap: 12.5, w: 190, id: 'news' }, function () { openNews(g, true); });
    ibtn(g, p, { icon: 'tv', label: 'WATCH FITNESS CHANNEL', x: 269, y: 166.5, size: 39, gap: 12, w: 240, id: 'fitness' }, function () { openFitness(g); });
    ibtn(g, p, { icon: 'tv', label: 'WATCH DATING CHANNEL', x: 270, y: 211.5, size: 39, gap: 14.5, w: 240, id: 'dating' }, function () { openDating(g); });
    ibtn(g, p, { icon: 'leave', label: 'LEAVE', x: 445.5, y: 261, w: 100, gap: 6.5, id: 'leave' }, toMenu);
  }

  // One show: its title, the text (news / dating) or the workout, the "... INCREASED!!!" line with
  // the stat's value, and OK (one hour). The stat goes up when the original's animation reaches
  // its 19th frame, 18 ticks in.
  function buildShow(g) {
    var v = V(g), s = g.s;
    var p = panel(g);
    art(g, p, 185, 49, 53, 60, drawTV);
    var title = { news: 'NEWS', fitness: 'FITNESS', dating: 'DATING' }[v.mode];
    field(p, title, 263, 69.5, 200, { size: 16, color: RED, align: 'center', nowrap: false, id: 'tvtitle' });
    if (v.mode === 'fitness') art(g, p, 300, 90, 120, 130, drawLifter, true);
    else field(p, esc(newsbody), 210.2, 111.8, 316.7, { size: 14, align: 'center', lh: 19.7, h: 132.5, id: 'newsbody' });
    var dx = v.mode === 'news' ? 0 : 4; // the strength / charm clips sit 4 px right of the news one
    field(p, v.stat.label, 240.5 + dx, 247, 240, { size: 14, color: '#fff', align: 'center', nowrap: false });
    v.statEl = field(p, String(s[v.stat.name]), 331.8 + dx, 267.6, 60, { size: 17.6, color: '#ffff00', font: PLAIN, bold: false, align: 'center', id: 'statvalue' });
    tbtn(g, p, 'OK', 465, 269.5, 69, 25.5, 'ok', function () {
      s.time += 1;
      toMenu(g);
    });
  }

  function statTick(g) {
    var v = V(g), s = g.s;
    if (!v.stat || v.stat.done || v.t < 18) return;
    v.stat.done = true;
    var k = v.stat.name;
    s[k] = Math.min(s[k] + 2, 999);
    if (k === 'strength') s.hpmax += 2; // the fitness channel raises max HP too, even at the cap
    if (v.statEl) v.statEl.textContent = String(s[k]);
  }

  // --- computer and stocks (frames 69-71 / 81-83) ----------------------------------------------
  function buildComputer(g) {
    var p = panel(g);
    field(p, 'What would you like to do?', PANEL.x, 64, 360, { size: 12, align: 'center' });
    ibtn(g, p, { icon: 'stocks', label: 'BUY/SELL STOCKS', x: 202.5, y: 120, size: 38, gap: 7, w: 200, id: 'stocks' }, function () { openStocks(g); });
    tbtn(g, p, 'OK', 446.5, 252.5, 69.5, 25.5, 'ok', toMenu);
  }

  // Entering the stock list works out each day's change (coloured red / green) and cuts both the
  // change and the price itself to two decimals (toward zero), as the original's frame 70 did.
  function openStocks(g) {
    var s = g.s;
    var rows = {};
    STOCKS.forEach(function (k) {
      var st = s.stocks[k];
      var diff = st.price - st.prev;
      rows[k] = { diff: trunc2(diff), color: diff < 0 ? '#990000' : diff > 0 ? '#00ff00' : '#000' };
      st.price = trunc2(st.price);
    });
    show(g, 'stocks', { rows: rows });
  }

  var ROWS = { // stage y of each row's pieces, measured from the original
    name: [107.5, 134.6, 160.6, 188.6, 216.6, 243.6],
    dollar: [106.8, 133.8, 160.8, 188.8, 216.8, 245.8],
    price: [106.5, 133.6, 161.6, 188.6, 216.6, 245.6],
    diff: [106.5, 134.6, 160.6, 188.6, 216.6, 245.6],
    units: [106.5, 135.6, 162.6, 190.6, 217.6, 245.6],
    btn: [116, 143, 171, 199, 227, 254],
  };

  function stockHeads(p, dx) {
    field(p, 'Name', 187.7 + dx, 69.4, null, { size: 12 });
    field(p, 'Price/Unit', 244.2 + dx, 69.4, null, { size: 12 });
    field(p, 'Gain/Loss', 321.2 + dx, 69.4, null, { size: 12 });
    field(p, '# of Units<br>You Own', 396.4 + dx, 51.4, null, { size: 12, lh: 16.9 });
    var line = ui.el('div', 'nopoint', p);
    line.style.cssText = 'position:absolute;left:' + (190.6 + dx - OX) + 'px;top:' + (95.5 - OY) + 'px;width:270.8px;height:1px;background:#000';
  }

  function buildStocks(g) {
    var s = g.s, v = V(g);
    var p = panel(g);
    stockHeads(p, 0);
    STOCKS.forEach(function (k, i) {
      var st = s.stocks[k], row = v.rows[k];
      field(p, k, 191.8, ROWS.name[i], 31.6, { size: 12, align: 'center' });
      field(p, '$', 250.3, ROWS.dollar[i], null, { size: 12 });
      field(p, '$', 321.3, ROWS.dollar[i], null, { size: 12 });
      field(p, String(st.price), 258.8, ROWS.price[i], 42.2, { size: 12, font: PLAIN, bold: false, align: 'center', id: 'price-' + k });
      field(p, String(row.diff), 327.8, ROWS.diff[i], 46.1, { size: 12, font: PLAIN, bold: false, align: 'center', color: row.color, id: 'diff-' + k });
      field(p, String(st.units), 396.75, ROWS.units[i], 62.2, { size: 12, font: PLAIN, bold: false, align: 'center', id: 'units-' + k });
      tbtn(g, p, 'BUY/SELL', 470.6, ROWS.btn[i] - 11.25, 62.5, 22.5, 'trade-' + k, function () {
        // The row's figures go to the buy/sell screen as they are now.
        show(g, 'trade', { trade: { k: k, price: st.price, diff: row.diff, yours: st.units, bought: st.bought } });
      }, 9);
    });
    tbtn(g, p, 'OK', 188, 269.5, 69, 25.5, 'ok', function () { show(g, 'computer'); });
  }

  // BUY / SELL (the original's buttons, bugs and all): a failed order is silent, and a successful
  // one for any stock but SAR also plays the error sound, because the original's last per-stock
  // "if" carried the else branch.
  // The AMOUNT field is read with int($_root.units): Flash's string-to-number (a leading 0 makes it
  // octal, so '0100' is 64) and a 32-bit int (SRPG.util.flashInt, as the bank's AMOUNT).
  function units(g) {
    var inp = V(g).input;
    return SRPG.util.flashInt(inp ? inp.value : 0);
  }
  function buy(g) {
    var s = g.s, t = V(g).trade, n = units(g);
    if (!(n > 0 && t.yours + n < 1000000)) return;
    if (t.price * n > s.cash) return;
    g.sfx('purchase');
    t.yours += n;
    var st = s.stocks[t.k];
    st.units += n;
    s.cash -= Math.round(t.price * n);
    st.bought = t.price;
    if (t.k !== 'SAR') g.error();
    refreshTrade(g);
  }
  function sell(g) {
    var s = g.s, t = V(g).trade, n = units(g);
    if (!(n > 0 && !(t.yours < n))) return;
    g.sfx('work');
    t.yours -= n;
    s.stocks[t.k].units -= n;
    s.cash += Math.round(t.price * n);
    if (t.k !== 'SAR') g.error();
    refreshTrade(g);
  }
  // Only the "units you own" field follows along; the amount typed stays, and "You bought in at"
  // keeps the figure from when the screen opened.
  function refreshTrade(g) {
    var v = V(g);
    if (v.yoursEl) v.yoursEl.textContent = String(v.trade.yours);
  }

  function buildTrade(g) {
    var v = V(g), t = v.trade;
    var p = panel(g);
    stockHeads(p, 26);
    field(p, t.k, 217.8, 105.5, 32.2, { size: 12, font: PLAIN, bold: false, align: 'center', id: 'curstock' });
    field(p, '$', 278.3, 104.65, null, { size: 12 });
    field(p, '$', 348.3, 104.65, null, { size: 12 });
    field(p, String(t.price), 286.8, 104.5, 47.2, { size: 12, font: PLAIN, bold: false, align: 'center', id: 'curprice' });
    field(p, String(t.diff), 357.8, 104.5, 47.2, { size: 12, font: PLAIN, bold: false, align: 'center', id: 'curdiff' });
    v.yoursEl = field(p, String(t.yours), 422.75, 105.5, 62.2, { size: 12, font: PLAIN, bold: false, align: 'center', id: 'curyours' });
    field(p, 'AMOUNT:', 304.5, 156.5, null, { size: 14, color: '#000066' });
    var inp = ui.input(p, 307.3 - OX, 181.3 - OY, 72.75, { maxLength: 7, value: '0', onEnter: function () {} });
    inp.setAttribute('data-id', 'units');
    inp.style.cssText += ';height:24.6px;text-align:right;font:bold 14px ' + FONT + ';color:#000066;padding:1px 3px';
    v.input = inp;
    tbtn(g, p, 'BUY', 232, 180.5, 69.5, 25.5, 'buy', buy, 10);
    tbtn(g, p, 'SELL', 386, 180.5, 69.5, 25.5, 'sell', sell, 10);
    field(p, t.yours > 0 ? esc('You bought in at $' + t.bought + '. ') : '', 235, 214.9, 221, { size: 12, font: PLAIN, bold: false, align: 'center', id: 'boughtin' });
    tbtn(g, p, 'OK', 188, 269.5, 69, 25.5, 'ok', function () { show(g, 'computer'); });
  }

  // --- the election campaign (frames 88 / 89) --------------------------------------------------
  function openCampaign(g) {
    if (newsbody == null) newsbody = NOBODY_HOME;
    newsbody = CAMPAIGN;
    show(g, 'campaign');
  }

  // Each campaign costs its price whatever you have (cash can go negative, as in the original):
  // $50,000 wins on random(2) == 0, $100,000 on random(4) < 3, $200,000 always.
  function runCampaign(g, cost, won) {
    var s = g.s;
    s.cash -= cost;
    g.sfx('purchase');
    if (won) {
      newsbody = WON;
      if (s.electionMessage === 1) s.job = 8; // Dictator of Sticks
      if (s.electionMessage === 2) s.job = 9; // President of Sticks
    } else {
      newsbody = LOST;
      s.electionMessage = 3;
    }
    show(g, 'result');
  }

  function buildCampaign(g) {
    var v = V(g);
    var p = panel(g);
    field(p, 'RUN CAMPAIGN', 262, 45.5, 200, { size: 16, color: RED, align: 'center' });
    field(p, esc(newsbody), 210.2, 79.8, 317.7, { size: 14, align: 'center', lh: 19.7, h: 182.2, id: 'newsbody' });
    if (v.mode === 'campaign') {
      // The original's three campaign buttons show the same green money stack as BUY/SELL STOCKS.
      ibtn(g, p, { icon: 'stocks', label: 'RUN $50,000<br>CAMPAIGN', x: 210.5, y: 216.5, size: 38, gap: 7, w: 150, id: 'run50' }, function () {
        runCampaign(g, 50000, rnd(2) === 0);
      });
      ibtn(g, p, { icon: 'stocks', label: 'RUN $100,000<br>CAMPAIGN', x: 368, y: 218.5, size: 38, gap: 7, w: 150, id: 'run100' }, function () {
        runCampaign(g, 100000, rnd(4) < 3);
      });
      ibtn(g, p, { icon: 'stocks', label: 'RUN $200,000<br>CAMPAIGN', x: 209, y: 258, size: 37, gap: 7.5, w: 150, id: 'run200' }, function () {
        runCampaign(g, 200000, true);
      });
    }
    // LEAVE (on both screens) closes the nomination for good.
    ibtn(g, p, { icon: 'leave', label: 'LEAVE', x: 446.5, y: 260.5, w: 100, gap: 6.5, id: 'leave' }, function () {
      g.s.electionMessage = 3;
      toMenu(g);
    });
  }

  // --- screen dispatch ------------------------------------------------------------------------------
  var BUILD = {
    menu: buildMenu, night: buildNight, messages: buildMessages, satellite: buildSatellite,
    news: buildShow, fitness: buildShow, dating: buildShow, computer: buildComputer,
    stocks: buildStocks, trade: buildTrade, campaign: buildCampaign, result: buildCampaign,
  };

  function view(g) {
    var v = V(g);
    v.arts = [];
    v.statEl = null;
    v.yoursEl = null;
    v.input = null;
    BUILD[v.mode](g);
    return { custom: true };
  }

  function tick(g) {
    var v = V(g);
    v.t++;
    statTick(g);
    for (var i = 0; i < v.arts.length; i++) v.arts[i].draw();
  }

  // --- pictures above the panel -------------------------------------------------------------
  // The sleeping stick (frame 66) and the Z that swells, drifts and fades over 60 frames.
  var ZPATH = [ // frame, scale, dx, dy, alpha (sampled from the original's animation)
    [1, 0.25, 4.5, 7.8, 1], [6, 0.364, 6.3, 5.5, 1], [12, 0.456, 7.7, 3.5, 1], [18, 0.497, 8.3, 2.7, 1],
    [20, 0.5, 8.4, 2.6, 1], [24, 0.59, 4.8, -0.3, 1], [30, 0.688, 0.9, -3.5, 1], [36, 0.74, -1.2, -5.3, 1],
    [39, 0.749, -1.6, -5.5, 1], [42, 0.798, -0.1, -7.5, 0.81], [45, 0.859, 1.8, -9.8, 0.56], [48, 0.91, 3.3, -11.8, 0.36],
    [51, 0.949, 4.5, -13.3, 0.2], [54, 0.978, 5.4, -14.4, 0.09], [57, 0.994, 5.8, -15, 0.02], [60, 1, 6, -15.3, 0],
  ];
  function zAt(f) {
    for (var i = 1; i < ZPATH.length; i++) {
      var a = ZPATH[i - 1], b = ZPATH[i];
      if (f <= b[0]) {
        var u = (f - a[0]) / (b[0] - a[0]);
        return [0, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, a[3] + (b[3] - a[3]) * u, a[4] + (b[4] - a[4]) * u];
      }
    }
    return ZPATH[ZPATH.length - 1];
  }

  // Canvas origin at stage (300, 110).
  function drawSleeper(ctx, v) {
    var ox = 300, oy = 110;
    ctx.save();
    ctx.translate(-ox, -oy);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(309.5, 172.5);
    ctx.lineTo(314.5, 171.2);
    ctx.lineTo(320.5, 156.5);
    ctx.lineTo(339, 169.5);
    ctx.lineTo(354, 169.4);
    ctx.lineTo(368, 166.5);
    ctx.stroke();
    // arms folded along the body
    D.poly(ctx, [353, 169.4, 368.5, 163.8, 368.5, 169], '#000', '#000', 1);
    D.circle(ctx, 381.2, 166.8, 12.8, '#0066cc', '#000', 1.8);
    // the Z: sprite at (372.6, 132.7) scaled 1.5
    var z = zAt(((v.t % 60) + 1));
    if (z[4] > 0) {
      ctx.globalAlpha = z[4];
      var sc = 1.5 * z[1];
      D.text(ctx, 'Z', 372.6 + 1.5 * z[2], 132.7 + 1.5 * z[3] + 15 * sc, { size: 18 * sc, color: '#fff', font: '"Times New Roman", Times, serif' });
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // The answering machine (canvas origin at stage (199, 62)); its display blinks while there are
  // messages (the original's clip shows the lit display 6 frames of every 9).
  function drawMachine(ctx, v) {
    var lit = true;
    var s = SRPG.game.s;
    if (s && s.msgs.length > 0) lit = (v.t % 9) < 6;
    ctx.save();
    ctx.translate(-199, -62);
    ctx.lineJoin = 'round';
    // body
    var gr = ctx.createLinearGradient(201, 0, 233, 0);
    gr.addColorStop(0, '#2a2a2a');
    gr.addColorStop(0.5, '#5a5a5a');
    gr.addColorStop(1, '#2a2a2a');
    ctx.beginPath();
    ctx.moveTo(201, 70);
    ctx.quadraticCurveTo(201, 62.5, 217, 62.5);
    ctx.quadraticCurveTo(233, 62.5, 233, 70);
    ctx.lineTo(233, 104);
    ctx.quadraticCurveTo(233, 108.5, 228, 108.5);
    ctx.lineTo(206, 108.5);
    ctx.quadraticCurveTo(201, 108.5, 201, 104);
    ctx.closePath();
    ctx.fillStyle = gr;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#111';
    ctx.stroke();
    // speaker grille
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 0.9;
    for (var i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(204, 66.5 + i * 2.6);
      ctx.lineTo(230, 66.5 + i * 2.6);
      ctx.stroke();
    }
    D.rect(ctx, 202.5, 77, 29, 1.2, '#222');
    // display
    D.rect(ctx, 209.5, 80.5, 14, 10, '#110000', '#000', 0.6);
    ctx.fillStyle = lit ? '#ff1a1a' : '#5a0000';
    ctx.font = 'bold 9px ' + PLAIN;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('88', 216.5, 86);
    // side buttons
    D.rect(ctx, 203, 85.5, 5, 5, '#888', '#333', 0.6);
    D.rect(ctx, 226, 85.5, 5, 5, '#888', '#333', 0.6);
    // arrows, stop and the record light
    ctx.fillStyle = '#1e7bff';
    D.poly(ctx, [202.5, 99, 211.5, 96, 211.5, 102], '#1e7bff');
    D.rect(ctx, 213.5, 96.5, 6.5, 4.5, '#1e7bff');
    D.poly(ctx, [231.5, 99, 222.5, 96, 222.5, 102], '#1e7bff');
    D.circle(ctx, 216.7, 105, 2.3, '#cc0000', '#330000', 0.5);
    ctx.restore();
  }

  // The TV set picture (canvas origin at stage (185, 49)).
  function drawTV(ctx) {
    ctx.save();
    ctx.translate(-185, -49);
    ctx.lineJoin = 'round';
    // top face
    var top = ctx.createLinearGradient(187, 51, 236, 60);
    top.addColorStop(0, '#9a9a9a');
    top.addColorStop(0.6, '#d4d4d4');
    top.addColorStop(1, '#8c8c8c');
    D.poly(ctx, [187, 60, 196, 51, 236.5, 51, 228, 60], top, '#000', 1);
    // side
    D.poly(ctx, [228, 60, 236.5, 51, 236.5, 98, 228, 107], '#222', '#000', 1);
    D.poly(ctx, [228, 60, 236.5, 51, 236.5, 76, 228, 86], '#6a6a6a', '#000', 1);
    // front: grey upper half with the screen, dark lower half
    var fr = ctx.createLinearGradient(187, 60, 228, 86);
    fr.addColorStop(0, '#8e8e8e');
    fr.addColorStop(1, '#bdbdbd');
    D.rect(ctx, 187, 60, 41, 26.5, fr, '#000', 1);
    D.rect(ctx, 187, 86.5, 41, 20.5, '#333', '#000', 1);
    D.rect(ctx, 190.5, 63, 34.5, 21, '#1a1a1a');
    var sc = ctx.createLinearGradient(192, 64, 224, 83);
    sc.addColorStop(0, '#5c5c5c');
    sc.addColorStop(1, '#777');
    D.rect(ctx, 192, 64.5, 31.5, 18, sc);
    ctx.restore();
  }

  // The fitness channel's lifter (canvas origin at stage (300, 90)): a 24-frame overhead press,
  // the bar going from the chest up past the head and back down.
  function drawLifter(ctx, v) {
    var up = (1 - Math.cos((v.t % 24) / 24 * Math.PI * 2)) / 2; // 0 = chest, 1 = overhead
    ctx.save();
    ctx.translate(-300, -90);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    var cx = 358.5, headY = 138, barY = 157 - up * 31;
    var handX = 14.5 + up * 4;
    var elX = 14.5 - up * 5, elY = 171 - up * 30;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(346, 216);
    ctx.lineTo(cx, 187);
    ctx.lineTo(370.5, 216);
    ctx.moveTo(cx, 187);
    ctx.lineTo(cx, 154);
    ctx.stroke();
    D.circle(ctx, cx, headY, 16.3, '#0066cc', '#000', 1.6);
    ctx.beginPath();
    [-1, 1].forEach(function (d) {
      ctx.moveTo(cx, 155);
      ctx.lineTo(cx + d * elX, elY);
      ctx.lineTo(cx + d * handX, barY);
    });
    ctx.stroke();
    // bar and plates
    var bar = ctx.createLinearGradient(0, barY - 2, 0, barY + 2);
    bar.addColorStop(0, '#eee');
    bar.addColorStop(1, '#777');
    D.rect(ctx, 307, barY - 2, 107, 4, bar, '#333', 0.6);
    [[325.5, 1], [395.5, -1]].forEach(function (pl) {
      var x = pl[0];
      ctx.beginPath();
      ctx.ellipse(x, barY, 12.5, 15.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#111';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#000';
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(x - pl[1] * 3, barY, 8, 13, 0, 0, Math.PI * 2);
      ctx.strokeStyle = '#8a8a8a';
      ctx.stroke();
      D.rect(ctx, x - 3, barY - 3.5, 6, 7, '#aaa', '#333', 0.6);
    });
    ctx.restore();
  }

  // The ERASE / NEXT MESSAGE tile's fast-forward arrows.
  function ffIcon(tile, size) {
    if (!tile) return;
    var c = document.createElement('canvas');
    c.width = size * 3;
    c.height = size * 3;
    c.style.cssText = 'display:block;width:' + size + 'px;height:' + size + 'px';
    var ctx = c.getContext('2d');
    ctx.scale(3 * size / 35, 3 * size / 35);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Two overlapping flat blue arrows, the left one in front, each with a dark lower edge.
    [16, 6.7].forEach(function (x) {
      D.poly(ctx, [x, 9.7, x + 16, 17.5, x, 25.3], '#0099ff');
      lines(ctx, [x, 9.7, x, 25.3, x + 16, 17.5], '#000066', 1.1);
      lines(ctx, [x, 9.7, x + 16, 17.5], '#33b3ff', 0.6);
    });
    tile.appendChild(c);
  }

  // --- rooms ------------------------------------------------------------------------------------------
  function lines(ctx, pts, color, lw) {
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (var i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.strokeStyle = color;
    ctx.lineWidth = lw || 1;
    ctx.stroke();
  }
  function lin(ctx, x0, y0, x1, y1, stops) {
    var gr = ctx.createLinearGradient(x0, y0, x1, y1);
    for (var i = 0; i < stops.length; i += 2) gr.addColorStop(stops[i], stops[i + 1]);
    return gr;
  }

  // The first apartment's shell (also the empty old apartment): grey ceiling, white walls, the
  // flared chimney with its black fireplace, the balcony door and the brown floor.
  function apartmentShell(ctx, curtains) {
    var ceil = ctx.createRadialGradient(150, 95, 0, 150, 95, 330);
    ceil.addColorStop(0, '#979797');
    ceil.addColorStop(0.33, '#cccccc');
    ceil.addColorStop(1, '#f0f0f0');
    ctx.fillStyle = ceil;
    ctx.fillRect(0, 0, 550, 120);
    // back wall and left wall
    D.poly(ctx, [124, 77.5, 183, 64, 241, 57, 270, 27, 545, -2, 550, -2, 550, 320, 124, 240], '#e2e2e2');
    D.poly(ctx, [0, 23.5, 124, 77.5, 124, 231, 0, 266], '#f4f4f4');
    lines(ctx, [0, 23.5, 124, 77.5, 183, 64], '#8a8a8a', 1.5);
    lines(ctx, [124, 77.5, 124, 231], '#9a9a9a', 1.5);
    lines(ctx, [241, 57, 270, 27, 545, -3], '#8a8a8a', 1.2);
    // the chimney: a white column flaring out to the floor
    ctx.beginPath();
    ctx.moveTo(183, 64);
    ctx.bezierCurveTo(184, 150, 178, 200, 156, 237);
    ctx.lineTo(272, 259);
    ctx.bezierCurveTo(250, 220, 243, 150, 241, 57);
    ctx.closePath();
    ctx.fillStyle = '#f6f6f6';
    ctx.fill();
    ctx.strokeStyle = '#a8a8a8';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    D.poly(ctx, [241, 57, 270, 27, 270, 90, 241, 110], '#d2d2d2');
    D.poly(ctx, [180, 189, 233, 190, 233, 251.5, 180, 241], '#000');
    D.rect(ctx, 180, 189, 5, 52, '#a40000');
    D.poly(ctx, [228, 190, 233, 190, 233, 251.5, 228, 250.5], '#a40000');
    // floor
    D.poly(ctx, [0, 266, 124, 231, 305, 263, 493, 296, 550, 306, 550, 400, 0, 400], '#993300');
    lines(ctx, [0, 266, 124, 231, 305, 263], '#9a9a9a', 1.5);
    // the balcony door
    D.poly(ctx, [304, 69, 506, 46, 504, 293, 305, 261], '#66ccff');
    D.poly(ctx, [304, 167, 504, 167, 504, 181, 304, 181], '#333');
    [318, 344, 372, 404, 429, 454, 480].forEach(function (x) {
      var yb = 261 + (x - 305) * 0.162;
      D.rect(ctx, x - 3.5, 181, 7.5, yb - 181, '#333');
    });
    D.rect(ctx, 389.5, 58, 7.5, 222, '#000');
    lines(ctx, [304, 69, 506, 46, 504, 293, 305, 261, 304, 69], '#000', 3.5);
    if (curtains) {
      lines(ctx, [283, 64, 537, 28], '#bbb', 2.2);
      D.circle(ctx, 283, 64, 3.2, '#000');
      D.circle(ctx, 537, 28.5, 4.6, '#000');
      var cg = lin(ctx, 283, 0, 304, 0, [0, '#8a7412', 0.45, '#d8bc2c', 1, '#8a7412']);
      ctx.beginPath();
      ctx.moveTo(286, 61);
      ctx.quadraticCurveTo(294, 58, 302, 61);
      ctx.lineTo(304, 262);
      ctx.quadraticCurveTo(296, 268, 288, 263);
      ctx.quadraticCurveTo(282, 266, 280, 262);
      ctx.closePath();
      ctx.fillStyle = cg;
      ctx.fill();
      ctx.strokeStyle = '#4a3e08';
      ctx.lineWidth = 1;
      ctx.stroke();
      var cg2 = lin(ctx, 500, 0, 534, 0, [0, '#8a7412', 0.5, '#d8bc2c', 1, '#8a7412']);
      ctx.beginPath();
      ctx.moveTo(503, 30);
      ctx.quadraticCurveTo(518, 25, 530, 29);
      ctx.lineTo(534, 300);
      ctx.lineTo(500, 300);
      ctx.closePath();
      ctx.fillStyle = cg2;
      ctx.fill();
      ctx.stroke();
    }
  }

  function drawApartment1(ctx) {
    apartmentShell(ctx, true);
    // chest of drawers
    D.poly(ctx, [0, 160.5, 71, 156, 99, 165, 0, 172], '#957815', '#000', 1.2);
    D.poly(ctx, [0, 172, 99, 165, 95, 166, 95, 254, 0, 283], '#7b6411', '#000', 1.4);
    D.poly(ctx, [0, 197, 95, 186, 95, 254, 0, 283], '#604d0d', '#000', 1.4);
    lines(ctx, [41, 169, 41, 270], '#000', 1.2);
    D.circle(ctx, 13.5, 186, 2.6, '#e8d000', '#000', 0.8);
    D.circle(ctx, 69, 179.5, 2.6, '#e8d000', '#000', 0.8);
    // rug
    D.poly(ctx, [185, 400, 290, 299, 560, 352, 560, 400], '#ff3300');
    lines(ctx, [185, 400, 290, 299, 560, 352], '#ff9900', 2.2);
    // armchair
    var ch = lin(ctx, 475, 0, 550, 0, [0, '#1e1e1e', 0.5, '#3b3b3b', 1, '#6e6e6e']);
    ctx.lineJoin = 'round';
    D.roundRect(ctx, 493, 232, 70, 30, 8, ch, '#000', 1.5);
    D.rect(ctx, 495, 258, 60, 60, ch, '#000', 1.5);
    D.roundRect(ctx, 475, 313, 90, 15, 7, ch, '#000', 1.5);
    D.rect(ctx, 478, 327, 80, 80, lin(ctx, 478, 0, 550, 0, [0, '#3b3b3b', 1, '#6a6a6a']), '#000', 1.5);
    ctx.beginPath();
    ctx.moveTo(501, 331);
    ctx.quadraticCurveTo(515, 300, 552, 282);
    ctx.lineTo(552, 380);
    ctx.quadraticCurveTo(515, 368, 501, 331);
    ctx.closePath();
    ctx.fillStyle = lin(ctx, 500, 300, 550, 370, [0, '#a09050', 1, '#5a4a10']);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function drawApartment2(ctx) {
    ctx.fillStyle = '#ffffdf';
    ctx.fillRect(0, 0, 550, 400);
    // balcony door on the left: sky, railing, balcony floor
    D.rect(ctx, 22, 0, 181, 260, '#66ccff');
    D.poly(ctx, [22, 158, 203, 130, 203, 212, 22, 256], '#fec68f');
    lines(ctx, [60, 190, 180, 165], '#ffe4c4', 1);
    lines(ctx, [40, 230, 150, 205], '#ffe4c4', 1);
    [62, 116, 170].forEach(function (x) {
      var y0 = 106 - (x - 22) * 0.144, y1 = 160 - (x - 22) * 0.155;
      D.rect(ctx, x - 2.5, y0, 5, y1 - y0, '#994400', '#000', 0.8);
    });
    D.poly(ctx, [22, 102, 203, 76, 203, 84, 22, 110], '#ed7701', '#000', 0.8);
    D.poly(ctx, [22, 129, 203, 104, 203, 112, 22, 137], '#ed7701', '#000', 0.8);
    D.rect(ctx, 0, 0, 15, 263, '#66ffff');
    D.rect(ctx, 210, 0, 14, 212, '#66ffff');
    lines(ctx, [3, 40, 9, 55], '#fff', 1);
    lines(ctx, [4, 120, 10, 135], '#fff', 1);
    lines(ctx, [214, 30, 219, 45], '#fff', 1);
    lines(ctx, [213, 150, 219, 170], '#fff', 1);
    D.rect(ctx, 15, 0, 7, 258, '#999', '#000', 1);
    D.rect(ctx, 203, 0, 7, 213, '#999', '#000', 1);
    // floor
    D.poly(ctx, [0, 263, 22, 256, 203, 214, 461, 157, 461, 400, 0, 400], lin(ctx, 0, 0, 461, 0, [0, '#ece68c', 1, '#fffde0']));
    lines(ctx, [0, 263, 22, 256, 203, 214, 330, 187], '#000', 1.2);
    lines(ctx, [328, 0, 328, 188], '#000', 1);
    // the right wall
    D.poly(ctx, [461, 0, 550, 0, 550, 372, 461, 396], '#ffffe8');
    lines(ctx, [461, 0, 461, 396, 550, 372], '#000', 1);
    // painting
    D.poly(ctx, [411, 13, 462, 31, 462, 112, 411, 89], '#ff0000', '#000', 1);
    D.poly(ctx, [415, 19, 458, 35, 458, 105, 415, 84], '#0033ff');
    D.poly(ctx, [415, 19, 458, 35, 458, 58, 415, 44], '#888');
    lines(ctx, [417, 42, 425, 38, 432, 44, 441, 42, 450, 50, 457, 54], '#555', 2);
    lines(ctx, [420, 62, 428, 58, 436, 64], '#fff', 1);
    lines(ctx, [430, 80, 438, 76, 446, 82], '#fff', 1);
    // the round sofa
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(322, 200);
    ctx.bezierCurveTo(318, 150, 340, 118, 367, 99);
    ctx.bezierCurveTo(400, 105, 440, 118, 462, 132);
    ctx.lineTo(462, 280);
    ctx.bezierCurveTo(410, 272, 350, 240, 322, 200);
    ctx.closePath();
    ctx.fillStyle = '#ffff99';
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(330, 178);
    ctx.bezierCurveTo(380, 190, 420, 210, 462, 236);
    ctx.lineTo(462, 280);
    ctx.bezierCurveTo(410, 272, 350, 240, 326, 202);
    ctx.closePath();
    ctx.fillStyle = '#fefda0';
    ctx.fill();
    ctx.stroke();
    lines(ctx, [385, 150, 415, 170, 385, 208], '#aaa', 1);
    lines(ctx, [415, 170, 460, 180], '#aaa', 1);
    D.roundRect(ctx, 345, 129, 45, 28, 8, '#f3eab0', '#000', 1);
    // plant
    plant(ctx, 519, 352, 1);
  }

  // A broad-leaved pot plant; (x, y) is the middle of the pot's rim.
  function plant(ctx, x, y, k) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k, k);
    // leaves: tip x, tip y, width
    var leaves = [[-62, -8, 9], [-48, -34, 10], [-22, -46, 9], [8, -52, 9], [36, -44, 10], [52, -20, 10], [-34, -22, 11], [22, -28, 11], [-6, -30, 10]];
    leaves.forEach(function (l, i) {
      var len = Math.sqrt(l[0] * l[0] + l[1] * l[1]);
      var nx = -l[1] / len * l[2], ny = l[0] / len * l[2];
      var mx = l[0] * 0.5, my = l[1] * 0.5 - len * 0.18;
      ctx.beginPath();
      ctx.moveTo(0, -1);
      ctx.quadraticCurveTo(mx + nx, my + ny, l[0], l[1]);
      ctx.quadraticCurveTo(mx - nx, my - ny, 0, -1);
      ctx.fillStyle = lin(ctx, 0, 0, l[0], l[1], [0, '#0b5e2a', 0.6, i % 2 ? '#2f9a55' : '#1f8040', 1, '#5fc07a']);
      ctx.fill();
      ctx.strokeStyle = '#003311';
      ctx.lineWidth = 1;
      ctx.stroke();
    });
    D.poly(ctx, [-29, 0, 29, 0, 23, 43, -23, 43], lin(ctx, -29, 0, 29, 0, [0, '#6a0000', 0.5, '#b00000', 1, '#6a0000']), '#000', 1.2);
    D.rect(ctx, -31, -3, 62, 6, '#920000', '#000', 1.2);
    ctx.restore();
  }

  function drawApartment3(ctx) {
    // ceiling with its lights
    ctx.fillStyle = '#ffffce';
    ctx.fillRect(0, 0, 550, 130);
    [[92, 53, 23], [241, 41, 23], [377, 29, 22], [508, 18, 22]].forEach(function (l) {
      ctx.beginPath();
      ctx.ellipse(l[0], l[1], l[2], 5, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#fffffb';
      ctx.fill();
      ctx.strokeStyle = '#aaa';
      ctx.lineWidth = 1;
      ctx.stroke();
    });
    // the gold trim and the white strip under it
    D.rect(ctx, 0, 104, 141, 17, '#ffffd9');
    D.poly(ctx, [141, 105, 550, 68, 550, 121, 141, 121], '#ffffd9');
    D.rect(ctx, 0, 94, 141, 10.5, '#e0b727', '#000', 1);
    D.poly(ctx, [141, 93, 550, 54, 550, 68, 141, 105], '#e0b727', '#000', 1);
    D.poly(ctx, [248, 84, 550, 55, 550, 60, 248, 88], '#000');
    // windows: sky, sea-glass band, peach sill
    D.rect(ctx, 0, 121, 141, 44, '#66ccff');
    D.rect(ctx, 0, 165, 141, 35, '#66ffff');
    D.rect(ctx, 0, 200, 141, 44, '#ffdcb9');
    D.poly(ctx, [141, 121, 550, 121, 550, 218, 141, 165], '#66ccff');
    D.poly(ctx, [141, 165, 550, 218, 550, 300, 141, 200], '#66ffff');
    D.poly(ctx, [141, 200, 550, 300, 550, 365, 141, 244], '#ffdcb9');
    lines(ctx, [0, 165, 141, 165, 550, 218], '#bbb', 0.8);
    lines(ctx, [0, 200, 141, 200, 550, 300], '#bbb', 0.8);
    [[30, 212, 120, 212], [20, 228, 110, 228], [170, 214, 230, 232], [300, 250, 360, 268], [430, 290, 500, 312]].forEach(function (l) {
      lines(ctx, l, '#e6c6a6', 1);
    });
    [[150, 180, 160, 170], [290, 180, 300, 170], [440, 190, 452, 178], [500, 210, 512, 198]].forEach(function (l) {
      lines(ctx, l, '#fff', 1.2);
    });
    lines(ctx, [0, 244, 141, 244], '#000', 1);
    lines(ctx, [75, 121, 75, 244], '#000', 1.2);
    lines(ctx, [141, 105, 141, 244], '#000', 1.2);
    D.rect(ctx, 246, 121, 8, 150, '#000');
    D.rect(ctx, 311, 121, 5, 175, '#000');
    D.rect(ctx, 377, 83, 28, 238, '#ffffea', '#000', 1);
    D.rect(ctx, 405, 83, 10, 242, '#000');
    D.rect(ctx, 503, 121, 5, 230, '#000');
    // floor
    D.poly(ctx, [0, 244, 141, 244, 550, 365, 550, 400, 0, 400], '#e9e9e9');
    lines(ctx, [141, 244, 550, 365], '#555', 1);
    // coffee table with a plant
    D.poly(ctx, [40, 284, 140, 284, 125, 313, 18, 313], '#663300', '#000', 1);
    D.rect(ctx, 18, 313, 107, 12, '#fe8a16', '#000', 1);
    D.rect(ctx, 18, 325, 7, 52, '#fe8a16', '#000', 1);
    D.rect(ctx, 49, 325, 6, 33, '#fe8a16', '#000', 1);
    D.rect(ctx, 118, 325, 7, 40, '#fe8a16', '#000', 1);
    plant(ctx, 84, 286, 0.5);
    // the grey sofa, seen from behind
    var sg = lin(ctx, 113, 0, 278, 0, [0, '#333', 0.45, '#5a5a5a', 1, '#9a9a9a']);
    ctx.beginPath();
    ctx.moveTo(160, 290);
    ctx.bezierCurveTo(160, 245, 200, 228, 250, 230);
    ctx.bezierCurveTo(272, 232, 278, 240, 278, 262);
    ctx.lineTo(276, 322);
    ctx.lineTo(190, 377);
    ctx.lineTo(160, 377);
    ctx.closePath();
    ctx.fillStyle = sg;
    ctx.fill();
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(116, 300);
    ctx.bezierCurveTo(116, 290, 130, 288, 150, 290);
    ctx.lineTo(190, 295);
    ctx.lineTo(190, 377);
    ctx.lineTo(118, 377);
    ctx.bezierCurveTo(112, 350, 112, 320, 116, 300);
    ctx.closePath();
    ctx.fillStyle = lin(ctx, 113, 0, 190, 0, [0, '#3a3a3a', 1, '#6a6a6a']);
    ctx.fill();
    ctx.stroke();
  }

  function drawOldApartment(ctx) {
    apartmentShell(ctx, false);
  }

  function drawMansion(ctx) {
    ctx.fillStyle = '#dcdcdc';
    ctx.fillRect(0, 0, 550, 170);
    D.poly(ctx, [492, 0, 550, 0, 550, 214, 492, 156], '#d6d6d6');
    // floor and skirting
    D.poly(ctx, [0, 168, 492, 168, 550, 226, 550, 400, 0, 400], '#e9d96b');
    D.rect(ctx, 0, 155, 492, 13, '#d05757', '#000', 1);
    D.poly(ctx, [492, 155, 550, 212, 550, 226, 492, 168], '#a94747', '#000', 1);
    lines(ctx, [492, 0, 492, 156], '#000', 1);
    // the staircase: a landing, then steps narrowing as they climb to the right
    var st = [[138, 168, 0], [100, 115.5, 17], [77.5, 90.5, 39], [62.5, 72.5, 59], [51, 59, 76], [39.5, 47.5, 94], [32, 37, 112], [24, 30, 121], [16, 21, 126], [8, 13, 129], [0, 5, 131]];
    for (var i = st.length - 1; i >= 0; i--) {
      var a = st[i], nx = st[i + 1];
      var right = i === 0 ? 149 : 132;
      var treadTop = nx ? nx[1] : a[0] - 4;
      var nxl = nx ? nx[2] : a[2] + 3;
      if (i === 0) D.poly(ctx, [0, 138, 0, 127, 17, 115.5, 132, 115.5, 149, 138], '#cc6600', '#000', 1);
      else D.poly(ctx, [a[2], a[0], nxl, treadTop, 132, treadTop, 132, a[0]], '#cc6600', '#000', 1);
      D.rect(ctx, a[2], a[0], right - a[2], a[1] - a[0], '#7a3f00', '#000', 1.2);
    }
    lines(ctx, [132, 0, 132, 116], '#000', 1);
    ctx.beginPath();
    ctx.moveTo(-2, 76);
    ctx.quadraticCurveTo(45, 12, 132, 0);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.strokeStyle = '#ddcc11';
    ctx.lineWidth = 3.8;
    ctx.stroke();
    // the palm in its pot
    ctx.beginPath();
    ctx.moveTo(268, 138);
    ctx.bezierCurveTo(276, 100, 264, 70, 263, 42);
    ctx.strokeStyle = '#3c3418';
    ctx.lineWidth = 7.5;
    ctx.stroke();
    ctx.strokeStyle = lin(ctx, 258, 0, 276, 0, [0, '#7c6e3a', 0.5, '#b8aa70', 1, '#7c6e3a']);
    ctx.lineWidth = 5.5;
    ctx.stroke();
    // drooping fronds: [tip x, tip y, bulge]
    [[236, 66, -1], [242, 52, -1], [250, 60, -0.6], [276, 58, 0.6], [292, 60, 1], [301, 45, 1], [266, 50, 0.2], [248, 30, -1], [288, 26, 1], [262, 8, 0], [272, 14, 0.5], [252, 16, -0.6]].forEach(function (f, i) {
      var bx = 263 + (f[0] - 263) * 0.6 + f[2] * 6, by = Math.min(f[1], 40) - 22;
      ctx.beginPath();
      ctx.moveTo(263, 40);
      ctx.quadraticCurveTo(bx, by, f[0], f[1]);
      ctx.quadraticCurveTo(bx + f[2] * 4, by + 12, 263, 44);
      ctx.fillStyle = i % 3 === 1 ? '#2ea04a' : '#0f7a1e';
      ctx.fill();
      ctx.strokeStyle = '#053a0c';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    });
    D.poly(ctx, [254, 135, 290, 135, 286, 168, 258, 168], lin(ctx, 254, 0, 290, 0, [0, '#5e0000', 0.5, '#b40000', 1, '#5e0000']), '#000', 1);
    D.rect(ctx, 252.5, 133, 39, 5, '#8a0000', '#000', 1);
    // the double door
    D.rect(ctx, 359, 36, 133, 132, '#666', '#000', 1);
    D.rect(ctx, 372, 47, 106, 121, '#d8d8d8', '#000', 1);
    lines(ctx, [422, 47, 422, 168], '#000', 1);
    [[382, 59, 22, 42], [440, 59, 22, 42], [383, 108, 21, 42], [440, 108, 21, 42]].forEach(function (r) {
      D.rect(ctx, r[0], r[1], r[2], r[3], '#d8d8d8', '#000', 1);
    });
    D.circle(ctx, 413, 105, 4.8, '#ffd735', '#000', 1);
    D.circle(ctx, 433, 105, 4.8, '#ffd735', '#000', 1);
    // the rug
    D.poly(ctx, [130, 237, 418, 237, 550, 370, 0, 370], lin(ctx, 0, 237, 0, 370, [0, '#c24c4c', 1, '#e86868']), '#000', 1);
    var rg = ctx.createRadialGradient(275, 300, 5, 275, 300, 200);
    rg.addColorStop(0, '#ff0000');
    rg.addColorStop(1, '#c80000');
    D.poly(ctx, [174, 253, 378, 253, 470, 350, 80, 350], rg, '#000', 1);
    // the table
    D.poly(ctx, [213, 180, 325, 180, 348, 203, 194, 203], lin(ctx, 0, 180, 0, 203, [0, '#b0781c', 1, '#8a5a06']), '#000', 1);
    D.poly(ctx, [194, 203, 348, 203, 344, 210, 197, 210], '#6a4400', '#000', 1);
    [[200, 210, 191, 252], [343, 210, 352, 252], [232, 210, 229, 232], [313, 210, 316, 232]].forEach(function (l) {
      lines(ctx, l, '#000', 3.2);
    });
    [[191, 252, -1], [352, 252, 1], [229, 232, -1], [316, 232, 1]].forEach(function (c) {
      ctx.beginPath();
      ctx.arc(c[0] + c[2] * 4, c[1], 4, 0, Math.PI);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  }

  // A round corner tower: body, then a wider crown whose front wall is notched so the pale inner
  // ring shows through, a dark panel on the crown and a slot window low on the body.
  function tower(ctx, cx, b0, b1, rx, win) {
    var body = lin(ctx, b0, 0, b1, 0, [0, '#7a7a7a', 0.45, '#a0a0a0', 1, '#7a7a7a']);
    D.rect(ctx, b0, 200, b1 - b0, 210, body, '#333', 2.5);
    D.roundRect(ctx, win - 10, 270, 20, 60, 10, '#5a5a5a', '#333', 2.5);
    var crown = lin(ctx, cx - rx, 0, cx + rx, 0, [0, '#7c7c7c', 0.45, '#a6a6a6', 1, '#7c7c7c']);
    // back merlons standing on the far rim
    [-0.62, -0.05, 0.5].forEach(function (u) {
      var x = cx + u * rx;
      D.rect(ctx, x - 9, 107 + Math.abs(u) * 18, 19, 40, crown, '#333', 2.5);
    });
    ctx.beginPath();
    ctx.ellipse(cx, 160, rx, 26, 0, 0, Math.PI * 2);
    ctx.fillStyle = crown;
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx, 163, rx - 9, 16, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#dedede';
    ctx.fill();
    ctx.stroke();
    // the front wall of the crown, notched along its top
    var pts = [cx - rx, 168];
    var n = 5;
    for (var i = 0; i < n; i++) {
      var xa = cx - rx + (2 * rx) * (i / n), xb = cx - rx + (2 * rx) * ((i + 0.55) / n);
      var sag = 12 * (1 - Math.pow((xa + xb) / 2 - cx, 2) / (rx * rx));
      pts.push(xa, 163 + sag * 0.6, xb, 163 + sag * 0.6, xb, 180 + sag, xa + (2 * rx) / n, 180 + sag);
    }
    pts.push(cx + rx, 168, cx + rx, 205);
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (var j = 2; j < pts.length; j += 2) ctx.lineTo(pts[j], pts[j + 1]);
    ctx.ellipse(cx, 205, rx, 24, 0, 0, Math.PI, false);
    ctx.closePath();
    ctx.fillStyle = crown;
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    D.rect(ctx, cx - rx * 0.62, 189, rx * 0.95, 29, '#6c6c6c', '#333', 2.5);
  }

  function drawCastle(ctx) {
    D.rect(ctx, 0, 0, 550, 97, '#66ccff');
    D.rect(ctx, 0, 97, 550, 170, '#00cc00');
    lines(ctx, [0, 97.5, 550, 97.5], '#000', 1.2);
    [[168, 190, 1], [155, 185, 0.8], [318, 168, 0.8], [378, 132, 0.6]].forEach(function (t) {
      ctx.save();
      ctx.translate(t[0], t[1]);
      ctx.scale(t[2], t[2]);
      D.poly(ctx, [-3, 0, 3, 0, 2, -30, -2, -30], '#8a4a14', '#422100', 1);
      [[-8, -32, 8], [6, -34, 8], [0, -44, 9], [-10, -44, 6], [9, -45, 6]].forEach(function (b) {
        D.circle(ctx, b[0], b[1], b[2], '#339966', '#1a4d33', 1);
      });
      ctx.restore();
    });
    // the front wall and its battlements
    D.rect(ctx, 72, 250, 392, 160, lin(ctx, 72, 0, 464, 0, [0, '#666', 1, '#6e6e6e']), '#333', 2.5);
    for (var i = 0; i < 8; i++) {
      var x = 72 + i * 47.4;
      D.poly(ctx, [x, 235, x + 8, 229, x + 39, 229, x + 31, 235], '#dcdcdc', '#333', 2.5);
      D.rect(ctx, x, 235, 31, 23, '#6e6e6e', '#333', 2.5);
      D.poly(ctx, [x + 31, 250, x + 39, 244, x + 48, 244, x + 40, 250], '#cfcfcf', '#333', 2);
    }
    tower(ctx, 45, -10, 72, 49, 4);
    tower(ctx, 510, 463, 560, 50, 489);
  }

  // --- registration ----------------------------------------------------------------------------------
  function onEnter(g) { V(g); }

  SRPG.registerLocation({
    id: 'home',
    exit: 'home',
    background: function (ctx, s) {
      if (s.dwelling === 2) drawApartment2(ctx);
      else if (s.dwelling === 3) drawApartment3(ctx);
      else drawApartment1(ctx);
    },
    onEnter: onEnter,
    tick: tick,
    view: view,
  });

  SRPG.registerLocation({
    id: 'mansion',
    exit: 'mansion',
    background: function (ctx, s) {
      if (s.dwelling === 5) drawCastle(ctx);
      else drawMansion(ctx);
    },
    onEnter: onEnter,
    tick: tick,
    view: view,
  });

  // The apartment after moving to the mansion or castle: an empty room and LEAVE.
  SRPG.registerLocation({
    id: 'oldapartment',
    exit: 'oldapartment',
    background: function (ctx) { drawOldApartment(ctx); },
    view: function (g) {
      var p = blankPanel('oldapartment');
      // The original's line sits where the menu heading does (text 1883 at the same spot as 1890).
      field(p, "Looks like this isn't your place anymore...", PANEL.x, 64, 360, { size: 12, align: 'center', nowrap: true, id: 'oldtext' });
      ibtn(g, p, { icon: 'leave', label: 'LEAVE', x: 439, y: 247.5, w: 100, id: 'leave' }, function () { g.leave(); });
      return { custom: true };
    },
  });

  // Test / debug access.
  SRPG.home = {
    visit: function () { var g = SRPG.location.g; return g && g.home; },
    get newsbody() { return newsbody; },
    set newsbody(v) { newsbody = v; },
    NEWS: NEWS, DATING: DATING, CAMPAIGN: CAMPAIGN, WON: WON, LOST: LOST, NOBODY_HOME: NOBODY_HOME,
  };
})();
