// Boot, main loop, and the menus: title (with the attract-mode demo behind it), pause, game over, high
// scores, achievements, how to play and options.
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

  // A lost GL context (driver reset, GPU switch) cannot be patched up in place; start over when it returns.
  $('#gl').addEventListener('webglcontextlost', (e) => e.preventDefault());
  $('#gl').addEventListener('webglcontextrestored', () => location.reload());

  const DEFAULTS = { master: 80, music: 55, sfx: 80, bloom: 2, grid: 'hi', res: 'full', autofire: false };
  const opts = Object.assign({}, DEFAULTS, GW.store.get('options', {}));
  let scores = GW.store.get('scores', []);

  const audio = new GW.Sound();
  const input = new GW.Input($('#gl'));
  const hud = new GW.HUD($('#hud'));
  const game = new GW.Game(audio);
  const ach = new GW.Achievements((a) => {
    toast('Achievement unlocked', a.name, a.desc);
    audio.play('achieve');
  });

  let state = 'title'; // title | playing | paused | over
  let current = null;  // visible screen id
  let stack = [];
  let lastRank = -1;

  game.onEvent = (name, data) => {
    if (game.demo) return;
    ach.event(name, data);
  };

  // ---- settings ---------------------------------------------------------------------------------------

  const CYCLES = {
    bloom: { label: 'Glow', values: [[2, 'High'], [1, 'Low'], [0, 'Off']] },
    grid: { label: 'Grid detail', values: [['hi', 'High'], ['lo', 'Normal']] },
    res: { label: 'Resolution', values: [['full', 'Full'], ['balanced', 'Balanced'], ['perf', 'Performance']] },
    autofire: { label: 'Mouse fire', values: [[false, 'Hold button'], [true, 'Automatic']] },
  };

  function applyOptions() {
    R.bloom = opts.bloom;
    input.autofire = opts.autofire;
    audio.setVolumes({ master: opts.master / 100, music: opts.music / 100, sfx: opts.sfx / 100 });
    GW.store.set('options', opts);
    resize();
  }

  function renderOptions() {
    for (const el of $$('[data-opt]')) {
      const k = el.dataset.opt;
      if (el.type === 'range') el.value = opts[k];
      else {
        const c = CYCLES[k];
        const v = c.values.find((x) => x[0] === opts[k]) || c.values[0];
        el.innerHTML = `<span>${c.label}</span><em>${v[1]}</em>`;
      }
    }
  }

  function cycle(el, dir) {
    const k = el.dataset.opt;
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
    scores = [];
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
    const first = focusables()[0];
    if (first && !(id === 'over' && !$('#name-form').hidden)) first.focus({ preventScroll: true });
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
    const rows = scores.map((s, i) => `<tr class="${i === lastRank ? 'new' : ''}"><td>${i + 1}</td><td>${esc(s.name)}</td><td>${GW.fmt(s.score)}</td><td>${fmtTime(s.time || 0)}</td></tr>`);
    $('#score-rows').innerHTML = rows.join('') || '<tr><td class="empty" colspan="4">No scores yet. Go set one.</td></tr>';
  }

  function renderAchievements() {
    const got = ach.got;
    $('#ach-count').textContent = `${Object.keys(got).length} of ${GW.ACHIEVEMENTS.length} unlocked`;
    $('#ach-list').innerHTML = GW.ACHIEVEMENTS.map((a) => `<li class="${got[a.id] ? 'got' : ''}"><b>${a.name}</b><span>${a.desc}</span></li>`).join('');
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
      txt.innerHTML = `<b style="color:${GW.css(d.col)}">${d.name}</b><i>${d.points}${type === 'blackhole' ? '+' : ''}</i><span>${d.desc}</span>`;
      li.appendChild(txt);
      list.appendChild(li);
      GW.drawEnemyIcon(cv, type, 56);
    }
  }

  function toast(kind, title, body) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<small>${esc(kind)}</small><b>${esc(title)}</b>${body ? `<span>${esc(body)}</span>` : ''}`;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), 4300);
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
  }

  function pause() {
    if (state !== 'playing') return;
    state = 'paused';
    input.gameKeys = false;
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
  }

  function toTitle() {
    state = 'title';
    input.gameKeys = false;
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
    const entry = { name, score: game.score, time: game.stats.frames, mult: game.stats.maxMult, date: Date.now() };
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
  $('#ui').addEventListener('mouseover', (ev) => {
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
    if (state === 'playing') {
      if (e.code === 'Escape' || e.code === 'KeyP') { e.preventDefault(); pause(); }
      return;
    }
    if (!current) return;
    const c = e.code;
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
      } else if (k === 'Pad1') {
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
    game.draw(R, { gridHi: opts.grid === 'hi' });
    hud.draw(game, state === 'playing' || state === 'paused' || state === 'over', input, bestScore());
    updateTouchUi();
  }

  applyOptions();
  audio.music.start('title');
  show('title');
  requestAnimationFrame(frame);

  // Exposed for debugging from the console.
  GW.debug = { game, audio, input, R, hud, opts, state: () => state };
})();
