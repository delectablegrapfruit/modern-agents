// Title screen ('title'): the rising-bubble backdrop, the big STICK RPG COMPLETE logo, START /
// CONTINUE / INSTRUCTIONS, the seven instruction pages, NEW GAME (game length), CREATE CHARACTER
// and loading the saved game. Everything is drawn on the canvas at the original's positions
// (root frame 1: sprites 62, 104, 143, 149, 180); invisible DOM hotspots take the clicks.
// Also defines SRPG.titleFx, the shared look (fonts, gradient, panels, outlined Impact buttons)
// used by intro.js and results.js.
(function () {
  'use strict';
  var SRPG = window.SRPG;
  var ui = SRPG.ui;
  var rnd = SRPG.rng.random;

  // ------------------------------------------------------------------------------------------
  // Shared look
  // ------------------------------------------------------------------------------------------
  var fx = (SRPG.titleFx = {});

  // The original's type is Impact (buttons, story pages) and Arial Black (panels, results). When
  // a face is missing we draw a bold sans and stretch it to the original's measured ink widths
  // and cap heights, so the layout holds on every machine.
  var FALLBACK = '"Liberation Sans", Arial, Helvetica, sans-serif';
  var FACES = {
    impact: { family: 'Impact, Haettenschweiler, "Arial Narrow Bold"', weight: '', cap: 0.79,
      ref: 'INSTRUCTIONS', refSize: 24, refInk: 139.2 },
    black: { family: '"Arial Black", "Arial Bold"', weight: '900 ', cap: 0.716,
      ref: 'CREATE CHARACTER', refSize: 24, refInk: 280.5 },
    courier: { family: '"Courier New", "Liberation Mono", Courier', weight: 'bold ', cap: 0.571,
      ref: null },
  };
  var measureCtx = null;

  function mctx() {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
    return measureCtx;
  }

  function hasFont(name) {
    var c = mctx();
    var probe = 'mmmmmmmmmmlliWWQ@#';
    var found = false;
    ['monospace', 'serif'].forEach(function (base) {
      c.font = '72px ' + base;
      var w0 = c.measureText(probe).width;
      c.font = '72px "' + name + '", ' + base;
      if (c.measureText(probe).width !== w0) found = true;
    });
    return found;
  }

  function calibrate(key) {
    var f = FACES[key];
    if (f.sx != null) return f;
    var c = mctx();
    var real = hasFont(key === 'impact' ? 'Impact' : key === 'black' ? 'Arial Black' : 'Courier New');
    f.css = function (size) { return f.weight + size + 'px ' + f.family + ', ' + FALLBACK; };
    f.sx = 1;
    f.sy = 1;
    f.heavy = 0;
    if (!real && key !== 'courier') {
      // Fallback face: stretch to the original's ink width and cap height, and thicken the
      // strokes a little (Impact and Arial Black are much heavier than a plain bold).
      f.heavy = key === 'black' ? 0.075 : 0.045;
      f.css = function (size) { return 'bold ' + size + 'px ' + FALLBACK; };
      c.font = f.css(f.refSize);
      var m = c.measureText(f.ref);
      var ink = (m.actualBoundingBoxRight || m.width) + (m.actualBoundingBoxLeft || 0);
      if (ink > 0) f.sx = f.refInk / ink;
      c.font = f.css(100);
      var h = c.measureText('H').actualBoundingBoxAscent;
      if (h > 0) f.sy = (f.cap * 100) / h;
    }
    return f;
  }

  fx.face = calibrate;

  // Width of str as fx.text would draw it.
  fx.measure = function (str, face, size) {
    var f = calibrate(face || 'black');
    var c = mctx();
    c.font = f.css(size);
    return c.measureText(str).width * f.sx;
  };

  // Draw one line. (x, y) = left end of the baseline unless o.align is 'center' / 'right'.
  // o: { face: 'impact' | 'black' | 'courier', size, color, align, width (force this width),
  //      alpha, outline (colour of a 4-way 1.5px outline) }
  fx.text = function (ctx, str, x, y, o) {
    var f = calibrate(o.face || 'black');
    str = String(str);
    ctx.save();
    ctx.font = f.css(o.size);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    var m = ctx.measureText(str);
    var w = m.width;
    var sx = f.sx;
    var left = x;
    if (o.width) {
      // Fit the ink (not the advance) to the given width; x is where the ink starts.
      var abl = m.actualBoundingBoxLeft || 0;
      var ink = (m.actualBoundingBoxRight || w) + abl;
      sx = o.width / Math.max(1, ink);
      left = x + abl * sx;
    }
    var dw = w * sx;
    if (o.align === 'center') left = x - dw / 2;
    else if (o.align === 'right') left = x - dw;
    if (o.alpha != null) ctx.globalAlpha *= o.alpha;
    if (o.outline) {
      ctx.fillStyle = o.outline;
      ctx.strokeStyle = o.outline;
      ctx.lineJoin = 'round';
      [[0, 1.6], [0, -1.6], [-1.5, 0], [1.5, 0]].forEach(function (d) {
        ctx.save();
        ctx.translate(left + d[0], y + d[1]);
        ctx.scale(sx, f.sy);
        if (f.heavy) {
          ctx.lineWidth = o.size * f.heavy;
          ctx.strokeText(str, 0, 0);
        }
        ctx.fillText(str, 0, 0);
        ctx.restore();
      });
    }
    ctx.translate(left, y);
    ctx.scale(sx, f.sy);
    ctx.fillStyle = o.color || '#000';
    if (f.heavy) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = o.size * f.heavy;
      ctx.strokeStyle = ctx.fillStyle;
      ctx.strokeText(str, 0, 0);
    }
    ctx.fillText(str, 0, 0);
    ctx.restore();
    return dw;
  };

  // Word-wrap str into lines no wider than maxW (as drawn by fx.text).
  fx.wrapLines = function (str, face, size, maxW) {
    var words = String(str).split(' ');
    var lines = [];
    var line = '';
    words.forEach(function (wd) {
      var t = line ? line + ' ' + wd : wd;
      if (line && fx.measure(t, face, size) > maxW) {
        lines.push(line);
        line = wd;
      } else line = t;
    });
    if (line) lines.push(line);
    return lines;
  };

  // The blue diagonal gradient behind the title, the death screen and the results
  // (#0099ff top-left to #0066cc bottom-right).
  fx.bg = function (ctx) {
    var g = ctx.createLinearGradient(71.7, -82.2, 482.7, 491.9);
    g.addColorStop(0, '#0099ff');
    g.addColorStop(1, '#0066cc');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SRPG.W, SRPG.H);
  };

  // The rounded translucent panel (356 x 201 at scale 1) centred on (cx, cy), scaled sx, sy;
  // bright = the 1.2x colour multiplier used on NEW GAME / CREATE CHARACTER.
  fx.panel = function (ctx, cx, cy, sx, sy, bright) {
    var X = function (v) { return cx + v * sx; };
    var Y = function (v) { return cy + v * sy; };
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(X(174.5), Y(-95.9));
    ctx.quadraticCurveTo(X(171.6), Y(-100.5), X(167.4), Y(-100.5));
    ctx.lineTo(X(-167.4), Y(-100.5));
    ctx.quadraticCurveTo(X(-171.6), Y(-100.5), X(-174.6), Y(-95.9));
    ctx.quadraticCurveTo(X(-177.5), Y(-91.3), X(-177.4), Y(-84.7));
    ctx.lineTo(X(-177.4), Y(84.7));
    ctx.quadraticCurveTo(X(-177.5), Y(91.2), X(-174.6), Y(95.8));
    ctx.quadraticCurveTo(X(-171.6), Y(100.4), X(-167.4), Y(100.5));
    ctx.lineTo(X(167.4), Y(100.5));
    ctx.quadraticCurveTo(X(171.6), Y(100.4), X(174.5), Y(95.8));
    ctx.quadraticCurveTo(X(177.4), Y(91.2), X(177.5), Y(84.7));
    ctx.lineTo(X(177.5), Y(-84.7));
    ctx.quadraticCurveTo(X(177.4), Y(-91.3), X(174.5), Y(-95.9));
    ctx.closePath();
    ctx.globalAlpha = 0.75;
    // NEW GAME and CREATE CHARACTER tint theirs 120% brighter than the instructions panel.
    ctx.fillStyle = bright ? '#569eff' : '#4884ff';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = bright ? '#003db8' : '#003399';
    ctx.stroke();
    ctx.restore();
  };

  // A glassy bubble (radius 13 at 100%) with its highlight up and to the left.
  fx.bubble = function (ctx, x, y, scale, alpha) {
    var r = 13 * scale;
    if (r <= 0.2) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    var g = ctx.createRadialGradient(x - 3.35 * scale, y - 3.8 * scale, 0, x - 3.35 * scale, y - 3.8 * scale, 18.1 * scale);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(71 / 255, '#66ccff');
    g.addColorStop(105 / 255, '#6bccff');
    g.addColorStop(219 / 255, '#0099cc');
    g.addColorStop(1, '#66ccff');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  // The outlined Impact 24px button (START, CONTINUE, INSTRUCTIONS, DONE, NEXT): white outline,
  // #0066cc face, #0099ff while the mouse is over it; pressed, it shifts down-right by `push`.
  // (x, y) = the face text's top-left (Impact baseline = top + size).
  fx.impactButton = function (ctx, label, x, y, state, push, size) {
    size = size || 24;
    var d = state && state.down ? (push || 2) : 0;
    var col = state && (state.over || state.down) ? '#0099ff' : '#0066cc';
    fx.text(ctx, label, x + d, y + d + size, { face: 'impact', size: size, color: col, outline: '#ffffff' });
  };

  // Invisible DOM hotspot over canvas-drawn art. Tracks hover / press in the returned state.
  fx.hotspot = function (id, x, y, w, h, onClick, parent) {
    var st = { over: false, down: false, el: null };
    var e = ui.el('div', 'box', parent || null);
    e.style.left = x + 'px';
    e.style.top = y + 'px';
    e.style.width = w + 'px';
    e.style.height = h + 'px';
    e.style.cursor = 'pointer';
    e.setAttribute('data-id', id);
    e.addEventListener('mouseenter', function () { st.over = true; });
    e.addEventListener('mouseleave', function () { st.over = false; st.down = false; });
    e.addEventListener('mousedown', function (ev) { ev.stopPropagation(); st.down = true; SRPG.sound.unlock(); });
    e.addEventListener('mouseup', function () { st.down = false; });
    e.addEventListener('click', function (ev) {
      ev.stopPropagation();
      st.down = false;
      if (onClick) onClick(ev);
    });
    st.el = e;
    return st;
  };

  // ------------------------------------------------------------------------------------------
  // Title screen state
  // ------------------------------------------------------------------------------------------
  // Positions are stage coordinates of the original (the title clip sits at 284, 198.05).
  var OX = 284, OY = 198.05;
  var GAME_LENGTHS = [
    { id: 'gl-15', len: 15, big: 'SHORT', small: '(15 DAYS)', x: 207.7, y: 168.85, hit: [207.9, 156.6, 133, 16] },
    { id: 'gl-40', len: 40, big: 'MEDIUM', small: '(40 DAYS)', x: 208.1, y: 194.45, hit: [207.3, 181.3, 145, 16] },
    { id: 'gl-100', len: 100, big: 'LONG', small: '(100 DAYS)', x: 208.5, y: 219.95, hit: [207.8, 207.4, 130, 16] },
    { id: 'gl-0', len: 0, big: 'UNLIMITED', small: '', x: 208.7, y: 259.85, hit: [207.2, 246.2, 102, 15.2] },
  ];
  // CHARM / STRENGTH / INTELLIGENCE rows of CREATE CHARACTER: label x, baseline, arrow centre y.
  var STAT_ROWS = [
    { key: 'cha', label: 'CHARM:', lx: 135.8, ly: 208.35, ay: 204.6, vy: 209.7 },
    { key: 'str', label: 'STRENGTH:', lx: 135.2, ly: 232.35, ay: 228, vy: 233.3 },
    { key: 'intl', label: 'INTELLIGENCE:', lx: 136, ly: 256.35, ay: 251.5, vy: 257.3 },
  ];

  var st = {
    mode: 'title', // 'title' | 'newgame' | 'makechar' | 'instructions'
    page: 1, // instructions page 1..7
    bubbles: [],
    gamelength: 0,
    textname: 'Anonymous',
    pts: 0, str: 0, intl: 0, cha: 0,
    hot: {},
    input: null,
    frame: 0,
  };

  // Sprite 104, frame 1 (and ROLL AGAIN): extra points 3..9, each stat 1..10.
  function roll() {
    st.pts = rnd(7) + 3;
    st.str = rnd(10) + 1;
    st.intl = rnd(10) + 1;
    st.cha = rnd(10) + 1;
  }

  // Sprite 62: eight bubbles, size 25..99% (later 15..99%), rising size/50 px a frame, alpha
  // size/1.2 %; when one passes the top it restarts at the bottom at a random x.
  var BUBBLE_START = [[-173.5, 122.9], [58.5, -1.8], [-241.4, 0.6], [174.6, -72.5], [-40, -185.8],
    [225.3, 196.2], [-178.3, -137.8], [-44.6, 177.6]];
  function resetBubbles() {
    st.bubbles = BUBBLE_START.map(function (p) {
      var s = rnd(75) + 25;
      return { x: p[0], y: p[1], s: s };
    });
  }
  function tickBubbles() {
    st.bubbles.forEach(function (b) {
      b.y -= b.s / 50;
      if (b.y < -225) {
        b.y = 215;
        b.x = rnd(535) - 285;
        b.s = rnd(85) + 15;
      }
    });
  }
  function drawBubbles(ctx) {
    st.bubbles.forEach(function (b) {
      fx.bubble(ctx, OX + b.x, OY + b.y, b.s / 100, b.s / 1.2 / 100);
    });
  }

  // ------------------------------------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------------------------------------
  function setMode(m) {
    st.mode = m;
    build();
  }

  // CONTINUE: the original's loadGame(). No save -> error sound and nothing else.
  function loadGame() {
    var s = SRPG.save.read();
    if (!s) {
      SRPG.sound.play('error');
      return false;
    }
    s.fps = 1; // the original's loadGame() switches SHOW FPS on
    SRPG.sound.setVolume(100); // loopB.setVolume(100): full volume again
    SRPG.game.start(s);
    SRPG.engine.go('city', { fade: 19 }); // black.gotoAndPlay(11): a 19-frame fade in
    return true;
  }

  // DONE on CREATE CHARACTER (button 109): needs a name; leftover extra points are lost.
  function finishCharacter() {
    var name = st.input ? st.input.value : st.textname;
    st.textname = name;
    if (name == null || name === '') return false;
    var opts = { pname: name, gamelength: st.gamelength, strength: st.str, intelligence: st.intl, charm: st.cha };
    var s = SRPG.newState(opts);
    if (name === 'HEYZEUS!!!!') {
      // The original's cheat name.
      s.intelligence = 555;
      s.strength = 555;
      s.charm = 555;
      s.cash = 10000;
      s.pname = 'CHEATER!!!';
    }
    s.hpmax = s.strength + 15;
    s.hp = s.hpmax;
    SRPG.game.start(s);
    SRPG.engine.go('intro');
    return true;
  }

  function nextPage() {
    if (st.page >= 7) {
      // Button 177: back to the title, instructions rewound to page 1.
      st.page = 1;
      setMode('title');
    } else {
      st.page += 1;
      build();
    }
  }

  // ------------------------------------------------------------------------------------------
  // DOM hotspots per mode
  // ------------------------------------------------------------------------------------------
  function build() {
    ui.clear();
    st.hot = {};
    st.input = null;
    var H = function (id, x, y, w, h, fn) { st.hot[id] = fx.hotspot(id, x, y, w, h, fn); };
    if (st.mode === 'title') {
      H('start', 244.2, 230.9, 73.4, 25.1, function () { setMode('newgame'); });
      H('continue', 222.5, 259.6, 115, 31, function () { loadGame(); });
      H('instructions', 197, 298.4, 165.5, 24.7, function () { st.page = 1; setMode('instructions'); });
    } else if (st.mode === 'newgame') {
      GAME_LENGTHS.forEach(function (g) {
        H(g.id, g.hit[0], g.hit[1], g.hit[2], g.hit[3], function () {
          if (st.gamelength === g.len) return; // the chosen one is plain text, not a button
          st.gamelength = g.len;
        });
      });
      H('newgame-done', 245.5, 323.7, 59.8, 25.5, function () { setMode('makechar'); });
    } else if (st.mode === 'makechar') {
      var inp = ui.input(null, 206.2, 137.75, 165.6, { maxLength: 11, value: st.textname, id: 'name' });
      inp.setAttribute('data-id', 'name');
      inp.style.height = '23.8px';
      inp.style.font = '900 14px "Arial Black", "Arial Bold", Arial, sans-serif';
      inp.style.padding = '0 2px';
      inp.style.lineHeight = '22px';
      // the original's field: black text, left-aligned, plain 1px black border (inline, so the
      // shared .finput look used by the buildings can't change it)
      inp.style.color = '#000';
      inp.style.textAlign = 'left';
      inp.style.border = '1px solid #000';
      inp.style.borderRadius = '0';
      inp.style.background = '#fff';
      inp.style.boxShadow = 'none';
      inp.spellcheck = false;
      if (fx.face('black').heavy) {
        // no Arial Black here: widen and thicken the bold fallback to match
        inp.style.letterSpacing = '0.75px';
        inp.style.webkitTextStroke = '0.35px #000';
      }
      inp.addEventListener('input', function () { st.textname = inp.value; });
      st.input = inp;
      STAT_ROWS.forEach(function (r) {
        H(r.key + '-minus', 274, r.ay - 7.5, 8, 15, function () {
          if (st[r.key] > 0) { st[r.key] -= 1; st.pts += 1; }
        });
        H(r.key + '-plus', 321, r.ay - 7.5, 8, 15, function () {
          if (st.pts > 0) { st[r.key] += 1; st.pts -= 1; }
        });
      });
      H('roll', 372, 187.2, 71.2, 41, function () { roll(); });
      H('create-done', 245.6, 323.6, 59.8, 25.5, function () { finishCharacter(); });
    } else if (st.mode === 'instructions') {
      H('next', 245.1, 292, 56.2, 24.6, function () { nextPage(); });
    }
  }

  // ------------------------------------------------------------------------------------------
  // Drawing
  // ------------------------------------------------------------------------------------------
  function hot(id) { return st.hot[id] || {}; }

  // The logo: white Impact 96px STICK RPG with two stretched ghost copies, yellow 60px
  // COMPLETE stretched sideways with motion streaks, two faint white bands; the whole logo at
  // 50% alpha (sprite 66).
  // [letter, x of the letter in the logo clip, ink left, ink right] at 100% width.
  var STICK = [['S', -212.1, 2.3, 51.9], ['T', -160.4, 0.6, 44.9], ['I', -114.1, 3.9, 31.6], ['C', -84.4, 3.4, 56.6],
    ['K', -29.2, 3.9, 55.4], ['R', 43.3, 3.9, 55.6], ['P', 97.0, 3.9, 52.1], ['G', 147.3, 3.4, 56.3]];
  var STICK_G1 = [-217.4, -165.2, -117.3, -90.1, -34.8, 37.8, 91.8, 141.7];
  var STICK_G2 = [-225.2, -172.2, -121.7, -98.4, -42.8, 29.7, 84.3, 133.4];
  var COMP = [['C', -210.9, 2.1, 35.4], ['O', -154.2, 2.1, 34.9], ['M', -98.0, 2.4, 45.5], ['P', -25.4, 2.4, 32.5],
    ['L', 26.3, 2.4, 25.3], ['E', 66.3, 2.4, 27.4], ['T', 109.8, 0.4, 28.1], ['E', 158.1, 2.4, 27.4]];
  var COMP_G1 = [-216.6, -159.8, -105.3, -30.6, 22.3, 62.0, 105.0, 153.7];
  var COMP_G2 = [-224.1, -167.1, -115.0, -37.3, 17.4, 56.5, 99.0, 148.3];

  // The logo never changes, so it is drawn once into a transparent layer (source-over blending
  // is associative, so the layer over the backdrop looks exactly like drawing it in place).
  var logoCache = null;
  function drawLogo(ctx) {
    if (!logoCache) logoCache = buildLogo();
    ctx.drawImage(logoCache, 0, 0);
  }

  function buildLogo() {
    var lx = 289.3, ly = 73.65;
    var layer = document.createElement('canvas');
    layer.width = SRPG.W;
    layer.height = SRPG.H;
    var ctx = layer.getContext('2d');
    // Each letter is one filled glyph in the original, blended at its own alpha. The fallback
    // face strokes over its fill to thicken it, so draw each letter opaque on a scratch layer
    // first and blend that, or the overlap would show as a brighter outline.
    var tmp = document.createElement('canvas');
    tmp.width = SRPG.W;
    tmp.height = SRPG.H;
    var tc = tmp.getContext('2d');
    // faint white bands behind the words (the whole logo is at 50%, the bands at 25% of that)
    ctx.globalAlpha = 0.5 * 0.25;
    ctx.fillStyle = '#fff';
    ctx.fillRect(-8, 27.05, 575, 82);
    ctx.fillRect(-12, 123.95, 575, 47.2);
    // One Impact letter stretched sideways by sx about its own origin x.
    var letter = function (L, x, baseline, size, sx, color, a) {
      tc.clearRect(0, 0, tmp.width, tmp.height);
      fx.text(tc, L[0], lx + x + L[2] * sx, ly + baseline, { face: 'impact', size: size, color: color, width: (L[3] - L[2]) * sx });
      ctx.globalAlpha = 0.5 * a;
      ctx.drawImage(tmp, 0, 0);
    };
    // COMPLETE: long streaks (C and E only), ghosts, then the letters
    letter(COMP[0], -304.1, 36 + 60, 60, 8.055, '#ffff00', 0.25);
    letter(COMP[7], 64.7, 36 + 60, 60, 8.055, '#ffff00', 0.25);
    COMP.forEach(function (c, i) {
      letter(c, COMP_G2[i], 36 + 60, 60, 2.417, '#ffff00', 0.25);
      letter(c, COMP_G1[i], 36 + 60, 60, 1.933, '#ffff00', 0.25);
    });
    COMP.forEach(function (c) { letter(c, c[1], 36 + 60, 60, 1.611, '#ffff00', 1); });
    // STICK RPG: ghosts at 150% and 120% width, then the letters
    STICK.forEach(function (c, i) {
      letter(c, STICK_G2[i], -64.1 + 96, 96, 1.5, '#ffffff', 0.25);
      letter(c, STICK_G1[i], -64.1 + 96, 96, 1.2, '#ffffff', 0.25);
    });
    STICK.forEach(function (c) { letter(c, c[1], -63.1 + 96, 96, 1, '#ffffff', 1); });
    return layer;
  }

  function drawTitleMenu(ctx) {
    drawLogo(ctx);
    fx.impactButton(ctx, 'START', 284.3 - 37.5, 243.15 - 14.6, hot('start'), 2);
    fx.impactButton(ctx, 'CONTINUE', 291 - 64.3, 276.25 - 14.6, hot('continue'), 2);
    fx.impactButton(ctx, 'INSTRUCTIONS', 284.5 - 85.5, 310.45 - 14.6, hot('instructions'), 4);
    // Bottom line: version, and a fan-recreation note where the original had its copyright.
    fx.text(ctx, 'v 1.22', 31.5, 387.05, { face: 'impact', size: 12, color: '#66ccff' });
    fx.text(ctx, 'Fan-made recreation • not affiliated with XGen Studios', 211.7, 386.55, { face: 'impact', size: 12, color: '#66ccff' });
  }

  var PANEL_TEXT = '#aee4ff';

  function drawNewGame(ctx) {
    fx.panel(ctx, 281.6, 208.65, 1, 1.5, true);
    fx.text(ctx, 'NEW GAME', 201.35, 100.35, { size: 24, color: PANEL_TEXT, width: 147 });
    GAME_LENGTHS.forEach(function (g) {
      var col = st.gamelength === g.len ? '#ffffff' : PANEL_TEXT;
      var w = fx.text(ctx, g.big, g.x, g.y, { size: 16, color: col });
      if (g.small) fx.text(ctx, g.small, g.x + w + 5.5, g.y, { size: 12, color: col });
    });
    fx.impactButton(ctx, 'DONE', 278.2 - 30.6, 336.25 - 14.6, hot('newgame-done'), 2);
  }

  function arrow(ctx, cx, cy, dir, state) {
    var col = state.down ? '#66ccff' : state.over ? '#ffffff' : PANEL_TEXT;
    ctx.save();
    ctx.translate(cx, cy);
    if (dir > 0) ctx.rotate(Math.PI);
    ctx.beginPath();
    ctx.moveTo(-3.6, -0.3);
    ctx.lineTo(3.6, -6.9);
    ctx.lineTo(3.6, 6.9);
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
    ctx.restore();
  }

  // One die: a slightly turned cube with a white face showing `n` pips.
  function die(ctx, x, y, s, rot, n) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.lineJoin = 'round';
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = '#666666';
    // side and bottom faces
    ctx.beginPath();
    ctx.moveTo(s, 0);
    ctx.lineTo(s + s * 0.28, s * 0.2);
    ctx.lineTo(s + s * 0.28, s * 1.2);
    ctx.lineTo(s, s);
    ctx.closePath();
    ctx.fillStyle = '#bbbbbb';
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, s);
    ctx.lineTo(s, s);
    ctx.lineTo(s + s * 0.28, s * 1.2);
    ctx.lineTo(s * 0.28, s * 1.2);
    ctx.closePath();
    ctx.fillStyle = '#d8d8d8';
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, s, s);
    ctx.strokeRect(0, 0, s, s);
    ctx.fillStyle = '#000';
    var P = { 1: [[0.5, 0.5]], 2: [[0.25, 0.25], [0.75, 0.75]], 3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
      5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]] };
    (P[n] || P[1]).forEach(function (p) {
      ctx.beginPath();
      ctx.arc(p[0] * s, p[1] * s, s * 0.1, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  function drawDice(ctx, state) {
    // Up: resting at 386..419 x 190..213; over: nudged; down: tossed up.
    var ox = 0, oy = 0, r = 0;
    if (state.down) { ox = -3; oy = -9; r = -0.35; }
    else if (state.over) { ox = 3; oy = 3; r = 0.2; }
    die(ctx, 388 + ox, 191 + oy, 11, -0.3 + r, 2);
    die(ctx, 405 + ox * 0.6, 198 + oy * 0.8, 11, 0.25 - r, 5);
  }

  function drawMakeChar(ctx) {
    fx.panel(ctx, 281.6, 208.65, 1, 1.5, true);
    fx.text(ctx, 'CREATE CHARACTER', 133.3, 100.35, { size: 24, color: PANEL_TEXT, width: 280.5 });
    fx.text(ctx, 'NAME:', 136.2, 154.75, { size: 14, color: PANEL_TEXT, width: 52.3 });
    STAT_ROWS.forEach(function (r) {
      fx.text(ctx, r.label, r.lx, r.ly, { size: 14, color: PANEL_TEXT });
      arrow(ctx, 278.3, r.ay, -1, hot(r.key + '-minus'));
      arrow(ctx, 325.2, r.ay, 1, hot(r.key + '-plus'));
      fx.text(ctx, String(st[r.key]), 301.3, r.vy, { size: 16, color: PANEL_TEXT, align: 'center' });
    });
    fx.text(ctx, 'EXTRA PTS:', 135.8, 296.35, { size: 14, color: PANEL_TEXT });
    fx.text(ctx, String(st.pts), 257.3, 297.3, { size: 16, color: PANEL_TEXT, align: 'center' });
    var rs = hot('roll');
    drawDice(ctx, rs);
    fx.text(ctx, 'ROLL AGAIN', 373.6, 225.95, { size: 10, color: rs.down ? '#66ccff' : rs.over ? '#ffffff' : '#d6f1fe', width: 68 });
    fx.impactButton(ctx, 'DONE', 278.3 - 30.6, 336.15 - 14.6, hot('create-done'), 2);
  }

  // ---- instruction pages (sprite 149). The story is paraphrased; the HUD labels are the
  // original's. Text colour #d6f1fe, Impact.
  var IC = '#d6f1fe';
  function para(ctx, lines, x, y0) {
    lines.forEach(function (l) {
      fx.text(ctx, l[0], x + (l[3] || 0), y0 + l[1], { face: 'impact', size: l[2], color: IC });
    });
  }

  // ---- pages 5 and 6: a shrunken picture of the game (shapes 168 and 171 of sprite 149) ------
  // The original shows a small shot of the game with a rough edge: you standing on the sidewalk
  // at the corner of the convenience store, the HUD across the top. We take the same shot with
  // the game's own art (the city at that scroll position, the player and the map HUD, as on a
  // new game's first morning) and shrink it into the same box, stage x 259.9-505.5, y 95.7-275.
  var SHOT = { x: 259.9, y: 95.7, w: 245.6, h: 179.3, mapx: 142, mapy: -63 };
  var shotCache = null;

  function gameShot() {
    // drawn at 2x when the stage is shown big enough for 1x to look soft
    var k = (SRPG.engine.pixelScale || 1) > 2.2 ? 2 : 1;
    if (shotCache && shotCache.k === k) return shotCache.canvas;
    var c = document.createElement('canvas');
    c.width = SRPG.W * k;
    c.height = SRPG.H * k;
    var x = c.getContext('2d');
    x.scale(k, k);
    var s = { mapx: SHOT.mapx, mapy: SHOT.mapy, dwelling: 1, time: 8, day: 1, cash: 100, hp: 25, hpmax: 25, karma: 0 };
    try {
      // (the city fills this whole view, so no sky is needed under it)
      x.save();
      x.beginPath();
      x.rect(0, 0, SRPG.W, SRPG.H);
      x.clip();
      x.translate(s.mapx, s.mapy);
      SRPG.mapArt.drawStatic(x, s);
      x.restore();
      // standing, facing down the street
      SRPG.sprites.player(x, SRPG.MAP.PLAYER_X, SRPG.MAP.PLAYER_Y, { rot: 180, color: SRPG.game.personColor(0), mode: 'walk' });
      SRPG.hud.draw(x, s, 'map', { still: true });
    } catch (e) { /* art missing: keep what was drawn */ }
    shotCache = { k: k, canvas: c };
    return c;
  }

  // How far the picture's torn edge wanders in from its box at distance d along a side.
  function edgeIn(d, seed) {
    var v = 1.8 + 1.3 * Math.sin(d / 11 + seed) + 0.5 * Math.sin(d / 4.3 + seed * 2.7);
    return Math.max(0, Math.min(4.5, v));
  }

  function drawGameShot(ctx) {
    var X = SHOT.x, Y = SHOT.y, W = SHOT.w, H = SHOT.h, d;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(X + edgeIn(0, 1), Y + edgeIn(0, 4));
    for (d = 3; d <= W; d += 3) ctx.lineTo(X + d, Y + edgeIn(d, 4));
    for (d = 0; d <= H; d += 3) ctx.lineTo(X + W - edgeIn(d, 2), Y + d);
    for (d = W; d >= 0; d -= 3) ctx.lineTo(X + d, Y + H - edgeIn(d, 5));
    for (d = H; d >= 0; d -= 3) ctx.lineTo(X + edgeIn(d, 1), Y + d);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(gameShot(), X, Y, W, H);
    ctx.restore();
  }

  // Page 6 (shape 171): the picture again, a yellow box round each HUD piece, and each label
  // underlined in white and joined to its box by a yellow line. Per row: the label (text, x,
  // baseline), the underline (x0, y0, x1, y1), where the yellow line meets the box, the box.
  var LEGEND = [
    ['Health Remaining/Total Health', 48.3, 104.55, [47.2, 107.4, 232.85, 107.4], [263.15, 107.4], [263.15, 97.15, 348.85, 107.65]],
    ['Cash on hand (Currently available)', 48.4, 135.45, [48.45, 138, 252.05, 138.65], [354.1, 108], [355.35, 98.15, 380.35, 108.15]],
    ['Time of day/Current day', 48.7, 164.65, [48.45, 167.4, 189.7, 167.45], [406.6, 111.75], [407.35, 94.15, 453.3, 111.65]],
    ['Character Inventory', 48.4, 193.15, [47.85, 196.1, 181.6, 196.1], [465.35, 116.15], [466.35, 95.15, 484.35, 116.15]],
    ['Stats/Information', 49.2, 222.25, [47.9, 224.9, 155.4, 225.5], [489.7, 116.15], [490.35, 95.15, 506.35, 116.15]],
  ];

  function drawLegend(ctx) {
    ctx.save();
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    LEGEND.forEach(function (l) {
      var u = l[3], e = l[4], b = l[5];
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(u[0], u[1]);
      ctx.lineTo(u[2], u[3]);
      ctx.stroke();
      ctx.strokeStyle = '#ffff00';
      ctx.beginPath();
      ctx.moveTo(u[2], u[3]);
      ctx.lineTo(e[0], e[1]);
      ctx.rect(b[0], b[1], b[2] - b[0], b[3] - b[1]);
      ctx.stroke();
    });
    ctx.restore();
    LEGEND.forEach(function (l) { fx.text(ctx, l[0], l[1], l[2], { face: 'impact', size: 14, color: '#ffffff' }); });
  }

  function drawInstructions(ctx) {
    var p = st.page;
    // page 4's big olive $$$ sits under the translucent panel
    if (p === 4) fx.text(ctx, '$$$', 112.2, 267.75, { face: 'impact', size: 200, color: '#818400', width: 328 });
    fx.panel(ctx, 275.9, 203.75, 1.4, 1.3);
    if (p === 1) {
      para(ctx, [
        ['It was a slow, forgettable afternoon, and you', 22, 22],
        ['felt yourself sinking toward  s l e e p . . .  .  Heavy lids', 48.7, 22],
        ['drooped shut, yet sleep never quite arrived.  Instead you', 77.4, 22],
        ['drifted into a hazy place between dreaming and waking,', 104.55, 18],
        ['the hypnagogic state.', 131.25, 22],
      ], 55.6, 96.25);
    } else if (p === 2) {
      para(ctx, [
        ['Your grip on space starts to twist and', 24, 22],
        ['warp, and once you finally get your bearings back', 51.15, 20],
        ['and come to your senses, a dizzying truth', 77.85, 22],
        ['slowly sinks in:', 106.55, 20],
        ['up', 128.55, 16.9],
        ['and', 154.2, 22, 3.8],
        ['down', 175.75, 16.9],
        ['are gone', 201.4, 22, 3.8],
        ['for good.  You find no', 228.1, 22],
        ['floor', 247.05, 14.3],
        [',  no', 272.15, 22],
        ['ceiling', 291.1, 14.3],
        ['.   Nothing is on', 316.2, 22],
        ['top', 340.35, 19.5],
        [',  nothing on the', 366.55, 22],
        ['bottom.', 390.7, 19.5],
      ], 55.4, 96.25);
    } else if (p === 3) {
      fx.text(ctx, 'Welcome to', 189.5, 183.85, { face: 'impact', size: 22, color: IC });
      fx.text(ctx, 'The 2nd Dimension', 193.4, 220.6, { face: 'impact', size: 32, color: IC });
    } else if (p === 4) {
      para(ctx, [
        ['Seems you will be stuck here for quite a while.', 22, 22],
        ['Might as well enjoy a brand new world with no', 48.7, 22],
        ['consequences and every last perk of', 75.4, 22],
        ['MEGALOMANIA!', 102.1, 22, 3.8],
        ['Stack up all the NET WORTH you can!', 132.8, 26],
      ], 74, 96.85);
    } else if (p === 5) {
      para(ctx, [
        ['-  GET AROUND WITH THE ARROW', 16, 16],
        ['KEYS ON YOUR KEYBOARD', 35.4, 16],
        ['-  WALK THROUGH A DOOR TO', 54.8, 16],
        ['GO INSIDE A BUILDING', 74.2, 16, 5.6],
        ['-  STEER CLEAR OF CARS AND', 93.6, 16],
        ['OTHER HAZARDS', 113, 16, 5.6],
      ], 45.8, 100.25);
      drawGameShot(ctx);
    } else if (p === 6) {
      drawGameShot(ctx);
      drawLegend(ctx);
    } else if (p === 7) {
      para(ctx, [
        ['-  MOST THINGS YOU DO  (EATING, WORKING, AND SO ON)  EAT UP TIME.', 16, 16],
        ['WHEN THE DAY RUNS OUT, HEAD BACK TO YOUR APARTMENT AND', 35.4, 16, 5.6],
        ['SLEEP.  A GOOD NIGHT’S SLEEP HEALS YOU AS WELL.', 54.8, 16, 5.6],
      ], 71.4, 100.25);
      fx.text(ctx, 'EVERYTHING ELSE IS YOURS TO DISCOVER!', 275.9, 233.25, { face: 'impact', size: 22, color: IC, align: 'center' });
    }
    fx.impactButton(ctx, 'NEXT', 277.1 - 30.6, 303.75 - 14.6, hot('next'), 2);
  }

  // ------------------------------------------------------------------------------------------
  // Scene
  // ------------------------------------------------------------------------------------------
  var scene = {
    st: st, // exposed for tests
    enter: function () {
      st.mode = 'title';
      st.page = 1;
      st.gamelength = 0; // sprite 180 frame 1: UNLIMITED preselected
      st.textname = 'Anonymous';
      st.frame = 0;
      roll();
      resetBubbles();
      // Root frame 1 (on boot, and again after the results' DONE, which re-creates the black
      // clip): the title fades in from black (black clip frames 1..10).
      SRPG.engine.blackPlay(1);
      // Root frame 1 also sets music = 1 again, and the intro screen starts the title loop
      // without looking at it: after a game played with MUSIC OFF the title still has music.
      // LoopA.setVolume(50) sets the global volume: the title plays at half volume.
      SRPG.sound.setVolume(50);
      SRPG.sound.music('beginning');
      if (!SRPG.sound.musicOn) SRPG.sound.setMusic(true);
      build();
    },
    exit: function () {
      st.input = null;
    },
    tick: function () {
      st.frame++;
      tickBubbles();
    },
    render: function (ctx) {
      fx.bg(ctx);
      drawBubbles(ctx);
      if (st.mode === 'title') drawTitleMenu(ctx);
      else if (st.mode === 'newgame') drawNewGame(ctx);
      else if (st.mode === 'makechar') drawMakeChar(ctx);
      else if (st.mode === 'instructions') drawInstructions(ctx);
      SRPG.engine.drawBlack();
    },
    // For tests and the debug API.
    roll: roll,
    loadGame: loadGame,
    finish: finishCharacter,
    setMode: setMode,
  };

  SRPG.title = scene;
  SRPG.registerScreen('title', scene);
})();
