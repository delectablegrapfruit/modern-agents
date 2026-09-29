// js/minigames/roulette.js — owner: W2-Night. The Roulette engine (GDD §4.13, §6.5; BALANCE B-14c;
// UI §5.8): the American wheel (38 pockets, 00 = pocket 37) and every bet type: straight 35:1,
// split 17, street 11, corner 8, six line 5, dozen and column 2, red / black, odd / even, 1-18 /
// 19-36 1:1; 0 and 00 lose every outside bet; table limit $2,000 a spin (orig; $10,000 at VIP
// Gold, P1). No Auto (ARCHITECTURE §10).
// Chips placed on the board are only promises until the spin: the spin is committed by the rules
// ~3 s into its 5 s roll (SR.act('casino.roulette.spin:resolve', { bets }): casino.rouletteSpin
// draws the pocket from the rules stream, takes and pays every bet, karma -1 up to -10 a day, the
// `gamble` event with the pocket and the winning bets), and the ball is then steered into that
// pocket; a spin can be skipped after 2 s. Bets stay on the table for the next spin; C clears them.
// Board: click a number (straight), an edge between two (split), a crossing of four (corner), the
// strip under a column (street) or between two columns (six line), the "2 to 1" boxes (columns),
// the dozens and the even-money boxes. Keyboard: the arrows move the active space across the same
// lattice, Enter places the chip, 1-4 pick $5 / $25 / $100 / $500, C clears, Space spins; pad: the
// D-pad moves, A places, Y changes the chip, LB clears, RB spins. Red pockets carry a hatch and
// black ones stay solid, so colour is never the only cue. Session result: { net, rounds, wagered }.
(function () {
  'use strict';
  var SR = window.SR;

  // Presentation constants (UI §5.8: the wheel left, r 180; the board right: a 3 × 12 grid plus
  // outside bets; chips 5 / 25 / 100 / 500; a 5 s spin, skippable after 2 s; the last 12 pockets).
  var WHEEL = { x: 216, y: 250, r: 180 };
  var ORDER = [0, 28, 9, 26, 30, 11, 7, 20, 32, 17, 5, 22, 34, 15, 3, 24, 36, 13, 1, 37, 27, 10, 25, 29, 12, 8, 19, 31, 18, 6, 21, 33, 16, 4, 23, 35, 14, 2];
  var G = { x: 494, y: 40, cw: 54, rh: 64, zx: 440 };      // the number grid (12 × 3) and the zeros column
  var STREET_H = 20, DOZ_H = 48, OUT_H = 48, COL_W = 54;
  var CHIP_COL = ['acc.red', 'acc.green', 'acc.black', 'acc.purple'];
  var SPIN_S = 5, SKIP_S = 2, COMMIT_S = 3.2, HISTORY = 12;
  var OUTSIDE = ['low', 'even', 'red', 'black', 'odd', 'high'];

  function RL() { return SR.rules.casino.roulette; }
  function fast() { try { return !!(SR.debug && typeof SR.debug.fast === 'function' && SR.debug.fast() === true); } catch (e) { return false; } }
  function pal(k) { return SR.art && SR.art.draw ? SR.art.draw.color(k) : ''; }
  function money(n) { return SR.text.money(n); }
  function live() { return SR.state; }
  function cash() { var s = live(); return s && s.money ? s.money.cash : 0; }
  function limit(state) { try { return SR.rules.casino.vip(state).rouletteLimit; } catch (e) { return SR.tuning.casino.roulette.limit; } }
  function label(p) { return p === 37 || p === '00' ? '00' : String(p); }
  function pocketNum(v) { return v === '00' ? 37 : v; }
  function isRed(p) { return RL().isRed(p); }

  /** The number at grid column c (0-11), row r (0 = top: 3, 6, ... 36; 2 = bottom: 1, 4, ... 34). */
  function num(c, r) { return c * 3 + (3 - r); }

  /**
   * The bet at a lattice spot (X -2..24, Y 0..7): numbers on even (X, Y), splits and corners on
   * the odd lines between them, the zeros at X -2 and their splits at X -1, streets and six lines
   * at Y 5, columns at X 24, dozens at Y 6, the even-money boxes at Y 7.
   * @returns {{type: string, n: (number|string|undefined), nums: (Array|undefined)}|null}
   */
  function spotAt(X, Y) {
    if (Y < 0 || Y > 7 || X < -2 || X > 24) return null;
    if (Y <= 4) {
      if (X === -2) return Y <= 1 ? { type: 'straight', n: '00' } : Y === 2 ? { type: 'split', nums: [0, '00'] } : { type: 'straight', n: 0 };
      if (X === -1) return [{ type: 'split', nums: ['00', 3] }, { type: 'split', nums: ['00', 2] }, null, { type: 'split', nums: [0, 2] }, { type: 'split', nums: [0, 1] }][Y];
      if (X === 23) return null;
      if (X === 24) return Y % 2 ? null : { type: 'column', n: 3 - Y / 2 };
      var c = Math.floor(X / 2), r = Math.floor(Y / 2);
      if (X % 2 === 0 && Y % 2 === 0) return { type: 'straight', n: num(c, r) };
      if (X % 2 === 1 && Y % 2 === 0) return c + 1 <= 11 ? { type: 'split', nums: [num(c, r), num(c + 1, r)] } : null;
      if (X % 2 === 0 && Y % 2 === 1) return r + 1 <= 2 ? { type: 'split', nums: [num(c, r + 1), num(c, r)] } : null;
      return c + 1 <= 11 && r + 1 <= 2 ? { type: 'corner', nums: [num(c, r + 1), num(c, r), num(c + 1, r + 1), num(c + 1, r)] } : null;
    }
    if (X < 0 || X > 23) return null;
    if (Y === 5) {
      var cc = Math.floor(X / 2);
      if (X % 2 === 0) return { type: 'street', nums: [3 * cc + 1, 3 * cc + 2, 3 * cc + 3] };
      return cc + 1 <= 11 ? { type: 'sixLine', nums: [3 * cc + 1, 3 * cc + 2, 3 * cc + 3, 3 * cc + 4, 3 * cc + 5, 3 * cc + 6] } : null;
    }
    if (Y === 6) return { type: 'dozen', n: Math.min(3, Math.floor(X / 8) + 1) };
    return { type: OUTSIDE[Math.min(5, Math.floor(X / 4))] };
  }

  /** @returns {string} a bet's canonical key (one pile of chips per key). */
  function keyOf(b) {
    if (b.nums) return b.type + ':' + b.nums.map(pocketNum).slice().sort(function (a, c) { return a - c; }).join(',');
    return b.type + ':' + (b.n === undefined ? '' : b.n);
  }

  /** @returns {{x: number, y: number}} where a spot's chips sit (play-area units). */
  function spotXY(X, Y) {
    var bottom = G.y + 3 * G.rh;
    if (Y <= 4 && X === -2) return { x: G.zx + (G.x - G.zx) / 2, y: Y <= 1 ? G.y + 48 : Y === 2 ? G.y + 1.5 * G.rh : G.y + 2.25 * G.rh };
    if (Y <= 4 && X === -1) return { x: G.x, y: [G.y + 32, G.y + 80, G.y + 96, G.y + 112, G.y + 160][Y] };
    if (Y <= 4 && X === 24) return { x: G.x + 12 * G.cw + COL_W / 2, y: G.y + (Y / 2 + 0.5) * G.rh };
    if (Y <= 4) return { x: G.x + (X + 1) / 2 * G.cw, y: G.y + (Y + 1) / 2 * G.rh };
    if (Y === 5) return { x: G.x + (X + 1) / 2 * G.cw, y: bottom + STREET_H / 2 };
    if (Y === 6) { var d = Math.min(2, Math.floor(X / 8)); return { x: G.x + (d + 0.5) * 4 * G.cw, y: bottom + STREET_H + DOZ_H / 2 }; }
    var k = Math.min(5, Math.floor(X / 4));
    return { x: G.x + (k + 0.5) * 2 * G.cw, y: bottom + STREET_H + DOZ_H + OUT_H / 2 };
  }

  /** @returns {{X: number, Y: number}|null} the lattice spot under a point of the board. */
  function hit(x, y) {
    var bottom = G.y + 3 * G.rh, right = G.x + 12 * G.cw;
    if (y < G.y || y > bottom + STREET_H + DOZ_H + OUT_H) return null;
    if (x >= G.zx && x < G.x - 8 && y <= bottom) {
      var mid = G.y + 1.5 * G.rh;
      return { X: -2, Y: Math.abs(y - mid) < 10 ? 2 : y < mid ? 0 : 4 };
    }
    if (x >= right && x <= right + COL_W && y <= bottom) return { X: 24, Y: 2 * Math.min(2, Math.floor((y - G.y) / G.rh)) };
    if (x < G.x - 8 || x > right) return null;
    var fx = (x - G.x) / G.cw, c = Math.max(0, Math.min(11, Math.floor(fx))), ex = fx - c;
    var X = 2 * c + (ex > 0.8 ? 1 : ex < 0.2 ? -1 : 0);
    if (X < -1) X = -1;
    if (X > 22) X = 22;
    if (y > bottom + STREET_H + DOZ_H) return { X: Math.max(0, 2 * c), Y: 7 };
    if (y > bottom + STREET_H) return { X: Math.max(0, 2 * c), Y: 6 };
    if (y > bottom) return { X: Math.max(0, X), Y: 5 };
    var fy = (y - G.y) / G.rh, r = Math.max(0, Math.min(2, Math.floor(fy))), ey = fy - r;
    var Y = 2 * r + (ey > 0.8 ? 1 : ey < 0.2 ? -1 : 0);
    Y = Math.max(0, Math.min(4, Y));
    if (X === -1) Y = Math.max(0, Math.min(4, Y === 2 ? (ey < 0.5 ? 1 : 3) : Y));
    return spotAt(X, Y) ? { X: X, Y: Y } : { X: Math.max(0, 2 * c), Y: 2 * r };
  }

  function create(host, params) {
    var T = host.text;
    var CHIPS = SR.tuning.casino.chips.slice(0, 4);   // $5 / $25 / $100 / $500 (GDD §6.5; keys 1-4)
    var lim = limit(live() || host.state);
    var chipI = 0, active = { X: 0, Y: 2 };
    var bets = {};                 // key -> { bet, amount, X, Y }
    var spin = null;               // { t, committed, result, rel0, relT, tc, wheel0, skip }
    var wheelA = 0, ballRel = 0, ballR = 1, wheelV = 0.6;
    var history = [], lastPocket = null, lastWins = [], session = { net: 0, rounds: 0, wagered: 0 };
    var finished = false, t = 0;
    var ballSnd = null;            // the ball rolling round the rim: a looping sound, held while it rolls

    /** Stops the rolling loop (the ball has settled, or the table closed). */
    function stopBall() {
      if (ballSnd && typeof ballSnd.stop === 'function') { try { ballSnd.stop(); } catch (e) { /* audio is optional */ } }
      ballSnd = null;
    }

    // ---- DOM -------------------------------------------------------------------------------------
    // Anchored at the bottom and allowed to wrap: at 150 % text (UI §8) the chips, Clear, Spin and
    // Cash out no longer fit one 824 px row, so the row grows upward into the free band under the
    // board (y 348-488) instead of pushing Cash out off the play area.
    var bar = host.el('div', { 'data-id': 'mg-roulette-controls', style: {
      position: 'absolute', left: '440px', bottom: '16px', width: '824px', display: 'flex', flexWrap: 'wrap', alignContent: 'flex-end',
      gap: '8px', pointerEvents: 'none' } });
    host.ui.appendChild(bar);

    function controls() {
      while (bar.firstChild) bar.removeChild(bar.firstChild);
      CHIPS.forEach(function (v, i) {
        var b = host.button({ id: 'mg-roulette-chip-' + (i + 1), label: money(v), badge: String(i + 1), aria: T('mg.roulette.chip', { money: money(v) }),
          onPress: function () { pickChip(i); } });
        b.setAttribute('aria-pressed', i === chipI ? 'true' : 'false');
        b.style.background = i === chipI ? 'var(--primary-100)' : '';
        b.style.height = '72px';
        bar.appendChild(b);
      });
      var clear = host.button({ id: 'mg-roulette-clear', label: T('mg.roulette.clear'), badge: 'C', onPress: function () { clearBets(); } });
      clear.style.height = '72px';
      bar.appendChild(clear);
      var sp = host.button({ id: 'mg-roulette-spin', label: T('mg.roulette.spin'), variant: 'primary', onPress: function () { spinOrSkip(); } });
      sp.style.height = '72px'; sp.style.flex = '1 1 0'; sp.style.justifyContent = 'center';
      bar.appendChild(sp);
      var co = host.button({ id: 'mg-roulette-cashout', label: T('mg.roulette.cashOut'), onPress: function () { cashOut(); } });
      co.style.height = '72px';
      bar.appendChild(co);
      [clear, co].forEach(function (b) {
        if (!spin) return;
        // disabled the design system's way (UI §2.3): ink-500 on paper-2, never faded by opacity
        b.setAttribute('aria-disabled', 'true');
        b.style.background = 'var(--paper-2)'; b.style.color = 'var(--ink-500)'; b.style.boxShadow = 'none'; b.setAttribute('data-shadow', 'none');
      });
    }

    function total() { var s = 0; Object.keys(bets).forEach(function (k) { s += bets[k].amount; }); return s; }
    function betName(b) {
      var t2 = 'mg.roulette.bet.' + b.type;
      if (b.nums) return T(t2, { nums: b.nums.map(label).join('-') });
      return T(t2, { n: b.n === undefined ? '' : label(b.n) });
    }
    function paysOf(b) { return SR.tuning.casino.roulette.pays[b.type]; }

    function mirror() {
      host.label('info', T('mg.roulette.total', { money: money(total()), limit: money(lim) }));
      host.label('status', T('mg.roulette.status', { n: session.rounds, net: SR.text.money(session.net, { sign: true }) }));
      var sb = spotAt(active.X, active.Y);
      if (sb) {
        var on = bets[keyOf(sb)];
        host.label('active', on ? T('mg.roulette.active', { bet: betName(sb), money: money(on.amount) }) : T('mg.roulette.activeEmpty', { bet: betName(sb), pays: paysOf(sb) }));
      }
    }
    function announceActive() {
      var sb = spotAt(active.X, active.Y);
      if (!sb) return;
      var on = bets[keyOf(sb)];
      host.aria(on ? T('mg.roulette.active', { bet: betName(sb), money: money(on.amount) }) : T('mg.roulette.activeEmpty', { bet: betName(sb), pays: paysOf(sb) }));
    }

    function pickChip(i) {
      if (i < 0 || i >= CHIPS.length) return;
      chipI = i;
      host.audio.sfx('chips');
      host.aria(T('mg.roulette.chip', { money: money(CHIPS[i]) }));
      controls();
    }

    function place(X, Y) {
      if (spin || finished || !host.interactive()) return;
      var b = spotAt(X, Y);
      if (!b) return;
      active = { X: X, Y: Y };
      var v = CHIPS[chipI], sum = total();
      if (sum + v > lim) { host.audio.sfx('error'); host.aria(T('mg.roulette.limit', { money: money(lim) })); mirror(); return; }
      if (sum + v > cash()) { host.audio.sfx('error'); host.aria(T('mg.roulette.short')); mirror(); return; }
      var k = keyOf(b);
      if (!bets[k]) bets[k] = { bet: b, amount: 0, X: X, Y: Y };
      bets[k].amount += v;
      host.audio.sfx('chips');
      host.aria(T('mg.roulette.placed', { money: money(v), bet: betName(b), total: money(total()) }));
      mirror();
    }

    function clearBets() {
      if (spin || finished) return;
      bets = {};
      host.audio.sfx('chips');
      host.aria(T('mg.roulette.cleared'));
      mirror();
    }

    function list() {
      return Object.keys(bets).map(function (k) {
        var b = bets[k].bet, o = { type: b.type, amount: bets[k].amount };
        if (b.nums) o.nums = b.nums.slice(); else if (b.n !== undefined) o.n = b.n;
        return o;
      });
    }

    function spinOrSkip() {
      if (finished || !host.interactive()) return;
      if (spin) { if (spin.t >= SKIP_S || fast()) skip(); return; }
      if (!total()) { host.audio.sfx('error'); host.aria(T('mg.roulette.noBets')); return; }
      var pv = SR.preview('casino.roulette.spin:resolve', { bets: list() });
      if (!pv.ok) { host.audio.sfx('error'); host.aria(T(pv.reason || 'reason.notNow', pv.vars || {})); return; }
      spin = { t: 0, committed: false, result: null, tc: 0, rel0: 0, relT: 0 };
      wheelV = 2.4;
      stopBall();
      ballSnd = host.audio.sfx('roulette_loop');   // ART_AUDIO §13: the ball loop, then its settle
      host.aria(T('mg.roulette.spinning'));
      controls();
      if (fast()) skip();
    }

    /** The rules decide and apply the spin; the ball is then steered into the pocket they drew. */
    function commit() {
      if (!spin || spin.committed) return;
      spin.committed = true;
      var res = SR.act('casino.roulette.spin:resolve', { bets: list() });
      var ev = res && res.ok ? (res.events || []).filter(function (e) { return e.name === 'gamble'; })[0] : null;
      if (!ev) {
        host.audio.sfx('error');
        host.aria(T(res && res.reason ? res.reason : 'reason.notNow', res && res.vars || {}));
        spin.failed = true;
        return;
      }
      var g = ev.payload, pocket = pocketNum(g.pocket);
      spin.result = { pocket: pocket, net: g.net, wagered: g.bet, wins: g.wins || [] };
      session.rounds += 1;
      session.net += g.net;
      session.wagered += g.bet;
      var idx = ORDER.indexOf(pocket), step = Math.PI * 2 / ORDER.length;
      var target = idx * step;
      spin.tc = spin.t;
      spin.rel0 = ballRel;
      var base = ballRel - ((ballRel % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      var relT = base + target;
      while (relT > ballRel - Math.PI * 2 * 1.5) relT -= Math.PI * 2;   // the ball runs against the wheel
      spin.relT = relT;
    }

    function skip() {
      if (!spin) return;
      if (!spin.committed) commit();
      if (!spin) return;
      spin.t = SPIN_S;
      finishSpin();
    }

    function finishSpin() {
      var sp = spin;
      spin = null;
      stopBall();
      wheelV = 0.6;
      if (sp && sp.result) {
        ballRel = sp.relT; ballR = 0;
        var p = sp.result.pocket;
        lastPocket = p;
        history.unshift(p);
        if (history.length > HISTORY) history.length = HISTORY;
        var keys = list();
        lastWins = (sp.result.wins || []).map(function (i) { return keys[i] ? keyOf(keys[i]) : null; }).filter(Boolean);
        var colour = T(p === 0 || p === 37 ? 'mg.roulette.green' : isRed(p) ? 'mg.roulette.red' : 'mg.roulette.black');
        var net = sp.result.net;
        host.aria(T(net > 0 ? 'mg.roulette.resultWin' : net < 0 ? 'mg.roulette.resultLose' : 'mg.roulette.resultEven',
          { colour: colour, n: label(p), money: money(Math.abs(net)) }));
        host.audio.sfx('roulette_settle');
        if (net > 0) host.audio.sfx('coin');
        if (net > 0 && host.haptic) host.haptic(30);
      }
      controls();
      mirror();
    }

    function sessionResult() { return { net: session.net, rounds: session.rounds, wagered: session.wagered }; }
    function cashOut() {
      if (finished || spin || !host.interactive()) return;
      finished = true;
      host.finish(sessionResult());
    }

    function move(dx, dy) {
      if (spin || finished) return;
      var X = active.X, Y = active.Y;
      if (dy) {
        Y += dy;
        if (Y < 0 || Y > 7) return;
        if (Y >= 5 && X < 0) X = 0;
        if (Y <= 4 && active.Y >= 6) X = Math.max(0, Math.min(22, X - (X % 2)));
        var tries = [X, X - 1, X + 1, X - 2, X + 2];
        for (var i = 0; i < tries.length; i++) if (spotAt(tries[i], Y)) { active = { X: tries[i], Y: Y }; announceActive(); mirror(); return; }
        return;
      }
      var cur = keyOf(spotAt(X, Y) || { type: '' });
      for (var n = 0; n < 30; n++) {
        X += dx;
        if (X < -2 || X > 24) return;
        var s2 = spotAt(X, Y);
        if (s2 && keyOf(s2) !== cur) { active = { X: X, Y: Y }; announceActive(); mirror(); return; }
      }
    }

    // ---- drawing ---------------------------------------------------------------------------------
    function hatch(ctx, x, y, w, h) {
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
      ctx.strokeStyle = pal('acc.crimson'); ctx.lineWidth = 3;
      ctx.beginPath();
      for (var k = -h; k < w; k += 12) { ctx.moveTo(x + k, y + h); ctx.lineTo(x + k + h, y); }
      ctx.stroke();
      ctx.restore();
    }

    function cell(ctx, x, y, w, h, fill, text, red, hi) {
      ctx.fillStyle = fill; ctx.fillRect(x, y, w, h);
      if (red) hatch(ctx, x, y, w, h);
      if (hi) { ctx.fillStyle = pal('kit.gold'); ctx.globalAlpha = 0.55; ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1; }
      ctx.lineWidth = 2; ctx.strokeStyle = pal('kit.paper'); ctx.strokeRect(x, y, w, h);
      if (text) {
        ctx.font = host.font(text.length > 3 ? 15 : 20, 900); ctx.fillStyle = pal('kit.paper'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 3; ctx.strokeStyle = pal('inkLine'); ctx.strokeText(text, x + w / 2, y + h / 2 + 1);
        ctx.fillText(text, x + w / 2, y + h / 2 + 1);
        ctx.textBaseline = 'alphabetic';
      }
    }

    function drawBoard(ctx) {
      var bottom = G.y + 3 * G.rh, right = G.x + 12 * G.cw;
      var win = lastPocket !== null && !spin ? lastPocket : null;
      // zeros
      cell(ctx, G.zx, G.y, G.x - G.zx, 1.5 * G.rh, pal('acc.green'), '00', false, win === 37);
      cell(ctx, G.zx, G.y + 1.5 * G.rh, G.x - G.zx, 1.5 * G.rh, pal('acc.green'), '0', false, win === 0);
      for (var c = 0; c < 12; c++) {
        for (var r = 0; r < 3; r++) {
          var n = num(c, r), red = isRed(n);
          cell(ctx, G.x + c * G.cw, G.y + r * G.rh, G.cw, G.rh, pal(red ? 'kit.red' : 'acc.black'), String(n), red, win === n);
        }
      }
      for (var cr = 0; cr < 3; cr++) cell(ctx, right, G.y + cr * G.rh, COL_W, G.rh, pal('kit.felt'), T('mg.roulette.twoToOne'), false, false);
      // the street strip, the dozens and the outside boxes
      ctx.fillStyle = pal('kit.felt'); ctx.fillRect(G.x, bottom, 12 * G.cw, STREET_H);
      ctx.strokeStyle = pal('kit.paper'); ctx.lineWidth = 1;
      for (var s = 0; s <= 12; s++) { ctx.beginPath(); ctx.moveTo(G.x + s * G.cw, bottom); ctx.lineTo(G.x + s * G.cw, bottom + 6); ctx.stroke(); }
      for (var d = 0; d < 3; d++) cell(ctx, G.x + d * 4 * G.cw, bottom + STREET_H, 4 * G.cw, DOZ_H, pal('kit.felt'), T('mg.roulette.dozen.' + (d + 1)), false, false);
      OUTSIDE.forEach(function (o, k) {
        var x = G.x + k * 2 * G.cw, y = bottom + STREET_H + DOZ_H;
        var fill = o === 'red' ? pal('kit.red') : o === 'black' ? pal('acc.black') : pal('kit.felt');
        cell(ctx, x, y, 2 * G.cw, OUT_H, fill, T('mg.roulette.bet.' + o), o === 'red', false);
      });
      // chips
      Object.keys(bets).forEach(function (k) {
        var b = bets[k], pt = spotXY(b.X, b.Y), won = lastWins.indexOf(k) >= 0 && !spin;
        drawChip(ctx, pt.x, pt.y, b.amount, won);
      });
      // the active space
      if (!spin && !finished && (host.device === 'kb' || host.device === 'pad')) {
        var ap = spotXY(active.X, active.Y);
        ctx.lineWidth = 4; ctx.strokeStyle = host.color('focus');
        ctx.beginPath(); ctx.arc(ap.x, ap.y, 20, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 2; ctx.strokeStyle = host.color('ink-900');
        ctx.beginPath(); ctx.arc(ap.x, ap.y, 24, 0, Math.PI * 2); ctx.stroke();
      }
    }

    function drawChip(ctx, x, y, amount, won) {
      var i = 0;
      for (var k = CHIPS.length - 1; k >= 0; k--) if (amount >= CHIPS[k]) { i = k; break; }
      ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2);
      ctx.fillStyle = pal(CHIP_COL[i]); ctx.fill();
      ctx.lineWidth = won ? 4 : 2; ctx.strokeStyle = won ? pal('kit.gold') : pal('kit.paper'); ctx.stroke();
      ctx.font = host.font(amount >= 1000 ? 10 : 12, 900); ctx.fillStyle = pal('kit.paper'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(amount >= 1000 ? T('mg.roulette.chipK', { n: (amount / 1000).toFixed(amount % 1000 ? 1 : 0) }) : String(amount), x, y + 1);
      ctx.textBaseline = 'alphabetic';
    }

    function drawWheel(ctx) {
      var W = WHEEL, step = Math.PI * 2 / ORDER.length;
      ctx.beginPath(); ctx.arc(W.x, W.y, W.r + 14, 0, Math.PI * 2); ctx.fillStyle = pal('kit.woodDark'); ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = pal('inkLine'); ctx.stroke();
      ORDER.forEach(function (p, i) {
        var a0 = wheelA + i * step - step / 2 - Math.PI / 2, a1 = a0 + step;
        ctx.beginPath(); ctx.moveTo(W.x, W.y); ctx.arc(W.x, W.y, W.r, a0, a1); ctx.closePath();
        var red = isRed(p);
        ctx.fillStyle = pal(p === 0 || p === 37 ? 'acc.green' : red ? 'kit.red' : 'acc.black'); ctx.fill();
        if (red) {   // the red pockets' pattern
          ctx.save(); ctx.clip();
          ctx.strokeStyle = pal('acc.crimson'); ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(W.x, W.y, W.r * 0.93, a0, a1); ctx.stroke();
          ctx.beginPath(); ctx.arc(W.x, W.y, W.r * 0.86, a0, a1); ctx.stroke();
          ctx.restore();
        }
        ctx.strokeStyle = pal('kit.gold'); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(W.x, W.y); ctx.arc(W.x, W.y, W.r, a0, a0); ctx.stroke();
        var am = a0 + step / 2;
        ctx.save(); ctx.translate(W.x + Math.cos(am) * W.r * 0.82, W.y + Math.sin(am) * W.r * 0.82); ctx.rotate(am + Math.PI / 2);
        ctx.font = host.font(12, 900); ctx.fillStyle = pal('kit.paper'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(label(p), 0, 0);
        ctx.restore();
      });
      ctx.beginPath(); ctx.arc(W.x, W.y, W.r * 0.62, 0, Math.PI * 2); ctx.fillStyle = pal('kit.wood'); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = pal('inkLine'); ctx.stroke();
      ctx.beginPath(); ctx.arc(W.x, W.y, W.r * 0.2, 0, Math.PI * 2); ctx.fillStyle = pal('kit.gold'); ctx.fill(); ctx.stroke();
      for (var s = 0; s < 4; s++) {
        var a = wheelA + s * Math.PI / 2;
        ctx.lineWidth = 6; ctx.strokeStyle = pal('kit.gold');
        ctx.beginPath(); ctx.moveTo(W.x + Math.cos(a) * W.r * 0.2, W.y + Math.sin(a) * W.r * 0.2); ctx.lineTo(W.x + Math.cos(a) * W.r * 0.55, W.y + Math.sin(a) * W.r * 0.55); ctx.stroke();
      }
      // the ball
      var ba = wheelA + ballRel - Math.PI / 2, br = W.r * (0.72 + 0.26 * ballR);
      ctx.beginPath(); ctx.arc(W.x + Math.cos(ba) * br, W.y + Math.sin(ba) * br, 8, 0, Math.PI * 2);
      ctx.fillStyle = pal('kit.paper'); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = pal('inkLine'); ctx.stroke();
      // the result and the history
      ctx.textAlign = 'center';
      if (lastPocket !== null && !spin) {
        var red2 = isRed(lastPocket);
        ctx.font = host.font(28, 900, true);
        ctx.fillStyle = pal('kit.paper');
        ctx.fillText(T(lastPocket === 0 || lastPocket === 37 ? 'mg.roulette.green' : red2 ? 'mg.roulette.red' : 'mg.roulette.black') + ' ' + label(lastPocket), W.x, W.y + W.r + 50);
      }
      ctx.font = host.font(14, 700); ctx.fillStyle = pal('kit.paper'); ctx.textAlign = 'left';
      ctx.fillText(T('mg.roulette.history'), 24, 520);
      history.forEach(function (p, i) {
        var x = 24 + i * 32, y = 530;
        ctx.fillStyle = pal(p === 0 || p === 37 ? 'acc.green' : isRed(p) ? 'kit.red' : 'acc.black');
        SR.art.draw.roundRect(ctx, x, y, 28, 28, 6); ctx.fill();
        if (isRed(p)) hatch(ctx, x, y, 28, 28);
        ctx.lineWidth = 1.5; ctx.strokeStyle = pal('kit.paper'); SR.art.draw.roundRect(ctx, x, y, 28, 28, 6); ctx.stroke();
        ctx.font = host.font(12, 900); ctx.fillStyle = pal('kit.paper'); ctx.textAlign = 'center'; ctx.fillText(label(p), x + 14, y + 18);
      });
      ctx.textAlign = 'left';
    }

    host.hints([
      { actions: ['up', 'down', 'left', 'right'], label: 'mg.roulette.hintMove' },
      { action: 'place', label: 'mg.roulette.hintPlace', only: 'kb' },
      { range: ['chip1', 'chip4'], label: 'mg.roulette.hintChips', only: 'kb' },
      { action: 'clearBets', label: 'mg.roulette.hintClear', only: 'kb' },
      { action: 'spin', label: 'mg.roulette.hintSpin', only: 'kb' },
      { action: 'confirm', label: 'mg.roulette.hintPlace', only: 'pad' },
      { action: 'tabNext', label: 'mg.roulette.hintSpin', only: 'pad' },
      { action: 'tabPrev', label: 'mg.roulette.hintClear', only: 'pad' },
      { action: 'car', label: 'mg.roulette.hintChips', only: 'pad' },
      { label: 'mg.roulette.hintTap', only: 'touch' },
    ]);
    controls();
    mirror();
    host.aria(T('mg.roulette.startAria'));

    return {
      update: function (dt) {
        t += dt;
        wheelA += wheelV * dt;
        if (!spin) return;
        spin.t += dt;
        var k = Math.min(1, spin.t / SPIN_S);
        wheelV = 2.4 * (1 - k) + 0.6 * k;
        if (!spin.committed && spin.t >= COMMIT_S) commit();
        if (!spin) return;
        if (!spin.committed || !spin.result) {
          ballRel -= (7 * (1 - k * 0.6)) * dt;           // the ball runs round the rim, against the wheel
          ballR = 1;
          if (spin.failed && spin.t >= SPIN_S) finishSpin();
          return;
        }
        var u = Math.min(1, (spin.t - spin.tc) / Math.max(0.01, SPIN_S - spin.tc));
        ballRel = spin.rel0 + (spin.relT - spin.rel0) * SR.util.easeOut(u);
        ballR = 1 - SR.util.easeInOut(u);
        if (spin.t >= SPIN_S) finishSpin();
      },
      render: function (ctx) {
        ctx.fillStyle = pal('kit.felt'); ctx.fillRect(0, 0, 1280, 576);
        drawWheel(ctx);
        drawBoard(ctx);
      },
      onAction: function (a, ev) {
        var rep = ev && ev.repeat;
        if (a === 'up') { move(0, -1); return; }
        if (a === 'down') { move(0, 1); return; }
        if (a === 'left') { move(-1, 0); return; }
        if (a === 'right') { move(1, 0); return; }
        if (rep) return;
        var m = /^chip(\d)$/.exec(a);
        if (m) { pickChip(+m[1] - 1); return; }
        if (a === 'car') { pickChip((chipI + 1) % CHIPS.length); return; }      // pad Y
        if (a === 'place' || a === 'confirm') { place(active.X, active.Y); return; }
        if (a === 'clearBets' || a === 'tabPrev') { clearBets(); return; }    // pad LB
        if (a === 'spin' || a === 'tabNext') spinOrSkip();                    // pad RB
      },
      pointer: function (kind, x, y) {
        if (kind !== 'down') return;
        if (spin) { if (spin.t >= SKIP_S) skip(); return; }
        var h = hit(x, y);
        if (h) place(h.X, h.Y);
      },
      progress: function () { return sessionResult(); },
      peek: function () {
        return { chip: CHIPS[chipI], active: { X: active.X, Y: active.Y, bet: spotAt(active.X, active.Y) }, bets: list(), total: total(), limit: lim,
          spinning: !!spin, committed: !!(spin && spin.committed), t: spin ? spin.t : 0, last: lastPocket, history: history.slice(), session: sessionResult(), finished: finished };
      },
      destroy: function () { stopBall(); },
    };
  }

  SR.minigame.register('roulette', {
    title: 'mg.roulette.title',
    music: 'high_roller_lounge',
    keys: { clearBets: ['KeyC'], spin: ['Space'], place: ['Enter'], chip1: ['Digit1'], chip2: ['Digit2'], chip3: ['Digit3'], chip4: ['Digit4'] },
    assist: false,
    create: create,
    // No Auto (ARCHITECTURE §10): the def has no `auto`.
    /** @returns {object} nothing is at stake between spins (a spin is applied when it is decided). */
    worst: function () { return { net: 0, rounds: 0, wagered: 0 }; },
    /** @returns {object} leaving keeps the session as played; chips not yet spun go back to you. */
    forfeit: function (params, progress) { var p = progress || {}; return { net: p.net || 0, rounds: p.rounds || 0, wagered: p.wagered || 0, exited: true }; },
    /** @returns {string} the banner line. */
    summary: function (r, text) {
      var n = Math.round(Number(r && r.net) || 0);
      return text(n > 0 ? 'mg.roulette.up' : n < 0 ? 'mg.roulette.down' : 'mg.roulette.even', { money: SR.text.money(Math.abs(n)) });
    },
    spotAt: spotAt,
    hit: hit,
    ORDER: ORDER.slice(),
  });
})();
