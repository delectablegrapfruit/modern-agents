// js/scenes/building.js — owner: W1-D. The `building` scene (UI.md §5.6; ARCHITECTURE §5, §9.2):
// the interior diorama in x 0-760 (SR.art.interior(id), or a paper placeholder until the
// building's interior lands), the action card at 776-1248 × 72-704 and the compact HUD.
// params = { id, params, screen?, screenParams? } (CONTRACT §11.3): id is a building def id,
// params come from the door resolver (home doors: { homeId, mode }), screen opens a sub-screen on
// arrival. Arrival runs `world.enter` (silent) and emits door:entered; leaving goes to the city and
// emits door:exited with the minutes spent inside (the time-lapse listens).
// Load-time rule: defines functions and registers the scene only.
(function () {
  'use strict';
  var SR = window.SR;

  var FLOAT_RISE = 40;        // FloatText: rises 40 u over 900 ms, fades the last 300 ms (ART_AUDIO §12)
  var FLOAT_MS = 900;
  var FLOAT_FADE_MS = 300;
  var REACT_S = 0.8;          // proprietor react pose length
  var VIEW_W = 760;           // the diorama's width (the card covers the rest)
  var YOU = { x: 250, y: 560 };
  var OWNER = { x: 360, y: 430 };
  var FLOAT_TOKEN = { hp: '--hp', hpMax: '--hp', cash: '--money', bank: '--money', karma: '--karma-zero', heat: '--heat',
    str: '--str', int: '--int', cha: '--cha', time: '--time' };

  var B = null;               // the scene's state while it is on the stack

  function D() { return SR.ui.dom; }

  function interiorFor(def, params) {
    if (!SR.art || typeof SR.art.interior !== 'function') return null;
    var iid = def.interior || def.id;
    if (SR.reg.interior && !SR.reg.interior[iid]) return null;
    try { return SR.art.interior(iid, params) || null; } catch (e) {
      SR.util.warnOnce('ui.interior.' + iid, 'building: SR.art.interior("' + iid + '") failed: ' + e.message);
      return null;
    }
  }

  function stageScale() { return (SR.stage && SR.stage.scale) || 1; }

  // ---- the placeholder diorama (tokens only; W1-A's kit and each building's interior replace it) ----
  var CLIP = { idle: 'idle', happy: 'happy', shock: 'shock', work: 'work', talk: 'talk' };
  var stickOpts = {};
  function drawStick(ctx, x, y, s, pose, t, who) {
    if (SR.art && SR.art.stick && typeof SR.art.stick.draw === 'function') {
      try {
        stickOpts.x = x; stickOpts.y = y; stickOpts.view = 'side'; stickOpts.scale = s; stickOpts.t = t;
        stickOpts.facing = who === 'you' ? 'right' : 'left';
        stickOpts.look = who === 'you' ? 'player' : (who || undefined);
        stickOpts.player = who === 'you';
        stickOpts.mood = pose === 'happy' ? 'happy' : pose === 'shock' ? 'surprised' : 'neutral';
        SR.art.stick.draw(ctx, CLIP[pose] || 'idle', stickOpts);
        return;
      } catch (e) { SR.util.warnOnce('ui.stick', 'building: SR.art.stick.draw failed: ' + e.message); }
    }
    var bob = pose === 'happy' ? Math.abs(Math.sin(t * 12)) * 6 : 0;
    ctx.save();
    ctx.translate(x, y - bob);
    ctx.scale(s, s);
    ctx.strokeStyle = D().token('--ink-900');
    ctx.fillStyle = D().token('--paper-0');
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.arc(0, -172, 28, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    var arm = pose === 'happy' ? -60 : pose === 'shock' ? -80 : 20;
    ctx.beginPath();
    ctx.moveTo(0, -144); ctx.lineTo(0, -60);
    ctx.moveTo(0, -124); ctx.lineTo(-40, -124 + arm); ctx.moveTo(0, -124); ctx.lineTo(40, -124 + arm);
    ctx.moveTo(0, -60); ctx.lineTo(-28, 0); ctx.moveTo(0, -60); ctx.lineTo(28, 0);
    ctx.stroke();
    ctx.restore();
  }

  function drawPlaceholder(ctx, t) {
    var tok = D().token;
    var W = SR.W || 1280, H = SR.H || 720, floorY = 470;
    ctx.fillStyle = tok('--paper-1');
    ctx.fillRect(0, 0, W, floorY);
    ctx.fillStyle = tok('--paper-2');
    ctx.fillRect(0, floorY, W, H - floorY);
    // Perspective floor lines toward the vanishing point near (400, 300) (ART_AUDIO §9).
    ctx.strokeStyle = tok('--paper-3');
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var x = -800; x <= W + 800; x += 160) { ctx.moveTo(400 + (x - 400) * 0.35, floorY); ctx.lineTo(x, H); }
    for (var y = floorY + 40; y < H; y += 60 + (y - floorY) * 0.3) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
    ctx.strokeStyle = tok('--ink-900');
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, floorY); ctx.lineTo(W, floorY); ctx.stroke();
    // The window with the live sky.
    var win = { x: 60, y: 90, w: 220, h: 140 };
    var drew = false;
    if (SR.render && SR.render.sky && typeof SR.render.sky.drawWindow === 'function') {
      try { SR.render.sky.drawWindow(ctx, win); drew = true; } catch (e) { SR.util.warnOnce('ui.skywin', 'building: sky.drawWindow failed: ' + e.message); }
    }
    if (!drew) { ctx.fillStyle = tok('--primary-100'); ctx.fillRect(win.x, win.y, win.w, win.h); }
    ctx.strokeStyle = tok('--ink-900');
    ctx.lineWidth = 3;
    ctx.strokeRect(win.x, win.y, win.w, win.h);
    ctx.beginPath(); ctx.moveTo(win.x + win.w / 2, win.y); ctx.lineTo(win.x + win.w / 2, win.y + win.h); ctx.stroke();
    // The sign board with the building's name.
    var brand = D().paint('bld.' + (B.def.exteriorId || B.def.id) + '.walls') || tok('--primary-500');
    ctx.fillStyle = tok('--paper-0');
    ctx.fillRect(330, 100, 360, 90);
    ctx.strokeRect(330, 100, 360, 90);
    ctx.fillStyle = brand;
    ctx.fillRect(330, 100, 360, 10);
    ctx.fillStyle = tok('--ink-900');
    ctx.font = '900 34px ' + tok('--font-display');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(D().t(B.def.name || 'place.' + B.def.id).toUpperCase(), 510, 150, 330);
    // The proprietor behind the counter, the counter, then you in front.
    drawStick(ctx, OWNER.x, OWNER.y + 40, 0.9, B.ownerPose, t, B.def.owner || B.def.portrait);
    ctx.fillStyle = brand;
    ctx.fillRect(120, 400, 520, 100);
    ctx.fillStyle = tok('--paper-0');
    ctx.fillRect(120, 400, 520, 18);
    ctx.strokeStyle = tok('--ink-900');
    ctx.strokeRect(120, 400, 520, 100);
    drawStick(ctx, YOU.x, YOU.y + 90, 1, B.youPose, t, 'you');
  }

  function drawInterior(ctx) {
    var s = SR.state;
    if (B.interior) {
      var scale = stageScale();
      if (!B.cache || B.cacheScale !== scale || B.cacheDirty) {
        B.cache = B.cache || document.createElement('canvas');
        B.cache.width = Math.round((SR.W || 1280) * scale);
        B.cache.height = Math.round((SR.H || 720) * scale);
        var c = B.cache.getContext('2d');
        c.setTransform(scale, 0, 0, scale, 0, 0);
        c.clearRect(0, 0, SR.W || 1280, SR.H || 720);
        try { B.interior.drawStatic(c, s); } catch (e) { SR.util.warnOnce('ui.int.static.' + B.id, 'building: drawStatic failed: ' + e.message); }
        B.cacheScale = scale;
        B.cacheDirty = false;
      }
      ctx.drawImage(B.cache, 0, 0, SR.W || 1280, SR.H || 720);
      if (typeof B.interior.drawAnim === 'function') {
        try {
          B.interior.drawAnim(ctx, B.t, s, { owner: { id: B.def.owner || B.def.portrait, pose: B.ownerPose }, you: { pose: B.youPose } });
        } catch (e2) { SR.util.warnOnce('ui.int.anim.' + B.id, 'building: drawAnim failed: ' + e2.message); }
      }
    } else {
      drawPlaceholder(ctx, B.t);
    }
  }

  function spawnFloats(res) {
    if (!res || !res.ok) return;
    var n = 0;
    (res.deltas || []).forEach(function (d) {
      if (!d || !d.n || n >= 3 || d.kind === 'time' || d.kind === 'item') return;
      var c = SR.ui.chip.fromDelta(d);
      if (!c) return;
      var key = d.kind === 'stat' ? d.key : d.kind;
      B.floats.push({ text: c.textContent, colour: FLOAT_TOKEN[key] || '--ink-900', x: YOU.x + (n % 2 ? 40 : -20), y: YOU.y - 100 - n * 26, age: 0 });
      n++;
    });
  }

  function drawFloats(ctx) {
    if (!B.floats.length) return;
    var tok = D().token;
    ctx.save();
    ctx.font = '900 20px ' + tok('--font-display');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = tok('--ink-900');
    B.floats.forEach(function (f) {
      var ms = f.age * 1000;
      var k = Math.min(1, ms / FLOAT_MS);
      ctx.globalAlpha = ms > FLOAT_MS - FLOAT_FADE_MS ? Math.max(0, (FLOAT_MS - ms) / FLOAT_FADE_MS) : 1;
      var y = f.y - FLOAT_RISE * SR.util.easeOut(k);
      ctx.strokeText(f.text, f.x, y);
      ctx.fillStyle = tok(f.colour);
      ctx.fillText(f.text, f.x, y);
    });
    ctx.restore();
  }

  function onResult(res, def) {
    if (!B || !res) return;
    if (res.ok) {
      B.ownerPose = def && def.group === 'crime' ? 'shock' : 'happy';
      B.youPose = def && def.group === 'work' ? 'work' : 'happy';
      B.poseT = REACT_S;
      spawnFloats(res);
      if ((res.deltas || []).some(function (d) { return d && (d.kind === 'furniture' || d.kind === 'home'); })) B.cacheDirty = true;
    }
  }

  function minutesOf(s) { return s && s.clock ? (s.clock.day - 1) * 1440 + s.clock.min : 0; }

  SR.scenes.register('building', {
    kind: 'base',
    enter: function (params) {
      params = params || {};
      var id = params.id;
      var def = (SR.reg.building && SR.reg.building[id]) || { id: id, name: 'place.' + id };
      B = { id: id, def: def, params: params.params || {}, t: 0, floats: [], ownerPose: 'idle', youPose: 'idle', poseT: 0,
        cache: null, cacheScale: 0, cacheDirty: true, entered: minutesOf(SR.state), unsubs: [] };
      B.interior = interiorFor(def, B.params);
      if (SR.state && typeof SR.act === 'function' && SR.reg.action['world.enter']) {
        try { SR.act('world.enter', { building: id }); } catch (e) { console.error('building: world.enter failed', e); }
      }
      if (def.music && SR.audio && typeof SR.audio.music === 'function') {
        try { SR.audio.music(def.music); } catch (e2) { SR.util.warnOnce('ui.music.' + id, 'building: music failed: ' + e2.message); }
      }
      B.unsubs.push(SR.events.on('stage:resized', function () { if (B) B.cacheDirty = true; }));
      B.unsubs.push(SR.events.on('home:changed', function () { if (B) B.cacheDirty = true; }));
      SR.events.emit('door:entered', { id: id, min: SR.state && SR.state.clock ? SR.state.clock.min : 0 });
    },
    exit: function () {
      if (!B) return;
      B.unsubs.forEach(function (f) { f(); });
      var spent = Math.max(0, minutesOf(SR.state) - B.entered);
      var id = B.id;
      B = null;
      SR.events.emit('door:exited', { id: id, spentMin: spent });
    },
    pause: function () { SR.ui.card.stopRepeat(); SR.ui.hud.ghost(null); },
    resume: function () { SR.ui.card.refresh(); SR.ui.hud.invalidate(); },
    update: function (dt) {
      if (!B) return;
      B.t += dt;
      if (B.poseT > 0) { B.poseT -= dt; if (B.poseT <= 0) { B.ownerPose = 'idle'; B.youPose = 'idle'; } }
      for (var i = B.floats.length - 1; i >= 0; i--) {
        B.floats[i].age += dt;
        if (B.floats[i].age * 1000 >= FLOAT_MS) B.floats.splice(i, 1);
      }
      SR.ui.card.update(dt);
    },
    render: function (ctx) {
      if (!B || !ctx) return;
      drawInterior(ctx);
      drawFloats(ctx);
    },
    onAction: function (action, ev) { return SR.ui.card.onAction(action, ev); },
    ui: {
      mount: function (root, params) {
        root.classList.add('scene-building');
        SR.ui.hud.mount(root, { compact: true });
        SR.ui.card.mount(root, params || {}, { onResult: onResult });
      },
      unmount: function () {
        SR.ui.card.unmount();
        SR.ui.hud.unmount();
      },
    },
  });

  // Exposed for tests and the debug overlay.
  SR.ui.building = {
    /** @returns {{id: string, interior: boolean, floats: number}|null} the scene's state summary. */
    info: function () { return B ? { id: B.id, interior: !!B.interior, floats: B.floats.length, ownerPose: B.ownerPose, viewW: VIEW_W } : null; },
  };
})();
