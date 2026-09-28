// New Lines Incorporated (root frame 20): apply for a job, ask for promotions, work shifts. Frame 21
// is the failed aptitude test, frame 22 the congratulations screen. Requirements, wages, karma and
// the six-hour shifts are the original's.
(function () {
  'use strict';
  var SRPG = window.SRPG;
  var ui = SRPG.ui;
  var D = SRPG.draw;
  var esc = SRPG.util.escape;
  var FONT = '"Arial Black", "Arial Bold", Arial, Helvetica, sans-serif';

  // job number -> the ladder. need = the "intelligence > need - 1" check to get this job;
  // wage = $/hour (a shift is 6 hours).
  var JOBS = {
    2: { title: 'JANITOR', need: 20, wage: 8, work: 'WORK - JANITOR', id: 'work_janitor', icon: 'janitor',
      msg: "Yo! Bob here, the boss! I'm at the office and I've had a few...*hurrrk* You're the janitor we just " +
        'hired, yeah?? Better grab a mop on your way in...*thud*' },
    3: { title: 'MAIL ROOM CLERK', need: 40, wage: 10, work: 'WORK - MAIL ROOM', id: 'work_mail', icon: 'mailroom',
      msg: "Hi, Gary here, down in the mail room. The gang hit the bar last night to toast you moving up the " +
        "ladder...um...shame nobody told you about it." },
    4: { title: 'SALESPERSON', need: 75, wage: 15, work: 'WORK - SALES PERSON', id: 'work_sales', icon: 'sales',
      msg: "Frank here, your sales manager. A quick heads-up: fall short of this month's quota and they'll " +
        'never find the body. Catch you at the office!' },
    5: { title: 'EXECUTIVE', need: 120, wage: 25, work: 'WORK - EXECUTIVE', id: 'work_exec', icon: 'executive',
      msg: 'Hello, Sue calling for the Executive Board. Just a reminder that your hearing on that sexual ' +
        'harassment complaint is first thing tomorrow. Enjoy your day!' },
    6: { title: 'VICE PRESIDENT', need: 180, wage: 50, work: 'WORK - VICE PRESIDENT', id: 'work_vice', icon: 'vicepresident',
      msg: "Congratulations, Mr. Vice Prez! Stuart here, your new assistant. The big boss is home with the flu, so " +
        "you're taking his volunteer shift over at the hospital. Guess what? Tuesdays are bedpan day." },
    7: { title: 'CEO', need: 250, wage: 100, work: 'WORK - CEO', id: 'work_ceo', icon: 'ceo',
      msg: "Um, hi, it's Stuart. So...since you run the company now, I guess I don't work for you " +
        'anymore...would you, uh...maybe want to grab dinner with me? Call me back.' },
  };

  // screen: 'main' (frame 20) | 'fail' (21) | 'hired' (22). jobtext/wagetext/intreq as in the original.
  var st = { screen: 'main', jobtext: 'JANITOR', wagetext: 'Your pay is now $8 an hour.', intreq: '' };

  function S() { return SRPG.game.s; }

  var rules = {
    // APPLY FOR A JOB (only while flipping burgers, job 1): more than 19 intelligence.
    // The karma changes here skip the original's karmaAdjust, so they are not capped at 100.
    apply: function (s) {
      if (s.intelligence > 19) {
        s.karma += 1;
        s.job = 2;
        SRPG.game.pushMsg(JOBS[2].msg);
        return { ok: true, jobtext: 'JANITOR', wagetext: 'Your pay is now $8 an hour.' };
      }
      return { ok: false, intreq: '(NEED 20 INTELLIGENCE)' };
    },
    // ASK FOR A PROMOTION (jobs 2-6): one rung per click. The original's handler tests each rung in
    // turn, but it stops as soon as its gotoAndStop leaves the menu frame (checked in Ruffle), so a
    // single request never climbs more than one rung.
    promote: function (s) {
      var next = JOBS[s.job + 1];
      if (s.job < 2 || s.job > 6 || !next) return null;
      if (s.intelligence > next.need - 1) {
        var wage = 'Your pay is now $' + next.wage + ' an hour.';
        s.job += 1;
        SRPG.game.pushMsg(next.msg);
        s.karma += 3;
        return { ok: true, jobtext: next.title, wagetext: wage };
      }
      return { ok: false, intreq: '(NEED ' + next.need + ' INTELLIGENCE)' };
    },
    // WORK: a 6-hour shift that must start before 19:00; +1 karma, 6 x wage.
    work: function (s) {
      var j = JOBS[s.job];
      if (!j || s.job > 7) return false;
      if (s.time < 19) {
        s.karma += 1;
        s.cash += j.wage * 6;
        s.time += 6;
        return true;
      }
      return false;
    },
  };

  // --- DOM helpers ---------------------------------------------------------------------------------
  function text(html, x, y, opts) {
    opts = opts || {};
    var size = opts.size || 12;
    var e = ui.el('div', 'nopoint', null, html);
    var css = 'position:absolute;left:' + x + 'px;top:' + y + 'px;font:bold ' + size + 'px ' + FONT + ';color:' +
      (opts.color || '#000') + ';line-height:' + (opts.lh || Math.round(size * 1.4)) + 'px;white-space:pre;text-align:' +
      (opts.align || 'left') + ';';
    if (opts.w != null) css += 'width:' + opts.w + 'px;overflow:hidden;';
    e.style.cssText = css;
    if (opts.id) e.setAttribute('data-text', opts.id);
    return e;
  }

  function iconBtn(o, onClick) {
    var b = ui.iconButton(null, { icon: o.icon, label: '<span>' + o.label + '</span>', x: o.x, y: o.y, w: o.w || 170, size: 36, id: o.id },
      function () { onClick(); });
    var lbl = b.querySelector('.lbl');
    if (lbl) {
      lbl.style.fontSize = (o.font || 9) + 'px';
      lbl.style.marginLeft = '5px';
    }
    return b;
  }

  function okPill(onClick) {
    var b = ui.button(null, 'OK', function () { onClick(); }, { x: 447, y: 316, w: 70, id: 'ok' });
    b.style.cssText += ';height:26px;padding:0;line-height:24px;font-size:10.5px;border-radius:7px;background:#3399ff;' +
      'border:1px solid #3366cc;color:#003399;text-align:center;';
    b.addEventListener('mouseenter', function () { b.style.background = '#95caff'; b.style.color = '#3399ff'; });
    b.addEventListener('mouseleave', function () { b.style.background = '#3399ff'; b.style.color = '#003399'; });
    return b;
  }

  function panel() {
    var p = ui.panel(181, 104, 356, 252);
    p.setAttribute('data-loc', 'nli');
    return p;
  }

  // --- screens -------------------------------------------------------------------------------------
  function showMain() {
    var s = S();
    panel();
    text('"Hello there, this is New Lines Incorporated.\nWhat can I do for you today?"', 227, 122, { lh: 17 });
    if (s.job === 1) {
      iconBtn({ icon: 'apply', label: 'APPLY FOR A JOB', x: 361, y: 206, id: 'apply' }, function () {
        result(rules.apply(S()));
      });
    }
    if (s.job >= 2 && s.job <= 6) {
      iconBtn({ icon: 'promotion', label: 'ASK FOR A PROMOTION', x: 361, y: 206, w: 185, id: 'promotion' }, function () {
        result(rules.promote(S()));
      });
    }
    var j = JOBS[s.job];
    if (j) {
      // Every WORK button shows the same stack of cash in the original (like McSticks' WORK - COOK).
      iconBtn({ icon: j.icon, label: esc(j.work) + '<br><span style="font-size:10.5px">($' + j.wage + '/HR)</span>',
        x: 361, y: 253, w: 185, id: j.id }, function () {
        if (rules.work(S())) SRPG.sound.play('work');
        else SRPG.sound.play('error');
        refresh();
      });
    }
    iconBtn({ icon: 'leave', label: 'LEAVE', x: 360, y: 304, font: 10.5, w: 81, id: 'leave' }, function () {
      SRPG.location.leave();
    });
  }

  function showFail() {
    panel();
    text('"Thanks for applying.  Sadly, you did not pass\nthe aptitude test.  Maybe next time around!"', 198, 121, { lh: 17 });
    text(esc(st.intreq), 267, 202, { size: 12, color: '#003399', w: 183, align: 'center', lh: 17, id: 'intreq' });
    okPill(backToMenu);
  }

  function showHired() {
    panel();
    text('CONGRATULATIONS!\nYOU ARE NOW A:', 267, 125, { size: 16, color: '#fff', lh: 22.5 });
    text(esc(st.jobtext), 250, 206, { size: 20, color: '#ffff00', w: 217, align: 'center', lh: 27, id: 'jobtext' });
    text(esc(st.wagetext), 212, 278, { size: 16, color: '#fff', w: 293, align: 'center', lh: 22, id: 'wagetext' });
    okPill(backToMenu);
  }

  function result(r) {
    if (!r) return;
    if (r.ok) {
      st.jobtext = r.jobtext;
      st.wagetext = r.wagetext;
      go('hired');
    } else {
      st.intreq = r.intreq;
      go('fail');
    }
  }

  var SCREENS = { main: showMain, fail: showFail, hired: showHired };

  function go(screen) {
    st.screen = screen;
    refresh();
  }
  // The result screens' OK (Button 1049: gotoFrame(19)) goes back to root frame 20, whose script
  // replays the black clip: the lobby fades in again.
  function backToMenu() {
    SRPG.engine.blackPlay(1);
    go('main');
  }
  function refresh() {
    if (SRPG.location.current === 'nli') SRPG.location.g.refresh();
  }

  // --- art: the reception lobby ------------------------------------------------------------------------
  function silver(ctx, x0, x1, y0, y1) {
    var g = ctx.createLinearGradient(x0, 0, x1, 0);
    ['#ffffff', '#cccccc', '#ffffff', '#cccccc', '#ffffff', '#cccccc', '#ffffff', '#999999'].forEach(function (c, i) {
      g.addColorStop(i / 7, c);
    });
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }

  function background(ctx) {
    D.rect(ctx, 0, 0, 550, 400, '#aea588');
    // curved glass wall behind the desk: grey panes with blue glass below, dark mullions, two
    // polished columns
    var panes = [[70, 105, 157], [163, 199, 142], [243, 298, 142], [303, 337, 142], [342, 380, 142], [437, 470, 157]];
    panes.forEach(function (p) {
      D.rect(ctx, p[0], 86, p[1] - p[0], p[2] - 86, '#cccccc');
      D.rect(ctx, p[0], p[2], p[1] - p[0], 400 - p[2], '#6699ff');
      D.line(ctx, p[0], p[2], p[1], p[2], '#999999', 3);
    });
    D.rect(ctx, 199, 255, 44, 145, '#6699ff');
    silver(ctx, 110, 160, 86, 400);
    silver(ctx, 384, 432, 86, 400);
    [65, 105, 158, 199, 238, 298, 337, 379, 432, 470].forEach(function (x) {
      D.rect(ctx, x, 86, 5, 314, '#666666', '#333333', 0.8);
    });
    D.circle(ctx, 271, 147, 14, null, '#666699', 3);
    // ceiling: the silver RECEPTION canopy with four lights
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-10, 18);
    ctx.quadraticCurveTo(275, -2, 560, 18);
    ctx.lineTo(560, 66);
    ctx.quadraticCurveTo(275, 38, -10, 66);
    ctx.closePath();
    var g = ctx.createLinearGradient(0, 0, 550, 0);
    ['#ffffff', '#cccccc', '#ffffff', '#cccccc', '#ffffff', '#cccccc', '#ffffff', '#999999'].forEach(function (c, i) {
      g.addColorStop(i / 7, c);
    });
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-10, 66);
    ctx.quadraticCurveTo(275, 38, 560, 66);
    ctx.lineTo(560, 72);
    ctx.lineTo(485, 86);
    ctx.quadraticCurveTo(275, 68, 65, 86);
    ctx.lineTo(-10, 72);
    ctx.closePath();
    var g2 = ctx.createLinearGradient(0, 50, 0, 86);
    g2.addColorStop(0, '#f4f4f4');
    g2.addColorStop(1, '#bbbbbb');
    ctx.fillStyle = g2;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    [[77, 72], [206, 66], [334, 66], [462, 72]].forEach(function (l) {
      ctx.beginPath();
      ctx.ellipse(l[0], l[1], 23, 5, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#ffff99';
      ctx.fill();
      ctx.strokeStyle = '#999999';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(l[0], l[1] - 1, 15, 2.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffcc';
      ctx.fill();
    });
    // the sign's letters (Times, spaced out) along the canopy
    var letters = 'RECEPTION';
    var xs = [197, 213, 228, 244.5, 260.5, 276.5, 294, 308, 326];
    letters.split('').forEach(function (c, i) {
      D.text(ctx, c, xs[i], 37, { size: 18, color: '#333333', font: '"Times New Roman", Times, serif', bold: true });
    });
    // white counter on the right
    ctx.beginPath();
    ctx.moveTo(415, 290);
    ctx.quadraticCurveTo(480, 280, 550, 267);
    ctx.lineTo(550, 330);
    ctx.quadraticCurveTo(480, 334, 415, 345);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#999999';
    ctx.stroke();
    D.rect(ctx, 530, 268, 20, 64, '#cccccc');
    // gold reception desk with its pale top
    ctx.beginPath();
    ctx.moveTo(129, 282);
    ctx.lineTo(137, 271);
    ctx.quadraticCurveTo(270, 282, 409, 270);
    ctx.lineTo(415, 282);
    ctx.quadraticCurveTo(270, 294, 129, 282);
    ctx.closePath();
    ctx.fillStyle = '#ffffcc';
    ctx.fill();
    ctx.strokeStyle = '#604d0d';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(129, 282);
    ctx.quadraticCurveTo(270, 294, 415, 282);
    ctx.lineTo(415, 400);
    ctx.lineTo(129, 400);
    ctx.closePath();
    var gd = ctx.createLinearGradient(129, 0, 415, 0);
    gd.addColorStop(0, '#ccb71e');
    gd.addColorStop(0.51, '#eee28e');
    gd.addColorStop(1, '#ccb71e');
    ctx.fillStyle = gd;
    ctx.fill();
    ctx.stroke();
    [[136, 305, 205, 350], [305, 305, 352, 350]].forEach(function (r) {
      D.poly(ctx, [r[0], r[1], r[2], r[1] + 3, r[2], r[3], r[0], r[3] - 2], '#957815');
    });
    D.line(ctx, 129, 327, 415, 327, 'rgba(255,255,153,0.6)', 2);
    ctx.beginPath();
    ctx.ellipse(270, 290, 45, 3, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#669933';
    ctx.fill();
  }

  SRPG.registerLocation({
    id: 'nli',
    hud: 'inside',
    music: 'inside',
    exit: 'nli',
    panel: { x: 181, y: 104, w: 356, h: 252 },
    onEnter: function () { st.screen = 'main'; },
    onLeave: function () { st.screen = 'main'; },
    background: background,
    view: function () {
      (SCREENS[st.screen] || showMain)();
      return { custom: true };
    },
  });

  SRPG.nli = { JOBS: JOBS, rules: rules, state: st, go: go };
})();
