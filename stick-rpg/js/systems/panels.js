// The two panels opened from the city HUD: INVENTORY (backpack) and STATS ("?").
// Each factory builds its DOM and returns { close() }; onClose runs when the player closes it.
(function () {
  'use strict';
  var SRPG = window.SRPG;
  var ui = SRPG.ui;
  var esc = SRPG.util.escape;

  function closeX(panel, x, y, fn) {
    var b = ui.button(panel, 'X', fn, { x: x, y: y, w: 22, cls: 'xbtn', id: 'close' });
    b.style.fontSize = '13px';
    b.style.padding = '1px 0';
    return b;
  }

  function goHome(s) {
    if (s.dwelling <= 3) {
      s.mapx = 1054;
      s.mapy = 748;
      SRPG.location.open('home');
    } else {
      s.mapx = 447;
      s.mapy = 900;
      SRPG.location.open('mansion');
    }
  }

  SRPG.panels = {
    inventory: function (onClose) {
      var s = SRPG.game.s;
      var panel = ui.panel(70, 72, 427, 303);
      panel.setAttribute('data-panel', 'inventory');
      var ring = ui.el('div', 'nopoint', panel);
      ring.style.cssText = 'position:absolute;left:78px;top:6px;width:285px;height:285px;border-radius:50%;background:rgba(20,60,190,0.28)';
      var t = ui.el('div', 'ftext', panel, 'INVENTORY');
      t.style.cssText = 'left:12px;top:9px;font-size:12px;color:#002299';
      var api = {
        close: function () {
          if (panel.parentNode) panel.parentNode.removeChild(panel);
        },
      };
      function close() { api.close(); SRPG.sound.play('click'); onClose && onClose(); }
      closeX(panel, 390, 10, close);

      var entries = [];
      var it = s.items;
      if (it.smokes > 0) entries.push({ icon: 'smokes', label: 'SMOKES (x ' + it.smokes + ')<br><span class="red">-10 HP</span><br>+1 CHARM', use: 'smokes' });
      if (it.knife > 0) entries.push({ icon: 'knife', label: 'KNIFE<br>+2 DAMAGE IN CLOSE RANGE COMBAT<br>(AUTO)' });
      if (it.gun > 0) entries.push({ icon: 'gun', label: 'GUN<br>AMMO (x ' + it.ammo + ')' });
      if (it.pills > 0) entries.push({ icon: 'pills', label: 'CAFFEINE PILLS (x ' + it.pills + ')<br><span class="red">-20 HP</span><br>EXTRA TIME' });
      if (it.cocaine > 0) entries.push({ icon: 'cocaine', label: 'COCAINE (x ' + it.cocaine + ')<br>(COMMODITY)' });
      if (it.skateboard > 0) entries.push({ icon: 'skateboard', label: 'SKATEBOARD<br>(HOLD SHIFT WHEN WALKING)' });
      if (s.booze > 0) entries.push({ icon: 'bottle', label: 'BEER (x ' + s.booze + ')<br>(COMMODITY)' });
      if (it.cellPhone > 0) entries.push({ icon: 'cellphone', label: 'CELL<br>ESTABLISH CONTACTS IN OTHER CITIES' });
      if (it.alarm > 0) entries.push({ icon: 'alarm', label: 'CD ALARM CLOCK<br>(WAKE UP EARLIER)' });
      if (it.car > 0) entries.push({ icon: 'car', label: (it.car === 2 ? 'SPORTS CAR' : 'CAR') + "<br>(PRESS 'C' TO DRIVE)" });

      entries.forEach(function (e, i) {
        var col = i % 2, row = Math.floor(i / 2);
        var b = ui.iconButton(panel, { icon: e.icon, label: e.label, x: 16 + col * 200, y: 38 + row * 50, w: 190, cls: e.use ? '' : 'static', id: 'inv-' + e.icon }, function () {
          if (e.use !== 'smokes') return;
          // Light up: -10 HP, +1 hour, -1 karma, then +1 charm.
          if (s.hp > 10 && s.time < 24) {
            s.hp -= 10;
            s.items.smokes -= 1;
            s.time += 1;
            SRPG.game.addKarma(-1);
            SRPG.game.addStat('charm', 1);
            SRPG.sound.play('stat');
            ui.popText('CHARM INCREASED!!!');
            api.close();
            onClose && onClose();
            SRPG.city.openPanel('inventory');
          } else SRPG.sound.play('error');
        });
        if (!e.use) b.style.cursor = 'default';
      });

      ui.iconButton(panel, { icon: 'house', label: '', x: 364, y: 236, w: 42, id: 'gohome', title: 'Go home' }, function () {
        SRPG.sound.play('click');
        api.close();
        goHome(s);
      });
      api.panel = panel;
      return api;
    },

    stats: function (onClose) {
      var s = SRPG.game.s;
      var panel = ui.panel(214, 57, 283, 303);
      panel.setAttribute('data-panel', 'stats');
      var api = { close: function () { if (panel.parentNode) panel.parentNode.removeChild(panel); }, panel: panel };
      function close() { api.close(); SRPG.sound.play('click'); onClose && onClose(); }
      function line(html, x, y, size, color) {
        var e = ui.el('div', 'ftext', panel, html);
        e.style.cssText = 'left:' + x + 'px;top:' + y + 'px;font-size:' + (size || 10) + 'px;color:' + (color || '#002299');
        return e;
      }
      line('STATS', 12, 14, 13);
      line(esc(s.pname), 110, 14, 13, '#001a66');
      closeX(panel, 250, 12, close);
      line("JOB TITLE: &nbsp;&nbsp;'" + esc(SRPG.game.jobTitle(s)) + "'", 36, 58, 10);
      line('CHARM: ' + s.charm, 38, 88);
      line('INTELLIGENCE: ' + s.intelligence, 38, 109);
      line('STRENGTH: ' + s.strength, 38, 130);
      line('KARMA: ' + s.karma, 38, 153);
      line('NET WORTH : &nbsp;<span style="color:#ffcc00">$ ' + SRPG.util.commas(SRPG.game.netWorth(s)) + '</span>', 38, 178, 11);
      line('(CASH + BANK - LOANS)', 38, 195, 6.5);
      line('GAME LENGTH: &nbsp;' + (s.gamelength ? s.gamelength + ' Days' : 'Unlimited'), 38, 219, 10);

      function toggle(label, y, get, set) {
        line(label, 36, y, 10);
        var on = ui.button(panel, 'ON', function () { set(1); refresh(); }, { x: 106 + (label.length > 7 ? 26 : 0), y: y - 3, w: 26, cls: 'plain', id: 'on-' + label });
        var off = ui.button(panel, 'OFF', function () { set(0); refresh(); }, { x: 136 + (label.length > 7 ? 26 : 0), y: y - 3, w: 30, cls: 'plain', id: 'off-' + label });
        function refresh() {
          on.style.color = get() ? '#002299' : '#9cc4ff';
          off.style.color = get() ? '#9cc4ff' : '#002299';
        }
        refresh();
      }
      toggle('MUSIC:', 247, function () { return s.music; }, function (v) { s.music = v; SRPG.sound.setMusic(!!v); });
      toggle('OPTIMIZE:', 265, function () { return s.optimize; }, function (v) { s.optimize = v; });
      toggle('SHOW FPS:', 283, function () { return s.fps; }, function (v) { s.fps = v; });

      ui.button(panel, 'QUIT', function () {
        ui.confirm('ARE YOU SURE YOU WANT TO QUIT?', function () {
          api.close();
          SRPG.game.endGame();
        });
      }, { x: 214, y: 278, w: 50, cls: 'plain', id: 'quit' });
      return api;
    },
  };
})();
