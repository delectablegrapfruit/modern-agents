// js/minigames/skins/holdup.js — owner: W2-Food. The `holdup` skin of the Duel engine (GDD §4.10,
// §6.5; BALANCE B-11b, B-30): robbing the store (W2-Food) or the bank (W2-Money). Three beats, best
// of three; each beat offers Intimidate (STR), Sweet-talk (CHA) and Outwit (INT) with the shown odds
// chance(stat, D) after the B-28b modifiers of `holdup.<target>.<stat>`. The numbers (D, beats,
// need, the options, the chances, `stake`) come with the run params from W2-RulesC's
// crime.holdupParams and the B-30 row `tuning.duel.holdup`; Auto is the engine's (each beat the best
// shown odds, rolled with the rules stream). This skin names the opponent (Dee, or the bank's
// teller), the situation of each beat, and draws the scene: the clerk behind the counter, hands going
// up as the beats go your way.
// Node-loadable: nothing draws at load time.
(function () {
  'use strict';
  var SR = window.SR;

  var WHO = {
    store: { name: 'mg.holdup.clerk', portrait: 'dee', counter: 'bld.store.walls', trim: 'bld.store.trim', wall: 'int.store.wall' },
    bank: { name: 'mg.holdup.teller', portrait: 'penny', counter: 'bld.bank.walls', trim: 'bld.bank.trim', wall: 'int.bank.wall' },
  };
  var BEATS = 3;            // the situation lines per target (mg.holdup.<target>.1..3)
  var STICK_SCALE = 1.35;   // the opponent's side-view rig in the scene panel (presentation)

  function target(p) { return p && p.target === 'bank' ? 'bank' : 'store'; }
  function col(key) { return SR.art.draw.color(key); }

  /** The round in progress (the frame's instance; its peek() is the engine's introspection). */
  function peek() {
    var cur = SR.minigame && typeof SR.minigame.current === 'function' ? SR.minigame.current() : null;
    if (!cur || !cur.inst || typeof cur.inst.peek !== 'function') return null;
    try { return cur.inst.peek(); } catch (e) { return null; }
  }

  SR.def.skin('holdup', {
    engine: 'duel',
    stake: true,
    /** Run params: the opponent and the situations of the target (crime.holdupParams brings the rest). */
    params: function (state, run) {
      var tg = target(run), w = WHO[tg], lines = [];
      for (var i = 1; i <= BEATS; i++) lines.push('mg.holdup.' + tg + '.' + i);
      return { opponent: { name: w.name, portrait: w.portrait }, situations: lines };
    },
    text: { title: 'mg.holdup.title' },
    art: {
      /** A wash of the building's wall colour behind the scene panel. */
      backdrop: function (ctx, w, h, host) {
        var tg = target(host && host.params), c = WHO[tg];
        ctx.save();
        ctx.fillStyle = col(c.wall);
        ctx.fillRect(24, 56, 372, 480);
        ctx.lineWidth = 2;
        ctx.strokeStyle = col('inkLine');
        ctx.strokeRect(24, 56, 372, 480);
        ctx.restore();
      },
      /**
       * The opponent behind the counter: calm while you choose, hands up after a beat you won, on
       * the alarm after one you lost; the name under the counter. @returns {boolean} true (drawn)
       */
      scene: function (ctx, x, y, w, h, host) {
        var tg = target(host && host.params), c = WHO[tg], t = host ? host.t : 0;
        var p = peek(), last = p && p.last, clip = 'idle', mood = 'worried';
        if (last) { clip = last.ok ? 'cheer' : 'shock'; mood = last.ok ? 'surprised' : 'angry'; }   // hands up / reaching for the alarm
        var cx = x + w / 2, top = y + h - 190;   // the counter top; the name goes under the counter
        if (SR.art.stick && typeof SR.art.stick.draw === 'function') {
          SR.art.stick.draw(ctx, clip, { view: 'side', x: cx, y: top + 104, scale: STICK_SCALE, look: c.portrait, facing: 'left', mood: mood, t: t });
        }
        // the counter
        ctx.save();
        ctx.fillStyle = col(c.counter);
        ctx.fillRect(x + 10, top, w - 20, 110);
        ctx.fillStyle = col(c.trim);
        ctx.fillRect(x + 4, top - 14, w - 8, 16);
        ctx.lineWidth = 3;
        ctx.strokeStyle = col('inkLine');
        ctx.strokeRect(x + 10, top, w - 20, 110);
        ctx.strokeRect(x + 4, top - 14, w - 8, 16);
        // the till on the counter, drawer open once the beats go your way
        var tx = x + w - 96, ty = top - 58;
        ctx.fillStyle = col('kit.metalDark');
        ctx.fillRect(tx, ty + 18, 72, 26);
        ctx.strokeRect(tx, ty + 18, 72, 26);
        ctx.fillStyle = col('kit.screen');
        ctx.fillRect(tx + 12, ty, 48, 18);
        ctx.strokeRect(tx + 12, ty, 48, 18);
        ctx.fillStyle = col('kit.screenGlow');
        ctx.fillRect(tx + 18, ty + 5, 36, 7);
        if (last && last.ok) {
          ctx.fillStyle = col('kit.metal');
          ctx.fillRect(tx - 6, ty + 44, 84, 12);
          ctx.strokeRect(tx - 6, ty + 44, 84, 12);
          ctx.fillStyle = col('fx.coin');
          for (var i = 0; i < 4; i++) ctx.fillRect(tx + 2 + i * 18, ty + 46, 12, 8);
        }
        ctx.restore();
        if (last && last.ok) {
          SR.art.draw.text(ctx, SR.text('mg.holdup.hands'), cx, y + 40, { size: 26, weight: 900, role: 'display', align: 'center', color: 'ui.danger-ink', outline: 3, outlineColor: 'white' });
        }
        SR.art.draw.text(ctx, SR.text(c.name), cx, top + 150, { size: 22, weight: 900, role: 'display', align: 'center', color: 'ui.ink-900', maxWidth: w - 20 });
        return true;
      },
    },
  });
})();
