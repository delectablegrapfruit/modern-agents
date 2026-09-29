// js/minigames/timingring.js — owner: W1-M. The Timing Ring engine (GDD §6.5): a needle sweeps a
// ring and each press hits when the needle is inside the sweet arc. Two modes, chosen by the skin:
//   grade  (pitch):   a fixed number of presses; m = 0.7 + 0.12 per hit, clamped 0.7-1.3 (B-05)
//   unlock (hotwire): up to 5 presses; 3 hits succeed, 3 misses fail (B-26 junker.ring)
// Skin params: { mode, step (difficulty step), arc (degrees, or a rule { stat, base, per, from, min,
// max } in degrees), presses, hits, misses, base, perHit }. Results (ARCHITECTURE §10): grade
// { m, hits, misses }; unlock { started, hits, misses }. Auto: grade m = 1.0 exactly (not a sample);
// unlock presses hit with p = arc / 360° using host.rng (real draws).
(function () {
  'use strict';
  var SR = window.SR;

  // Every balance number comes from SR.tuning (W1-R's names): jobs.hustle (B-05), street.junker.ring
  // (B-26, with its arc row: the hotwire arc clamp(20° + (INT - 200)/5, 8°, 70°) of GDD §6.5) and
  // world.assist (B-15 Assist), since the wave-1 integration (CONTRACT D55, docs/requests/W1-M.md 4).
  // The values here are the fallbacks for a table without the row. "Up to 5 presses" is B-26's
  // 3 hits / 3 misses: the round is decided by press hits + misses - 1.
  var HOTWIRE_ARC = { stat: 'int', base: 20, per: 0.2, from: 200, min: 8, max: 70 };   // street.junker.ring.arc
  var ASSIST_SPEED = 0.7;  // world.assist.speed: GDD §6.5 Assist, -30 % speed ...
  var ASSIST_ARC = 1.5;    // world.assist.sweet: ... and +50 % sweet spots
  var ARC_CAP = 330;       // an assisted arc never covers the whole ring
  var LOCKOUT = 0.15;      // s after a press before the next one counts
  var FLASH = 0.35;        // s of hit / miss feedback
  var LEAD_MIN = 90;       // the next arc opens 90-270° ahead of the needle
  var LEAD_SPAN = 180;
  var REPLAY_STEP = 0.15;  // s per press in an Auto replay
  var RING = { x: 640, y: 262, r: 160, w: 24 };

  function clamp(v, lo, hi) { return SR.util.clamp(v, lo, hi); }
  function round2(v) { return Math.round(v * 100) / 100; }
  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }

  /** The hotwire arc rule from street.junker.ring.arc ({ base, perInt, from, min, max }; B-26). */
  function hotwireArc(tune) {
    var a = tune('street.junker.ring.arc', {});
    return { stat: 'int', base: num(a.base, HOTWIRE_ARC.base), per: num(a.perInt, HOTWIRE_ARC.per), from: num(a.from, HOTWIRE_ARC.from),
      min: num(a.min, HOTWIRE_ARC.min), max: num(a.max, HOTWIRE_ARC.max) };
  }

  /** The engine's numbers for these params: SR.tuning (BALANCE), then the skin's and run params. */
  function opts(params) {
    params = params || {};
    var tune = SR.minigame.tune;
    var mode = params.mode === 'unlock' ? 'unlock' : 'grade';
    var m = tune('jobs.hustle.m', [0.7, 1.3]);
    var o = {
      mode: mode, step: +params.step || 0,
      mMin: m[0], mMax: m[1], autoM: tune('jobs.hustle.auto', 1.0),                  // B-05 hustle.m
      speed: tune('jobs.hustle.pitch.needleDegSec', 180),                            // GDD §6.5: 180°/s ...
      speedStep: tune('jobs.hustle.pitch.needlePerStep', 30),                        // ... + 30°/s per step
      assistSpeed: tune('world.assist.speed', ASSIST_SPEED), assistArc: tune('world.assist.sweet', ASSIST_ARC),   // B-15 Assist
    };
    if (mode === 'grade') {   // B-05 hustle.pitch: 5 presses; arc min(0.40, 0.08 + CHA/4000) of the ring; m = 0.7 + 0.12 a hit
      o.presses = tune('jobs.hustle.pitch.presses', 5);
      o.base = tune('jobs.hustle.pitch.base', 0.7);
      o.perHit = tune('jobs.hustle.pitch.perHit', 0.12);
      var div = tune('jobs.hustle.pitch.arcChaDiv', 4000);
      o.arc = { stat: 'cha', base: 360 * tune('jobs.hustle.pitch.arcBase', 0.08), per: 360 / div, from: 0, min: 0, max: 360 * tune('jobs.hustle.pitch.arcMax', 0.40) };
    } else {                  // B-26 junker.ring: 3 hits start the car, 3 misses trip the alarm
      o.hits = tune('street.junker.ring.hits', 3);
      o.misses = tune('street.junker.ring.misses', 3);
      o.arc = hotwireArc(tune);
    }
    ['presses', 'hits', 'misses', 'base', 'perHit', 'mMin', 'mMax', 'speed', 'speedStep'].forEach(function (k) {
      if (typeof params[k] === 'number') o[k] = params[k];
    });
    if (mode === 'unlock' && typeof params.presses !== 'number') o.presses = o.hits + o.misses - 1;   // GDD §6.5: up to 5
    if (params.arc !== undefined) o.arc = params.arc;
    return o;
  }

  /**
   * The sweet arc in degrees before Assist.
   * @param {object} state reads state.stats[rule.stat]
   * @param {object} params skin and run params
   * @returns {number}
   */
  function arcDeg(state, params) {
    var o = opts(params);
    if (typeof o.arc === 'number') return clamp(o.arc, 0, 360);
    var r = o.arc;
    var v = state && state.stats ? +state.stats[r.stat] || 0 : 0;
    return clamp(r.base + (v - (r.from || 0)) * r.per, r.min, r.max);
  }

  /** @returns {number} the m of a grade-mode round with this many hits. */
  function grade(o, hits) { return round2(clamp(o.base + o.perHit * hits, o.mMin, o.mMax)); }

  /** @returns {boolean} the round is over. */
  function over(o, hits, misses, presses) {
    if (presses >= o.presses) return true;
    return o.mode === 'unlock' && (hits >= o.hits || misses >= o.misses);
  }

  function result(o, hits, misses) {
    if (o.mode === 'unlock') return { started: hits >= o.hits, hits: hits, misses: misses };
    return { m: grade(o, hits), hits: hits, misses: misses };
  }

  /** Auto from a position: grade → m = autoM exactly; unlock → Bernoulli presses at arc / 360°. */
  function autoFrom(o, arc, hits, misses, presses, rng) {
    if (o.mode !== 'unlock') return { m: o.autoM, hits: 0, misses: 0, auto: true };
    var p = clamp(arc / 360, 0, 1);
    while (!over(o, hits, misses, presses)) {
      presses++;
      if (SR.minigame.roll(rng, p)) hits++; else misses++;
    }
    var r = result(o, hits, misses);
    r.auto = true;
    return r;
  }

  function angDist(a, b) {
    var d = Math.abs(((a - b) % 360 + 360) % 360);
    return d > 180 ? 360 - d : d;
  }

  function rad(deg) { return (deg - 90) * Math.PI / 180; }

  function create(host, params) {
    var o = opts(params);
    var arc0 = arcDeg(host.state, params);
    var skinArt = host.skin && host.skin.art || null;
    var st = {
      angle: host.fx.float(0, 360), arcC: 0, hits: 0, misses: 0, presses: 0, pips: [],
      lock: 0, flash: 0, flashHit: false, done: false, replay: null,
    };
    st.arcC = (st.angle + LEAD_MIN + host.fx.float(0, LEAD_SPAN)) % 360;

    function speed() { return (o.speed + o.speedStep * o.step) * (host.assist ? o.assistSpeed : 1); }
    function width() { return Math.min(ARC_CAP, arc0 * (host.assist ? o.assistArc : 1)); }

    function statusText() {
      if (o.mode === 'unlock') return host.text('mg.frame.tr.statusUnlock', { hits: st.hits, needHits: o.hits, misses: st.misses, maxMisses: o.misses });
      return host.text('mg.frame.tr.statusGrade', { left: o.presses - st.presses, m: grade(o, st.hits).toFixed(2) });
    }

    function mirror() {
      host.label('status', statusText());
      host.label('ring', host.text('mg.frame.tr.mirror', { hits: st.hits, misses: st.misses, left: Math.max(0, o.presses - st.presses) }));
    }

    function press() {
      if (st.done || st.lock > 0 || !host.interactive()) return;
      st.lock = LOCKOUT;
      st.presses++;
      var hit = angDist(st.angle, st.arcC) <= width() / 2;
      st.pips.push(hit);
      if (hit) st.hits++; else st.misses++;
      st.flash = FLASH;
      st.flashHit = hit;
      host.audio.sfx(hit ? 'mg_hit' : 'mg_miss');
      if (hit && host.haptic) host.haptic();
      host.aria(host.text('mg.frame.tr.pressAria', { outcome: host.text(hit ? 'mg.frame.tr.hit' : 'mg.frame.tr.miss'), n: st.presses, total: o.presses }));
      mirror();
      if (over(o, st.hits, st.misses, st.presses)) {
        st.done = true;
        host.finish(result(o, st.hits, st.misses));
        return;
      }
      st.arcC = (st.angle + LEAD_MIN + host.fx.float(0, LEAD_SPAN)) % 360;
    }

    host.hints([{ action: 'press', label: 'mg.frame.tr.press' }, { label: 'mg.frame.tr.tap', only: 'touch' }]);
    mirror();

    return {
      update: function (dt) {
        st.angle = (st.angle + speed() * dt) % 360;
        if (st.lock > 0) st.lock -= dt;
        if (st.flash > 0) st.flash -= dt;
        if (st.replay) {
          st.replay.t += dt;
          while (st.replay.shown < st.replay.pips.length && st.replay.t >= (st.replay.shown + 1) * REPLAY_STEP) {
            st.pips.push(st.replay.pips[st.replay.shown]);
            st.flashHit = st.replay.pips[st.replay.shown];
            st.flash = FLASH;
            st.replay.shown++;
          }
        }
      },
      onAction: function (a, ev) {
        if ((a === 'press' || a === 'confirm') && !(ev && ev.repeat)) press();
      },
      pointer: function (kind) { if (kind === 'down') press(); },
      auto: function (rng) {
        var r = autoFrom(o, arc0, st.hits, st.misses, st.presses, rng);
        st.done = true;
        return r;
      },
      replay: function (r) {
        if (o.mode !== 'unlock') return;
        var more = [];
        for (var i = st.hits; i < r.hits; i++) more.push(true);
        for (var j = st.misses; j < r.misses; j++) more.push(false);
        st.replay = { t: 0, shown: 0, pips: more };
      },
      progress: function () { return { hits: st.hits, misses: st.misses, presses: st.presses }; },
      peek: function () {
        return { mode: o.mode, angle: st.angle, arcC: st.arcC, width: width(), arc: arc0, speed: speed(), hits: st.hits, misses: st.misses, presses: st.presses, total: o.presses, done: st.done };
      },
      destroy: function () {},
      render: function (ctx) {
        var ink = host.color('ink-900');
        var R = RING;
        // the ring's track and ticks
        ctx.lineCap = 'butt';
        ctx.lineWidth = R.w;
        ctx.strokeStyle = host.color('paper-3');
        ctx.beginPath();
        ctx.arc(R.x, R.y, R.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 2;
        ctx.strokeStyle = ink;
        ctx.beginPath(); ctx.arc(R.x, R.y, R.r + R.w / 2, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(R.x, R.y, R.r - R.w / 2, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = host.color('ink-300');
        for (var k = 0; k < 12; k++) {
          var a = rad(k * 30);
          ctx.beginPath();
          ctx.moveTo(R.x + Math.cos(a) * (R.r - R.w / 2 - 10), R.y + Math.sin(a) * (R.r - R.w / 2 - 10));
          ctx.lineTo(R.x + Math.cos(a) * (R.r - R.w / 2 - 2), R.y + Math.sin(a) * (R.r - R.w / 2 - 2));
          ctx.stroke();
        }
        // the sweet arc
        if (!st.done || st.flash > 0) {
          var w = width();
          ctx.lineWidth = R.w - 4;
          ctx.strokeStyle = host.color('ok');
          ctx.beginPath();
          ctx.arc(R.x, R.y, R.r, rad(st.arcC - w / 2), rad(st.arcC + w / 2));
          ctx.stroke();
          ctx.lineWidth = 2;
          ctx.strokeStyle = ink;
          ctx.beginPath();
          ctx.arc(R.x, R.y, R.r + R.w / 2 - 1, rad(st.arcC - w / 2), rad(st.arcC + w / 2));
          ctx.stroke();
        }
        // feedback flash
        if (st.flash > 0) {
          ctx.globalAlpha = clamp(st.flash / FLASH, 0, 1) * 0.6;
          ctx.lineWidth = 10;
          ctx.strokeStyle = host.color(st.flashHit ? 'ok' : 'danger');
          ctx.beginPath();
          ctx.arc(R.x, R.y, R.r + R.w / 2 + 10, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        // the needle
        var na = rad(st.angle);
        ctx.lineCap = 'round';
        ctx.lineWidth = 6;
        ctx.strokeStyle = ink;
        ctx.beginPath();
        ctx.moveTo(R.x, R.y);
        ctx.lineTo(R.x + Math.cos(na) * (R.r + R.w / 2 + 12), R.y + Math.sin(na) * (R.r + R.w / 2 + 12));
        ctx.stroke();
        ctx.fillStyle = ink;
        ctx.beginPath(); ctx.arc(R.x, R.y, 12, 0, Math.PI * 2); ctx.fill();
        // the centre: the skin's art, or the running score
        var drawn = skinArt && typeof skinArt.center === 'function' && skinArt.center(ctx, R.x, R.y, R.r - R.w, host);
        if (!drawn) {
          ctx.fillStyle = ink;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = host.font(40, 900, true);
          var big = o.mode === 'unlock' ? st.hits + ' / ' + o.hits : '×' + grade(o, st.hits).toFixed(2);
          ctx.fillText(big, R.x, R.y + 64);
        }
        // pips: one per press
        var n = o.presses, gap = 48, x0 = R.x - (n - 1) * gap / 2, py = 500;
        for (var i = 0; i < n; i++) {
          var pip = st.pips[i];
          ctx.fillStyle = pip === undefined ? host.color('paper-0') : host.color(pip ? 'ok' : 'danger');
          ctx.beginPath();
          ctx.arc(x0 + i * gap, py, 15, 0, Math.PI * 2);
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = ink;
          ctx.stroke();
          if (pip !== undefined) {
            ctx.strokeStyle = host.color('paper-0');
            ctx.lineWidth = 3;
            ctx.beginPath();
            if (pip) { ctx.moveTo(x0 + i * gap - 6, py); ctx.lineTo(x0 + i * gap - 1, py + 5); ctx.lineTo(x0 + i * gap + 7, py - 5); }
            else { ctx.moveTo(x0 + i * gap - 5, py - 5); ctx.lineTo(x0 + i * gap + 5, py + 5); ctx.moveTo(x0 + i * gap + 5, py - 5); ctx.lineTo(x0 + i * gap - 5, py + 5); }
            ctx.stroke();
          }
        }
      },
    };
  }

  SR.minigame.register('timingring', {
    title: 'mg.frame.tr.title',
    keys: { press: ['Space', 'Enter', 'NumpadEnter', 'Pad0'] },
    /** @returns {object} the interactive round (ARCHITECTURE §10 instance). */
    create: create,
    /** @returns {object} grade: m = 1.0 exactly; unlock: presses sampled at p = arc / 360° from rng. */
    auto: function (state, params, rng) {
      var o = opts(params);
      return autoFrom(o, arcDeg(state, params), 0, 0, 0, rng);
    },
    /** @returns {object} the loss (Hardcore's pending worst). */
    worst: function (params) {
      var o = opts(params);
      return o.mode === 'unlock' ? { started: false, hits: 0, misses: o.misses } : { m: o.mMin, hits: 0, misses: o.presses };
    },
    /** @returns {object} leaving early: a hustle takes the Auto shift, hotwire gives up. */
    forfeit: function (params, progress) {
      var o = opts(params);
      var p = progress || { hits: 0, misses: 0 };
      if (o.mode === 'unlock') return { started: false, hits: p.hits, misses: p.misses, exited: true };
      return { m: o.autoM, hits: 0, misses: 0, auto: true, exited: true };   // leaving a hustle = the Auto shift
    },
    /** @returns {string} the result banner's line. */
    summary: function (r, text) {
      if (typeof r.started === 'boolean') return text(r.started ? 'mg.frame.tr.unlocked' : 'mg.frame.tr.failed', { hits: r.hits, misses: r.misses });
      return text('mg.frame.tr.gradeSummary', { m: (+r.m).toFixed(2), hits: r.hits });
    },
    // pure pieces for tests and tools
    opts: opts,
    arcDeg: arcDeg,
    grade: function (params, hits) { return grade(opts(params), hits); },
    /** Assist's needle factor and sweet-arc factor (world.assist.speed / .sweet; 0.7 and 1.5 without the row). */
    get ASSIST_SPEED() { return SR.minigame.tune ? SR.minigame.tune('world.assist.speed', ASSIST_SPEED) : ASSIST_SPEED; },
    get ASSIST_ARC() { return SR.minigame.tune ? SR.minigame.tune('world.assist.sweet', ASSIST_ARC) : ASSIST_ARC; },
  });
})();
