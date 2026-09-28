// Generic building / street-dialog screen: the interior art, the HUD, and the original's blue
// panel with a quote, square icon buttons in two columns and LEAVE. Buildings are data +
// callbacks registered with SRPG.registerLocation (see docs/ARCHITECTURE.md). Pressing a button
// makes no sound of its own: the original loads _click.wav but no script ever starts it.
(function () {
  'use strict';
  var SRPG = window.SRPG;
  var ui = SRPG.ui;
  var esc = SRPG.util.escape;

  var DEFAULT_PANEL = { x: 182, y: 47, w: 355, h: 250 };

  var cur = null; // { def, g, sub }
  var active = false; // the location screen is showing (false while a minigame runs)
  // Double-click guard: the second click of a double-click that began on another screen (e.g. a
  // minigame's exit button) must not press the menu button that appears under the pointer.
  var armed = false;

  function S() { return SRPG.game.s; }

  function makeG(def) {
    var g = {
      def: def,
      get s() { return S(); },
      refresh: function () { build(); },
      // Pay n dollars if you have them (the original's "cash > n - 1" checks). Plays the error
      // sound and returns false when you can't.
      spend: function (n) {
        var s = S();
        if (s.cash >= n) { s.cash -= n; return true; }
        g.error();
        return false;
      },
      canAfford: function (n) { return S().cash >= n; },
      error: function () { SRPG.sound.play('error'); },
      sfx: function (name) { SRPG.sound.play(name); },
      pop: function (text, color) { SRPG.sound.play('stat'); ui.popText(text, { color: color }); },
      msg: function (text) { SRPG.game.pushMsg(text); },
      addKarma: function (n) { SRPG.game.addKarma(n); },
      addStat: function (name, n) { SRPG.game.addStat(name, n); },
      heal: function (n) { SRPG.game.heal(n); },
      // Replace the panel's content with a sub-screen until one of its buttons is used.
      // opts: { title, titleColor, quote, body (HTML), icon, buttons: [{ label, icon, onClick, x, y }],
      //         ok: label for a single OK button that returns to the menu, panel: {x,y,w,h} }
      show: function (opts) {
        cur.sub = opts;
        build();
      },
      back: function () {
        cur.sub = null;
        build();
      },
      leave: function () { SRPG.location.leave(); },
      go: function (screen, params) { SRPG.engine.go(screen, params); },
      endGame: function () { SRPG.game.endGame(); },
      die: function () { SRPG.game.die(); },
    };
    return g;
  }

  function panelRect(def, v) {
    var p = (v && v.panel) || def.panel || DEFAULT_PANEL;
    return { x: p.x, y: p.y, w: p.w, h: p.h };
  }

  // Button grid: two columns, rows 48 px apart (as in the original's menus).
  function btnPos(p, b, v) {
    if (b.x != null) return { x: p.x + b.x, y: p.y + b.y };
    var rowTop = v.rowTop != null ? v.rowTop : 58;
    var rowGap = v.rowGap != null ? v.rowGap : 48;
    var colX = v.colX || [5, 190];
    return { x: p.x + colX[b.col || 0], y: p.y + rowTop + (b.row || 0) * rowGap };
  }

  function build() {
    if (!cur) return;
    SRPG.ui.clear();
    var def = cur.def, g = cur.g;
    if (cur.sub) return buildSub(cur.sub);
    var v = def.view(g) || {};
    if (v.custom) return; // the location draws its own DOM in view()
    var p = panelRect(def, v);
    var panel = ui.panel(p.x, p.y, p.w, p.h);
    panel.setAttribute('data-loc', def.id);
    panel.addEventListener('mousedown', function (e) { if (e.detail <= 1) armed = true; }, true);
    if (v.quote != null || v.quoteHtml != null) {
      ui.quote(panel, v.quoteHtml != null ? v.quoteHtml : '"' + esc(v.quote) + '"', 12, v.quoteY != null ? v.quoteY : 18, p.w - 24, 'big');
    }
    if (v.body) ui.text(panel, v.body, 14, v.bodyY || 44, p.w - 28);
    var local = { x: 0, y: 0, w: p.w, h: p.h };
    (v.buttons || []).forEach(function (b) {
      if (b.hidden) return;
      var pos = btnPos(local, b, v);
      ui.iconButton(panel, { icon: b.icon, label: b.label, x: pos.x, y: pos.y, w: b.w || 160, disabled: b.disabled, id: b.id, size: b.size }, function (e) {
        if (e && e.detail > 1 && !armed) return;
        b.onClick(g);
        if (cur && cur.def === def && !cur.sub && SRPG.engine.sceneName === 'location') build();
      });
    });
    if (v.leave !== false) {
      var lp = btnPos(local, v.leaveAt || { col: 1, row: 3 }, v);
      ui.iconButton(panel, { icon: 'leave', label: 'LEAVE', x: lp.x, y: lp.y, w: 120, id: 'leave' }, function (e) {
        if (e && e.detail > 1 && !armed) return;
        SRPG.location.leave();
      });
    }
  }

  function buildSub(o) {
    var def = cur.def;
    var p = o.panel || panelRect(def, null);
    var panel = ui.panel(p.x, p.y, p.w, p.h);
    var y = 14;
    if (o.icon && SRPG.icons) {
      var c = document.createElement('canvas');
      c.width = 90; c.height = 90;
      c.style.cssText = 'position:absolute;left:12px;top:10px;width:30px;height:30px';
      var cx = c.getContext('2d');
      cx.scale(3, 3);
      try { SRPG.icons.draw(cx, o.icon, 30); } catch (e) {}
      panel.appendChild(c);
    }
    if (o.title) {
      var t = ui.el('div', 'modal-title', panel, esc(o.title));
      t.style.cssText = 'position:absolute;left:' + (o.icon ? 46 : 10) + 'px;right:10px;top:' + y + 'px;font-size:12px;color:' + (o.titleColor || '#e10000');
      y += 26;
    }
    if (o.quote) { ui.quote(panel, '"' + esc(o.quote) + '"', 14, y, p.w - 28, 'big'); y += 40; }
    if (o.body) ui.text(panel, o.body, 16, o.bodyY || y, p.w - 32);
    var buttons = o.buttons || [{ label: o.ok || 'OK', onClick: function (g) { g.back(); } }];
    buttons.forEach(function (b, i) {
      var bx = b.x != null ? b.x : p.w - 70 - i * 80;
      var by = b.y != null ? b.y : p.h - 34;
      if (b.icon) {
        ui.iconButton(panel, { icon: b.icon, label: b.label, x: bx, y: by, w: b.w || 150, id: b.id }, function () {
          b.onClick(cur.g);
        });
      } else {
        ui.button(panel, b.label, function () {
          b.onClick(cur.g);
        }, { x: bx, y: by, w: b.w || 56, id: b.id });
      }
    });
  }

  var scene = {
    enter: function (params) {
      var def = SRPG.locations[params.id];
      if (!def) throw new Error('Unknown location ' + params.id);
      cur = { def: def, g: makeG(def), sub: null };
      // A building's frame script starts the black clip at frame 1 and swaps main.mp3 for
      // inside.mp3 (LoopB.stop, LoopD.start when music is on). Street dialogs are drawn over the
      // map with neither. A minigame handing back (resume) skips onEnter, and the fade unless it
      // asks for it (the casino games go back to root frame 40, which re-runs the black clip).
      if ((!params.resume || params.fade) && !def.overlay) SRPG.engine.blackPlay(1);
      active = true;
      armed = false;
      // The frame script's LoopB.stop() is on a global Sound object, so every sound stops, and
      // inside.mp3 starts again from the top even when it was already playing (a return to the
      // building's root frame after a minigame, a sub-screen or an animation).
      if ((!params.resume || params.fade) && !def.overlay && def.music !== null) SRPG.sound.stopAll();
      if (def.music !== null) SRPG.sound.music(def.overlay ? 'main' : def.music || 'inside');
      if (def.onEnter && !params.resume) def.onEnter(cur.g);
      if (cur && cur.def === def) build();
    },
    exit: function () { active = false; },
    tick: function () {
      var s = S();
      if (s && s.hp <= 0 && !s.over) { SRPG.game.die(); return; }
      // street dialogs: the car and person clips on the map below keep playing
      if (cur && cur.def.overlay && SRPG.city && SRPG.city.dialogTick) SRPG.city.dialogTick();
      if (cur && cur.def.tick) cur.def.tick(cur.g);
    },
    render: function (ctx) {
      var s = S();
      if (!cur || !s) return;
      var def = cur.def;
      if (def.overlay) {
        // street dialogs sit on top of the frozen map
        SRPG.city.renderWorld(ctx);
      } else if (def.background) {
        def.background(ctx, s, SRPG.engine.frame, cur.g);
      } else {
        ctx.fillStyle = '#555';
        ctx.fillRect(0, 0, SRPG.W, SRPG.H);
      }
      if (def.foreground) def.foreground(ctx, s, SRPG.engine.frame, cur.g);
      SRPG.hud.draw(ctx, s, def.hud || 'inside');
      SRPG.engine.drawBlack(ctx);
    },
  };

  SRPG.registerScreen('location', scene);

  SRPG.location = {
    // opts: { resume: back from a minigame (no onEnter, no fade), fade: fade in from black anyway }
    open: function (id, opts) {
      opts = opts || {};
      SRPG.engine.go('location', { id: id, resume: !!opts.resume, fade: !!opts.fade });
    },
    // The location on screen (null while a minigame or another screen is showing).
    get current() { return active && cur ? cur.def.id : null; },
    get g() { return cur && cur.g; },
    // Back to the street, nudged away from the door (each LEAVE button's mapx / mapy +-8), with
    // main.mp3 back on. There is no fade: the root timeline just returns to frame 2 (a black fade
    // still playing from the way in carries on). leave({ nudge: false }) skips the nudge (e.g.
    // after being moved elsewhere); leave('key') uses another building's nudge.
    leave: function (opt) {
      var s = S();
      var def = cur && cur.def;
      var key = typeof opt === 'string' ? opt : (def && (def.exit || def.id));
      if (opt && typeof opt === 'object' && opt.nudge === false) key = null;
      var n = key && SRPG.MAP.exitNudge[key];
      if (n && !(def && def.overlay)) {
        if (n.mapx) s.mapx += n.mapx;
        if (n.mapy) s.mapy += n.mapy;
      }
      if (def && def.onLeave) def.onLeave(cur.g);
      cur = null;
      // after a building the map, the player and the cars are new clips (see city.js)
      SRPG.engine.go('city', { rebuild: !(def && def.overlay) });
    },
  };
})();
