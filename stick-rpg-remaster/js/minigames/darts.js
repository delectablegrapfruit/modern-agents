// js/minigames/darts.js — owner: W2-Night. The Darts engine (GDD §4.13, §6.5; BALANCE B-14f; UI
// §5.8): Sticky's practice (P0: 30 m, +1 CHA the first game each day, no stake) and matches (P1
// `nightlife`: a stake against Rookie, Regular or Shark).
// params (Result.open.params of casino.dartsPractice / casino.dartsMatchStart): { mode, A, fx, fy,
// phx, phy, darts, target?, tier?, pays?, stake? }: the wobble's amplitude and its two phases were
// drawn by the rules from the rules stream when the row ran (SR.rules.casino.darts.params).
//   The board (radius 220 board px, centred in the play area) scores by ring: ≤ 19 → 50, ≤ 40 → 35,
//   ≤ 138 → 15, ≤ 220 → 5, beyond → 0 (SR.rules.casino.darts.score, the original's proportions).
//   The crosshair is the aim point plus the Lissajous wobble A × (sin(2π·0.53·t + φx),
//   sin(2π·0.71·t + φy)), t = seconds of play (paused time does not count); Assist halves A. The aim
//   point follows the pointer (or the stick at 500 px/s, the arrows at 400 px/s) with a 0.2 s time
//   constant; a dart lands where the crosshair is at the throw. A ghost board drifts beside the real
//   one at Buzz ≥ 2 (P1 `nightlife`: Buzz effects) and never scores.
//   Auto: 10 throws at the centre, each at a uniformly random moment of the wobble (the same draws
//   as SR.rules.casino.darts.autoThrows, one per dart), so it is a real sample.
// Result (CONTRACT §13): { score, throws: [pts] }; bar.darts:resolve (practice) and
// casino.dartsMatch (a match) take it. Input: the `darts` context (throw: Space / A), confirm also
// throws, the arrows / WASD / stick aim, the pointer aims and clicks (a touch aims while dragging
// and throws on lift). Accessible state: host.label('darts', ...) and #aria per dart.
(function () {
  'use strict';
  var SR = window.SR;

  // Presentation constants (UI §5.8; the geometry numbers are B-14f's, read from SR.tuning).
  var CX = 640, CY = 288;              // the board's centre: centred in the play area (1280 × 576; UI §5.8, B-14f)
  var RIM = 26;                        // the wooden rim beyond the scoring area (scores 0)
  var LOCK_S = 0.3;                    // s between throws
  var FLIGHT_S = 0.16;                 // s a dart takes to reach the board (cosmetic)
  var END_HOLD_S = 0.6;                // s the last dart shows before the round ends
  var GHOST = { dx: 34, dy: -22, alpha: 0.28 };
  var COL = { x: 936, w: 320 };        // the score column, right of the board (its rim ends at x 886)

  function D() { return SR.tuning.casino.darts; }
  function R() { return SR.rules.casino.darts; }
  function fast() { try { return !!(SR.debug && typeof SR.debug.fast === 'function' && SR.debug.fast() === true); } catch (e) { return false; } }
  function pal(k) { return SR.art && SR.art.draw ? SR.art.draw.color(k) : ''; }

  /** The round's params: the rules' (with the phases drawn when the row ran), else fresh ones. */
  function paramsOf(state, params, rng) {
    var p = SR.util.clone(params || {});
    if (typeof p.phx !== 'number' || typeof p.A !== 'number') Object.assign(p, R().params(state || SR.state, p, rng || SR.rng.rules));
    if (!p.darts) p.darts = D().perGame;
    if (!p.mode) p.mode = 'practice';
    return p;
  }

  /** @returns {object} the Auto sample from `done` throws already made (one draw per dart). */
  function autoFrom(p, done, rng) {
    var throws = done.map(function (d) { return d.pts; }), spots = [];
    var score = throws.reduce(function (a, b) { return a + b; }, 0);
    for (var i = done.length; i < p.darts; i++) {
      var w = R().wobble(rng.float(0, D().autoWindowSec), p), pts = R().score(w.x, w.y);
      throws.push(pts);
      spots.push({ x: w.x, y: w.y, pts: pts });
      score += pts;
    }
    return { r: { score: score, throws: throws, auto: true }, spots: spots };
  }

  function create(host, params) {
    var T = host.text;
    var p = paramsOf(host.state, params, host.rng);
    var W = D().wobble, AIM = D().aim, RADIUS = D().boardRadius;
    var st = host.state || {};
    var buzz = st.stats ? st.stats.buzz || 0 : 0;
    var ghost = !!SR.features.nightlife && buzz >= D().ghostBoardBuzz;
    var match = p.mode === 'match';

    var aim = { x: 0, y: 0 }, target = { x: 0, y: 0 };
    var darts = [];                     // { x, y, pts, t } landed (x, y from the centre)
    var flying = null;                  // { x, y, t } the dart in the air
    var lock = 0, done = false, endT = 0, t = 0, touchAim = false;
    var replay = null;

    function amp() { return p.A * (host.assist ? W.assist : 1); }
    function wob(tt) { var o = R().wobble(tt, p); var k = host.assist ? W.assist : 1; return { x: o.x * k, y: o.y * k }; }
    function cross() { var w = wob(host.t); return { x: aim.x + w.x, y: aim.y + w.y }; }
    function score() { return darts.reduce(function (a, d) { return a + d.pts; }, 0); }
    function left() { return p.darts - darts.length - (flying ? 1 : 0); }

    function matchesToday() { var s = SR.state; return s && s.daily ? s.daily.dartsMatches || 0 : 0; }

    function mirror() {
      host.label('status', T('mg.darts.left', { n: left() }));
      if (match) host.label('match', T('mg.darts.match') + ': ' + T('mg.darts.matchToday', { n: matchesToday(), max: D().match.perDay }));
      host.label('darts', T('mg.darts.status', { n: Math.min(p.darts, darts.length + 1), total: p.darts, score: score() }));
    }

    function clampAim(v) { var lim = RADIUS + RIM + 40; return Math.max(-lim, Math.min(lim, v)); }

    function throwDart() {
      if (done || flying || lock > 0 || left() <= 0 || !host.interactive()) return;
      var c = cross();
      flying = { x: c.x, y: c.y, t: 0 };
      lock = LOCK_S;
      host.audio.sfx('dart_throw');
      if (fast()) land();
    }

    function land() {
      var fl = flying;
      flying = null;
      var pts = R().score(fl.x, fl.y);
      darts.push({ x: fl.x, y: fl.y, pts: pts, t: 0 });
      host.audio.sfx('dart_thunk');
      if (pts >= D().rings[1].pts && host.haptic) host.haptic(30);   // the 35 ring or the bull
      var line = T('mg.darts.dartAria', { n: darts.length, pts: pts, score: score() });
      if (pts === 0) line = T('mg.darts.offBoard') + ' ' + line;
      host.aria(line);
      mirror();
      if (darts.length >= p.darts) { done = true; endT = fast() ? 0 : END_HOLD_S; if (!endT) finish(); }
    }

    function finish() {
      host.finish({ score: score(), throws: darts.map(function (d) { return d.pts; }) });
    }

    // ---- drawing ---------------------------------------------------------------------------------
    function board(ctx, x, y, alpha) {
      var rings = D().rings;   // [{ r, pts }] from the bull out
      ctx.save();
      ctx.globalAlpha *= alpha;
      ctx.beginPath(); ctx.arc(x, y, RADIUS + RIM, 0, Math.PI * 2);
      ctx.fillStyle = pal('kit.woodDark'); ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = pal('inkLine'); ctx.stroke();
      // bands from the outside in: 5 (sectors), 15 (sectors), 35 (green), 50 (red)
      var bands = rings.slice().reverse();
      bands.forEach(function (ring, bi) {
        var inner = bi + 1 < bands.length ? bands[bi + 1].r : 0;
        if (bi < 2) {
          for (var s = 0; s < 20; s++) {
            ctx.beginPath();
            ctx.arc(x, y, ring.r, s * Math.PI / 10 - Math.PI / 20, (s + 1) * Math.PI / 10 - Math.PI / 20);
            ctx.arc(x, y, inner, (s + 1) * Math.PI / 10 - Math.PI / 20, s * Math.PI / 10 - Math.PI / 20, true);
            ctx.closePath();
            ctx.fillStyle = pal((s + bi) % 2 ? 'kit.dartA' : 'kit.dartB');
            ctx.fill();
          }
        } else {
          ctx.beginPath(); ctx.arc(x, y, ring.r, 0, Math.PI * 2);
          ctx.fillStyle = pal(bi === 2 ? 'kit.dartD' : 'kit.dartC'); ctx.fill();
        }
        ctx.beginPath(); ctx.arc(x, y, ring.r, 0, Math.PI * 2);
        ctx.lineWidth = 2.5; ctx.strokeStyle = pal('kit.brass'); ctx.stroke();
      });
      // the ring values, on a paper tab at the right edge of each band (the score is by ring only)
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      bands.forEach(function (ring, bi) {
        var inner = bi + 1 < bands.length ? bands[bi + 1].r : 0;
        var label = T('mg.darts.ring', { pts: ring.pts });
        if (bi === bands.length - 1) {   // the bull: its value in paper ink on the red
          ctx.font = host.font(15, 900); ctx.fillStyle = pal('kit.paper');
          ctx.fillText(label, x, y + 1);
          return;
        }
        var small = bi === bands.length - 2;   // the narrow 35 ring: a small tab above the bull
        var rx = small ? x : x + (ring.r + inner) / 2, ry = small ? y - (ring.r + inner) / 2 : y;
        var w = small ? 24 : 30, h = small ? 16 : 22;
        ctx.fillStyle = pal('kit.paper');
        SR.art.draw.roundRect(ctx, rx - w / 2, ry - h / 2, w, h, 6); ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = pal('inkLine'); ctx.stroke();
        ctx.font = host.font(small ? 12 : 14, 900); ctx.fillStyle = host.color('ink-900');
        ctx.fillText(label, rx, ry + 1);
      });
      ctx.restore();
      ctx.textBaseline = 'alphabetic';
    }

    function drawDart(ctx, x, y, s) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s, s);
      ctx.lineCap = 'round';
      ctx.strokeStyle = pal('inkLine'); ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(18, 16); ctx.stroke();
      ctx.fillStyle = pal('kit.red');
      ctx.beginPath(); ctx.moveTo(14, 12); ctx.lineTo(30, 14); ctx.lineTo(20, 22); ctx.closePath(); ctx.fill();
      ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = pal('kit.metal');
      ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    function drawCrosshair(ctx, c) {
      var x = CX + c.x, y = CY + c.y;
      ctx.lineWidth = 3; ctx.strokeStyle = host.color('paper-0');
      ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 2; ctx.strokeStyle = host.color('danger');
      ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2);
      ctx.moveTo(x - 24, y); ctx.lineTo(x - 6, y); ctx.moveTo(x + 6, y); ctx.lineTo(x + 24, y);
      ctx.moveTo(x, y - 24); ctx.lineTo(x, y - 6); ctx.moveTo(x, y + 6); ctx.lineTo(x, y + 24);
      ctx.stroke();
      // the aim point itself, faint: the wobble swings around it
      ctx.globalAlpha = 0.45; ctx.fillStyle = host.color('ink-900');
      ctx.beginPath(); ctx.arc(CX + aim.x, CY + aim.y, 4, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    function drawColumn(ctx) {
      var x = COL.x, y = 40;
      SR.art.draw.roundRect(ctx, x, y, COL.w, 496, 16);
      ctx.fillStyle = host.color('paper-0'); ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = host.color('ink-900'); ctx.stroke();
      ctx.fillStyle = host.color('ink-900'); ctx.textAlign = 'left';
      ctx.font = host.font(22, 900, true);
      ctx.fillText(T('mg.darts.score').toUpperCase(), x + 20, y + 36);
      ctx.font = host.font(18, 600);
      for (var i = 0; i < p.darts; i++) {
        var d = darts[i], yy = y + 70 + i * 34;
        ctx.fillStyle = host.color(d ? 'ink-900' : 'ink-300');
        ctx.textAlign = 'left';
        ctx.fillText(String(i + 1), x + 24, yy);
        ctx.textAlign = 'right';
        ctx.fillText(d ? String(d.pts) : '·', x + 150, yy);
      }
      ctx.textAlign = 'left';
      ctx.font = host.font(16, 700); ctx.fillStyle = host.color('ink-700');
      ctx.fillText(T('mg.darts.total'), x + 190, y + 76);
      ctx.font = host.font(56, 900, true); ctx.fillStyle = host.color('ink-900');
      ctx.fillText(String(score()), x + 190, y + 136);
      if (match) {
        ctx.font = host.font(16, 700); ctx.fillStyle = host.color('ink-700');
        ctx.fillText(T('mg.frame.target', { n: p.target }), x + 190, y + 176);
        var ok = score() >= p.target;
        ctx.fillStyle = host.color(ok ? 'ok' : 'ink-300');
        ctx.fillRect(x + 190, y + 188, 110 * Math.min(1, score() / Math.max(1, p.target)), 10);
        ctx.strokeStyle = host.color('ink-900'); ctx.lineWidth = 1.5; ctx.strokeRect(x + 190, y + 188, 110, 10);
        ctx.font = host.font(14, 600); ctx.fillStyle = host.color('ink-700');
        ctx.fillText(T('mg.darts.matchToday', { n: matchesToday(), max: D().match.perDay }), x + 190, y + 224);
      }
    }

    // ---- setup -------------------------------------------------------------------------------------
    if (match) {
      host.label('info', T('mg.darts.targetInfo', { target: p.target, money: SR.text.money(p.stake || 0) }));
      host.aria(T('mg.darts.startMatchAria', { n: p.darts, target: p.target, money: SR.text.money((p.stake || 0) * (p.pays || 2)) }));
    } else {
      host.label('info', T('mg.darts.practice'));
      host.aria(T('mg.darts.startAria', { n: p.darts }));
    }
    host.hints([
      { action: 'throw', label: 'mg.darts.throw' },
      { actions: ['up', 'down', 'left', 'right'], label: 'mg.darts.aim', only: 'kb' },
      { label: 'mg.darts.hintPointer', only: 'kb' },
      { label: 'mg.darts.hintTouch', only: 'touch' },
    ]);
    mirror();

    return {
      update: function (dt) {
        t += dt;
        if (replay) {
          replay.t += dt;
          var shown = Math.min(replay.spots.length, Math.floor(replay.t / Math.max(0.01, replay.dur) * (replay.spots.length + 1)));
          while (replay.shown < shown) { var sp = replay.spots[replay.shown++]; darts.push({ x: sp.x, y: sp.y, pts: sp.pts, t: 0 }); }
          return;
        }
        if (lock > 0) lock -= dt;
        darts.forEach(function (d) { d.t += dt; });
        if (flying) { flying.t += dt; if (flying.t >= FLIGHT_S) land(); }
        if (done) {
          if (endT > 0) { endT -= dt; if (endT <= 0) finish(); }
          return;
        }
        // stick / arrows move the aim target (B-14f aim: 500 px/s stick, 400 px/s arrows)
        var inp = SR.input;
        if (inp && typeof inp.axis === 'function' && !touchAim) {
          var a = inp.axis('move');
          if (a && (a.x || a.y)) {
            var sp2 = inp.last === 'pad' ? AIM.stickPxSec : AIM.arrowsPxSec;
            target.x = clampAim(target.x + a.x * sp2 * dt);
            target.y = clampAim(target.y + a.y * sp2 * dt);
          }
        }
        var k = 1 - Math.exp(-dt / AIM.smoothSec);
        aim.x += (target.x - aim.x) * k;
        aim.y += (target.y - aim.y) * k;
      },
      render: function (ctx) {
        ctx.fillStyle = pal('int.bar.wall');
        ctx.fillRect(0, 0, 1280, 576);
        ctx.fillStyle = pal('int.bar.wallShade');
        for (var bx = 0; bx < 1280; bx += 60) ctx.fillRect(bx, 0, 2, 576);
        if (ghost) board(ctx, CX + GHOST.dx + Math.sin(t * 0.4) * 10, CY + GHOST.dy + Math.cos(t * 0.3) * 8, GHOST.alpha);
        board(ctx, CX, CY, 1);
        darts.forEach(function (d) { drawDart(ctx, CX + d.x, CY + d.y, 1.6); });
        if (flying) { var k = flying.t / FLIGHT_S; drawDart(ctx, CX + flying.x + (1 - k) * 60, CY + flying.y + (1 - k) * 90, 1.6 + (1 - k) * 1.6); }
        if (!done && !replay) drawCrosshair(ctx, cross());
        drawColumn(ctx);
      },
      onAction: function (a, ev) {
        if (ev && ev.repeat) return;
        if (a === 'throw' || a === 'confirm') throwDart();
      },
      pointer: function (kind, x, y, ev) {
        var touch = ev && ev.pointerType === 'touch';
        if (kind === 'down' || kind === 'move') {
          target.x = clampAim(x - CX);
          target.y = clampAim(y - CY);
          if (touch) touchAim = true;
        }
        if (kind === 'down' && !touch) throwDart();
        if (kind === 'up' && touch) { touchAim = false; throwDart(); }
      },
      auto: function (rng) {
        var out = autoFrom(p, darts, rng);
        replay = { spots: out.spots, shown: 0, t: 0, dur: fast() ? 0.01 : 0.9 };
        flying = null;
        done = true;
        return out.r;
      },
      replay: function () { if (replay) replay.t = 0; },
      progress: function () { return { score: score(), throws: darts.map(function (d) { return d.pts; }) }; },
      assistChanged: function () {},
      peek: function () {
        return { aim: { x: aim.x, y: aim.y }, target: { x: target.x, y: target.y }, cross: cross(), t: host.t, A: amp(), params: SR.util.clone(p),
          darts: darts.map(function (d) { return { x: d.x, y: d.y, pts: d.pts }; }), flying: !!flying, lock: lock, done: done, ghost: ghost, score: score() };
      },
      destroy: function () {},
    };
  }

  SR.minigame.register('darts', {
    title: 'mg.darts.title',
    keys: { throw: ['Space', 'Pad0'] },
    create: create,
    /** @returns {object} the Auto: SR.rules.casino.darts.autoThrows (10 throws at random moments of the wobble). */
    auto: function (state, params, rng) {
      var p = paramsOf(state, params, rng);
      return R().autoThrows(state, p, rng);
    },
    /** @returns {object} no dart on the board (Hardcore's worst for a match). */
    worst: function () { return { score: 0, throws: [] }; },
    /** @returns {object} leaving early keeps the darts thrown so far. */
    forfeit: function (params, progress) {
      var pr = progress || { score: 0, throws: [] };
      return { score: pr.score || 0, throws: (pr.throws || []).slice(), exited: true };
    },
    /** @returns {string} the banner line. */
    summary: function (r, text, skin, params) {
      if (params && params.mode === 'match') return text(r.score >= params.target ? 'mg.darts.summaryWin' : 'mg.darts.summaryLose', { score: r.score, target: params.target });
      return text('mg.darts.summary', { score: r.score });
    },
    CENTER: { x: CX, y: CY },
  });
})();
