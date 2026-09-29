// js/minigames/scratch.js — owner: W2-Food. The Scratch engine (GDD §4.13, §6.5; BALANCE B-14e;
// P1 `shopsPlus`): a card with 3 panels to scratch by dragging, or Space / A for the next panel.
// The prize is drawn before you scratch (W2-RulesC's casino.scratch draws one roll of 1..10,000 when
// the row runs and keeps it as the card in progress; the run params bring { roll, pay, tier,
// panels }), so scratching only reveals it: three matching symbols show a win ($10,000, $100 or
// $10), a losing card never matches. The row's :resolve pays the card (casino.scratchResolve).
// Without a drawn prize (a sheet, the simulator) the engine draws one itself with the rules stream
// through SR.rules.casino.scratch. Result { net } = prize - price, like the other casino games
// (CONTRACT §13; an echo: the card in progress decides the pay). Auto scratches all panels
// (ARCHITECTURE §10).
// Cosmetics (the losing symbols, the scratch flecks) use the fx stream.
(function () {
  'use strict';
  var SR = window.SR;

  // Layout in play-area units (1280 × 576) and presentation constants (not balance, CONTRACT D49).
  var CARD = { x: 250, y: 40, w: 780, h: 480 };
  var PANEL = { y: 206, w: 200, h: 200, gap: 40 };
  var GRID = 10;                 // scratch cells per panel side
  var REVEAL_AT = 0.6;           // a panel reveals itself once 60 % of its cells are scratched
  var BRUSH = 30;                // the scratch radius, play-area units
  var HOLD = 1.2;                // s the result stays before the round ends (any press skips)
  var WIN_SYMBOL = { 3: 'big', 2: 'mid', 1: 'small' };           // prize tier → symbol (tier 3 = the top prize)
  var LOSE_SYMBOLS = ['big', 'mid', 'small', 'cloud', 'star', 'crane'];

  function price() { return SR.tuning.casino.scratch.price; }
  function col(key) { return SR.art.draw.color(key); }

  /**
   * The drawn prize of a run: from the params when the row drew it (a missing tier is derived from
   * the pay, so a $10,000 card always rings the jackpot), else one draw from rng.
   */
  function prize(params, rng) {
    if (params && typeof params.pay === 'number') return { pay: params.pay, tier: params.tier || tierOf(params.pay), roll: params.roll || 0 };
    var C = SR.rules && SR.rules.casino;
    if (C && typeof C.scratch === 'function') return C.scratch(rng || SR.rng.rules);
    return { pay: 0, tier: 0, roll: 0 };
  }

  /** @returns {number} the tier of a pay (3 top ... 1 bottom, 0 nothing) from B-14e's prize list. */
  function tierOf(pay) {
    var list = SR.tuning.casino.scratch.prizes, tier = 0;
    list.forEach(function (p, i) { if (pay > 0 && pay === p.pay) tier = list.length - i; });
    return tier;
  }

  /** @returns {number} the prize a win symbol stands for (B-14e's list, top prize first), or 0. */
  function payOfSymbol(sym) {
    var list = SR.tuning.casino.scratch.prizes;
    for (var t in WIN_SYMBOL) {
      if (WIN_SYMBOL[t] === sym) { var p = list[list.length - Number(t)]; return p ? p.pay : 0; }
    }
    return 0;
  }

  /** The three symbols: a win shows its prize three times; a loss never three alike (fx stream). */
  function symbols(pr, fx, n) {
    var t = pr.tier || tierOf(pr.pay);
    var out = [], i;
    if (pr.pay > 0 && WIN_SYMBOL[t]) { for (i = 0; i < n; i++) out.push(WIN_SYMBOL[t]); return out; }
    for (i = 0; i < n; i++) out.push(LOSE_SYMBOLS[fx.int(0, LOSE_SYMBOLS.length - 1)]);
    if (n > 1 && out.every(function (s) { return s === out[0]; })) {
      out[n - 1] = LOSE_SYMBOLS[(LOSE_SYMBOLS.indexOf(out[0]) + 1 + fx.int(0, LOSE_SYMBOLS.length - 2)) % LOSE_SYMBOLS.length];
    }
    return out;
  }

  function result(pr) { return { net: pr.pay - price() }; }

  function create(host, params) {
    var n = Math.max(1, Math.min(3, (params && params.panels) || 3));
    var pr = prize(params, host.rng);
    var syms = symbols(pr, host.fx, n);
    var T = host.text;
    var panels = [];
    for (var i = 0; i < n; i++) {
      var x = CARD.x + (CARD.w - (n * PANEL.w + (n - 1) * PANEL.gap)) / 2 + i * (PANEL.w + PANEL.gap);
      panels.push({ x: x, y: PANEL.y, cells: new Array(GRID * GRID).fill(false), scratched: 0, revealed: false, flecks: [] });
    }
    var st = { done: false, hold: 0, down: false };

    // A prize symbol reads its B-14e amount from the tuning; the others their name.
    function symbolText(k) {
      var pay = payOfSymbol(syms[k]);
      return pay > 0 ? T('mg.scratch.sym.prize', { money: SR.text.money(pay) }) : T('mg.scratch.sym.' + syms[k]);
    }
    function left() { return panels.filter(function (p) { return !p.revealed; }).length; }
    function status() {
      host.label('status', left() ? T('mg.scratch.left', { n: left() }) : T('mg.scratch.done'));
      host.label('panels', panels.map(function (p, k) { return p.revealed ? T('mg.scratch.panel', { n: k + 1, symbol: symbolText(k) }) : ''; }).join(' '));
    }

    function reveal(k, quiet) {
      var p = panels[k];
      if (!p || p.revealed) return;
      p.revealed = true;
      for (var c = 0; c < p.cells.length; c++) p.cells[c] = true;
      if (!quiet) {
        host.audio.sfx('mg_item');
        host.aria(T('mg.scratch.panel', { n: k + 1, symbol: symbolText(k) }));
      }
      status();
      if (!left()) settle(quiet);
    }

    function settle(quiet) {
      if (st.done) return;
      st.done = true;
      st.hold = HOLD;
      var win = pr.pay > 0;
      if (!quiet) {
        host.audio.sfx(win ? (pr.tier >= 3 ? 'jackpot_bells' : 'coin') : 'mg_miss');
        if (win && host.haptic) host.haptic();
      }
      host.aria(win ? T('mg.scratch.win', { money: SR.text.money(pr.pay) }) : T('mg.scratch.lose'));
    }

    function next() {
      for (var k = 0; k < n; k++) if (!panels[k].revealed) { reveal(k); return; }
    }

    function scratchAt(x, y) {
      panels.forEach(function (p, k) {
        if (p.revealed) return;
        if (x < p.x - BRUSH || x > p.x + PANEL.w + BRUSH || y < p.y - BRUSH || y > p.y + PANEL.h + BRUSH) return;
        var cw = PANEL.w / GRID, ch = PANEL.h / GRID, hit = false;
        for (var r = 0; r < GRID; r++) {
          for (var c = 0; c < GRID; c++) {
            var cx = p.x + (c + 0.5) * cw, cy = p.y + (r + 0.5) * ch;
            if ((cx - x) * (cx - x) + (cy - y) * (cy - y) <= BRUSH * BRUSH && !p.cells[r * GRID + c]) {
              p.cells[r * GRID + c] = true;
              p.scratched++;
              hit = true;
            }
          }
        }
        if (hit) {
          if (p.flecks.length < 24) p.flecks.push({ x: x + host.fx.float(-12, 12), y: y + host.fx.float(-12, 12), t: 0 });
          if (p.scratched >= REVEAL_AT * GRID * GRID) reveal(k);
        }
      });
    }

    function finish() { host.finish(result(pr)); }

    host.hints([
      { action: 'scratch', label: 'mg.scratch.hint.scratch', only: 'kb' },
      { range: ['panel1', 'panel' + n], label: 'mg.scratch.hint.panel', only: 'kb' },
      { label: 'mg.scratch.hint.drag', only: 'kb' },
      { action: 'confirm', label: 'mg.scratch.hint.scratch', only: 'pad' },
      { label: 'mg.scratch.hint.drag', only: 'touch' },
    ]);
    host.label('info', T('mg.scratch.rule'));
    status();

    // ---- drawing ------------------------------------------------------------------------------
    function drawSymbol(ctx, k, cx, cy) {
      var s = syms[k];
      ctx.save();
      ctx.translate(cx, cy);
      ctx.lineWidth = 4; ctx.strokeStyle = col('inkLine'); ctx.lineJoin = 'round';
      if (s === 'big' || s === 'mid' || s === 'small') {
        var r = s === 'big' ? 62 : s === 'mid' ? 52 : 44;
        ctx.beginPath(); ctx.arc(0, -8, r, 0, Math.PI * 2);
        ctx.fillStyle = col(s === 'big' ? 'fx.coinHi' : s === 'mid' ? 'fx.coin' : 'fx.coinShade'); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, -8, r - 9, 0, Math.PI * 2); ctx.lineWidth = 2; ctx.stroke();
        SR.art.draw.text(ctx, '$', 0, 10, { size: r * 1.1, weight: 900, role: 'display', align: 'center', color: 'fx.coinShade', outline: 1.5, outlineColor: 'inkLine' });
      } else if (s === 'cloud') {
        // stroke the three puffs wide, then fill them: only the outline of their union stays inked
        ctx.beginPath();
        [[-30, 0, 26], [0, -16, 32], [30, 0, 26]].forEach(function (c) { ctx.moveTo(c[0] + c[2], c[1]); ctx.arc(c[0], c[1], c[2], 0, Math.PI * 2); });
        ctx.lineWidth = 8; ctx.stroke();
        ctx.fillStyle = col('weather.cloudy'); ctx.fill();
      } else if (s === 'star') {
        ctx.beginPath();
        for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 22 : 52; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr - 8); }
        ctx.closePath(); ctx.fillStyle = col('fx.star'); ctx.fill(); ctx.stroke();
      } else {
        // a paper crane: two wings, the neck and the tail
        ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(-40, -44); ctx.lineTo(10, -6); ctx.lineTo(40, -44); ctx.lineTo(18, 4); ctx.closePath();
        ctx.fillStyle = col('kit.slushB'); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(-58, -14); ctx.lineTo(-52, -8); ctx.lineTo(-4, 14); ctx.lineTo(18, 4); ctx.lineTo(56, -20); ctx.lineTo(24, 16); ctx.closePath();
        ctx.fillStyle = col('kit.paper'); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
      SR.art.draw.text(ctx, symbolText(k), cx, cy + 82, { size: 22, weight: 900, role: 'display', align: 'center', color: 'ui.ink-900', maxWidth: PANEL.w - 16 });
    }

    function drawCover(ctx, p) {
      var cw = PANEL.w / GRID, ch = PANEL.h / GRID;
      ctx.fillStyle = col('acc.silver');
      for (var r = 0; r < GRID; r++) {
        for (var c = 0; c < GRID; c++) {
          if (!p.cells[r * GRID + c]) ctx.fillRect(p.x + c * cw - 0.5, p.y + r * ch - 0.5, cw + 1, ch + 1);
        }
      }
      if (!p.scratched && !p.revealed) {
        SR.art.draw.text(ctx, '?', p.x + PANEL.w / 2, p.y + PANEL.h / 2 + 22, { size: 72, weight: 900, role: 'display', align: 'center', color: 'acc.grey' });
      }
      ctx.fillStyle = col('acc.grey');
      p.flecks.forEach(function (f) { ctx.fillRect(f.x, f.y, 4, 3); });
    }

    return {
      update: function (dt) {
        panels.forEach(function (p) { p.flecks.forEach(function (f) { f.t += dt; f.y += dt * 90; }); p.flecks = p.flecks.filter(function (f) { return f.t < 0.6; }); });
        if (st.done) { st.hold -= dt; if (st.hold <= 0) finish(); }
      },
      onAction: function (a, ev) {
        if (ev && ev.repeat) return;
        if (st.done) { if (a === 'confirm' || a === 'scratch') finish(); return; }
        var m = /^panel(\d)$/.exec(a);
        if (m) { reveal(+m[1] - 1); return; }
        if (a === 'scratch' || a === 'confirm') next();
      },
      pointer: function (kind, x, y) {
        if (kind === 'down') { if (st.done) { finish(); return; } st.down = true; scratchAt(x, y); return; }
        if (kind === 'move' && st.down) { scratchAt(x, y); return; }
        if (kind === 'up') st.down = false;
      },
      auto: function () {
        for (var k = 0; k < n; k++) reveal(k, true);
        var r = result(pr);
        r.auto = true;
        return r;
      },
      replay: function () {},
      progress: function () { return { revealed: panels.map(function (p) { return p.revealed; }) }; },
      peek: function () {
        return { symbols: syms.slice(), pay: pr.pay, tier: pr.tier, done: st.done, left: left(),
          revealed: panels.map(function (p) { return p.revealed; }), scratched: panels.map(function (p) { return p.scratched; }),
          panels: panels.map(function (p) { return { x: p.x, y: p.y, w: PANEL.w, h: PANEL.h }; }) };
      },
      destroy: function () {},
      render: function (ctx) {
        ctx.save();
        // the table and the card
        ctx.fillStyle = col('kit.felt');
        ctx.fillRect(0, 0, 1280, 576);
        ctx.fillStyle = col('kit.paper');
        ctx.fillRect(CARD.x, CARD.y, CARD.w, CARD.h);
        ctx.fillStyle = col('bld.store.walls');
        ctx.fillRect(CARD.x, CARD.y, CARD.w, 110);
        ctx.lineWidth = 4; ctx.strokeStyle = col('inkLine');
        ctx.strokeRect(CARD.x, CARD.y, CARD.w, CARD.h);
        SR.art.draw.text(ctx, T('mg.scratch.card'), CARD.x + CARD.w / 2, CARD.y + 72, { size: 52, weight: 900, role: 'display', align: 'center', color: 'ui.ink-900', outline: 2, outlineColor: 'white' });
        SR.art.draw.text(ctx, T('mg.scratch.rule'), CARD.x + CARD.w / 2, CARD.y + 146, { size: 22, weight: 700, role: 'ui', align: 'center', color: 'ui.ink-700' });
        panels.forEach(function (p, k) {
          ctx.fillStyle = col('kit.paper');
          ctx.fillRect(p.x, p.y, PANEL.w, PANEL.h);
          drawSymbol(ctx, k, p.x + PANEL.w / 2, p.y + PANEL.h / 2 - 16);
          drawCover(ctx, p);
          ctx.lineWidth = 3; ctx.strokeStyle = col('inkLine');
          ctx.strokeRect(p.x, p.y, PANEL.w, PANEL.h);
        });
        if (st.done) {
          var win = pr.pay > 0;
          SR.art.draw.text(ctx, win ? T('mg.scratch.win', { money: SR.text.money(pr.pay) }) : T('mg.scratch.lose'), CARD.x + CARD.w / 2, CARD.y + CARD.h - 22,
            { size: 30, weight: 900, role: 'display', align: 'center', color: win ? 'ui.money-ink' : 'ui.ink-700' });
        }
        ctx.restore();
      },
    };
  }

  SR.minigame.register('scratch', {
    title: 'mg.scratch.title',
    music: 'tick_tock_trouble',
    keys: { scratch: ['Space'], panel1: ['Digit1', 'Numpad1'], panel2: ['Digit2', 'Numpad2'], panel3: ['Digit3', 'Numpad3'] },
    assist: false,
    /** @returns {object} the interactive card (ARCHITECTURE §10 instance). */
    create: create,
    /** @returns {{net: number, auto: boolean}} the card's result: its drawn prize, or one draw from rng. */
    auto: function (state, params, rng) {
      var r = result(prize(params, rng));
      r.auto = true;
      return r;
    },
    /** @returns {{net: number}} leaving early still reveals the drawn prize (the resolve pays the card in progress). */
    forfeit: function (params) { var r = result(prize(params, SR.rng.rules)); r.exited = true; return r; },
    /** @returns {{net: number}} a card that pays nothing (the Hardcore hook's worst case). */
    worst: function () { return { net: -price() }; },
    /** @returns {string} the result banner's line. */
    summary: function (r, text) { return text('mg.scratch.summary', { money: SR.text.money((+r.net || 0) + price()) }); },
    // pure pieces for tests
    symbols: symbols,
    tierOf: tierOf,
    payOfSymbol: payOfSymbol,
  });
})();
