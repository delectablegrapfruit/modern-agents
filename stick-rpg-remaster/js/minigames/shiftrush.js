// js/minigames/shiftrush.js — owner: W1-M. The Shift Rush engine (GDD §6.5; BALANCE B-05 hustle):
// a 30 s round graded m = clamp(0.7 + 0.075 × correct - 0.1 × wrong, 0.7, 1.3). Two modes:
//   tickets (orderup): tickets list 2-5 items from 6 bins and arrive every 6 s speeding to 3 s;
//     press the bins in order (1-6, or the D-pad and A), then serve (Enter / Y). correct = tickets
//     served right; wrong = wrong bins and incomplete serves.
//   conveyor (sortit): items slide down a belt, 3 per ticket interval (sortit's itemsPerCorrect, so
//     one ticket's worth of items is one correct); ← ↓ → (or 1-3) sends the front one to a bin.
//     correct = 1 per 3 items, times the streak multiplier (×1.1 steps up to ×1.5); wrong = wrong bins.
// Skin params: { mode, bins: [{ id, label, icon }], items (conveyor): [{ id, label, icon, bin }] }.
// Skin art hooks (optional): art.item(ctx, id, x, y, size, host) → true when drawn,
// art.backdrop(ctx, w, h, host). Result { m, hits, misses }; Auto m = 1.0 exactly (B-05).
// Assist slows the whole round by 30 % (its 30 s included), so the round keeps its ticket count.
(function () {
  'use strict';
  var SR = window.SR;

  // Every balance number comes from SR.tuning (W1-R's names): jobs.hustle (B-05: m, auto, orderup,
  // sortit, orderup.items, sortit.streak, sortit.travelSec) and world.assist (B-15 Assist), since
  // the wave-1 integration (CONTRACT D55, docs/requests/W1-M.md 4). These are the fallbacks for a
  // table without the row (GDD §6.5):
  var ITEMS_PER_TICKET = [2, 5];  // jobs.hustle.orderup.items: tickets list 2-5 items
  var STREAK_STEP = 0.1;          // jobs.hustle.sortit.streak.step: streaks step ×1.1 ...
  var STREAK_MAX = 1.5;           // .max: ... up to ×1.5
  var STREAK_EVERY = 3;           // .every: right sorts in a row per step (one "correct" of 3 items)
  var BELT_TRAVEL = [3.2, 2.2];   // jobs.hustle.sortit.travelSec: s down the belt, start → end of the round
  var ASSIST_SPEED = 0.7;         // world.assist.speed: GDD §6.5 Assist, -30 % speed
  var FLASH = 0.35;               // s of feedback
  var KINDS = ['money', 'int', 'cha', 'str', 'time', 'heat'];   // token families that tint the bins

  function clamp(v, lo, hi) { return SR.util.clamp(v, lo, hi); }
  // m is B-05's formula exactly: its steps (0.075, 0.1) are multiples of 0.005, so rounding to
  // 0.001 only removes float noise (0.7 + 0.075 = 0.7749999...), where 0.01 would round 0.775
  // down and 0.925 up.
  function round3(v) { return Math.round(v * 1000) / 1000; }
  function lerp(a, b, t) { return a + (b - a) * clamp(t, 0, 1); }
  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
  /** @returns {number[]} a [from, to] pair of numbers from a tuning row, else the fallback. */
  function pair(v, d) { return Array.isArray(v) && v.length >= 2 ? [num(v[0], d[0]), num(v[1], d[1])] : d.slice(); }

  function opts(params) {
    params = params || {};
    var tune = SR.minigame.tune;
    var o = { mode: params.mode === 'conveyor' ? 'conveyor' : 'tickets' };
    var tb = o.mode === 'conveyor' ? 'jobs.hustle.sortit.' : 'jobs.hustle.orderup.';
    var m = tune('jobs.hustle.m', [0.7, 1.3]);
    var every = tune(tb + 'ticketEverySec', [6, 3]);
    o.mMin = m[0];
    o.mMax = m[1];
    o.autoM = tune('jobs.hustle.auto', 1.0);
    o.seconds = tune(tb + 'sec', 30);
    o.everyFrom = every[0];
    o.everyTo = every[1];
    o.base = tune(tb + 'base', 0.7);
    o.perCorrect = tune(tb + 'perCorrect', 0.075);
    o.perWrong = tune(tb + 'perWrong', 0.1);
    o.sortPer = tune('jobs.hustle.sortit.itemsPerCorrect', 3);
    var items = pair(tune('jobs.hustle.orderup.items', ITEMS_PER_TICKET), ITEMS_PER_TICKET);
    o.itemsMin = items[0];
    o.itemsMax = items[1];
    var streak = tune('jobs.hustle.sortit.streak', {});
    o.streakStep = num(streak.step, STREAK_STEP);
    o.streakMax = num(streak.max, STREAK_MAX);
    o.streakEvery = Math.max(1, num(streak.every, STREAK_EVERY));
    var travel = pair(tune('jobs.hustle.sortit.travelSec', BELT_TRAVEL), BELT_TRAVEL);
    o.travelFrom = travel[0];
    o.travelTo = travel[1];
    o.assistSpeed = tune('world.assist.speed', ASSIST_SPEED);
    ['seconds', 'everyFrom', 'everyTo', 'base', 'perCorrect', 'perWrong', 'sortPer', 'itemsMin', 'itemsMax', 'streakStep', 'streakMax', 'streakEvery',
      'travelFrom', 'travelTo', 'mMin', 'mMax']
      .forEach(function (k) { if (typeof params[k] === 'number') o[k] = params[k]; });
    var n = o.mode === 'conveyor' ? 3 : 6;
    var bins = Array.isArray(params.bins) && params.bins.length ? params.bins.slice(0, n) : [];
    for (var i = bins.length; i < n; i++) bins.push({ id: 'bin' + (i + 1), label: 'mg.frame.sr.bin' + (i + 1) });
    o.bins = bins;
    if (o.mode === 'conveyor') {
      var items = Array.isArray(params.items) && params.items.length ? params.items.slice() : [];
      if (!items.length) bins.forEach(function (bb, j) { items.push({ id: bb.id, label: bb.label, icon: bb.icon, bin: j }); });
      o.items = items;
    }
    return o;
  }

  /** @returns {number} m for a round's correct and wrong counts (B-05; float noise removed). */
  function grade(o, correct, wrong) {
    return round3(clamp(o.base + o.perCorrect * correct - o.perWrong * wrong, o.mMin, o.mMax));
  }

  /** @returns {number} the streak multiplier for a right sort after `streak` right sorts in a row. */
  function streakMult(o, streak) {
    return Math.min(o.streakMax, 1 + o.streakStep * Math.floor(streak / o.streakEvery));
  }

  // Layout in play-area units (1280 × 576).
  var BAR = { x: 40, y: 14, w: 1200, h: 12 };
  var TICKET = { x: 40, y: 44, w: 168, h: 172, gap: 16, max: 6 };
  var TRAY = { x: 330, y: 244, w: 560, h: 124 };
  var SERVE = { x: 930, y: 262, w: 250, h: 88 };
  var BIN6 = { x: 60, y: 400, w: 180, h: 150, gap: 16 };
  var BELT = { x: 530, y: 36, w: 220, h: 350 };
  var BIN3 = [{ x: 170, y: 406, w: 290, h: 150 }, { x: 495, y: 406, w: 290, h: 150 }, { x: 820, y: 406, w: 290, h: 150 }];

  function inRect(r, x, y) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function create(host, params) {
    var o = opts(params);
    var art = host.skin && host.skin.art || null;
    var T = host.text;
    var st = {
      t: 0, nextAt: 0, done: false, correct: 0, wrong: 0, score: 0, rightItems: 0, streak: 0,
      queue: [], tray: [], cursor: 0, usedCursor: false, items: [], serial: 0,
      flashBin: -1, flashT: 0, flashOk: false, served: 0, missed: 0,
    };

    function binLabel(i) { return T(o.bins[i].label); }
    function itemLabel(it) { return T(it.label); }
    function scale() { return host.assist ? o.assistSpeed : 1; }
    function left() { return Math.max(0, o.seconds - st.t); }
    function m() { return o.mode === 'conveyor' ? grade(o, st.score, st.wrong) : grade(o, st.correct, st.wrong); }

    function flash(bin, ok) { st.flashBin = bin; st.flashOk = ok; st.flashT = FLASH; }

    function mirror() {
      host.label('status', T('mg.frame.sr.status', { s: Math.ceil(left()), m: m().toFixed(2) }));
      if (o.mode === 'tickets') {
        var tk = st.queue[0];
        host.label('ticket', tk ? T('mg.frame.sr.ticketMirror', {
          items: tk.items.map(binLabel).join(', '), done: st.tray.length, total: tk.items.length, waiting: st.queue.length - 1,
        }) : T('mg.frame.sr.noTicket'));
      } else {
        var it = st.items[0];
        host.label('belt', it ? T('mg.frame.sr.frontMirror', { item: itemLabel(o.items[it.kind]) }) : T('mg.frame.sr.emptyBelt'));
      }
    }

    // ---- tickets -------------------------------------------------------------------------
    function spawnTicket() {
      var n = host.fx.int(o.itemsMin, o.itemsMax), items = [];
      for (var i = 0; i < n; i++) items.push(host.fx.int(0, o.bins.length - 1));
      st.queue.push({ id: ++st.serial, items: items });
      if (st.queue.length === 1) host.aria(T('mg.frame.sr.newTicket', { items: items.map(binLabel).join(', ') }));
    }

    function pressBin(i) {
      if (st.done || i < 0 || i >= o.bins.length) return;
      var tk = st.queue[0];
      if (!tk) { flash(i, false); return; }
      if (st.tray.length < tk.items.length && tk.items[st.tray.length] === i) {
        st.tray.push(i);
        flash(i, true);
        host.audio.sfx('mg_item');
      } else {
        st.wrong++;
        flash(i, false);
        host.audio.sfx('error');
        host.aria(T('mg.frame.sr.wrongItem', { item: binLabel(i) }));
      }
      mirror();
    }

    function serve() {
      if (st.done) return;
      var tk = st.queue[0];
      if (!tk) return;
      var ok = st.tray.length === tk.items.length;
      if (ok) st.correct++; else st.wrong++;
      st.served++;
      st.queue.shift();
      st.tray = [];
      host.audio.sfx(ok ? 'mg_serve' : 'error');
      if (ok && host.haptic) host.haptic();
      host.aria(T(ok ? 'mg.frame.sr.served' : 'mg.frame.sr.incomplete', { n: st.correct }));
      var next = st.queue[0];
      if (next) host.aria(T('mg.frame.sr.newTicket', { items: next.items.map(binLabel).join(', ') }));
      mirror();
    }

    // ---- conveyor ------------------------------------------------------------------------
    function spawnItem() {
      var k = host.fx.int(0, o.items.length - 1);
      st.items.push({ id: ++st.serial, kind: k, bin: o.items[k].bin, p: 0 });
      if (st.items.length === 1) host.aria(T('mg.frame.sr.front', { item: itemLabel(o.items[k]) }));
    }

    function sort(b) {
      if (st.done || b < 0 || b > 2) return;
      var it = st.items.shift();
      if (!it) return;
      if (it.bin === b) {
        st.score += streakMult(o, st.streak) / o.sortPer;
        st.streak++;
        st.rightItems++;
        flash(b, true);
        host.audio.sfx('mg_bin');
        if (host.haptic) host.haptic();
      } else {
        st.wrong++;
        st.streak = 0;
        flash(b, false);
        host.audio.sfx('error');
      }
      host.aria(T(it.bin === b ? 'mg.frame.sr.sortRight' : 'mg.frame.sr.sortWrong', { bin: binLabel(b), streak: streakMult(o, st.streak).toFixed(1) }));
      if (st.items[0]) host.aria(T('mg.frame.sr.front', { item: itemLabel(o.items[st.items[0].kind]) }));
      mirror();
    }

    function end() {
      if (st.done) return;
      st.done = true;
      host.finish(o.mode === 'conveyor'
        ? { m: grade(o, st.score, st.wrong), hits: st.rightItems, misses: st.wrong }
        : { m: grade(o, st.correct, st.wrong), hits: st.correct, misses: st.wrong });
    }

    if (o.mode === 'tickets') {
      host.hints([
        { range: ['bin1', 'bin6'], label: 'mg.frame.sr.add', only: 'kb' },
        { actions: ['left', 'right'], label: 'mg.frame.sr.choose', only: 'pad' },
        { action: 'confirm', label: 'mg.frame.sr.add', only: 'pad' },
        { action: 'serve', label: 'mg.frame.sr.serve' },
        { label: 'mg.frame.sr.tapBins', only: 'touch' },
      ]);
    } else {
      host.hints([{ actions: ['left', 'down', 'right'], label: 'mg.frame.sr.sort' }, { label: 'mg.frame.sr.tapSort', only: 'touch' }]);
    }
    mirror();

    // ---- drawing -------------------------------------------------------------------------
    function drawItem(ctx, def, x, y, size, k) {
      if (art && typeof art.item === 'function' && art.item(ctx, def.id, x, y, size, host)) return;
      if (def.icon && SR.art && typeof SR.art.icon === 'function' && SR.reg.icon[def.icon]) {
        SR.art.icon(ctx, def.icon, x - size / 2, y - size / 2, size);
        return;
      }
      var kind = KINDS[k % KINDS.length];
      ctx.fillStyle = host.color(kind);
      ctx.beginPath();
      ctx.arc(x, y, size / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = host.color('ink-900');
      ctx.stroke();
      ctx.fillStyle = host.color('paper-0');
      ctx.font = host.font(Math.round(size * 0.42), 900, true);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(T(def.label).slice(0, 2).toUpperCase(), x, y + 1);
    }

    function drawBin(ctx, r, i, glyph, cursor) {
      var kind = KINDS[i % KINDS.length];
      var fl = st.flashT > 0 && st.flashBin === i;
      roundRect(ctx, r.x, r.y, r.w, r.h, 16);
      ctx.fillStyle = fl ? host.color(st.flashOk ? 'ok' : 'danger') : host.color(kind + '-100');
      ctx.fill();
      ctx.lineWidth = cursor ? 5 : 2;
      ctx.strokeStyle = cursor ? host.color('focus') : host.color('ink-900');
      ctx.stroke();
      if (cursor) { ctx.lineWidth = 1; ctx.strokeStyle = host.color('ink-900'); roundRect(ctx, r.x - 4, r.y - 4, r.w + 8, r.h + 8, 19); ctx.stroke(); }
      drawItem(ctx, o.bins[i], r.x + r.w / 2, r.y + r.h / 2 - 12, 64, i);
      ctx.fillStyle = host.color('ink-900');
      ctx.font = host.font(18, 700);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(binLabel(i), r.x + r.w / 2, r.y + r.h - 14);
      if (glyph && host.device !== 'touch') {
        roundRect(ctx, r.x + 8, r.y + 8, 30, 26, 4);
        ctx.fillStyle = host.color('paper-0');
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = host.color('ink-900');
        ctx.stroke();
        ctx.fillStyle = host.color('ink-900');
        ctx.font = host.font(15, 700);
        ctx.textBaseline = 'middle';
        ctx.fillText(glyph, r.x + 23, r.y + 22);
      }
    }

    function binRect(i) { return { x: BIN6.x + i * (BIN6.w + BIN6.gap), y: BIN6.y, w: BIN6.w, h: BIN6.h }; }

    function renderTickets(ctx) {
      // the ticket rail
      ctx.strokeStyle = host.color('ink-700');
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(24, 40); ctx.lineTo(1256, 40); ctx.stroke();
      var shown = st.queue.slice(0, TICKET.max);
      shown.forEach(function (tk, i) {
        var x = TICKET.x + i * (TICKET.w + TICKET.gap), y = TICKET.y;
        roundRect(ctx, x, y, TICKET.w, TICKET.h, 6);
        ctx.fillStyle = host.color('paper-0');
        ctx.fill();
        ctx.lineWidth = i === 0 ? 4 : 2;
        ctx.strokeStyle = i === 0 ? host.color('primary-500') : host.color('ink-900');
        ctx.stroke();
        ctx.fillStyle = host.color('ink-700');
        ctx.font = host.font(14, 700);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText('#' + tk.id, x + 10, y + 22);
        tk.items.forEach(function (b, j) {
          var yy = y + 34 + j * 27;
          var done = i === 0 && j < st.tray.length;
          ctx.fillStyle = done ? host.color('ink-500') : host.color('ink-900');
          ctx.font = host.font(14, 700);
          ctx.textBaseline = 'middle';
          ctx.fillText(String(j + 1), x + 10, yy + 10);
          drawItem(ctx, o.bins[b], x + 34, yy + 10, 20, b);
          ctx.fillStyle = done ? host.color('ink-500') : host.color('ink-900');
          ctx.font = host.font(15, 600);
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(binLabel(b), x + 50, yy + 10);
          if (done) { ctx.strokeStyle = host.color('ok'); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 48, yy + 10); ctx.lineTo(x + TICKET.w - 10, yy + 10); ctx.stroke(); }
        });
      });
      if (st.queue.length > TICKET.max) {
        ctx.fillStyle = host.color('ink-700');
        ctx.font = host.font(16, 700);
        ctx.textAlign = 'right';
        ctx.fillText('+' + (st.queue.length - TICKET.max), 1250, 60);
      }
      // the tray
      roundRect(ctx, TRAY.x, TRAY.y, TRAY.w, TRAY.h, 60);
      ctx.fillStyle = host.color('paper-0');
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = host.color('ink-900');
      ctx.stroke();
      if (!st.tray.length) {
        ctx.fillStyle = host.color('ink-500');
        ctx.font = host.font(18, 600);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(T(st.queue.length ? 'mg.frame.sr.trayHint' : 'mg.frame.sr.noTicket'), TRAY.x + TRAY.w / 2, TRAY.y + TRAY.h / 2);
      }
      st.tray.forEach(function (b, j) { drawItem(ctx, o.bins[b], TRAY.x + 70 + j * 100, TRAY.y + TRAY.h / 2, 72, b); });
      // the serve button
      var ready = st.queue[0] && st.tray.length === st.queue[0].items.length;
      roundRect(ctx, SERVE.x, SERVE.y, SERVE.w, SERVE.h, 10);
      ctx.fillStyle = ready ? host.color('primary-600') : host.color('paper-0');
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = host.color('ink-900');
      ctx.stroke();
      ctx.fillStyle = ready ? host.color('primary-ink') : host.color('ink-900');
      ctx.font = host.font(26, 900, true);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(T('mg.frame.sr.serve').toUpperCase(), SERVE.x + SERVE.w / 2, SERVE.y + SERVE.h / 2);
      // the bins
      for (var i = 0; i < o.bins.length; i++) drawBin(ctx, binRect(i), i, String(i + 1), st.usedCursor && st.cursor === i);
    }

    function renderConveyor(ctx) {
      roundRect(ctx, BELT.x, BELT.y, BELT.w, BELT.h, 12);
      ctx.fillStyle = host.color('paper-3');
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = host.color('ink-900');
      ctx.stroke();
      ctx.save();
      roundRect(ctx, BELT.x, BELT.y, BELT.w, BELT.h, 12);
      ctx.clip();
      ctx.strokeStyle = host.color('ink-300');
      ctx.lineWidth = 3;
      var off = (st.t * 60) % 40;
      for (var y = BELT.y - 40 + off; y < BELT.y + BELT.h; y += 40) {
        ctx.beginPath(); ctx.moveTo(BELT.x, y); ctx.lineTo(BELT.x + BELT.w, y); ctx.stroke();
      }
      ctx.restore();
      st.items.forEach(function (it, i) {
        var yy = BELT.y + 44 + it.p * (BELT.h - 88);
        if (i === 0) {
          ctx.lineWidth = 5;
          ctx.strokeStyle = host.color('focus');
          ctx.beginPath(); ctx.arc(BELT.x + BELT.w / 2, yy, 50, 0, Math.PI * 2); ctx.stroke();
        }
        drawItem(ctx, o.items[it.kind], BELT.x + BELT.w / 2, yy, 80, o.items[it.kind].bin);
      });
      var arrows = ['←', '↓', '→'];
      for (var b = 0; b < 3; b++) drawBin(ctx, BIN3[b], b, arrows[b], false);
      // streak
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = host.color('ink-900');
      ctx.font = host.font(22, 900, true);
      ctx.fillText(T('mg.frame.sr.streak', { x: streakMult(o, st.streak).toFixed(1) }), 820, 120);
      ctx.font = host.font(18, 600);
      ctx.fillStyle = host.color('ink-700');
      ctx.fillText(T('mg.frame.sr.sorted', { n: st.rightItems, wrong: st.wrong }), 820, 156);
      // the legend: which item goes where
      ctx.font = host.font(16, 600);
      ctx.fillStyle = host.color('ink-700');
      o.items.forEach(function (it, i) {
        ctx.fillText(arrows[it.bin] + '  ' + itemLabel(it) + ' · ' + binLabel(it.bin), 60, 90 + i * 28);
      });
    }

    return {
      update: function (dt) {
        if (st.done) return;
        var g = dt * scale();
        st.t += g;
        if (st.flashT > 0) st.flashT -= dt;
        if (o.mode === 'tickets') {
          while (st.t >= st.nextAt && st.nextAt < o.seconds) {
            spawnTicket();
            st.nextAt += lerp(o.everyFrom, o.everyTo, st.nextAt / o.seconds);
            mirror();
          }
        } else {
          while (st.t >= st.nextAt && st.nextAt < o.seconds) {
            spawnItem();
            st.nextAt += lerp(o.everyFrom, o.everyTo, st.nextAt / o.seconds) / o.sortPer;
          }
          var travel = lerp(o.travelFrom, o.travelTo, st.t / o.seconds);
          for (var i = 0; i < st.items.length; i++) st.items[i].p += g / travel;
          while (st.items.length && st.items[0].p >= 1) {
            st.items.shift();
            st.missed++;
            st.streak = 0;
            host.aria(T('mg.frame.sr.missedItem'));
            mirror();
          }
        }
        if (Math.ceil(left()) !== st.lastSec) { st.lastSec = Math.ceil(left()); mirror(); }
        if (st.t >= o.seconds) end();
      },
      onAction: function (a, ev) {
        if (st.done) return;
        var rep = ev && ev.repeat;
        var bm = /^bin(\d)$/.exec(a);
        if (o.mode === 'tickets') {
          if (bm && !rep) { pressBin(+bm[1] - 1); return; }
          if (a === 'serve' && !rep) { serve(); return; }
          if (a === 'left' || a === 'right') { st.usedCursor = true; st.cursor = (st.cursor + (a === 'left' ? -1 : 1) + o.bins.length) % o.bins.length; return; }
          if (a === 'confirm' && !rep) { st.usedCursor = true; pressBin(st.cursor); }
          return;
        }
        if (rep) return;
        if (a === 'left') sort(0);
        else if (a === 'down') sort(1);
        else if (a === 'right') sort(2);
        else if (bm && +bm[1] <= 3) sort(+bm[1] - 1);
      },
      pointer: function (kind, x, y) {
        if (kind !== 'down' || st.done) return;
        if (o.mode === 'tickets') {
          if (inRect(SERVE, x, y)) { serve(); return; }
          for (var i = 0; i < o.bins.length; i++) if (inRect(binRect(i), x, y)) { pressBin(i); return; }
          return;
        }
        for (var b = 0; b < 3; b++) if (inRect(BIN3[b], x, y)) { sort(b); return; }
      },
      progress: function () { return { correct: st.correct, wrong: st.wrong, t: st.t }; },
      peek: function () {
        return {
          mode: o.mode, t: st.t, left: left(), seconds: o.seconds, correct: st.correct, wrong: st.wrong, score: st.score,
          rightItems: st.rightItems, streak: st.streak, m: m(), done: st.done, cursor: st.cursor,
          ticket: st.queue[0] ? st.queue[0].items.slice() : null, tray: st.tray.slice(), queued: st.queue.length,
          front: st.items[0] ? { bin: st.items[0].bin, p: st.items[0].p } : null, belt: st.items.length,
          rects: o.mode === 'tickets'
            ? { serve: SERVE, bins: o.bins.map(function (b, i) { return binRect(i); }) }
            : { bins: BIN3 },
        };
      },
      destroy: function () {},
      render: function (ctx) {
        if (art && typeof art.backdrop === 'function') art.backdrop(ctx, 1280, 576, host);
        // the timer bar
        roundRect(ctx, BAR.x, BAR.y, BAR.w, BAR.h, 6);
        ctx.fillStyle = host.color('paper-3');
        ctx.fill();
        var f = clamp(left() / o.seconds, 0, 1);
        if (f > 0) {
          roundRect(ctx, BAR.x, BAR.y, Math.max(12, BAR.w * f), BAR.h, 6);
          ctx.fillStyle = host.color(f < 0.2 ? 'danger' : 'time');
          ctx.fill();
        }
        if (o.mode === 'tickets') renderTickets(ctx); else renderConveyor(ctx);
      },
    };
  }

  SR.minigame.register('shiftrush', {
    title: 'mg.frame.sr.title',
    // CONTRACT §12.3 names this engine's context `orderup`: bin1-bin6 on Digit1-Digit6, serve on
    // Enter (plus Numpad and Y). Sort It uses bin1-bin3 of the same map beside the arrows.
    context: 'orderup',
    keys: {
      bin1: ['Digit1', 'Numpad1'], bin2: ['Digit2', 'Numpad2'], bin3: ['Digit3', 'Numpad3'],
      bin4: ['Digit4', 'Numpad4'], bin5: ['Digit5', 'Numpad5'], bin6: ['Digit6', 'Numpad6'],
      serve: ['Enter', 'NumpadEnter', 'Pad3'],
    },
    /** @returns {object} the interactive round (ARCHITECTURE §10 instance). */
    create: create,
    /** @returns {object} the Auto shift: m = 1.0 exactly (B-05; not a sample). */
    auto: function (state, params) { return { m: opts(params).autoM, hits: 0, misses: 0, auto: true }; },
    /** @returns {object} the lowest grade. */
    worst: function (params) { return { m: opts(params).mMin, hits: 0, misses: 0 }; },
    /** @returns {object} leaving a hustle early takes the Auto shift. */
    forfeit: function (params) { return { m: opts(params).autoM, hits: 0, misses: 0, auto: true, exited: true }; },
    /** @returns {string} the result banner's line. */
    summary: function (r, text) { return text('mg.frame.sr.summary', { m: (+r.m).toFixed(2), hits: r.hits, misses: r.misses }); },
    // pure pieces for tests and tools
    opts: opts,
    grade: function (params, correct, wrong) { return grade(opts(params), correct, wrong); },
    streakMult: function (params, streak) { return streakMult(opts(params), streak); },
    /** Assist's speed factor (world.assist.speed; 0.7 without the row). */
    get ASSIST_SPEED() { return SR.minigame.tune ? SR.minigame.tune('world.assist.speed', ASSIST_SPEED) : ASSIST_SPEED; },
  });
})();
