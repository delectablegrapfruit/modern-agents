// Scene manager, fixed 35 Hz logic tick, rendering, input, stage scaling.
// A scene is { enter(params), exit(), tick(), render(ctx), onKey(key, e), onClick(x, y, e),
//              onMouseDown(x, y, e), onMouseUp(x, y, e), onMouseMove(x, y, e) } — all optional.
// tick() runs exactly SRPG.FPS times per second of real time (like the Flash original's frame
// rate); render() runs once per animation frame after the ticks.
(function () {
  'use strict';
  var SRPG = window.SRPG;

  var current = null;
  var currentName = null;
  var keys = {};
  var last = 0;
  var acc = 0;
  var paused = false;
  var STEP = 1000 / SRPG.FPS;

  var engine = (SRPG.engine = {
    canvas: null,
    ctx: null,
    frame: 0, // ticks since start
    keys: keys,
    mouse: { x: -1, y: -1, down: false },

    go: function (name, params) {
      var next = SRPG.screens[name];
      if (!next) throw new Error('Unknown scene: ' + name);
      if (current && current.exit) current.exit();
      SRPG.ui.clear();
      current = next;
      currentName = name;
      if (current.enter) current.enter(params || {});
      engine.draw();
    },

    get sceneName() { return currentName; },
    get scene() { return current; },

    pause: function (p) { paused = !!p; },
    isDown: function (k) { return !!keys[k]; },
    releaseAll: function () { for (var k in keys) keys[k] = false; },

    init: function () {
      var canvas = document.getElementById('game');
      canvas.width = SRPG.W;
      canvas.height = SRPG.H;
      engine.canvas = canvas;
      engine.ctx = canvas.getContext('2d');

      window.addEventListener('keydown', function (e) {
        var k = normKey(e);
        if (!k) return;
        if (isTyping(e)) return;
        if (/^(ArrowUp|ArrowDown|ArrowLeft|ArrowRight| |Tab)$/.test(k)) e.preventDefault();
        var wasDown = keys[k];
        keys[k] = true;
        if (!wasDown) {
          if (SRPG.ui.onKey && SRPG.ui.onKey(k, e)) return; // modal dialogs take keys first
          if (current && current.onKey) current.onKey(k, e);
        }
      });
      window.addEventListener('keyup', function (e) {
        var k = normKey(e);
        keys[k] = false;
        if (current && current.onKeyUp) current.onKeyUp(k, e);
      });
      window.addEventListener('blur', engine.releaseAll);

      var stage = document.getElementById('stage');
      stage.addEventListener('mousedown', function (e) {
        if (e.target !== canvas && e.target.id !== 'ui') return;
        var p = engine.toStage(e.clientX, e.clientY);
        engine.mouse.down = true;
        SRPG.sound.unlock();
        if (current && current.onMouseDown) current.onMouseDown(p.x, p.y, e);
        if (current && current.onClick) current.onClick(p.x, p.y, e);
      });
      window.addEventListener('mouseup', function (e) {
        var p = engine.toStage(e.clientX, e.clientY);
        engine.mouse.down = false;
        if (current && current.onMouseUp) current.onMouseUp(p.x, p.y, e);
      });
      window.addEventListener('mousemove', function (e) {
        var p = engine.toStage(e.clientX, e.clientY);
        engine.mouse.x = p.x;
        engine.mouse.y = p.y;
        if (current && current.onMouseMove) current.onMouseMove(p.x, p.y, e);
      });
      window.addEventListener('keydown', function () { SRPG.sound.unlock(); });

      window.addEventListener('resize', fit);
      fit();
      requestAnimationFrame(frame);
    },

    toStage: function (cx, cy) {
      var r = engine.canvas.getBoundingClientRect();
      return { x: ((cx - r.left) / r.width) * SRPG.W, y: ((cy - r.top) / r.height) * SRPG.H };
    },

    // The original's "black" clip (sprite 243, above everything on the root timeline): played from
    // frame 1 it fades in from black over frames 1-10 (entering a building, getting into the car),
    // from frame 11 over frames 11-30 (arriving after the intro or a load); it stops at 10 and 30,
    // transparent. It plays on whichever screen is showing; the city and buildings draw it.
    black: 0, // the clip's current frame (0 = not played yet)
    blackPlay: function (frame) { engine.black = frame; },
    blackAlpha: function () {
      var f = engine.black;
      if (f >= 1 && f <= 10) return (10 - f) / 9;
      if (f >= 11 && f <= 30) return (30 - f) / 19;
      return 0;
    },
    drawBlack: function (ctx) {
      var a = engine.blackAlpha();
      if (a <= 0) return;
      ctx.fillStyle = 'rgba(0,0,0,' + a + ')';
      ctx.fillRect(0, 0, SRPG.W, SRPG.H);
    },

    // Test hook: advance the simulation n ticks synchronously (no rAF needed), then redraw.
    step: function (n) {
      for (var i = 0; i < (n || 1); i++) tick();
      engine.draw();
    },

    // Backing-store pixels per stage pixel (the canvas is drawn at the size it is shown, so it
    // stays sharp when the stage is scaled up).
    pixelScale: 1,

    draw: function () {
      var ctx = engine.ctx;
      var k = engine.pixelScale;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      if (current && current.render) current.render(ctx);
    },
  });

  function isTyping(e) {
    var t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
  }

  function normKey(e) {
    var k = e.key;
    if (k === 'Spacebar') k = ' ';
    if (k && k.length === 1) k = k.toLowerCase();
    return k;
  }

  function fit() {
    var stage = document.getElementById('stage');
    var s = Math.min(window.innerWidth / SRPG.W, window.innerHeight / SRPG.H);
    stage.style.transform = 'translate(-50%, -50%) scale(' + s + ')';
    // Match the canvas resolution to its on-screen size (capped to keep big screens fast).
    var k = Math.max(1, Math.min(3, Math.round(s * (window.devicePixelRatio || 1) * 4) / 4));
    var c = engine.canvas;
    if (c && k !== engine.pixelScale) {
      engine.pixelScale = k;
      c.width = Math.round(SRPG.W * k);
      c.height = Math.round(SRPG.H * k);
      engine.draw();
    }
  }

  function tick() {
    engine.frame++;
    if (engine.black > 0 && engine.black !== 10 && engine.black < 30) engine.black++;
    if (current && current.tick) current.tick();
  }

  function frame(t) {
    if (!last) last = t;
    var dt = Math.min(250, t - last);
    last = t;
    if (!paused) {
      acc += dt;
      var n = 0;
      while (acc >= STEP && n < 10) {
        tick();
        acc -= STEP;
        n++;
      }
      if (n === 10) acc = 0;
      engine.draw();
    }
    requestAnimationFrame(frame);
  }
})();
