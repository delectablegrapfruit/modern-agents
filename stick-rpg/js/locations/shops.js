// The shops: Funkytown Five-O convenience store (and robbing it), the pawn shop, Fine Line
// Furnishings and McSticks (root frames 15, 28/29, 30, 55 and 45 of the original).
// Prices, effects, time costs, limits and button visibility follow the original exactly; the
// shopkeepers' lines are reworded. Interiors are drawn in code after the original's rooms.
(function () {
  'use strict';
  var SRPG = window.SRPG;
  var ui = SRPG.ui;
  var D = SRPG.draw;
  var rnd = SRPG.rng.random;

  var FONT = '"Arial Black", "Arial Bold", Arial, Helvetica, sans-serif';

  // location.js builds a fresh `g` on every entry (also when a test opens a location directly),
  // so per-visit state lives on it. The original worked out which buttons to show once, in each
  // frame's entry script, and only ever hid a button afterwards (when you bought it).
  function visit(g, init) {
    if (!g.visit) g.visit = init(g.s);
    return g.visit;
  }

  // --- panel building (positions in stage px, measured from the original) ---------------------
  function textBox(parent, html, x, y, w, o) {
    o = o || {};
    var t = ui.el('div', 'nopoint', parent, html);
    t.style.cssText = 'position:absolute;left:' + x + 'px;top:' + y + 'px;' + (w ? 'width:' + w + 'px;' : 'white-space:nowrap;') +
      'font:bold ' + (o.size || 12) + 'px ' + FONT + ';color:' + (o.color || '#000') + ';line-height:' + (o.lh || 16.85) + 'px;' +
      'text-align:' + (o.align || 'left');
    if (o.id) t.setAttribute('data-id', o.id);
    return t;
  }

  // Label text: 12px type in buttons scaled to 75% (9px) with the red HP bits at 14px (10.5px).
  function lbl(html, size) {
    return '<span style="font-size:' + (size || 9) + 'px;text-transform:none;white-space:nowrap;line-height:13.5px;display:inline-block">' + html + '</span>';
  }
  function hp(text, size) {
    return '<span class="hp" style="font-size:' + (size || 10.5) + 'px">' + text + '</span>';
  }
  var SEP = '&nbsp; - &nbsp;';
  // The price in most labels is set in the larger (14px) size too.
  function price(text, size) {
    return '<span style="font-size:' + (size || 10.5) + 'px">' + text + '</span>';
  }

  // An icon button at stage position (x, y) inside panel p (panel rect r). onClick(g) runs, then
  // the menu rebuilds unless the handler moved to another screen.
  function item(g, p, r, o) {
    var b = ui.iconButton(p, { icon: o.icon, label: o.label, x: o.x - r.x - (r.b || 0), y: o.y - r.y - (r.b || 0), w: o.w || 170, size: o.size || 36, id: o.id }, function () {
      o.onClick(g);
      if (SRPG.engine.sceneName === 'location' && SRPG.location.current === g.def.id) g.refresh();
    });
    var l = b.querySelector('.lbl');
    l.style.marginLeft = (o.gap != null ? o.gap : 6) + 'px';
    // Single-line labels with the bigger 14px pieces sit lower in the original (Flash drops the
    // whole line to the taller baseline); dy moves the label by that much.
    if (o.dy) { l.style.position = 'relative'; l.style.top = o.dy + 'px'; }
    return b;
  }

  function leaveItem(g, p, r, x, y, dy) {
    return item(g, p, r, { icon: 'leave', id: 'leave', x: x, y: y, w: 100, gap: 5, dy: dy != null ? dy : 3, label: lbl('LEAVE', 10.5), onClick: function (gg) { gg.leave(); } });
  }

  function menuPanel(g, r) {
    var p = ui.panel(r.x, r.y, r.w, r.h);
    p.setAttribute('data-loc', g.def.id);
    return p;
  }

  // Food: pay, heal, one hour. The original's condition order is kept for each item.
  function food(g, cost, heal, sfx) {
    var s = g.s;
    if (s.cash > cost - 1 && s.hp < s.hpmax && s.time < 24) {
      s.cash -= cost;
      s.hp += heal;
      s.time += 1;
      if (s.hp > s.hpmax) s.hp = s.hpmax;
      g.sfx(sfx);
    } else g.error();
  }

  // =========================================================================================
  // Funkytown Five-O (frame 15) + ROB THE PLACE (results: frames 28 and 29)
  // =========================================================================================
  var STORE_PANEL = { x: 181, y: 47, w: 356, h: 252, b: 1 };
  var WIN_PANEL = { x: 113, y: 125, w: 356, h: 162, b: 1 };
  var JAIL_PANEL = { x: 97, y: 94, w: 356, h: 222, b: 1 };

  function robResult(g, v) {
    var s = g.s;
    var win = v.rob.win;
    var r = win ? WIN_PANEL : JAIL_PANEL;
    var p = menuPanel(g, r);
    p.setAttribute('data-screen', win ? 'robbed' : 'jail');
    if (win) {
      textBox(p, 'YOU DID IT!!!', 0, 139 - r.y, r.w, { size: 24, lh: 30, align: 'center' });
      textBox(p, 'You scoped the joint out, then slipped back at<br>midnight and cleaned the whole place out.', 177 - r.x, 175 - r.y, null);
      textBox(p, 'You got away with <span style="font-size:16px">$</span> <span data-id="robamount" style="font-size:16px">' +
        v.rob.amount + '</span>', 204.5 - r.x, 209 - r.y, null, { lh: 20 });
    } else {
      textBox(p, 'YOU GOT CAUGHT!!!', 0, 111 - r.y, r.w, { size: 24, lh: 30, align: 'center' });
      textBox(p, "You didn't have the charm to get away with it,<br>or luck just wasn't on your side. Either<br>" +
        "way, you're stuck behind bars for the<br>next 5 days.", 158 - r.x, 168 - r.y, null);
    }
    var ok = ui.button(p, 'OK', function () {
      // -10 karma when you leave the result; you wake up back at the start junction.
      g.addKarma(-10);
      v.rob = null;
      if (!win && SRPG.game.timeUp()) { SRPG.game.endGame(); return; }
      s.mapx = 456;
      s.mapy = 630;
      SRPG.location.leave('-'); // no door nudge: the position was just set
      // The original's OK buttons never swap the store's loop back for the street music (every
      // LEAVE button does), so the inside music keeps playing out on the map.
      SRPG.sound.music('inside');
    }, { x: (win ? 256 : 240) - r.x, y: (win ? 246 : 271) - r.y, w: 70, id: 'ok' });
    ok.style.cssText += ';height:25px;line-height:17px;font-size:10px;border-radius:9px;background:linear-gradient(#57aaff,#2e8cf5);border:1.5px solid #1d5fc4';
    return { custom: true };
  }

  SRPG.registerLocation({
    id: 'store',
    background: function (ctx, s, frame, g) {
      var v = g && g.visit;
      if (v && v.rob) return v.rob.win ? drawRobbed(ctx, frame) : drawJail(ctx);
      drawStore(ctx);
    },
    view: function (g) {
      // ROB THE PLACE shows only if you walk in with a gun and at least 10 bullets.
      var v = visit(g, function (s) { return { rob: null, canRob: s.items.gun > 0 && s.items.ammo > 9 }; });
      if (v.rob) return robResult(g, v);
      var r = STORE_PANEL;
      var p = menuPanel(g, r);
      textBox(p, '"Step on into the funky-town five-O, baby, where<br>I be slingin\' the finest merchandise so yo\' can<br>' +
        'get yo\' slurp on and get yo\' grub on. Now whatchu<br>need today, brotha\'?"', 205 - r.x, 64.5 - r.y, null);
      item(g, p, r, {
        icon: 'slushee', id: 'slushee', x: 187.1, y: 148, gap: 4.3, dy: 3.5, label: lbl('SLUSHEE ' + hp('(+1 HP)') + SEP + price('$1')),
        onClick: function (gg) {
          // Slushee checks cash, then the clock, then HP (the others check HP before the clock).
          var s = gg.s;
          if (s.cash > 0 && s.time < 24 && s.hp < s.hpmax) {
            s.cash -= 1;
            s.hp += 1;
            s.time += 1;
            gg.sfx('drink');
          } else gg.error();
        },
      });
      item(g, p, r, {
        icon: 'candybar', id: 'candybar', x: 187.3, y: 197, gap: 5.5, dy: 2, label: lbl('CANDY BAR ' + hp('(+3 HP)') + SEP + price('$2')),
        onClick: function (gg) { food(gg, 2, 3, 'eat'); },
      });
      item(g, p, r, {
        icon: 'nachos', id: 'nachos', x: 187.3, y: 245.8, gap: 6.5, dy: 2, label: lbl('NACHOS ' + hp('(+7 HP)') + SEP + price('$4')),
        onClick: function (gg) { food(gg, 4, 7, 'eat'); },
      });
      item(g, p, r, {
        icon: 'smokes', id: 'smokes', x: 372.1, y: 148.5, gap: 7, dy: 1.5, label: lbl('SMOKES' + SEP + price('$10')),
        onClick: function (gg) {
          var s = gg.s;
          if (s.cash > 9 && s.items.smokes < 99) {
            s.cash -= 10;
            s.items.smokes += 1;
            gg.sfx('purchase');
          } else gg.error();
        },
      });
      item(g, p, r, {
        icon: 'pills', id: 'pills', x: 372.1, y: 196.8, gap: 7, dy: 2, label: lbl('CAFFEINE PILLS' + SEP + price('$45')),
        onClick: function (gg) {
          var s = gg.s;
          if (s.cash > 44 && s.items.pills < 99) {
            s.cash -= 45;
            s.items.pills += 1;
            gg.sfx('purchase');
          } else gg.error();
        },
      });
      leaveItem(g, p, r, 372.1, 246.1, 2.5);
      if (v.canRob) {
        // Below the panel, on the counter.
        item(g, ui.el('div', 'box'), { x: 0, y: 0 }, {
          icon: 'rob', id: 'rob', x: 372.7, y: 324.4, w: 110, gap: 7.4, dy: 1.5, label: lbl('ROB THE<br>PLACE'),
          onClick: function (gg) { robStore(gg, v); },
        });
      }
      return { custom: true };
    },
  });

  // Rob the store: only before 21:00. The clock jumps to midnight and 5-9 bullets are used up.
  // Success needs random(charm) > 40 (so 42+ charm, and luck): you take random(500) dollars.
  // Otherwise it's 5 days in jail. Either way -10 karma when you close the result.
  function robStore(g, v) {
    var s = g.s;
    if (s.time < 21) {
      s.time = 24;
      s.items.ammo -= rnd(5) + 5;
      var roll = rnd(s.charm);
      if (roll > 40) {
        var amount = rnd(500);
        s.cash += amount;
        v.rob = { win: true, amount: amount };
        g.sfx('work');
      } else {
        s.day += 5;
        v.rob = { win: false };
      }
    } else g.error();
  }

  // =========================================================================================
  // Pawn shop (frame 30)
  // =========================================================================================
  var PAWN_PANEL = { x: 181, y: 46, w: 356, h: 252, b: 1 };

  SRPG.registerLocation({
    id: 'pawn',
    background: function (ctx) { drawPawn(ctx); },
    view: function (g) {
      // Each item is sold once. The ammo box replaces the gun once you own one — but only from
      // your next visit, as in the original.
      var v = visit(g, function (s) {
        return {
          phone: s.items.cellPhone !== 1, alarm: s.items.alarm !== 1, knife: s.items.knife !== 1,
          gun: s.items.gun !== 1, ammo: s.items.gun === 1,
        };
      });
      var r = PAWN_PANEL;
      var p = menuPanel(g, r);
      textBox(p, '"Either buy somethin\' or scram, punk."', 0, 63.5 - r.y, r.w, { align: 'center' });
      function buy(key, field, cost) {
        return function (gg) {
          var s = gg.s;
          if (s.cash > cost - 1) {
            s.cash -= cost;
            s.items[field] = 1;
            v[key] = false;
            gg.sfx('purchase');
          } else gg.error();
        };
      }
      if (v.gun) item(g, p, r, { icon: 'gun', id: 'gun', x: 192.1, y: 142.3, gap: 8, label: lbl('HAND GUN -&nbsp; $400'), onClick: buy('gun', 'gun', 400) });
      if (v.ammo) {
        item(g, p, r, {
          icon: 'ammo', id: 'ammo', x: 192.3, y: 142.2, gap: 6.5, label: lbl('AMMO (5) -&nbsp; $10'),
          onClick: function (gg) {
            // Five bullets for $10, up to 99 (buying stops once you hold 95 or more).
            var s = gg.s;
            if (s.cash > 9 && s.items.ammo < 95) {
              s.cash -= 10;
              s.items.ammo += 5;
              gg.sfx('purchase');
            } else gg.error();
          },
        });
      }
      if (v.knife) item(g, p, r, { icon: 'knife', id: 'knife', x: 192.1, y: 194.8, gap: 8, label: lbl('KNIFE -&nbsp; $100'), onClick: buy('knife', 'knife', 100) });
      if (v.alarm) item(g, p, r, { icon: 'alarm', id: 'alarm', x: 192.3, y: 245.9, gap: 7, label: lbl('CD ALARM CLOCK - $200'), onClick: buy('alarm', 'alarm', 200) });
      if (v.phone) item(g, p, r, { icon: 'cellphone', id: 'cellphone', x: 378.8, y: 142.7, gap: 6.5, w: 150, dy: -2, label: lbl('CELL PHONE - $200'), onClick: buy('phone', 'cellPhone', 200) });
      leaveItem(g, p, r, 378.3, 245);
      return { custom: true };
    },
  });

  // =========================================================================================
  // Fine Line Furnishings (frame 55)
  // =========================================================================================
  var FURN_PANEL = { x: 93, y: 75, w: 356, h: 252, b: 1 };

  // Which pieces show, as worked out on entry. Bigger homes unlock more; the second-tier pieces
  // (treadmill, satellite, books, minibar) need a mansion or castle AND the first-tier piece.
  function furnitureShown(s) {
    var it = s.items, d = s.dwelling;
    return {
      bed: !(it.bed === 1),
      computer: !(it.computer === 1 || d < 2),
      tv: !(it.tv === 1 || d < 3),
      freezer: !(it.freezer === 1 || d < 3),
      treadmill: !(it.bed === 0 || d < 4 || it.treadmill === 1),
      satellite: !(it.tv === 0 || d < 4 || it.satellite === 1),
      books: !(it.computer === 0 || d < 4 || it.books === 1),
      minibar: !(it.freezer === 0 || d < 4 || it.minibar === 1),
    };
  }

  // Four slots down the panel; each slot holds a first-tier piece or its upgrade.
  var FURNITURE = [
    { key: 'bed', icon: 'bed', gap: 2, price: 500, x: 104.4, y: 120, size: 37, fs: 9.4, dy: 1,
      label: 'COMA-SNOOZE BED ' + hp('(+10 HP/SLEEP HEALED)', 10.9) + SEP + price('$500', 10.9) },
    { key: 'treadmill', icon: 'treadmill', gap: 0, price: 3500, x: 105.3, y: 119.8, size: 38, fs: 9.6, dy: 1.5,
      label: 'STICK-FITNESS TREADMILL ' + hp('(+1 STR/SLEEP)', 11.2) + ' ' + price('- $3500', 11.2) },
    { key: 'tv', icon: 'tv', gap: 4.5, price: 2500, x: 101.9, y: 162.6, size: 40, fs: 10, dy: 1,
      label: 'BEHEMOTH-VISION TV' + SEP + price('$2500', 11.6) },
    { key: 'satellite', icon: 'satellite', gap: 5, price: 3000, x: 102, y: 164.6, size: 38, fs: 9.6,
      label: 'STICKCHOICE SATELLITE SYSTEM - $3000' },
    { key: 'computer', icon: 'computer', gap: 4.5, price: 2000, x: 101.4, y: 207.6, size: 42, fs: 10.4, dy: -1.5,
      label: 'CIRCUIT-BREAKER 5000 COMPUTER - $2000' },
    { key: 'books', icon: 'books', gap: 5.5, price: 2000, x: 103.5, y: 208.5, size: 38, fs: 9.6, dy: 1,
      label: 'STICK-O-PEDIA XGENICA ' + hp('(+1 INT/SLEEP)', 11.2) + price(' - $2000', 11.2) },
    { key: 'freezer', icon: 'freezer', gap: 5, price: 2500, x: 103.2, y: 252.2, size: 39, fs: 9.7,
      label: 'DEEP FREEZE ' + hp('(+10 HP/SLEEP HEALED)', 11.3) + price(' - $2500', 11.3) },
    { key: 'minibar', icon: 'minibar', gap: 6.5, price: 5000, x: 102.8, y: 253.3, size: 39, fs: 9.6, dy: -1,
      label: "SUDS'N'BUBBLES MINIBAR " + hp('(+1 CHM/SLEEP)', 11.2) + ' ' + price('- $5000', 11.2) },
  ];

  SRPG.registerLocation({
    id: 'furniture',
    background: function (ctx) { drawFurniture(ctx); },
    view: function (g) {
      var v = visit(g, furnitureShown);
      var r = FURN_PANEL;
      var p = menuPanel(g, r);
      textBox(p, '"Fine Line Furnishings welcomes you!&nbsp; What can we<br>swindle...uh...sell you on today?"', 112 - r.x, 75.6 - r.y, null);
      FURNITURE.forEach(function (f) {
        if (!v[f.key]) return;
        item(g, p, r, {
          icon: f.icon, id: f.key, x: f.x, y: f.y, size: f.size, w: 345, gap: f.gap, dy: f.dy, label: lbl(f.label, f.fs),
          onClick: function (gg) {
            // No time cost; the button goes once bought.
            var s = gg.s;
            if (s.cash > f.price - 1) {
              s.cash -= f.price;
              s.items[f.key] = 1;
              v[f.key] = false;
              gg.sfx('purchase');
            } else gg.error();
          },
        });
      });
      leaveItem(g, p, r, 339, 289.1, 3.5);
      return { custom: true };
    },
  });

  // =========================================================================================
  // McSticks (frame 45)
  // =========================================================================================
  var MC_PANEL = { x: 181, y: 46, w: 356, h: 252, b: 1 };

  SRPG.registerLocation({
    id: 'mcsticks',
    background: function (ctx, s, frame) { drawMcSticks(ctx, frame); },
    view: function (g) {
      // WORK - COOK is only there while your job is still McSlave (job 1).
      var v = visit(g, function (s) { return { work: s.job === 1 }; });
      var r = MC_PANEL;
      var p = menuPanel(g, r);
      textBox(p, '"Welcome to McSticks, what can I get for you?"', 0, 63.5 - r.y, r.w, { align: 'center' });
      item(g, p, r, {
        icon: 'milkshake', id: 'milkshake', x: 186.9, y: 104.1, gap: 6, dy: 2.5, label: lbl('MILKSHAKE ' + hp('(+12 HP)') + SEP + price('$8')),
        onClick: function (gg) { food(gg, 8, 12, 'drink'); },
      });
      item(g, p, r, {
        icon: 'fries', id: 'fries', x: 187.2, y: 152, gap: 7, dy: 3.5, label: lbl('FRIES ' + hp('(+20 HP)') + SEP + price('$12')),
        onClick: function (gg) { food(gg, 12, 20, 'eat'); },
      });
      item(g, p, r, {
        icon: 'burger', id: 'burger', x: 186.9, y: 201.8, gap: 6, label: lbl('CHEESEBURGER<br>' + hp('(+40 HP)') + SEP + price('$25')),
        onClick: function (gg) { food(gg, 25, 40, 'eat'); },
      });
      item(g, p, r, {
        icon: 'tripleburger', id: 'tripleburger', x: 186.8, y: 250, gap: 6, label: lbl('TRIPLE BURGER<br>' + hp('(+80 HP)') + SEP + price('$50')),
        onClick: function (gg) { food(gg, 50, 80, 'eat'); },
      });
      if (v.work) {
        item(g, p, r, {
          icon: 'cook', id: 'cook', x: 371.9, y: 153.1, gap: 6, w: 150, dy: 1.5, label: lbl('WORK - COOK<br>' + price('($6/HR)')),
          onClick: function (gg) {
            // A 6-hour shift for $36 and +1 karma (the original adds it without the usual clamp).
            var s = gg.s;
            if (s.time < 19) {
              s.karma += 1;
              s.cash += 36;
              s.time += 6;
              gg.sfx('work');
            } else gg.error();
          },
        });
      }
      leaveItem(g, p, r, 371.9, 249.1, 3.5);
      return { custom: true };
    },
  });

  // =========================================================================================
  // Interiors
  // =========================================================================================
  var K = '#000';

  function rotText(ctx, lines, x, y, ang, size, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    lines.forEach(function (l, i) {
      D.text(ctx, l, 0, (i - (lines.length - 1) / 2) * size * 1.15, { size: size, bold: true, align: 'center', baseline: 'middle', color: color || K });
    });
    ctx.restore();
  }

  // The convenience store: the clerk (red afro, purple shades) behind the counter on the left,
  // the three-flavour slushee machine on the right, a "no bustin' caps" sign on the counter.
  function drawStore(ctx) {
    D.rect(ctx, 0, 0, 550, 400, '#ffffcc');
    D.line(ctx, 0.5, 0, 0.5, 400, K, 1);
    // back window, the counter, and the clerk (his hands rest on the counter top)
    D.rect(ctx, 53.5, 63, 224, 118.5, '#66ccff', K, 1);
    // counter
    D.poly(ctx, [0, 218, 248.5, 218, 278.5, 252.5, 0, 252.5], '#9c9141', K, 1);
    D.poly(ctx, [0, 252.5, 278.5, 252.5, 257.5, 401, 0, 401], '#b97c00', K, 1);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = K;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(93.5, 180);
    ctx.lineTo(93.5, 197.5);
    ctx.moveTo(67.5, 229);
    ctx.lineTo(67.5, 217.5);
    ctx.lineTo(93.5, 197.5);
    ctx.lineTo(121.5, 217.5);
    ctx.lineTo(121.5, 228);
    ctx.stroke();
    ctx.restore();
    D.circle(ctx, 92.5, 161.5, 18.5, '#330000', K, 1);
    // hair: a big dome sitting on the head
    ctx.beginPath();
    ctx.moveTo(63, 157);
    ctx.bezierCurveTo(58, 135, 70, 118, 94, 118);
    ctx.bezierCurveTo(118, 118, 130, 132, 125, 152);
    ctx.bezierCurveTo(118, 156, 112, 150, 106, 149);
    ctx.bezierCurveTo(96, 146, 86, 146, 78, 150);
    ctx.bezierCurveTo(72, 153, 68, 156, 63, 157);
    ctx.closePath();
    ctx.fillStyle = '#660000';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = K;
    ctx.stroke();
    D.rect(ctx, 76.5, 151.5, 17, 7, '#9900ff', K, 1);
    D.rect(ctx, 94.5, 151.5, 16, 7, '#9900ff', K, 1);
    // sign
    D.rect(ctx, 14.5, 266.5, 70, 85.5, '#cccccc', K, 1);
    D.circle(ctx, 49, 310, 27, null, '#cc0000', 3.5);
    D.line(ctx, 30, 291, 68, 329, '#cc0000', 3.5);
    D.text(ctx, "Bustin'", 49.5, 302, { size: 11.5, bold: true, align: 'center', baseline: 'middle' });
    D.text(ctx, 'CAPS', 49.5, 321, { size: 11.5, bold: true, align: 'center', baseline: 'middle' });

    // slushee machine
    D.poly(ctx, [321.5, 124, 339, 112, 339, 401, 321.5, 401], '#0066cc', K, 1);
    D.poly(ctx, [321.5, 124, 339, 112, 551, 112, 551, 124], '#0066cc', K, 1);
    D.rect(ctx, 339, 102, 212, 10, '#6ac4ff', K, 1);
    D.poly(ctx, [321.5, 124, 339, 102, 339, 112], '#6ac4ff', K, 1);
    D.rect(ctx, 339, 112, 212, 289, '#0099ff', K, 1);
    var flav = [
      { x: 351, lab: '#ffff00', disc: '#ffff66', ring: '#ffee33', text: ['Biznitchin', 'Banana'] },
      { x: 421, lab: '#9999ff', disc: '#9900ff', ring: '#7a00cc', text: ['Funkadelic', 'Grape'] },
      { x: 491, lab: '#ff9900', disc: '#ff9966', ring: '#ff8a4d', text: ['Supafly', 'Orange'] },
    ];
    flav.forEach(function (f) {
      D.rect(ctx, f.x, 129, 57, 40, f.lab, K, 1);
      ctx.save();
      ctx.beginPath();
      ctx.rect(f.x, 129, 57, 40);
      ctx.clip();
      rotText(ctx, f.text, f.x + 29, 148, -0.5, 9);
      ctx.restore();
      var cx = f.x + 29.5;
      D.circle(ctx, cx, 202.5, 20, f.disc, K, 1);
      D.circle(ctx, cx, 202.5, 12, f.ring, K, 1);
      D.circle(ctx, cx, 202.5, 5.5, '#333333', K, 1);
      D.rect(ctx, cx - 5.5, 175, 11, 27, '#999999', K, 1);
      D.rect(ctx, cx - 5.5, 202, 11, 25, '#cccccc', K, 1);
      D.rect(ctx, cx + 5.5, 199, 12, 5, '#666666', K, 1);
    });
    // drip tray
    D.poly(ctx, [340, 272.5, 551, 272.5, 551, 280, 350, 280], '#333333', K, 1);
    D.poly(ctx, [340, 272.5, 350, 280, 350, 315.5, 340, 308], '#999999', K, 1);
    D.rect(ctx, 350, 280, 201, 35.5, '#666666', K, 1);
  }

  // "YOU DID IT!!!": dark green, scattered green dollar signs.
  var CASH_SIGNS = [[141, 25], [468, 5], [346, 55], [77, 80], [190, 87], [289, 106], [436, 93], [513, 93], [0, 112],
    [379, 150], [167, 176], [66, 190], [129, 234], [289, 234], [430, 227], [513, 227], [26, 291], [186, 285],
    [110, 317], [424, 305], [346, 336], [200, 375], [455, 381], [46, 395], [550, 342]];
  // A chunky green dollar sign centred on (x, y), about 16 x 22 px.
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
    // the two strokes through the S, poking out top and bottom
    [[-2.9, -12.6, 5.2], [0.9, -12.6, 5.2], [-2.9, 7.6, 5], [0.9, 7.6, 5]].forEach(function (b) {
      D.rect(ctx, b[0], b[1], 2, b[2], '#2f9a00', '#1a3300', 0.9);
    });
    ctx.restore();
  }
  function drawRobbed(ctx) {
    D.rect(ctx, 0, 0, 550, 400, '#336600');
    CASH_SIGNS.forEach(function (p) { dollar(ctx, p[0], p[1]); });
  }

  // "YOU GOT CAUGHT!!!": the view from inside a cell — navy with steel bars.
  function vBar(ctx, x, y0, y1) {
    var w = 17;
    var gr = ctx.createLinearGradient(x, 0, x + w, 0);
    gr.addColorStop(0, '#454545');
    gr.addColorStop(0.62, '#c6c6c6');
    gr.addColorStop(1, '#6e6e6e');
    D.roundRect(ctx, x, y0, w, y1 - y0, 8, gr, '#535353', 1);
  }
  function hBar(ctx, x0, x1, y) {
    var gr = ctx.createLinearGradient(0, y, 0, y + 17);
    gr.addColorStop(0, '#9f9f9f');
    gr.addColorStop(0.3, '#cccccc');
    gr.addColorStop(1, '#9b9b9b');
    D.rect(ctx, x0, y, x1 - x0, 17, gr, '#535353', 1);
    D.rect(ctx, x0, y + 17, x1 - x0, 5, '#666666', '#535353', 1);
  }
  function drawJail(ctx) {
    D.rect(ctx, 0, 0, 550, 400, '#003366');
    var rows = [13, 221, 325]; // cross bars, 22 px deep
    rows.forEach(function (y) {
      hBar(ctx, -2, 470, y);
      D.poly(ctx, [470, y, 482.5, y + 11, 482.5, y + 22, 470, y + 22], '#8a8a8a', '#535353', 1);
      hBar(ctx, 507.5, 552, y);
    });
    // uprights: segments between the cross bars, each resting on the bar below with a round end
    var tops = [-12, 35, 243, 347];
    var ends = [25, 233, 337, 412];
    [15.5, 67.5, 118.5, 170.5, 222.5, 274.5, 326.5, 378.5, 430.5, 470.5, 535].forEach(function (x) {
      for (var i = 0; i < 4; i++) vBar(ctx, x, tops[i], ends[i]);
    });
    D.rect(ctx, 482.5, -1, 25, 402, '#666666', '#555555', 1);
  }

  // Pawn shop: grey slat wall, a mustard counter wrapping round to the right, glass cases of
  // jewellery, watches and clocks, brown floor.
  function glassCase(ctx, x0, x1, y0, div) {
    var w = x1 - x0;
    D.rect(ctx, x0, y0, w, 104.5, '#333333', K, 1);
    D.rect(ctx, x0 + 3.5, y0 + 4, w - 3.5, 97.5, '#80e6ff');
    // top shadow, shelf, shadow under the shelf, bottom rail
    D.rect(ctx, x0 + 3.5, y0 + 4, w - 3.5, 13.5, '#4cb3cc');
    D.rect(ctx, x0 + 3.5, y0 + 45.5, w - 3.5, 6, '#3399b2');
    D.rect(ctx, x0 + 3.5, y0 + 51.5, w - 3.5, 14.5, '#4cb3cc');
    D.rect(ctx, x0 + 3.5, y0 + 95, w - 3.5, 6, '#3399b2');
    [17.5, 45.5, 51.5, 66, 94.5].forEach(function (dy) { D.line(ctx, x0 + 3.5, y0 + dy, x1 - 4, y0 + dy, '#006680', 1); });
    // side glass seen at an angle: darker triangles at the right of each shelf
    [[4, 45.5], [51.5, 94.5]].forEach(function (r) {
      D.poly(ctx, [x1 - 44, y0 + r[0], x1 - 4, y0 + r[0], x1 - 4, y0 + r[1]], 'rgba(0,102,128,0.28)', '#006680', 0.8);
    });
    D.line(ctx, x0 + div, y0 + 4, x0 + div, y0 + 101, '#1a3d47', 1);
    D.rect(ctx, x1 - 4, y0 + 1, 4, 102, '#999999');
    D.rect(ctx, x0, y0 + 101, w, 3.5, '#999999', K, 1);
    D.rect(ctx, x0, y0, w, 104.5, null, K, 1);
  }
  function watch(ctx, x, y, ang, face) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    D.roundRect(ctx, -36, -4, 72, 8, 3, '#339fb3', '#1a6f80', 1);
    D.circle(ctx, 0, 0, 7.5, face || '#33cccc', '#1a6f80', 1.2);
    D.line(ctx, 0, 0, 3.5, -2, '#1a6f80', 1);
    D.line(ctx, 0, 0, 0, -4.5, '#1a6f80', 1);
    ctx.restore();
  }
  function drawPawn(ctx) {
    D.rect(ctx, 0, 0, 550, 142, '#666666');
    D.rect(ctx, 0, 50, 550, 3.5, '#555555');
    D.rect(ctx, 0, 53.5, 550, 13, '#333333');
    D.rect(ctx, 0, 67, 550, 2.5, '#7a7a7a');
    D.rect(ctx, 0, 116.5, 550, 3.5, '#474747');
    D.rect(ctx, 0, 120, 550, 12.5, '#333333');
    D.rect(ctx, 0, 133, 550, 3, '#7a7a7a');
    // counter: yellow top band, olive front, lighter side front round the corner at x = 410
    D.poly(ctx, [0, 141.5, 460, 141.5, 551, 184, 551, 267.5, 410, 191.5, 0, 191.5], '#e0b727', '#663333', 1);
    D.rect(ctx, -1, 191.5, 411, 127.5, '#957815', '#663333', 1);
    D.poly(ctx, [410, 191.5, 551, 267.5, 551, 401, 410, 319], '#b9951a', '#663333', 1);
    var fl = ctx.createRadialGradient(330, 370, 10, 330, 370, 260);
    fl.addColorStop(0, '#663a26');
    fl.addColorStop(1, '#604d0d');
    D.poly(ctx, [-1, 319, 410, 319, 551, 395, 551, 401, -1, 401], fl, '#663333', 1);

    // left case: pearl necklace, a pendant on a chain
    glassCase(ctx, -4, 131, 202.5, 19);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 207, 127, 95);
    ctx.clip();
    for (var i = 0; i <= 12; i++) {
      var t = i / 12, bx = 29 + t * 53, by = 208 + Math.sin(t * Math.PI) * 26 - (t > 0.5 ? (t - 0.5) * 4 : 0);
      if (i === 6) continue;
      D.circle(ctx, bx, by, 3.4, '#66cccc', '#2d9999', 0.8);
    }
    ctx.beginPath();
    ctx.ellipse(60, 237, 9.5, 8, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#99cc66';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#5c8c3a';
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(60, 237, 6.5, 5.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#5fd0e0';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(44, 256);
    ctx.bezierCurveTo(44, 266, 58, 262, 56, 270);
    ctx.bezierCurveTo(54, 280, 70, 276, 80, 280);
    ctx.moveTo(72, 256);
    ctx.bezierCurveTo(70, 266, 88, 266, 86, 278);
    ctx.strokeStyle = '#006680';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(86, 284, 7.5, 6.5, -0.3, 0, Math.PI * 2);
    ctx.fillStyle = '#0a6fb0';
    ctx.fill();
    ctx.strokeStyle = '#004466';
    ctx.stroke();
    D.circle(ctx, 84, 282, 2.2, '#40b8ff');
    ctx.restore();

    // middle case: watches, a clock, a table clock
    glassCase(ctx, 158, 389, 202.5, 114.5);
    ctx.save();
    ctx.beginPath();
    ctx.rect(162, 207, 223, 95);
    ctx.clip();
    watch(ctx, 185, 222, 0.55, '#99dd66');
    watch(ctx, 256, 228, 0.42, '#33dddd');
    D.poly(ctx, [312, 236, 322, 222, 334, 222, 344, 236], '#33aabb', '#1a6f80', 1);
    D.circle(ctx, 328, 222, 15, '#33aabb', '#1a6f80', 1.2);
    D.circle(ctx, 328, 222, 11, '#2a9aaa', '#1a6f80', 0.8);
    D.line(ctx, 328, 222, 336, 217, '#33ee99', 1.6);
    D.line(ctx, 328, 222, 324, 229, '#33ee99', 1.6);
    ctx.beginPath();
    ctx.ellipse(222, 278, 20, 17, 0, Math.PI * 0.95, Math.PI * 2.05);
    ctx.lineWidth = 7;
    ctx.strokeStyle = '#33aabb';
    ctx.stroke();
    D.poly(ctx, [196, 300, 204, 284, 240, 284, 248, 300], '#33aabb', '#1a6f80', 1);
    ctx.restore();

    // right-hand case, turned towards you
    ctx.save();
    ctx.transform(1, 0.545, 0, 1, 0, -0.545 * 422.5);
    glassCase(ctx, 422.5, 580, 212, 100);
    ctx.beginPath();
    ctx.ellipse(472, 250, 12, 15, 0.2, 0, Math.PI * 2);
    var cd = ctx.createLinearGradient(460, 238, 486, 264);
    cd.addColorStop(0, '#66ccff');
    cd.addColorStop(0.35, '#cc66ff');
    cd.addColorStop(0.6, '#66ff99');
    cd.addColorStop(1, '#3399cc');
    ctx.fillStyle = cd;
    ctx.fill();
    ctx.strokeStyle = '#1a6f80';
    ctx.lineWidth = 1;
    ctx.stroke();
    D.circle(ctx, 472, 250, 3, '#80e6ff', '#1a6f80', 0.8);
    watch(ctx, 500, 290, -0.45, '#33dddd');
    ctx.restore();
  }
  // Fine Line Furnishings: showroom with a red runner, fridge and TV against the back wall
  // under their department signs, a couch and coffee table on the left and a bed on the right.
  function drawFurniture(ctx) {
    D.rect(ctx, 0, 0, 550, 146.5, '#b97c00');
    D.rect(ctx, -1, 146, 552, 46, '#b81414', K, 1);
    D.rect(ctx, -1, 192, 552, 210, '#aea588', K, 1);
    D.poly(ctx, [238, 192, 312.5, 192, 428.5, 401, 121, 401], '#b81414', K, 1);
    D.line(ctx, 0.5, 192, 0.5, 400, K, 1);
    // department signs
    D.poly(ctx, [106.5, 53.5, 119, 42, 119, 65], '#eee28e', K, 1);
    D.rect(ctx, 119, 42, 79, 23, '#999999', K, 1);
    D.text(ctx, 'Appliances', 158.5, 54, { size: 10, bold: true, align: 'center', baseline: 'middle', color: '#fff' });
    D.poly(ctx, [411, 43, 423.5, 54.5, 411, 66], '#eee28e', K, 1);
    D.rect(ctx, 332, 43, 79, 23, '#999999', K, 1);
    D.text(ctx, 'Electronics', 371.5, 55, { size: 10, bold: true, align: 'center', baseline: 'middle', color: '#fff' });
    // back door
    D.rect(ctx, 246, 77.5, 53, 68.5, '#b45a01', K, 1);
    D.circle(ctx, 253.5, 113.5, 4, '#febc7a', K, 1);
    // fridge
    D.poly(ctx, [7.5, 82.5, 20, 70, 70, 70, 57.5, 82.5], '#8a8a8a', K, 1);
    D.poly(ctx, [57.5, 82.5, 70, 70, 70, 152.5, 57.5, 165], '#8a8a8a', K, 1);
    var fr = ctx.createRadialGradient(32, 125, 4, 32, 125, 45);
    fr.addColorStop(0, '#c4c4c4');
    fr.addColorStop(1, '#7d7d7d');
    D.rect(ctx, 7.5, 82.5, 50, 82.5, fr, K, 1);
    D.line(ctx, 7.5, 107.5, 57.5, 107.5, K, 1);
    D.rect(ctx, 10, 96, 15, 2.5, '#c0c0c0', K, 0.8);
    D.rect(ctx, 10, 121.5, 2.5, 22.5, '#e6e6e6', K, 0.8);
    // television
    D.poly(ctx, [449, 79, 457.5, 64, 538, 64, 522, 79], '#c4c4c4', K, 1);
    D.poly(ctx, [522, 79, 538, 64, 538, 116, 522, 131], '#a4a4a4', K, 1);
    D.poly(ctx, [522, 131, 538, 116, 538, 151, 522, 166], '#202020', K, 1);
    var tv = ctx.createLinearGradient(449, 0, 522, 0);
    tv.addColorStop(0, '#999999');
    tv.addColorStop(0.5, '#c8c8c8');
    tv.addColorStop(1, '#a0a0a0');
    D.rect(ctx, 449, 79, 73, 52, tv, K, 1);
    D.rect(ctx, 454, 85, 63, 40.5, '#666666', K, 1);
    D.rect(ctx, 449, 131, 73, 35, '#333333', K, 1);
    // couch and coffee table
    D.roundRect(ctx, 25, 206.5, 128.5, 30, 6, '#febc7a', K, 1);
    D.circle(ctx, 54, 219, 2, '#f27a02');
    D.circle(ctx, 91.5, 219, 2, '#f27a02');
    D.roundRect(ctx, 20, 232, 140, 19, 5, '#febc7a', K, 1);
    D.roundRect(ctx, 15, 229, 22.5, 22, 6, '#febc7a', K, 1);
    D.roundRect(ctx, 144, 229, 22.5, 22, 6, '#febc7a', K, 1);
    [[50, 271, 297.5], [71, 271, 279], [124, 271, 296]].forEach(function (l) { D.line(ctx, l[0], l[1], l[0], l[2], '#4d2a00', 1.6); });
    D.poly(ctx, [41.5, 271, 62.5, 242.5, 145, 242.5, 125, 271], '#5dabea', K, 1);
    // bed
    D.rect(ctx, 435, 195, 88.5, 29, '#c96501', K, 1);
    D.poly(ctx, [400, 244, 437.5, 223, 523.5, 223, 474, 252.5], '#e9e9e9', K, 1);
    D.poly(ctx, [474, 252.5, 523.5, 223, 523.5, 255, 474, 287.5], '#894401', K, 1);
    D.roundRect(ctx, 440, 216, 28, 14, 4, '#ffffff', K, 1);
    D.roundRect(ctx, 476, 216, 28, 14, 4, '#ffffff', K, 1);
    D.roundRect(ctx, 380, 244, 95, 46, 8, '#c96501', K, 1);
  }
  // McSticks: coloured menu lights along the top, orange back wall, soda fountain and three
  // registers on a curved steel counter with a yellow front, grey tiled floor.
  function arcY(x, yc, k) { return yc - k * (x - 275) * (x - 275); }
  function arcPath(ctx, yc, k, x0, x1, rev) {
    for (var i = 0; i <= 40; i++) {
      var x = rev ? x1 - (x1 - x0) * i / 40 : x0 + (x1 - x0) * i / 40;
      ctx.lineTo(x, arcY(x, yc, k));
    }
  }
  function register(ctx, o) {
    // o: top (white sloped panel), front, side, display and base polygons in stage px
    D.poly(ctx, o.side, '#999999', '#333333', 1);
    D.poly(ctx, o.top, '#ffffff', '#333333', 1);
    D.poly(ctx, o.front, '#cccccc', '#333333', 1);
    var d = o.display;
    D.rect(ctx, d[0], d[1], d[2], d[3], '#006600', K, 1);
    if (!o.blank) D.text(ctx, '0.', d[0] + d[2] - 4, d[1] + d[3] / 2 + 1, { size: 11, align: 'right', baseline: 'middle', color: '#33ff33', font: '"Courier New", monospace' });
    if (o.baseSide) D.poly(ctx, o.baseSide, '#cccccc', '#333333', 1);
    if (o.baseTop) D.poly(ctx, o.baseTop, '#cccccc', '#333333', 1);
    D.poly(ctx, o.base, '#666666', '#333333', 1);
  }
  function drawMcSticks(ctx) {
    // menu lights and the dark strip under them
    D.rect(ctx, 0, 0, 550, 40, '#333333');
    D.rect(ctx, 0, 32.5, 550, 1, '#666666');
    [[0, 102.5, '#ffd735'], [117.5, 268.5, '#99ff00'], [283, 460, '#ffff00'], [475, 551, '#3c9dff']].forEach(function (b) {
      D.rect(ctx, b[0], -1, b[1] - b[0], 29, b[2]);
    });
    D.rect(ctx, 0, 40, 550, 142, '#ff6600');

    // soda fountain
    D.poly(ctx, [216, 40, 231.5, 40, 231.5, 182, 211, 182], '#999999', '#333333', 1);
    D.poly(ctx, [79, 40, 216, 40, 211, 47.5, 75, 47.5], '#ffffff', '#333333', 1);
    D.rect(ctx, 75, 47.5, 136, 83.5, '#cccccc', '#333333', 1);
    [[82.5, '#ff6600', '#663300', ['ORANGE']], [114, '#333333', '#cccccc', ['C O L A']],
      [146, '#663300', '#ccb71e', ['ROOT', 'BEER']], [177.5, '#cc0000', '#ffffff', ['DIET', 'COLA']]].forEach(function (l) {
      D.rect(ctx, l[0], 60.5, 26.5, 16, l[1], '#333333', 1);
      l[3].forEach(function (t, i) {
        D.text(ctx, t, l[0] + 13.25, 68.5 + (l[3].length === 2 ? (i - 0.5) * 6.8 : 0), { size: l[3].length === 2 ? 6 : 5.6, bold: true, align: 'center', baseline: 'middle', color: l[2] });
      });
    });
    [90.5, 121.5, 154.5, 185.5].forEach(function (x) {
      var g = ctx.createLinearGradient(x, 0, x + 10, 0);
      g.addColorStop(0, '#b8b8b8');
      g.addColorStop(0.2, '#9f9f9f');
      g.addColorStop(0.55, '#fafafa');
      g.addColorStop(1, '#afafaf');
      D.rect(ctx, x, 88.5, 10, 20.5, g, '#333333', 1);
    });
    D.poly(ctx, [75, 131, 214, 131, 212, 141.5, 72.5, 141.5], '#ffffff', '#333333', 1);
    D.rect(ctx, 72.5, 141.5, 135.5, 29.5, '#cccccc', '#333333', 1);
    D.poly(ctx, [208, 141.5, 212, 141.5, 212, 171, 208, 171], '#999999', '#333333', 1);
    D.rect(ctx, 75, 171, 136, 11, '#cccccc', '#333333', 1);

    // registers: left, middle (seen straight on), right
    register(ctx, {
      side: [32.5, 93.5, 45, 122.5, 45, 172.5, 32.5, 180.5], top: [-1, 93.5, 32.5, 93.5, 45, 122.5, -1, 122.5],
      front: [-1, 122.5, 32.5, 122.5, 32.5, 180.5, -1, 180.5], display: [-1, 130.5, 28, 17.5], blank: true,
      baseSide: [42.5, 181, 67.5, 167.5, 67.5, 187.5, 42.5, 200.5], baseTop: [-1, 176, 60, 167.5, 67.5, 167.5, 42.5, 181, -1, 181],
      base: [-1, 181, 42.5, 181, 42.5, 200.5, -1, 200.5],
    });
    register(ctx, {
      side: [297.5, 89, 297.5, 89, 297.5, 89], top: [225, 89, 297.5, 89, 297.5, 125, 225, 125],
      front: [225, 125, 297.5, 125, 297.5, 161, 225, 161], display: [229.5, 126.5, 63, 17.5],
      baseTop: [215, 161, 308.5, 161, 308.5, 164, 215, 164], base: [215, 164, 308.5, 164, 308.5, 197.5, 215, 197.5],
    });
    register(ctx, {
      side: [448.75, 94.25, 461.25, 123.75, 461.25, 181.25, 448.75, 175], top: [448.75, 94.25, 521, 94.25, 533, 123.75, 461.25, 123.75],
      front: [461.25, 123.75, 533, 123.75, 533, 181.25, 461.25, 181.25], display: [465.5, 131.25, 63.5, 17.5],
      baseSide: [430, 190, 451, 181.25, 451, 202.5, 430, 211], baseTop: [446, 176, 540, 176, 544, 181.25, 451, 181.25],
      base: [451, 181.25, 544, 181.25, 544, 202.5, 451, 202.5],
    });

    // curved counter: brushed-steel top, rim, yellow front with orange-framed panels
    ctx.beginPath();
    ctx.moveTo(-1, 182);
    ctx.lineTo(551, 182);
    arcPath(ctx, 220, 0.000192, -1, 551, true);
    ctx.closePath();
    var st = ctx.createLinearGradient(0, 182, 211, 450);
    st.addColorStop(0, '#6a6a6a');
    st.addColorStop(0.12, '#838383');
    st.addColorStop(0.27, '#ffffff');
    st.addColorStop(0.4, '#8e8e8e');
    st.addColorStop(0.62, '#bdbdbd');
    st.addColorStop(0.85, '#c7c7c7');
    st.addColorStop(1, '#a0a0a0');
    ctx.fillStyle = st;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#333333';
    ctx.stroke();
    var h = function (c0, c1) {
      var g = ctx.createLinearGradient(0, 0, 550, 0);
      g.addColorStop(0, c0);
      g.addColorStop(0.5, c1);
      g.addColorStop(1, c0);
      return g;
    };
    ctx.beginPath();
    arcPath(ctx, 220, 0.000192, -1, 551, false);
    arcPath(ctx, 247, 0.000192, -1, 551, true);
    ctx.closePath();
    ctx.fillStyle = h('#a0a0a0', '#ececec');
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    arcPath(ctx, 247, 0.000192, -1, 551, false);
    arcPath(ctx, 380, 0.000313, -1, 551, true);
    ctx.closePath();
    ctx.fillStyle = h('#a6a604', '#fdfdc8');
    ctx.fill();
    ctx.stroke();
    [[-40, 10], [42.5, 170], [200, 329], [361, 488.5], [517.5, 600]].forEach(function (p, i) {
      ctx.beginPath();
      arcPath(ctx, 280, 0.000185, p[0], p[1], false);
      arcPath(ctx, 330, 0.000203, p[0], p[1], true);
      ctx.closePath();
      ctx.fillStyle = i === 2 ? '#ffff00' : '#e1e100';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#e15a00';
      ctx.stroke();
    });
    // floor tiles
    ctx.beginPath();
    arcPath(ctx, 380, 0.000313, -1, 551, false);
    ctx.lineTo(551, 401);
    ctx.lineTo(-1, 401);
    ctx.closePath();
    ctx.fillStyle = h('#8c8c8c', '#cfcfcf');
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#666666';
    ctx.stroke();
    [24, 75, 127.5, 177.5, 230, 280, 330, 382.5, 432.5, 482.5, 535].forEach(function (x) {
      var y = arcY(x, 380, 0.000313);
      D.line(ctx, x, y, x + (x - 275) * 0.08, 401, '#666666', 2);
    });
  }
})();
