// js/ui/pocket/map.js — owner: W2-Pocket (W3-Park in wave 3). The Pocket's Map tab (UI §5.9): the
// whole island as an ink map on its own canvas (pan by dragging, the arrow keys or the stick; zoom
// with the wheel, a pinch, +/- or the buttons, from the whole island up to 1 px per u), place pins
// in their building's brand colour, the people on the street (W2-Street's schedules), your arrow,
// your cars, your click-to-walk route and the waypoint; filters (Food, Work, Train, Shops,
// Services, Homes, People); a keyboard list of the places. Picking a place opens its card: what
// there is to do inside, the walking time, **Set waypoint** and, with a phone (P1 `phone`), **Call
// a cab** (W2-City's SR.world.cab). A waypoint is the minimap's pin (SR.render.minimap.waypoint)
// and leads the click-to-walk route: over the city the Pocket closes and you walk there
// (SR.world.player.walkTo; a door's route enters it); from a building the route starts when you
// step outside; over a street dialog it is only pinned. It clears when you enter that door (a home
// door too) or talk to the person it marks. On the focused map the arrows pan, and an arrow at the
// map's edge moves focus on (no keyboard trap). The Fold Map is P1 (`scraps`, W3-Park).
// Colours: palette keys through SR.art.draw.color (canvas) and tokens (DOM). Registered with
// SR.ui.pocket.panel at boot (prio 50). Load-time rule: defines functions only.
(function () {
  'use strict';
  var SR = window.SR;

  var FILTERS = ['food', 'work', 'train', 'shops', 'services', 'homes', 'people'];
  // The filter of each action group (B-05 groups of the card): a place shows under every one it offers.
  var GROUP_CAT = { eat: 'food', work: 'work', train: 'train', buy: 'shops', services: 'services', special: 'services' };
  var Z_MAX = 1;                // UI §5.9: zoom up to 1 (1 px per u)
  var Z_MIN = 0.25;             // UI §5.9's floor, lowered to the whole island when it does not fit
  var Z_STEP = 1.5;
  var PAN_KEY = 72;             // px a key press pans
  var LABEL_Z = 0.15;           // names show from this zoom (below it only the picked place's)
  var PIN_R = 7, HIT_R = 16, YOU_R = 8;
  var CLICK_PX = 6;             // a press that moves less than this is a click, not a drag
  var MAP_MIN_H = 220;
  var SUMMARY_MAX = 4;          // action labels listed on a place's card

  var M = null;                                 // the mounted tab
  var filters = {};                             // this session's filter toggles
  FILTERS.forEach(function (f) { filters[f] = true; });
  var view = null;                              // { x, y, z }: kept while the Pocket closes and opens
  var wp = null;                                // the waypoint { id, x, y, name, door }
  var pendingRoute = false;                     // a waypoint set inside a building: walk when you leave

  function D() { return SR.ui.dom; }
  function h() { return D().h.apply(null, arguments); }
  function t(k, v) { return D().t(k, v); }
  function A() { return SR.art && SR.art.draw; }
  function col(key) { return A() ? A().color(key) : ''; }
  function mix(a, b, k) { return A() ? A().mix(a, b, k) : col(a); }
  function G() { return SR.world && SR.world.geometry; }
  function wm() { return SR.reg.worldmap && SR.reg.worldmap.main; }
  function bounds() { var g = G(); return g && g.bounds ? g.bounds : [480, 200, 4396, 4440]; }

  // ------------------------------------------------------------------------------------------------
  // Places

  /** @returns {string[]} the filters a building's actions fall under (its card's groups). */
  function catsOf(building) {
    var ids = SR.rules.act && typeof SR.rules.act.actions === 'function' ? SR.rules.act.actions(building) : [];
    var cats = {};
    ids.forEach(function (id) {
      var def = SR.reg.action[id];
      if (!def || def.hidden === true || (def.feature && !(SR.features && SR.features[def.feature]))) return;
      var c = GROUP_CAT[def.group];
      if (c) cats[c] = true;
    });
    return FILTERS.filter(function (f) { return cats[f]; });
  }

  function brandKey(buildingId) {
    var g = G(), b = g && g.buildings && g.buildings[buildingId];
    var key = (b && b.def && b.def.exterior && b.def.exterior.palette || 'bld.' + buildingId) + '.walls';
    return D().paint(key) ? key : 'bld.default.walls';
  }

  /** @returns {object[]} every place the map knows: doors, then the people on the street. */
  function places() {
    var out = [], g = G(), s = SR.state;
    if (!g || !g.built) return out;
    g.doors.forEach(function (d) {
      var res = d.homes && SR.world.doors && typeof SR.world.doors.resolve === 'function' && s ? SR.world.doors.resolve(d.id, s) : null;
      var building = res ? res.id : d.building;
      out.push({ id: d.id, kind: 'door', building: building, params: res ? res.params : {}, x: d.x, y: d.y, tx: d.tc[0], ty: d.tc[1],
        name: t(d.name), cats: d.homes ? ['homes'] : catsOf(building), brand: brandKey(d.building), homes: !!d.homes });
    });
    var SN = SR.world.streetnpcs;
    Object.keys(SR.reg.person || {}).forEach(function (id) {
      var def = SR.reg.person[id];
      if (def.feature && !(SR.features && SR.features[def.feature])) return;
      var e = SN && typeof SN.get === 'function' ? SN.get(id) : null;
      var at = e && e.visible !== false ? { x: e.x, y: e.y } : SN && typeof SN.placeOf === 'function' ? SN.placeOf(id) : null;
      if (!at || typeof at.x !== 'number') return;
      out.push({ id: 'person:' + id, kind: 'person', person: id, x: at.x, y: at.y, tx: at.x, ty: at.y, name: def.name ? t(def.name) : id,
        cats: ['people'], brand: 'ui.cha' });
    });
    var lot = wm() && wm().homeLots && wm().homeLots.junker, row = s && s.player && s.player.cars && s.player.cars.junker;
    if (lot && row && !row.owned && SR.reg.action['street.junker.talk']) {
      var cx = (lot[0] + lot[2]) / 2, cy = (lot[1] + lot[3]) / 2;
      out.push({ id: 'junker', kind: 'person', person: 'junker', x: cx, y: cy, tx: cx, ty: cy, name: t('pocket.map.spot.junker'), cats: ['people'], brand: 'car.junker' });
    }
    return out;
  }

  function visible(p) { return p.cats.some(function (c) { return filters[c]; }) || (M && M.sel === p.id); }

  // ------------------------------------------------------------------------------------------------
  // The view

  function fitZ(W, H) { var b = bounds(); return Math.min(W / (b[2] - b[0]), H / (b[3] - b[1])) * 0.96; }
  function zMin() { return Math.min(Z_MIN, fitZ(M.W, M.H)); }
  function clampView() {
    var b = bounds();
    view.z = Math.max(zMin(), Math.min(Z_MAX, view.z));
    view.x = Math.max(b[0], Math.min(b[2], view.x));
    view.y = Math.max(b[1], Math.min(b[3], view.y));
  }
  function toScreen(x, y) { return { x: (x - view.x) * view.z + M.W / 2, y: (y - view.y) * view.z + M.H / 2 }; }
  function toWorld(sx, sy) { return { x: (sx - M.W / 2) / view.z + view.x, y: (sy - M.H / 2) / view.z + view.y }; }

  /** Zooms by a factor around a canvas point (default the centre). */
  function zoomBy(f, sx, sy) {
    if (sx === undefined) { sx = M.W / 2; sy = M.H / 2; }
    var before = toWorld(sx, sy);
    view.z *= f;
    clampView();
    var after = toWorld(sx, sy);
    view.x += before.x - after.x;
    view.y += before.y - after.y;
    clampView();
    draw();
  }
  /** Pans the view by screen pixels. @returns {boolean} the view moved (false: it is at that edge) */
  function panBy(dx, dy) {
    var x = view.x, y = view.y;
    view.x -= dx / view.z; view.y -= dy / view.z;
    clampView();
    draw();
    return Math.abs(view.x - x) > 1e-6 || Math.abs(view.y - y) > 1e-6;
  }

  function centreOnYou() {
    var P = SR.world.player;
    if (!P || typeof P.x !== 'number') return;
    view.x = P.x; view.y = P.y;
    view.z = Math.max(view.z, 0.35);
    clampView();
    draw();
  }

  // ------------------------------------------------------------------------------------------------
  // Drawing

  function rectPath(ctx, r) {
    var a = toScreen(r[0], r[1]), b = toScreen(r[2], r[3]);
    ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y);
  }

  function drawIsland(ctx) {
    var m = wm();
    if (!m) return;
    var paper = 'ui.paper-1', ink = col('ink');
    ctx.beginPath();
    m.outline.forEach(function (p, i) { var q = toScreen(p[0], p[1]); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); });
    ctx.closePath();
    ctx.fillStyle = mix('grass', paper, 0.45);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = ink;
    ctx.stroke();
    var order = { plaza: 1, path: 2, sidewalk: 3, asphalt: 4 };
    (m.streets || []).slice().sort(function (a, b) { return (order[a.kind] || 0) - (order[b.kind] || 0); }).forEach(function (st) {
      var key = st.kind === 'asphalt' ? 'asphalt' : st.kind === 'sidewalk' ? 'sidewalk' : st.kind === 'plaza' ? 'plaza' : 'path';
      ctx.fillStyle = mix(key, paper, st.kind === 'asphalt' ? 0.3 : 0.45);
      ctx.beginPath(); rectPath(ctx, st.rect); ctx.fill();
    });
    ctx.fillStyle = mix('asphalt', paper, 0.3);
    (m.junctions || []).forEach(function (j) { ctx.beginPath(); rectPath(ctx, j.rect); ctx.fill(); });
    ctx.fillStyle = col('ui.paper-2');
    (m.holes || []).forEach(function (hole) { ctx.beginPath(); rectPath(ctx, hole.rect); ctx.fill(); ctx.stroke(); });
    if (m.features && m.features.pond) {
      var p = m.features.pond, c = toScreen(p.x, p.y);
      ctx.fillStyle = mix('water', paper, 0.3);
      ctx.beginPath(); ctx.ellipse(c.x, c.y, p.rx * view.z, p.ry * view.z, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.lineWidth = 1.25;
    (m.buildings || []).forEach(function (b) {
      var key = (b.exterior && b.exterior.palette ? b.exterior.palette : 'bld.' + b.id) + '.roof';
      ctx.fillStyle = mix(D().paint(key) ? key : 'bld.default.roof', paper, 0.25);
      (b.masses || []).forEach(function (ms) { ctx.beginPath(); rectPath(ctx, ms.rect); ctx.fill(); ctx.stroke(); });
    });
  }

  function drawRoute(ctx) {
    var P = SR.world.player, pts = P && Array.isArray(P.path) ? P.path : null;
    if (!pts || !pts.length) return;
    ctx.save();
    ctx.setLineDash([4, 5]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = col('ink');
    ctx.beginPath();
    var a = toScreen(P.x, P.y);
    ctx.moveTo(a.x, a.y);
    pts.forEach(function (q) { var s = toScreen(q.x, q.y); ctx.lineTo(s.x, s.y); });
    ctx.stroke();
    ctx.restore();
  }

  function label(ctx, text, x, y) {
    ctx.font = '700 13px ' + (D().token('--font-ui') || 'sans-serif');
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = col('ui.paper-0');
    ctx.strokeText(text, x, y);
    ctx.fillStyle = col('ui.ink-900');
    ctx.fillText(text, x, y);
  }

  function drawPins(ctx) {
    var ink = col('ink');
    M.shown.forEach(function (p) {
      var s = toScreen(p.x, p.y), sel = M.sel === p.id;
      ctx.lineWidth = sel ? 3 : 1.5;
      ctx.strokeStyle = ink;
      ctx.fillStyle = col(p.brand);
      ctx.beginPath();
      if (p.kind === 'person') {
        ctx.arc(s.x, s.y - 4, PIN_R - 2, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(s.x, s.y + 1); ctx.lineTo(s.x, s.y + 8); ctx.stroke();
      } else {
        ctx.arc(s.x, s.y, sel ? PIN_R + 2 : PIN_R, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      }
      if (view.z >= LABEL_Z || sel || M.hoverId === p.id) label(ctx, p.name, s.x + PIN_R + 4, s.y);
    });
  }

  function drawWaypoint(ctx) {
    if (!wp) return;
    var s = toScreen(wp.x, wp.y), c = col('ui.danger');
    ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(s.x, s.y, 11, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s.x, s.y - 11); ctx.lineTo(s.x, s.y - 26); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s.x, s.y - 26); ctx.lineTo(s.x + 11, s.y - 22); ctx.lineTo(s.x, s.y - 18); ctx.closePath(); ctx.fill();
  }

  function drawYou(ctx) {
    var s = SR.state, P = SR.world.player, ink = col('ink');
    if (s && s.player && s.player.cars) {
      ['junker', 'sports'].forEach(function (id) {
        var row = s.player.cars[id];
        if (!row || !row.owned || row.towed || (P && P.car === id)) return;
        var q = toScreen(row.x, row.y);
        ctx.fillStyle = col('car.' + id); ctx.strokeStyle = ink; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.rect(q.x - 6, q.y - 4, 12, 8); ctx.fill(); ctx.stroke();
      });
    }
    if (!P || typeof P.x !== 'number') return;
    var p = toScreen(P.x, P.y), a = ((P.facing || 0) - 90) * Math.PI / 180, r = YOU_R;
    var head = SR.art.stick && typeof SR.art.stick.karmaColor === 'function' ? SR.art.stick.karmaColor(s ? s.stats.karma : 0) : col('karma.good.0');
    ctx.fillStyle = col('ui.paper-0');
    ctx.beginPath(); ctx.arc(p.x, p.y, r + 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
    ctx.lineTo(p.x + Math.cos(a + 2.5) * r * 0.85, p.y + Math.sin(a + 2.5) * r * 0.85);
    ctx.lineTo(p.x - Math.cos(a) * r * 0.35, p.y - Math.sin(a) * r * 0.35);
    ctx.lineTo(p.x + Math.cos(a - 2.5) * r * 0.85, p.y + Math.sin(a - 2.5) * r * 0.85);
    ctx.closePath();
    ctx.fillStyle = typeof head === 'string' ? head : col('karma.good.0');
    ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = ink; ctx.stroke();
  }

  function draw() {
    if (!M || !M.cv) return;
    var cv = M.cv, ctx = M.ctx;
    if (!ctx) return;
    var r = cv.getBoundingClientRect(), dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    var bw = Math.max(1, Math.round((r.width || M.W) * dpr)), bh = Math.max(1, Math.round((r.height || M.H) * dpr));
    if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
    ctx.setTransform(bw / M.W, 0, 0, bh / M.H, 0, 0);
    ctx.fillStyle = col('ui.paper-2');
    ctx.fillRect(0, 0, M.W, M.H);
    M.shown = M.all.filter(visible);
    drawIsland(ctx);
    drawRoute(ctx);
    drawPins(ctx);
    drawWaypoint(ctx);
    drawYou(ctx);
    M.draws = (M.draws || 0) + 1;
    cv.setAttribute('aria-label', t('pocket.map.aria', { n: M.shown.length }));
  }

  // ------------------------------------------------------------------------------------------------
  // Picking a place, the card, the waypoint

  function placeById(id) { for (var i = 0; i < M.all.length; i++) if (M.all[i].id === id) return M.all[i]; return null; }

  function hit(sx, sy) {
    var best = null, bd = HIT_R;
    (M.shown || []).forEach(function (p) {
      var s = toScreen(p.x, p.y), d = Math.hypot(s.x - sx, s.y - sy);
      if (d <= bd) { bd = d; best = p; }
    });
    return best;
  }

  /** @returns {{sec: number, skate: number}|null} seconds on foot (and on a board) along the nav route. */
  function walkTime(p) {
    var P = SR.world.player, nav = SR.world.nav, T = SR.tuning.world;
    if (!P || !nav || typeof nav.path !== 'function' || typeof P.x !== 'number') return null;
    var path = null;
    try { path = nav.path({ x: P.x, y: P.y }, { x: p.tx, y: p.ty }); } catch (e) { path = null; }
    if (!path) return null;
    var len = 0, x = P.x, y = P.y;
    path.forEach(function (q) { len += Math.hypot(q.x - x, q.y - y); x = q.x; y = q.y; });
    var board = P.hasBoard && P.hasBoard();
    return { len: len, sec: Math.max(1, Math.round(len / T.walk.speed)), skate: board ? Math.max(1, Math.round(len / T.skate.speed)) : null };
  }

  /** The labels of what a building offers (its visible, allowed card rows), for the place's card. */
  function summary(p) {
    if (p.kind !== 'door') return [];
    var def = SR.reg.building && SR.reg.building[p.building];
    var ids;
    if (def && def.modes && p.params && p.params.mode && def.modes[p.params.mode]) {
      var m = def.modes[p.params.mode];
      ids = Array.isArray(m) ? m : m.actions || [];
    } else ids = SR.rules.act && SR.rules.act.actions ? SR.rules.act.actions(p.building) : [];
    var out = [];
    ids.forEach(function (id) {
      var a = SR.reg.action[id];
      if (!a || a.row === false) return;
      var pv = SR.ui.pocket.preview(id, p.params || {});
      if (pv && !pv.hidden) out.push(t(a.label || 'act.' + id));
    });
    return out;
  }

  function select(id) {
    M.sel = id;
    draw();
    renderCard();
    renderList();
    var p = id ? placeById(id) : null;
    if (p) D().announce(t('pocket.map.sel', { place: p.name }));
  }

  function cabOk() {
    var s = SR.state;
    return !!(SR.features && SR.features.phone && s && s.items && s.items.phone > 0 && SR.reg.action['world.cab'] && typeof SR.world.cab === 'function');
  }

  /**
   * Sets the waypoint on a place: the minimap's pin, and the click-to-walk route to it (over the
   * city now; from a building once you step outside).
   * @returns {boolean} a route started
   */
  function setWaypoint(p) {
    wp = { id: p.id, x: p.tx, y: p.ty, name: p.name, door: p.kind === 'door' ? p.id : null };
    if (SR.render.minimap && typeof SR.render.minimap.waypoint === 'function') SR.render.minimap.waypoint(wp.x, wp.y);
    var ctx = M && M.ctxP, st = SR.scenes.stack(), onCity = st.join() === 'city,pocket';
    if (onCity) {
      var P = SR.world.player;
      if (P && P.car) { SR.ui.toast({ key: 'pocket.map.waypointCar', kind: 'info', id: 'toast-waypoint' }); redrawCard(); return false; }
      if (ctx) ctx.close();
      var ok = P && typeof P.walkTo === 'function' ? P.walkTo(wp.x, wp.y) : false;
      SR.ui.toast({ key: ok ? 'pocket.map.waypointSet' : 'toast.world.noRoute', vars: { place: wp.name }, kind: 'info', id: 'toast-waypoint' });
      return ok;
    }
    if (st[0] === 'city') {
      // Out in the city but under a street dialog: you are already outside, so no "head outside"
      // route waits for a door; the pin is on the minimap and a click walks you there.
      pendingRoute = false;
      SR.ui.toast({ key: 'pocket.map.waypointSet', vars: { place: wp.name }, kind: 'info', id: 'toast-waypoint' });
      redrawCard();
      return false;
    }
    pendingRoute = true;
    SR.ui.toast({ key: 'pocket.map.waypointLater', kind: 'info', id: 'toast-waypoint' });
    redrawCard();
    return false;
  }

  /** Clears the waypoint (the minimap's pin and any route waiting for a door). */
  function dropWaypoint() {
    var had = wp;
    wp = null;
    pendingRoute = false;
    // The minimap's pin is ours only while we hold a waypoint (another package may pin one too).
    if (had && SR.render.minimap && typeof SR.render.minimap.waypoint === 'function') SR.render.minimap.waypoint(null);
  }

  function clearWaypoint() {
    dropWaypoint();
    SR.ui.toast({ key: 'pocket.map.waypointCleared', kind: 'info', id: 'toast-waypoint' });
    redrawCard();
  }

  /**
   * Redraws the map and the place's card after the waypoint changed. Set becomes Clear (and back),
   * so a focused button would be re-rendered away: focus moves to its replacement.
   */
  function redrawCard() {
    if (!M) return;
    var a = document.activeElement, inCard = !!(a && M.card.contains(a));
    draw();
    renderCard();
    if (!inCard) return;
    var again = M.card.querySelector('[data-id="map-waypoint"], [data-id="map-clear-waypoint"]');
    if (again) SR.ui.focus.focus(again);
  }

  function renderCard() {
    if (!M) return;
    var c = M.card;
    D().clear(c);
    var p = M.sel ? placeById(M.sel) : null;
    c.hidden = !p;
    if (!p) return;
    c.appendChild(h('h3', { class: 't-h3', 'data-id': 'map-card-name', style: { margin: '0', color: 'var(--ink-900)' } }, p.name));
    if (p.kind === 'door') {
      var list = summary(p);
      if (list.length) {
        var shown = list.slice(0, SUMMARY_MAX).join(', ') + (list.length > SUMMARY_MAX ? ', …' : '');
        c.appendChild(h('p', { class: 't-small', 'data-id': 'map-card-actions', style: { margin: '2px 0 0', color: 'var(--ink-700)' } },
          t('pocket.map.actions', { n: list.length, list: shown })));
      }
    } else c.appendChild(h('p', { class: 't-small', style: { margin: '2px 0 0', color: 'var(--ink-700)' } }, t('pocket.map.person')));
    var w = walkTime(p);
    var P = SR.world.player;
    var near = P && typeof P.x === 'number' && Math.hypot(P.x - p.tx, P.y - p.ty) < 48;
    c.appendChild(h('p', { class: 't-small', 'data-id': 'map-card-walk', style: { margin: '2px 0 var(--sp-2)', color: 'var(--ink-700)' } },
      near ? t('pocket.map.here') : !w ? t('pocket.map.noRoute') : t('pocket.map.walk', { sec: w.sec }) + (w.skate ? ' · ' + t('pocket.map.skate', { sec: w.skate }) : '')));
    var btns = h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)' } });
    var isWp = wp && wp.id === p.id;
    btns.appendChild(SR.ui.button({ id: isWp ? 'map-clear-waypoint' : 'map-waypoint', label: isWp ? 'pocket.map.clearWaypoint' : 'pocket.map.waypoint',
      icon: 'map', size: 's', variant: isWp ? 'secondary' : 'primary', onClick: function () { if (isWp) clearWaypoint(); else setWaypoint(p); } }));
    if (p.kind === 'door' && cabOk()) {
      var pv = SR.ui.pocket.preview('world.cab', { door: p.id });
      var fare = SR.tuning.world.cab.cash;
      btns.appendChild(SR.ui.button({ id: 'map-cab', label: 'pocket.map.cab', vars: { money: SR.text.money(fare) }, icon: 'cab', size: 's',
        disabled: !pv.ok, reason: pv.reason, reasonVars: pv.vars, onClick: function () { ride(p); } }));
    }
    c.appendChild(btns);
  }

  function ride(p) {
    var res = SR.world.cab(p.id);
    if (!res || !res.ok) {
      if (SR.ui.card && SR.ui.card.feedback) SR.ui.card.feedback(res || { ok: false, reason: 'ui.refused' }, M && M.card, {});
      return;
    }
    if (SR.ui.card && SR.ui.card.feedback) SR.ui.card.feedback(res, null, {});
    if (M && M.ctxP) M.ctxP.close();
  }

  function renderList() {
    if (!M) return;
    var a = document.activeElement, had = a && M.list.contains(a) ? a.getAttribute('data-id') : null;
    D().clear(M.list);
    M.all.filter(visible).forEach(function (p) {
      var on = M.sel === p.id;
      var li = h('li', { role: 'option', class: 'list-row nav-inset', 'data-nav': '', tabindex: '-1', 'data-id': 'map-place-' + p.id,
        'aria-selected': on ? 'true' : 'false', style: { minHeight: '40px', background: on ? 'var(--primary-100)' : null } },
        // The pin's own brand colour (a palette key), so the list reads as the map's legend.
        h('span', { 'aria-hidden': 'true', style: { width: '12px', height: '12px', flex: 'none', border: 'var(--line)', borderRadius: '50%',
          background: (p.kind === 'person' ? 'var(--cha)' : D().paint(p.brand)) || 'var(--paper-0)' } }),
        h('span', { class: 'list-label' }, p.name),
        wp && wp.id === p.id ? D().icon('map', 16) : null);
      li.addEventListener('click', function () { D().sfx('click'); focusPlace(p); });
      M.list.appendChild(li);
    });
    if (had) { var again = M.list.querySelector('[data-id="' + had + '"]'); if (again) SR.ui.focus.focus(again); }
  }

  /** Picks a place and brings it into view. */
  function focusPlace(p) {
    var s = toScreen(p.x, p.y);
    if (s.x < 24 || s.y < 24 || s.x > M.W - 24 || s.y > M.H - 24) { view.x = p.x; view.y = p.y; clampView(); }
    select(p.id);
  }

  function renderFilters() {
    D().clear(M.filters);
    FILTERS.forEach(function (f) {
      var on = !!filters[f];
      var b = h('button', { type: 'button', class: 'btn btn--s ' + (on ? 'btn--primary' : 'btn--secondary'), 'data-nav': '', 'data-id': 'map-filter-' + f,
        'aria-pressed': on ? 'true' : 'false' }, t('pocket.map.filter.' + f));
      b.addEventListener('click', function () {
        D().sfx('toggle');
        filters[f] = !filters[f];
        renderFilters();
        renderList();
        draw();
        var again = M.filters.querySelector('[data-id="map-filter-' + f + '"]');
        if (again) SR.ui.focus.focus(again);
      });
      M.filters.appendChild(b);
    });
  }

  // ------------------------------------------------------------------------------------------------
  // Pointers: drag to pan, pinch and wheel to zoom, click to pick

  function local(e) {
    var r = M.cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) * M.W / (r.width || M.W), y: (e.clientY - r.top) * M.H / (r.height || M.H) };
  }

  function bindPointers(cv) {
    var ptrs = {}, start = null, pinch = null, moved = 0;
    cv.addEventListener('pointerdown', function (e) {
      if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
      try { cv.setPointerCapture(e.pointerId); } catch (x) { /* not capturable */ }
      ptrs[e.pointerId] = local(e);
      var ids = Object.keys(ptrs);
      if (ids.length === 1) { start = { x: ptrs[ids[0]].x, y: ptrs[ids[0]].y }; moved = 0; pinch = null; }
      if (ids.length === 2) {
        var a = ptrs[ids[0]], b = ptrs[ids[1]];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: view.z };
        moved = CLICK_PX + 1;
      }
    });
    cv.addEventListener('pointermove', function (e) {
      M.hover = local(e);
      if (!ptrs[e.pointerId]) {
        // Hovering a pin names it (at the whole-island zoom the names are hidden).
        var over = hit(M.hover.x, M.hover.y), id = over ? over.id : null;
        if (id !== M.hoverId) { M.hoverId = id; cv.style.cursor = id ? 'pointer' : 'grab'; draw(); }
        return;
      }
      var prev = ptrs[e.pointerId], cur = local(e);
      ptrs[e.pointerId] = cur;
      var ids = Object.keys(ptrs);
      if (ids.length >= 2 && pinch) {
        var a = ptrs[ids[0]], b = ptrs[ids[1]];
        var d = Math.hypot(a.x - b.x, a.y - b.y) || 1, mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        var f = pinch.z * d / pinch.d / view.z;
        zoomBy(f, mid.x, mid.y);
        return;
      }
      moved += Math.hypot(cur.x - prev.x, cur.y - prev.y);
      if (moved > CLICK_PX) panBy(cur.x - prev.x, cur.y - prev.y);
    });
    function up(e) {
      if (!ptrs[e.pointerId]) return;
      var cur = local(e);
      delete ptrs[e.pointerId];
      if (Object.keys(ptrs).length) return;
      pinch = null;
      if (moved <= CLICK_PX && start) {
        var p = hit(cur.x, cur.y);
        if (p) { D().sfx('click'); select(p.id); } else if (M.sel) select(null);
      }
      start = null;
    }
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', function (e) { delete ptrs[e.pointerId]; pinch = null; start = null; });
    cv.addEventListener('pointerleave', function () { M.hover = null; if (M.hoverId) { M.hoverId = null; draw(); } });
    cv.addEventListener('wheel', function (e) {
      if (e.ctrlKey || !e.deltaY) return;
      e.preventDefault();
      var q = local(e);
      zoomBy(e.deltaY < 0 ? Z_STEP : 1 / Z_STEP, q.x, q.y);
    }, { passive: false });
    // Keyboard and pad on the focused map: the arrows pan, confirm picks the place nearest the centre.
    // An arrow the view cannot follow (it is at that edge already) moves focus on, as anywhere else,
    // so the map never traps keyboard and pad focus (UI §6: every screen completable without a pointer).
    SR.ui.focus.setHandler(cv, function (action, ev) {
      if (ev && ev.down === false) return false;
      if (action === 'left') return panBy(PAN_KEY, 0);
      if (action === 'right') return panBy(-PAN_KEY, 0);
      if (action === 'up') return panBy(0, PAN_KEY);
      if (action === 'down') return panBy(0, -PAN_KEY);
      if (action === 'confirm' && !(ev && ev.repeat)) {
        var p = hit(M.W / 2, M.H / 2) || nearest(M.W / 2, M.H / 2);
        if (p) select(p.id);
        return true;
      }
      return false;
    });
  }

  function nearest(sx, sy) {
    var best = null, bd = Infinity;
    (M.shown || []).forEach(function (p) { var s = toScreen(p.x, p.y), d = Math.hypot(s.x - sx, s.y - sy); if (d < bd) { bd = d; best = p; } });
    return best;
  }

  // ------------------------------------------------------------------------------------------------
  // Mounting

  function size() {
    if (!M) return;
    var page = M.root, avail = page.clientHeight - M.bar.offsetHeight - 16;
    var w = Math.max(200, M.mapBox.clientWidth || 600), hh = Math.max(MAP_MIN_H, Math.round(avail));
    M.W = w; M.H = hh;
    M.cv.style.width = w + 'px';
    M.cv.style.height = hh + 'px';
    M.list.style.maxHeight = hh + 'px';
    if (!view) { var b = bounds(); view = { x: (b[0] + b[2]) / 2, y: (b[1] + b[3]) / 2, z: zMin() }; }
    clampView();
  }

  function mount(root, ctx) {
    M = { root: root, ctxP: ctx, sel: null, all: places(), shown: [], W: 600, H: 400, hover: null };
    M.filters = h('div', { role: 'group', 'aria-label': t('pocket.map.filters'), 'data-id': 'map-filters', style: { display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-1)', flex: '1 1 auto' } });
    var tools = h('div', { role: 'group', 'aria-label': t('pocket.tab.map'), style: { display: 'flex', gap: 'var(--sp-1)', flex: 'none' } },
      SR.ui.iconButton({ id: 'map-zoom-out', label: 'pocket.map.zoomOut', icon: 'minus', size: 's', onClick: function () { zoomBy(1 / Z_STEP); } }),
      SR.ui.iconButton({ id: 'map-zoom-in', label: 'pocket.map.zoomIn', icon: 'plus', size: 's', onClick: function () { zoomBy(Z_STEP); } }),
      SR.ui.iconButton({ id: 'map-center', label: 'pocket.map.center', icon: 'map', size: 's', onClick: function () { centreOnYou(); } }));
    M.bar = h('div', { style: { display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-2)', marginBottom: 'var(--sp-2)' } }, M.filters, tools);
    M.list = h('ul', { class: 'list scroll-y', role: 'listbox', 'aria-label': t('pocket.map.places'), 'data-id': 'map-places',
      style: { margin: '0', padding: '0', listStyle: 'none', overflowY: 'auto', touchAction: 'pan-y' } });
    // data-no-swipe: a finger drag here pans the map; it does not turn the Pocket's page (pocket.js).
    M.cv = h('canvas', { 'data-id': 'map-canvas', role: 'img', 'data-nav': '', 'data-no-swipe': '', tabindex: '-1', 'aria-label': t('pocket.map.aria', { n: 0 }),
      style: { display: 'block', border: 'var(--line)', borderRadius: 'var(--r-m)', touchAction: 'none', cursor: 'grab', background: 'var(--paper-2)' } });
    M.ctx = M.cv.getContext ? M.cv.getContext('2d') : null;
    M.card = h('div', { class: 'paper', 'data-id': 'map-card', role: 'group', 'aria-label': t('pocket.map.places'), hidden: true,
      style: { position: 'absolute', left: 'var(--sp-3)', bottom: 'var(--sp-3)', maxWidth: 'calc(100% - 24px)', width: '360px', padding: 'var(--sp-3)',
        border: 'var(--line)', borderRadius: 'var(--r-m)', background: 'var(--paper-0)', boxShadow: 'var(--e-2)' } });
    M.mapBox = h('div', { style: { position: 'relative', minWidth: '0' } }, M.cv, M.card,
      h('p', { class: 't-small', 'aria-hidden': 'true', style: { position: 'absolute', right: 'var(--sp-2)', top: 'var(--sp-2)', margin: '0', padding: '2px 6px',
        borderRadius: 'var(--r-xs)', background: 'var(--paper-0)', color: 'var(--ink-700)' } }, t('pocket.map.hint')));
    root.appendChild(M.bar);
    root.appendChild(h('div', { style: { display: 'grid', gridTemplateColumns: 'calc(200px * var(--ui-scale)) minmax(0, 1fr)', gap: 'var(--sp-3)', alignItems: 'start' } }, M.list, M.mapBox));
    renderFilters();
    size();
    bindPointers(M.cv);
    var want = ctx.params && ctx.params.place;
    if (want && placeById(want)) focusPlace(placeById(want)); else { renderList(); draw(); }
    M.unsub = SR.events.on('stage:resized', function () { if (M) { size(); draw(); } });
  }

  function unmount() {
    if (M && M.unsub) M.unsub();
    M = null;
  }

  SR.onBoot(50, function () {
    if (SR.events && typeof SR.events.on === 'function') {
      // The waypoint's route starts when you step out of a building (the city has placed you by then).
      SR.events.on('door:exited', function () {
        if (!pendingRoute || !wp) return;
        Promise.resolve().then(function () {
          var st = SR.scenes.stack(), P = SR.world.player;
          if (st.join() !== 'city' || !P || P.car || typeof P.walkTo !== 'function') return;
          pendingRoute = false;
          P.walkTo(wp.x, wp.y);
        });
      });
      // Arriving: the waypoint of a door clears when you walk in. door:entered names the building
      // (a home door's building is 'home'), so the door itself is SR.world.doors.last's.
      SR.events.on('door:entered', function (p) {
        if (!wp || !wp.door || !p) return;
        var last = SR.world.doors && SR.world.doors.last, lastId = last && last.resolved && last.resolved.id === p.id ? last.id : null;
        if (p.id === wp.door || lastId === wp.door) dropWaypoint();
      });
      // Reaching a person: talking to them clears a waypoint set on them (the `talk` rule event).
      SR.events.on('talk', function (p) {
        if (wp && p && p.npc && (wp.id === 'person:' + p.npc || wp.id === p.npc)) dropWaypoint();
      });
      // A new or loaded game starts without a waypoint.
      SR.events.on('save:loaded', function () { dropWaypoint(); view = null; });
    }
    if (!SR.ui.pocket || typeof SR.ui.pocket.panel !== 'function') return;
    SR.ui.pocket.panel('map', {
      label: 'pocket.tab.map', icon: 'map',
      mount: mount,
      refresh: function (ctx) { if (!M) return; M.ctxP = ctx; M.all = places(); renderList(); draw(); renderCard(); },
      unmount: unmount,
      onAction: function (action, ev) {
        if (!M || (ev && ev.down === false)) return false;
        if (action === 'zoomIn' || action === 'zoomOut') {
          var q = M.hover;
          zoomBy(action === 'zoomIn' ? Z_STEP : 1 / Z_STEP, q ? q.x : undefined, q ? q.y : undefined);
          return true;
        }
        if (action === 'back' && M.sel && !(ev && ev.repeat)) { select(null); return true; }
        return false;
      },
      /** @returns {object} the view, the places shown, the picked one and the waypoint (tests). */
      debug: function () {
        if (!M) return null;
        return { view: { x: view.x, y: view.y, z: view.z }, zMin: zMin(), W: M.W, H: M.H, sel: M.sel, wp: wp, pending: pendingRoute,
          filters: Object.assign({}, filters), shown: (M.shown || []).map(function (p) { return p.id; }), draws: M.draws || 0 };
      },
      /** @returns {object|null} the waypoint. */
      waypoint: function () { return wp; },
      /**
       * Sets the waypoint on a worldmap spot or door from elsewhere (a phone contact's call).
       * @param {{id: string, x: number, y: number, name: string}} spec
       */
      waypointTo: function (spec) {
        if (!spec || typeof spec.x !== 'number') return false;
        wp = { id: spec.id || 'spot', x: spec.x, y: spec.y, name: spec.name || '', door: spec.door || null };
        pendingRoute = false;   // a pin from elsewhere (a phone call) never starts an older waiting route
        if (SR.render.minimap && typeof SR.render.minimap.waypoint === 'function') SR.render.minimap.waypoint(wp.x, wp.y);
        SR.ui.toast({ key: 'pocket.map.waypointSet', vars: { place: wp.name }, kind: 'info', id: 'toast-waypoint' });
        redrawCard();
        return true;
      },
      toScreen: function (id) { if (!M) return null; var p = placeById(id); return p ? toScreen(p.x, p.y) : null; },
    });
  });
})();
