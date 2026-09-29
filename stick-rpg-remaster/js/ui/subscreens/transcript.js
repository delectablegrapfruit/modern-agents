// js/ui/subscreens/transcript.js — owner: W2-Civic. The sub-screen `uofs.transcript` (P1 `degrees`;
// UI §5.6 "U of S › Transcript"; GDD §4.5; BALANCE B-03): per track (Business, Kinesiology,
// Theatre) the classes taken against the degree's 20 as a ProgressBar, the degree's status (earned,
// ready to graduate with its Graduate row, or classes to go) and the seminar status (open with the
// seminars left today, or what they still need). The Graduate rows are the U of S actions
// uofs.graduate<Track> (a 1 h ceremony), committed through ctx.act; every number comes from
// SR.tuning.training and every rule from SR.rules.training. The ceremony's confetti (GDD §4.5:
// "confetti, a stamp") and the degree stinger (ART_AUDIO §13.4) follow any successful graduation,
// from this screen or the card's row (an action:done hook; the confetti is skipped in fast mode,
// like the report's). Node-loadable: no DOM at load time.
(function () {
  'use strict';
  var SR = window.SR;

  var TRACKS = ['biz', 'kin', 'thr'];
  var TRACK_ID = { biz: 'Biz', kin: 'Kin', thr: 'Thr' };

  var M = null;   // { root, ctx, rows }

  function D() { return SR.ui.dom; }
  function h() { return D().h.apply(null, arguments); }
  function t(k, v) { return D().t(k, v); }
  function T() { return SR.tuning.training; }

  SR.onBoot(50, function () {
    SR.events.on('action:done', function (p) {
      if (!p || !p.result || !p.result.ok || !/^uofs\.graduate/.test(String(p.id))) return;
      var fx = SR.render && SR.render.fx;
      if (fx && typeof fx.confetti === 'function' && !(SR.ui.dom && SR.ui.dom.fast())) fx.confetti();
      // The degree stinger (ART_AUDIO §13.4: "degree (organ chord)") once W2-Music registers it;
      // an unregistered stinger is skipped, as the stamp and the city skip theirs.
      var A = SR.audio;
      if (A && typeof A.stinger === 'function' && SR.reg.song && SR.reg.song['stingers.degree']) {
        try { A.stinger('degree'); } catch (e) { SR.util.warnOnce('transcript.stinger', 'uofs: the degree stinger failed: ' + e.message); }
      }
    });
  });

  function para(key, vars, id, small) {
    return h('p', { class: small ? 't-small t-ink-700' : 't-body', 'data-id': id || null, style: { margin: '0' } }, t(key, vars));
  }

  /**
   * The preview with list items named by their item id: graduation adds to the state list
   * `items.diplomas`, whose item is `diploma` (js/data/items.js `key`), so the chip reads "+1
   * Diploma" with the item's icon instead of the raw state field.
   * @returns {object} a shallow copy of the preview
   */
  function namedGains(pv) {
    var items = SR.reg.item || {}, byKey = {};
    Object.keys(items).forEach(function (id) { var k = items[id].key; if (k && k !== id && !items[k]) byKey[k] = id; });
    var gains = (pv.gains || []).map(function (g) {
      return g && g.kind === 'item' && byKey[g.key] ? Object.assign({}, g, { key: byKey[g.key] }) : g;
    });
    return Object.assign({}, pv, { gains: gains });
  }

  function graduateRow(track) {
    var id = 'uofs.graduate' + TRACK_ID[track];
    var pv = M.ctx.preview(id, {});
    if (!pv || pv.hidden) return null;
    var def = SR.reg.action[id] || {};
    var ctx = M.ctx;
    var el = SR.ui.actionRow({
      id: 'transcript-graduate-' + track, hotkey: M.rows.length < 9 ? M.rows.length + 1 : null, icon: def.icon, label: 'sub.uofs.transcript.graduate',
      gains: SR.ui.chip.gains(namedGains(pv)), costs: SR.ui.chip.costs(pv, { def: def }),
      disabled: !pv.ok, reason: pv.reason, reasonVars: pv.vars,
      onRun: function () { if (M && M.ctx === ctx) ctx.act(id, {}); },
    });
    M.rows.push({ el: el, id: id });
    return el;
  }

  function trackBlock(s, track) {
    var D0 = T().degree, sem = T().seminar, stat = D0.tracks[track];
    var classes = s.edu.classes[track] || 0, degree = !!s.edu.degrees[track];
    var statName = t('ui.stat.' + stat);
    var box = h('section', { 'data-id': 'transcript-' + track, 'data-degree': degree ? 'yes' : 'no',
      style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)', paddingTop: 'var(--sp-2)', borderTop: 'var(--line-thin)' } });
    box.appendChild(h('h4', { class: 't-label', style: { margin: '0' } }, t('sub.uofs.transcript.track', { name: t('report.track.' + track), stat: statName })));
    box.appendChild(SR.ui.progress({ id: 'transcript-' + track + '-classes', value: Math.min(classes, D0.classes), max: D0.classes,
      kind: stat === 'int' ? 'int' : 'primary', label: 'sub.uofs.transcript.classes' }));
    if (degree) box.appendChild(para('sub.uofs.transcript.degree', { per: D0.perGain, stat: statName }, 'transcript-' + track + '-status'));
    else if (classes >= D0.classes) {
      box.appendChild(para('sub.uofs.transcript.ready', { dur: SR.text.dur(D0.ceremonyMin) }, 'transcript-' + track + '-status'));
      var row = graduateRow(track);
      if (row) box.appendChild(row);
    } else box.appendChild(para('sub.uofs.transcript.more', { n: D0.classes - classes }, 'transcript-' + track + '-status'));
    var have = s.stats[stat];
    if (have >= sem.needStat && classes >= sem.needClasses) {
      var TR = SR.rules.training;
      var left = TR && typeof TR.left === 'function' ? TR.left(s, 'seminar') : Math.max(0, sem.daily - (s.daily.seminars || 0));
      box.appendChild(para(left > 0 ? 'sub.uofs.transcript.seminarOpen' : 'sub.uofs.transcript.seminarNone', { left: left }, 'transcript-' + track + '-seminar', true));
    } else {
      box.appendChild(para('sub.uofs.transcript.seminarLocked', { stat: statName, min: sem.needStat, need: sem.needClasses, have: have, classes: classes },
        'transcript-' + track + '-seminar', true));
    }
    return box;
  }

  function render() {
    if (!M) return;
    var root = M.root, s = M.ctx.state, D0 = T().degree;
    var f = SR.ui.focus && SR.ui.focus.focused ? SR.ui.focus.focused() : null;
    var keep = f && root.contains(f) ? f.getAttribute('data-id') : null;
    D().clear(root);
    M.rows = [];
    root.appendChild(para('sub.uofs.transcript.intro', { need: D0.classes, bonus: D0.bonusStat, per: D0.perGain }, 'transcript-intro', true));
    TRACKS.forEach(function (track) { root.appendChild(trackBlock(s, track)); });
    if (keep) {
      var again = root.querySelector('[data-id="' + keep + '"]');
      if (again && SR.ui.focus) SR.ui.focus.focus(again);
    }
  }

  SR.def.subscreen('uofs.transcript', {
    title: 'sub.uofs.transcript',
    p: 1,
    feature: 'degrees',
    /** Builds the three tracks. */
    mount: function (root, ctx) {
      M = { root: root, ctx: ctx, rows: [], off: SR.events.on('day:started', function () { render(); }) };
      render();
    },
    /** Rebuilds after each ctx.act (a graduation) and each clock or money change. */
    refresh: function (ctx) { if (M) { M.ctx = ctx; render(); } },
    unmount: function () { if (M) M.off(); M = null; },
    /** Hotkeys 1-9 run the Graduate rows in order. @returns {boolean} consumed */
    onAction: function (action, ev) {
      var m = /^row(\d)$/.exec(action);
      if (!m || !M || (ev && ev.repeat)) return false;
      var r = M.rows[Number(m[1]) - 1];
      if (r) { SR.ui.focus.focus(r.el.main); r.el.main.click(); }
      return true;
    },
  });
})();
