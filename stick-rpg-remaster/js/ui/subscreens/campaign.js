// js/ui/subscreens/campaign.js — owner: W2-Civic. The sub-screen `cityhall.campaign` (P0; UI §5.6
// "City Hall › Campaign HQ"; GDD §4.17; BALANCE B-17): City Hall's Election Office, also opened by
// the castle's Campaign HQ row (W2-Home) and any host that pushes it. One screen per election status:
//   none / lost / removed  who the Electoral Board calls (the requirements against your numbers, the
//                          karma that picks the race) and when you may run again;
//   nominated              the call, the deadline, anything still missing, and the three war chests
//                          (each with its starting poll) → cityhall.accept { chest } after a confirm;
//   campaign               the poll Meter with its 50 % line (a row's poll change ghosts on it), day
//                          n / 7, the war chest, the rival's nightly gain and attack ad (GDD §6.2),
//                          the debate on day 4, the action rows with their poll change ("used 1 / 2
//                          today", the halved repeat) and the campaign diary;
//   office                 the office, the salary and the karma-flip watch.
// The sub-screen never mutates state: rows preview through ctx.preview and commit through ctx.act
// (the host plays the feedback and runs the debate's minigame). A row's poll change is read from
// SR.rules.election.campaign run on a copy of the state with fixed draws (success and failure), so
// it follows the rules exactly (halving, the clamp, CHA). Rows ask first as card rows do: their
// `confirm`, or a spend at or above the `game.confirmSpendOver` setting. The diary keeps this
// session's poll news (the election toasts of each action and the election lines of each morning
// report), dated by campaign day like the header; it is not saved, and a loaded or new game
// starts it empty. Music (ART_AUDIO §13.4 `hail_to_the_stick`:
// "campaign, City Hall in office"; the Dictator asks for the `dictator` variant): the screen plays
// the march while a campaign runs or you hold office, and re-asserts it after every refresh (a
// minigame with a song of its own hands the building's song back when it closes; the debate has
// none and ducks the march); on close it gives the host building
// its song, except City Hall in office, which keeps the march. Entering City Hall in office plays
// the march too (a `door:entered` hook: a building def names one static song). Node-loadable:
// nothing touches the DOM at load time.
(function () {
  'use strict';
  var SR = window.SR;

  // The campaign rows in B-17's order (the action ids are cityhall.<id>) and the debate.
  var ACTIONS = ['rally', 'tvAd', 'doorKnock', 'kissBabies', 'intimidate', 'bribe'];
  var DIARY_MAX = 12;          // diary lines kept (presentation, not balance; CONTRACT D49)
  var MUSIC_FADE_S = 0.6;      // the building's cross-fade (ART_AUDIO §13.4)

  var M = null;                // the mounted screen: { root, ctx, rows, meter, music }
  var diary = [];              // this session's campaign news: { day /* campaign day or null */, key, vars }, newest last

  function D() { return SR.ui.dom; }
  function h() { return D().h.apply(null, arguments); }
  function t(k, v) { return D().t(k, v); }
  function E() { return SR.tuning.election; }
  function money(n) { return SR.text.money(n); }
  /** A poll figure: one decimal (the rules round every change to 0.1), none when it is whole. */
  function pollText(p) { var r = Math.round(p * 10) / 10; return SR.text.num(r, r % 1 ? 1 : 0); }
  /** A poll figure as a percentage (SR.text.pct: "40.8 %", "66 %"). */
  function pollPct(p) { var r = Math.round(p * 10) / 10; return SR.text.pct(r / 100, r % 1 ? 1 : 0); }
  function signed(n) { return (n < 0 ? '-' : '+') + pollText(Math.abs(n)); }
  function officeName(path) { return t(path === 'dictator' ? 'sub.cityhall.campaign.dictator' : 'sub.cityhall.campaign.president'); }

  // ---- the diary ---------------------------------------------------------------------------------
  /**
   * The campaign day (1..7, the header's "Day n of 7") of a calendar day: the campaign counter moves
   * with every night, as the calendar does, so it is the running counter less the days since.
   * After election night the counter reads 8, so the night that ended day 7 maps to 7.
   * @returns {(number|null)} null outside a campaign
   */
  function campaignDayOf(s, day) {
    var cd = s && s.election ? s.election.campaignDay || 0 : 0;
    var n = cd - (s.clock.day - day);
    return cd > 0 && n >= 1 ? n : null;
  }

  /** A diary line dated by its campaign day (a calendar day would read "Day 12" under "Day 1 of 7"). */
  function note(s, day, key, vars) {
    diary.push({ day: campaignDayOf(s, day), key: key, vars: vars || {} });
    if (diary.length > DIARY_MAX) diary.splice(0, diary.length - DIARY_MAX);
  }

  SR.onBoot(50, function () {
    SR.events.on('action:done', function (p) {
      var res = p && p.result, s = SR.state;
      if (!res || !res.ok || !s) return;
      (res.toasts || []).forEach(function (x) {
        if (!x || typeof x.key !== 'string' || x.key.indexOf('toast.election.') !== 0) return;
        if (x.key === 'toast.election.accepted') diary.length = 0;   // a new campaign starts a new diary
        note(s, s.clock.day, x.key, x.vars);
      });
    });
    SR.events.on('day:started', function (p) {
      var rep = p && p.report, s = SR.state;
      if (!rep || !Array.isArray(rep.lines) || !s) return;
      // The night's own lines (report.election.*: the rival, the no-show, the result) belong to the
      // day that ended; the morning's (the Board's call, a campaign event) to the new one.
      var today = rep.day || s.clock.day;
      rep.lines.forEach(function (l) {
        if (!l || l.section !== 'election') return;
        var night = typeof l.key === 'string' && l.key.indexOf('report.') === 0;
        note(s, night ? rep.endedDay || today - 1 : today, l.key, l.vars);
      });
    });
    // A loaded save or a new game (SR.save.load emits save:loaded for both) is another timeline:
    // the diary of the game before it must not show.
    SR.events.on('save:loaded', function () { diary.length = 0; });
    // City Hall in office plays the march (ART_AUDIO §13.4); the building scene has already asked
    // for the building's own song when it emits door:entered.
    SR.events.on('door:entered', function (p) {
      var s = SR.state;
      if (p && p.id === 'cityhall' && s && s.job && s.job.office) playMarch(s);
    });
  });

  // ---- poll outcomes -----------------------------------------------------------------------------
  /** A stream whose every draw returns u (u = 0: every check succeeds; u → 1: every check fails). */
  function fixed(u) {
    return {
      float: function (lo, hi) { return lo === undefined ? u : lo + u * (hi - lo); },
      int: function (lo, hi) { return lo + Math.floor(u * (hi - lo + 1)); },
      chance: function (p) { return u < p; },
      next: function () { return Math.floor(u * 4294967296) >>> 0; },
      pick: function (a) { return a[Math.min(a.length - 1, Math.floor(u * a.length))]; },
    };
  }

  /**
   * The poll change a campaign action would make now, by SR.rules.election.campaign on a copy of the
   * parts of the state it writes (the cost counts as paid), with every check succeeding and failing.
   * @returns {number[]} the distinct outcomes, largest first ([] when the rules refuse)
   */
  function outcomes(s, id) {
    var R = SR.rules.election;
    if (!R || typeof R.campaign !== 'function') return [];
    var out = [];
    [0, 0.999].forEach(function (u) {
      var c = {};
      Object.keys(s).forEach(function (k) { c[k] = s[k]; });
      ['election', 'daily', 'money', 'stats', 'clock'].forEach(function (k) { c[k] = SR.util.clone(s[k]); });
      try {
        var r = R.campaign(c, id, { rng: fixed(u), cost: { cash: 1, min: 1 } });
        if (r && r.ok !== false && typeof r.delta === 'number' && out.indexOf(r.delta) < 0) out.push(r.delta);
      } catch (e) { SR.util.warnOnce('campaign.outcomes', 'cityhall.campaign: poll preview failed: ' + e.message); }
    });
    return out.sort(function (a, b) { return b - a; });
  }

  function pollChip(list) {
    if (!list.length) return null;
    var text = list.length === 1 ? t('sub.cityhall.campaign.pollChip', { n: signed(list[0]) })
      : t('sub.cityhall.campaign.pollOr', { a: signed(list[0]), b: signed(list[list.length - 1]) });
    return SR.ui.chip({ kind: 'info', icon: 'ballot', text: text });
  }

  // ---- building blocks ---------------------------------------------------------------------------
  function title(key, vars, id) { return h('h3', { class: 't-h3', 'data-id': id || 'campaign-title', style: { margin: '0' } }, t(key, vars)); }
  function sub(key, vars) { return h('h4', { class: 't-label', style: { margin: 'var(--sp-2) 0 0' } }, t(key, vars)); }
  function para(key, vars, id, small) {
    return h('p', { class: small ? 't-small t-ink-700' : 't-body', 'data-id': id || null, style: { margin: '0' } }, t(key, vars));
  }

  /** The requirement checklist (B-17 requires) for a path; `only` lists just the missing ones. */
  function requirements(s, path, only) {
    var R = E().requires, P = R[path], st = s.stats;
    var q = SR.rules.election.qualifies(s);
    var missing = q.want === path ? q.missing : null;
    var low = Math.min(st.str, st.int, st.cha), cash = s.money.cash + s.money.bank;
    var items = [
      { id: 'home', icon: 'castle', key: 'sub.cityhall.campaign.reqHome', vars: {}, met: s.homes.living === R.home },
      { id: 'money', icon: 'money', key: 'sub.cityhall.campaign.reqMoney', vars: { money: money(R.money), have: money(cash) }, met: cash >= R.money },
      { id: 'stats', icon: 'star', key: 'sub.cityhall.campaign.reqStats', vars: { min: P.stats, have: low }, met: low >= P.stats },
      path === 'president'
        ? { id: 'karma', icon: 'karma', key: 'sub.cityhall.campaign.reqKarmaGood', vars: { min: P.karmaMin, have: st.karma }, met: st.karma >= P.karmaMin }
        : { id: 'karma', icon: 'karma', key: 'sub.cityhall.campaign.reqKarmaBad', vars: { max: P.karmaMax, have: st.karma }, met: st.karma <= P.karmaMax },
    ];
    // The rules decide what is missing; the rows only explain it.
    if (missing) items.forEach(function (it) { it.met = missing.indexOf(it.id) < 0; });
    var ul = h('ul', { 'data-id': 'campaign-reqs', style: { listStyle: 'none', margin: '0', padding: '0', display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' } });
    items.forEach(function (it) {
      if (only && it.met) return;
      ul.appendChild(h('li', { 'data-id': 'campaign-req-' + it.id, 'data-met': it.met ? 'yes' : 'no',
        style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', minHeight: '32px' } },
        D().icon(it.icon, 20),
        h('span', { class: 't-body', style: { flex: '1 1 auto' } }, t(it.key, it.vars)),
        SR.ui.badge({ text: it.met ? 'sub.cityhall.campaign.reqMet' : 'sub.cityhall.campaign.reqMissing', kind: it.met ? 'money' : 'warn' })));
    });
    return ul;
  }

  function ghost(pv) { if (SR.ui.hud && typeof SR.ui.hud.ghost === 'function') SR.ui.hud.ghost(pv || null); }

  /**
   * Runs a row the way the card runs one (UI §2.3 Confirm): its `confirm` first, else a confirm for
   * a spend at or above the `game.confirmSpendOver` setting (a rally, a TV ad), then ctx.act.
   */
  function commit(id, params, vars) {
    if (!M) return;
    var ctx = M.ctx, def = SR.reg.action[id] || {};
    var go = function () {
      if (!M || M.ctx !== ctx) return;
      // The host refreshes the screen after the act; the election:changed the act raises must not
      // rebuild it first (the chips fly from the row that committed, which a rebuild would drop).
      var m = M;
      m.acting = true;
      try { ctx.act(id, params || {}); } finally { m.acting = false; }
    };
    var ask = def.confirm ? { text: def.confirm, vars: vars || {} } : null;
    if (!ask) {
      var over = Number(D().setting('game.confirmSpendOver')) || 0;
      var pv = over > 0 ? ctx.preview(id, params || {}) : null;
      var cash = pv && pv.cost ? pv.cost.cash || 0 : 0;
      if (over > 0 && cash >= over) ask = { text: 'ui.confirmSpend', vars: { money: money(cash) } };
    }
    if (ask && SR.ui.confirm) {
      SR.ui.confirm({ id: 'confirm-campaign', title: def.label, text: ask.text, vars: ask.vars }).then(function (yes) { if (yes) go(); });
    } else go();
  }

  /** An ActionRow for an action of this screen (hotkeys follow the screen's rows); null when hidden. */
  function actionRow(rowId, actionId, params, o) {
    var pv = o.pv || M.ctx.preview(actionId, params || {});
    if (!pv || pv.hidden) return null;
    var def = SR.reg.action[actionId] || {};
    var gains = (o.gains || []).filter(Boolean).concat(o.ownGains ? [] : SR.ui.chip.gains(pv));
    var el = SR.ui.actionRow({
      id: rowId, hotkey: M.rows.length < 9 ? M.rows.length + 1 : null, icon: o.icon || def.icon, label: o.label || def.label, vars: o.vars,
      gains: gains, costs: o.costs || SR.ui.chip.costs(pv, { def: def }), badges: o.badges || [],
      disabled: !pv.ok, reason: pv.reason, reasonVars: pv.vars,
      onRun: function () { commit(actionId, params, o.confirmVars); },
      onFocus: function () { ghost(pv); if (M && M.meter && o.poll) M.meter.update({ ghost: o.poll }); },
      onBlur: function () { ghost(null); if (M && M.meter) M.meter.update({ ghost: 0 }); },
    });
    M.rows.push({ el: el, id: rowId });
    return el;
  }

  /**
   * Tonight's attack ad (GDD §6.2: the rivals' attack ads): one of the rival's lines
   * (sub.cityhall.campaign.ad.<rival>.1..n), picked by a hash of the seed, the run and the campaign
   * day, so it holds all day, changes each day and never draws on the rules stream.
   * @returns {(string|null)} a text key, or null when the rival has none
   */
  function attackAd(s, rival) {
    var base = 'sub.cityhall.campaign.ad.' + rival + '.', n = 0;
    while (SR.text.has(base + (n + 1))) n++;
    if (!n) return null;
    var el = s.election;
    return base + (1 + SR.util.hash(s.seed, 'attackAd', el.runs || 0, el.campaignDay) % n);
  }

  // ---- the screens -------------------------------------------------------------------------------
  function renderOpen(root, s) {
    var el = s.election;
    var want = SR.rules.election.qualifies(s).want;
    root.appendChild(title('sub.cityhall.campaign.noneTitle'));
    root.appendChild(para('sub.cityhall.campaign.intro'));
    if (el.status === 'lost') root.appendChild(para('sub.cityhall.campaign.lostLine', { poll: pollText(el.poll) }, 'campaign-last'));
    if (el.status === 'removed') root.appendChild(para('sub.cityhall.campaign.removedLine', null, 'campaign-last'));
    if (s.clock.day < (el.retryFromDay || 0)) root.appendChild(para('sub.cityhall.campaign.retry', { day: el.retryFromDay }, 'campaign-retry'));
    root.appendChild(sub('sub.cityhall.campaign.reqTitle', { office: officeName(want) }));
    root.appendChild(requirements(s, want, false));
    var R = E().requires;
    root.appendChild(para('sub.cityhall.campaign.path', { good: R.president.karmaMin, bad: R.dictator.karmaMax }, 'campaign-path', true));
  }

  function renderNominated(root, s) {
    var el = s.election, T = E();
    root.appendChild(title('sub.cityhall.campaign.nominatedTitle', { office: officeName(el.path) }));
    // The last day is the rules' (acceptBy: the night that ends it lapses the offer).
    root.appendChild(para('sub.cityhall.campaign.nominatedLine', { day: el.nominatedDay, last: SR.rules.election.acceptBy(s) }, 'campaign-deadline'));
    var q = SR.rules.election.qualifies(s);
    if (!q.ok) {
      root.appendChild(para('sub.cityhall.campaign.stillMissing', null, 'campaign-missing'));
      root.appendChild(requirements(s, q.want, true));
    }
    root.appendChild(sub('sub.cityhall.campaign.chestTitle'));
    root.appendChild(para('sub.cityhall.campaign.chestHint', { base: T.startPoll.base }, null, true));
    var cash = s.money.cash + s.money.bank;
    T.warChest.forEach(function (tier, i) {
      var start = SR.rules.election.startPoll(s, i);
      var row = actionRow('campaign-chest-' + i, 'cityhall.accept', { chest: i }, {
        icon: 'ballot', label: 'sub.cityhall.campaign.chest', vars: { money: money(tier.cash) },
        gains: [SR.ui.chip({ kind: 'info', icon: 'ballot', text: t('sub.cityhall.campaign.pollChip', { n: signed(tier.poll) }) }),
          SR.ui.chip({ kind: 'info', icon: 'star', text: t('sub.cityhall.campaign.startChip', { poll: pollText(start) }) })],
        costs: [SR.ui.chip({ kind: 'money', n: tier.cash, cost: true, short: cash < tier.cash })],
        ownGains: true,   // the preview's gains are the chest leaving cash and bank: the cost chip says it
        confirmVars: { money: money(tier.cash) },
      });
      if (row) root.appendChild(row);
    });
  }

  function renderCampaign(root, s) {
    var el = s.election, T = E(), rival = SR.rules.election.RIVAL[el.path] || 'doodle';
    root.appendChild(title('sub.cityhall.campaign.campaignTitle', { office: officeName(el.path) }));
    var head = h('div', { style: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--sp-2)' } },
      h('span', { class: 't-label', 'data-id': 'campaign-day' }, t('sub.cityhall.campaign.day', { day: el.campaignDay, days: T.campaignDays })),
      h('span', { class: 't-h2 t-num', 'data-id': 'campaign-poll-value' }, pollPct(el.poll)));
    root.appendChild(head);
    M.meter = SR.ui.meter({ id: 'campaign-poll', kind: 'poll', value: el.poll, max: T.pollClamp[1], label: false });
    root.appendChild(M.meter);
    root.appendChild(para(el.campaignDay >= T.campaignDays ? 'sub.cityhall.campaign.tonight' : 'sub.cityhall.campaign.night',
      { days: T.campaignDays, jitter: T.win.jitter[1], need: T.win.threshold }, 'campaign-night', true));
    root.appendChild(para('sub.cityhall.campaign.chestPaid', { money: money(el.chest) }, 'campaign-chest', true));
    var rivalName = t(rival === 'crayon' ? 'mg.debate.crayon' : 'mg.debate.doodle');
    root.appendChild(para('sub.cityhall.campaign.rival', { rival: rivalName, min: T.rivalDaily[0], max: T.rivalDaily[1] }, 'campaign-rival', true));
    var dd = T.debate.day, debateKey = el.campaignDay < dd ? 'sub.cityhall.campaign.debateSoon'
      : el.debateDone ? 'sub.cityhall.campaign.debateDone'
      : el.campaignDay === dd ? 'sub.cityhall.campaign.debateToday' : 'sub.cityhall.campaign.debateMissed';
    root.appendChild(para(debateKey, { day: dd, n: -T.debate.noShow }, 'campaign-debate', true));

    root.appendChild(sub('sub.cityhall.campaign.actions'));
    var used = s.daily.campaign || {};
    ACTIONS.forEach(function (id) {
      var pv = M.ctx.preview('cityhall.' + id, {});
      if (!pv || pv.hidden) return;
      var n = used[id] || 0, A = T[id], poll = outcomes(s, id);
      var badges = [t(n >= 1 && n < A.cap ? 'sub.cityhall.campaign.usedHalf' : 'sub.cityhall.campaign.used', { n: n, cap: A.cap })];
      root.appendChild(actionRow('campaign-' + id, 'cityhall.' + id, {}, { pv: pv, gains: [pollChip(poll)], badges: badges, poll: poll[0] || 0 }));
    });
    var drow = actionRow('campaign-debate', 'cityhall.debate', {}, {
      // B-17: the poll moves per question (3 of them), not once for the debate.
      gains: [SR.ui.chip({ kind: 'info', icon: 'ballot', text: t('sub.cityhall.campaign.debateChip', { n: T.debate.questions, a: signed(T.debate.win), b: signed(T.debate.lose) }) })],
    });
    if (drow) root.appendChild(drow);

    root.appendChild(sub('sub.cityhall.campaign.diary'));
    // The rival's attack ad heads the diary (news, like the diary; the top of the screen stays the
    // poll and the facts that decide it, so the first row still shows with the Meter).
    var ad = attackAd(s, rival);
    if (ad) root.appendChild(para('sub.cityhall.campaign.ad', { rival: rivalName, ad: t(ad) }, 'campaign-ad', true));
    if (!diary.length) root.appendChild(para('sub.cityhall.campaign.diaryEmpty', null, 'campaign-diary', true));
    else {
      var ul = h('ul', { 'data-id': 'campaign-diary', class: 't-small', style: { margin: '0', paddingLeft: 'var(--sp-4)' } });
      diary.slice().reverse().forEach(function (d) {
        var text = t(d.key, d.vars);
        ul.appendChild(h('li', null, d.day ? t('sub.cityhall.campaign.diaryLine', { day: d.day, text: text }) : text));
      });
      root.appendChild(ul);
    }
  }

  function renderOffice(root, s) {
    var path = s.job.office, T = E();
    root.appendChild(title('sub.cityhall.campaign.officeTitle', { office: officeName(path) }));
    root.appendChild(para('sub.cityhall.campaign.salary', { money: money(T.salary) }, 'campaign-salary'));
    root.appendChild(para(path === 'dictator' ? 'sub.cityhall.campaign.flipDictator' : 'sub.cityhall.campaign.flipPresident',
      { n: s.election.flipMornings || 0, of: T.flip }, 'campaign-flip', true));
  }

  /** Rebuilds the screen from the state, keeping the focused control (by data-id). */
  function render() {
    if (!M) return;
    var root = M.root, s = M.ctx.state;
    var f = SR.ui.focus && SR.ui.focus.focused ? SR.ui.focus.focused() : null;
    var keep = f && root.contains(f) ? f.getAttribute('data-id') : null;
    D().clear(root);
    M.rows = [];
    M.meter = null;
    var status = s.job.office ? 'office' : s.election.status;
    var moved = M.status !== undefined && M.status !== status;
    M.status = status;
    root.setAttribute('data-status', status);
    if (status === 'office') renderOffice(root, s);
    else if (status === 'campaign') renderCampaign(root, s);
    else if (status === 'nominated') renderNominated(root, s);
    else renderOpen(root, s);
    music(status, s);
    var again = keep ? root.querySelector('[data-id="' + keep + '"]') : null;
    if (again && SR.ui.focus) SR.ui.focus.focus(again);
    else if (moved) {
      // A new status (accepted, elected ...): its first row takes the focus and the title shows.
      var first = M.rows[0] && M.rows[0].el.main;
      // Back to the top of the card's scroller, as the host does when it shows a screen (a title
      // scrolled into view would sit under the sticky Breadcrumb), then just enough for the focused
      // row to show: Enter must never run a row the player cannot see.
      var sc = root.closest ? root.closest('.scroll-y') : null;
      if (sc) sc.scrollTop = 0;
      if (first) {
        try { first.focus({ preventScroll: true }); } catch (e) { first.focus(); }
        if (first.scrollIntoView) first.scrollIntoView({ block: 'nearest' });
      }
    }
  }

  /** Plays the campaign march (the Dictator's `dictator` variant); a no-op while it already plays. */
  function playMarch(s) {
    if (!SR.audio || typeof SR.audio.music !== 'function') return;
    var path = (s.job && s.job.office) || (s.election && s.election.path);
    try { SR.audio.music('hail_to_the_stick', { fade: MUSIC_FADE_S, variant: path === 'dictator' ? 'dictator' : undefined }); } catch (e) {
      SR.util.warnOnce('campaign.music', 'cityhall.campaign: music failed: ' + e.message);
    }
  }

  /**
   * The campaign march while a campaign runs or you hold office; the building's song otherwise.
   * Asked again on every render while wanted: SR.audio.music keeps a song that already plays, and a
   * minigame closing over the screen (the debate) has handed the building's song back meanwhile.
   */
  function music(status, s) {
    if (!SR.audio || typeof SR.audio.music !== 'function') return;
    var want = status === 'campaign' || status === 'office';
    if (want) { M.music = true; playMarch(s); return; }
    if (!M.music) return;
    M.music = false;
    try { restoreMusic(M.ctx); } catch (e) { SR.util.warnOnce('campaign.music', 'cityhall.campaign: music failed: ' + e.message); }
  }

  /** Gives the host building its song back (City Hall in office keeps the march). */
  function restoreMusic(ctx) {
    var s = SR.state;
    if (ctx && ctx.building === 'cityhall' && s && s.job && s.job.office) { playMarch(s); return; }
    var b = ctx && ctx.building && SR.reg.building && SR.reg.building[ctx.building];
    if (b && b.music && SR.audio && typeof SR.audio.music === 'function') SR.audio.music(b.music, { fade: MUSIC_FADE_S });
  }

  SR.def.subscreen('cityhall.campaign', {
    title: 'sub.cityhall.campaign',
    p: 0,
    /** Builds the screen for the election's status. */
    mount: function (root, ctx) {
      M = { root: root, ctx: ctx, rows: [], meter: null, music: false, status: undefined, offs: [], acting: false };
      // A night passed (the castle's Campaign HQ, a debug night) or the election moved on: rebuild.
      M.offs.push(SR.events.on('day:started', function () { render(); }));
      M.offs.push(SR.events.on('election:changed', function () { if (M && !M.acting) render(); }));
      render();
    },
    /** Rebuilds after each ctx.act, a clock or money change, and when a child pops. */
    refresh: function (ctx) { if (M) { M.ctx = ctx; render(); } },
    /** Gives the building its song back. */
    unmount: function () {
      if (!M) return;
      var ctx = M.ctx, played = M.music;
      M.offs.forEach(function (off) { off(); });
      M = null;
      ghost(null);
      if (played) { try { restoreMusic(ctx); } catch (e) { /* audio is optional */ } }
    },
    /** Hotkeys 1-9 run the screen's rows in order. @returns {boolean} consumed */
    onAction: function (action, ev) {
      var m = /^row(\d)$/.exec(action);
      if (!m || !M || (ev && ev.repeat)) return false;
      var r = M.rows[Number(m[1]) - 1];
      if (!r) return true;
      SR.ui.focus.focus(r.el.main);
      r.el.main.click();
      return true;
    },
    // Test hooks (read through SR.reg.subscreen['cityhall.campaign']; no public name is added):
    /** @returns {object[]} a copy of this session's diary. */
    diary: function () { return diary.map(function (d) { return { day: d.day, key: d.key, vars: d.vars }; }); },
    /** @returns {number[]} the poll outcomes of a campaign action on the live state. */
    outcomes: function (id) { return SR.state ? outcomes(SR.state, id) : []; },
  });
})();
