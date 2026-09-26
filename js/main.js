// Boot, main loop, and the menus: title (with the attract-mode demo behind it), Help and Options (controls,
// how to play, options), pause, game over with name entry, high scores and achievements.
'use strict';
(function () {
  const GW = window.GW;
  const $ = (s) => document.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));

  let R;
  try {
    R = new GW.Renderer($('#gl'));
  } catch (err) {
    const f = $('#fatal');
    f.hidden = false;
    f.textContent = 'Geometry Wars needs WebGL 2, which this browser or device does not provide (' + err.message + ').';
    return;
  }

  // A lost GL context (driver reset, GPU switch, a backgrounded mobile tab): pause, since the player cannot see
  // anything, and when it comes back rebuild the renderer on the same canvas so the run carries on.
  $('#gl').addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    pause();
  });
  $('#gl').addEventListener('webglcontextrestored', () => {
    try {
      R = new GW.Renderer($('#gl'));
    } catch (err) {
      location.reload(); // could not rebuild: starting over beats a dead screen
      return;
    }
    applyOptions(); // bloom level and render-target size
  });

  const DEFAULTS = { master: 80, music: 55, sfx: 80, bloom: 2, grid: 'hi', res: 'full' };
  const opts = Object.assign({}, DEFAULTS, GW.store.get('options', {}));
  // Mouse fire mode now lives with the other controls settings; an older build kept it here as a boolean.
  const legacyAutofire = opts.autofire === true;
  delete opts.autofire;

  // The PC table ships pre-filled with enemy names, so nearly every game earns a place.
  const SEED = [
    ['WANDERER', 50000], ['GRUNT', 40000], ['WEAVER', 30000], ['SPINNER', 25000], ['SNAKE', 20000],
    ['BLACK HOLE', 15000], ['REPULSOR', 10000], ['PROTON', 7500], ['MAYFLY', 5000], ['TINY SPINNER', 2500],
  ];
  const seedScores = () => SEED.map(([name, score]) => ({ name, score }));
  // Keep only well-formed rows from storage (hand-edited or damaged tables would otherwise throw every frame).
  let scores = GW.store.get('scores', []);
  scores = (Array.isArray(scores) ? scores : [])
    .filter((s) => s && typeof s === 'object' && typeof s.score === 'number' && Number.isFinite(s.score))
    .map((s) => Object.assign({}, s, { name: String(s.name ?? '') }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  if (!scores.length) {
    scores = seedScores();
    GW.store.set('scores', scores);
  }

  const audio = new GW.Sound();
  const input = new GW.Input($('#gl'));
  // Carry an old "Mouse fire: Automatic" choice over to Controls unless Controls already has its own.
  if (legacyAutofire && (GW.store.get('controls', null) || {}).autofire === undefined && input.setControl) {
    input.setControl('autofire', 'auto');
  }
  const hud = new GW.HUD($('#hud'));
  const game = new GW.Game(audio);
  const ach = new GW.Achievements((a) => {
    toast('Achievement unlocked', a.name);
    audio.play('achieve');
  });

  let state = 'title'; // title | playing | paused | over
  let current = null;  // visible screen id
  let stack = [];
  let lastRank = -1;

  // Achievements are polled each step (ach.check), so game events need no handler here.
  game.onEvent = () => {};
  input.onPause = () => pause();

  // ---- settings ---------------------------------------------------------------------------------------

  const CYCLES = {
    bloom: { label: 'Glow', values: [[2, 'High'], [1, 'Low'], [0, 'Off']] },
    grid: { label: 'Grid detail', values: [['hi', 'High'], ['lo', 'Normal']] },
    res: { label: 'Resolution', values: [['full', 'Full'], ['balanced', 'Balanced'], ['perf', 'Performance']] },
    fullscreen: { label: 'Fullscreen', values: [[false, 'Off'], [true, 'On']] }, // follows the browser; not saved
  };

  function applyOptions() {
    R.bloom = opts.bloom;
    audio.setVolumes({ master: opts.master / 100, music: opts.music / 100, sfx: opts.sfx / 100 });
    GW.store.set('options', opts);
    resize();
  }

  const optValue = (k) => (k === 'fullscreen' ? !!document.fullscreenElement : opts[k]);

  function renderOptions() {
    for (const el of $$('[data-opt]')) {
      const k = el.dataset.opt;
      if (el.type === 'range') el.value = opts[k];
      else {
        const c = CYCLES[k];
        const v = c.values.find((x) => x[0] === optValue(k)) || c.values[0];
        el.innerHTML = `<span>${c.label}</span><em>${v[1]}</em>`;
      }
    }
  }

  // Fullscreen, with Esc held by the page (where the browser allows it) so it pauses instead of leaving.
  const fsButton = $('[data-opt=fullscreen]');
  if (fsButton && !document.documentElement.requestFullscreen) fsButton.hidden = true;
  function setFullscreen(on) {
    const d = document;
    if (on && !d.fullscreenElement) {
      const p = d.documentElement.requestFullscreen();
      if (p && p.then) {
        p.then(() => navigator.keyboard?.lock?.(['Escape']).catch(() => {}))
          .catch(() => toast('Fullscreen', 'Not available here'))
          .finally(renderOptions);
      }
    } else if (!on && d.fullscreenElement) {
      navigator.keyboard?.unlock?.();
      const p = d.exitFullscreen();
      if (p && p.catch) p.catch(() => {}).finally(renderOptions);
    }
  }
  document.addEventListener('fullscreenchange', () => { if (current === 'options') renderOptions(); });

  function cycle(el, dir) {
    const k = el.dataset.opt;
    if (k === 'fullscreen') {
      setFullscreen(!document.fullscreenElement);
      audio.play('menu');
      return;
    }
    const vals = CYCLES[k].values;
    let i = vals.findIndex((x) => x[0] === opts[k]);
    i = (i + dir + vals.length) % vals.length;
    opts[k] = vals[i][0];
    renderOptions();
    applyOptions();
    audio.play('menu');
  }

  for (const el of $$('[data-opt]')) {
    if (el.type === 'range') {
      el.addEventListener('input', () => { opts[el.dataset.opt] = +el.value; applyOptions(); });
      el.addEventListener('change', () => audio.play('menu'));
    } else el.addEventListener('click', () => cycle(el, 1));
  }

  $('#reset-data').addEventListener('click', () => {
    if (!confirm('Erase all high scores and achievements?')) return;
    scores = seedScores();
    lastRank = -1;
    GW.store.set('scores', scores);
    ach.reset();
    toast('Reset', 'Scores and achievements erased');
  });

  // ---- screens ----------------------------------------------------------------------------------------

  function show(id) {
    current = id;
    for (const s of $$('.screen')) s.classList.toggle('active', s.id === 'scr-' + id);
    if (id === 'scores') renderScores();
    if (id === 'achievements') renderAchievements();
    if (id === 'howto') renderHowto();
    if (id === 'options') renderOptions();
    if (id === 'controls') {
      if (GW.renderControls) GW.renderControls(input);
      else renderControlsFallback();
    }
    const first = focusables()[0];
    if (first && !(id === 'over' && !$('#name-form').hidden)) first.focus({ preventScroll: true });
    const scr = $('#scr-' + id);
    if (scr) scr.scrollTop = 0; // long pages (How to Play on a phone) always open at the top
    updateTouchUi();
  }

  function go(id) {
    stack.push(current);
    show(id);
  }

  function back() {
    const prev = stack.pop();
    if (prev) show(prev);
    audio.play('menu');
  }

  function hideAll() {
    stack = [];
    current = null;
    for (const s of $$('.screen')) s.classList.remove('active');
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    updateTouchUi();
  }

  function focusables() {
    if (!current) return [];
    const scr = $('#scr-' + current);
    return $$('button, input', scr).filter((el) => el.offsetParent !== null && !el.disabled);
  }

  function moveFocus(d) {
    const items = focusables();
    if (!items.length) return;
    let i = items.indexOf(document.activeElement);
    i = i < 0 ? 0 : (i + d + items.length) % items.length;
    items[i].focus({ preventScroll: false });
    audio.play('menu');
  }

  function adjust(d) {
    const el = document.activeElement;
    if (!el || !el.dataset) return false;
    // Controls-page cycles belong to js/controls-ui.js; anything but an explicit false counts as handled.
    if (el.dataset.ctl && GW.adjustControl) return GW.adjustControl(el, d) !== false;
    if (el.type === 'range') {
      el.value = +el.value + d * 5;
      el.dispatchEvent(new Event('input'));
      audio.play('menu');
      return true;
    }
    if (el.classList.contains('cycle')) { cycle(el, d); return true; }
    return false;
  }

  function renderScores() {
    const rows = scores.map((s, i) => `<tr class="${i === lastRank ? 'new' : ''}"><td>${i + 1}</td><td>${esc(s.name)}</td><td>${GW.fmt(s.score)}</td></tr>`);
    $('#score-rows').innerHTML = rows.join('') || '<tr><td class="empty" colspan="3">No scores yet. Go set one.</td></tr>';
  }

  function renderAchievements() {
    const got = ach.got;
    const n = GW.ACHIEVEMENTS.filter((a) => got[a.id]).length;
    $('#ach-count').textContent = `${n} of ${GW.ACHIEVEMENTS.length} unlocked`;
    $('#ach-list').innerHTML = GW.ACHIEVEMENTS.map((a) => `<li class="${got[a.id] ? 'got' : ''}"><i class="ring" aria-hidden="true"></i><div><b>${esc(a.name)}</b><span>${esc(a.desc)}</span></div></li>`).join('');
  }

  // Only used when js/controls-ui.js (the rebinding page) is absent: a read-only list of the default controls.
  function renderControlsFallback() {
    const root = $('#controls-root');
    if (!root || root.childElementCount) return;
    const rows = [
      ['Move', 'W A S D'],
      ['Fire', 'Hold the left mouse button (aims at the cursor) · arrow keys · I J K L'],
      ['Bomb', 'Space · E · right mouse button'],
      ['Pause', 'Esc · P'],
      ['Sound', 'M mutes'],
      ['Gamepad', 'Movement: Left stick<br>Firing: Right stick<br>Bomb: Triggers<br>Pause: Start', 'gap'],
      ['Touch', 'Left thumb moves, right thumb fires, BOMB button bombs'],
    ];
    root.innerHTML = `<table class="ctl-fallback">${rows.map(([k, v, c]) => `<tr${c ? ` class="${c}"` : ''}><th>${k}</th><td>${v}</td></tr>`).join('')}</table>`;
  }

  let howtoDone = false;
  function renderHowto() {
    if (howtoDone) return;
    howtoDone = true;
    const list = $('#enemy-list');
    for (const type of GW.ENEMY_ORDER) {
      const d = GW.Enemies[type];
      const li = document.createElement('li');
      const cv = document.createElement('canvas');
      li.appendChild(cv);
      const txt = document.createElement('div');
      txt.innerHTML = `<b>${d.name}</b><i>${d.points}${type === 'blackhole' ? '+' : ''}</i><span>${d.desc}</span>`;
      li.appendChild(txt);
      list.appendChild(li);
      GW.drawEnemyIcon(cv, type, 56);
    }
  }

  // Pill toast at bottom centre: ring glyph, a small grey line and a white name. Used for achievements,
  // the mute key and the reset.
  function toast(kind, title) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<i class="ring" aria-hidden="true"></i><div><small>${esc(kind)}</small><b>${esc(title)}</b></div>`;
    const box = $('#toasts');
    box.appendChild(el);
    while (box.children.length > 3) box.firstElementChild.remove(); // a burst of unlocks keeps only the newest three
    setTimeout(() => el.remove(), 4700);
  }

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtTime = (frames) => {
    const s = Math.floor(frames / 60);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  function updateTouchUi() {
    $('#touch-ui').hidden = !(input.touch.used && state === 'playing' && !current);
  }

  // ---- game flow --------------------------------------------------------------------------------------

  function startGame() {
    audio.unlock();
    hideAll();
    game.newGame(false);
    state = 'playing';
    lastRank = -1;
    input.gameKeys = true;
    input.consume();
    document.body.classList.add('playing');
    audio.setDuck(false);
    audio.music.stop();
    audio.music.start('game');
    audio.play('select');
    updateTouchUi();
    input.requestLock?.();
  }

  function pause() {
    if (state !== 'playing') return;
    state = 'paused';
    input.gameKeys = false;
    input.releaseLock?.();
    document.body.classList.remove('playing');
    audio.setDuck(true);
    audio.hum(0);
    audio.play('pause');
    show('pause');
  }

  function resume() {
    if (state !== 'paused') return;
    state = 'playing';
    input.gameKeys = true;
    hideAll();
    input.consume();
    document.body.classList.add('playing');
    audio.setDuck(false);
    audio.play('select');
    updateTouchUi();
    input.requestLock?.();
  }

  function toTitle() {
    state = 'title';
    input.gameKeys = false;
    input.releaseLock?.();
    document.body.classList.remove('playing');
    game.newGame(true);
    audio.setDuck(false);
    audio.hum(0);
    audio.music.stop();
    audio.music.start('title');
    stack = [];
    show('title');
  }

  function gameOver() {
    state = 'over';
    input.gameKeys = false;
    input.releaseLock?.();
    document.body.classList.remove('playing');
    audio.play('gameover');
    audio.setDuck(true);
    const s = game.stats;
    $('#over-score').textContent = GW.fmt(game.score);
    const kills = s.kills;
    $('#over-stats').innerHTML = [
      ['Time', fmtTime(s.frames)],
      ['Enemies destroyed', GW.fmt(kills)],
      ['Best multiplier', 'x' + s.maxMult],
      ['Bombs used', s.bombs],
    ].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    // A place in the top ten means beating row 10 of the (pre-seeded) table.
    const qualifies = game.score > 0 && (scores.length < 10 || game.score > scores[scores.length - 1].score);
    $('#name-form').hidden = !qualifies;
    $('#over-rank').textContent = qualifies ? '' : scores.length ? `Top ten needs ${GW.fmt(scores[scores.length - 1].score)}` : '';
    stack = [];
    show('over');
    if (qualifies) {
      const inp = $('#name-input');
      inp.value = GW.store.get('lastName', '');
      setTimeout(() => { inp.focus(); inp.select(); }, 50);
    }
  }

  $('#name-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const name = ($('#name-input').value.trim() || 'PLAYER').toUpperCase().slice(0, 12);
    GW.store.set('lastName', name);
    const entry = { name, score: game.score, mult: game.stats.maxMult, date: Date.now() };
    scores.push(entry);
    scores.sort((a, b) => b.score - a.score);
    scores = scores.slice(0, 10);
    GW.store.set('scores', scores);
    lastRank = scores.indexOf(entry);
    $('#name-form').hidden = true;
    $('#over-rank').textContent = lastRank >= 0 ? `Saved at #${lastRank + 1}` : '';
    audio.play('select');
    focusables()[0] && focusables()[0].focus();
  });

  const bestScore = () => (scores.length ? scores[0].score : 0);

  // Clicks inside menus.
  $('#ui').addEventListener('click', (ev) => {
    audio.unlock();
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.go) { go(b.dataset.go); audio.play('select'); }
    else if (b.hasAttribute('data-back')) back();
    else if (b.dataset.action) {
      const a = b.dataset.action;
      if (a === 'play' || a === 'restart') startGame();
      else if (a === 'resume') resume();
      else if (a === 'quit') toTitle();
    }
  });
  // Hover moves focus, but only when the pointer really moved. A menu that re-renders under a resting cursor
  // makes Chrome send mouseover (and a zero-distance mousemove) to the new element; following that would pull
  // keyboard/gamepad focus onto whatever setting the idle cursor happens to sit over.
  let lastPtr = null;
  $('#ui').addEventListener('mousemove', (ev) => {
    const moved = !lastPtr || lastPtr[0] !== ev.clientX || lastPtr[1] !== ev.clientY;
    lastPtr = [ev.clientX, ev.clientY];
    if (!moved) return;
    const b = ev.target.closest('button');
    if (b && document.activeElement !== b && !(document.activeElement && document.activeElement.id === 'name-input')) b.focus({ preventScroll: true });
  });

  $('#t-bomb').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); input.edges.add('Touch-bomb'); });
  $('#t-pause').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); pause(); });

  addEventListener('pointerdown', () => audio.unlock(), { capture: true });

  addEventListener('keydown', (e) => {
    audio.unlock();
    const typing = document.activeElement && document.activeElement.id === 'name-input';
    if (typing) {
      if (e.code === 'Escape') document.activeElement.blur();
      return;
    }
    if (e.code === 'KeyM') {
      const m = audio.toggleMute();
      toast('Sound', m ? 'Muted' : 'On');
      return;
    }
    const isPauseKey = (code) => (input.isPause ? input.isPause(code) : (code === 'Escape' || code === 'KeyP'));
    // Auto-repeat of a pause/back key must not flip pause on and off or unwind several menus at once.
    if (e.repeat && (e.code === 'Escape' || e.code === 'Backspace' || isPauseKey(e.code))) { e.preventDefault(); return; }
    if (state === 'playing') {
      if (isPauseKey(e.code)) { e.preventDefault(); pause(); }
      return;
    }
    if (!current) return;
    const c = e.code;
    // Any key bound to pause (Esc, P, or a rebinding) also resumes from the pause screen, like gamepad Start.
    if (current === 'pause' && isPauseKey(c)) { e.preventDefault(); resume(); return; }
    if (c === 'ArrowDown' || c === 'KeyS' || (c === 'Tab' && !e.shiftKey)) { e.preventDefault(); moveFocus(1); }
    else if (c === 'ArrowUp' || c === 'KeyW' || (c === 'Tab' && e.shiftKey)) { e.preventDefault(); moveFocus(-1); }
    else if (c === 'ArrowLeft' || c === 'KeyA') { if (adjust(-1)) e.preventDefault(); else if (current === 'over' || stack.length) { e.preventDefault(); moveFocus(-1); } }
    else if (c === 'ArrowRight' || c === 'KeyD') { if (adjust(1)) e.preventDefault(); else if (current === 'over' || stack.length) { e.preventDefault(); moveFocus(1); } }
    else if (c === 'Escape' || c === 'Backspace') {
      e.preventDefault();
      if (current === 'pause') resume();
      else if (stack.length) back();
    } else if ((c === 'Enter' || c === 'Space') && !focusables().includes(document.activeElement)) {
      e.preventDefault();
      moveFocus(0);
    }
  });

  function handlePad() {
    for (const k of input.menuEdges) {
      if (state === 'playing') {
        if (k === 'Pad9' || k === 'Pad8') pause();
        continue;
      }
      if (!current) continue;
      if (k === 'Pad12' || k === 'StickUp') moveFocus(-1);
      else if (k === 'Pad13' || k === 'StickDown') moveFocus(1);
      else if (k === 'Pad14' || k === 'StickLeft') { if (!adjust(-1)) moveFocus(-1); }
      else if (k === 'Pad15' || k === 'StickRight') { if (!adjust(1)) moveFocus(1); }
      else if (k === 'Pad0') {
        const el = document.activeElement;
        if (el && focusables().includes(el)) {
          if (el.id === 'name-input') $('#name-form').requestSubmit();
          else el.click();
        } else moveFocus(0);
      } else if (k === 'Pad1' || k === 'Pad8') { // B, or Back/View, goes back
        if (current === 'pause') resume();
        else if (stack.length) back();
      } else if (k === 'Pad9') {
        if (current === 'pause') resume();
        else if (current === 'title') startGame();
      }
    }
    input.menuEdges.length = 0;
  }

  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  addEventListener('blur', () => pause());

  // ---- sizing and loop --------------------------------------------------------------------------------

  function resize() {
    const cw = Math.max(1, innerWidth), ch = Math.max(1, innerHeight);
    const cap = opts.res === 'full' ? 2 : opts.res === 'balanced' ? 1.25 : 0.75;
    let dpr = Math.min(devicePixelRatio || 1, cap);
    const maxPx = opts.res === 'full' ? 4.2e6 : opts.res === 'balanced' ? 2.4e6 : 1.2e6;
    if (cw * ch * dpr * dpr > maxPx) dpr = Math.sqrt(maxPx / (cw * ch));
    const w = Math.max(1, Math.round(cw * dpr)), h = Math.max(1, Math.round(ch * dpr));
    R.resize(w, h);
    game.setViewport(w, h, dpr);
    hud.resize(cw, ch);
  }
  addEventListener('resize', resize);

  const STEP = 1000 / 60;
  let last = performance.now(), acc = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(100, now - last);
    last = now;
    input.poll();
    handlePad();
    if (state !== 'paused') {
      acc += dt;
      let n = 0;
      while (acc >= STEP && n < 4) {
        acc -= STEP;
        game.step(input);
        input.consume();
        if (state === 'playing') ach.check(game);
        n++;
      }
      if (n === 4) acc = 0;
    }
    if (state === 'playing' && game.over) gameOver();
    if (!R.gl.isContextLost()) game.draw(R, { gridHi: opts.grid === 'hi' });
    hud.draw(game, state === 'playing' || state === 'paused' || state === 'over', input, bestScore(), state === 'playing');
    updateTouchUi();
  }

  // ---- logo ---------------------------------------------------------------------------------------------

  // The wordmark is laid out around the claw at x = 0 ("GE" ends at its left, "METRY WARS" starts at its right).
  // index.html carries the numbers for Orbitron; once the real font is in, re-fit the viewBox, the gradient and
  // the subtitle to the measured text so a fallback font still gives a centred, full-sweep logo.
  const LOGO_GAP = 52.6; // claw ring radius 44.64 + clearance, in font units (font size 100)
  function fitLogo() {
    const svg = $('#logo'), ge = $('#logo-ge'), me = $('#logo-metry'), sub = $('#logo-sub'), grad = $('#gwGrad');
    if (!svg || !ge || !me || !ge.getComputedTextLength) return;
    let wGe, wMe;
    try { wGe = ge.getComputedTextLength(); wMe = me.getComputedTextLength(); } catch (err) { return; }
    if (!(wGe > 0 && wMe > 0)) return;
    const x0 = -LOGO_GAP - wGe, x1 = LOGO_GAP + wMe;
    const cs = getComputedStyle(sub);
    const fs = parseFloat(cs.fontSize) || 32, ls = parseFloat(cs.letterSpacing) || 0;
    const base = 35 + 0.72 * fs; // subtitle caps start 0.35 em below the main baseline
    svg.setAttribute('viewBox', `${(x0 - 2).toFixed(1)} -82 ${(x1 - x0 + 4).toFixed(1)} ${(base + 84).toFixed(1)}`);
    grad.setAttribute('x1', x0.toFixed(1));
    grad.setAttribute('x2', x1.toFixed(1));
    sub.setAttribute('x', ((x0 + x1) / 2 + ls / 2).toFixed(1)); // letter-spacing trails the last letter
    sub.setAttribute('y', base.toFixed(1));
  }
  fitLogo();
  if (document.fonts) {
    document.fonts.ready.then(fitLogo);
    document.fonts.addEventListener?.('loadingdone', fitLogo);
  }
  addEventListener('resize', fitLogo);

  applyOptions();
  audio.music.start('title');
  show('title');
  requestAnimationFrame(frame);

  // Exposed for debugging from the console.
  GW.debug = { game, audio, input, get R() { return R; }, hud, opts, state: () => state };
})();
