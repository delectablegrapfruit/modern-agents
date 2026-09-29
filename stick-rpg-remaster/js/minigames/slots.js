// js/minigames/slots.js — owner: W2-Night. The Slots engine "Paper Jackpot" (GDD §4.13, §6.5;
// BALANCE B-14a; UI §5.8): three 20-stop reels behind one pay line, the published pay table
// (SR.rules.casino.slots.pays: Casino Levy and Casino Night change a line), bets of $5 / $25 / $100
// ($500 at VIP Silver, P1).
// Every pull is a round the rules decide and apply at once: SR.act('casino.slots.pull:resolve',
// { bet }) (casino.slotsSpin: the three stops from the rules stream, the payout, karma -1 up to -10 a
// day, the `gamble` event with reels, stops, line and mult). The reels spin blind for a moment, the
// pull is committed ~1 s in (so the cash on the frame never gives the result away), then the reels
// stop at 1.2 / 1.6 / 2.0 s on the rules' stops. Pressing Spin again stops them early. Nothing is
// ever decided by the animation.
// Auto: 10 pulls at the current bet (B-14a autoSpins), each applied like a played one. Session
// result: { net, rounds, wagered } (casino.slots:resolve has nothing left to pay; a sampled Auto
// without the frame carries `apply: true` for casino.settle). Input: the `slots` context (spin:
// Space / A, bet1-bet4: 1-4), confirm also spins; the pointer: the lever, the Spin, bet and Cash out
// buttons; holding Spin (Space / A) pulls again after each pull settles (UI §5.8 "A (hold)
// auto-spin"). A refused pull's reason shows under the reels. Accessible state:
// host.label('slots', ...) and #aria per pull ("Line: BAR BAR BAR. Pays $200.").
(function () {
  'use strict';
  var SR = window.SR;

  // Presentation constants (UI §5.8: 3 reels 120 × 300; GDD §6.5: stops at 1.2 / 1.6 / 2.0 s).
  var REEL = { x: 452, y: 110, w: 120, h: 300, gap: 12 };
  var CELL = 100;                      // px per symbol on a reel
  var LINE_Y = REEL.y + REEL.h / 2;
  var STOPS_S = [1.2, 1.6, 2.0];
  var COMMIT_S = 1.0;                  // s into the spin when the pull is committed
  var EARLY_S = 0.14;                  // s between reels when stopped early
  var SPEED = 16;                      // symbols per second while spinning blind
  var LEVER = { x: 882, y: 150, w: 40, h: 190 };
  var ERR_S = 1.2;                     // s a refused pull's reason stays under the reels
  var HOLD_S = 0.5;                    // s between pulls while Spin is held (UI §5.8: A (hold) auto-spin)

  function C() { return SR.tuning.casino.slots; }
  function S() { return SR.rules.casino.slots; }
  function fast() { try { return !!(SR.debug && typeof SR.debug.fast === 'function' && SR.debug.fast() === true); } catch (e) { return false; } }
  function pal(k) { return SR.art && SR.art.draw ? SR.art.draw.color(k) : ''; }
  function money(n) { return SR.text.money(n); }
  function mod(a, n) { return ((a % n) + n) % n; }
  function live() { return SR.state; }
  /** Flash reduction (UI §7): the pay line and the marquee bulbs hold steady instead of blinking. */
  function steady() { var L = SR.render && SR.render.lib; try { return !!(L && typeof L.flashReduction === 'function' && L.flashReduction()); } catch (e) { return false; } }

  /** The bets on offer now (VIP Silver adds $500, P1). */
  function betsFor(state) {
    try { return SR.rules.casino.vip(state).slotBets.slice(); } catch (e) { return C().bets.slice(); }
  }

  /** Draws a reel symbol centred at (x, y) in a cell about 100 px tall. */
  function symbol(ctx, host, sym, x, y, s) {
    s = s || 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = pal('inkLine');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    switch (sym) {
      case 'dollar':
        ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.fillStyle = pal('acc.green'); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, 27, 0, Math.PI * 2); ctx.lineWidth = 2; ctx.strokeStyle = pal('kit.gold'); ctx.stroke();
        ctx.font = host.font(40, 900, true); ctx.fillStyle = pal('kit.paper'); ctx.fillText('$', 0, 2);
        break;
      case 'seven':
        ctx.font = host.font(72, 900, true);
        ctx.lineWidth = 6; ctx.strokeText('7', 0, 4);
        ctx.fillStyle = pal('kit.red'); ctx.fillText('7', 0, 4);
        break;
      case 'bar':
        SR.art.draw.roundRect(ctx, -42, -20, 84, 40, 8); ctx.fillStyle = pal('acc.black'); ctx.fill(); ctx.stroke();
        ctx.font = host.font(24, 900, true); ctx.fillStyle = pal('kit.paper'); ctx.fillText(host.text('mg.slots.sym.bar'), 0, 2);
        break;
      case 'bell':
        ctx.beginPath();
        ctx.moveTo(-28, 20); ctx.quadraticCurveTo(-26, -30, 0, -30); ctx.quadraticCurveTo(26, -30, 28, 20); ctx.closePath();
        ctx.fillStyle = pal('kit.gold'); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 24, 7, 0, Math.PI * 2); ctx.fillStyle = pal('kit.brass'); ctx.fill(); ctx.stroke();
        ctx.fillRect(-32, 16, 64, 6); ctx.strokeRect(-32, 16, 64, 6);
        break;
      case 'cherry':
        ctx.beginPath(); ctx.moveTo(-14, 8); ctx.quadraticCurveTo(-6, -24, 10, -30); ctx.moveTo(16, 12); ctx.quadraticCurveTo(14, -12, 10, -30);
        ctx.strokeStyle = pal('acc.green'); ctx.lineWidth = 4; ctx.stroke();
        ctx.strokeStyle = pal('inkLine'); ctx.lineWidth = 3;
        [[-16, 16], [16, 20]].forEach(function (c) { ctx.beginPath(); ctx.arc(c[0], c[1], 15, 0, Math.PI * 2); ctx.fillStyle = pal('kit.red'); ctx.fill(); ctx.stroke(); });
        break;
      default:   // blank: a faint paper crease
        ctx.strokeStyle = pal('kit.metal'); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-24, 0); ctx.lineTo(24, 0); ctx.stroke();
    }
    ctx.restore();
  }

  function create(host, params) {
    var T = host.text;
    var strip = S().strip(), N = strip.length;
    var bets = betsFor(live() || host.state);
    var bet = bets.indexOf(params && params.bet) >= 0 ? params.bet : bets[0];
    var pos = [host.fx.int(0, N - 1), host.fx.int(0, N - 1), host.fx.int(0, N - 1)];
    var spin = null;        // { t, committed, reels: [{ p0, p1, t0, t1, stopped }], result, early }
    var last = null;        // the last settled pull { reels, line, mult, win, net }
    var session = { net: 0, rounds: 0, wagered: 0 };
    var flash = 0, replay = null, finished = false;
    var err = null;         // a refused pull's reason under the reels: { key, vars, t } (never the win flash)
    var holdT = 0, holdStop = false;   // Spin held down: the next pull after HOLD_S; a refusal stops it until released
    var reelSnd = null;                // the reels' ratchet: a looping sound (js/audio/sfx.js), held while they turn

    /** Stops the ratchet loop (the reels have stopped, Auto took over, or the table closed). */
    function stopReels() {
      if (reelSnd && typeof reelSnd.stop === 'function') { try { reelSnd.stop(); } catch (e) { /* audio is optional */ } }
      reelSnd = null;
    }

    // ---- DOM: bets, Spin, Cash out ---------------------------------------------------------------
    var side = host.el('div', { 'data-id': 'mg-slots-side', style: {
      position: 'absolute', left: '960px', top: '40px', width: '290px', display: 'flex', flexDirection: 'column', gap: '12px', pointerEvents: 'none' } });
    host.ui.appendChild(side);
    var betRow = host.el('div', { 'data-id': 'mg-slots-bets', role: 'group', 'aria-label': T('mg.slots.hintBet'), style: { display: 'flex', flexWrap: 'wrap', gap: '8px' } });
    side.appendChild(betRow);
    var spinBtn = host.button({ id: 'mg-slots-spin', label: T('mg.slots.spin'), variant: 'primary', width: '100%', onPress: function () { press(); } });
    spinBtn.style.height = '72px';
    spinBtn.style.justifyContent = 'center';
    spinBtn.style.fontSize = 'calc(24px * var(--ui-scale, 1))';
    side.appendChild(spinBtn);
    var cashBtn = host.button({ id: 'mg-slots-cashout', label: T('mg.slots.cashOut'), width: '100%', onPress: function () { cashOut(); } });
    cashBtn.style.justifyContent = 'center';
    side.appendChild(cashBtn);

    function renderBets() {
      while (betRow.firstChild) betRow.removeChild(betRow.firstChild);
      bets.forEach(function (b, i) {
        var on = b === bet;
        var el = host.button({ id: 'mg-slots-bet-' + b, label: money(b), badge: String(i + 1), aria: T('mg.slots.betAria', { money: money(b) }),
          onPress: function () { setBet(i); } });
        el.setAttribute('aria-pressed', on ? 'true' : 'false');
        el.style.background = on ? 'var(--primary-100)' : '';
        el.style.minWidth = '130px';
        betRow.appendChild(el);
      });
      spinBtn.querySelector('[data-part="label"]').textContent = T(spin ? 'mg.slots.stop' : 'mg.slots.spin');
    }

    function mirror() {
      host.label('status', T('mg.slots.status', { money: money(bet), n: session.rounds, net: SR.text.money(session.net, { sign: true }) }));
      if (last) host.label('slots', last.line ? T('mg.slots.lineAria', { reels: reelWords(last.reels), money: money(last.win) }) : T('mg.slots.noLine', { reels: reelWords(last.reels) }));
    }
    function reelWords(reels) { return reels.map(function (r) { return T('mg.slots.sym.' + r); }).join(' '); }

    function setBet(i) {
      if (spin || finished || i < 0 || i >= bets.length) return;
      bet = bets[i];
      host.audio.sfx('chips');
      host.aria(T('mg.slots.betAria', { money: money(bet) }));
      renderBets();
      mirror();
    }

    /** Spin, or stop the reels early while they turn. */
    function press() {
      if (finished || replay || !host.interactive()) return;
      if (spin) { stopEarly(); return; }
      var pv = SR.preview('casino.slots.pull:resolve', { bet: bet });
      if (!pv.ok) {
        host.audio.sfx('error');
        host.aria(T(pv.reason || 'reason.notNow', pv.vars || {}));
        err = { key: pv.reason || 'reason.notNow', vars: pv.vars || {}, t: ERR_S };
        holdStop = true;
        return;
      }
      err = null;
      spin = { t: 0, committed: false, reels: [0, 1, 2].map(function () { return { stopped: false }; }), result: null };
      last = null;
      stopReels();
      reelSnd = host.audio.sfx('reel_spin');
      host.aria(T('mg.slots.spinning'));
      renderBets();
      if (fast()) { commit(); spin.reels.forEach(function (r, i) { settleReel(i); }); done(); }
    }

    /** The pull is decided and applied by the rules; the reels are then steered onto its stops. */
    function commit() {
      if (!spin || spin.committed) return;
      spin.committed = true;
      var res = SR.act('casino.slots.pull:resolve', { bet: bet });
      var ev = res && res.ok ? (res.events || []).filter(function (e) { return e.name === 'gamble'; })[0] : null;
      if (!ev) {
        host.audio.sfx('error');
        host.aria(T(res && res.reason ? res.reason : 'reason.notNow', res && res.vars || {}));
        spin.failed = true;
        spin.reels.forEach(function (r, i) { settleAt(i, Math.round(pos[i]), spin.t + 0.2 + i * 0.1); });
        return;
      }
      var g = ev.payload;
      spin.result = { reels: g.reels, stops: g.stops, line: g.line, mult: g.mult, win: bet * g.mult, net: g.net };
      session.rounds += 1;
      session.net += g.net;
      session.wagered += bet;
      spin.reels.forEach(function (r, i) { settleAt(i, g.stops[i], Math.max(spin.t + 0.12 * (i + 1), STOPS_S[i])); });
    }

    /** Plans reel i to land exactly on `stop` at spin time t1 (an ease-out from its current speed). */
    function settleAt(i, stop, t1) {
      var r = spin.reels[i], T1 = Math.max(0.05, t1 - spin.t);
      var p0 = pos[i], dist = SPEED * T1 / 3;
      var land = p0 + dist;
      land += mod(stop - land, N);
      r.p0 = p0; r.p1 = land; r.t0 = spin.t; r.t1 = spin.t + T1; r.stop = stop;
    }

    function stopEarly() {
      if (!spin || spin.early) return;
      spin.early = true;
      if (!spin.committed) commit();
      if (!spin || spin.failed || !spin.result) return;
      var k = 0;
      spin.reels.forEach(function (r, i) {
        if (r.stopped) return;
        k++;
        settleAt(i, spin.result.stops[i], spin.t + EARLY_S * k);
      });
    }

    function settleReel(i) {
      var r = spin.reels[i];
      r.stopped = true;
      pos[i] = typeof r.stop === 'number' ? r.stop : mod(r.p1 !== undefined ? r.p1 : pos[i], N);
      host.audio.sfx('reel_stop', { pitch: 1 + i * 0.08 });
    }

    function done() {
      var sp = spin;
      spin = null;
      stopReels();
      renderBets();
      if (!sp || !sp.result) { mirror(); return; }
      last = sp.result;
      if (last.line) {
        flash = 1.2;
        if (last.line === 'dollar3') {
          host.audio.sfx('jackpot_bells');
          host.audio.stinger('jackpot');
          host.aria(T('mg.slots.jackpot') + '! ' + T('bark.lou.jackpot'));
        } else host.audio.sfx('slot_ding');
        if (host.haptic) host.haptic(30);
      }
      host.aria(last.line ? T('mg.slots.lineAria', { reels: reelWords(last.reels), money: money(last.win) }) : T('mg.slots.noLine', { reels: reelWords(last.reels) }));
      mirror();
    }

    function sessionResult() { return { net: session.net, rounds: session.rounds, wagered: session.wagered }; }

    function cashOut() {
      if (finished || spin || replay || !host.interactive()) return;
      finished = true;
      host.finish(sessionResult());
    }

    // ---- drawing ---------------------------------------------------------------------------------
    function drawPayTable(ctx) {
      var x = 30, y = 40, w = 380, h = 496;
      SR.art.draw.roundRect(ctx, x, y, w, h, 16);
      ctx.fillStyle = host.color('paper-0'); ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = host.color('ink-900'); ctx.stroke();
      ctx.font = host.font(20, 900, true); ctx.fillStyle = host.color('ink-900'); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(T('mg.slots.payTable').toUpperCase(), x + 20, y + 34);
      var pays = S().pays(live() || host.state);
      var rows = [['dollar', 'dollar', 'dollar', 'dollar3'], ['seven', 'seven', 'seven', 'seven3'], ['bar', 'bar', 'bar', 'bar3'],
        ['bell', 'bell', 'bell', 'bell3'], ['cherry', 'cherry', 'cherry', 'cherry3'], ['cherry', 'cherry', null, 'cherry2'], ['cherry', null, null, 'cherry1']];
      rows.forEach(function (r, i) {
        var yy = y + 80 + i * 62;
        var hot = last && last.line === r[3];
        if (hot) { ctx.fillStyle = host.color('money-100'); ctx.fillRect(x + 8, yy - 30, w - 16, 58); }
        for (var k = 0; k < 3; k++) {
          if (r[k]) symbol(ctx, host, r[k], x + 50 + k * 64, yy, 0.52);
          else { ctx.font = host.font(14, 700); ctx.fillStyle = host.color('ink-500'); ctx.textAlign = 'center'; ctx.fillText(T('mg.slots.anyThird'), x + 50 + k * 64, yy + 5); }
        }
        ctx.font = host.font(24, 900, true); ctx.fillStyle = host.color(hot ? 'money-ink' : 'ink-900'); ctx.textAlign = 'right';
        ctx.fillText(T('mg.slots.pays', { n: pays[r[3]] }), x + w - 24, yy + 8);
      });
      ctx.textAlign = 'left';
    }

    function drawCabinet(ctx) {
      var x0 = REEL.x - 30, w = REEL.w * 3 + REEL.gap * 2 + 60;
      SR.art.draw.roundRect(ctx, x0, 40, w, 440, 24);
      ctx.fillStyle = pal('bld.casino.walls'); ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = pal('inkLine'); ctx.stroke();
      // marquee with bulbs
      SR.art.draw.roundRect(ctx, x0 + 14, 50, w - 28, 50, 12);
      ctx.fillStyle = pal('bld.casino.roof'); ctx.fill(); ctx.stroke();
      ctx.font = host.font(26, 900, true); ctx.fillStyle = pal('kit.bulb'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(T('mg.slots.title').toUpperCase(), x0 + w / 2, 76);
      ctx.textBaseline = 'alphabetic';
      var tick = Math.floor(host.t * 6), still = steady();
      for (var b = 0; b < 16; b++) {
        var bx = x0 + 20 + b * (w - 40) / 15, lit = still ? b % 2 === 0 : (b + tick) % 3 === 0 || (flash > 0 && (b + tick) % 2 === 0);
        ctx.beginPath(); ctx.arc(bx, 440 + 20, 6, 0, Math.PI * 2);
        ctx.fillStyle = pal(lit ? 'kit.bulb' : 'bld.casino.shade'); ctx.fill(); ctx.lineWidth = 1.5; ctx.stroke();
      }
      // the reels
      for (var i = 0; i < 3; i++) {
        var rx = REEL.x + i * (REEL.w + REEL.gap);
        ctx.fillStyle = pal('kit.paper');
        ctx.fillRect(rx, REEL.y, REEL.w, REEL.h);
        ctx.save();
        ctx.beginPath(); ctx.rect(rx, REEL.y, REEL.w, REEL.h); ctx.clip();
        var p = pos[i], base = Math.floor(p);
        for (var k = -2; k <= 2; k++) {
          var j = base + k, yy = LINE_Y - (j - p) * CELL;
          symbol(ctx, host, strip[mod(j, N)], rx + REEL.w / 2, yy, 0.9);
        }
        // the reel's curvature: shade top and bottom
        ctx.fillStyle = pal('bld.casino.shade');
        ctx.globalAlpha = 0.35; ctx.fillRect(rx, REEL.y, REEL.w, 36); ctx.fillRect(rx, REEL.y + REEL.h - 36, REEL.w, 36);
        ctx.globalAlpha = 1;
        ctx.restore();
        ctx.lineWidth = 3; ctx.strokeStyle = pal('inkLine'); ctx.strokeRect(rx, REEL.y, REEL.w, REEL.h);
      }
      // the pay line
      var won = last && last.line && flash > 0 && (still || Math.floor(flash * 8) % 2 === 0);
      ctx.lineWidth = won ? 6 : 3;
      ctx.strokeStyle = won ? host.color('money') : host.color('danger');
      ctx.beginPath(); ctx.moveTo(REEL.x - 18, LINE_Y); ctx.lineTo(REEL.x + REEL.w * 3 + REEL.gap * 2 + 18, LINE_Y); ctx.stroke();
      // the lever
      var pull = spin ? Math.max(0, 1 - spin.t * 3) : 0;
      var ky = LEVER.y + pull * (LEVER.h - 30);
      ctx.fillStyle = pal('kit.metalDark'); ctx.fillRect(LEVER.x + 14, LEVER.y, 12, LEVER.h);
      ctx.strokeStyle = pal('inkLine'); ctx.lineWidth = 2; ctx.strokeRect(LEVER.x + 14, LEVER.y, 12, LEVER.h);
      ctx.beginPath(); ctx.arc(LEVER.x + 20, ky, 20, 0, Math.PI * 2); ctx.fillStyle = pal('kit.red'); ctx.fill(); ctx.lineWidth = 3; ctx.stroke();
      // the win readout
      ctx.font = host.font(30, 900, true); ctx.textAlign = 'center';
      var cx = REEL.x + (REEL.w * 3 + REEL.gap * 2) / 2;
      if (last && last.line) {
        ctx.fillStyle = pal(last.line === 'dollar3' ? 'kit.gold' : 'kit.paper');
        ctx.fillText(last.line === 'dollar3' ? T('mg.slots.jackpot') : T('mg.slots.win', { money: money(last.win) }), cx, 526);
      } else if (err && !spin) {
        ctx.fillStyle = pal('kit.paper');
        ctx.fillText(T(err.key, err.vars), cx, 526);
      }
      ctx.textAlign = 'left';
    }

    host.hints([
      { action: 'spin', label: 'mg.slots.hintSpin' },
      { range: ['bet1', 'bet' + bets.length], label: 'mg.slots.hintBet', only: 'kb' },
      { actions: ['left', 'right'], label: 'mg.slots.hintBet', only: 'pad' },
      { label: 'mg.slots.hintTap', only: 'touch' },
    ]);
    renderBets();
    mirror();
    host.aria(T('mg.slots.startAria', { money: money(bet), max: bets.length }));

    return {
      update: function (dt) {
        if (flash > 0) flash = Math.max(0, flash - dt);
        if (err && (err.t -= dt) <= 0) err = null;
        if (replay) {
          replay.t += dt;
          for (var q = 0; q < 3; q++) pos[q] = replay.t < replay.dur * (0.5 + q * 0.2) ? mod(pos[q] + SPEED * dt, N) : replay.stops[q];
          return;
        }
        if (!spin) {
          // UI §5.8 "A (hold) auto-spin": while Spin stays held, a pull follows each settled one;
          // every pull is still decided and applied by the rules, one at a time.
          var held = !!(SR.input && typeof SR.input.held === 'function' && SR.input.held('spin'));
          if (!held) { holdT = 0; holdStop = false; } else if (!holdStop && !finished && host.interactive()) {
            holdT += dt;
            if (holdT >= HOLD_S) { holdT = 0; press(); }
          }
          return;
        }
        holdT = 0;
        spin.t += dt;
        if (!spin.committed && spin.t >= COMMIT_S) commit();
        if (!spin) return;
        var all = true;
        spin.reels.forEach(function (r, i) {
          if (r.stopped) return;
          if (r.t1 === undefined) { pos[i] = mod(pos[i] + SPEED * dt, N); all = false; return; }
          var k = Math.min(1, (spin.t - r.t0) / Math.max(0.01, r.t1 - r.t0));
          pos[i] = r.p0 + (r.p1 - r.p0) * SR.util.easeOut(k);
          if (k >= 1) settleReel(i); else all = false;
        });
        if (all) done();
      },
      render: function (ctx) {
        ctx.fillStyle = pal('int.casino.wall');
        ctx.fillRect(0, 0, 1280, 576);
        drawPayTable(ctx);
        drawCabinet(ctx);
      },
      onAction: function (a, ev) {
        if (ev && ev.repeat) return;
        if (a === 'spin' || a === 'confirm') { press(); return; }
        if (a === 'left' || a === 'right') { setBet(bets.indexOf(bet) + (a === 'left' ? -1 : 1)); return; }   // the pad's bet
        var m = /^bet(\d)$/.exec(a);
        if (m) setBet(+m[1] - 1);
      },
      pointer: function (kind, x, y) {
        if (kind !== 'down') return;
        if (x >= LEVER.x - 10 && x <= LEVER.x + LEVER.w + 10 && y >= LEVER.y - 30 && y <= LEVER.y + LEVER.h) press();
      },
      /**
       * Auto-spin: 10 pulls at the current bet, each applied by the rules like a played one. When
       * not even the first pull can be made (the cash no longer covers the bet) nothing is played:
       * the refusal shows under the reels and the table stays open (null: the frame starts no
       * replay), so Auto never closes the table on a visit it did not play.
       */
      auto: function () {
        if (finished || replay) return null;
        var pv = SR.preview('casino.slots.pull:resolve', { bet: bet });
        if (!pv.ok && !(spin && spin.committed)) {
          host.audio.sfx('error');
          host.aria(T(pv.reason || 'reason.notNow', pv.vars || {}));
          err = { key: pv.reason || 'reason.notNow', vars: pv.vars || {}, t: ERR_S };
          return null;
        }
        stopReels();
        if (spin && !spin.committed) spin = null;              // an uncommitted spin never happened
        else if (spin) { spin.reels.forEach(function (r, i) { if (!r.stopped && r.p1 !== undefined) pos[i] = mod(r.p1, N); }); done(); }
        var n = C().autoSpins, lastG = null;
        for (var i = 0; i < n; i++) {
          var res = SR.act('casino.slots.pull:resolve', { bet: bet });
          var ev = res && res.ok ? (res.events || []).filter(function (e) { return e.name === 'gamble'; })[0] : null;
          if (!ev) break;
          lastG = ev.payload;
          session.rounds += 1;
          session.net += lastG.net;
          session.wagered += bet;
        }
        if (lastG) {
          last = { reels: lastG.reels, stops: lastG.stops, line: lastG.line, mult: lastG.mult, win: bet * lastG.mult, net: lastG.net };
          replay = { t: 0, dur: fast() ? 0.01 : 0.9, stops: lastG.stops.slice() };
          host.aria(last.line ? T('mg.slots.lineAria', { reels: reelWords(last.reels), money: money(last.win) }) : T('mg.slots.noLine', { reels: reelWords(last.reels) }));
        }
        finished = true;
        mirror();
        var r = sessionResult();
        r.auto = true;
        return r;
      },
      replay: function () { if (replay) replay.t = 0; },
      progress: function () { return sessionResult(); },
      peek: function () {
        return { bet: bet, bets: bets.slice(), pos: pos.slice(), spinning: !!spin, committed: !!(spin && spin.committed), last: last ? SR.util.clone(last) : null,
          session: sessionResult(), finished: finished, error: err ? err.key : null };
      },
      destroy: function () { stopReels(); },
    };
  }

  SR.minigame.register('slots', {
    title: 'mg.slots.title',
    music: 'high_roller_lounge',
    keys: { spin: ['Space', 'Pad0'], bet1: ['Digit1'], bet2: ['Digit2'], bet3: ['Digit3'], bet4: ['Digit4'] },
    assist: false,
    create: create,
    /**
     * A sampled Auto-spin without the frame (the simulator): up to 10 pulls at params.bet (default
     * the smallest bet) while the cash covers the bet; `apply: true` so casino.settle applies it.
     * @returns {object} { game, net, rounds, wagered, apply, auto }
     */
    auto: function (state, params, rng) {
      var bets = betsFor(state), bet = params && bets.indexOf(params.bet) >= 0 ? params.bet : bets[0];
      var cash = state && state.money ? state.money.cash : 0, table = S().pays(state);
      var out = { game: 'slots', net: 0, rounds: 0, wagered: 0, apply: true, auto: true };
      for (var i = 0; i < C().autoSpins && cash >= bet; i++) {
        var r = S().spin(rng, bet, table);
        cash += r.net;
        out.net += r.net;
        out.rounds += 1;
        out.wagered += bet;
      }
      return out;
    },
    /** @returns {object} nothing left to lose: every pull is applied when it is decided. */
    worst: function () { return { net: 0, rounds: 0, wagered: 0 }; },
    /** @returns {object} leaving keeps the session as played. */
    forfeit: function (params, progress) { var p = progress || {}; return { net: p.net || 0, rounds: p.rounds || 0, wagered: p.wagered || 0, exited: true }; },
    /** @returns {string} the banner line. */
    summary: function (r, text) {
      var n = Math.round(Number(r && r.net) || 0);
      return text(n > 0 ? 'mg.slots.up' : n < 0 ? 'mg.slots.down' : 'mg.slots.even', { money: SR.text.money(Math.abs(n)) });
    },
    symbol: symbol,
  });
})();
