// js/scenes/bustrip.js — owner: W2-Transit. The `bustrip` scene (GDD §4.11; UI §3 "Bus trip → Trip
// scene → Event card → City (24:00) | Jail", §5.13; ART_AUDIO §4, §8).
//   params { city, kind: 'smuggle' | 'tour', from }   board and ride (the destination board sends it)
//   params { resume: true }                            back to a buyer still waiting (state.trade.offer)
// Entering commits the boarding row (trip.redeye, or trip.tour with the P1 `tours` flag) through
// SR.act: the ticket, the day, and the trip's resolution in the original order (SR.rules.trade). Then
// the ride: a 6 s scene, skippable after 1 s: the Sky Bus drops out of the Bus Hole and rides the Sky
// Ribbon past the clouds and the other floating cities while the sky goes from midnight to morning,
// and the destination island slides in. Then the event card over the destination's postcard (the
// 'trip' interior of js/art/interiors/special.js): the outcome's story (the `trip` event's text key
// and vars) with its chips, or the buyer's offer with Take it · Haggle (P1) · Walk away (the trip.*
// rows). A final outcome rides home (a short ride into the evening) to the city at 24:00 outside the
// depot; a bust hands the Result (the arrest and its night) to the jail scene. A tour plays its hook
// (the `tourhook` skin) on arrival and resolves with trip.tour:resolve.
// SR.debug.fast() (the tests) skips the rides; the cards still wait for their decision.
// Load-time rule: defines functions and registers the scene only.
(function () {
  'use strict';
  var SR = window.SR;

  // Timing and layout of the rides (UI §5.13; presentation constants, CONTRACT D49).
  var RIDE_S = 6, SKIP_AFTER = 1, HOME_S = 1.6, DEPART_U = 0.18, ARRIVE_U = 0.72;
  var RIB_Y = 470, RIB_H = 24, RIB_WAVE = 26, RIB_LEN = 260, SCROLL = 300;
  var OUT_MIN = [0, 540], HOME_MIN = [1140, 1440], POSTCARD_MIN = 720;
  var TOUR_RIDE_MIN = 120;   // a tour leaves at boarding (06:00-10:00): its sky runs from then, two hours on
  var CLOUD_LAYERS = [{ n: 5, y: [70, 220], r: [40, 70], v: 0.3 }, { n: 5, y: [240, 400], r: [50, 90], v: 0.5 }, { n: 4, y: [560, 690], r: [80, 130], v: 0.7 }];
  var STARS = 42, STAR_LEVELS = 4, FAR_S = 0.13;

  var Tr = null;    // the scene's state while it is on the stack
  var sky = null;   // the seeded clouds and stars (built once)

  function D() { return SR.ui.dom; }
  function h() { return D().h.apply(null, arguments); }
  function t(k, v) { return D().t(k, v); }
  function col(k) { return SR.art.draw.color(k); }
  function fast() { return !!(SR.debug && typeof SR.debug.fast === 'function' && SR.debug.fast()); }
  /** @returns {boolean} the press came from a binding of that input action (Esc is `back` and `pause`). */
  function boundTo(ev, action) {
    var I = SR.input;
    if (!ev || !ev.code || !I || typeof I.bindings !== 'function') return false;
    try { return (I.bindings(action) || []).indexOf(ev.code) >= 0; } catch (e) { return false; }
  }
  /** On top again (entered, or back from the pause menu): the Esc that got us here is not a new pause. */
  function onTop() {
    if (!Tr) return;
    var me = Tr;
    me.arrived = true;
    Promise.resolve().then(function () { me.arrived = false; });
  }
  function cityName(id) { return id && SR.text.has('city.' + id + '.name') ? SR.text('city.' + id + '.name') : String(id || ''); }
  function pending() { return SR.state && SR.rules.trade && SR.rules.trade.pending ? SR.rules.trade.pending(SR.state) : null; }
  function tripEvent(res) {
    var ev = null;
    ((res && res.events) || []).forEach(function (e) { if (e && e.name === 'trip') ev = e.payload; });
    return ev;
  }

  // ---- what the event card says --------------------------------------------------------------------

  /**
   * The card's content: the refusal, a buyer's offer, or a final outcome (from the decision's Result,
   * else the boarding Result's `trip` event). @returns {{kind: string, head: string, text: string,
   * res: object, ev: object, offer: object}}
   */
  function content() {
    if (Tr.res && !Tr.res.ok) {
      return { kind: 'refused', head: 'card.trip.head.refused', text: t('card.trip.refused', { reason: t(Tr.res.reason || 'reason.unknown', Tr.res.vars) }) };
    }
    var ev = tripEvent(Tr.decided) || tripEvent(Tr.res);
    if (ev) return { kind: ev.outcome === 'busted' ? 'busted' : 'final', head: 'card.trip.head.' + ev.outcome, text: t(ev.key, ev.vars), ev: ev,
      res: Tr.decided || Tr.res };
    var off = pending();
    if (off && off.kind === 'smuggle' && off.outcome === 'offer') return { kind: 'offer', head: 'card.trip.head.offer', text: t(off.key, off.vars), offer: off };
    return { kind: 'stale', head: 'card.trip.head.noBuyers',
      text: Tr.city ? t('card.trip.noOffer', { city: cityName(Tr.city) }) : t('card.trip.noOfferAny') };
  }

  function chipsOf(res) {
    var out = [];
    ((res && res.deltas) || []).forEach(function (d) {
      if (!d || !d.n || d.kind === 'time') return;
      var c = SR.ui.chip.fromDelta(d);
      if (c) out.push(c);
    });
    return out;
  }

  function button(id, label, variant, hotkey, onClick) {
    return SR.ui.button({ id: id, label: label, variant: variant, hotkey: hotkey, onClick: onClick });
  }

  function choice(c, i) {
    var pv = SR.preview(c.id, {});
    if (!pv || pv.hidden) return null;
    var chips = h('span', { style: { display: 'flex', gap: 'var(--sp-1)', flexWrap: 'wrap' } }, SR.ui.chip.gains(pv));
    var b = button('trip-' + c.name, c.label, i === 0 ? 'primary' : 'secondary', i + 1, function () { decide(c.id, b); });
    if (!pv.ok) b.update({ disabled: true, reason: pv.reason, reasonVars: pv.vars });
    return h('div', { 'data-choice': c.name, style: { display: 'flex', gap: 'var(--sp-2)', alignItems: 'center', flexWrap: 'wrap' } }, b, chips);
  }

  /** Builds (or rebuilds) the event card. */
  function showCard() {
    if (!Tr || !Tr.ui) return;
    if (Tr.card) { if (Tr.scope) SR.ui.focus.pop(Tr.scope); Tr.card.parentNode.removeChild(Tr.card); Tr.card = null; Tr.scope = null; }
    var c = Tr.view = content();
    var el = SR.ui.card({ id: 'trip-card', title: c.head, brand: D().paint('bld.bus.walls'), portrait: null, onLeave: function () { primary(); } });
    el.leave.hidden = true;
    var body = h('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)', padding: 'var(--sp-3) var(--sp-4)' } });
    body.appendChild(h('p', { class: 't-label', 'data-id': 'trip-where', style: { margin: '0', color: 'var(--ink-700)' } },
      !Tr.city ? t('card.trip.title')
        : t(Tr.params.resume ? 'card.trip.back' : Tr.kind === 'tour' ? 'card.trip.touring' : 'card.trip.leaving', { city: cityName(Tr.city) })));
    body.appendChild(h('p', { class: 't-body', 'data-id': 'trip-story', style: { margin: '0', lineHeight: 'var(--lh-body)' } }, c.text));
    if (c.kind === 'busted' && c.res && c.res.jailed) {
      body.appendChild(h('p', { class: 't-label', 'data-id': 'trip-booked', style: { margin: '0', color: 'var(--danger-ink)' } },
        SR.ui.jail && SR.ui.jail.booked ? SR.ui.jail.booked(c.res.jailed.days, c.res.jailed.reason || 'bust')
          : t('card.jail.booked', { days: c.res.jailed.days, reason: t('card.jail.reason.bust') })));
    }
    var chips = c.res ? chipsOf(c.res) : [];
    if (chips.length) body.appendChild(h('div', { 'data-id': 'trip-chips', style: { display: 'flex', gap: 'var(--sp-1)', flexWrap: 'wrap' } }, chips));
    var acts = h('div', { 'data-id': 'trip-actions', style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' } });
    Tr.buttons = [];
    if (c.kind === 'offer') {
      [{ id: 'trip.take', name: 'take', label: 'act.trip.take' }, { id: 'trip.haggle', name: 'haggle', label: 'act.trip.haggle' },
        { id: 'trip.walk', name: 'walk', label: 'act.trip.walk' }].forEach(function (x) {
        var row = choice(x, Tr.buttons.length);
        if (!row) return;
        Tr.buttons.push(row.firstChild);
        acts.appendChild(row);
      });
    } else {
      var label = c.kind === 'busted' ? 'card.trip.goQuietly' : c.kind === 'final' ? 'card.trip.rideHome' : 'card.trip.ok';
      var b = button('trip-next', label, 'primary', 1, function () { primary(); });
      Tr.buttons.push(b);
      acts.appendChild(b);
    }
    body.appendChild(acts);
    el.body.appendChild(body);
    Tr.ui.appendChild(el);
    Tr.card = el;
    Tr.scope = SR.ui.focus.push(el, { id: 'trip', autofocus: false });
    SR.ui.focus.focus(Tr.buttons[0]);
    var s = SR.state;
    el.setReadout(s ? t('ui.cardReadout', { money: SR.text.money(s.money.cash), time: SR.text.time(s.clock.min) }) : '');
    D().announce(t(c.head) + '. ' + c.text);
  }

  /** The card's main button: ride home, go quietly (a bust), or back to the depot (refused, stale). */
  function primary() {
    if (!Tr || Tr.phase !== 'card' || !Tr.view) return;
    var k = Tr.view.kind;
    if (k === 'offer') { D().refuse(Tr.buttons[0]); return; }
    if (k === 'busted') {
      var r = Tr.view.res;
      SR.scenes.go(SR.reg.scene.jail ? 'jail' : 'city', { report: r.report || null, jailed: r.jailed, from: 'trip' }, { transition: 'fade' });
      return;
    }
    if (k === 'refused' || k === 'stale') { SR.scenes.go('building', { id: 'bus', params: {} }, { transition: 'fade' }); return; }
    rideHome();
  }

  /** A decision on the buyer's offer: Take it, Haggle (P1), Walk away. */
  function decide(id, btn) {
    if (!Tr || Tr.phase !== 'card' || !Tr.view || Tr.view.kind !== 'offer') return;
    var res = SR.act(id, {});
    if (!res || !res.ok) { SR.ui.card.feedback(res, btn); return; }
    Tr.decided = res;
    showCard();
    SR.ui.card.feedback(res, Tr.card, { flash: false });
  }

  function rideHome() {
    if (!Tr) return;
    if (Tr.scope) { SR.ui.focus.pop(Tr.scope); Tr.scope = null; }
    if (Tr.card && Tr.card.parentNode) Tr.card.parentNode.removeChild(Tr.card);
    Tr.card = null;
    Tr.phase = 'home';
    Tr.t = 0;
    D().sfx('air_brake');
    D().announce(t('card.trip.rideBack'));
    if (fast()) finish();
  }

  /**
   * A press skips the ride once this input event is over: one key fires several actions (Enter is
   * `interact` and `confirm`, Esc `back` and `pause`), and the rest of the press must not reach the
   * card that the skip brings up (it would take the buyer's offer) or the city.
   */
  function skipLater() {
    var me = Tr, phase = Tr.phase;
    me.skipping = true;
    Promise.resolve().then(function () {
      me.skipping = false;
      if (Tr !== me || me.phase !== phase) return;
      if (phase === 'ride') arrive(); else finish();
    });
  }

  /** Back in the city at 24:00, outside the depot. */
  function finish() {
    if (!Tr || Tr.done) return;
    Tr.done = true;
    var s = SR.state;
    if (s && SR.world && SR.world.ready) {
      try { SR.world.place('bus', s); } catch (e) { SR.world.place('homeDoor', s); }
    }
    SR.scenes.go(SR.reg.scene.city ? 'city' : 'title', {}, { transition: 'fade' });
  }

  /** The end of the outbound ride: the tour's hook, or the event card with the trip's receipts. */
  function arrive() {
    if (!Tr || Tr.phase !== 'ride') return;
    Tr.phase = 'card';
    Tr.t = 0;
    if (Tr.caption && Tr.caption.parentNode) Tr.caption.parentNode.removeChild(Tr.caption);
    if (Tr.skip && Tr.skip.parentNode && Tr.skip.parentNode.parentNode) Tr.skip.parentNode.parentNode.removeChild(Tr.skip.parentNode);
    Tr.caption = Tr.skip = null;
    D().sfx('air_brake');
    var open = Tr.res && Tr.res.ok ? Tr.res.open : null;
    if (open && open.resolve) { hook(open); return; }
    showCard();
    // The trip's receipts (the ticket, what the trip took or paid) fly from the card to the HUD.
    if (Tr.res && Tr.res.ok) SR.ui.card.feedback(Tr.res, Tr.card, { flash: false });
  }

  /**
   * A tour's hook (P1): the `tourhook` skin, then trip.tour:resolve with its result. While the skin is
   * not registered (a stub until W3-Crime), the plain Duel engine plays the same beat (the run params
   * carry D 150, the check `tour.hook` and one beat; the engine's own Facts / Charm / Pressure options
   * are the INT / CHA / STR choices). Without a playable engine: the Auto policy, else the forfeit.
   * Nothing here may throw or leave the scene waiting: every path resolves the tour once.
   */
  function hook(open) {
    Tr.phase = 'hook';
    var me = Tr, done = false, MG = SR.minigame || {};
    var params = Object.assign({ skin: open.skin }, open.params);
    function resolve(result) {
      if (done || Tr !== me) return;
      done = true;
      var res = SR.act(open.resolve, result || { beats: [], wins: 0, exited: true });
      Tr.decided = res;
      Tr.phase = 'card';
      showCard();
      SR.ui.card.feedback(res, Tr.card, { flash: false });
    }
    function found(id, p) { try { return typeof MG.lookup === 'function' ? !!MG.lookup(id, p) : true; } catch (e) { return false; } }
    function autoOrForfeit() {
      var r = null;
      [[open.minigame, params], ['duel', open.params]].some(function (x) {
        if (!found(x[0], x[1]) || typeof MG.auto !== 'function') return false;
        try { r = MG.auto(x[0], x[1]); } catch (e) { r = null; }
        return !!r;
      });
      resolve(r);
    }
    var id = found(open.minigame, params) ? open.minigame : found('duel', open.params) ? 'duel' : null;
    var p = null;
    if (id && typeof MG.run === 'function') {
      try { p = MG.run(id, id === 'duel' ? open.params : params); } catch (e) { p = null; }
    }
    if (!p || typeof p.then !== 'function') { autoOrForfeit(); return; }
    p.then(function (r) { if (r) resolve(r); else autoOrForfeit(); }, autoOrForfeit);
  }

  // ---- drawing --------------------------------------------------------------------------------------

  function buildSky() {
    var rng = SR.rng.create(SR.util.hash('bustrip', 'sky'));
    var s = { layers: [], stars: [] };
    CLOUD_LAYERS.forEach(function (L) {
      var list = [];
      for (var i = 0; i < L.n; i++) list.push({ x: rng.float(0, SR.W + 400), y: rng.float(L.y[0], L.y[1]), r: rng.float(L.r[0], L.r[1]) });
      s.layers.push({ v: L.v, list: list });
    });
    for (var k = 0; k < STARS; k++) s.stars.push({ x: rng.float(0, SR.W), y: rng.float(0, 380), r: rng.float(0.8, 2.2) });
    return s;
  }

  function skyColours(min) {
    var kit = SR.art.interior && SR.art.interior.kit;
    return kit && kit.skyAt ? kit.skyAt(min) : { top: col('sky.0.top'), horizon: col('sky.0.horizon') };
  }

  function darkness(min) {
    var hr = (min / 60) % 24;
    if (hr < 5 || hr >= 21) return 1;
    if (hr < 7) return 1 - (hr - 5) / 2;
    if (hr >= 19) return (hr - 19) / 2;
    return 0;
  }

  /** A cut-paper cloud: flat white with a 1 u grey underside line (ART_AUDIO §4). */
  function cloud(ctx, x, y, r) {
    ctx.fillStyle = col('cloud');
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.34, 0, 0, Math.PI * 2);
    ctx.ellipse(x - r * 0.45, y + 4, r * 0.5, r * 0.26, 0, 0, Math.PI * 2);
    ctx.ellipse(x + r * 0.5, y + 6, r * 0.55, r * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - r * 0.85, y + r * 0.27);
    ctx.lineTo(x + r * 0.95, y + r * 0.27);
    ctx.lineWidth = 1;
    ctx.strokeStyle = col('cloudLine');
    ctx.stroke();
  }

  function ribbonY(x, scroll) { return RIB_Y + RIB_WAVE * Math.sin((x + scroll) / RIB_LEN); }

  function drawRibbon(ctx, scroll) {
    ctx.beginPath();
    var x;
    for (x = -40; x <= SR.W + 40; x += 20) { var y = ribbonY(x, scroll); if (x === -40) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    for (x = SR.W + 40; x >= -40; x -= 20) ctx.lineTo(x, ribbonY(x, scroll) + RIB_H);
    ctx.closePath();
    ctx.fillStyle = col('paperEdge');
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = col('inkLine');
    ctx.stroke();
    // the fold under the strip and the dashed centre line
    ctx.beginPath();
    for (x = -40; x <= SR.W + 40; x += 20) { var y2 = ribbonY(x, scroll) + RIB_H + 6; if (x === -40) ctx.moveTo(x, y2); else ctx.lineTo(x, y2); }
    ctx.lineWidth = 6;
    ctx.strokeStyle = col('strata1');
    ctx.stroke();
    ctx.save();
    ctx.setLineDash([14, 14]);
    ctx.lineDashOffset = scroll % 28;
    ctx.beginPath();
    for (x = -40; x <= SR.W + 40; x += 20) { var y3 = ribbonY(x, scroll) + RIB_H / 2; if (x === -40) ctx.moveTo(x, y3); else ctx.lineTo(x, y3); }
    ctx.lineWidth = 2;
    ctx.strokeStyle = col('lanePaint');
    ctx.stroke();
    ctx.restore();
  }

  function drawBus(ctx, x, scroll, dirIdx, T, lights) {
    if (!SR.art.vehicles || typeof SR.art.vehicles.draw !== 'function') return;
    var y = ribbonY(x, scroll) + RIB_H / 2;
    var slope = (ribbonY(x + 10, scroll) - ribbonY(x - 10, scroll)) / 20;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.atan(slope) * 0.8);
    var bob = D().reduced() ? 0 : Math.sin(T * 11) * 1.2;
    SR.art.vehicles.draw(ctx, 'skybus', dirIdx, 0, bob, { scale: 0.6, t: T, lights: lights });
    ctx.restore();
  }

  /** The departure: the city's sheet with the Bus Hole slides up and away as the bus drops out. */
  function drawSheet(ctx, k) {
    var bottom = SR.util.lerp(250, -80, SR.util.easeIn(k));
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-40, -200); ctx.lineTo(620, -200); ctx.lineTo(600, bottom); ctx.lineTo(-40, bottom + 30); ctx.closePath();
    ctx.fillStyle = col('grass');
    ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = col('inkLine'); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-40, bottom + 30); ctx.lineTo(600, bottom); ctx.lineTo(600, bottom + 24); ctx.lineTo(-40, bottom + 54); ctx.closePath();
    ctx.fillStyle = col('strata1'); ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(430, bottom - 40, 90, 26, 0, 0, Math.PI * 2);
    ctx.fillStyle = col('asphalt'); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function drawIsland(ctx, id, x, y, s, T, night) {
    var def = SR.reg.interior && SR.reg.interior.trip;
    var fn = def && def.fns && def.fns.island;
    if (typeof fn === 'function') fn(ctx, id, x, y, s, T, { night: night, still: D().reduced() });
  }

  /** A distant city: its baked sprite (one drawImage), else the painter. */
  function drawFarIsland(ctx, id, x, y, s, T, night) {
    var def = SR.reg.interior && SR.reg.interior.trip;
    var bake = def && def.fns && def.fns.islandSprite;
    var sp = typeof bake === 'function' ? bake(id, s, night, (SR.stage && SR.stage.scale) || 1) : null;
    if (sp) ctx.drawImage(sp.canvas, x + sp.x, y + sp.y, sp.w, sp.h);
    else drawIsland(ctx, id, x, y, s, T, night);
  }

  /** The stars, their twinkle quantised to STAR_LEVELS alpha steps: one fill per step. */
  function drawStars(ctx, T, dk) {
    ctx.save();
    ctx.fillStyle = col('light.star');
    for (var lvl = 1; lvl <= STAR_LEVELS; lvl++) {
      ctx.beginPath();
      var any = false;
      for (var i = 0; i < sky.stars.length; i++) {
        var st = sky.stars[i];
        var a = 0.6 + 0.4 * Math.sin(T * 2 + i);
        if (Math.max(1, Math.round(a * STAR_LEVELS)) !== lvl) continue;
        ctx.rect(st.x, st.y, st.r, st.r);
        any = true;
      }
      if (!any) continue;
      ctx.globalAlpha = dk * lvl / STAR_LEVELS;
      ctx.fill();
    }
    ctx.restore();
  }

  /** A ride: u 0..1; dir +1 out to the city, -1 back home. */
  function drawRide(ctx, u, dir) {
    if (!sky) sky = buildSky();
    var W = SR.W, Hh = SR.H;
    var span = dir < 0 ? HOME_MIN : Tr.kind === 'tour' ? [Tr.boardMin, Tr.boardMin + TOUR_RIDE_MIN] : OUT_MIN;
    var min = SR.util.lerp(span[0], span[1], u);
    var T = Tr.clock;
    var sc = skyColours(min);
    var g = ctx.createLinearGradient(0, 0, 0, Hh);
    g.addColorStop(0, sc.top);
    g.addColorStop(1, sc.horizon);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, Hh);
    var dk = darkness(min);
    if (dk > 0) drawStars(ctx, T, dk);
    var reduced = D().reduced();
    // the other cities, far away (parallax 0.15), as baked sprites
    if (!Tr.others) Tr.others = (SR.rules.trade ? SR.rules.trade.cityIds() : []).filter(function (id) { return id !== Tr.city; });
    Tr.others.forEach(function (id, i) {
      var x = ((i * 290 + 120 - T * 18 * dir) % (W + 300) + (W + 300)) % (W + 300) - 150;
      drawFarIsland(ctx, id, x, 250 + (i % 2) * 40, FAR_S, T, dk > 0.5);
    });
    sky.layers.forEach(function (L, li) {
      if (li === 2) return;
      var v = reduced ? 0.4 : L.v;
      L.list.forEach(function (c) {
        var x = ((c.x - T * 400 * v * dir) % (W + 400) + (W + 400)) % (W + 400) - 200;
        cloud(ctx, x, c.y, c.r);
      });
    });
    var scroll = T * SCROLL * dir;
    drawRibbon(ctx, scroll);
    var night = dk > 0.3;
    if (dir > 0) {
      if (u > ARRIVE_U) {
        var k = SR.util.easeOut((u - ARRIVE_U) / (1 - ARRIVE_U));
        drawIsland(ctx, Tr.city, SR.util.lerp(1560, 1020, k), 420, 0.62, T, night);
      }
      var drop = u < DEPART_U ? SR.util.easeOut(u / DEPART_U) : 1;
      ctx.save();
      ctx.translate(0, (1 - drop) * -260);
      drawBus(ctx, 470, scroll, 0, T, night);
      ctx.restore();
      if (u < DEPART_U) drawSheet(ctx, u / DEPART_U);
    } else {
      drawIsland(ctx, Tr.city, SR.util.lerp(1020, 1600, SR.util.easeIn(u)), 420, 0.62, T, night);
      drawBus(ctx, 780, scroll, 4, T, night);
    }
    // the near cloud layer passes in front of the ribbon
    var near = sky.layers[2];
    near.list.forEach(function (c) {
      var x = ((c.x - T * 400 * (reduced ? 0.4 : near.v) * dir) % (W + 400) + (W + 400)) % (W + 400) - 200;
      cloud(ctx, x, c.y, c.r);
    });
    if (dir < 0 && u > 0.7) {
      ctx.save();
      ctx.globalAlpha = (u - 0.7) / 0.3;
      ctx.fillStyle = col('ui.paper-1');
      ctx.fillRect(0, 0, W, Hh);
      ctx.restore();
    }
  }

  function drawPostcard(ctx) {
    var r = Tr.postcard;
    if (!r) { ctx.fillStyle = col('ui.paper-1'); ctx.fillRect(0, 0, SR.W, SR.H); return; }
    var scale = (SR.stage && SR.stage.scale) || 1;
    if (!Tr.cache || Tr.cacheScale !== scale) {
      Tr.cache = Tr.cache || document.createElement('canvas');
      Tr.cache.width = Math.round(SR.W * scale);
      Tr.cache.height = Math.round(SR.H * scale);
      var c = Tr.cache.getContext('2d');
      c.setTransform(scale, 0, 0, scale, 0, 0);
      try { r.drawStatic(c, SR.state); } catch (e) { SR.util.warnOnce('bustrip.static', 'bustrip: drawStatic failed: ' + e.message); }
      Tr.cacheScale = scale;
    }
    ctx.drawImage(Tr.cache, 0, 0, SR.W, SR.H);
    try { r.drawAnim(ctx, Tr.clock, SR.state, {}); } catch (e2) { SR.util.warnOnce('bustrip.anim', 'bustrip: drawAnim failed: ' + e2.message); }
  }

  // ---- the scene ------------------------------------------------------------------------------------

  SR.scenes.register('bustrip', {
    kind: 'base',
    music: 'midnight_express',
    enter: function (params) {
      params = params || {};
      var s = SR.state;
      Tr = { params: params, city: params.city || null, kind: params.kind === 'tour' ? 'tour' : 'smuggle', phase: 'ride', t: 0, clock: 0,
        res: null, decided: null, view: null, card: null, scope: null, ui: null, buttons: [], cache: null, cacheScale: 0, done: false,
        caption: null, skip: null, others: null, boardMin: OUT_MIN[0], arrived: false, skipping: false };
      if (!s) return;
      Tr.boardMin = s.clock.min;
      if (params.resume) {
        var off = pending();
        Tr.city = off ? off.city : Tr.city;
        Tr.phase = 'card';
      } else {
        Tr.res = SR.act(Tr.kind === 'tour' ? 'trip.tour' : 'trip.redeye', { city: Tr.city, kind: Tr.kind });
        if (!Tr.res || !Tr.res.ok) Tr.phase = 'card';
      }
      Tr.postcard = SR.art && typeof SR.art.interior === 'function' && Tr.city ? SR.art.interior('trip', { city: Tr.city, min: POSTCARD_MIN, still: D().reduced() }) : null;
      onTop();
    },
    exit: function () {
      if (Tr && Tr.scope) SR.ui.focus.pop(Tr.scope);
      Tr = null;
    },
    // Back from the pause menu: the Esc that closed it is not a new pause.
    resume: function () { onTop(); },
    update: function (dt) {
      if (!Tr) return;
      Tr.t += dt;
      Tr.clock += dt;
      if (Tr.phase === 'ride') {
        if (Tr.skip) Tr.skip.hidden = Tr.t < SKIP_AFTER;
        if (Tr.t >= RIDE_S) arrive();
      } else if (Tr.phase === 'home' && Tr.t >= HOME_S) finish();
    },
    render: function (ctx) {
      if (!Tr || !ctx) return;
      if (Tr.phase === 'ride') drawRide(ctx, SR.util.clamp(Tr.t / RIDE_S, 0, 1), 1);
      else if (Tr.phase === 'home') drawRide(ctx, SR.util.clamp(Tr.t / HOME_S, 0, 1), -1);
      else drawPostcard(ctx);
    },
    /** @returns {object|null} the scene's state (tests): phase, city, kind, the card's kind and head. */
    info: function () {
      return Tr ? { phase: Tr.phase, t: Tr.t, city: Tr.city, kind: Tr.kind, card: Tr.view ? Tr.view.kind : null,
        head: Tr.view ? Tr.view.head : null, outcome: Tr.view && Tr.view.ev ? Tr.view.ev.outcome : null, done: Tr.done } : null;
    },
    onAction: function (action, ev) {
      if (!Tr) return false;
      ev = ev || {};
      if (ev.down === false) return false;
      var press = action === 'confirm' || action === 'back' || action === 'interact';
      if ((press || /^row\d$/.test(action)) && SR.ui.stamp.swallow()) return true;
      if (Tr.phase === 'ride' || Tr.phase === 'home') {
        if (press && !ev.repeat && Tr.t >= SKIP_AFTER && !Tr.skipping) skipLater();
        return true;
      }
      if (Tr.phase !== 'card') return false;
      if (action === 'interact') return true;
      var m = /^row(\d)$/.exec(action);
      if (m) {
        var b = Tr.buttons[Number(m[1]) - 1];
        if (b && !ev.repeat) { SR.ui.focus.focus(b); b.click(); }
        return true;
      }
      if (SR.ui.focus.handle(action, ev)) return true;
      // Esc is both `back` and `pause` (CONTRACT §12.1). On a buyer's offer a decision is due (no
      // way back), so Esc opens the pause menu; on any other card Esc is its main button (ride home,
      // go quietly, back to the depot) and does not also pause.
      var offer = !!(Tr.view && Tr.view.kind === 'offer');
      if (action === 'back') {
        if (offer && boundTo(ev, 'pause')) return true;
        primary();
        return true;
      }
      if (action === 'pause') {
        if (boundTo(ev, 'back') && (Tr.arrived || !offer)) return true;
        if (SR.reg.scene.pause) SR.scenes.push('pause');
        return true;
      }
      return false;
    },
    ui: {
      mount: function (root) {
        if (!Tr) return;
        root.classList.add('scene-bustrip');
        Tr.ui = root;
        // The trip is a presentation: no Pocket (the phone's cab would leave the Sky Bus, even a
        // bust's card with the arrest already made), so the HUD's Pocket button goes.
        var hud = SR.ui.hud.mount(root, { compact: true });
        var pb = hud && hud.querySelector ? hud.querySelector('[data-id="hud-pocket"]') : null;
        if (pb) pb.hidden = true;
        if (Tr.phase === 'ride') {
          Tr.caption = h('h2', { class: 't-h2', 'data-id': 'trip-caption', style: { position: 'absolute', left: '0', right: '0', top: '72px',
            textAlign: 'center', margin: '0', color: 'var(--paper-0)', textShadow: '0 3px 0 var(--ink-900)', pointerEvents: 'none' } },
          t(Tr.kind === 'tour' ? 'card.trip.touring' : 'card.trip.leaving', { city: cityName(Tr.city) }));
          Tr.skip = SR.ui.button({ id: 'trip-skip', label: 'card.trip.skip', hint: 'confirm', variant: 'secondary', size: 's',
            onClick: function () { if (Tr && Tr.phase === 'ride' && Tr.t >= SKIP_AFTER) arrive(); } });
          Tr.skip.hidden = true;
          root.appendChild(Tr.caption);
          root.appendChild(h('div', { style: { position: 'absolute', right: '32px', bottom: '32px' } }, Tr.skip));
          D().announce(t('card.trip.ride', { city: cityName(Tr.city) }));
          D().sfx('air_brake');
          if (fast()) arrive();
        } else {
          showCard();
        }
      },
      unmount: function () {
        if (Tr && Tr.scope) { SR.ui.focus.pop(Tr.scope); Tr.scope = null; }
        SR.ui.hud.unmount();
      },
    },
  });
})();
