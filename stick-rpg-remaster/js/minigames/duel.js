// js/minigames/duel.js — owner: W1-M. The Duel engine (GDD §6.5; BALANCE B-30): N beats, each
// offering 2-4 options with a stat, a difficulty D and the shown odds chance(stat, D) (GDD §4.3,
// with the B-28b modifiers through SR.rules.check). Three modes, chosen by the skin:
//   plain  (holdup, tourhook): the options as given.
//   stance (debate, interview, interrogation): each beat the opponent takes a stance (Logic,
//     Emotion, Force), drawn from host.rng; the hint is right with p = min(0.95, 0.5 + INT/1000),
//     otherwise it names one of the other two. Counter table: Facts beats Emotion, Charm beats
//     Force, Pressure beats Logic (D × 0.5); Logic counters Charm, Emotion counters Pressure,
//     Force counters Facts (D × 2); the third option is neutral. Odds are shown for the hinted
//     stance and rolled for the true one.
//   cards  (boardroom): each card's options carry an m change on success and on failure, drawn
//     uniformly from host.rng and rounded to 0.01; INT ≥ 200 shows each option's expected value.
// Draw order per beat (tests rely on it): stance mode draws the stance, the hint roll and the
// alternative (3 draws); then the pick's success roll (1 draw); cards mode then draws the change.
// Numbers: SR.tuning.duel (the stance rules, boardroom, and the skin's own B-30 row: mode, beats,
// need, options { id: stat } labelled mg.<skin>.<id>, D), then the skin's params, then the run's.
// Params: { mode, beats, need (wins that decide the round; the round stops once decided), bestOf,
// D (number or { base, perHeat }), dScale (the CEO takeover's ×2), check (check id prefix; default
// B-28b's: 'holdup.store' / 'holdup.bank' by params.target for holdup, 'tour.hook' for tourhook,
// else 'duel.<skin>'), target ('store' | 'bank'), options: [{ id, label, stat, D? }],
// cards: [[optionId, ...]], cardOptions, opponent: { name, portrait }, situations: [textKey] };
// skin text: { title, beats: [textKey] }; skin art (optional): backdrop(ctx, w, h, host),
// scene(ctx, x, y, w, h, host) → true when drawn.
// Result (ARCHITECTURE §10): { beats: [bool], wins, losses, picks: [optionId] } plus stances
// (stance mode) and sum and m (cards mode; m = clamp(1 + sum, 0.7, 1.3)).
(function () {
  'use strict';
  var SR = window.SR;

  // BALANCE B-30 comes from SR.tuning.duel (W1-R's names): stance { stances, hint { base, intDiv,
  // max }, beat, countered, optionBeats, stanceCounters }, boardroom { options, m, showBestInt, cards }
  // and one row per skin (mode, beats, options { id: stat }, D). The defaults below mirror B-30 and
  // apply only when a table is missing.
  var DEF_STANCE = {
    stances: ['logic', 'emotion', 'force'],
    hint: { base: 0.5, intDiv: 1000, max: 0.95 },
    beat: 0.5, countered: 2,
    optionBeats: { int: 'emotion', cha: 'force', str: 'logic' },      // Facts > Emotion, Charm > Force, Pressure > Logic
    stanceCounters: { logic: 'cha', emotion: 'str', force: 'int' },   // Logic > Charm, Emotion > Pressure, Force > Facts
  };
  var DEF_CARDS = {
    safe: { stat: 'int', D: 100, win: [0.05, 0.10], lose: [-0.05, 0] },
    bold: { stat: 'cha', D: 250, win: [0.10, 0.20], lose: [-0.15, -0.05] },
    ruthless: { stat: 'str', D: 250, win: [0.10, 0.20], lose: [-0.15, -0.05], karma: -1 },
  };
  var STANCE_OPTIONS = [   // stance mode without a skin row: Facts INT, Charm CHA, Pressure STR (B-30)
    { id: 'facts', label: 'mg.frame.duel.facts', stat: 'int' },
    { id: 'charm', label: 'mg.frame.duel.charm', stat: 'cha' },
    { id: 'pressure', label: 'mg.frame.duel.pressure', stat: 'str' },
  ];
  // B-28b check ids of the Duel skins whose checks are not `duel.<skin>.<stat>`: the robberies
  // (`holdup.store.*` / `holdup.bank.*`: Relaxed, Bad karma, Intimidating) and the tour hook
  // (`tour.hook.*`: Crowd Pleaser). params.check still overrides.
  var CHECK_PREFIX = {
    holdup: function (p) { return 'holdup.' + (p.target === 'bank' ? 'bank' : 'store'); },
    tourhook: function () { return 'tour.hook'; },
  };
  var DEFAULT_D = 75;          // GDD §4.3 "medium", when neither the skin nor the run names D
  var DEFAULT_BEATS = 3;
  var OUTCOME_HOLD = 0.9;      // s a beat's outcome stays before the next beat (any press skips)
  var REPLAY_BEAT = 0.28;      // s per beat in an Auto replay

  function clamp(v, lo, hi) { return SR.util.clamp(v, lo, hi); }
  function round2(v) { return Math.round(v * 100) / 100; }

  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function prefer(v, d) { return typeof v === typeof d && v !== null ? v : d; }

  /**
   * The engine's numbers: SR.tuning.duel (the stance rules, boardroom, the skin's B-30 row), then
   * the skin's params, then the run params.
   */
  function opts(params) {
    params = params || {};
    var tune = SR.minigame.tune;
    var st = tune('duel.stance', {});
    var hint = isObj(st.hint) ? st.hint : {};
    var row = params.skin ? tune('duel.' + params.skin, null) : null;
    row = isObj(row) ? row : {};
    var o = {
      stances: Array.isArray(st.stances) && st.stances.length === 3 ? st.stances : DEF_STANCE.stances,
      beatD: prefer(st.beat, DEF_STANCE.beat),
      counterD: prefer(st.countered, DEF_STANCE.countered),
      hintBase: prefer(hint.base, DEF_STANCE.hint.base),
      hintDiv: prefer(hint.intDiv, DEF_STANCE.hint.intDiv),
      hintMax: prefer(hint.max, DEF_STANCE.hint.max),
      optionBeats: isObj(st.optionBeats) ? st.optionBeats : DEF_STANCE.optionBeats,
      stanceCounters: isObj(st.stanceCounters) ? st.stanceCounters : DEF_STANCE.stanceCounters,
    };
    var br = tune('duel.boardroom', {});
    var m = Array.isArray(br.m) ? br.m : tune('jobs.hustle.m', [0.7, 1.3]);
    o.mMin = m[0];
    o.mMax = m[1];
    o.evInt = typeof params.evInt === 'number' ? params.evInt : prefer(br.showBestInt, 200);   // INT ≥ 200 shows each option's EV
    var mode = params.mode || row.mode;
    o.mode = mode === 'stance' || mode === 'cards' ? mode : 'plain';
    o.Drule = typeof params.D === 'number' || isObj(params.D) ? params.D : typeof row.D === 'number' || isObj(row.D) ? row.D : DEFAULT_D;
    o.dScale = typeof params.dScale === 'number' ? params.dScale : 1;
    o.check = params.check || (params.skin && CHECK_PREFIX[params.skin] ? CHECK_PREFIX[params.skin](params) : 'duel.' + (params.skin || 'duel'));
    if (o.mode === 'cards') {
      var src = isObj(row.options) && o.mode === row.mode ? row.options : isObj(br.options) ? br.options : DEF_CARDS;
      var defs = {};
      Object.keys(src).forEach(function (id) {
        defs[id] = Object.assign({ id: id, label: 'mg.frame.duel.' + id, karma: 0 }, DEF_CARDS[id] || {}, src[id]);
      });
      Object.keys(params.cardOptions || {}).forEach(function (id) { defs[id] = Object.assign({ id: id, karma: 0 }, defs[id] || {}, params.cardOptions[id]); });
      o.cardOptions = defs;
      var n = typeof row.cards === 'number' ? row.cards : typeof br.cards === 'number' ? br.cards : DEFAULT_BEATS;
      var all = Object.keys(defs);
      o.cards = Array.isArray(params.cards) && params.cards.length ? params.cards : Array.apply(null, Array(n)).map(function () { return all.slice(); });
      o.beats = o.cards.length;
    } else {
      var list = Array.isArray(params.options) && params.options.length ? params.options : null;
      if (!list && isObj(row.options)) {
        list = Object.keys(row.options).map(function (id) { return { id: id, stat: row.options[id], label: 'mg.' + params.skin + '.' + id }; });
      }
      o.options = (list || STANCE_OPTIONS).slice(0, 4).map(function (op) { return { id: op.id, label: op.label, stat: op.stat, D: op.D }; });
      o.beats = typeof params.beats === 'number' && params.beats > 0 ? params.beats : typeof row.beats === 'number' ? row.beats : DEFAULT_BEATS;
    }
    // A round stops once decided when the skin or its B-30 row names the wins it needs (holdup,
    // interview, interrogation: 2 of 3); otherwise every beat is played (debate: poll per beat).
    o.needed = typeof params.need === 'number' ? params.need : typeof row.need === 'number' ? row.need : Math.floor(o.beats / 2) + 1;
    o.bestOf = typeof params.bestOf === 'boolean' ? params.bestOf : typeof row.need === 'number' || typeof params.need === 'number';
    return o;
  }

  /** @returns {number} D for a state: a number, or { base, perHeat } (interrogation: 200 + Heat). */
  function baseD(o, stats) {
    var r = o.Drule;
    if (typeof r === 'number') return r;
    return (+r.base || 0) + (+r.perHeat || 0) * (stats && +stats.heat || 0);
  }

  /** @returns {number} the D factor of an option's stat against a stance (B-30 counter table). */
  function factor(stat, stance, o) {
    o = o || opts({});
    if (o.optionBeats[stat] === stance) return o.beatD;
    if (o.stanceCounters[stance] === stat) return o.counterD;
    return 1;
  }

  /** @returns {number} the chance that the stance hint is right: min(0.95, 0.5 + INT/1000). */
  function hintP(int, o) {
    o = o || opts({});
    return Math.min(o.hintMax, o.hintBase + Math.max(0, +int || 0) / o.hintDiv);
  }

  /** Draws a beat's stance and hint (always 3 draws: the stance, the hint roll, the alternative). */
  function drawStance(rng, int, o) {
    o = o || opts({});
    var s = rng.int(0, 2);
    var right = rng.chance(hintP(int, o));
    var alt = rng.int(0, 1);
    var others = [0, 1, 2].filter(function (i) { return i !== s; });
    return { stance: o.stances[s], hint: o.stances[right ? s : others[alt]], right: right };
  }

  function statOf(R, stat) { return R.stats ? Math.max(0, +R.stats[stat] || 0) : 0; }

  function newRound(state, params) {
    var o = opts(params);
    return { o: o, state: state || null, stats: state && state.stats || {}, beats: [], picks: [], stances: [], deltas: [], sum: 0, cur: null };
  }

  function decided(R) {
    var w = 0, l = 0;
    R.beats.forEach(function (b) { if (b) w++; else l++; });
    if (R.o.bestOf && (w >= R.o.needed || l > R.o.beats - R.o.needed)) return true;
    return R.beats.length >= R.o.beats;
  }

  function chanceFor(R, stat, D) {
    return SR.minigame.chance(statOf(R, stat), D, { s: R.state || SR.state, checkId: R.o.check + '.' + stat });
  }

  /** The options of the current beat with the odds shown to the player. */
  function shown(R, cur) {
    var o = R.o;
    if (o.mode === 'cards') {
      return o.cards[cur.i].map(function (id) {
        var d = o.cardOptions[id];
        var D = d.D * o.dScale;
        var p = chanceFor(R, d.stat, D);
        var ev = round2(p * (d.win[0] + d.win[1]) / 2 + (1 - p) * (d.lose[0] + d.lose[1]) / 2);
        return { id: id, label: d.label, stat: d.stat, value: statOf(R, d.stat), D: D, baseD: D, p: p, ev: ev, win: d.win, lose: d.lose, karma: d.karma || 0, factor: 1 };
      });
    }
    return o.options.map(function (op) {
      var base = (typeof op.D === 'number' ? op.D : baseD(o, R.stats)) * o.dScale;
      var f = o.mode === 'stance' ? factor(op.stat, cur.hint, o) : 1;
      return { id: op.id, label: op.label, stat: op.stat, value: statOf(R, op.stat), D: base * f, baseD: base, p: chanceFor(R, op.stat, base * f), factor: f };
    });
  }

  /** Starts the next beat (stance draws in stance mode). */
  function begin(R, rng) {
    var cur = { i: R.beats.length, stance: null, hint: null, right: null };
    if (R.o.mode === 'stance') {
      var d = drawStance(rng, statOf(R, 'int'), R.o);
      cur.stance = d.stance;
      cur.hint = d.hint;
      cur.right = d.right;
    }
    cur.options = shown(R, cur);
    R.cur = cur;
    return cur;
  }

  /** Resolves option k of the current beat with real draws. */
  function pick(R, k, rng) {
    var cur = R.cur, opt = cur.options[k];
    var p = opt.p;
    if (R.o.mode === 'stance') p = chanceFor(R, opt.stat, opt.baseD * factor(opt.stat, cur.stance, R.o));
    var ok = SR.minigame.roll(rng, p);
    var delta = null;
    if (R.o.mode === 'cards') {
      var range = ok ? opt.win : opt.lose;
      delta = round2(rng.float(range[0], range[1]));
      R.sum = round2(R.sum + delta);
    }
    R.beats.push(ok);
    R.picks.push(opt.id);
    R.deltas.push(delta);
    if (R.o.mode === 'stance') R.stances.push(cur.stance);
    R.cur = null;
    return { ok: ok, delta: delta, option: opt, stance: cur.stance, hint: cur.hint, p: p };
  }

  /** @returns {number} the Auto choice: the best shown odds (cards: the best expected m change); ties go to the first. */
  function best(R, options) {
    var k = 0;
    for (var i = 1; i < options.length; i++) {
      var a = R.o.mode === 'cards' ? options[i].ev : options[i].p;
      var b = R.o.mode === 'cards' ? options[k].ev : options[k].p;
      if (a > b) k = i;
    }
    return k;
  }

  function result(R) {
    var w = 0, l = 0;
    R.beats.forEach(function (b) { if (b) w++; else l++; });
    var r = { beats: R.beats.slice(), wins: w, losses: l, picks: R.picks.slice() };
    if (R.o.mode === 'stance') r.stances = R.stances.slice();
    if (R.o.mode === 'cards') { r.sum = R.sum; r.m = round2(clamp(1 + R.sum, R.o.mMin, R.o.mMax)); }
    return r;
  }

  /** Plays the rest of a round with the Auto policy (ARCHITECTURE §10) and real draws. */
  function autoRest(R, rng) {
    while (!decided(R)) {
      if (!R.cur) begin(R, rng);
      pick(R, best(R, R.cur.options), rng);
    }
    var r = result(R);
    r.auto = true;
    return r;
  }

  /** The loss of the remaining beats (leaving early; Hardcore's worst). */
  function lossesFrom(o, beats, picks, sum) {
    var R = { o: o, beats: beats.slice(), picks: picks.slice(), stances: [], sum: sum || 0, deltas: [] };
    var worstLose = 0;
    if (o.mode === 'cards') Object.keys(o.cardOptions).forEach(function (id) { worstLose = Math.min(worstLose, o.cardOptions[id].lose[0]); });
    while (!decided(R)) {
      R.beats.push(false);
      R.picks.push(null);
      if (o.mode === 'cards') R.sum = round2(R.sum + worstLose);
    }
    var r = result(R);
    if (o.mode === 'stance') delete r.stances;
    return r;
  }

  // ---- the interactive round ---------------------------------------------------------------

  function create(host, params) {
    var R = newRound(host.state, params);
    var o = R.o;
    var T = host.text;
    var art = host.skin && host.skin.art || null;
    var skinText = host.skin && host.skin.text || {};
    var opp = params.opponent || {};
    var phase = 'choose', sel = 0, hold = 0, last = null, replay = null;
    var revealed = 0;   // beats shown on the track (lags R.beats during an Auto replay)

    var card = host.el('div', {
      'data-id': 'mg-duel-card',
      style: {
        position: 'absolute', left: '420px', top: '64px', width: '820px', boxSizing: 'border-box', padding: '20px 24px',
        background: 'var(--paper-0)', border: 'var(--line)', borderRadius: 'var(--r-l)', boxShadow: 'var(--e-2)',
        display: 'flex', flexDirection: 'column', gap: '10px', pointerEvents: 'none',
      },
    });
    host.ui.appendChild(card);

    function stanceName(s) { return T('mg.frame.duel.stance.' + s); }
    function oppName() { return opp.name ? T(opp.name) : T('mg.frame.duel.opponent'); }
    function situation(i) {
      var list = skinText.beats || params.situations;
      if (Array.isArray(list) && list.length) return T(list[Math.min(i, list.length - 1)], { n: i + 1, total: o.beats });
      return T('mg.frame.duel.situation', { n: i + 1, total: o.beats });
    }
    function score() {
      var w = 0, l = 0;
      for (var i = 0; i < revealed; i++) { if (R.beats[i]) w++; else l++; }
      return { w: w, l: l };
    }
    function status() {
      var sc = score();
      var n = Math.min(o.beats, R.beats.length + (phase === 'choose' ? 1 : 0));
      if (o.mode === 'cards') host.label('status', T('mg.frame.duel.statusCards', { n: n, total: o.beats, m: round2(clamp(1 + R.sum, o.mMin, o.mMax)).toFixed(2) }));
      else host.label('status', T('mg.frame.duel.status', { n: n, total: o.beats, wins: sc.w, losses: sc.l }));
      host.label('score', T('mg.frame.duel.scoreMirror', { wins: sc.w, losses: sc.l }));
    }
    function pct(p) { return SR.text.pct(p); }
    function showEV() { return o.mode === 'cards' && statOf(R, 'int') >= o.evInt; }

    function optionChips(op) {
      var chips = [{ text: T('ui.stat.' + op.stat) + ' ' + op.value, kind: op.stat }];
      var dText = T('mg.frame.duel.d', { d: Math.round(op.D) });
      if (op.factor < 1) dText += ' · ' + T('mg.frame.duel.halved');
      if (op.factor > 1) dText += ' · ' + T('mg.frame.duel.doubled');
      chips.push({ text: dText, kind: 'plain' });
      chips.push({ text: pct(op.p), kind: 'time' });
      if (showEV()) chips.push({ text: T('mg.frame.duel.ev', { ev: (op.ev >= 0 ? '+' : '') + op.ev.toFixed(2) }), kind: op.ev >= 0 ? 'money' : 'hp' });
      return chips;
    }

    function renderCard() {
      while (card.firstChild) card.removeChild(card.firstChild);
      var cur = R.cur;
      var beatI = cur ? cur.i : Math.max(0, R.beats.length - 1);
      card.appendChild(host.el('h3', { 'data-id': 'mg-duel-situation', style: { margin: '0', font: '700 calc(20px * var(--ui-scale, 1)) var(--font-ui)', lineHeight: '1.3' } }, [situation(beatI)]));
      if (o.mode === 'stance' && (cur || last)) {
        var hint = cur ? cur.hint : last.hint;
        card.appendChild(host.el('p', { 'data-id': 'mg-duel-hint', style: { margin: '0', color: 'var(--ink-700)', font: '600 calc(16px * var(--ui-scale, 1)) var(--font-ui)' } },
          [T('mg.frame.duel.hint', { name: oppName(), stance: stanceName(hint) })]));
      }
      var options = cur ? cur.options : last ? last.options : [];
      options.forEach(function (op, k) {
        var b = host.button({
          id: 'mg-duel-opt-' + (k + 1), tall: true, width: '100%', badge: String(k + 1), label: T(op.label), chips: optionChips(op),
          aria: T('mg.frame.duel.optionAria', { k: k + 1, label: T(op.label), stat: T('ui.stat.' + op.stat), value: op.value, pct: pct(op.p) }),
          onPress: function () {
            if (phase === 'choose') { sel = k; choose(k); } else if (phase === 'outcome') next();
          },
        });
        if (phase !== 'choose') {
          var chosen = last && last.option.id === op.id && last.index === k;
          b.setAttribute('aria-disabled', 'true');
          b.style.opacity = chosen ? '1' : '0.45';
          if (chosen) b.style.background = last.ok ? 'var(--money-100)' : 'var(--hp-100)';
        }
        host.ring(b, phase === 'choose' && k === sel && (host.device === 'kb' || host.device === 'pad'));
        card.appendChild(b);
      });
      if (phase !== 'choose' && last) {
        var parts = [T(last.ok ? 'mg.frame.duel.success' : 'mg.frame.duel.failure')];
        if (o.mode === 'stance') parts.push(T('mg.frame.duel.reveal', { stance: stanceName(last.stance) }));
        if (o.mode === 'cards' && last.delta !== null) parts.push(T('mg.frame.duel.delta', { d: (last.delta >= 0 ? '+' : '') + last.delta.toFixed(2) }));
        card.appendChild(host.el('p', {
          'data-id': 'mg-duel-outcome',
          style: { margin: '4px 0 0', font: '900 calc(22px * var(--ui-scale, 1)) var(--font-display)', color: last.ok ? 'var(--money-ink)' : 'var(--danger-ink)' },
        }, [parts.join(' ')]));
      }
      status();
    }

    function announceBeat(cur) {
      var parts = [T('mg.frame.duel.beatAria', { n: cur.i + 1, total: o.beats, situation: situation(cur.i) })];
      if (o.mode === 'stance') parts.push(T('mg.frame.duel.hint', { name: oppName(), stance: stanceName(cur.hint) }));
      cur.options.forEach(function (op, k) {
        parts.push(T('mg.frame.duel.optionAria', { k: k + 1, label: T(op.label), stat: T('ui.stat.' + op.stat), value: op.value, pct: pct(op.p) }));
      });
      host.aria(parts.join(' '));
    }

    function startBeat() {
      var cur = begin(R, host.rng);
      phase = 'choose';
      sel = 0;
      last = null;
      renderCard();
      announceBeat(cur);
    }

    function choose(k) {
      if (phase !== 'choose' || !R.cur || k < 0 || k >= R.cur.options.length || !host.interactive()) return;
      var options = R.cur.options;
      last = pick(R, k, host.rng);
      last.options = options;
      last.index = k;
      revealed = R.beats.length;
      phase = 'outcome';
      hold = OUTCOME_HOLD;
      host.audio.sfx(last.ok ? 'mg_hit' : 'mg_miss');
      if (last.ok && host.haptic) host.haptic();
      renderCard();
      var sc = score();
      var line = T('mg.frame.duel.outcomeAria', { label: T(last.option.label), outcome: T(last.ok ? 'mg.frame.duel.success' : 'mg.frame.duel.failure'), wins: sc.w, losses: sc.l });
      if (o.mode === 'stance') line += ' ' + T('mg.frame.duel.reveal', { stance: stanceName(last.stance) });
      host.aria(line);
    }

    function next() {
      if (phase !== 'outcome') return;
      if (decided(R)) {
        phase = 'done';
        host.finish(result(R));
        return;
      }
      startBeat();
    }

    host.hints([
      { range: ['opt1', 'opt' + (o.mode === 'cards' ? Math.max.apply(null, o.cards.map(function (c) { return c.length; })) : o.options.length)], label: 'mg.frame.duel.choose', only: 'kb' },
      { actions: ['up', 'down'], label: 'mg.frame.duel.move', only: 'pad' },
      { action: 'confirm', label: 'mg.frame.duel.pick', only: 'pad' },
      { label: 'mg.frame.duel.tap', only: 'touch' },
    ]);
    startBeat();

    // ---- canvas ------------------------------------------------------------------------
    function drawHead(ctx, x, y, r) {
      if (opp.portrait && SR.art && SR.art.portraits && typeof SR.art.portraits.draw === 'function') {
        try {
          ctx.save();
          ctx.translate(x - r, y - r);
          SR.art.portraits.draw(ctx, opp.portrait, r * 2, phase === 'outcome' && last && last.ok ? 'shock' : 'idle');
          ctx.restore();
          return;
        } catch (e) { ctx.restore(); }
      }
      ctx.fillStyle = host.color('paper-0');
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = host.color('ink-900');
      ctx.stroke();
      ctx.fillStyle = host.color('ink-900');
      ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.12, r * 0.08, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + r * 0.3, y - r * 0.12, r * 0.08, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x - r * 0.3, y + r * 0.35); ctx.lineTo(x + r * 0.3, y + r * 0.35); ctx.stroke();
    }

    function stanceGlyph(ctx, s, x, y, size) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = host.color('ink-900');
      ctx.fillStyle = host.color(s === 'logic' ? 'int' : s === 'emotion' ? 'cha' : 'str');
      ctx.beginPath();
      if (s === 'logic') ctx.rect(x - size / 2, y - size / 2, size, size);
      else if (s === 'emotion') ctx.arc(x, y, size / 2, 0, Math.PI * 2);
      else { ctx.moveTo(x, y - size / 2); ctx.lineTo(x + size / 2, y + size / 2); ctx.lineTo(x - size / 2, y + size / 2); ctx.closePath(); }
      ctx.fill();
      ctx.stroke();
    }

    function text(ctx, s, x, y, px, weight, tok, align, display) {
      ctx.fillStyle = host.color(tok || 'ink-900');
      ctx.font = host.font(px, weight, display);
      ctx.textAlign = align || 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(s, x, y);
    }

    function renderTrack(ctx) {
      var n = o.beats, gap = 52, x0 = 640 - (n - 1) * gap / 2;
      for (var i = 0; i < n; i++) {
        var v = i < revealed ? R.beats[i] : undefined;
        ctx.fillStyle = v === undefined ? host.color('paper-0') : host.color(v ? 'ok' : 'danger');
        ctx.beginPath(); ctx.arc(x0 + i * gap, 30, 15, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = i === revealed && phase === 'choose' ? 4 : 2;
        ctx.strokeStyle = i === revealed && phase === 'choose' ? host.color('primary-500') : host.color('ink-900');
        ctx.stroke();
      }
    }

    function renderLeft(ctx) {
      if (o.mode === 'cards') {
        var m = round2(clamp(1 + (revealed === R.beats.length ? R.sum : R.deltas.slice(0, revealed).reduce(function (a, b) { return a + (b || 0); }, 0)), o.mMin, o.mMax));
        text(ctx, T('mg.frame.duel.pay'), 210, 150, 20, 700, 'ink-700');
        text(ctx, '×' + m.toFixed(2), 210, 200, 48, 900, 'ink-900', 'center', true);
        var bx = 70, bw = 280, by = 260;
        ctx.fillStyle = host.color('paper-3');
        ctx.fillRect(bx, by, bw, 16);
        ctx.fillStyle = host.color(m >= 1 ? 'money' : 'hp');
        var f = (m - o.mMin) / (o.mMax - o.mMin);
        ctx.fillRect(bx, by, bw * clamp(f, 0, 1), 16);
        ctx.lineWidth = 2;
        ctx.strokeStyle = host.color('ink-900');
        ctx.strokeRect(bx, by, bw, 16);
        var one = bx + bw * (1 - o.mMin) / (o.mMax - o.mMin);
        ctx.beginPath(); ctx.moveTo(one, by - 6); ctx.lineTo(one, by + 22); ctx.stroke();
        return;
      }
      if (art && typeof art.scene === 'function' && art.scene(ctx, 40, 64, 340, 460, host)) return;
      drawHead(ctx, 210, 190, 88);
      text(ctx, oppName(), 210, 308, 22, 900, 'ink-900', 'center', true);
      if (o.mode === 'stance') {
        var h = R.cur ? R.cur.hint : last ? last.hint : null;
        if (h) {
          stanceGlyph(ctx, h, 110, 372, 34);
          text(ctx, T('mg.frame.duel.leans'), 140, 360, 16, 600, 'ink-700', 'left');
          text(ctx, stanceName(h).toUpperCase(), 140, 386, 22, 900, 'ink-900', 'left', true);
        }
        if (phase !== 'choose' && last) {
          stanceGlyph(ctx, last.stance, 110, 440, 34);
          text(ctx, T('mg.frame.duel.was'), 140, 428, 16, 600, 'ink-700', 'left');
          text(ctx, stanceName(last.stance).toUpperCase(), 140, 454, 22, 900, last.stance === last.hint ? 'money-ink' : 'danger-ink', 'left', true);
        }
      }
    }

    return {
      update: function (dt) {
        if (phase === 'outcome') { hold -= dt; if (hold <= 0) next(); }
        if (replay) {
          replay.t += dt;
          var target = Math.min(R.beats.length, replay.from + Math.floor(replay.t / REPLAY_BEAT) + 1);
          if (target > revealed) { revealed = target; status(); }
        }
      },
      onAction: function (a, ev) {
        var rep = ev && ev.repeat;
        var m = /^opt(\d)$/.exec(a);
        if (phase === 'outcome') { if (!rep && (a === 'confirm' || m)) next(); return; }
        if (phase !== 'choose' || !R.cur) return;
        var n = R.cur.options.length;
        if (m && !rep) { var k = +m[1] - 1; if (k < n) { sel = k; choose(k); } return; }
        if (a === 'up' || a === 'left') { sel = (sel - 1 + n) % n; renderCard(); host.aria(T(R.cur.options[sel].label)); return; }
        if (a === 'down' || a === 'right') { sel = (sel + 1) % n; renderCard(); host.aria(T(R.cur.options[sel].label)); return; }
        if (a === 'confirm' && !rep) choose(sel);
      },
      pointer: function (kind) { if (kind === 'down' && phase === 'outcome') next(); },
      auto: function (rng) {
        var from = revealed;
        var r = autoRest(R, rng);
        phase = 'done';
        replay = { t: 0, from: from };
        return r;
      },
      replay: function () { if (!replay) replay = { t: 0, from: revealed }; },
      progress: function () { return { beats: R.beats.slice(), picks: R.picks.slice(), sum: R.sum }; },
      peek: function () {
        return {
          mode: o.mode, phase: phase, sel: sel, beats: R.beats.slice(), picks: R.picks.slice(), sum: R.sum,
          cur: R.cur ? { i: R.cur.i, stance: R.cur.stance, hint: R.cur.hint, options: R.cur.options } : null,
          last: last ? { ok: last.ok, stance: last.stance, hint: last.hint, delta: last.delta, p: last.p, id: last.option.id } : null,
        };
      },
      destroy: function () { if (card.parentNode) card.parentNode.removeChild(card); },
      render: function (ctx) {
        if (art && typeof art.backdrop === 'function') art.backdrop(ctx, 1280, 576, host);
        renderTrack(ctx);
        renderLeft(ctx);
      },
    };
  }

  SR.minigame.register('duel', {
    title: 'mg.frame.duel.title',
    keys: {
      opt1: ['Digit1', 'Numpad1'], opt2: ['Digit2', 'Numpad2'],
      opt3: ['Digit3', 'Numpad3'], opt4: ['Digit4', 'Numpad4'],
    },
    assist: false,
    confirmExit: true,
    /** @returns {object} the interactive round (ARCHITECTURE §10 instance). */
    create: create,
    /** @returns {object} a sampled round: each beat takes the best shown odds and rolls with rng. */
    auto: function (state, params, rng) { return autoRest(newRound(state, params), rng); },
    /** @returns {object} every remaining beat lost (Hardcore's pending worst). */
    worst: function (params) { return lossesFrom(opts(params), [], [], 0); },
    /** @returns {object} the beats played so far, the rest lost. */
    forfeit: function (params, progress) {
      var p = progress || { beats: [], picks: [], sum: 0 };
      var r = lossesFrom(opts(params), p.beats, p.picks, p.sum);
      r.exited = true;
      return r;
    },
    /** @returns {string} the result banner's line. */
    summary: function (r, text) {
      if (typeof r.m === 'number') return text('mg.frame.duel.cardsSummary', { m: r.m.toFixed(2), wins: r.wins, losses: r.losses });
      return text('mg.frame.duel.summary', { wins: r.wins, losses: r.losses });
    },
    // pure pieces for tests, tools and the balance simulator
    opts: opts,
    factor: function (stat, stance) { return factor(stat, stance, opts({})); },
    hintP: function (int) { return hintP(int, opts({})); },
    drawStance: function (rng, int) { return drawStance(rng, int, opts({})); },
    newRound: newRound,
    begin: begin,
    pick: pick,
    best: best,
    decided: decided,
    result: result,
  });
})();
