// Lull — the Play menu (PlayMode.openMenu): a page over the Play tab, opened only by hand (the Menu button under the
// board, or Esc in a browser) and never by itself. Its home is two big tiles side by side and one button under them:
//   Solo         Relaxed, Classic, Descent, Mural, then Custom (the full New board window)
//   Multiplayer  Race and Battle, against the computer
//   Manage       the library (its Solo and Multiplayer tabs)
// The X at the top right (or Esc) closes it: back to the board in play, as it was. Solo and Multiplayer are pages of
// big tiles too, one a mode, with Back beside the X.
// A mode opens a short setup with only that mode's settings (the parts' own controls, from Recipe.uiPart: a level row,
// a panel, presets, chips), then Start (Classic has Watch beside it: the computer plays, js/watch.js). Resume by rules: when a saved board still to be played has exactly these rules
// (Library.match), the setup offers "Resume: <name> (<progress>)" above Start new, and Enter resumes it; a new board is
// made only by Start (no match), Start new, or Custom. Each mode's last setup is kept (state.boards.menu).
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Library, fmtInt } = L;
  // (The page's UI is read when the menu opens, so the rules here load without a page: scripts/test.cjs.)
  const h = (...a) => L.UI.h(...a);

  /** The two areas' pictures, drawn in blocks like the places to play: one piece, and two that face each other. */
  const svg = (body) => '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + body + '</svg>';
  const blk = (x, y, s) => '<rect x="' + x + '" y="' + y + '" width="' + s + '" height="' + s + '" rx="0.7" fill="currentColor" stroke="none"/>';
  const PICS = {
    solo: svg(blk(4, 1.5, 4) + blk(4, 6, 4) + blk(4, 10.5, 4) + blk(8.5, 10.5, 4)),
    multi: svg(blk(1.25, 3.5, 3) + blk(1.25, 6.75, 3) + blk(1.25, 10, 3) + blk(4.5, 10, 3) + blk(11.75, 3.5, 3) + blk(11.75, 6.75, 3) + blk(11.75, 10, 3) + blk(8.5, 10, 3)),
  };
  const ICON_OF = { plain: 'play', classic: 'classic', descent: 'descent', mural: 'mural', race: 'race', battle: 'battle', custom: 'newBoard' };

  const SOLO = [
    { mode: 'plain', name: 'Relaxed', line: 'Endless, no clock' },
    { mode: 'classic', name: 'Classic', line: 'Pieces fall, levels rise' },
    { mode: 'descent', name: 'Descent', line: 'Break the stack that comes down' },
    { mode: 'mural', name: 'Mural', line: 'Build a picture, piece by piece' },
  ];
  const MULTI = [
    { mode: 'race', name: 'Race', line: 'First to fill the board wins' },
    { mode: 'battle', name: 'Battle', line: 'Clear rows, throw pieces' },
  ];
  const ALL = SOLO.concat(MULTI);
  const info = (mode) => ALL.find((x) => x.mode === mode) || null;
  /** The modes that are here (a part brings each one but Relaxed). */
  const here = (list) => list.filter((x) => x.mode === 'plain' || (L.Recipe && L.Recipe.parts().some((p) => p.mode === x.mode)));
  const uiOf = (mode) => (L.Recipe ? L.Recipe.uis().find((u) => u.mode === mode) : null) || null;
  const clone = (v) => JSON.parse(JSON.stringify(v));

  /** A mode's size when nothing was chosen yet: its own (Race 10 × 10, Battle 10 × 14) or Standard. */
  function firstSize(mode) {
    const own = { race: L.Race && L.Race.SIZE, battle: L.Battle && L.Battle.SIZE }[mode];
    return own ? { w: own.w, h: own.h } : { w: Library.STANDARD.w, h: Library.STANDARD.h };
  }

  /**
   * A mode's setup: as last chosen in the menu, or else that mode's settings as last chosen in New board, at its first
   * size. Normal shapes and no modifiers (Custom has those), except Relaxed's shapes, which the setup offers.
   */
  function setupOf(B, mode) {
    const R = L.Recipe, kept = B && B.menu && B.menu[mode];
    let raw = kept && kept.recipe && typeof kept.recipe === 'object' ? clone(kept.recipe) : { mode };
    if (!kept && mode !== 'plain' && B && B.recipe && B.recipe.mode === mode && B.recipe[mode]) raw = { mode, [mode]: clone(B.recipe[mode]) };
    const keep = { v: 1, mode, [mode]: raw[mode] };
    if (mode === 'plain' && raw.shapes && raw.shapes.preset !== 'custom') keep.shapes = raw.shapes;
    const recipe = R.normalize(keep);
    return { mode, recipe, size: R.clampSize((kept && kept.size) || firstSize(mode), recipe) };
  }

  /** How far a saved board has got, in a few words: a picture's pieces, a match's tally, else its lines. */
  function progress(json) {
    if (!json || typeof json !== 'object') return '';
    if (json.ended) { const u = L.Recipe && L.Recipe.uis().find((x) => x.endName && x.endName(json.ended)); return u ? u.endName(json.ended) : 'Ended'; }
    if (json.over) return 'Full';
    const ext = L.Recipe ? L.Recipe.summary(json) : {};
    if (ext.mural && ext.mural.total) return fmtInt(ext.mural.placed) + ' of ' + fmtInt(ext.mural.total) + ' placed';
    for (const [k, P] of [['race', L.Race], ['battle', L.Battle]]) {
      const e = ext[k];
      if (e && e.level && P) return 'vs ' + P.NAMES[e.level] + ' ' + (e.won || 0) + '–' + (e.lost || 0);
    }
    return 'Lines ' + fmtInt((json.s && json.s.lines) || 0);
  }

  /** A board's mode in words, short: "Relaxed" (and its shapes or modifiers), else its recipe's label ("Classic A"). */
  function modeLabel(recipe) {
    if (!L.Recipe) return 'Relaxed';
    const r = L.Recipe.normalize(recipe), lbl = L.Recipe.label(r, true);
    if (r.mode === 'plain') return lbl ? 'Relaxed · ' + lbl : 'Relaxed';
    return lbl || (info(r.mode) || { name: r.mode }).name;
  }

  /**
   * The menu, one page over the Play tab with pages: home (Solo, Multiplayer, Manage), solo, multi and a mode's setup. Esc closes it from any
   * page (Back steps back a page). One at a time: asked again, the open one stays. Returns its handle.
   */
  function open(play, startAt) {
    if (play.menuHandle && play.menuHandle.el.isConnected) return play.menuHandle;
    const app = play.app, st = app.store, R = L.Recipe;
    Library.ensure(st.state, Date.now());
    const B = () => st.state.boards;
    let handle = null, page = 'home', setup = null, memo = {};
    const body = h('div', { class: 'mn-body' });
    const foot = h('footer', { class: 'mn-foot' });
    const live = h('div', { class: 'nb-live', 'aria-live': 'polite' });
    const why = h('p', { class: 'nb-why mn-why' });
    const showWhy = (text) => { why.textContent = text || ''; if (text) live.textContent = text; };
    const close = () => { if (handle) handle.close(); };
    const lk = L.UI.lookWith(app), look = { skin: lk.skin, color: (c) => lk.colors[c], colors: lk.colors, t: 0, alpha: 1 };

    /** A big tile: a calm picture in a soft round, the name, and one short muted line. */
    const tile = (cls, pic, name, line, onclick, extra) => h('button', Object.assign({ type: 'button', class: 'mn-tile ' + cls, onclick }, extra || {}),
      h('span', { class: 'pic', 'aria-hidden': 'true', html: pic || '' }), h('b', null, name), line ? h('span', { class: 'ln' }, line) : null);
    const modeTile = (x) => tile('mn-mode', L.Icons.icon(ICON_OF[x.mode]) || L.Icons.icon('play'), x.name, x.line, () => openSetup(x.mode), { 'data-mode': x.mode });

    // ---- what the setup chooses (as the New board window does: Recipe.resolve, the last choice wins) ----
    const idOf = (path, v) => path + '=' + (typeof v === 'string' ? v : JSON.stringify(v));
    const option = (path, value, cls, kids, role) => {
      const bad = R.conflicts(setup.recipe)[idOf(path, value)] || null;
      const on = R.canon(R.getPath(setup.recipe, path)) === R.canon(value);
      return h('button', Object.assign({ type: 'button', class: cls, 'data-path': path, 'data-value': typeof value === 'string' ? value : JSON.stringify(value), 'aria-disabled': bad ? 'true' : null, 'data-tip': bad, onclick: () => choose(path, value) },
        role === 'switch' ? { role: 'switch', 'aria-checked': String(!!R.getPath(setup.recipe, path)) } : { 'aria-pressed': String(on) }), kids);
    };
    const remember = () => { B().menu[setup.mode] = { recipe: clone(setup.recipe), size: { w: setup.size.w, h: setup.size.h } }; st.touch(); };
    const choose = (path, value) => {
      const bad = R.conflicts(setup.recipe)[idOf(path, value)];
      if (bad) { showWhy(bad); return; }
      const next = clone(setup.recipe);
      R.setPath(next, path, value);
      const res = R.resolve(next, path, memo);
      memo = res.memo;
      setup.recipe = res.recipe;
      setup.size = R.clampSize(setup.size, setup.recipe);
      showWhy('');
      remember();
      draw();
    };
    const setSize = (w, hh) => { setup.size = R.clampSize({ w, h: hh }, setup.recipe); remember(); draw(); live.textContent = Library.sizeLabel(setup.size.w, setup.size.h); };
    const api = { get recipe() { return setup.recipe; }, choose, why: showWhy, refresh: () => draw(), look, app, option, edit: null };

    const field = (label, kid, cls) => h('div', { class: 'mn-field' + (cls ? ' ' + cls : '') }, label ? h('span', { class: 'mn-lab' }, label) : null, kid);
    const levelRow = (label) => {
      const u = uiOf(setup.mode), lv = u && u.levels ? u.levels(setup.recipe) : null;
      return lv ? field(label, h('div', { class: 'nb-lvl seg', role: 'group', 'aria-label': label }, lv.values.map(([v, name]) => option(lv.path, v, 'nb-level', name)))) : null;
    };
    const presets = (list) => field('Size', h('div', { class: 'nb-presets', role: 'group', 'aria-label': 'Size', style: { gridTemplateColumns: 'repeat(' + Math.min(4, list.length) + ', minmax(0, 1fr))' } }, list.map(([name, w, hh]) => {
      const fits = R.sizeOk(w, hh, setup.recipe);
      return h('button', { type: 'button', class: 'nb-preset', 'data-w': String(w), 'data-h': String(hh), 'aria-pressed': String(w === setup.size.w && hh === setup.size.h), 'aria-disabled': fits ? null : 'true',
        onclick: () => { if (fits) setSize(w, hh); } }, h('b', null, name), h('span', null, Library.sizeLabel(w, hh)));
    })));
    const panel = () => { const u = uiOf(setup.mode); return u && u.panel ? u.panel(setup.recipe, api) : null; };
    /** Relaxed's shapes: Normal and each shapes part's chip, but Custom (that is in Custom). */
    const shapeChips = () => {
      const chips = [{ path: 'shapes.preset', value: 'normal', name: 'Normal', piece: 'T' }];
      for (const u of R.uis()) for (const c of u.chips || []) if (c.value !== 'custom' && !c.path && !(c.when && !c.when(setup.recipe))) chips.push(Object.assign({ path: 'shapes.preset' }, c));
      return field('Shapes', h('div', { class: 'nb-chips', role: 'group', 'aria-label': 'Shapes' }, chips.map((c) => option(c.path, c.value, 'nb-chip',
        [L.UI.canvasFor(28, 28, (ctx) => { if (c.sample) c.sample(ctx, 28, look); else if (c.piece) L.Render.drawPieceIn(ctx, { id: c.piece }, { x: 0, y: 0, w: 28, h: 28 }, 7, look); }), h('span', { class: 'nm' + (/\S{10,}/.test(c.name) ? ' long' : '') }, c.name)]))));
    };
    const STANDARD_PRESETS = () => [['Small', 6, 12], ['Standard', Library.STANDARD.w, Library.STANDARD.h], ['Tall', 8, 30], ['Wide', 16, 16]];
    const setupControls = () => {
      const m = setup.mode, u = uiOf(m);
      if (m === 'plain') return [presets(STANDARD_PRESETS()), shapeChips()];
      if (m === 'race' || m === 'battle') return [levelRow('Opponent'), presets((u && u.presets && u.presets(setup.recipe)) || STANDARD_PRESETS())];
      if (m === 'classic') return [levelRow('Type'), panel()];
      if (m === 'descent') return [levelRow('Level'), panel()];
      return [panel()];
    };
    /** The board these rules would resume (Library.match), or null. */
    const matchNow = () => Library.match(B(), play.boardJSON(), setup.recipe, setup.size);
    const curJSON = () => play.boardJSON();
    const jsonOf = (rec) => (rec.id === B().cur ? curJSON() : rec.game);

    const resume = (rec) => {
      if (!rec) return;
      // (The board in play while a game is watched is the one set aside for it: back to it.)
      if (rec.id === B().cur) play.unwatch();
      if (rec.id !== B().cur && !play.switchTo(rec.id)) return;
      close();
    };
    /** Watch (Classic): the bot plays these rules; the board in play waits (js/watch.js). */
    const watch = () => {
      remember();
      if (L.Watch && L.Watch.start(play, R.normalize(setup.recipe), setup.size)) close();
    };
    const start = () => {
      remember();
      const made = play.shelveAndNew({ w: setup.size.w, h: setup.size.h }, R.normalize(setup.recipe));
      if (made) close();
    };

    // ---- the pages ----
    const pages = {
      home: () => ({
        title: 'Menu',
        body: [h('div', { class: 'mn-page mn-home' },
          h('div', { class: 'mn-tiles mn-two' },
            tile('mn-solo', PICS.solo, 'Solo', here(SOLO).map((x) => x.name).join(', '), () => go('solo')),
            tile('mn-multi', PICS.multi, 'Multiplayer', here(MULTI).map((x) => x.name).join(', '), () => go('multi'))),
          h('button', { type: 'button', class: 'btn mn-manage', onclick: manage }, L.UI.icon('boards'), 'Manage'))],
        foot: null,
      }),
      solo: () => ({
        title: 'Solo', back: 'home',
        body: [h('div', { class: 'mn-page' }, h('div', { class: 'mn-tiles mn-modes' }, here(SOLO).map(modeTile),
          tile('mn-mode mn-custom', L.Icons.icon(ICON_OF.custom), 'Custom', 'Any size, shapes, modifiers and mode', custom, { 'data-mode': 'custom' })))],
        foot: null,
      }),
      multi: () => ({
        title: 'Multiplayer', back: 'home',
        body: [h('div', { class: 'mn-page' }, h('div', { class: 'mn-tiles mn-two' }, here(MULTI).map(modeTile)))],
        foot: null,
      }),
      setup: () => {
        const m = setup.mode, hit = matchNow();
        const resumeBtn = hit ? h('button', { type: 'button', class: 'btn primary mn-resume', onclick: () => resume(hit) },
          h('span', { class: 'lbl' }, 'Resume: ' + hit.name + ' (' + progress(jsonOf(hit)) + ')')) : null;
        return {
          title: (info(m) || { name: m }).name, back: Library.side(setup.recipe) === 'multi' ? 'multi' : 'solo',
          body: [h('div', { class: 'nb-body mn-setup', 'data-mode': m }, ...setupControls().filter(Boolean), why)],
          foot: [h('div', { class: 'mn-btns' }, resumeBtn,
            h('div', { class: 'mn-pair' },
              m === 'classic' && L.Watch ? h('button', { type: 'button', class: 'btn mn-watch', 'data-tip': 'The computer plays; take over any time', onclick: watch }, L.UI.icon('watch'), 'Watch') : null,
              h('button', { type: 'button', class: 'btn mn-start' + (hit ? '' : ' primary'), onclick: start }, hit ? 'Start new' : 'Start')))],
        };
      },
    };
    let backTo = null;
    const backBtn = h('button', { type: 'button', class: 'btn ghost mn-back', onclick: () => { if (backTo) go(backTo); } }, L.UI.icon('chevLeft'), 'Back');
    function openSetup(mode) { setup = setupOf(B(), mode); memo = {}; showWhy(''); go('setup'); }
    function custom() { close(); play.openNewBoard(); }
    function manage() { close(); play.openLibrary(); }
    function go(p) { const from = page; page = p; draw(true, from); }

    /** Draws the page; the control that had focus keeps it (a part's by data-focus, an option by path and value). */
    function draw(fresh, from) {
      if (!handle) return;
      const pg = pages[page]();
      const focused = !fresh && handle.el.contains(document.activeElement) ? document.activeElement : null;
      const again = focused && (focused.dataset.focus ? '[data-focus="' + CSS.escape(focused.dataset.focus) + '"]' : focused.dataset.path ? '[data-path="' + focused.dataset.path + '"]' + (focused.getAttribute('role') === 'switch' ? '' : '[data-value="' + CSS.escape(focused.dataset.value) + '"]')
        : focused.dataset.w ? '[data-w="' + focused.dataset.w + '"][data-h="' + focused.dataset.h + '"]' : focused.classList.contains('mn-start') ? '.mn-start' : focused.classList.contains('mn-back') ? '.mn-back' : null);
      handle.el.querySelector('header .ttl').textContent = pg.title;
      backTo = pg.back || null;
      backBtn.hidden = !backTo;
      handle.el.setAttribute('aria-label', pg.title);
      handle.el.dataset.page = page;
      body.replaceChildren(...pg.body.filter(Boolean), live);
      foot.replaceChildren(...(pg.foot || []).filter(Boolean));
      foot.hidden = !pg.foot;
      if (fresh) {
        body.scrollTop = 0;
        // Focus where the page starts: back on the area or mode it came from, else its first control.
        const back = from === 'solo' || from === 'multi' ? body.querySelector('.mn-' + from) : from === 'setup' && setup ? body.querySelector('[data-mode="' + setup.mode + '"]') : null;
        const first = back || (page === 'setup' ? (foot.querySelector('.btn.primary') || body.querySelector('button')) : body.querySelector('button'));
        if (first) first.focus({ preventScroll: true });
      } else if (focused) {
        const f = again && handle.el.querySelector(again);
        if (f) f.focus({ preventScroll: true });
      }
    }

    handle = L.UI.openModal({ title: 'Menu', icon: null, cls: 'modal-menu', body, onClose: () => { play.menuHandle = null; } });
    handle.el.appendChild(foot);
    // A page over the Play tab: below the title bar (which stays in sight, still), the X at the top right.
    const bar = document.getElementById('titlebar');
    handle.scrim.classList.add('mn-scrim');
    handle.scrim.style.top = (bar ? bar.offsetHeight : 0) + 'px';
    handle.el.querySelector('header').prepend(backBtn);
    // Enter on a button other than the page's primary presses that button (the app's Enter is the primary one).
    handle.el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.closest && e.target.closest('button') && !e.target.closest('.btn.primary')) e.stopPropagation(); });
    play.menuHandle = handle;
    // For the tests: the page and the setup as they stand.
    handle.menu = { get page() { return page; }, get setup() { return setup; }, go, openSetup, match: () => (setup ? matchNow() : null) };
    if (startAt && info(startAt)) openSetup(startAt); else go(startAt && pages[startAt] && startAt !== 'setup' ? startAt : 'home');
    return handle;
  }

  L.Menu = { SOLO, MULTI, open, setupOf, progress, modeLabel, firstSize };
})(typeof globalThis !== 'undefined' ? globalThis : this);
