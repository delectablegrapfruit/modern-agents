// The bar fight (root frame 75 of the original; frame 76 is the "(IT FROZE)" apology screen).
// Two copies of one fighter clip face off: you on the left in blue, the opponent mirrored on the
// right with a red-only colour filter (black body, red fireballs). Each turn you get
// min(int(strength / 20) + 1, 15) ATTACK POINTS; when they run out (or you click DONE) the
// opponent strikes back. Everything is driven by the fighters' timeline frames exactly as in
// the original: damage lands on fixed animation frames, a turn ends when the animation does.
(function () {
  'use strict';
  var SRPG = window.SRPG;
  var ui = SRPG.ui;
  var D = SRPG.draw;

  var FONT = '"Arial Black", "Arial Bold", Arial, Helvetica, sans-serif';
  var ARIAL = 'Arial, Helvetica, sans-serif';
  var BLUE = '#003399';
  var PALE = '#94c9ff';

  // AS1 random(n) truncates a fractional n: random(4.5) is 0..3.
  function rnd(n) { return SRPG.rng.random(Math.floor(n)); }
  function S() { return SRPG.game.s; }
  function fullPts(s) { return Math.min(Math.floor(s.strength / 20) + 1, 15); }

  // Clip origins on the stage (the 'fight' clip at 286.6, 260.9 plus p1 / p2 offsets).
  var P1 = { x: 178.4, y: 202.8, m: 1 };
  var P2 = { x: 393.4, y: 202.0, m: -1 };
  var IDLE_X = -8; // the figure's torso sits 8px behind the clip origin

  // --- poses ---------------------------------------------------------------------------------
  // 12 joints in pose space (torso centre at 0,0; +x towards the opponent; feet at y 55):
  // head, neck, shoulder, hip, back elbow, back hand, front elbow, front hand,
  // back knee, back foot, front knee, front foot.
  var POSES = {
    IDLE: [1, -36, 0, -18, 0, -3, 0, 18, -17, 5, -4, -12, 17, 2, 24, -13, -4, 40, -16, 55, 11, 37, 12, 55],
    IDLE2: [1, -38, 0, -20, 0, -5, 0, 17, -17, 3, -5, -14, 15, 0, 20, -15, -4, 39, -16, 55, 11, 36, 12, 55],
    IDLE3: [1, -38, 0, -20, 0, -5, 0, 17, -18, 2, -7, -13, 13, 1, 16, -13, -4, 39, -16, 55, 11, 36, 12, 55],
    IDLE4: [1, -37, 0, -19, 0, -4, 0, 17.5, -18, 4, -6, -12, 14, 1, 18, -12, -4, 39.5, -16, 55, 11, 36.5, 12, 55],
    IDLE5: [1, -37.5, 0, -19.5, 0, -4.5, 0, 17.5, -17, 4, -5, -13, 16, 1, 22, -14, -4, 39.5, -16, 55, 11, 36.5, 12, 55],
    RUN1: [8, -35, 6, -17, 5, -3, 0, 18, -10, 8, -20, 0, 18, 6, 24, -8, 14, 33, 10, 53, -7, 36, -22, 46],
    RUN2: [8, -35, 6, -17, 5, -3, 0, 18, 16, 8, 22, -4, -11, 7, -19, -4, -8, 36, -4, 55, 15, 31, 27, 42],
    PUNCH: [7, -35, 5, -17, 4, -3, 0, 18, -9, 8, 7, -5, 22, -9, 42, -15, -10, 37, -19, 55, 13, 36, 20, 55],
    PUNCH2: [6, -35, 4, -17, 4, -3, 0, 18, -9, 8, 7, -5, 20, -4, 36, -9, -10, 37, -19, 55, 13, 36, 20, 55],
    CROUCH: [2, -28, 1, -10, 1, 4, 0, 24, -14, 12, -4, 0, 16, 10, 22, -2, -8, 40, -16, 55, 14, 40, 14, 55],
    SPREAD: [0, -36, 0, -18, 0, -3, 0, 18, -14, 7, -26, 15, 14, 7, 26, 15, -9, 36, -15, 54, 9, 36, 15, 54],
    KICK: [-2, -36, -1, -18, -1, -4, 0, 16, -16, -8, -27, -2, 10, -12, 18, -22, -2, 33, -14, 42, 18, 17, 38, 15],
    CHARGE_A: [0, -36, 0, -18, 0, -3, 0, 18, 8, 9, 13, -3, 12, 7, 16, -4, -4, 40, -14, 55, 10, 37, 12, 55],
    CHARGE_B: [0, -36, 0, -18, 0, -3, 0, 18, 11, 7, 20, -5, 14, 5, 23, -7, -4, 40, -14, 55, 10, 37, 12, 55],
    THROW: [2, -36, 1, -18, 1, -3, 0, 18, -14, 5, -22, 13, 18, -4, 35, -6, -4, 40, -14, 55, 10, 37, 14, 55],
    ENERGY_MID: [0, -36, 0, -18, 0, -3, 0, 18, -15, -6, -20, -18, 15, -6, 20, -18, -4, 40, -14, 55, 10, 37, 12, 55],
    ENERGY_UP: [0, -36, 0, -18, 0, -3, 0, 18, -12, -16, -18, -33, 12, -16, 18, -33, -4, 40, -14, 55, 10, 37, 12, 55],
    ENERGY_SPREAD: [0, -36, 0, -18, 0, -3, 0, 18, -16, -6, -29, 1, 16, -6, 29, 1, -4, 40, -14, 55, 10, 37, 12, 55],
    ENERGY_PUSH: [2, -36, 1, -18, 1, -3, 0, 18, 14, -3, 30, -8, 16, -5, 32, -10, -6, 40, -16, 55, 10, 37, 14, 55],
  };
  // Running back home: the run poses facing the other way.
  ['RUN1', 'RUN2'].forEach(function (k) {
    POSES[k + 'B'] = POSES[k].map(function (v, i) { return i % 2 === 0 ? -v : v; });
  });

  // Timeline of the fighter clip (sprite 2023): [frame, pose, dx, dy, rot°]. A key holds until the
  // next one, like the original's two-frame drawings. 1-9 idle, 11-54 PUNCH (hit on 27), 55-89
  // KICK (hit on 67), 90-150 FIREBALL (hit on 130), 151-215 PURE ENERGY (hit on 185), 216-370 dying.
  var KEYS = [
    [1, 'IDLE'], [3, 'IDLE2'], [5, 'IDLE3'], [7, 'IDLE4'], [9, 'IDLE5'],
    // punch: run in, two jabs, backflip home
    [11, 'IDLE'], [13, 'RUN1', 20], [15, 'RUN2', 46], [17, 'RUN1', 75], [19, 'RUN2', 98], [21, 'RUN1', 128],
    [23, 'RUN2', 150], [25, 'PUNCH', 166], [27, 'PUNCH', 170], [29, 'PUNCH2', 170], [31, 'IDLE', 176], [33, 'IDLE5', 180],
    [35, 'CROUCH', 176, 4], [37, 'SPREAD', 150, -28, -45], [39, 'SPREAD', 114, -44, -90], [41, 'SPREAD', 78, -50, -135],
    [43, 'SPREAD', 44, -36, -165], [45, 'SPREAD', 16, -2, -180], [47, 'SPREAD', -4, -12, -215],
    [49, 'SPREAD', -14, -30, -270], [51, 'SPREAD', -10, -16, -320], [53, 'CROUCH', -2, 4, -360],
    // kick: run in, flying kick to the head, bounce off, run back
    [55, 'IDLE5'], [57, 'RUN1', 20], [59, 'RUN2', 46], [61, 'RUN1', 75], [63, 'KICK', 106, -22, -15],
    [65, 'KICK', 140, -38, -30], [67, 'KICK', 160, -42, -35], [71, 'SPREAD', 166, -80, -70],
    [75, 'SPREAD', 178, -58, -25], [79, 'SPREAD', 150, -50, 0], [81, 'IDLE', 130, -32], [83, 'RUN2B', 100],
    [85, 'RUN1B', 64], [87, 'RUN2B', 36],
    // fireball: pump the hands while the flame grows, then throw
    [90, 'CHARGE_A'], [92, 'CHARGE_B'], [94, 'CHARGE_A'], [96, 'CHARGE_B'], [98, 'CHARGE_A'], [100, 'CHARGE_B'],
    [102, 'CHARGE_A'], [104, 'CHARGE_B'], [106, 'CHARGE_A'], [108, 'CHARGE_B'], [110, 'THROW'],
    // pure energy: raise the orb overhead, bring it down, blast
    [151, 'IDLE'], [153, 'ENERGY_MID'], [155, 'ENERGY_UP'], [171, 'ENERGY_SPREAD'], [177, 'ENERGY_MID'], [181, 'ENERGY_PUSH'],
  ];

  function keyAt(frame) {
    var k = KEYS[0];
    for (var i = 0; i < KEYS.length && KEYS[i][0] <= frame; i++) k = KEYS[i];
    return k;
  }

  // --- state -----------------------------------------------------------------------------------
  var F = null;

  function clip(frame, pos) {
    return { frame: frame, playing: true, pos: pos, pow: { frame: 1, playing: true } };
  }

  function newFight(params) {
    var s = S();
    var hpmax2 = rnd(s.barfight * 5) + s.barfight * 5;
    F = {
      from: (params && params.from) || 'bar',
      fbugfix: 0,
      hpmax2: hpmax2,
      hp2: hpmax2,
      hit: '!',
      att: 0,
      attpts: fullPts(s),
      attmode: 0,
      hpbar2: true,
      itfroze: true,
      froze: false,
      p1: clip(1, P1),
      p2: clip(5, P2), // sprite 2016: p2.gotoAndPlay(5), so the two idle loops are out of step
      ctl: 1,
      fwin: null,
      dieIn: -1,
      tris: [],
      el: {},
    };
    // Entering a fight costs 2 karma. Frame 75's script has no karmaAdjust() after it, so this can
    // take karma below -100 until the next clamp.
    SRPG.game.s.karma -= 2;
    // Ten tumbling specks drifting down the backdrop (sprite 2019 x10, at half size).
    var TX = [39, 93.2, 163.3, 216.4, 328.8, -28.4, -76.4, -140.4, -174, 124.6];
    var TY = [-11.2, -13.6, -10.6, -12.8, -8.8, -7.2, -10.4, -7.2, -8.8, -11.5];
    for (var i = 0; i < 10; i++) {
      F.tris.push({ ox: TX[i], oy: TY[i], x: -74.4, y: -193.6, xm: Math.floor(Math.random() * 20) - 10,
        ym: Math.floor(Math.random() * 10) + 1, xd: -1, ph: 0 });
    }
    control(); // the controller clip's first frame runs straight away
  }

  // Jump a clip to a frame and run that frame's script (gotoAndPlay).
  function play(c, frame) {
    c.frame = frame;
    c.playing = true;
    frameScript(c);
  }

  function sfx(n) { SRPG.sound.play(n); }

  // The hit frames of every attack: whoever is attacking (att 1 = you, 2 = the opponent) deals
  // the damage rolled when the attack started, and this clip's POW star pops up.
  function landHit(c) {
    if (F.att === 1) F.hp2 -= F.hit;
    if (F.att === 2) S().hp -= F.hit;
    c.pow.frame = 1;
    c.pow.playing = true;
  }

  // End of an attack animation: the turn passes back to you once the opponent's attack is over.
  function endAttack(c) {
    if (F.att === 2) F.attpts = fullPts(S());
    F.attmode = 0;
    c.frame = 1;
  }

  function frameScript(c) {
    var s = S();
    switch (c.frame) {
      case 10: c.frame = 1; break;
      case 25: sfx('punch'); break;
      case 27: sfx('punch'); landHit(c); break;
      case 54: case 89: case 150: case 215: endAttack(c); break;
      case 65: sfx('swoosh'); break;
      case 67: case 130: landHit(c); break;
      case 110: sfx('fireball'); break;
      case 185: sfx('energy'); landHit(c); break;
      case 216: SRPG.sound.music(null); break; // the fight music stops as he goes down
      case 234: F.itfroze = false; break;
      case 295:
        // STRENGTH INCREASED!!! (+3, capped at 999; max HP +3 regardless)
        s.strength += 3;
        if (s.strength > 999) s.strength = 999;
        s.hpmax += 3;
        break;
      case 350:
        // The prize: random(barfight * 5) + barfight * 5 dollars, and the next opponent is tougher.
        F.fwin = Math.floor(rnd(s.barfight * 5) + s.barfight * 5);
        s.cash += F.fwin;
        s.barfight += 1;
        break;
      case 370: c.playing = false; break;
    }
  }

  function advance(c) {
    if (!c.playing) return;
    c.frame += 1;
    frameScript(c);
  }

  function advancePow(p) {
    if (!p.playing) return;
    p.frame += 1;
    if (p.frame >= 20) { p.frame = 20; p.playing = false; }
  }

  // The opponent's move: its strength is YOUR strength (the original's quirk, kept).
  // retack1 = random(strength) + 1 picks the attack. From DONE, a 0-damage roll becomes 1; when
  // your points run out (the automatic reply) it can stay 0.
  function enemyAttack(fromDone) {
    var s = S();
    var r = Math.floor(rnd(s.strength)) + 1;
    var hit;
    if (r > 40) { play(F.p2, 151); hit = Math.floor(rnd(s.strength / 1.5)); if (fromDone && hit === 0) hit = 1; }
    else if (r > 20) { play(F.p2, 90); hit = Math.floor(rnd(s.strength / 2.5)); if (fromDone && hit === 0) hit = 1; }
    else if (r > 10) { play(F.p2, 55); hit = Math.floor(rnd(s.strength / 4.5)); if (fromDone && hit === 0) hit = 1; }
    else { play(F.p2, 11); hit = Math.floor(rnd(s.strength / 10)) + 1; }
    F.hit = hit;
  }

  // Sprite 2185, run every other frame: the knockout check, then the automatic reply when your
  // attack points are spent.
  function control() {
    if (!(F.hp2 > 0) && F.attmode === 0) {
      F.attmode = 1;
      F.hpbar2 = false;
      play(F.p2, 216);
      F.p1.playing = false;
    }
    if (F.attpts === 0 && F.attmode === 0 && F.hp2 > 0) {
      F.fbugfix = 1;
      F.att = 2;
      enemyAttack(false);
      F.attmode = 1;
    }
  }

  // --- your moves ------------------------------------------------------------------------------
  var MOVES = {
    punch: { cost: 1, frame: 11, dmg: function (s, k) { return Math.floor(rnd((s.strength + 10) / 10) + k * 2); } },
    kick: { cost: 2, frame: 55, dmg: function (s, k) { return Math.floor(rnd(s.strength / 4.5) + k * 2 + 1); } },
    fireball: { cost: 3, frame: 90, dmg: function (s) { return Math.floor(rnd(s.strength / 2.5)); } },
    energy: { cost: 4, frame: 151, dmg: function (s) { return Math.floor(rnd(s.strength / 1.5)); } },
  };

  function attack(kind) {
    var m = MOVES[kind];
    var s = S();
    if (!(F.attmode === 0 && F.attpts > m.cost - 1)) return false;
    F.attmode = 1;
    F.attpts -= m.cost;
    F.att = 1;
    // The knife adds 2 to punches and kicks.
    var hit = m.dmg(s, s.items.knife || 0);
    if (hit === 0) hit = 1;
    F.hit = hit;
    play(F.p1, m.frame);
    refreshUI();
    return true;
  }

  function done() {
    if ((F.fbugfix === 1 || F.attmode === 0) && F.hp2 > 0) {
      F.fbugfix = 0;
      F.attmode = 1;
      F.att = 2;
      enemyAttack(true);
      F.attpts = fullPts(S());
      refreshUI();
      return true;
    }
    return false;
  }

  function backToBar() {
    SRPG.sound.music(null);
    SRPG.location.open(F.from);
  }

  function runAway() {
    if (F.attmode !== 0) return false;
    backToBar();
    return true;
  }

  // OK under the winnings (Button 2133): another 3 karma, unclamped like the entry cost.
  function winOk() {
    SRPG.game.s.karma -= 3;
    backToBar();
  }

  function froze() {
    F.froze = true;
    buildFroze();
  }

  // --- DOM -------------------------------------------------------------------------------------
  function txt(parent, html, x, y, o) {
    o = o || {};
    var t = ui.el('div', 'nopoint', parent, html);
    t.style.cssText = 'position:absolute;left:' + x + 'px;top:' + y + 'px;white-space:nowrap;font:' + (o.weight || 'bold') + ' ' +
      (o.size || 13) + 'px ' + (o.font || FONT) + ';color:' + (o.color || PALE) + ';line-height:' + (o.lh || 16.5) + 'px;' +
      (o.w ? 'width:' + o.w + 'px;' : '') + 'text-align:' + (o.align || 'left');
    if (o.id) t.setAttribute('data-id', o.id);
    return t;
  }

  function lbl(html) {
    return '<span style="font-size:9px;line-height:13px;white-space:nowrap;color:' + BLUE + '">' + html + '</span>';
  }

  // The DONE tile's circular arrow (no shared icon for it).
  function doneIcon(tile, size) {
    var c = document.createElement('canvas');
    c.width = size * 3;
    c.height = size * 3;
    c.style.cssText = 'width:' + size + 'px;height:' + size + 'px;display:block';
    var x = c.getContext('2d');
    x.scale(3 * size / 36, 3 * size / 36);
    var g = x.createLinearGradient(6, 6, 30, 30);
    g.addColorStop(0, '#9fd3ff');
    g.addColorStop(0.5, '#1f6fd6');
    g.addColorStop(1, '#0a2f86');
    x.lineCap = 'butt';
    x.strokeStyle = '#06205e';
    x.lineWidth = 8.4;
    x.beginPath();
    x.arc(18, 18, 10.5, Math.PI * 0.62, Math.PI * 2.28);
    x.stroke();
    x.strokeStyle = g;
    x.lineWidth = 6.4;
    x.stroke();
    D.poly(x, [22.5, 22, 32.5, 23, 26, 32.5], '#1a4fb8', '#06205e', 1);
    tile.appendChild(c);
  }

  function btn(p, o) {
    var b = ui.iconButton(p, { icon: o.icon, label: lbl(o.label), x: o.x - 9.6, y: o.y - 291, w: o.w || 140, size: 36, id: o.id }, function () {
      o.onClick();
    });
    b.querySelector('.lbl').style.marginLeft = o.gap + 'px';
    if (!o.icon) doneIcon(b.querySelector('.ico'), 36);
    return b;
  }

  function buildUI() {
    ui.clear();
    var el = F.el = {};
    // Panel: shape 105 at 150% x 50%, 80% opaque (8.6..542.4 x 290..391).
    var p = ui.panel(8.6, 290, 533.8, 101);
    p.setAttribute('data-screen', 'fight');
    p.style.background = 'rgba(72,132,255,0.8)'; // opaque panel colour at this placement's 80%
    txt(p, 'ATTACK<br>POINTS:', 21.4 - 9.6, 304 - 291, { lh: 16.5 });
    el.pts = txt(p, String(F.attpts), 93.5 - 9.6, 292 - 291, { size: 46, lh: 52, id: 'attpts' });
    txt(p, 'STRENGTH:', 23 - 9.6, 356 - 291);
    el.str = txt(p, String(S().strength), 105 - 9.6, 356 - 291, { id: 'strength' });
    // Buttons: 48px tiles at 75%, centred on the original's button positions.
    btn(p, { id: 'punch', icon: 'punch', x: 161.8, y: 299.5, gap: 7.4, label: 'PUNCH<br>(1 ATTACK PT)', onClick: function () { attack('punch'); } });
    btn(p, { id: 'kick', icon: 'kick', x: 161.8, y: 345.4, gap: 7.4, label: 'KICK<br>(2 ATTACK PT)', onClick: function () { attack('kick'); } });
    btn(p, { id: 'fireball', icon: 'fireball', x: 299.4, y: 299.5, gap: 7.8, label: 'FIREBALL<br>(3 ATTACK PT)', onClick: function () { attack('fireball'); } });
    btn(p, { id: 'energy', icon: 'energy', x: 299.4, y: 345.5, gap: 7.8, label: 'PURE ENERGY<br>(4 ATTACK PT)', onClick: function () { attack('energy'); } });
    btn(p, { id: 'done', icon: null, x: 432.7, y: 299.8, gap: 7.3, w: 100, label: 'DONE', onClick: done });
    btn(p, { id: 'run', icon: 'run', x: 432.4, y: 345.2, gap: 7.6, w: 108, label: 'RUN AWAY!', onClick: runAway });

    // "(IT FROZE)": the original's escape hatch for the fight's lock-ups, with its hover hint.
    var tip = txt(null, 'Click here if the fight gets stuck and won\'t carry on', 250, 259.5, { size: 10, color: BLUE, w: 286, align: 'right', lh: 13, id: 'frozetip' });
    tip.style.display = 'none';
    var fr = ui.el('div', '', null, '(IT FROZE)');
    fr.setAttribute('data-id', 'itfroze');
    fr.style.cssText = 'position:absolute;left:487.5px;top:271px;width:50.5px;height:11px;cursor:pointer;text-align:right;' +
      'font:bold 7.6px ' + FONT + ';color:' + BLUE + ';line-height:11px;white-space:nowrap';
    fr.addEventListener('mouseenter', function () { tip.style.display = ''; });
    fr.addEventListener('mouseleave', function () { tip.style.display = 'none'; });
    fr.addEventListener('click', function (e) { e.stopPropagation(); froze(); });
    el.froze = fr;
    el.tip = tip;

    // The OK under the winnings (inside the opponent's clip, so it comes out red).
    var ok = ui.el('div', '', null, 'OK');
    ok.setAttribute('data-id', 'fight-ok');
    ok.style.cssText = 'position:absolute;left:230.5px;top:148px;width:69.5px;height:24.5px;box-sizing:border-box;cursor:pointer;' +
      'background:#cc0000;border:1.2px solid #330000;border-radius:8px;text-align:center;font:bold 10px ' + FONT +
      ';color:#330000;line-height:22px;display:none';
    ok.addEventListener('mouseenter', function () { ok.style.background = '#e01010'; });
    ok.addEventListener('mouseleave', function () { ok.style.background = '#cc0000'; });
    ok.addEventListener('click', function (e) { e.stopPropagation(); winOk(); });
    el.ok = ok;
    refreshUI();
  }

  function refreshUI() {
    var el = F && F.el;
    if (!el || !el.pts) return;
    var s = S();
    var a = String(F.attpts);
    if (el.pts.textContent !== a) el.pts.textContent = a;
    var st = String(s.strength);
    if (el.str.textContent !== st) el.str.textContent = st;
    el.froze.style.display = F.itfroze ? '' : 'none';
    if (!F.itfroze) el.tip.style.display = 'none';
    el.ok.style.display = F.p2.frame >= 350 ? '' : 'none';
  }

  // Frame 76: white page, apology, DONE back to the bar.
  function buildFroze() {
    ui.clear();
    F.el = {};
    var box = ui.el('div', 'nopoint', null, '');
    box.setAttribute('data-screen', 'froze');
    box.style.cssText = 'position:absolute;left:90px;top:160px;color:#ff0000;font:bold 13px ' + FONT + ';line-height:20px;white-space:nowrap';
    box.innerHTML = '<div style="font-size:19.5px;line-height:28px">SORRY ABOUT THE TROUBLE</div>' +
      'THIS IS A KNOWN BUG, AND<br>A FIX IS IN THE WORKS.<br>CLICK \'DONE\' TO HEAD BACK<br>&nbsp;TO THE BAR.';
    var d = ui.el('div', '', null, 'DONE');
    d.setAttribute('data-id', 'froze-done');
    d.style.cssText = 'position:absolute;left:250px;top:302px;width:52px;text-align:center;cursor:pointer;font:bold 21px Impact, "Arial Narrow", ' +
      FONT + ';color:#0066cc;letter-spacing:-0.5px;transform:scaleX(0.82);line-height:26px';
    d.addEventListener('mouseenter', function () { d.style.color = '#3399ff'; });
    d.addEventListener('mouseleave', function () { d.style.color = '#0066cc'; });
    d.addEventListener('click', function (e) { e.stopPropagation(); backToBar(); });
  }

  // --- drawing ---------------------------------------------------------------------------------
  // The opponent's clip has a red-only colour filter: #RRGGBB -> #RR0000.
  function col(hex, red) { return red ? hex.slice(0, 3) + '0000' : hex; }

  function toStage(pos, cx, cy) { return { x: pos.x + pos.m * cx, y: pos.y + cy }; }

  function drawPose(ctx, pos, name, dx, dy, rot, headFill) {
    var P = POSES[name];
    var a = (rot || 0) * Math.PI / 180;
    var ca = Math.cos(a), sa = Math.sin(a);
    var pts = [];
    for (var i = 0; i < 24; i += 2) {
      var x = P[i] * ca - P[i + 1] * sa;
      var y = P[i] * sa + P[i + 1] * ca;
      pts.push(toStage(pos, IDLE_X + (dx || 0) + x, (dy || 0) + y));
    }
    strokeFigure(ctx, pts, headFill);
  }

  // pts: head, neck, shoulder, hip, bElbow, bHand, fElbow, fHand, bKnee, bFoot, fKnee, fFoot
  function strokeFigure(ctx, pts, headFill) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.15;
    ctx.beginPath();
    ctx.moveTo(pts[1].x, pts[1].y);
    ctx.lineTo(pts[3].x, pts[3].y);
    ctx.moveTo(pts[2].x, pts[2].y);
    ctx.lineTo(pts[4].x, pts[4].y);
    ctx.lineTo(pts[5].x, pts[5].y);
    ctx.moveTo(pts[2].x, pts[2].y);
    ctx.lineTo(pts[6].x, pts[6].y);
    ctx.lineTo(pts[7].x, pts[7].y);
    ctx.moveTo(pts[3].x, pts[3].y);
    ctx.lineTo(pts[8].x, pts[8].y);
    ctx.lineTo(pts[9].x, pts[9].y);
    ctx.moveTo(pts[3].x, pts[3].y);
    ctx.lineTo(pts[10].x, pts[10].y);
    ctx.lineTo(pts[11].x, pts[11].y);
    ctx.stroke();
    D.circle(ctx, pts[0].x, pts[0].y, 18, headFill, '#000', 1.2);
    ctx.restore();
  }

  // The opponent falls flat on his face towards you (frames 216-232), pivoting on his feet.
  function drawFalling(ctx, c, headFill) {
    var u = Math.min(1, (c.frame - 216) / 16);
    var ang = 90 * Math.pow(u, 1.4) * Math.PI / 180;
    var P = POSES.IDLE;
    var fl = POSES.SPREAD;
    var ca = Math.cos(ang), sa = Math.sin(ang);
    var px = IDLE_X - 2, py = 55; // pivot at the feet
    var pts = [];
    for (var i = 0; i < 24; i += 2) {
      // arms fling up as he goes
      var bx = i >= 8 && i < 16 ? P[i] + (fl[i] - P[i]) * u - 6 * u : P[i];
      var by = i >= 8 && i < 16 ? P[i + 1] - 10 * u * (i % 4 === 2 ? 1.6 : 1) : P[i + 1];
      var x = IDLE_X + bx - px, y = by - py;
      pts.push(toStage(c.pos, px + x * ca - y * sa, py + x * sa + y * ca));
    }
    strokeFigure(ctx, pts, headFill);
  }

  // Dead on the floor in a pool of blood (frames 234+): the pool grows from 10% to 50%.
  function drawDead(ctx, c, headFill) {
    var f = c.frame;
    var u = Math.min(1, (f - 234) / 132);
    var k = 0.1 + 0.4 * (1 - (1 - u) * (1 - u));
    var bx = 98 - 7.5 * u, by = 60 + 4.3 * u;
    var o = toStage(c.pos, bx, by);
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.scale(c.pos.m * k, k);
    ctx.fillStyle = '#ff0000';
    ctx.beginPath();
    ctx.moveTo(-112, -8);
    ctx.bezierCurveTo(-118, -40, -60, -62, 0, -52);
    ctx.bezierCurveTo(50, -58, 70, -40, 96, -30);
    ctx.bezierCurveTo(140, -24, 158, -2, 150, 10);
    ctx.bezierCurveTo(140, 30, 90, 24, 50, 20);
    ctx.bezierCurveTo(10, 32, -40, 30, -70, 22);
    ctx.bezierCurveTo(-100, 18, -110, 10, -112, -8);
    ctx.fill();
    ctx.restore();
    var J = function (x, y) { return toStage(c.pos, x, y); };
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.15;
    var lines = [
      [J(80, 40), J(22, 39)], // body
      [J(22, 39), J(8, 44), J(-3, 48)], // leg
      [J(43, 39), J(26, 55), J(4, 55)], // leg
      [J(86, 27), J(66, 39), J(66, 58), J(45, 53)], // arms
    ];
    ctx.beginPath();
    lines.forEach(function (l) {
      ctx.moveTo(l[0].x, l[0].y);
      for (var i = 1; i < l.length; i++) ctx.lineTo(l[i].x, l[i].y);
    });
    ctx.stroke();
    var h = J(98.4, 40.5);
    D.circle(ctx, h.x, h.y, 18, headFill, '#000', 1.2);
    // a red gash across his face
    var z = [J(106, 34), J(99, 34), J(101, 42), J(95, 43), J(97, 50)];
    ctx.strokeStyle = '#cc0000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(z[0].x, z[0].y);
    for (var q = 1; q < z.length; q++) ctx.lineTo(z[q].x, z[q].y);
    ctx.stroke();
    ctx.restore();
  }

  // POW! star (sprite 2025) with the damage value, at 75% opacity.
  function drawPow(ctx, c) {
    var p = c.pow;
    if (p.frame < 2 || p.frame >= 20) return;
    var o = toStage(c.pos, 214, -94.3);
    var a = p.frame <= 3 ? 1 : Math.max(0, 1 - (p.frame - 3) * 15 / 256);
    ctx.save();
    ctx.globalAlpha = 0.75 * a;
    ctx.translate(o.x, o.y);
    if (p.frame === 2) { ctx.rotate(-Math.PI / 4); ctx.scale(0.71, 0.71); }
    ctx.beginPath();
    var R = [26, 24, 27, 25, 26, 23, 27];
    for (var i = 0; i < 14; i++) {
      var ang = -Math.PI / 2 + i * Math.PI / 7;
      var r = i % 2 ? 12 : R[i / 2];
      ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
    }
    ctx.closePath();
    ctx.fillStyle = '#dd1f1f';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#7a0000';
    ctx.stroke();
    D.text(ctx, String(F.hit), 0, 1, { size: 12, bold: true, font: ARIAL, align: 'center', baseline: 'middle', color: '#330000' });
    ctx.restore();
  }

  // Sprite 2065: the flame spins up in front of the chest for 22 frames, then flies 12px a frame.
  function drawFireball(ctx, c, red) {
    var sf = c.frame - 89;
    if (sf < 1 || sf > 40) return;
    var x, y, k, spin;
    if (sf <= 22) {
      var u = (sf - 1) / 21;
      k = 0.05 + 0.9 * (1 - (1 - u) * (1 - u));
      x = 0.2 + 1.2 * u;
      y = -6.8 + 1.7 * u;
      spin = sf * 1.3;
    } else {
      k = 0.95;
      x = 0.2 + 13.2 + 12 * (sf - 23);
      y = -5.1;
      spin = 0;
    }
    var o = toStage(c.pos, x, y);
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.scale(c.pos.m, 1);
    if (sf >= 22) {
      // the flame trail behind it
      var tg = ctx.createLinearGradient(-48, 0, -2, 0);
      tg.addColorStop(0, col('#ff3300', red) + '00');
      tg.addColorStop(0.6, col('#ff6600', red));
      tg.addColorStop(1, col('#ffcc00', red));
      ctx.fillStyle = tg;
      ctx.beginPath();
      ctx.moveTo(-48, 1);
      ctx.lineTo(-38, -3);
      ctx.lineTo(-30, 0);
      ctx.lineTo(-22, -6);
      ctx.lineTo(-12, -4);
      ctx.lineTo(-2, -9);
      ctx.lineTo(-2, 9);
      ctx.lineTo(-14, 6);
      ctx.lineTo(-24, 8);
      ctx.lineTo(-33, 3);
      ctx.closePath();
      ctx.fill();
    }
    ctx.rotate(spin);
    ctx.scale(k, k);
    ctx.beginPath();
    var R = [15, 9, 14, 8, 16, 9, 13, 8, 15, 10, 14, 8, 16, 9];
    for (var i = 0; i < R.length; i++) {
      var a = i * Math.PI * 2 / R.length;
      ctx.lineTo(1 + Math.cos(a) * R[i] * 1.05, Math.sin(a) * R[i]);
    }
    ctx.closePath();
    var g = ctx.createRadialGradient(2, 0, 1, 1, 0, 16);
    g.addColorStop(0, col('#ffee66', red));
    g.addColorStop(0.45, col('#ff8800', red));
    g.addColorStop(1, col('#dd3300', red));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = col('#aa2200', red);
    ctx.stroke();
    ctx.restore();
  }

  // Sprite 2076: an orb forms over the head (20 frames), drops in front of the chest, then a beam
  // fires across to the opponent (frames 36-65 of the sprite), flickering.
  function drawEnergy(ctx, c, red) {
    var sf = c.frame - 150;
    if (sf < 1 || sf > 65) return;
    if (sf <= 35) {
      var x, y, k;
      if (sf <= 20) {
        var u = (sf - 1) / 19;
        var e = 1 - (1 - u) * (1 - u);
        k = 0.05 + 0.95 * e;
        x = -2 + 10.4 * e;
        y = -67 + 25.6 * e;
      } else {
        var v = Math.min(1, (sf - 20) / 10);
        var e2 = 1 - (1 - v) * (1 - v);
        k = 1;
        x = 8.4 + 29.6 * e2;
        y = -41.4 + 52.4 * e2;
      }
      orb(ctx, toStage(c.pos, x, y), 9 * k, red, sf);
      return;
    }
    var wide = Math.floor((sf - 36) / 2) % 2 === 1;
    var end = 49.1 + 140.6 + Math.min(13.2, (sf - 36) * 0.8);
    var yC = -19;
    var a = toStage(c.pos, 16, yC);
    var b = toStage(c.pos, end - 14, yC);
    ctx.save();
    var g = ctx.createLinearGradient(0, a.y - 7, 0, a.y + 7);
    g.addColorStop(0, col('#5aa8ff', red));
    g.addColorStop(0.35, col('#d8ecff', red));
    g.addColorStop(0.55, col('#ffffff', red));
    g.addColorStop(1, col('#2f6fd8', red));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y - 7);
    ctx.lineTo(b.x, b.y - 7);
    ctx.lineTo(b.x, b.y + 7);
    ctx.lineTo(a.x, a.y + 7);
    ctx.arc(a.x, a.y, 7, Math.PI / 2, Math.PI * 1.5, c.pos.m > 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = col('#1f55b8', red);
    ctx.lineWidth = 0.8;
    ctx.stroke();
    // jagged blast at the tip
    var h = wide ? 1.25 : 1;
    var tip = [[-14, -10], [-4, -26], [-6, -12], [8, -30], [2, -10], [16, -4], [16, 4], [2, 10], [8, 30], [-6, 12], [-4, 26], [-14, 10]];
    ctx.beginPath();
    tip.forEach(function (p) {
      var q = toStage(c.pos, end - 16 + p[0], yC + p[1] * h);
      ctx.lineTo(q.x, q.y);
    });
    ctx.closePath();
    var tg = ctx.createLinearGradient(b.x, b.y - 30, b.x, b.y + 30);
    tg.addColorStop(0, col('#0a2a9a', red));
    tg.addColorStop(0.5, col('#3f8cff', red));
    tg.addColorStop(1, col('#0a2a9a', red));
    ctx.fillStyle = tg;
    ctx.fill();
    ctx.restore();
  }

  function orb(ctx, o, r, red, sf) {
    if (r < 0.4) return;
    ctx.save();
    var g = ctx.createRadialGradient(o.x - r * 0.3, o.y - r * 0.3, r * 0.1, o.x, o.y, r);
    g.addColorStop(0, col('#ffffff', red));
    g.addColorStop(0.45, col('#bfe0ff', red));
    g.addColorStop(0.85, col('#4a9cff', red));
    g.addColorStop(1, col('#4a9cff', red) + '00');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(o.x, o.y, r, 0, Math.PI * 2);
    ctx.fill();
    // little sparks around it
    ctx.strokeStyle = col('#7fbfff', red);
    ctx.lineWidth = 0.8;
    for (var i = 0; i < 3; i++) {
      var a = sf * 0.7 + i * 2.1;
      ctx.beginPath();
      ctx.moveTo(o.x + Math.cos(a) * r * 1.3, o.y + Math.sin(a) * r * 1.3);
      ctx.lineTo(o.x + Math.cos(a) * r * 1.8, o.y + Math.sin(a) * r * 1.8);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawFighter(ctx, c, isP2) {
    var head = isP2 ? '#000000' : '#0066cc';
    var f = c.frame;
    if (f >= 234) drawDead(ctx, c, head);
    else if (f >= 216) drawFalling(ctx, c, head);
    else {
      var k = keyAt(f);
      drawPose(ctx, c.pos, k[1], k[2], k[3], k[4], head);
      if (f >= 90 && f <= 150) drawFireball(ctx, c, isP2);
      if (f >= 151 && f <= 215) drawEnergy(ctx, c, isP2);
    }
    if (f < 216) drawPow(ctx, c);
    // The winner's texts live in the loser's clip, hence red.
    if (f >= 255) D.text(ctx, 'YOU WIN!!!', 265.5, 77, { size: 34, bold: true, align: 'center', color: '#ff0000' });
    if (f >= 285 && f < 350) {
      D.text(ctx, 'STRENGTH INCREASED!!!', 267.3, 101, { size: 15, bold: true, align: 'center', color: '#ff0000' });
      var big = f >= 295;
      D.text(ctx, String(S().strength), 264.6, big ? 136 : 134, { size: big ? 20.8 : 17.6, bold: false, font: ARIAL, align: 'center', color: '#ff0000' });
    }
    if (f >= 350 && F.fwin != null) {
      D.text(ctx, 'You pry $' + F.fwin + ' out of the dead guy\'s wallet.', 286.5, 114, { size: 14.5, bold: true, font: ARIAL, align: 'center', color: '#ff0000' });
    }
  }

  // Backdrop: a grey room, the back wall in soft vertical bands, the floor the same bands in
  // perspective (sheared), and the tumbling specks.
  var bg = null;
  var BANDS = [[0, 204], [80, 203], [180, 158], [245, 195], [262, 195], [318, 158], [420, 204], [550, 158]];
  function bandGrad(ctx) {
    var g = ctx.createLinearGradient(-300, 0, 850, 0);
    var stops = [[-300, 204], [-120, 158], [-40, 204]].concat(BANDS).concat([[640, 195], [720, 158], [850, 204]]);
    stops.forEach(function (s) {
      var v = s[1];
      g.addColorStop((s[0] + 300) / 1150, 'rgb(' + v + ',' + v + ',' + v + ')');
    });
    return g;
  }
  function drawBackdrop(ctx) {
    if (!bg) {
      bg = document.createElement('canvas');
      bg.width = SRPG.W * 2;
      bg.height = SRPG.H * 2;
      var c = bg.getContext('2d');
      c.scale(2, 2);
      c.fillStyle = bandGrad(c);
      c.fillRect(0, 0, 550, 188);
      c.save();
      c.transform(1, 0, -1, 1, 188, 0);
      c.fillStyle = bandGrad(c);
      c.fillRect(-300, 188, 1200, 212);
      c.restore();
      D.line(c, 0, 188, 550, 188, 'rgba(140,140,140,0.3)', 0.8);
    }
    ctx.drawImage(bg, 0, 0, SRPG.W, SRPG.H);
  }

  function tickSpecks() {
    F.tris.forEach(function (t) {
      t.y += t.ym;
      t.x += t.xm;
      t.xm += t.xd;
      if (t.xm < -10) t.xd = 1;
      if (t.xm > 10) t.xd = -1;
      if (t.y > 700) {
        t.ym = Math.floor(Math.random() * 8) + 3;
        t.y = Math.floor(Math.random() * 400) - 600;
        t.x = Math.floor(Math.random() * 1050) - 400;
        t.ph = Math.floor(Math.random() * 49);
      }
      t.ph = (t.ph + 1) % 50;
    });
  }

  function drawSpecks(ctx) {
    ctx.save();
    F.tris.forEach(function (t) {
      var x = 253.4 + t.ox + t.x * 0.5;
      var y = 82.2 + t.oy + t.y * 0.5;
      if (y < -10 || y > 410) return;
      var a = t.ph / 50 * Math.PI * 2;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.scale(Math.max(0.2, Math.abs(Math.cos(a * 2))), 1);
      ctx.fillStyle = 'rgba(240,240,240,0.75)';
      ctx.beginPath();
      ctx.moveTo(0, -4);
      ctx.lineTo(3.6, 2.5);
      ctx.lineTo(-3.6, 2.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    });
    ctx.restore();
  }

  // The opponent's health bar (sprite 2191 at 125%): same look as yours, top right.
  function drawEnemyBar(ctx) {
    var x0 = 364, x1 = 536.1, y0 = 12.4, y1 = 24.9, sk = 7.3;
    var frac = Math.max(0, Math.min(1, F.hp2 / F.hpmax2));
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x0 + sk, y0);
    ctx.lineTo(x1, y0);
    ctx.lineTo(x1 - sk, y1);
    ctx.lineTo(x0, y1);
    ctx.closePath();
    ctx.fillStyle = '#5c0000';
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(x0, y0, (x1 - x0) * (Math.ceil(frac * 20) / 20), y1 - y0);
    ctx.restore();
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = '#000';
    ctx.stroke();
    ctx.font = 'bold 10.4px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(F.hp2 + '/ ' + F.hpmax2, 416, 19);
    ctx.restore();
    if (SRPG.hud.heart) {
      ctx.save();
      ctx.translate(351.5, 16.3);
      ctx.scale(1.04, 1.04);
      SRPG.hud.heart(ctx, 0, 0, frac);
      ctx.restore();
    }
  }

  // Frame 76's red badge with a skull.
  function drawSkull(ctx) {
    var x = 281, y = 104;
    D.circle(ctx, x, y, 37, '#990000');
    D.circle(ctx, x, y, 32, '#ff0000');
    ctx.save();
    ctx.translate(x, y + 2);
    ctx.beginPath();
    ctx.moveTo(-11, -18);
    ctx.bezierCurveTo(-18, -18, -21, -8, -18, 2);
    ctx.bezierCurveTo(-17, 8, -13, 10, -11, 12);
    ctx.lineTo(-10, 20);
    ctx.bezierCurveTo(-4, 23, 4, 23, 10, 20);
    ctx.lineTo(11, 12);
    ctx.bezierCurveTo(13, 10, 17, 8, 18, 2);
    ctx.bezierCurveTo(21, -8, 18, -18, 11, -18);
    ctx.closePath();
    var g = ctx.createLinearGradient(-18, 0, 18, 0);
    g.addColorStop(0, '#9a9a9a');
    g.addColorStop(0.35, '#ffffff');
    g.addColorStop(1, '#d4d4d4');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#555';
    ctx.stroke();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(-7, -3, 4.2, 3.4, 0.25, 0, Math.PI * 2);
    ctx.ellipse(7, -3, 4.2, 3.4, -0.25, 0, Math.PI * 2);
    ctx.fill();
    D.poly(ctx, [0, 3, -2.5, 8, 2.5, 8], '#000');
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.moveTo(-8, 13);
    ctx.quadraticCurveTo(0, 18, 8, 13);
    ctx.quadraticCurveTo(0, 15.5, -8, 13);
    ctx.fill();
    ctx.restore();
  }

  // --- screen ----------------------------------------------------------------------------------
  SRPG.registerScreen('fight', {
    enter: function (params) {
      newFight(params);
      SRPG.sound.music('fight');
      buildUI();
    },
    exit: function () {},
    tick: function () {
      var s = S();
      if (!F || !s || s.over) return;
      if (F.froze) return; // frame 76 just stops
      advancePow(F.p1.pow);
      advancePow(F.p2.pow);
      advance(F.p1);
      advance(F.p2);
      F.ctl = F.ctl === 1 ? 2 : 1;
      if (F.ctl === 1) control();
      tickSpecks();
      // Your health bar notices hp <= 0 within a few frames and ends the game (YOU DIED).
      if (s.hp <= 0) {
        if (F.dieIn < 0) F.dieIn = 4;
        else if (--F.dieIn <= 0) { SRPG.game.die(); return; }
      }
      refreshUI();
    },
    render: function (ctx) {
      var s = S();
      if (!F || !s) return;
      if (F.froze) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, SRPG.W, SRPG.H);
        drawSkull(ctx);
        SRPG.hud.draw(ctx, s, 'fight');
        if (F.hpbar2) drawEnemyBar(ctx);
        return;
      }
      drawBackdrop(ctx);
      drawSpecks(ctx);
      drawFighter(ctx, F.p1, false);
      drawFighter(ctx, F.p2, true);
      SRPG.hud.draw(ctx, s, 'fight');
      if (F.hpbar2) drawEnemyBar(ctx);
    },
  });

  // For tests and debugging.
  SRPG.fight = {
    get st() { return F; },
    attack: attack,
    done: done,
    runAway: runAway,
    fullPts: fullPts,
    rnd: rnd,
  };
})();
