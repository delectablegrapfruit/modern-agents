// UI: learning path, lessons (quiz + trade steps with graded feedback), practice, profile.
(function () {
  const E = TT.engine, S = TT.store, F = E.fmt;
  const $app = document.getElementById('app');
  const INTERVAL_SEC = { '1h': 3600, '4h': 14400, '1d': 86400 };
  const INTERVAL_NAME = { '1h': 'Hourly candles', '4h': '4-hour candles', '1d': 'Daily candles' };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let tab = 'learn';
  let L = null; // active lesson UI state
  let modal = null; // {type:'node'|'guide'|'confirm', ...}
  let chart = null;

  // ---------- icons ----------
  const I = {
    flame: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2c1 3.5 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.2 1.6 1 2.6 2 3 0-3.5 0-6.5 1-9.5z"/></svg>',
    bolt: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
    heart: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 21s-8-5.2-8-11a4.8 4.8 0 0 1 8-3.3A4.8 4.8 0 0 1 20 10c0 5.8-8 11-8 11z"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="m12 2.5 2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17l-5.9 3.3 1.3-6.5L2.5 9.3l6.6-.8z"/></svg>',
    lock: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M7 10V7a5 5 0 0 1 10 0v3h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zm2 0h6V7a3 3 0 0 0-6 0z"/></svg>',
    chart: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M6 3h2v3h1v9H8v6H6v-6H5V6h1zm10 3h2v4h1v7h-1v4h-2v-4h-1v-7h1z"/></svg>',
    book: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M5 3h11a3 3 0 0 1 3 3v15H7a2 2 0 0 1-2-2zm2 14v2h10v-2z"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6 10.6 12 5 6.4z"/></svg>',
    home: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 3 2 12h3v8h5v-5h4v5h5v-8h3z"/></svg>',
    dice: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm2.5 3a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm9 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM12 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM7.5 15a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm9 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"/></svg>',
    user: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-5 0-9 2.5-9 6v2h18v-2c0-3.5-4-6-9-6z"/></svg>',
    trophy: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M7 3h10v2h4v3a5 5 0 0 1-5 5 5 5 0 0 1-3 2.6V18h3v3H8v-3h3v-2.4A5 5 0 0 1 8 13a5 5 0 0 1-5-5V5h4zm-2 4v1a3 3 0 0 0 2 2.8V7zm14 0h-2v3.8A3 3 0 0 0 19 8z"/></svg>',
    news: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M4 4h14v14a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2zm16 4h2v10a2 2 0 0 1-4 0V8zM7 7v4h4V7zm0 6v2h8v-2zm6-6v1h2V7zm0 3v1h2v-1z"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M7 4v16l13-8z"/></svg>',
    replay: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="m9.5 16.2-4.2-4.2-1.4 1.4 5.6 5.6 11-11-1.4-1.4z"/></svg>',
    cross: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6 10.6 12 5 6.4z"/></svg>',
    // action tile glyphs
    hold: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M7 5h3v14H7zm7 0h3v14h-3z"/></svg>',
    buy25: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="m12 5 7 8h-4.5v6h-5v-6H5z"/></svg>',
    buy50: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="m12 2 6.5 7h-4v3h-5V9h-4zm0 9 6.5 7h-4v4h-5v-4h-4z"/></svg>',
    allin: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2c3 2.5 4.5 6 4.5 10l2.5 3v4l-4-2h-6l-4 2v-4l2.5-3C7.5 8 9 4.5 12 2zm0 6a1.8 1.8 0 1 0 0 3.6A1.8 1.8 0 0 0 12 8zm-1.5 11h3l-1.5 3z"/></svg>',
    trim: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="m12 19-7-8h4.5V5h5v6H19z"/></svg>',
    exit: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="m12 22-6.5-7h4v-3h5v3h4zm0-9-6.5-7h4V2h5v4h4z"/></svg>',
  };
  const icon = (name, cls = '') => `<span class="ic ${cls}">${I[name]}</span>`;

  // ---------- mascot ----------
  function mascot(mood = 'happy', size = 96) {
    const mouths = {
      happy: '<path d="M42 79 Q50 85 58 79" stroke="#6b2d1f" stroke-width="3" fill="none" stroke-linecap="round"/>',
      party: '<path d="M40 77 Q50 90 60 77 Z" fill="#6b2d1f"/><path d="M45 82 Q50 86 55 82" fill="#ff8a80"/>',
      meh: '<path d="M43 80 L57 80" stroke="#6b2d1f" stroke-width="3" stroke-linecap="round"/>',
      sad: '<path d="M42 83 Q50 76 58 83" stroke="#6b2d1f" stroke-width="3" fill="none" stroke-linecap="round"/>',
      shock: '<ellipse cx="50" cy="81" rx="5" ry="6" fill="#6b2d1f"/>',
    };
    const brows = mood === 'sad' ? '<path d="M29 36 L42 40 M71 36 L58 40" stroke="#2f5d0a" stroke-width="3" stroke-linecap="round"/>'
      : mood === 'shock' ? '<path d="M29 34 Q36 29 43 34 M57 34 Q64 29 71 34" stroke="#2f5d0a" stroke-width="3" fill="none" stroke-linecap="round"/>' : '';
    const cheeks = mood === 'party' || mood === 'happy' ? '<circle cx="24" cy="62" r="5" fill="#ff9c8a" opacity=".6"/><circle cx="76" cy="62" r="5" fill="#ff9c8a" opacity=".6"/>' : '';
    const look = mood === 'sad' ? 2 : 0;
    return `<svg class="mascot" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true">
      <path d="M24 34 Q6 26 9 8 Q18 22 32 26 Z" fill="#fff4d6" stroke="#e8c97a" stroke-width="2"/>
      <path d="M76 34 Q94 26 91 8 Q82 22 68 26 Z" fill="#fff4d6" stroke="#e8c97a" stroke-width="2"/>
      <ellipse cx="14" cy="44" rx="8" ry="5" fill="#4aad02" transform="rotate(-20 14 44)"/>
      <ellipse cx="86" cy="44" rx="8" ry="5" fill="#4aad02" transform="rotate(20 86 44)"/>
      <ellipse cx="50" cy="55" rx="36" ry="35" fill="#58cc02"/>
      <ellipse cx="50" cy="52" rx="30" ry="27" fill="#6bd916" opacity=".5"/>
      ${cheeks}
      <circle cx="37" cy="46" r="9" fill="#fff"/><circle cx="63" cy="46" r="9" fill="#fff"/>
      <circle cx="${38}" cy="${47 + look}" r="4.6" fill="#1f2d12"/><circle cx="${62}" cy="${47 + look}" r="4.6" fill="#1f2d12"/>
      <circle cx="39.5" cy="45" r="1.5" fill="#fff"/><circle cx="63.5" cy="45" r="1.5" fill="#fff"/>
      ${brows}
      <ellipse cx="50" cy="72" rx="21" ry="15" fill="#ffd9cc"/>
      <ellipse cx="43" cy="69" rx="3" ry="4" fill="#c9776a"/><ellipse cx="57" cy="69" rx="3" ry="4" fill="#c9776a"/>
      ${mouths[mood] || mouths.happy}
    </svg>`;
  }

  // ---------- helpers ----------
  const tokenName = (sess) => (sess.blind ? 'Mystery token' : sess.symbol.replace(/USDT$/, ''));
  const scaleOf = (sess) => (sess.blind ? 100 / sess.series.c[0] : 1);
  const priceText = (sess, p) => (sess.blind ? '' : '$') + TT.fmtPrice(p * scaleOf(sess));
  const whenText = (sess, i) => (sess.blind ? `Bar ${i + 1}` : TT.fmtTime(sess.series.t[i], sess.series.interval, true));

  function newsFor(sess, fromI, toI) {
    const def = sess.def;
    if (!def.news || sess.blind) return [];
    const sec = INTERVAL_SEC[sess.series.interval];
    const lo = fromI == null ? -Infinity : sess.series.t[fromI] + sec;
    const hi = sess.series.t[toI] + sec;
    return def.news
      .map(([when, text]) => ({ ts: Date.parse(when.length === 10 ? when + 'T00:00:00Z' : when + ':00:00Z') / 1000, when, text }))
      .filter((n) => n.ts >= lo && n.ts < hi);
  }

  function newsDate(n, interval) {
    const d = new Date(n.ts * 1000);
    const base = d.toLocaleString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    return interval === '1d' || n.when.length === 10 ? base : `${base} ${String(d.getUTCHours()).padStart(2, '0')}:00 UTC`;
  }

  const gradeClass = (g) => (g === 'excellent' || g === 'good' ? 'good' : g === 'inaccuracy' ? 'warn' : 'bad');

  // ---------- top-level render ----------
  function render() {
    applyTheme();
    if (L) { $app.innerHTML = renderLesson(); afterLessonRender(); return; }
    $app.innerHTML = `
      <div class="shell">
        <nav class="sidenav">
          <div class="brand">${mascot('happy', 40)}<span>token<b>trainer</b></span></div>
          ${navItem('learn', 'home', 'Learn')}${navItem('practice', 'dice', 'Practice')}${navItem('profile', 'user', 'Profile')}
        </nav>
        <main class="main">${tab === 'learn' ? renderLearn() : tab === 'practice' ? renderPractice() : renderProfile()}</main>
        <aside class="rail">${renderRail()}</aside>
      </div>
      ${modal ? renderModal() : ''}`;
  }

  function navItem(id, ic, label) {
    return `<button class="navbtn ${tab === id ? 'on' : ''}" data-act="tab" data-id="${id}">${icon(ic)}<span>${label}</span></button>`;
  }

  function statsBar() {
    const st = S.streakNow(), d = S.get();
    return `<div class="stats">
      <span class="stat ${st ? 'flame' : 'dim'}" title="Day streak">${icon('flame')}${st}</span>
      <span class="stat bolt" title="Total XP">${icon('bolt')}${d.xp}</span>
      <span class="stat gold" title="Stars">${icon('star')}${Object.values(d.lessons).reduce((s, l) => s + (l.stars || 0), 0)}</span>
    </div>`;
  }

  function renderRail() {
    const dx = S.dailyXp(), goal = S.DAILY_GOAL;
    const p = Math.min(1, dx / goal);
    return `${statsBar()}
      <div class="card">
        <h3>Daily goal</h3>
        <div class="goal"><div class="bar"><i style="width:${p * 100}%"></i></div><b>${dx}/${goal} XP</b></div>
        <p class="muted">${p >= 1 ? 'Goal met — nice work!' : 'Finish a lesson to keep your streak alive.'}</p>
      </div>
      <div class="card">
        <h3>How grading works</h3>
        <p class="muted">Each move is graded on <b>process</b> (what a pro could see at that moment: trend, momentum, sizing, stops) and <b>outcome</b> (what happened next vs your other options). You lose hearts for bad decisions, not bad luck.</p>
      </div>
      <p class="muted small">Real Binance spot candles · ${esc(root_source())}</p>`;
  }
  function root_source() { return `data ${window.MARKET_DATA.generated}`; }

  // ---------- learn ----------
  function renderLearn() {
    const d = S.get();
    let html = `<div class="mobile-top">${statsBar()}</div>`;
    if (d.active) {
      const def = d.active.key === 'practice' ? { title: 'Mystery Chart' } : TT.scenarioById[d.active.key];
      html += `<div class="resume card"><div>${mascot('happy', 48)}</div><div class="grow"><b>Unfinished: ${esc(def.title)}</b><p class="muted">Your decisions so far are locked in. Pick up where you left off.</p></div>
        <button class="btn primary" data-act="resume">Resume</button></div>`;
    }
    let current = TT.SCENARIOS.find((s) => S.unlocked(s.id) && !(d.lessons[s.id] || {}).completions);
    TT.UNITS.forEach((u, ui) => {
      const list = TT.SCENARIOS.filter((s) => s.unit === u.id);
      html += `<section class="unit ${u.color}">
        <header class="unit-banner"><div><small>UNIT ${ui + 1}</small><h2>${esc(u.title)}</h2><p>${esc(u.blurb)}</p></div>
          <button class="btn ghost-light" data-act="guide" data-id="${u.id}">${icon('book')}<span>Guidebook</span></button></header>
        <div class="path">`;
      const offs = [0, -1, -1.6, -1, 0, 1, 1.6, 1];
      list.forEach((s, k) => {
        const l = d.lessons[s.id] || {};
        const open = S.unlocked(s.id);
        const state = l.completions ? 'done' : open ? 'open' : 'locked';
        const isCur = current && current.id === s.id;
        const off = offs[(k + ui * 3) % offs.length] * 44;
        html += `<div class="node-wrap" style="transform:translateX(${off}px)">
          ${isCur ? '<div class="start-bubble">START</div>' : ''}
          <button class="node ${state} ${isCur ? 'current' : ''}" data-act="node" data-id="${s.id}" aria-label="${esc(s.title)}">
            ${state === 'locked' ? icon('lock') : state === 'done' ? icon('check') : icon('chart')}
          </button>
          <div class="node-stars">${[1, 2, 3].map((n) => `<i class="${(l.stars || 0) >= n ? 'on' : ''}">${I.star}</i>`).join('')}</div>
          <div class="node-label">${esc(s.title)}</div>
        </div>`;
      });
      html += `<div class="path-mascot ${ui % 2 ? 'left' : 'right'}">${mascot(ui === 3 ? 'shock' : ui === 2 ? 'meh' : 'happy', 110)}</div></div></section>`;
    });
    html += `<div class="card center"><h3>More chapters coming</h3><p class="muted">Keep sharpening in Practice — random real charts, no names, no dates.</p><button class="btn secondary" data-act="tab" data-id="practice">Go to practice</button></div>`;
    return html;
  }

  // ---------- practice ----------
  function renderPractice() {
    const d = S.get();
    const syms = Object.keys(window.MARKET_DATA.practice).map((s) => s.replace(/USDT$/, ''));
    return `<div class="mobile-top">${statsBar()}</div>
      <div class="hero card">
        ${mascot('party', 110)}
        <h1>Mystery Chart</h1>
        <p>A random stretch of real daily candles from one of ${syms.length} major tokens (${syms.join(', ')}), 2019–2026. No name, no dates, no news — just the chart. The token and period are revealed at the end.</p>
        <div class="row center"><span class="pill">${icon('bolt')} XP per decision</span><span class="pill">${d.practice.rounds} rounds played</span>${d.practice.best != null ? `<span class="pill">Best score ${d.practice.best}</span>` : ''}</div>
        <button class="btn primary big" data-act="practice">Start a round</button>
      </div>
      <div class="card"><h3>Why blind?</h3><p class="muted">Knowing it's "BTC in March 2020" gives you hindsight. Blind charts force you to trade what you see: trend, momentum, volatility and risk — the same skills the lessons grade.</p></div>`;
  }

  // ---------- profile ----------
  function renderProfile() {
    const d = S.get();
    const done = TT.SCENARIOS.filter((s) => (d.lessons[s.id] || {}).completions).length;
    const stars = Object.values(d.lessons).reduce((s, l) => s + (l.stars || 0), 0);
    const g = d.grades, total = Object.values(g).reduce((a, b) => a + b, 0) || 1;
    const order = ['excellent', 'good', 'inaccuracy', 'mistake', 'blunder'];
    const theme = S.setting('theme');
    return `<div class="mobile-top">${statsBar()}</div>
      <div class="profile-head card">${mascot('happy', 80)}<div><h1>Your trading record</h1><p class="muted">Kept in this browser.</p></div></div>
      <div class="tiles4">
        <div class="tile-stat">${icon('flame', 'orange')}<b>${S.streakNow()}</b><span>Day streak</span></div>
        <div class="tile-stat">${icon('bolt', 'gold')}<b>${d.xp}</b><span>Total XP</span></div>
        <div class="tile-stat">${icon('check', 'green')}<b>${done}/${TT.SCENARIOS.length}</b><span>Lessons</span></div>
        <div class="tile-stat">${icon('star', 'gold')}<b>${stars}</b><span>Stars</span></div>
      </div>
      <div class="card"><h3>Decision grades</h3>
        <div class="gradebar">${order.map((k) => (g[k] ? `<i class="g-${k}" style="flex:${g[k]}" title="${E.GRADES[k].label}: ${g[k]}"></i>` : '')).join('') || '<i class="g-empty" style="flex:1"></i>'}</div>
        <div class="legend">${order.map((k) => `<span><i class="dot g-${k}"></i>${E.GRADES[k].label} ${g[k] || 0} (${Math.round(((g[k] || 0) / total) * 100)}%)</span>`).join('')}</div>
      </div>
      <div class="card"><h3>Achievements</h3><div class="achv">
        ${S.ACHIEVEMENTS.map((a) => `<div class="ach ${d.achievements[a.id] ? 'on' : ''}">${icon('trophy')}<div><b>${esc(a.title)}</b><span>${esc(a.desc)}</span></div></div>`).join('')}
      </div></div>
      <div class="card"><h3>Settings</h3>
        <label class="setting"><span><b>Sound effects</b></span><input type="checkbox" data-act="set" data-id="sound" ${S.setting('sound') ? 'checked' : ''}></label>
        <label class="setting"><span><b>Blind mode for lessons</b><small>Hide token names, dates and news; prices shown as an index starting at 100.</small></span><input type="checkbox" data-act="set" data-id="blind" ${S.setting('blind') ? 'checked' : ''}></label>
        <div class="setting"><span><b>Theme</b></span><div class="seg">${['auto', 'light', 'dark'].map((t) => `<button class="${theme === t ? 'on' : ''}" data-act="theme" data-id="${t}">${t}</button>`).join('')}</div></div>
        <div class="setting"><span><b>Reset progress</b><small>Clears XP, streak, stars and achievements.</small></span><button class="btn danger small" data-act="reset">Reset</button></div>
      </div>`;
  }

  // ---------- modals ----------
  function renderModal() {
    if (modal.type === 'guide') {
      const u = TT.UNITS.find((x) => x.id === modal.id);
      return `<div class="overlay" data-act="close-modal"><div class="modal ${u.color}" data-stop>
        <header><h2>${esc(u.title)}</h2><button class="iconbtn" data-act="close-modal">${icon('close')}</button></header>
        <p class="muted">Key ideas for this unit</p>
        ${u.guide.map(([t, b]) => `<div class="guide-item"><h3>${esc(t)}</h3><p>${esc(b)}</p></div>`).join('')}
        <button class="btn primary wide" data-act="close-modal">Got it</button></div></div>`;
    }
    if (modal.type === 'node') {
      const s = TT.scenarioById[modal.id];
      const l = S.get().lessons[s.id] || {};
      const locked = !S.unlocked(s.id);
      const u = TT.UNITS.find((x) => x.id === s.unit);
      const active = S.get().active;
      const other = active && active.key !== s.id;
      return `<div class="overlay" data-act="close-modal"><div class="modal ${u.color}" data-stop>
        <header><h2>${esc(s.title)}</h2><button class="iconbtn" data-act="close-modal">${icon('close')}</button></header>
        <p class="skill">${icon('chart')} ${esc(s.skill)}</p>
        <p>${esc(s.brief)}</p>
        ${l.completions ? `<p class="muted">Best: ${l.stars}★ · score ${l.best} · played ${l.attempts}×</p>` : ''}
        ${locked ? '<p class="muted">Complete the previous lesson to unlock.</p>'
          : other ? '<p class="warn-text">You have another lesson in progress. Starting this one forfeits it.</p>' : ''}
        <button class="btn primary wide" data-act="start" data-id="${s.id}" ${locked ? 'disabled' : ''}>${active && active.key === s.id ? 'Resume' : l.completions ? 'Replay scenario' : 'Start lesson'}</button></div></div>`;
    }
    if (modal.type === 'confirm') {
      return `<div class="overlay" data-act="close-modal"><div class="modal" data-stop>
        <div class="center">${mascot(modal.mood || 'sad', 90)}</div>
        <h2 class="center">${esc(modal.title)}</h2><p class="center muted">${esc(modal.body)}</p>
        <button class="btn danger wide" data-act="${modal.act}">${esc(modal.yes)}</button>
        <button class="btn ghost wide" data-act="close-modal">${esc(modal.no || 'Cancel')}</button></div></div>`;
    }
    return '';
  }

  // ---------- lesson ----------
  function startLesson(key, resume) {
    const d = S.get();
    const def = key === 'practice' ? { practice: true } : TT.scenarioById[key];
    let a = resume && d.active && d.active.key === key ? d.active : null;
    if (!a) {
      a = { key, seed: (Math.random() * 2 ** 31) | 0, blind: key === 'practice' ? true : !!S.setting('blind'), answers: [] };
      S.setActive(a);
    }
    const session = E.createSession(def, { seed: a.seed, blind: a.blind });
    const st = E.replay(session, a.answers);
    L = { key, def, session, active: a, st, phase: a.answers.length ? 'step' : 'intro', sel: {}, result: null, upto: null, ended: null };
    if (st.done || st.failed) endLesson();
    modal = null;
    render();
  }

  function currentIndex() {
    const { session, st, phase, result } = L;
    if ((phase === 'feedback' || phase === 'animating') && result && result.type === 'trade') return L.upto;
    if (phase === 'end' || st.step >= session.steps.length) {
      const last = st.results.filter((r) => r.type === 'trade').pop();
      return last ? last.to : session.cps[0];
    }
    const step = session.steps[phase === 'feedback' ? result.step : st.step];
    return step.type === 'trade' ? step.i : session.cps[step.cp];
  }

  function renderLesson() {
    const { session, st, phase } = L;
    const total = session.steps.length;
    const doneSteps = phase === 'end' ? total : st.step;
    const hearts = st.hearts;
    const top = `<div class="lesson-top">
      <button class="iconbtn" data-act="quit" aria-label="Quit">${icon('close')}</button>
      <div class="progress"><i style="width:${(doneSteps / total) * 100}%"></i></div>
      <span class="hearts ${hearts <= 1 ? 'low' : ''}">${icon('heart')}${Math.max(0, hearts)}</span></div>`;
    if (phase === 'intro') return `<div class="lesson">${top}${renderIntro()}</div>`;
    if (phase === 'end') return `<div class="lesson">${top}${renderEnd()}</div>`;
    const stepIdx = phase === 'feedback' || phase === 'animating' ? L.result.step : st.step;
    const step = session.steps[stepIdx];
    const body = step.type === 'quiz' ? renderQuiz(step) : renderTrade(step);
    return `<div class="lesson">${top}<div class="lesson-body">${body}</div>${renderFooter(step)}</div>${modal ? renderModal() : ''}`;
  }

  function renderIntro() {
    const s = L.session, def = L.def;
    const unit = def.practice ? null : TT.UNITS.find((u) => u.id === def.unit);
    const trades = s.steps.filter((x) => x.type === 'trade').length;
    const bg = newsFor(s, null, s.cps[0]);
    return `<div class="lesson-body intro">
      <div class="intro-head">${mascot('happy', 100)}<div class="bubble">${def.practice ? 'A random real chart. Trade what you see!' : esc(def.brief)}</div></div>
      <h1>${esc(s.title)}</h1>
      ${unit ? `<p class="skill">${icon('chart')} ${esc(def.skill)}</p>` : ''}
      <div class="facts">
        <div><small>Token</small><b>${esc(tokenName(s))}</b></div>
        <div><small>Chart</small><b>${INTERVAL_NAME[s.series.interval]}</b></div>
        <div><small>Starting cash</small><b>${F.money(E.START_CASH)}</b></div>
        <div><small>Decisions</small><b>${trades} + ${s.steps.length - trades} quizzes</b></div>
      </div>
      ${bg.length ? `<div class="card news"><h3>${icon('news')} Background</h3>${bg.slice(-4).map((n) => `<p><time>${newsDate(n, s.series.interval)}</time>${esc(n.text)}</p>`).join('')}</div>` : ''}
      <div class="card rules"><h3>Rules</h3><ul>
        <li><b>Decisions are final.</b> No undo — but you can replay the whole scenario afterwards.</li>
        <li>You trade at each candle's close. Fees 0.1%, plus slippage that grows with volatility. Stops fill at the trigger, or worse on gaps and crash candles.</li>
        <li>Spot only: no leverage, no shorting. Lose all ${E.HEARTS} hearts or 60% of the account and the lesson ends.</li>
      </ul></div>
    </div>
    <div class="footer"><div class="footer-in"><span></span><button class="btn primary big" data-act="begin">Start</button></div></div>`;
  }

  function portfolioStrip(i) {
    const { st, session } = L;
    if (L.phase === 'animating' && L.result) {
      // While candles play, show the account marked to each close.
      const pt = st.curve.find((p) => p.i === i), c = session.series.c;
      if (pt) {
        const pnl = pt.eq / E.START_CASH - 1, mv = c[i] / c[L.result.i] - 1;
        return `<div class="pf"><div><small>Account</small><b>${F.money(pt.eq)}</b><em class="${pnl >= 0 ? 'up' : 'down'}">${F.pct(pnl)}</em></div>
          <div><small>Price</small><b>${priceText(session, c[i])}</b></div>
          <div><small>Since decision</small><b class="${mv >= 0 ? 'up' : 'down'}">${F.pct(mv)}</b></div>
          <div><small>When</small><b>${whenText(session, i)}</b></div></div>`;
      }
    }
    const price = session.series.c[i];
    const eq = E.equityAt(st, price);
    const pnl = eq / E.START_CASH - 1;
    const pos = st.qty * price;
    return `<div class="pf">
      <div><small>Account</small><b>${F.money(eq)}</b><em class="${pnl >= 0 ? 'up' : 'down'}">${F.pct(pnl)}</em></div>
      <div><small>Cash</small><b>${F.money(st.cash)}</b></div>
      <div><small>Position</small><b>${F.money(pos)}</b><em>${Math.round((pos / eq) * 100)}% in</em></div>
      <div><small>Stop</small><b>${st.stop && st.qty > 0 ? priceText(session, st.stop.price) : '—'}</b><em>${st.stop && st.qty > 0 ? E.stopById[st.stop.id].label : ''}</em></div>
    </div>`;
  }

  function chartBlock(i) {
    const s = L.session, f = E.features(s.series, i);
    return `<div class="chart-card card">
      <div class="chart-head"><b>${esc(tokenName(s))}</b><span class="muted">${INTERVAL_NAME[s.series.interval]}</span><span class="price">${priceText(s, s.series.c[i])}</span></div>
      <canvas id="chart" class="chart"></canvas>
      <div class="chart-legend"><span><i class="sw s20"></i>20-bar avg</span><span><i class="sw s50"></i>50-bar avg</span>
        <span>RSI <b>${f.rsi != null ? Math.round(f.rsi) : '—'}</b></span><span>ATR <b>${F.pctAbs(f.atrPct)}</b></span><span class="muted">${whenText(s, i)}</span></div>
    </div>`;
  }

  function renderQuiz(step) {
    const q = step.quiz, res = L.phase === 'feedback' ? L.result : null;
    const i = L.session.cps[step.cp];
    return `<div class="q-kind">${esc(q.kind)}</div>
      <h2 class="prompt">${esc(q.prompt)}</h2>
      ${chartBlock(i)}
      <div class="options">${q.options.map((o, k) => {
        let cls = L.sel.choice === k ? 'sel' : '';
        if (res) cls = k === q.answer ? 'right' : k === res.choice ? 'wrong' : 'dim';
        return `<button class="opt ${cls}" data-act="choice" data-id="${k}" ${res ? 'disabled' : ''}><kbd>${k + 1}</kbd>${esc(o)}</button>`;
      }).join('')}</div>`;
  }

  function renderTrade(step) {
    const { session, st } = L;
    const k = step.cp, n = session.cps.length;
    const fb = L.phase === 'feedback' || L.phase === 'animating';
    const i = fb ? L.upto : step.i;
    const prev = k > 0 ? session.cps[k - 1] : null;
    const news = k === 0 ? newsFor(session, null, step.i).slice(-3) : newsFor(session, prev, step.i);
    const avail = fb ? [] : E.available(st, session.series, step.i);
    const curStop = st.stop && st.qty > 0 ? st.stop.id : 'none';
    const selStop = L.sel.stop || curStop;
    return `<div class="q-kind">Decision ${k + 1} of ${n} · ${whenText(session, step.i)}</div>
      ${portfolioStrip(i)}
      ${chartBlock(i)}
      ${fb ? '' : `<div class="card news"><h3>${icon('news')} ${k === 0 ? 'Headlines' : 'Since your last decision'}</h3>
        ${session.blind ? '<p class="muted">Headlines are hidden in blind mode.</p>'
          : news.length ? news.map((x) => `<p><time>${newsDate(x, session.series.interval)}</time>${esc(x.text)}</p>`).join('') : '<p class="muted">No major headlines.</p>'}</div>
      <h2 class="prompt">${mascot('happy', 34)} What's your move?</h2>
      <div class="tiles">${E.ACTIONS.map((a, idx) => `<button class="tile ${a.kind} ${L.sel.action === a.id ? 'sel' : ''}" data-act="action" data-id="${a.id}" ${avail.includes(a.id) ? '' : 'disabled'}>
          <kbd>${idx + 1}</kbd>${icon(a.id)}<b>${a.label}</b><small>${a.sub}</small></button>`).join('')}</div>
      <div class="stops"><span>Protective stop</span><div class="chips">${E.STOPS.map((s) => `<button class="chip ${selStop === s.id ? 'sel' : ''}" data-act="stop" data-id="${s.id}">${s.label}</button>`).join('')}</div>
        <small class="muted">${selStop === 'none' ? 'No stop: you ride every move.' : selStop === curStop && L.sel.stop == null ? 'Keeps your current stop.' : `Sets a sell ${E.stopById[selStop].trail ? 'that trails 10% under the highest close' : `at ${priceText(session, session.series.c[step.i] * (1 - E.stopById[selStop].pct))}`}.`}</small></div>`}`;
  }

  function renderFooter(step) {
    if (L.phase === 'animating') return `<div class="footer"><div class="footer-in"><span class="muted pulse">The market is moving…</span><button class="btn primary big" disabled>Check</button></div></div>`;
    if (L.phase === 'feedback') return renderSheet();
    const ready = step.type === 'quiz' ? L.sel.choice != null : !!L.sel.action;
    return `<div class="footer"><div class="footer-in"><span class="muted small">${step.type === 'trade' ? 'Decisions are final' : ''}</span>
      <button class="btn primary big" data-act="check" ${ready ? '' : 'disabled'}>Check</button></div></div>`;
  }

  function renderSheet() {
    const r = L.result, s = L.session;
    if (r.type === 'quiz') {
      return `<div class="sheet ${r.correct ? 'good' : 'bad'}"><div class="sheet-in">
        <div class="sheet-head">${icon(r.correct ? 'check' : 'cross', 'badge')}<div><h2>${r.correct ? 'Correct!' : 'Not quite'}</h2>${r.correct ? `<span class="xp">+${r.xp} XP</span>` : '<span class="xp">−1 heart</span>'}</div></div>
        <p>${esc(r.explain)}</p>
        <button class="btn ${r.correct ? 'primary' : 'danger'} big wide" data-act="continue">Continue</button></div></div>`;
    }
    const g = E.GRADES[r.grade], cls = gradeClass(r.grade);
    const stopEv = r.events.find((e) => e.type === 'stop');
    const a = E.actionById[r.action];
    const alts = r.alts.slice().sort((x, y) => y.eq - x.eq);
    const good = r.notes.filter((n) => n.pts > 0), bad = r.notes.filter((n) => n.pts < 0);
    return `<div class="sheet ${cls}"><div class="sheet-in">
      <div class="sheet-head">${mascot(g.mood, 56)}<div><h2>${g.label}${r.grade === 'excellent' ? '!' : r.grade === 'blunder' ? '!' : ''}</h2>
        <span class="xp">${[r.xp ? `+${r.xp} XP` : '', r.heart ? '−1 heart' : ''].filter(Boolean).join(' · ')}</span></div>
        <div class="score"><b>${r.score}</b><small>process ${r.proc} · outcome ${r.outcome}</small></div></div>
      <div class="happened">
        <div><small>You chose</small><b>${a.label}${r.stop !== 'none' ? ` · ${E.stopById[r.stop].label} stop` : ''}</b></div>
        <div><small>Price, to ${whenText(s, r.to)}</small><b class="${r.move >= 0 ? 'up' : 'down'}">${F.pct(r.move)}</b></div>
        <div><small>Your account</small><b class="${r.eqAfter >= r.eqBefore ? 'up' : 'down'}">${F.signedMoney(r.eqAfter - r.eqBefore)}</b></div>
      </div>
      ${stopEv ? `<p class="event">Your stop triggered at ${priceText(s, stopEv.trigger)} and filled at ${priceText(s, stopEv.fill)}${stopEv.gap ? ' — price gapped through it' : stopEv.fast ? ' — it slipped in a crash candle' : ''}. You're back in cash.</p>` : ''}
      ${r.verdict ? `<p class="verdict">${esc(r.verdict)}</p>` : ''}
      <div class="why">
        ${good.map((n) => `<p class="plus">${icon('check')}<span>${esc(n.text)}</span></p>`).join('')}
        ${bad.map((n) => `<p class="minus">${icon('cross')}<span>${esc(n.text)}</span></p>`).join('')}
        ${!r.notes.length ? '<p class="muted">No strong signal either way at this point — a judgment call.</p>' : ''}
      </div>
      ${r.coach ? `<div class="coach">${mascot('happy', 30)}<p><b>Coach's read:</b> ${esc(r.coach.why)}</p></div>` : ''}
      <details class="alts"><summary>Compare every choice over the same candles</summary>
        ${alts.map((x) => `<div class="alt ${x.id === r.action ? 'me' : ''}"><span>${x.label}${x.id === r.action ? ' (you)' : ''}</span><b class="${x.eq >= r.eqBefore ? 'up' : 'down'}">${F.money(x.eq)}</b></div>`).join('')}
        <small class="muted">Hindsight comparison with your stop setting. Grades weigh process 65%, outcome 35%.</small>
      </details>
      <button class="btn ${cls === 'bad' ? 'danger' : cls === 'warn' ? 'warn' : 'primary'} big wide" data-act="continue">Continue</button>
    </div></div>`;
  }

  function renderEnd() {
    const { session, st, ended } = L;
    const sum = ended.sum;
    const def = L.def;
    const failed = st.failed;
    const title = failed === 'hearts' ? 'Out of hearts' : failed === 'account' ? 'Account blown' : 'Lesson complete!';
    const trades = st.results.filter((r) => r.type === 'trade');
    const name = session.symbol.replace(/USDT$/, '');
    const period = `${TT.fmtTime(sum.from, '1d', true)} → ${TT.fmtTime(sum.to, '1d', true)}`;
    const reveal = def.practice
      ? `This was <b>${name}</b>, ${period}. Over the same stretch, buying and holding returned ${F.pct(sum.hodl)}.`
      : `${esc(def.reveal)}`;
    return `<div class="lesson-body end">
      <div class="center">${mascot(failed ? 'sad' : sum.stars === 3 ? 'party' : 'happy', 120)}</div>
      <h1 class="center ${failed ? 'down' : 'gold-text'}">${title}</h1>
      ${failed ? `<p class="center muted">${failed === 'hearts' ? 'Too many poor decisions in one run.' : 'The account fell below 40% of where it started.'} Replay the scenario and try a different plan.</p>` : ''}
      ${!failed ? `<div class="bigstars">${[1, 2, 3].map((n) => `<i class="${sum.stars >= n ? 'on' : ''}">${I.star}</i>`).join('')}</div>` : ''}
      <div class="end-tiles">
        <div class="et gold"><small>Total XP</small><b>${icon('bolt')}${sum.xp}</b></div>
        <div class="et blue"><small>Avg score</small><b>${sum.avg}</b></div>
        <div class="et ${sum.ret >= sum.hodl ? 'green' : 'red'}"><small>You vs HODL</small><b>${F.pct(sum.ret, 0)}</b><em>HODL ${F.pct(sum.hodl, 0)}</em></div>
      </div>
      <div class="card stats-list">
        <div><span>Final account</span><b>${F.money(sum.equity)}</b></div>
        <div><span>Worst drawdown</span><b>${F.pctAbs(sum.maxDD)}</b></div>
        <div><span>Trades · fees paid</span><b>${sum.trades} · ${F.money(sum.fees)}</b></div>
        <div><span>Quizzes</span><b>${sum.quizRight}/${sum.quizTotal}</b></div>
      </div>
      ${ended.achievements.length ? `<div class="card achv-new">${ended.achievements.map((a) => `<p>${icon('trophy', 'gold')} <b>Achievement unlocked:</b> ${esc(a.title)}</p>`).join('')}</div>` : ''}
      ${ended.streakUp ? `<div class="card streak-up">${icon('flame', 'orange')} <b>${S.streakNow()}-day streak!</b></div>` : ''}
      <div class="card reveal"><h3>The reveal</h3><p>${reveal}</p>${def.lesson ? `<p class="lesson-line"><b>Takeaway:</b> ${esc(def.lesson)}</p>` : ''}</div>
      <div class="card"><h3>Your decisions</h3>
        ${trades.map((r) => `<div class="dec"><span class="gchip g-${r.grade}">${E.GRADES[r.grade].label}</span><span class="grow">${whenText(session, r.i)} · ${E.actionById[r.action].label}${r.stop !== 'none' ? ` + ${E.stopById[r.stop].label}` : ''}</span><b class="${r.eqAfter >= r.eqBefore ? 'up' : 'down'}">${F.signedMoney(r.eqAfter - r.eqBefore)}</b></div>`).join('')}
      </div>
    </div>
    <div class="footer"><div class="footer-in">
      <button class="btn secondary big" data-act="replay">${icon('replay')} Replay scenario</button>
      <button class="btn primary big" data-act="done">Continue</button></div></div>`;
  }

  function afterLessonRender() {
    const c = document.getElementById('chart');
    if (!c) return;
    if (chart) chart.ro.disconnect();
    chart = new TT.Chart(c);
    drawChart();
    if (L.phase === 'feedback') {
      const sheet = document.querySelector('.sheet');
      if (sheet) requestAnimationFrame(() => sheet.classList.add('in'));
    }
  }

  function drawChart() {
    if (!chart) return;
    const { session, st } = L;
    const i = currentIndex();
    const res = L.result;
    const decision = L.phase === 'step' ? null : res && res.type === 'trade' ? res.i : null;
    chart.set({
      series: session.series, upto: i, blind: session.blind, scale: scaleOf(session),
      trades: st.trades.filter((t) => t.i <= i), stop: st.stop && st.qty > 0 ? st.stop.price : null, decisionAt: decision,
    });
  }

  function commit() {
    const { session, st } = L;
    const step = session.steps[st.step];
    let ans, res;
    if (step.type === 'quiz') {
      ans = { choice: L.sel.choice };
      res = E.answerQuiz(session, st, ans.choice);
    } else {
      const curStop = st.stop && st.qty > 0 ? st.stop.id : 'none';
      ans = { action: L.sel.action, stop: L.sel.stop || curStop };
      res = E.answerTrade(session, st, ans.action, ans.stop);
    }
    L.active.answers.push(ans);
    S.setActive(L.active); // committed: a reload resumes after this answer
    L.result = res;
    if (res.type === 'trade') animate(res);
    else { L.phase = 'feedback'; TT.sound.play(res.correct ? 'correct' : 'wrong'); render(); }
  }

  function animate(res) {
    L.phase = 'animating';
    L.upto = res.i;
    render();
    const bars = res.to - res.i;
    const per = Math.max(18, Math.min(70, 1600 / bars));
    let last = performance.now();
    const tick = (now) => {
      if (!L || L.phase !== 'animating') return;
      if (now - last >= per) {
        last = now;
        L.upto++;
        drawChart();
        const pf = document.querySelector('.pf');
        if (pf) pf.outerHTML = portfolioStrip(L.upto);
      }
      if (L.upto < res.to) requestAnimationFrame(tick);
      else {
        L.phase = 'feedback';
        const cls = gradeClass(res.grade);
        TT.sound.play(cls === 'good' ? 'correct' : cls === 'warn' ? 'okay' : 'wrong');
        render();
      }
    };
    requestAnimationFrame(tick);
  }

  function cont() {
    const { st } = L;
    if (st.done || st.failed) { endLesson(); render(); return; }
    L.phase = 'step';
    L.sel = {};
    L.result = null;
    render();
    window.scrollTo(0, 0);
  }

  function endLesson() {
    const sum = E.summary(L.session, L.st);
    const out = S.finish(L.key, sum, L.st);
    L.ended = { sum, ...out };
    L.phase = 'end';
    TT.sound.play(L.st.failed ? 'fail' : 'complete');
  }

  // ---------- theme ----------
  function applyTheme() {
    const t = S.setting('theme');
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  }

  // ---------- events ----------
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    if (el.dataset.act === 'close-modal' && e.target.closest('[data-stop]') && !e.target.closest('button')) return;
    const act = el.dataset.act, id = el.dataset.id;
    if (el.tagName === 'INPUT') return;
    switch (act) {
      case 'tab': tab = id; modal = null; render(); window.scrollTo(0, 0); break;
      case 'guide': modal = { type: 'guide', id }; render(); break;
      case 'node': modal = { type: 'node', id }; TT.sound.play('tap'); render(); break;
      case 'close-modal': modal = null; render(); break;
      case 'start': {
        const act0 = S.get().active;
        if (act0 && act0.key !== id) S.setActive(null);
        startLesson(id, true);
        break;
      }
      case 'resume': startLesson(S.get().active.key, true); break;
      case 'practice': {
        const act0 = S.get().active;
        if (act0 && act0.key !== 'practice') { modal = { type: 'confirm', title: 'Forfeit your lesson?', body: 'You have a lesson in progress. Starting practice ends that attempt.', yes: 'Forfeit and practice', act: 'practice-force' }; render(); break; }
        startLesson('practice', true);
        break;
      }
      case 'practice-force': S.setActive(null); startLesson('practice', false); break;
      case 'begin': L.phase = 'step'; render(); break;
      case 'choice': if (L.phase === 'step') { L.sel.choice = +id; TT.sound.play('tap'); render(); } break;
      case 'action': if (L.phase === 'step') { L.sel.action = id; TT.sound.play('tap'); render(); } break;
      case 'stop': if (L.phase === 'step') { L.sel.stop = id; TT.sound.play('tap'); render(); } break;
      case 'check': if (L.phase === 'step') commit(); break;
      case 'continue': cont(); break;
      case 'quit':
        if (L.phase === 'end' || L.phase === 'intro' && !L.active.answers.length) { if (L.phase !== 'end') S.setActive(null); L = null; render(); break; }
        modal = { type: 'confirm', title: 'Quit this attempt?', body: 'Decisions can\'t be undone, so quitting ends this attempt. You can replay the scenario from the start any time.', yes: 'Quit attempt', no: 'Keep trading', act: 'quit-force' };
        render();
        break;
      case 'quit-force': {
        modal = null;
        if (L.active.answers.length) { const sum = E.summary(L.session, L.st); S.finish(L.key, { ...sum, xp: L.st.xp }, { ...L.st, done: false, failed: 'quit' }); }
        else S.setActive(null);
        L = null; render();
        break;
      }
      case 'replay': { const key = L.key; S.setActive(null); startLesson(key, false); break; }
      case 'done': if (L.key === 'practice') tab = 'practice'; L = null; render(); window.scrollTo(0, 0); break;
      case 'theme': S.setting('theme', id); render(); break;
      case 'reset': modal = { type: 'confirm', title: 'Reset all progress?', body: 'XP, streak, stars and achievements will be cleared.', yes: 'Reset everything', act: 'reset-force' }; render(); break;
      case 'reset-force': S.reset(); modal = null; render(); break;
    }
  });

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.act === 'set') { S.setting(el.dataset.id, el.checked); render(); }
  });

  document.addEventListener('keydown', (e) => {
    if (!L || modal || e.metaKey || e.ctrlKey || e.altKey) return;
    const click = (sel) => { const b = document.querySelector(sel); if (b && !b.disabled) b.click(); };
    if (e.key === 'Enter') {
      e.preventDefault();
      click(L.phase === 'intro' ? '[data-act="begin"]' : L.phase === 'feedback' ? '[data-act="continue"]' : L.phase === 'end' ? '[data-act="done"]' : '[data-act="check"]');
    } else if (/^[1-9]$/.test(e.key) && L.phase === 'step') {
      const n = +e.key - 1;
      const btns = document.querySelectorAll('[data-act="choice"], [data-act="action"]');
      if (btns[n] && !btns[n].disabled) btns[n].click();
    }
  });

  render();
})();
