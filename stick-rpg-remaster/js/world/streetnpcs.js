// js/world/streetnpcs.js — owner: W2-Street. SR.world.streetnpcs: the named people on the street and
// their dialogs (GDD §6.2, §3.8; UI §5.7; ARCHITECTURE §8.2 step 6, §8.3; CONTRACT §15.1).
// - Schedules: each person of data/people.js stands where the first schedule row that holds puts
//   them (weekday, time window, condition); a person no row places is not in the city. Rows are
//   judged every second and whenever the clock, the day or the game changes, so the kid is gone
//   the moment his tenth pack lands.
// - The live list (`people`, the entity array SR.world.entities('person') and the renderer read):
//   { id, x, y, px, py, facing, state, look, clip, visible, active, named, bark, barkT, hopT, ... }.
//   Harold sits, Skid stands, Red paces his beat in Dealer Alley (the worldmap `people` path). Your
//   car makes them hop aside (W1-W's hopAside sets the hop); afterwards they walk back to their spot.
//   Passing within 180 u, a person calls out one of their barks (at most every 25 s).
// - Talking (the city calls talk(id, entity) on Interact, W2-City's convention): the Dialog sheet
//   with the person's portrait, their greeting (the named fn greet.<id>), their `street:<id>` rows
//   (Red's with a NumberField capped at what you can carry) and Leave. A picked row runs through
//   SR.act with the card's feedback (chips, stamps, sounds), then the sheet comes back with the
//   person's reply, as the original's street dialogs did, until you leave. A row that opens a
//   minigame (the P1 hotwire ring) runs it and its :resolve like a building card. Opening a dialog
//   runs the silent `street.<id>.talk` (the `talk` rule event).
// - The junker on the apartment lawn: its dialog (id 'junker') until it is yours, and its sprite
//   while it stands parked (a car source of SR.render.actors; nothing else draws a parked car).
// - The day-1 job offer: a new game (save:loaded on day 1 without it) runs `street.jobOffer`, so
//   Manager Mel's voicemail waits on the answering machine (UI §9 step 1).
// Presentation numbers are named constants here (CONTRACT D49); the rules' numbers are B-26's.
// Randomness is cosmetic (pauses, barks): SR.rng.fx, never the rules or the world stream.
(function () {
  'use strict';
  var SR = window.SR;

  var PACE_SPEED = 55;           // u/s: Red's slow pacing
  var PACE_PAUSE = [1.2, 3.2];   // s he stops at each end of his beat
  var RETURN_SPEED = 140;        // u/s back to the spot after hopping out of your car's way
  var ARRIVE = 2;                // u: close enough to the target
  var BARK_R = 180;              // u: a person calls out when you come this close ...
  var BARK_AWAY = 260;           // u: ... having been at least this far away since the last bark
  var BARK_SEC = 3;              // s a bark stays up
  var BARK_GAP = 25;             // s between two barks of one person
  var JUDGE_SEC = 1;             // s between schedule judgements (plus every clock or game change)
  var NOON = 720;                // the clock the title's backdrop judges schedules at (no game)

  var S = SR.world.streetnpcs = {
    /** The people in the city now (the renderer's and SR.world.entities('person')'s list; changed in place, never replaced). */
    people: [],
    /** The id of the person whose dialog is open, or null (the Bag's Give reads it, GDD §6.4). */
    talking: null,
    /** Seconds of world time this module has run. */
    t: 0,
    /** Counters for tests: { judged, barks, talks, acts }. */
    stats: { judged: 0, barks: 0, talks: 0, acts: 0 },
  };
  /** The same array under the name of CONTRACT §15.1's convention (`SR.world.streetnpcs.list`). */
  S.list = S.people;

  var byId = {};          // id → the live entity
  var sigDay = -1, sigMin = -1;   // the clock the last judgement saw
  var judgeT = 0;
  var dirty = true;
  var busy = false;       // a dialog loop is running
  var ownAct = false;     // this module is running an action (the Bag's Give is someone else's)
  var gameRef = null;     // the state object the entities were placed for

  function W() { return SR.world; }
  function fx() { return SR.rng.fx; }
  function map() { return (W().geometry && W().geometry.map) || (SR.reg.worldmap && SR.reg.worldmap.main) || null; }
  function defs() {
    return SR.registry.entries('person').map(function (e) { return e.def; }).filter(function (d) {
      return !(d.feature && !SR.features[d.feature]);
    });
  }

  // ------------------------------------------------------------------------------------------------
  // Schedules (GDD §6.2; data/people.js)
  // ------------------------------------------------------------------------------------------------

  function dayOk(days, wd) {
    if (days === undefined || days === null || days === 'all' || days === '*') return true;
    var list = Array.isArray(days) ? days : [days];
    for (var i = 0; i < list.length; i++) {
      var d = typeof list[i] === 'number' ? list[i] : SR.rules.time.dayIndex(list[i]);
      if (d === wd) return true;
    }
    return false;
  }
  /** from ≤ now < to; to 1440 (or more) includes 24:00; from > to wraps past midnight. */
  function inWindow(from, to, now) {
    from = Number(from) || 0;
    to = to === undefined ? 1440 : Number(to);
    if (from <= to) return now >= from && (now < to || to >= 1440);
    return now >= from || now < to;
  }
  function condOk(s, list) {
    var C = SR.rules.conditions;
    if (!list || !list.length) return true;
    if (!C || typeof C.all !== 'function') return true;
    return C.all(s, list, { rng: fx(), params: {}, now: s.clock.min, source: 'ui', cost: { min: 0 } }).ok;
  }

  /**
   * The place id a person's schedule gives now (the first row that holds), or null. Without a game
   * (the title's backdrop) rows with a condition are skipped, and the first row stands in when no
   * other holds.
   * @param {object} def a person def
   * @param {object|null} s the state
   * @returns {string|null}
   */
  function placeFor(def, s) {
    var rows = Array.isArray(def.schedule) ? def.schedule : [];
    var wd = s ? SR.rules.time.weekday(s) : 0, now = s ? s.clock.min : NOON;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!Array.isArray(r) || !dayOk(r[0], wd) || !inWindow(r[1], r[2], now)) continue;
      if (r[4] && r[4].length && (!s || !condOk(s, r[4]))) continue;
      return r[3];
    }
    return !s && rows.length && Array.isArray(rows[0]) ? rows[0][3] : null;
  }

  /**
   * Where a place id is on the street: a worldmap `spots` point (with the worldmap `people` entry's
   * path when that entry names the same spot). A building id means inside it: not on the street.
   * @returns {{place: string, x: number, y: number, path: (number[][]|null)}|null}
   */
  function spotOf(id, place) {
    var m = map();
    if (!m || !place) return null;
    var p = m.spots && m.spots[place];
    if (!Array.isArray(p)) {
      if (!(SR.reg.building && SR.reg.building[place])) SR.util.warnOnce('streetnpcs.place.' + place, 'SR.world.streetnpcs: unknown place "' + place + '" (' + id + ')');
      return null;
    }
    var out = { place: place, x: p[0], y: p[1], path: null };
    (m.people || []).forEach(function (e) {
      if (e.id !== id || e.spot !== place) return;
      if (Array.isArray(e.path) && e.path.length >= 2) {
        out.path = e.path.map(function (q) { return [q[0], q[1]]; });
        out.x = out.path[0][0]; out.y = out.path[0][1];
      } else if (typeof e.x === 'number' && typeof e.y === 'number') { out.x = e.x; out.y = e.y; }
    });
    return out;
  }

  /**
   * Where a person is now: their place and its point, or null when they are not on the street.
   * @param {string} id
   * @param {object=} s the state (default SR.state)
   * @returns {{place: string, x: number, y: number, path: (number[][]|null)}|null}
   */
  S.placeOf = function (id, s) {
    var def = SR.reg.person && SR.reg.person[id];
    if (!def || (def.feature && !SR.features[def.feature])) return null;
    return spotOf(id, placeFor(def, s === undefined ? SR.state : s));
  };

  // ------------------------------------------------------------------------------------------------
  // Entities
  // ------------------------------------------------------------------------------------------------

  /**
   * The kid gives his board away with the first pack: his look drops it (a copy of the rig's raw
   * look, made once, so the renderer's per-object look cache keeps hitting). The street and the
   * dialog's portrait both use it, also after he is gone. The Dialog hands its `portrait` to the
   * Portrait component as `person`, which reads SR.reg.person[person] for its label ("Portrait:
   * Skid") and prints it in data-person, so this look prints as its person's id (a non-enumerable
   * toString: the rig and JSON never see it).
   */
  var boardless = null;
  function lookOf(def, s) {
    if (def.id !== 'kid' || !s || !s.npc || !s.npc.kid || !(s.npc.kid.packs > 0)) return def.look;
    if (!boardless) {
      var raw = SR.art && SR.art.stick && SR.art.stick.looks ? SR.art.stick.looks[def.look] : null;
      if (!raw || typeof raw !== 'object') return def.look;
      boardless = SR.util.clone(raw);
      boardless.acc = (Array.isArray(boardless.acc) ? boardless.acc : []).filter(function (a) { return a !== 'skateboard'; });
      var who = def.id;
      Object.defineProperty(boardless, 'toString', { value: function () { return who; } });
    }
    return boardless;
  }

  function make(def, spot, s) {
    var e = {
      id: def.id, named: true, x: spot.x, y: spot.y, px: spot.x, py: spot.y,
      facing: typeof def.facing === 'number' ? def.facing : 180, state: 'pause', look: lookOf(def, s), clip: null,
      visible: true, active: true, talk: true, place: spot.place, home: { x: spot.x, y: spot.y }, path: spot.path,
      idle: def.idle || 'stand', seg: 1, wait: fx().float(0, PACE_PAUSE[1]), returning: false,
      bark: null, barkT: 0, barkAt: -1e9, away: true, hopT: 0, hopUntil: 0, phase: fx().float(0, 2),
    };
    settle(e, def);
    return e;
  }

  /** Back at the spot: sit, stand or (for pacing) walk on. */
  function settle(e, def) {
    e.returning = false;
    if (e.idle === 'sit') { e.clip = 'sit'; e.state = 'pause'; e.facing = def && typeof def.facing === 'number' ? def.facing : 180; }
    else if (e.idle === 'pace' && e.path) { e.clip = null; e.state = 'walk'; }
    else { e.clip = null; e.state = 'pause'; e.facing = def && typeof def.facing === 'number' ? def.facing : 180; }
  }

  /** Puts an entity on a (new) spot. */
  function place(e, def, spot) {
    e.place = spot.place; e.home = { x: spot.x, y: spot.y }; e.path = spot.path;
    e.x = e.px = spot.x; e.y = e.py = spot.y; e.seg = 1; e.wait = 0;
    e.hopT = 0; e.state = 'pause';
    settle(e, def);
  }

  /**
   * Re-judges every schedule now: people arrive at their spots, move to new ones, or leave.
   * @param {boolean=} snap put everyone back on their spot (a new or loaded game, a new day)
   */
  function judge(snap) {
    var s = SR.state;
    dirty = false;
    S.stats.judged++;
    var seen = {};
    defs().forEach(function (def) {
      var spot = spotOf(def.id, placeFor(def, s));
      if (!spot) return;
      seen[def.id] = true;
      var e = byId[def.id];
      if (!e) { e = byId[def.id] = make(def, spot, s); S.people.push(e); return; }
      e.look = lookOf(def, s);
      if (snap || e.place !== spot.place) place(e, def, spot);
    });
    for (var i = S.people.length - 1; i >= 0; i--) {
      var e = S.people[i];
      if (seen[e.id]) continue;
      S.people.splice(i, 1);
      delete byId[e.id];
    }
    gameRef = s;
  }

  /** @returns {boolean} the clock moved since the last judgement (no allocation: it runs every step). */
  function clockMoved() {
    var s = SR.state, d = s ? s.clock.day : -1, m = s ? s.clock.min : -1;
    if (d === sigDay && m === sigMin) return false;
    sigDay = d; sigMin = m;
    return true;
  }

  /** Re-judges the schedules now and returns the live list (tests, the city after a scene change). */
  S.judge = function (snap) { judge(!!snap); clockMoved(); return S.people; };
  /** Puts everyone back on their spot. */
  S.reset = function () { return S.judge(true); };
  /** @returns {object|null} the live entity of a person on the street. */
  S.get = function (id) { return byId[id] || null; };

  /** Degrees clockwise from north for a direction. */
  function heading(dx, dy) {
    var d = Math.atan2(dx, -dy) * 180 / Math.PI;
    return d < 0 ? d + 360 : d;
  }

  /** Moves e toward (x, y) at speed; @returns {boolean} arrived */
  function walkTo(e, x, y, speed, dt) {
    var dx = x - e.x, dy = y - e.y, d = Math.sqrt(dx * dx + dy * dy);
    if (d <= Math.max(ARRIVE, speed * dt)) { e.x = x; e.y = y; return true; }
    e.x += dx / d * speed * dt;
    e.y += dy / d * speed * dt;
    e.facing = heading(dx, dy);
    return false;
  }

  var NEAR = { x: 0, y: 0, seg: 1, d: 0 };   // scratch: nearestOnPath runs every step of a way back
  /** The nearest point of a path to (x, y) and the index of the end to walk toward next (a reused object). */
  function nearestOnPath(path, x, y) {
    NEAR.x = path[0][0]; NEAR.y = path[0][1]; NEAR.seg = 1; NEAR.d = Infinity;
    for (var i = 0; i + 1 < path.length; i++) {
      var a = path[i], b = path[i + 1], vx = b[0] - a[0], vy = b[1] - a[1], L = vx * vx + vy * vy;
      var t = L > 0 ? SR.util.clamp(((x - a[0]) * vx + (y - a[1]) * vy) / L, 0, 1) : 0;
      var px = a[0] + vx * t, py = a[1] + vy * t, d = (px - x) * (px - x) + (py - y) * (py - y);
      if (d < NEAR.d) { NEAR.x = px; NEAR.y = py; NEAR.seg = i + 1; NEAR.d = d; }
    }
    return NEAR;
  }

  /** Red walks his beat end to end, stopping a moment at each end (facing the street). */
  function pace(e, dt) {
    var p = e.path;
    if (e.wait > 0) { e.wait -= dt; e.state = 'pause'; e.facing = 180; return; }
    var to = p[e.seg];
    e.state = 'walk';
    if (walkTo(e, to[0], to[1], PACE_SPEED, dt)) {
      e.dir = e.dir === -1 ? -1 : 1;
      if (e.seg >= p.length - 1) e.dir = -1; else if (e.seg <= 0) e.dir = 1;
      e.seg += e.dir;
      e.wait = fx().float(PACE_PAUSE[0], PACE_PAUSE[1]);
    }
  }

  /** A bark when you come near on foot (not while hopping, falling or driving). */
  function barkNear(e, def, P) {
    if (!P || typeof P.x !== 'number' || !SR.state) return;
    var d = Math.sqrt((P.x - e.x) * (P.x - e.x) + (P.y - e.y) * (P.y - e.y));
    if (d > BARK_AWAY) e.away = true;
    if (!e.away || d > BARK_R || P.car || e.hopT > 0 || S.t - e.barkAt < BARK_GAP) return;
    var list = Array.isArray(def.barks) ? def.barks : [];
    if (!list.length) return;
    e.bark = list[fx().int(0, list.length - 1)];
    e.barkT = BARK_SEC; e.barkAt = S.t; e.away = false;
    S.stats.barks++;
  }

  /**
   * One world step (ARCHITECTURE §8.2 step 6): schedules, pacing, the way back after a hop, barks.
   * @param {number} dt seconds
   */
  S.update = function (dt) {
    S.t += dt;
    judgeT -= dt;
    var moved = clockMoved();
    if (dirty || moved || judgeT <= 0 || gameRef !== SR.state) {
      judgeT = JUDGE_SEC;
      judge(gameRef !== SR.state);
    }
    var P = W().player, F = W().fall, falling = !!(F && typeof F.active === 'function' && F.active());
    for (var i = 0; i < S.people.length; i++) {
      var e = S.people[i], def = SR.reg.person[e.id] || {};
      e.px = e.x; e.py = e.y;
      if (e.barkT > 0) { e.barkT -= dt; if (e.barkT <= 0) { e.barkT = 0; if (e.bark !== 'toast.world.hey' || !(e.hopUntil > W().time)) e.bark = null; } }
      if (e.state === 'hop') {
        e.clip = null;
        e.hopT -= dt;
        if (e.hopT <= 0) { e.hopT = 0; e.returning = true; e.state = 'walk'; }
        continue;
      }
      if (e.returning) {
        var to = e.path ? nearestOnPath(e.path, e.x, e.y) : e.home;
        e.state = 'walk'; e.clip = null;
        if (walkTo(e, to.x, to.y, RETURN_SPEED, dt)) { if (e.path) e.seg = to.seg; settle(e, def); }
      } else if (e.idle === 'pace' && e.path) {
        pace(e, dt);
      }
      if (!falling) barkNear(e, def, P);
    }
  };

  // ------------------------------------------------------------------------------------------------
  // The junker on the lawn, drawn while it stands parked (ARCHITECTURE §8.5)
  // ------------------------------------------------------------------------------------------------

  var JUNKER = [{ id: 'junker', kind: 'junker', x: 0, y: 0, a: 0, visible: true, parked: true }];
  /** @returns {object[]|null} the parked junker as a car entity (none while driven or towed). */
  function parkedJunker() {
    var s = SR.state, P = W().player, e = JUNKER[0];
    if (!s) {
      var lot = map() && map().homeLots && map().homeLots.junker;
      if (!lot) return null;
      e.x = (lot[0] + lot[2]) / 2; e.y = (lot[1] + lot[3]) / 2; e.a = 0;
      return JUNKER;
    }
    var c = s.player && s.player.cars && s.player.cars.junker;
    if (!c || c.towed || (P && P.car === 'junker')) return null;
    e.x = c.x; e.y = c.y; e.a = typeof c.a === 'number' ? c.a : 0;
    return JUNKER;
  }
  S.parkedJunker = parkedJunker;

  // ------------------------------------------------------------------------------------------------
  // The street dialog (UI §5.7)
  // ------------------------------------------------------------------------------------------------

  function txtHas(k) { return !!k && SR.text.has(k); }
  function nameKey(id) {
    var p = SR.reg.person[id];
    if (p && txtHas(p.name)) return p.name;
    return id === 'junker' ? 'card.junker.name' : null;
  }

  /** The dialog's opening line: the named fn greet.<id>, else the person's greetings, else greet.<id>. */
  function greeting(id) {
    var s = SR.state, fn = SR.reg.fn['greet.' + id];
    if (typeof fn === 'function' && s) {
      try {
        var g = fn(s, {}, { rng: fx(), params: {}, now: s.clock.min, source: 'ui' });
        if (g) return typeof g === 'string' ? { key: g } : { key: g.key, vars: g.vars };
      } catch (e) { SR.util.warnOnce('streetnpcs.greet.' + id, 'SR.world.streetnpcs: greet.' + id + ' threw: ' + e.message); }
    }
    var p = SR.reg.person[id];
    if (p && Array.isArray(p.greetings) && p.greetings.length) return { key: fx().pick(p.greetings) };
    return { key: txtHas('greet.' + id) ? 'greet.' + id : null };
  }

  /** @returns {boolean} Skid only coughs now (data's kid.coughing: from the sixth pack). */
  function coughing(s) { var f = SR.reg.fn['kid.coughing']; return typeof f === 'function' && !!f(s, {}, {}); }

  function moodOf(id) {
    var s = SR.state;
    if (id === 'dealer') return 'smug';
    if (id === 'kid' && s && coughing(s)) return 'sad';
    return 'neutral';
  }

  /**
   * Red's NumberField: 1 .. what you can carry (99 held, orig), with a quick button for the most
   * you can take: "All I can carry", or "All I can afford" when the cash runs out first.
   */
  function numberFor(def) {
    var s = SR.state, n = Object.assign({ min: 1, step: 1, value: 1 }, def.number || {});
    if (def.id === 'street.dealer.buy' && s) {
      var R = SR.tuning.street.red.buy, room = Math.max(0, R.maxHeld - (Number(s.items.snow) || 0));
      var per = SR.rules.act.price(s, R.price, 'product.red', { params: {} }).price;
      var afford = per > 0 ? Math.floor(s.money.cash / per) : room;
      n.max = Math.max(1, room);
      var most = Math.min(room, afford);
      n.quick = most >= 2 ? [{ key: 'max', label: afford < room ? 'card.dealer.afford' : 'card.dealer.max', set: most }] : [];
    }
    return n;
  }

  /** The person's rows as Dialog choices (silent and hidden ones left out), then Leave. */
  function choicesFor(id) {
    var out = [];
    var gone = id !== 'junker' && !byId[id];
    if (!gone) {
      SR.rules.act.actions('street:' + id).forEach(function (aid) {
        var def = SR.reg.action[aid];
        if (!def || def.silent) return;
        var pv = SR.preview(aid, {});
        if (pv && pv.hidden) return;
        var ch = { id: aid, label: def.label, action: aid, params: {}, vars: { money: SR.text.money(pv && pv.cost ? pv.cost.cash : 0) } };
        if (def.number) ch.number = numberFor(def);
        out.push(ch);
      });
    }
    out.push({ id: 'leave', label: 'ui.leave', variant: out.length ? 'ghost' : 'primary' });
    return out;
  }

  /** The person's reply to what just happened (a Result of their row, or of its :resolve). */
  function reply(id, aid, res) {
    var s = SR.state, n = s && s.npc;
    if (!res || !res.ok) return res && res.reason ? { key: res.reason, vars: res.vars } : greeting(id);
    switch (aid) {
      case 'street.harold.give10':
        return { key: n.harold.gave10 === 1 ? 'card.harold.first10' : 'card.harold.thanks10', mood: 'happy' };
      case 'street.harold.giveBottle':
        return { key: n.harold.bottles === 1 ? 'card.harold.firstBottle' : 'card.harold.thanksBottle', mood: 'happy' };
      case 'street.kid.givePack':
        if (n.kid.dead) return { key: 'card.kid.last', mood: 'hurt' };
        if (n.kid.packs === 1) return { key: 'card.kid.firstPack', mood: 'happy' };
        return coughing(s) ? { key: 'card.kid.cough', mood: 'sad' } : { key: 'card.kid.thanks', mood: 'happy' };
      case 'street.dealer.buy': {
        var ev = (res.events || []).filter(function (x) { return x.name === 'buy'; })[0];
        return { key: 'card.dealer.sold', vars: { n: ev ? ev.payload.n : '' }, mood: 'smug' };
      }
      case 'street.junker.hotwire':
      case 'street.junker.ring': {
        var c = s.player.cars.junker;
        if (c && c.owned) return { key: 'card.junker.started' };
        if (aid === 'street.junker.hotwire') return { key: 'card.junker.failed' };
        var alarm = (res.toasts || []).some(function (x) { return x.key === 'toast.junker.alarm'; });
        return { key: alarm ? 'card.junker.alarm' : 'card.junker.gaveUp' };
      }
      default:
        return greeting(id);
    }
  }

  function feedback(res) {
    var card = SR.ui && SR.ui.card;
    if (res && card && typeof card.feedback === 'function') card.feedback(res, null, {});
  }

  function actNow(id, params) {
    ownAct = true;
    try { S.stats.acts++; return SR.act(id, params || {}); } finally { ownAct = false; }
  }
  function ends(res) { return !!(res && (res.down || res.jailed || res.over)); }

  /**
   * Runs a picked row (and its minigame and :resolve, CONTRACT §13) and gives the reply.
   * @returns {Promise<object|null>} the next line, or null when the conversation ends
   */
  function runRow(id, aid, n) {
    var res = actNow(aid, n !== undefined ? { n: n } : {});
    feedback(res);
    judge(false);   // at once: the world does not step under the dialog (the kid leaves, his look changes)
    if (ends(res)) return Promise.resolve(null);
    if (res && res.ok && res.open && SR.minigame && typeof SR.minigame.run === 'function') {
      var o = res.open;
      return SR.minigame.run(o.minigame, Object.assign({ skin: o.skin, resolve: o.resolve }, o.params)).then(function (result) {
        var rr = actNow(o.resolve, result || {});
        feedback(rr);
        judge(false);
        if (ends(rr)) return null;
        return reply(id, aid, rr);
      });
    }
    return Promise.resolve(reply(id, aid, res));
  }

  function sheet(id, line) {
    var p = SR.reg.person[id];
    var opts = {
      id: 'street-' + id, name: nameKey(id), text: line && line.key ? line.key : null, vars: line && line.vars,
      mood: line && line.mood ? line.mood : moodOf(id), choices: choicesFor(id), cancel: 'leave',
    };
    if (p) {
      opts.person = id;
      // The portrait follows the street look (the kid without the board he gave you), also once he
      // has left the street: his last words are said without it too.
      var lk = lookOf(p, SR.state);
      opts.portrait = lk && typeof lk === 'object' ? lk : p.portrait || p.look || id;
    }
    return SR.ui.dialog.open(opts);
  }

  function converse(id, line) {
    return sheet(id, line).then(function (r) {
      if (!r || !r.choice || r.choice === 'leave' || !SR.state) return null;
      return runRow(id, r.choice, r.n).then(function (next) { return next ? converse(id, next) : null; });
    });
  }

  function faceYou(e) {
    var P = W().player;
    if (!e || !P || e.idle === 'sit' || typeof P.x !== 'number') return;
    e.facing = heading(P.x - e.x, P.y - e.y);
    if (e.state === 'walk') e.state = 'pause';
    e.wait = Math.max(e.wait || 0, 1);
  }

  /**
   * Opens a street person's dialog (the city calls it on Interact) and runs the conversation until
   * you leave. 'junker' talks to the car on the apartment lawn while it is not yours.
   * @param {string} id a person id or 'junker'
   * @param {object=} entity the live entity the city prompted for
   * @returns {Promise<null>|false} the conversation (resolved when it ends), or false when nobody is there
   */
  S.talk = function (id, entity) {
    var s = SR.state;
    if (busy || !s || !SR.ui || !SR.ui.dialog || typeof SR.ui.dialog.open !== 'function') return false;
    if (id === 'junker') {
      var c = s.player && s.player.cars && s.player.cars.junker;
      if (!c || c.owned) return false;
    } else if (!SR.reg.person[id] || !byId[id]) return false;
    busy = true;
    S.talking = id;
    S.stats.talks++;
    faceYou(entity || byId[id]);
    if (SR.reg.action['street.' + id + '.talk']) actNow('street.' + id + '.talk', {});
    var done = function () { busy = false; S.talking = null; dirty = true; return null; };
    return converse(id, greeting(id)).then(done, function (e) {
      done();
      SR.util.warnOnce('streetnpcs.talk', 'SR.world.streetnpcs: the dialog failed: ' + (e && e.message));
      return null;
    });
  };

  /**
   * The action the Bag's Give runs for an item while a street dialog is open (GDD §6.4; the same
   * action as the dialog's row): the person's `gifts` map in data/people.js.
   * @param {string} item an item key ('booze', 'smokes', ...) or 'cash'
   * @param {string=} id the person (default: the one talking)
   * @returns {string|null} an action id
   */
  S.giveAction = function (item, id) {
    var p = SR.reg.person[id || S.talking];
    var a = p && p.gifts && p.gifts[item];
    return typeof a === 'string' && SR.reg.action[a] ? a : null;
  };

  // ------------------------------------------------------------------------------------------------
  // The day-1 job offer (GDD §6.2 Manager Mel; UI §9 step 1)
  // ------------------------------------------------------------------------------------------------

  /** Queues Mel's voicemail on a new game: day 1, still unoffered, and you hold the McSticks job (B-02). */
  function jobOffer() {
    var s = SR.state;
    if (!s || !s.clock || s.clock.day !== 1 || (s.flags && s.flags.jobOffer)) return;
    if (!s.job || !s.job.ranks || !s.job.ranks.mcsticks || !SR.reg.action['street.jobOffer']) return;
    if ((s.msgs || []).some(function (m) { return m && m.key === 'vm.mel.job'; })) return;
    actNow('street.jobOffer', {});
  }
  S.jobOffer = jobOffer;

  // ------------------------------------------------------------------------------------------------
  // Boot: listeners and the render source
  // ------------------------------------------------------------------------------------------------

  SR.onBoot(50, function () {
    SR.events.on('save:loaded', function () { jobOffer(); S.judge(true); });
    SR.events.on('day:started', function () { S.judge(true); });
    SR.events.on('action:done', function (p) {
      dirty = true;
      // The Bag's Give (W2-Pocket) runs a dialog row from outside: the open sheet re-reads its rows.
      if (!ownAct && S.talking && p && typeof p.id === 'string' && p.id.indexOf('street.') === 0 && SR.ui.dialog && SR.ui.dialog.isOpen()) SR.ui.dialog.refresh();
    });
    if (SR.render && SR.render.actors && typeof SR.render.actors.source === 'function') SR.render.actors.source('street.junker', parkedJunker, 'car');
  });
})();
