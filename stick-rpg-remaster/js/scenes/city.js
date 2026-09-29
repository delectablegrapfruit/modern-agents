// js/scenes/city.js — owner: W2-City. The `city` scene (UI.md §5.5, §4.1; ARCHITECTURE §5, §8.6):
// the world's update and the render core's frame, the HUD on the map (W1-D's HUD, the minimap, the
// ContextPrompt, the touch cluster), and everything the city presents on top of the world.
// - Entering: the world starts from the state (SR.world.start) and, back from a building (Leave
//   passes params.from), you step out of its door (SR.world.doors.exit); the silent world.city
//   action runs the nomination check (GDD §4.17); traffic and pedestrians come alive.
// - Input (CONTRACT §12, UI.md §6): interact enters the prompted door (park and enter by car) or
//   talks to the street person in range (a street dialog: SR.world.streetnpcs.talk when W2-Street
//   provides it, else a Dialog sheet of that person's `street:<id>` actions); car, zoom, Tab /
//   Select for the Pocket (M, I, J open its Map, Bag and Journal tabs), Esc / Start for Pause, N the
//   minimap, H the minimal HUD; click or tap the ground to walk there (the left half of a touch
//   screen is the stick); touch buttons Action, Skate and Car.
// - Presentation: the ContextPrompt within 96 u ("[E] Enter McSticks", "[E] Talk to Harold",
//   "[E] Park and enter", "[C] Get in the car"), announced once per new prompt; world actions'
//   results (the fall's -10 HP and Pilot Ori's line, car hits and crashes, the car fished out of the
//   clouds, the nomination); the Fold Rescue (the drop, the paper plane's catch and the landing,
//   GDD §3.9, ART_AUDIO §12); the car-hit knockdown's stars and shake; "Phew"; walkers' barks; the
//   24:00 state (a chime and one toast a day); the touch stick.
// - Sound (ART_AUDIO §13.4-13.6): the day song and the night song cross-fade at 05:30 / 19:30 (the
//   rain variant with the `weather` flag), the city bed follows the traffic near you, the wind bed
//   the nearest unrailed edge (0 → -12 dB within 60 u), and the edge sounds of the fall.
// - The cab stub (P1, flag `phone`): SR.world.cab(doorId) runs world.cab and sets you down there.
(function () {
  'use strict';
  var SR = window.SR;

  // Presentation constants (CONTRACT D49); world numbers come from SR.world.cfg (BALANCE B-15).
  var DAY_SONG = 'crossroads_strut', NIGHT_SONG = 'streetlights';
  var NIGHT_FROM = 1170, DAY_FROM = 330;     // ART_AUDIO §13.4: the songs cross-fade at 19:30 and 05:30
  var SONG_FADE = 4;                         // s
  var AUDIO_SEC = 0.25;                      // how often the beds and the song are re-judged
  var WIND_MAX = 0.25;                       // -12 dB at the rim (GDD §3.9)
  var CITY_MIN = 0.3;                        // the city bed never drops below this with empty streets
  var TAP_MS = 400, TAP_MOVE = 16;           // a touch tap (tap-to-walk), in ms and CSS px
  var MINI = 184;                            // the minimap (UI.md §2.2)
  var MINI_TOP_TOUCH = 104;                  // touch layout: the minimap under the HUD
  var BARK_AFTER_HOP = 0.9;                  // s a hopped person's "Hey!" stays after the hop
  // The Fold Rescue drawn over the frame (ART_AUDIO §12): the stick shrinks to 40 % and spins 1.5
  // turns while it drops; the plane swoops in from the side, catches it and carries it home.
  var FOLD_OUT = 70, FOLD_SINK = 300, FOLD_SCALE = 0.4, FOLD_TURNS = 1.5;
  var PLANE_FROM = 420, PLANE_SIDE = 280, PLANE_Z = 200, PLANE_CRUISE_Z = 70, PLANE_EXIT = 0.8;
  var CLOUDS = [[-70, 0.0], [10, 0.18], [80, 0.36]];   // cloud puffs rushing up: side offset, start
  var STAR_N = 3, STAR_R = 14;               // the knockdown's circling stars
  var PERSON_BARK_Z = 64;                    // a named person's bark floats above their name tag
  var HIT_HAPTIC_MS = 30;                    // UI.md §6: 30 ms on hits

  function W() { return SR.world; }
  function D() { return SR.ui && SR.ui.dom; }
  function txt(k, v) { return SR.text && k ? SR.text(k, v) : ''; }
  function cfg() { return SR.world.cfg || (SR.world.cfg = SR.world.readCfg()); }
  function setting(k) { try { return SR.settings && typeof SR.settings.get === 'function' ? SR.settings.get(k) : undefined; } catch (e) { return undefined; } }
  function audio(fn) { var A = SR.audio; if (A && typeof A[fn] === 'function') { try { return A[fn].apply(A, Array.prototype.slice.call(arguments, 1)); } catch (e) { return null; } } return null; }

  var C = {
    root: null, prompt: null, promptKey: '', target: null,
    mini: null, miniCanvas: null, touch: null, skateOn: false,
    unsubs: [], world: null, onDown: null, onUp: null, tap: null,
    song: null, variant: null, audioT: 0, bed: -1, wind: -1,
    phase: 'none', saved: null, hits: 0, crashes: 0, plane: null, midnight: 0, midnightOf: null, left: -1,
    talkCache: {}, talking: false, entered: false,
    // One key fires several actions (E, Enter, Space, A: interact then confirm; Esc: back then
    // pause), all within one input event. `swallow` is the key whose other actions the city keeps
    // from the dialog it just opened (until that key is released); `arrived` is true while the
    // press that brought the city back to the top (Esc leaving a building or closing an overlay) is
    // still being dispatched, so its `pause` does not open the pause menu.
    swallow: null, arrived: false,
  };

  // ------------------------------------------------------------------------------------------------
  // Entering and leaving
  // ------------------------------------------------------------------------------------------------
  /** @returns {string|null} the worldmap door a building id comes back out of (Leave → the city). */
  function doorOf(from, s) {
    var G = W().geometry;
    if (G.doorById && G.doorById[from]) return from;
    var last = W().doors && W().doors.last;
    if (last && last.resolved && last.resolved.id === from) return last.id;     // a home door you walked into
    if (from === 'home') { var hd = W().homeDoor(s); return hd ? hd.id : null; }
    return null;
  }

  function live(on) {
    if (W().traffic) W().traffic.live = on;
    if (W().pedestrians) W().pedestrians.live = on;
  }
  /** @returns {number} the game's absolute minute (day × 1440 + clock). */
  function stamp() { var s = SR.state; return s && s.clock ? s.clock.day * 1440 + s.clock.min : -1; }

  /** The city is on top again: until the current input event is over, its `pause` is the press that got us here. */
  function arrive() {
    C.arrived = true;
    Promise.resolve().then(function () { C.arrived = false; });
  }

  function enter(params) {
    params = params || {};
    var s = SR.state;
    arrive();
    live(true);
    C.entered = false;
    C.song = songFor(clock()); C.variant = null;
    if (!s) return;
    var door = params.from ? doorOf(params.from, s) : null;
    W().start(s);
    if (door) W().doors.exit(door);
    // Time passed indoors: the street fills afresh for the new hour (the page turn hides it).
    if (C.left !== stamp() && W().pedestrians && W().pedestrians.invalidate) W().pedestrians.invalidate();
    C.phase = W().fall.phase; C.saved = W().fall.saved;
    C.hits = W().traffic ? W().traffic.stats.hits : 0;
    C.crashes = W().traffic ? W().traffic.stats.crashes : 0;
    C.plane = null;
  }

  function exit() {
    C.left = stamp();
    if (SR.state && W().ready) W().sync();
    live(false);
    audio('ambience', 'city', 0);
    audio('ambience', 'wind', 0);
    C.bed = -1; C.wind = -1;
    releaseSkate();
  }

  /** Stepping into the city runs the nomination check (GDD §4.17, CONTRACT §8.10). */
  function stepIn() {
    if (C.entered || !SR.state || typeof SR.act !== 'function' || !SR.reg.action['world.city']) return;
    C.entered = true;
    SR.act('world.city');
  }

  // ------------------------------------------------------------------------------------------------
  // Music and ambience (ART_AUDIO §13.4-13.6; W1-S request 8)
  // ------------------------------------------------------------------------------------------------
  function clock() { var s = SR.state; return s && s.clock ? s.clock.min : 720; }
  function weather() { var s = SR.state; return SR.features && SR.features.weather && s && s.world ? s.world.weather : 'clear'; }
  /** @returns {string} the city song for a clock minute: the night song from 19:30 to 05:30. */
  function songFor(min) {
    var m = ((min % 1440) + 1440) % 1440, night = m >= NIGHT_FROM || m < DAY_FROM;
    var id = night ? NIGHT_SONG : DAY_SONG;
    return SR.reg.song && SR.reg.song[id] ? id : DAY_SONG;
  }
  function variantFor(id) {
    var w = weather(), def = SR.reg.song && SR.reg.song[id];
    return (w === 'rain' || w === 'storm') && def && def.variants && def.variants.rain ? 'rain' : null;
  }

  function sound(dt) {
    C.audioT -= dt;
    if (C.audioT > 0) return;
    C.audioT = AUDIO_SEC;
    var id = songFor(clock()), variant = variantFor(id);
    if (id !== C.song || variant !== C.variant) {
      C.song = id; C.variant = variant;
      audio('music', id, variant ? { fade: SONG_FADE, variant: variant } : { fade: SONG_FADE });
    }
    var TR = W().traffic, bed = Math.round((CITY_MIN + (1 - CITY_MIN) * (TR && TR.density ? TR.density() : 0)) * 20) / 20;
    if (bed !== C.bed) { C.bed = bed; audio('ambience', 'city', bed); }
    var P = W().player, wind = 0;
    if (SR.state && P && W().geometry.built) {
      var warn = weather() === 'fog' ? cfg().edgeWarnFog : cfg().edgeWarn, d = W().geometry.edgeDistance(P.x, P.y);
      wind = d < warn ? Math.round((1 - d / warn) * WIND_MAX * 40) / 40 : 0;
    }
    if (wind !== C.wind) { C.wind = wind; audio('ambience', 'wind', wind); }
  }

  // ------------------------------------------------------------------------------------------------
  // What the world's actions look like (fall, car hit, crash, the fished car, the nomination)
  // ------------------------------------------------------------------------------------------------
  function toast(o) { if (SR.ui && typeof SR.ui.toast === 'function') SR.ui.toast(o); }
  function float(x, y, text, colour) {
    var U = SR.render && SR.render.worldui;
    if (U && typeof U.float === 'function') U.float(x, y, text, colour);
  }

  function presentWorld(res) {
    var P = W().player;
    (res.toasts || []).forEach(function (x) {
      if (/^ori\./.test(x.key)) {
        var line = txt(x.key, x.vars), who = txt('ori.name');
        toast({ text: line.indexOf(who) >= 0 ? line : who + ': ' + line, kind: 'info', icon: 'talk', id: 'toast-ori' });
      }
      else toast({ key: x.key, vars: x.vars, kind: x.kind || 'info' });
    });
    (res.stamps || []).forEach(function (x) { if (SR.ui && typeof SR.ui.stamp === 'function') SR.ui.stamp({ text: txt(x.key, x.vars) }); });
    (res.deltas || []).forEach(function (d) {
      if (!d || !d.n || !P) return;
      if (d.kind === 'hp' || d.kind === 'cash') {
        var label = SR.ui && SR.ui.chip && SR.ui.chip.text ? SR.ui.chip.text({ kind: d.kind === 'cash' ? 'money' : 'hp', n: d.n }) : String(d.n);
        float(P.x, P.y, label, d.kind === 'cash' ? 'money' : 'hp');
        if (SR.ui.hud && typeof SR.ui.hud.pulse === 'function') SR.ui.hud.pulse(d.kind === 'cash' ? 'cash' : 'hp');
      }
    });
  }

  function onActionDone(p) {
    if (!p || !p.id || !p.result || !p.result.ok) return;
    if (p.id.indexOf('world.') !== 0 || p.id === 'world.enter') return;
    presentWorld(p.result);
  }

  // ------------------------------------------------------------------------------------------------
  // Per-step watching: the fall's sounds, "Phew", hits and crashes, the 24:00 state, the prompt
  // ------------------------------------------------------------------------------------------------
  function particles(kind, x, y, n) {
    var Pa = SR.render && SR.render.particles;
    if (Pa && typeof Pa.burst === 'function') Pa.burst(kind, x, y, { n: n });
  }
  function shake(amp, ms) { var fx = SR.render && SR.render.fx; if (fx && typeof fx.shake === 'function') fx.shake(amp, ms); }
  /** UI.md §6: a 30 ms buzz on hits (the access.haptics setting is SR.ui.dom's). */
  function haptic() { if (D() && typeof D().haptic === 'function') D().haptic(HIT_HAPTIC_MS); }

  function watch() {
    var F = W().fall, P = W().player, TR = W().traffic, s = SR.state;
    // The fall's edge sounds (ART_AUDIO §13.5) and the plane's way out after the landing.
    if (F.phase !== C.phase) {
      if (F.phase === 'teeter') audio('sfx', 'teeter', { x: P.x, y: P.y });
      else if (F.phase === 'drop') audio('sfx', 'fall_whistle', { x: F.x, y: F.y });
      else if (F.phase === 'catch') audio('sfx', 'plane_swoop', { x: F.x, y: F.y });
      else if (F.phase === 'none' && (C.phase === 'land' || C.phase === 'catch' || C.phase === 'drop') && F.last) {
        audio('sfx', 'landing', { x: P.x, y: P.y });
        particles('dust', P.x, P.y, 10);
        C.plane = { t: 0, x: P.x, y: P.y, dx: F.out[0], dy: F.out[1] };
      }
      C.phase = F.phase;
    }
    if (F.saved && F.saved !== C.saved) {
      C.saved = F.saved;
      float(F.saved.x, F.saved.y, txt('toast.world.phew'), 'ink');
    }
    if (TR && TR.stats.hits !== C.hits) {
      C.hits = TR.stats.hits;
      shake(4, 250);
      particles('dust', P.x, P.y, 8);
      haptic();
    }
    if (TR && TR.stats.crashes !== C.crashes) {
      C.crashes = TR.stats.crashes;
      shake(6, 250);
      if (TR.last) particles('spark', TR.last.x, TR.last.y, 10);
      haptic();
    }
    // 24:00: only free actions and sleep remain (GDD §4.1): a chime and one toast a day (per game).
    if (s && s.clock && s.clock.min >= SR.tuning.time.dayEnd && (C.midnight !== s.clock.day || C.midnightOf !== s)) {
      C.midnight = s.clock.day; C.midnightOf = s;
      var cab = SR.features && SR.features.phone && s.items && s.items.phone > 0;
      audio('sfx', 'midnight_chime');
      toast({ key: cab ? 'toast.world.midnightCab' : 'toast.world.midnight', kind: 'warning', icon: 'time', id: 'toast-midnight' });
    }
  }

  // ---- the ContextPrompt (UI.md §2.3; CONTRACT D52: within the 96 u interact range) ----
  function streetActions(id) {
    if (C.talkCache[id]) return C.talkCache[id];
    var A = SR.rules.act, list = A && typeof A.actions === 'function' ? A.actions('street:' + id) : [];
    C.talkCache[id] = list;
    return list;
  }
  function talkable(id) {
    var S = W().streetnpcs;
    return !!(S && typeof S.talk === 'function') || streetActions(id).length > 0;
  }
  function personName(id) {
    var p = SR.reg.person && SR.reg.person[id];
    if (p && p.name) return txt(p.name);
    return id === 'junker' ? txt('act.world.junker') : SR.text.has('person.' + id) ? txt('person.' + id) : id;
  }

  function computePrompt() {
    var w = W(), P = w.player, F = w.fall, s = SR.state, c = cfg();
    if (!s || !w.ready || F.active() || P.knockdown > 0) return null;
    var Dp = w.doors.prompt;
    if (P.car) {
      return Dp && Dp.kind === 'park' ? { key: 'park:' + Dp.door, kind: 'park', verb: 'door.park', object: Dp.name, action: 'interact' } : null;
    }
    var best = null, bd = Infinity;
    if (Dp && Dp.kind === 'enter') {
      var tag = w.doors.tagFor ? w.doors.tagFor(Dp.door, s) : null;
      best = { key: 'door:' + Dp.door + ':' + (tag && tag.tag), kind: 'door', verb: 'door.enter', vars: { place: txt(Dp.name) },
        detail: tag && tag.tag ? tag.tag : null, action: 'interact' };
      bd = Dp.dist;
    }
    var people = w.entities('person');
    for (var i = 0; i < people.length; i++) {
      var e = people[i];
      if (!e || e.visible === false || e.active === false || e.talk === false || typeof e.x !== 'number' || !e.id) continue;
      var d = Math.hypot(e.x - P.x, e.y - P.y);
      if (d <= c.interact && d < bd && talkable(e.id)) { bd = d; best = { key: 'talk:' + e.id, kind: 'talk', id: e.id, entity: e, verb: 'act.world.talk', vars: { name: personName(e.id) }, action: 'interact' }; }
    }
    // The junker on the apartment lawn is a street dialog until it is yours (ARCHITECTURE §8.3).
    var lot = w.geometry.map.homeLots && w.geometry.map.homeLots.junker, row = s.player && s.player.cars && s.player.cars.junker;
    if (lot && row && !row.owned && talkable('junker')) {
      var dj = w.geometry.util.rectDist(P.x, P.y, lot);
      if (dj <= c.interact / 2 && dj < bd) { bd = dj; best = { key: 'talk:junker', kind: 'talk', id: 'junker', entity: null, verb: 'act.world.look', vars: { name: personName('junker') }, action: 'interact' }; }
    }
    if (!best && P.carNear && P.carNear()) best = { key: 'car', kind: 'car', verb: 'act.world.getIn', action: 'car' };
    return best;
  }

  function showPrompt() {
    var p = C.root ? computePrompt() : null;
    C.target = p;
    var key = p ? p.key : '';
    if (key === C.promptKey || !C.prompt) return;
    C.promptKey = key;
    if (!p) { C.prompt.hide(); return; }
    C.prompt.show({ action: p.action, verb: p.verb, object: p.object, vars: p.vars, detail: p.detail });
  }
  function hidePrompt() { C.promptKey = ''; C.target = null; if (C.prompt) C.prompt.hide(); }

  // ------------------------------------------------------------------------------------------------
  // Street people: the dialog entry (W2-Street fills it)
  // ------------------------------------------------------------------------------------------------
  function greeting(id) {
    var fn = SR.reg.fn && SR.reg.fn['greet.' + id];
    if (typeof fn === 'function' && SR.state) {
      try { var g = fn(SR.state, {}, { rng: SR.rng.fx, now: SR.state.clock.min, source: 'ui' }); if (g) return typeof g === 'string' ? { key: g } : g; } catch (e) { SR.util.warnOnce('city.greet.' + id, 'city: greet.' + id + ' threw: ' + e.message); }
    }
    var p = SR.reg.person && SR.reg.person[id], list = p && Array.isArray(p.greetings) ? p.greetings : null;
    if (list && list.length) { var pick = SR.rng.fx.pick(list); return typeof pick === 'string' ? { key: pick } : pick; }
    return SR.text.has('greet.' + id) ? { key: 'greet.' + id } : { key: null };
  }

  function feedback(res) {
    var card = SR.ui && SR.ui.card;
    if (card && typeof card.feedback === 'function') card.feedback(res, null, {});
  }

  /** Runs a street action (and its minigame and :resolve, as a building card does, CONTRACT §13). */
  function runStreet(aid, n) {
    var res = SR.act(aid, n !== undefined ? { n: n } : {});
    feedback(res);
    if (res && res.ok && res.open && SR.minigame && typeof SR.minigame.run === 'function') {
      var o = res.open;
      SR.minigame.run(o.minigame, Object.assign({ skin: o.skin, resolve: o.resolve }, o.params)).then(function (result) {
        if (result) feedback(SR.act(o.resolve, result));
      });
    }
    return res;
  }

  /**
   * Talks to a street person (ARCHITECTURE §8.3: SR.scenes.push('dialog')). W2-Street may own the
   * whole conversation with SR.world.streetnpcs.talk(id, entity); otherwise a Dialog sheet offers
   * the person's `street:<id>` actions (a def's `number` becomes the choice's NumberField) and Leave.
   */
  function talk(target, ev) {
    var id = target.id, S = W().streetnpcs;
    swallowRest(ev);
    if (S && typeof S.talk === 'function') { S.talk(id, target.entity || null); return; }
    if (!SR.ui.dialog || C.talking) return;
    var choices = [];
    streetActions(id).forEach(function (aid) {
      var def = SR.reg.action[aid], pv = SR.preview(aid, {});
      if (!def || (pv && pv.hidden)) return;
      var ch = { id: aid, label: def.label, action: aid, params: {} };
      if (def.number) ch.number = def.number;
      choices.push(ch);
    });
    if (!choices.length) return;
    choices.push({ id: 'leave', label: 'ui.leave', variant: 'ghost' });
    var g = greeting(id);
    C.talking = true;
    hidePrompt();
    SR.ui.dialog.open({ id: 'street-' + id, person: id, text: g.key, vars: g.vars, choices: choices, cancel: 'leave' }).then(function (r) {
      C.talking = false;
      if (r && r.choice && r.choice !== 'leave') runStreet(r.choice, r.n);
    });
  }

  // ------------------------------------------------------------------------------------------------
  // Input
  // ------------------------------------------------------------------------------------------------
  function isTop() { var t = SR.scenes.top(); return !!(t && t.id === 'city'); }
  function refuse() { if (D() && typeof D().refuse === 'function') D().refuse(null); }
  function openOverlay(id, params) {
    if (!SR.reg.scene[id]) { refuse(); return; }
    if (!isTop()) return;
    SR.scenes.push(id, params || {});
  }
  function toggle(key) {
    if (!SR.settings || typeof SR.settings.set !== 'function') return;
    try { SR.settings.set(key, !setting(key)); } catch (e) { SR.util.warnOnce('city.set.' + key, 'city: ' + e.message); }
  }
  function ownsCar() {
    var s = SR.state, c = s && s.player && s.player.cars;
    return !!(c && ((c.junker && c.junker.owned && !c.junker.towed) || (c.sports && c.sports.owned && !c.sports.towed)));
  }

  /**
   * The press that opened a street dialog also fires `confirm` (E, Enter, Space and A are both):
   * keep the rest of that key's press, and its repeats until it is released, from the dialog, so
   * talking never also picks the first choice (with instant text there is no line to complete).
   */
  function swallowRest(ev) {
    if (ev && ev.code && ev.down !== false) C.swallow = ev.code;
  }
  function onInput(ev) {
    if (!ev || C.swallow === null || ev.code !== C.swallow) return;
    if (ev.down) { if (ev.action !== 'interact' || ev.repeat) ev.consumed = true; }
    else C.swallow = null;
  }
  /** @returns {boolean} the key is also bound to `back` (Esc): its `pause` belongs to the press that closed a scene. */
  function isBackKey(code) {
    var I = SR.input;
    if (!code || !I || typeof I.bindings !== 'function') return false;
    try { return I.bindings('back').indexOf(code) >= 0; } catch (e) { return false; }
  }

  function onAction(action, ev) {
    var w = W();
    if (!w.ready || !SR.state) return;
    if (w.fall.active()) { w.onAction(action); return; }
    // Knocked flat by a car (1.14 s): no doors, no car, no talking until you are up.
    if ((action === 'interact' || action === 'car') && w.player.knockdown > 0) return;
    switch (action) {
      case 'interact':
        showPrompt();
        if (C.target && C.target.kind === 'talk') talk(C.target, ev);
        else w.onAction('interact');
        return;
      case 'car':
        if (!w.onAction('car') && ownsCar()) toast({ key: 'toast.world.noCar', kind: 'info', id: 'toast-nocar' });
        showPrompt();
        return;
      case 'zoomIn': case 'zoomOut': case 'zoomCycle': w.onAction(action); return;
      case 'pocket':
        // Tab keeps its browser default in SR.input (D33): without this the same press would also
        // move focus inside the notebook that just opened (W2-Pocket request 3).
        if (ev && ev.code === 'Tab' && typeof ev.preventDefault === 'function') ev.preventDefault();
        openOverlay('pocket');
        return;
      case 'map': case 'bag': case 'journal': openOverlay('pocket', { tab: action }); return;
      case 'pause':
        // Esc is `back` then `pause`: the Esc that left a building or closed the dialog, the Pocket
        // or the pause menu brought the city back on top, and is not a request to pause.
        if (C.arrived && ev && isBackKey(ev.code)) return;
        openOverlay('pause');
        return;
      case 'minimap': toggle('game.minimap'); return;
      case 'minimalHud': toggle('game.minimalHud'); return;
      default: return;
    }
  }

  /** Click or tap the ground: walk there (GDD §3.8); a click on a building walks to its door. */
  function walkAt(cx, cy) {
    var w = W(), P = w.player;
    if (!SR.state || !w.ready || w.fall.active() || P.car || !SR.stage || typeof SR.stage.toLogical !== 'function') return false;
    var q = SR.stage.toLogical(cx, cy), p = w.camera.toWorld(q.x, q.y);
    var ok = P.walkTo(p.x, p.y);
    if (!ok) toast({ key: 'toast.world.noRoute', kind: 'info', id: 'toast-noroute' });
    return ok;
  }

  function onPointerDown(e) {
    if (!isTop()) return;
    if (e.pointerType === 'touch') {
      var q = SR.stage && SR.stage.toLogical ? SR.stage.toLogical(e.clientX, e.clientY) : null;
      if (!q || q.x < SR.W / 2) return;            // the left half is the stick (SR.input)
      C.tap = { id: e.pointerId, x: e.clientX, y: e.clientY, t: Date.now() };
      return;
    }
    if (e.button !== 0) return;
    walkAt(e.clientX, e.clientY);
  }
  function onPointerUp(e) {
    var tp = C.tap;
    C.tap = null;
    if (!tp || tp.id !== e.pointerId || !isTop()) return;
    if (Date.now() - tp.t > TAP_MS || Math.hypot(e.clientX - tp.x, e.clientY - tp.y) > TAP_MOVE) return;
    walkAt(e.clientX, e.clientY);
  }

  // ---- the touch cluster (UI.md §5.5): Action 96, Skate toggle 64, Car 64 ----
  function inject(action, down) { if (SR.input && typeof SR.input.inject === 'function') SR.input.inject(action, down); }
  function releaseSkate() {
    if (C.skateOn) { C.skateOn = false; inject('skate', false); }
    if (C.touch && C.touch.skate) C.touch.skate.setAttribute('aria-pressed', 'false');
  }
  function touchButton(id, action, size, label, aria, icon, pos) {
    var h = D().h, b = h('button', { type: 'button', class: 'btn btn--' + (size > 64 ? 'primary' : 'secondary') + ' city-touch-btn', 'data-id': 'touch-' + id,
      'aria-label': txt(aria), style: Object.assign({ position: 'absolute', width: size + 'px', height: size + 'px', minHeight: size + 'px', padding: '0',
        borderRadius: 'var(--r-pill)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px',
        pointerEvents: 'auto', touchAction: 'none' }, pos) },
      D().icon(icon, size > 64 ? 32 : 24), h('span', { class: 't-small', 'aria-hidden': 'true' }, txt(label)));
    if (action === 'skate') {
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        C.skateOn = !C.skateOn;
        inject('skate', C.skateOn);
        b.setAttribute('aria-pressed', C.skateOn ? 'true' : 'false');
      });
    } else {
      b.addEventListener('pointerdown', function (e) { e.preventDefault(); inject(action, true); });
      var up = function () { inject(action, false); };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('pointerleave', up);
    }
    return b;
  }
  function buildTouch() {
    var h = D().h;
    // One row at the bottom right (Car, Skate, Action), so it fits under the minimap on a short phone.
    var box = h('div', { class: 'city-touch', 'data-id': 'city-touch', role: 'group', 'aria-label': txt('act.world.touch'),
      style: { position: 'absolute', right: '16px', bottom: '16px', width: '272px', height: '96px', pointerEvents: 'none', zIndex: 'var(--z-hud)' } });
    box.action = touchButton('action', 'interact', 96, 'act.world.action', 'act.world.actionAria', 'talk', { right: '0', bottom: '0' });
    box.skate = touchButton('skate', 'skate', 64, 'act.world.skate', 'act.world.skateAria', 'skateboard', { right: '112px', bottom: '16px' });
    box.car = touchButton('car', 'car', 64, 'act.world.car', 'act.world.carAria', 'car', { right: '192px', bottom: '16px' });
    box.appendChild(box.skate); box.appendChild(box.car); box.appendChild(box.action);
    return box;
  }
  function touchMode() { return !!((SR.input && SR.input.last === 'touch') || (SR.stage && SR.stage.compact)); }

  // ---- the minimap (UI.md §4.1) ----
  function buildMinimap() {
    var h = D().h;
    var cv = h('canvas', { 'data-id': 'minimap-canvas', 'aria-hidden': 'true', style: { width: MINI + 'px', height: MINI + 'px', display: 'block' } });
    var wrap = h('button', { type: 'button', class: 'city-minimap paper', 'data-id': 'minimap', 'aria-label': txt('act.world.minimapOpen'), tabindex: '-1',
      style: { position: 'absolute', right: '16px', bottom: '16px', width: MINI + 'px', height: MINI + 'px', padding: '0', border: 'var(--line)',
        borderRadius: 'var(--r-m)', background: 'var(--paper-0)', boxShadow: 'var(--e-2)', overflow: 'hidden', cursor: 'pointer', zIndex: 'var(--z-hud)' } }, cv);
    wrap.addEventListener('click', function () { openOverlay('pocket', { tab: 'map' }); });
    C.miniCanvas = cv;
    return wrap;
  }
  function sizeMinimap() {
    if (!C.miniCanvas) return;
    var k = ((SR.stage && SR.stage.uiK) || 1) * ((typeof window !== 'undefined' && window.devicePixelRatio) || 1), n = Math.max(1, Math.round(MINI * k));
    if (C.miniCanvas.width !== n) { C.miniCanvas.width = n; C.miniCanvas.height = n; if (SR.render.minimap) SR.render.minimap.invalidate(); }
  }
  function layout() {
    var touch = touchMode();
    if (C.touch) C.touch.hidden = !touch;
    if (!touch) releaseSkate();
    if (C.mini) {
      C.mini.hidden = setting('game.minimap') === false;
      C.mini.style.top = touch ? MINI_TOP_TOUCH + 'px' : '';
      C.mini.style.bottom = touch ? '' : '16px';
      sizeMinimap();
      if (!C.mini.hidden && SR.render.minimap) SR.render.minimap.tick(C.miniCanvas, 0, true);
    }
  }

  // ------------------------------------------------------------------------------------------------
  // Mounting the HUD on the map
  // ------------------------------------------------------------------------------------------------
  function mount(root) {
    C.root = root;
    root.classList.add('scene-city');
    C.talkCache = {};
    if (SR.ui.hud && typeof SR.ui.hud.mount === 'function') SR.ui.hud.mount(root, {});
    if (typeof SR.ui.contextPrompt === 'function') { C.prompt = SR.ui.contextPrompt({ id: 'context-prompt' }); root.appendChild(C.prompt); }
    C.mini = buildMinimap(); root.appendChild(C.mini);
    C.touch = buildTouch(); root.appendChild(C.touch);
    C.promptKey = '';
    layout();
    C.unsubs.push(SR.events.on('action:done', onActionDone));
    C.unsubs.push(SR.events.on('settings:changed', function (p) { if (p && (p.key === 'game.minimap' || p.key === '*')) layout(); }));
    C.unsubs.push(SR.events.on('input:device', layout));
    C.unsubs.push(SR.events.on('stage:resized', layout));
    C.swallow = null;
    if (SR.input && typeof SR.input.on === 'function') C.unsubs.push(SR.input.on('*', onInput));
    C.world = document.getElementById('world');
    if (C.world) {
      C.onDown = onPointerDown; C.onUp = onPointerUp;
      C.world.addEventListener('pointerdown', C.onDown);
      C.world.addEventListener('pointerup', C.onUp);
    }
    if (SR.render.actors && typeof SR.render.actors.source === 'function') SR.render.actors.source('city.fold', foldStandIn, 'player');
    stepIn();
  }

  function unmount() {
    C.unsubs.forEach(function (u) { if (typeof u === 'function') u(); });
    C.unsubs.length = 0;
    if (C.world && C.onDown) { C.world.removeEventListener('pointerdown', C.onDown); C.world.removeEventListener('pointerup', C.onUp); }
    C.world = null; C.tap = null;
    if (SR.render.actors && typeof SR.render.actors.source === 'function') SR.render.actors.source('city.fold', null);
    if (SR.ui.hud && typeof SR.ui.hud.unmount === 'function') SR.ui.hud.unmount();
    releaseSkate();
    C.root = null; C.prompt = null; C.mini = null; C.miniCanvas = null; C.touch = null; C.target = null; C.promptKey = '';
    C.swallow = null;
  }

  // ------------------------------------------------------------------------------------------------
  // The frame: barks, the render core, then the Fold Rescue, the knockdown's stars, the touch stick
  // ------------------------------------------------------------------------------------------------
  var STAND_IN = [{ kind: 'player', x: 0, y: 0, visible: false }];
  /** While the Fold Rescue plays the city draws the player itself: a hidden stand-in replaces them. */
  function foldStandIn() {
    var F = W().fall;
    if (!F || (F.phase !== 'drop' && F.phase !== 'catch' && F.phase !== 'land')) return null;
    STAND_IN[0].x = F.x; STAND_IN[0].y = F.y;
    return STAND_IN;
  }

  function barks() {
    var U = SR.render.worldui, now = W().time;
    if (!U || typeof U.tag !== 'function') return;
    var peds = W().entities('ped'), people = W().entities('person');
    for (var i = 0; i < peds.length; i++) {
      var p = peds[i];
      if (p && p.bark && p.barkT > 0 && p.visible !== false) U.tag(p.x, p.y, txt(p.bark));
    }
    // Named people: the hop's "Hey!", and their own barks (bark.<npc>.*, W2-Street request 1), over
    // the name tag the render core draws for them.
    for (var k = 0; k < people.length; k++) {
      var e = people[k];
      if (!e || e.visible === false || !e.bark || typeof e.x !== 'number') continue;
      if (e.bark === 'toast.world.hey' ? e.hopUntil && now < e.hopUntil + BARK_AFTER_HOP : e.barkT > 0) U.tag(e.x, e.y, txt(e.bark), BARK_OPTS);
    }
  }
  var BARK_OPTS = { z: PERSON_BARK_Z };

  function worldCtx(ctx) {
    var L = SR.render.lib, v = SR.render.lastView();
    if (!L || !v || !v.ppu) return null;
    ctx.save();
    L.worldTransform(ctx, v);
    return v;
  }
  function colour(k, lum) { var L = SR.render.lib; return L && L.pal ? L.pal(k, lum) : ''; }

  function drawStick(ctx, x, y, o) {
    var S = SR.art.stick;
    if (!S || typeof S.draw !== 'function') return;
    try { S.draw(ctx, o.clip || 'fall', { x: x, y: y, view: 'city', player: true, scale: o.scale, rot: o.rot, t: o.t, alpha: o.alpha, shadow: false }); } catch (e) { SR.util.warnOnce('city.stick', 'city: the falling stick could not be drawn: ' + e.message); }
  }
  function drawPlane(ctx, x, y, o) {
    var V = SR.art.vehicles;
    if (!V || typeof V.draw !== 'function') return;
    try { V.draw(ctx, 'plane', 0, x, y, o); } catch (e) { SR.util.warnOnce('city.plane', 'city: the plane could not be drawn: ' + e.message); }
  }
  function drawCloud(ctx, x, y, r, a) {
    ctx.globalAlpha = a;
    ctx.fillStyle = colour('cloud', 0.98);
    ctx.strokeStyle = colour('cloudLine', 0.8);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x - r * 0.55, y, r * 0.6, r * 0.42, 0, 0, Math.PI * 2);
    ctx.ellipse(x + r * 0.5, y + r * 0.05, r * 0.55, r * 0.38, 0, 0, Math.PI * 2);
    ctx.ellipse(x, y - r * 0.25, r * 0.62, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /** The Fold Rescue (GDD §3.9, ART_AUDIO §12) over the frame: drop, catch, carry, and the plane's exit. */
  function drawFold(ctx, v) {
    var F = W().fall, c = cfg(), t = v.t || 0;
    var seq = F.seq || 0, D0 = c.fallDrop, D1 = D0 + c.fallCatch;
    var ox = F.out[0], oy = F.out[1], px = -oy, py = ox;
    // Down the screen, into the sky; off a north rim the sky is up the screen (behind the sheet).
    var sink = oy < -0.5 ? -1 : 1;
    var k = Math.min(1, seq / D0);
    // The stick's drop: outward and down, shrinking and spinning.
    var sx = F.x + ox * FOLD_OUT * k, sy = F.y + oy * FOLD_OUT * k + sink * 0.5 * FOLD_SINK * k * k;
    var scale = 1 - (1 - FOLD_SCALE) * k, rot = FOLD_TURNS * 2 * Math.PI * k;
    // Cloud puffs rush up past the falling stick, in the sky beyond the rim.
    for (var i = 0; i < CLOUDS.length; i++) {
      var u = (seq / (c.fallDrop + c.fallCatch)) - CLOUDS[i][1];
      if (u < 0 || u > 1) continue;
      drawCloud(ctx, F.x + ox * 110 + px * CLOUDS[i][0], F.y + oy * 110 + sink * (300 - 220 * u), 46 + 14 * i, 0.9 * (1 - u));
    }
    // A car that sailed off tumbles into the clouds beside you.
    if (F.car && seq < D1) {
      var kc = Math.min(1, seq / D1), V = SR.art.vehicles;
      if (V && typeof V.draw === 'function') {
        try { V.draw(ctx, F.car, 0, F.x + ox * 140 * kc + px * 40, F.y + oy * 140 * kc + sink * 0.5 * FOLD_SINK * 1.4 * kc * kc, { angle: 5 * kc, scale: 1 - 0.7 * kc, alpha: 1 - kc, shadow: false }); } catch (e) { /* the art kit may be a stub */ }
      }
    }
    if (F.phase === 'drop') { drawStick(ctx, sx, sy, { scale: scale, rot: rot, t: t }); return; }
    var hangX = F.x + ox * FOLD_OUT, hangY = F.y + oy * FOLD_OUT + sink * 0.5 * FOLD_SINK;
    var hang = { scale: FOLD_SCALE, rot: FOLD_TURNS * 2 * Math.PI, t: t };
    if (F.phase === 'catch') {
      var kk = Math.min(1, F.t / c.fallCatch), e = SR.util.easeOut ? SR.util.easeOut(kk) : kk;
      // The plane swoops in along a curve from the side to the falling stick.
      var ax = F.x + ox * PLANE_FROM + px * PLANE_SIDE, ay = F.y + oy * PLANE_FROM + py * PLANE_SIDE;
      var bx = F.x + ox * (PLANE_FROM * 0.4) - px * PLANE_SIDE * 0.5, by = F.y + oy * (PLANE_FROM * 0.4) - py * PLANE_SIDE * 0.5;
      var ue = 1 - e, qx = ue * ue * ax + 2 * ue * e * bx + e * e * hangX, qy = ue * ue * ay + 2 * ue * e * by + e * e * hangY;
      var tx = 2 * ue * (bx - ax) + 2 * e * (hangX - bx), ty = 2 * ue * (by - ay) + 2 * e * (hangY - by);
      drawStick(ctx, hangX, hangY + 12 * (1 - kk), hang);
      drawPlane(ctx, qx, qy, { angle: Math.atan2(ty, tx), bank: Math.sin(kk * Math.PI) * 0.6, z: PLANE_Z * (1 - e), t: t });
      return;
    }
    // Land: the plane carries you from the catch to the landing spot (the camera follows it).
    var to = F.to || F.from || { x: F.x, y: F.y }, kl = Math.min(1, F.t / c.fallLand), el = SR.util.easeInOut ? SR.util.easeInOut(kl) : kl;
    var lx = hangX + (to.x - hangX) * el, ly = hangY + (to.y - hangY) * el;
    var z = PLANE_CRUISE_Z * Math.sin(kl * Math.PI) + 40 * (1 - kl);
    drawPlane(ctx, lx, ly, { angle: Math.atan2(to.y - hangY, to.x - hangX), bank: -0.3 * Math.sin(kl * Math.PI), z: z, carry: true, t: t, karma: SR.state && SR.state.stats ? SR.state.stats.karma : 0 });
  }

  /** The plane loops away after dropping you on the rim. */
  function drawPlaneExit(ctx, v, dt) {
    var pl = C.plane;
    pl.t += dt;
    if (pl.t >= PLANE_EXIT) { C.plane = null; return; }
    var k = pl.t / PLANE_EXIT;
    drawPlane(ctx, pl.x + pl.dx * 520 * k - pl.dy * 120 * k, pl.y + pl.dy * 520 * k + pl.dx * 120 * k, { angle: Math.atan2(pl.dy, pl.dx), bank: 0.5 * k, z: 40 + 260 * k * k, alpha: 1 - k * k, t: v.t || 0 });
  }

  /** The car hit's knockdown: stars circle over the flattened stick (ART_AUDIO §12). */
  function drawStars(ctx, v, P) {
    var t = v.t || 0, ink = colour('ink', 0.1), star = colour('fx.star', 0.8);
    for (var i = 0; i < STAR_N; i++) {
      var a = t * 5 + i * 2 * Math.PI / STAR_N, x = P.x + Math.cos(a) * STAR_R, y = P.y - 30 + Math.sin(a) * STAR_R * 0.4;
      ctx.beginPath();
      for (var j = 0; j < 10; j++) {
        var r = j % 2 ? 2.2 : 5.5, b = j * Math.PI / 5 - Math.PI / 2;
        if (j) ctx.lineTo(x + Math.cos(b) * r, y + Math.sin(b) * r); else ctx.moveTo(x + Math.cos(b) * r, y + Math.sin(b) * r);
      }
      ctx.closePath();
      ctx.fillStyle = star; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = ink; ctx.stroke();
    }
  }

  /** The floating touch stick (SR.input.stick) in stage units. */
  function drawStick2(ctx) {
    var st = SR.input && SR.input.stick;
    if (!st || !st.active) return;
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = colour(['ui.paper-0', 'white'], 0.98);
    ctx.strokeStyle = colour('ink', 0.1);
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(st.ox, st.oy, 64, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 0.8;
    ctx.beginPath(); ctx.arc(st.ox + st.x * 64, st.oy + st.y * 64, 26, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  var lastT = null;
  function render(ctx, alpha) {
    if (!SR.render || typeof SR.render.frame !== 'function') return;
    barks();
    SR.render.frame(ctx, alpha);
    var v = SR.render.lastView(), t = v && typeof v.t === 'number' ? v.t : 0, dt = lastT === null ? 0 : Math.max(0, Math.min(0.1, t - lastT));
    lastT = t;
    var w = W(), F = w.fall, P = w.player;
    if (w.ready && SR.state && (F.active() && F.phase !== 'teeter' || C.plane || P.knockdown > 0)) {
      var vv = worldCtx(ctx);
      if (vv) {
        if (F.active() && F.phase !== 'teeter') drawFold(ctx, vv);
        if (C.plane) drawPlaneExit(ctx, vv, dt);
        if (P.knockdown > 0 && !P.car) drawStars(ctx, vv, P);
        ctx.restore();
      }
    }
    drawStick2(ctx);
    if (C.mini && !C.mini.hidden && SR.render.minimap) SR.render.minimap.tick(C.miniCanvas, SR.loop && typeof SR.loop.time === 'number' ? SR.loop.time : t);
  }

  function update(dt) {
    if (!W().ready) return;
    W().update(dt);
    if (!SR.state) return;
    watch();
    sound(dt);
    if (isTop() && !C.talking) showPrompt(); else if (C.promptKey) hidePrompt();
  }

  // ------------------------------------------------------------------------------------------------
  // The cab stub (GDD §4.18; P1, flag `phone`): the Pocket's Phone app calls it
  // ------------------------------------------------------------------------------------------------
  /**
   * Rides a cab to a door: world.cab through the rules ($15, 30 min; at 24:00 only home), then you
   * step out at that door (the city follows if you called from elsewhere).
   * @param {string} doorId a worldmap door (building id)
   * @returns {object} the Result
   */
  SR.world.cab = function (doorId) {
    var res = SR.act('world.cab', { door: doorId });
    if (!res || !res.ok) return res;
    W().place(doorId, SR.state);
    var d = W().geometry.doorById[doorId];
    toast({ key: 'toast.world.cabRide', vars: { place: d ? txt(d.name) : doorId }, kind: 'info', icon: 'cab' });
    var base = SR.scenes.stack()[0];
    if (base !== 'city' && SR.reg.scene.city) SR.scenes.queue('city');
    return res;
  };

  SR.scenes.register('city', {
    kind: 'base',
    /** The day or the night song (ART_AUDIO §13.4), read by the kernel on entering. */
    get music() { return songFor(clock()); },
    enter: enter,
    exit: exit,
    pause: function () { hidePrompt(); releaseSkate(); },
    resume: function () { C.promptKey = ''; arrive(); },
    update: update,
    render: render,
    onAction: onAction,
    ui: { mount: mount, unmount: unmount },
    /** Test hooks: the prompt now, and a talk as Interact would start it. */
    debug: { prompt: function () { return computePrompt(); }, talk: function (id) { talk({ id: id }); }, songFor: songFor,
      song: function () { return { id: C.song, variant: C.variant, bed: C.bed, wind: C.wind }; } },
  });
})();
