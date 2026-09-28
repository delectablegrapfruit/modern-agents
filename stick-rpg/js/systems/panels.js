// The two panels opened from the city HUD: INVENTORY (root frame 5, the backpack) and STATS
// (root frame 6, the "?"). Laid out from the original's placements, in stage pixels.
// SRPG.panels.inventory(onClose) / stats(onClose) build the DOM and return { close(), panel, tick() };
// onClose runs when the player closes the panel with its X.
(function () {
  'use strict';
  var SRPG = window.SRPG;
  var ui = SRPG.ui;
  var esc = SRPG.util.escape;

  // Numbers as Flash prints them (no float noise).
  function num(n) {
    if (typeof n !== 'number' || !isFinite(n)) return String(n);
    return String(parseFloat(n.toPrecision(15)));
  }

  // The panel currently open (ticked with the city scene, see hookTick).
  var active = null;

  // The inventory's smoking animation runs on the game's 35 Hz tick. The city scene pauses itself
  // while a panel is open, so wrap its tick once to drive the open panel first.
  function hookTick() {
    var sc = SRPG.screens && SRPG.screens.city;
    if (!sc || sc.__panelTick) return;
    var orig = sc.tick;
    sc.tick = function () {
      if (active && active.tick) active.tick();
      return orig ? orig.apply(this, arguments) : undefined;
    };
    sc.__panelTick = true;
  }

  // --- DOM helpers (all positions in stage pixels) --------------------------------------------
  // A full-stage layer that lets clicks through where it has no children.
  function layer(name) {
    var r = ui.box(0, 0, SRPG.W, SRPG.H, 'panel-layer');
    r.setAttribute('data-panel-layer', name);
    return r;
  }

  // Text placed by its baseline (x = left edge, or centre with align 'center').
  function txt(parent, html, x, baseline, size, color, opts) {
    opts = opts || {};
    var e = ui.el('div', 'ptxt' + (opts.cls ? ' ' + opts.cls : ''), parent, html);
    e.style.left = x + 'px';
    e.style.top = baseline + 'px';
    e.style.fontSize = size + 'px';
    if (color) e.style.color = color;
    if (opts.font) e.style.fontFamily = opts.font;
    if (opts.align === 'center') e.classList.add('ptxt-c');
    if (opts.align === 'right') e.classList.add('ptxt-r');
    if (opts.clip != null) { e.style.setProperty('--clip', opts.clip + 'px'); e.classList.add('ptxt-clip'); }
    return e;
  }

  function rect(parent, cls, x, y, w, h) {
    var e = ui.el('div', cls, parent);
    e.style.left = x + 'px';
    e.style.top = y + 'px';
    e.style.width = w + 'px';
    e.style.height = h + 'px';
    return e;
  }

  // The blue panel (the original's shape 105 scaled sx, sy around cx, cy; 356 x 202 at 1:1).
  function bluePanel(parent, cx, cy, sx, sy, cls) {
    var w = 355.95 * sx, h = 201.9 * sy;
    var p = ui.panel(cx - 177.95 * sx, cy - 100.95 * sy, w, h, parent, cls);
    return p;
  }

  // The square "X" close button (23 x 23, top-left at x, y); the heavy X is drawn so it keeps its
  // Arial Black shape whatever fonts are installed.
  function closeButton(parent, x, y, id, onClick) {
    var b = rect(parent, 'pclose', x, y, 23, 23);
    ui.el('div', 'pclose-x', b);
    b.setAttribute('data-id', id || 'close');
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      if (onClick) onClick();
    });
    return b;
  }

  function hitButton(parent, x, y, w, h, id, onClick, cls) {
    var b = rect(parent, 'phit' + (cls ? ' ' + cls : ''), x, y, w, h);
    if (id) b.setAttribute('data-id', id);
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      if (b.classList.contains('inert')) return;
      if (onClick) onClick();
    });
    return b;
  }

  // A canvas at 3x density covering x, y, w, h.
  function artCanvas(parent, x, y, w, h, cls) {
    var c = document.createElement('canvas');
    c.className = cls || 'part';
    c.width = Math.ceil(w * 3);
    c.height = Math.ceil(h * 3);
    c.style.left = x + 'px';
    c.style.top = y + 'px';
    c.style.width = w + 'px';
    c.style.height = h + 'px';
    parent.appendChild(c);
    var cx = c.getContext('2d');
    cx.scale(3, 3);
    return { el: c, ctx: cx };
  }

  // --- INVENTORY ------------------------------------------------------------------------------
  // Sprite 724 sits at (283.6, 224). Each item has a fixed slot around the ring and shows only
  // when owned (frame 1's visibility checks); the car and the alarm clock are not listed, as in
  // the original. Hovering an item shows it at full strength and a note in the middle of the ring.
  // pic: registration point and picture box; hit: the button's hit area; tip: note box + lines
  // [text, x, baseline, size, colour]; count: [s.field, centre x, baseline].
  var ITEMS = [
    { id: 'smokes', has: function (s) { return s.items.smokes; }, ox: 364, oy: 149.8,
      box: [-21.5, -28.3, 43, 56.6], over: 1.1, hit: [339.3, 121.55, 43, 56.55],
      tip: [241.9, 169.8, 92.5, 101],
      lines: [['SMOKES', 251.6, 186.25, 14, '#333333'], ['(x', 251.6, 205.9, 14, '#333333'], [')', 283.55, 203.8, 14, '#333333'],
        ['+1 CHARM', 255.65, 239.25, 10, '#000099'], ['-10 HP', 255.6, 252.2, 10, '#990000']],
      count: [function (s) { return s.items.smokes; }, 275.1, 204.95] },
    { id: 'knife', has: function (s) { return s.items.knife; }, ox: 399.85, oy: 222.65,
      box: [-28.75, -24.25, 48.95, 47.5], over: 1.1, hit: [371.1, 198.4, 49.65, 47.5],
      tip: [242.3, 168.55, 92.5, 101],
      lines: [['KNIFE', 246.85, 184.95, 14, '#333333'], ['(AUTO)', 245.6, 198.65, 10, '#333333'],
        ['+2 DAMAGE IN', 249.1, 221.95, 10, '#000099'], ['CLOSE RANGE', 249.1, 236, 10, '#000099'], ['COMBAT', 249.1, 250.05, 10, '#000099']] },
    { id: 'gun', has: function (s) { return s.items.gun; }, ox: 364, oy: 302,
      box: [-16.8, -23.3, 58.55, 44.7], over: 1.1, hit: [347.2, 278.7, 58.55, 44.7],
      tip: [245, 171.4, 92.5, 60.6],
      lines: [['GUN', 248.55, 186.85, 14, '#333333'], ['AMMO(x', 248.55, 206.5, 14, '#333333'], [')', 331.05, 204.4, 14, '#333333'],
        ['(AUTO)', 248.3, 219.75, 10, '#333333']],
      count: [function (s) { return s.items.ammo; }, 322.6, 205.55] },
    { id: 'pills', has: function (s) { return s.items.pills; }, ox: 292.65, oy: 326.65,
      box: [-21, -23.55, 42.05, 47.1], over: 1.1, hit: [271.65, 303.1, 42.05, 47.1],
      tip: [241.85, 168.85, 92.5, 101],
      lines: [['CAFFIENE', 246, 185.3, 14, '#333333'], ['PILLS (x', 246, 204.95, 14, '#333333'], [')', 327.9, 202.85, 14, '#333333'],
        ['(AUTO)', 245.15, 218.2, 10, '#333333'], ['EXTRA TIME', 254.9, 238.3, 10, '#66ccff'], ['-20 HP', 255.55, 251.25, 10, '#990000']],
      count: [function (s) { return s.items.pills; }, 319.45, 204] },
    { id: 'cocaine', has: function (s) { return s.items.cocaine; }, ox: 219.1, oy: 303.1,
      box: [-16.55, -10.85, 33.05, 21.75], over: 1.1, hit: [201.95, 289.25, 34.65, 19.35],
      tip: [241.85, 174.95, 92.5, 101],
      lines: [['COCAINE', 249.3, 191.35, 14, '#333333'], ['(x', 249.3, 211, 14, '#333333'], [')', 286.3, 208.9, 14, '#333333'],
        ['(COMMODITY)', 249.7, 224.9, 10, '#333333']],
      count: [function (s) { return s.items.cocaine; }, 275.25, 210.05] },
    { id: 'skateboard', has: function (s) { return s.items.skateboard; }, ox: 301.35, oy: 122.15,
      box: [-59.45, -27.75, 87.9, 42.8], over: 1.1, hit: [236, 90.95, 96.65, 47.75],
      tip: [239.75, 184.45, 103.2, 70.7],
      lines: [['SKATE', 245.95, 200.15, 14, '#333333'], ['BOARD', 245.95, 219.8, 14, '#333333'],
        ['(HOLD SHIFT', 244.65, 233.05, 10, '#333333'], ['WHEN WALKING)', 244.65, 247.1, 10, '#333333']] },
    { id: 'beer', has: function (s) { return s.booze; }, ox: 182.35, oy: 221.85,
      box: [-15.8, -22.6, 31.4, 45.2], over: 1.246, overDx: 1, hit: [155.05, 194.5, 54, 54],
      tip: [243.8, 173.35, 92.5, 101],
      lines: [['BEER', 251.05, 189.75, 14, '#333333'], ['(x', 251.05, 209.4, 14, '#333333'], [')', 288.25, 207.3, 14, '#333333'],
        ['(COMMODITY)', 251.65, 223.3, 10, '#333333']],
      count: [function (s) { return s.booze; }, 278.2, 208.45] },
    { id: 'cellphone', has: function (s) { return s.items.cellPhone; }, ox: 207.55, oy: 153.9,
      box: [-27.65, -18.9, 55.35, 37.75], over: 1.212, hit: [170.55, 130.9, 68.95, 46.9],
      tip: [241.25, 173.2, 92.5, 101],
      lines: [['CELL', 245.45, 189.65, 14, '#333333'], ['(AUTO)', 244.55, 203.35, 10, '#333333'],
        ['ESTABLISH', 248.05, 226.65, 10, '#000099'], ['CONTACTS IN', 248.05, 240.7, 10, '#000099'], ['OTHER CITIES', 248.05, 254.75, 10, '#000099']] },
  ];

  // Frames 5-60 of sprite 724: the stick figure takes a drag and blows smoke; +1 charm lands on
  // frame 15. The smoke puff tweens (scale x/y, x, y, alpha) from frame 37 to 60.
  var PUFF = [[37, 0.5, 0.082, 24.5, -12.6, 1], [38, 0.667, 0.277, 19.65, -15.15, 0.945], [39, 0.829, 0.465, 14.95, -17.6, 0.895],
    [40, 0.985, 0.648, 10.4, -20, 0.844], [41, 1.136, 0.824, 6.05, -22.3, 0.797], [42, 1.282, 0.994, 1.8, -24.55, 0.75],
    [43, 1.422, 1.158, -2.3, -26.75, 0.703], [44, 1.557, 1.316, -6.2, -28.75, 0.66], [45, 1.687, 1.468, -9.95, -30.8, 0.621],
    [46, 1.812, 1.613, -13.6, -32.7, 0.578], [47, 1.931, 1.752, -17.05, -34.5, 0.543], [48, 2.045, 1.885, -20.35, -36.25, 0.504],
    [49, 2.154, 2.012, -23.5, -37.85, 0.469], [50, 2.257, 2.133, -26.5, -39.5, 0.438], [51, 2.355, 2.247, -29.4, -41, 0.406],
    [52, 2.448, 2.356, -32.05, -42.4, 0.375], [53, 2.536, 2.458, -34.6, -43.75, 0.348], [54, 2.618, 2.554, -37, -44.95, 0.32],
    [55, 2.695, 2.644, -39.25, -46.15, 0.297], [56, 2.766, 2.727, -41.3, -47.25, 0.273], [57, 2.833, 2.805, -43.25, -48.3, 0.254],
    [58, 2.894, 2.876, -45, -49.25, 0.234], [59, 2.95, 2.941, -46.65, -50.1, 0.215], [60, 3, 3, -48.1, -50.8, 0.199]];

  // Draw the smoking stick figure for animation frame f (5..60) in stage coordinates.
  function drawSmoker(ctx, f) {
    var D = SRPG.draw;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    // legs (knees up), torso, the arm propped behind
    ctx.beginPath();
    ctx.moveTo(304.3, 255); ctx.lineTo(278.3, 232.3); ctx.lineTo(266.7, 254.3); ctx.lineTo(273.3, 254.3);
    ctx.moveTo(304.3, 255); ctx.lineTo(268.3, 239.3); ctx.lineTo(255, 256.7); ctx.lineTo(248.3, 256.7);
    ctx.moveTo(304.3, 255); ctx.lineTo(317, 224.5);
    ctx.moveTo(314.3, 231); ctx.lineTo(325, 255); ctx.lineTo(330, 255);
    ctx.stroke();
    // the smoking arm: cigarette at the lips until frame 37, then lowered over frames 37-43
    var k = f < 37 ? 0 : Math.min(1, (f - 37) / 6);
    var hx = 311 + (296.7 - 311) * k, hy = 216 + (222 - 216) * k;
    ctx.beginPath();
    ctx.moveTo(313.5, 232); ctx.lineTo(hx + 1.5, hy + 3);
    ctx.stroke();
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(-0.85 * k);
    // cigarette: white paper, glowing tip (flickers while inhaling)
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 0.5;
    ctx.fillRect(-10, -1.3, 10, 2.6);
    ctx.strokeRect(-10, -1.3, 10, 2.6);
    var glow = f < 37 ? (Math.floor(f / 3) % 2 ? '#ff2a00' : '#cc0000') : '#aa2200';
    ctx.fillStyle = glow;
    ctx.fillRect(-12.5, -1.3, 3, 2.6);
    ctx.fillStyle = '#e8b25a';
    ctx.fillRect(-1.6, -1.3, 1.6, 2.6);
    ctx.restore();
    // head (the player's blue), mouth dot once the cigarette is out
    D.circle(ctx, 326, 209.3, 16, '#0066cc', '#000', 1);
    if (k > 0.5) D.circle(ctx, 312.3, 212.3, 1.4, '#000');
    // the puff of smoke
    if (f >= 37) {
      var fr = PUFF[Math.min(PUFF.length - 1, f - 37)];
      ctx.save();
      ctx.globalAlpha = fr[5] * 0.75;
      ctx.translate(283.6 + fr[3], 224 + fr[4]);
      ctx.scale(fr[1], fr[2]);
      ctx.fillStyle = '#c0c0c0';
      ctx.beginPath();
      ctx.moveTo(-17, -4);
      ctx.bezierCurveTo(-19, -14, -6, -16, 1, -13);
      ctx.bezierCurveTo(10, -15, 19, -8, 16, 2);
      ctx.bezierCurveTo(19, 10, 10, 15, 3, 12);
      ctx.bezierCurveTo(-4, 16, -18, 11, -17, -4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  function goHome(s) {
    // Button 763: dwellings 1-3 -> the apartment (frame 65), 4-5 -> the mansion/castle (frame 78).
    if (s.dwelling === 4 || s.dwelling === 5) {
      s.mapx = 447;
      s.mapy = 900;
      SRPG.location.open('mansion');
    } else if (s.dwelling === 1 || s.dwelling === 2 || s.dwelling === 3) {
      s.mapx = 1054;
      s.mapy = 748;
      SRPG.location.open('home');
    }
  }

  function inventory(onClose) {
    var s = SRPG.game.s;
    hookTick();
    var root = layer('inventory');
    var panel = bluePanel(root, 283.6, 224, 1.2, 1.5, 'inv-panel');
    panel.setAttribute('data-panel', 'inventory');
    var anim = 0; // 0 = frame 1 (the list); 5..60 = the smoking animation frame
    var closed = false;
    var content = null;
    var api;

    // the ring (shape 725) shows through the panel as a darker disc
    var ring = ui.el('div', 'inv-ring', root);
    ring.style.cssText = 'left:' + (290.2 - 142.7) + 'px;top:' + (222.6 - 142.7) + 'px;width:285.4px;height:285.4px';
    txt(root, 'INVENTORY', 81.3, 96.75, 16, '#0000cc', { cls: 'ptitle' });

    function finish(fromButton) {
      if (closed) return;
      closed = true;
      if (active === api) active = null;
      if (root.parentNode) root.parentNode.removeChild(root);
      if (fromButton && onClose) onClose();
    }
    // X (button 737 on the list, 792 during the animation): back to the map.
    closeButton(root, 460.5, 83.25, 'close', function () { finish(true); });

    function buildList() {
      if (content && content.parentNode) content.parentNode.removeChild(content);
      content = ui.el('div', 'inv-content', root);
      ITEMS.forEach(function (it) {
        if (!it.has(s)) return; // frame 1: _visible = 0 when the count is 0
        var el = ui.el('div', 'inv-item', content);
        el.setAttribute('data-id', 'inv-' + it.id);
        el.style.left = it.hit[0] + 'px';
        el.style.top = it.hit[1] + 'px';
        el.style.width = it.hit[2] + 'px';
        el.style.height = it.hit[3] + 'px';
        // the picture, drawn around its registration point
        var pad = 6;
        var bx = it.ox + it.box[0] - pad, by = it.oy + it.box[1] - pad;
        var pw = it.box[2] + pad * 2, ph = it.box[3] + pad * 2;
        var pic = artCanvas(content, bx, by, pw, ph, 'inv-pic');
        pic.el.setAttribute('data-item', it.id);
        pic.el.style.transformOrigin = (it.ox - bx) + 'px ' + (it.oy - by) + 'px';
        pic.el.style.setProperty('--over', it.over);
        pic.el.style.setProperty('--dx', (it.overDx || 0) + 'px');
        if (SRPG.icons && SRPG.icons.item) {
          pic.ctx.translate(it.ox - bx, it.oy - by);
          try { SRPG.icons.item(pic.ctx, it.id, it.box); } catch (e) { /* missing art */ }
        }
        // the note shown on hover
        var tip = ui.el('div', 'inv-tip', content);
        var box = rect(tip, 'inv-tipbox', it.tip[0], it.tip[1], it.tip[2], it.tip[3]);
        box.style.borderRadius = (it.tip[2] * 0.0309).toFixed(1) + 'px / ' + (it.tip[3] * 0.0792).toFixed(1) + 'px';
        it.lines.forEach(function (l) { txt(tip, esc(l[0]), l[1], l[2], l[3], l[4]); });
        if (it.count) txt(tip, esc(num(it.count[0](s))), it.count[1], it.count[2], 14, '#333333', { align: 'center' });
        el.addEventListener('mouseenter', function () { el.classList.add('over'); pic.el.classList.add('over'); tip.classList.add('show'); });
        el.addEventListener('mouseleave', function () { el.classList.remove('over'); pic.el.classList.remove('over'); tip.classList.remove('show'); });
        el.addEventListener('click', function (e) {
          e.stopPropagation();
          if (it.id === 'smokes') smoke();
        });
      });
      // Go home (button 763, the house)
      var home = hitButton(content, 436.5, 314.5, 34.3, 34.8, 'gohome', function () {
        if (closed) return;
        finish(false);
        goHome(s);
      }, 'inv-home');
      // the house art fills its 34 x 35 button (shape 764 at 56%)
      var hc = artCanvas(home, -1.6, -3.2, 37.5, 37.5, 'inv-homeart');
      if (SRPG.icons) {
        try { SRPG.icons.draw(hc.ctx, 'house', 37.5); } catch (e) {}
      }
    }

    // Button 727: light up if hp > 10 and time < 24: -10 HP, one pack, +1 hour, -1 karma (not
    // clamped here), then the animation (charm +1 on its frame 15). Nothing happens otherwise.
    function smoke() {
      if (closed || anim) return; // already lit (a second click on the vanished slot)
      if (!(s.hp > 10 && s.time < 24)) return;
      s.hp -= 10;
      s.items.smokes -= 1;
      s.time += 1;
      s.karma -= 1;
      anim = 5;
      buildAnim();
    }

    var animCanvas = null, charmEl = null;
    function buildAnim() {
      if (content && content.parentNode) content.parentNode.removeChild(content);
      content = ui.el('div', 'inv-content inv-anim', root);
      content.setAttribute('data-id', 'smoking');
      txt(content, 'CHARM INCREASED!!!', 196.8, 151.1, 16, '#ffffff', { cls: 'pverdana' });
      charmEl = txt(content, esc(num(s.charm)), 291.5, 182.9, 17.6, '#ffff00', { cls: 'pverdana pnum', align: 'center' });
      animCanvas = artCanvas(content, 150, 120, 250, 150, 'inv-smoker');
      drawAnim();
    }
    function drawAnim() {
      var c = animCanvas.ctx;
      c.clearRect(-1, -1, 252, 152);
      c.save();
      c.translate(-150, -120);
      drawSmoker(c, anim);
      c.restore();
    }

    var lastFrame = -1;
    function tick() {
      // the scene was switched under us (ui.clear): stop, like the original leaving frame 5
      if (!closed && !root.parentNode) { closed = true; if (active === api) active = null; }
      if (closed || !anim) return;
      // one animation frame per game tick, however many callers drive it (the wrapped city tick
      // and, once city.js calls panel.tick() itself, that too)
      var fr = SRPG.engine ? SRPG.engine.frame : lastFrame + 1;
      if (fr === lastFrame) return;
      lastFrame = fr;
      anim++;
      if (anim === 15) {
        // sprite 724 frame 15: charm = min(charm + 1, 999); the number is shown bigger from here
        s.charm = Math.min(s.charm + 1, 999);
        charmEl.innerHTML = esc(num(s.charm));
        charmEl.style.fontSize = '20.8px';
        charmEl.style.top = '184.2px';
      }
      if (anim >= 60) { // frame 60: gotoFrame(0) -> back to the list, visibility re-checked
        anim = 0;
        buildList();
        return;
      }
      drawAnim();
    }

    buildList();
    api = {
      panel: panel,
      root: root,
      close: function () { finish(false); },
      tick: tick,
      get animFrame() { return anim; },
    };
    active = api;
    return api;
  }

  // --- STATS ------------------------------------------------------------------------------------
  // Sprite 816 at (355.2, 208.75). Frame 1: the stats and the MUSIC / OPTIMIZE / SHOW FPS
  // switches (the option in force is drawn pale and can't be clicked); frame 2: QUIT's
  // "ARE YOU SURE YOU WANT TO QUIT?" with YES (the results screen) and NO (back to frame 1).
  var ON_COLOR = '#0033cc', PALE_ON = '#a4bff6', PALE_OFF = '#a6c3fc';

  function stats(onClose) {
    var s = SRPG.game.s;
    hookTick();
    var root = layer('stats');
    var panel = bluePanel(root, 355.2, 208.75, 0.8, 1.5, 'stats-panel');
    panel.setAttribute('data-panel', 'stats');
    var closed = false;
    var content = null;
    var api;

    // Root frame 6: the FPS counter follows the saved setting when STATS opens.
    if (SRPG.hud) SRPG.hud.fpsVisible = s.fps == 1; // eslint-disable-line eqeqeq

    function finish(fromButton) {
      if (closed) return;
      closed = true;
      if (active === api) active = null;
      if (root.parentNode) root.parentNode.removeChild(root);
      if (fromButton && onClose) onClose();
    }

    function values() {
      // statusbox frame 1 script: karma clamped to +-100, net worth, game length, job title
      if (s.karma >= 100) s.karma = 100;
      if (s.karma <= -100) s.karma = -100;
      var title = SRPG.game.JOB_TITLES[s.job];
      return {
        networth: s.cash + s.bankcash - s.bankloan,
        gamelen: s.gamelength === 0 ? 'Unlimited' : s.gamelength + ' Days',
        jobtitle: title ? "'" + title + "'" : '',
      };
    }

    function common(v, confirm) {
      txt(content, 'STATS', 226.3, 85.5, 16, '#0000cc', { cls: 'ptitle' });
      txt(content, esc(s.pname), 372.8, 84.7, 16, '#000066', { align: 'center', cls: 'pname' });
      txt(content, 'JOB TITLE:', 248.85, 126.85, 12, '#000099');
      txt(content, esc(v.jobtitle), 334.1, 126.41, 12, '#000099', { clip: confirm ? 62.7 : 149.75, cls: 'pjob' });
      txt(content, 'CHARM:', 251.35, 156.65, 12, '#000099');
      txt(content, esc(num(s.charm)), 309.65, 156.71, 12, '#0000cc', { cls: 'pcharm' });
      txt(content, 'INTELLIGENCE:', 251.3, 177.15, 12, '#000099');
      txt(content, esc(num(s.intelligence)), 359.05, 177.21, 12, '#0000cc', { cls: 'pint' });
      txt(content, 'STRENGTH:', 251.15, 197.95, 12, '#000099');
      txt(content, esc(num(s.strength)), 333.8, 198.21, 12, '#0000cc', { cls: 'pstr' });
      txt(content, 'KARMA:', 251.1, 219.95, 12, '#000099');
      txt(content, esc(num(s.karma)), 307.8, 220.21, 12, '#0000cc', { cls: 'pkarma' });
      txt(content, 'NET WORTH :', 251, 246.8, 12, '#000099');
      txt(content, '$', 359.95, 246.8, 14, '#ffcc00');
      txt(content, esc(num(v.networth)), 372.65, 246.95, 14, '#ffcc00', { cls: 'pworth' });
      txt(content, '(CASH + BANK - LOANS)', 250.6, 259.65, 8, '#000099');
      txt(content, 'GAME LENGTH:', 250.3, 286.5, 12, '#000099');
      txt(content, esc(v.gamelen), 360.3, 286.06, 12, '#0000cc', { clip: confirm ? 67.3 : 93.65, cls: 'plen' });
    }

    // One ON / OFF switch. on: the "ON" clip (x, baseline, hit box); off likewise.
    function toggle(name, label, lx, lb, onDef, offDef, get, set) {
      txt(content, label, lx, lb, 14, ON_COLOR);
      function opt(def, isOn) {
        var inForce = get() === (isOn ? 1 : 0);
        var b = hitButton(content, def.hit[0], def.hit[1], def.hit[2], def.hit[3], (isOn ? 'on-' : 'off-') + name, function () {
          if (get() === (isOn ? 1 : 0)) return; // the pale option is a plain picture, not a button
          set(isOn ? 1 : 0);
          render(false);
        }, 'ptoggle' + (inForce ? ' inert' : ''));
        txt(b, isOn ? 'ON' : 'OFF', def.x - def.hit[0], def.b - def.hit[1], 14, inForce ? (isOn ? PALE_ON : PALE_OFF) : ON_COLOR);
      }
      opt(onDef, true);
      opt(offDef, false);
    }

    function render(confirm) {
      if (content && content.parentNode) content.parentNode.removeChild(content);
      content = ui.el('div', 'stats-content', root);
      var v = values();
      common(v, confirm);
      if (!confirm) {
        closeButton(content, 460.1, 68, 'close', function () { finish(true); });
        toggle('music', 'MUSIC:', 248.55, 315.1,
          { x: 317.2, b: 315.1, hit: [315.6, 303.3, 25.4, 13.4] }, { x: 346.4, b: 315.1, hit: [345.6, 303.9, 31.2, 12.4] },
          function () { return s.music ? 1 : 0; },
          function (x) { s.music = x; SRPG.sound.setMusic(!!x); });
        toggle('optimize', 'OPTIMIZE:', 248.05, 332.75,
          { x: 343.25, b: 333.05, hit: [341.7, 321.5, 25.4, 13.4] }, { x: 372.65, b: 333.05, hit: [371.7, 322.1, 31.2, 12.4] },
          function () { return s.optimize ? 1 : 0; },
          function (x) { s.optimize = x; });
        toggle('fps', 'SHOW FPS:', 247.95, 350.75,
          { x: 348, b: 350.9, hit: [346.5, 339.4, 25.4, 13.4] }, { x: 377.45, b: 350.9, hit: [376.5, 340, 31.2, 12.4] },
          function () { return s.fps ? 1 : 0; },
          function (x) { s.fps = x; if (SRPG.hud) SRPG.hud.fpsVisible = x === 1; });
        // QUIT (button 840): statusbox frame 2
        var q = hitButton(content, 440.6, 340, 39.3, 12.8, 'quit', function () { render(true); }, 'pquit');
        txt(q, 'QUIT', 440.95 - 440.6, 351.2 - 340, 14, ON_COLOR);
      } else {
        // frame 2 keeps a (dead) X and QUIT; MUSIC and OPTIMIZE are plain text here
        var x = closeButton(content, 460.1, 68, 'close-inert', null);
        x.classList.add('inert');
        txt(content, 'MUSIC:', 248.5, 323.25, 14, ON_COLOR);
        txt(content, 'ON', 317.1, 323.1, 14, ON_COLOR);
        txt(content, 'OFF', 346.3, 323.1, 14, ON_COLOR);
        txt(content, 'OPTIMIZE:', 248, 340.9, 14, ON_COLOR);
        txt(content, 'ON', 343.55, 341.15, 14, ON_COLOR);
        txt(content, 'OFF', 372.75, 341.15, 14, ON_COLOR);
        var q2 = hitButton(content, 440.9, 329.8, 39.3, 12.8, 'quit-inert', null, 'pquit inert');
        txt(q2, 'QUIT', 441.25 - 440.9, 341 - 329.8, 14, ON_COLOR);
        // the confirmation box: a second, smaller panel on top
        var box = bluePanel(content, 356.4, 294.15, 0.7, 0.5, 'quit-panel');
        box.setAttribute('data-panel', 'quit');
        txt(content, 'ARE YOU SURE YOU', 273.5, 272.1, 15, '#000099', { cls: 'pquitq' });
        txt(content, 'WANT TO QUIT?', 273.5, 293.16, 15, '#000099', { cls: 'pquitq' });
        var yes = hitButton(content, 296.2, 315.8, 39.1, 16.6, 'yes', function () {
          // button 865: _root.gotoAndPlay(130) -> the end-of-game results
          if (closed) return;
          finish(false);
          if (SRPG.city && SRPG.city.st) SRPG.city.st.panel = null;
          SRPG.game.endGame();
        }, 'pyes');
        txt(yes, 'YES', 298.87 - 296.2, 329.19 - 315.8, 15, ON_COLOR);
        var no = hitButton(content, 378.2, 315.8, 31, 15.9, 'no', function () { render(false); }, 'pno');
        txt(no, 'NO', 382.44 - 378.2, 329.29 - 315.8, 15, ON_COLOR);
      }
    }

    render(false);
    api = {
      panel: panel,
      root: root,
      close: function () { finish(false); },
      tick: function () {},
      get confirming() { return !!(content && content.querySelector('[data-panel="quit"]')); },
    };
    active = api;
    return api;
  }

  SRPG.panels = {
    inventory: inventory,
    stats: stats,
    ITEMS: ITEMS,
    drawSmoker: drawSmoker,
    get active() { return active; },
  };
})();
