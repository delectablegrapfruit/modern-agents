// Lull — Shapes in the page (js/shapes.js is the rules): the Shapes tab of the New board window (its chips and the
// Custom line), the Custom shapes window (a row for each group of 1 to 12 blocks, Clusters and Big; a group's view to
// pick shapes by page, by shuffle or by drawing one), and the view half (the turn the trays draw a piece in, a longer
// first Next slot for a long piece, a few of the set's pieces on the floor of the New board preview).
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Pieces, Recipe, Render, Shapes, UI } = L;
  if (!Recipe || !Shapes || !UI) return;
  const h = UI.h;
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const fmt = (n) => n.toLocaleString('en-US');

  // ---- the view half: trays and the preview ---------------------------------------------------------------------------

  /** A tray cell's size for a turn of a type in a box of bw × bh px, at most max. */
  const fitIn = (t, rot, bw, bh, max) => { const b = t.rotBounds[rot]; return Math.min(max, bw / b.w, bh / b.h); };
  /** The first Next slot's length along dir, in tray cells, for a turn: today's (2.5 down, 3.4 across) or half the piece. */
  const slotFor = (t, rot, dir) => Math.max(dir === 'h' ? 3.4 : 2.5, Math.ceil((dir === 'h' ? t.rotBounds[rot].w : t.rotBounds[rot].h) / 2));

  /** The previews' sample: the first pieces the set deals (a fixed stream), laid side by side on the floor. */
  const SAMPLES = new Map();
  function sampleFloor(shapes, w, h) {
    const key = JSON.stringify(shapes) + '|' + w + '|' + h;
    if (SAMPLES.has(key)) return SAMPLES.get(key);
    const c = Shapes.compile(shapes), out = [];
    if (c) {
      const rng = new L.RNG('preview');
      let bag = [], x = 0;
      for (let i = 0; i < 6 && x < w; i++) {
        if (!bag.length || bag[0][0] === '~') bag = Shapes.round(c, rng, bag);
        const id = Shapes.resolve(bag.shift(), c, rng), t = id && Pieces.get(id);
        if (!t) continue;
        const rot = Shapes.spawnRot(t, w), b = t.rotBounds[rot];
        if (x + b.w > w || b.h > h) break;
        for (const [cx, cy] of t.rots[rot]) out.push([x + cx - b.minX, cy - b.minY]);
        x += b.w + 1;
      }
    }
    SAMPLES.set(key, out);
    if (SAMPLES.size > 40) SAMPLES.delete(SAMPLES.keys().next().value);
    return out;
  }

  /** The size a tray draws a turn of a piece's blocks at: queue slot i (0 the first, grown to the turn), or Hold (-1). */
  function trayCell(t, r, view, i) {
    const lay = view.lay, s = lay.ts, dir = lay.nextDir || 'v';
    if (i < 0) { const hb = lay.hold; return fitIn(t, r, hb.w - 12, Math.max(hb.h, slotFor(t, r, 'v') * s) - 12, s * 0.72); }
    const max = s * (i === 0 ? 0.62 : 0.46);
    if (dir === 'h') return fitIn(t, r, (i === 0 ? slotFor(t, r, 'h') : 2.8) * s - 12, lay.next.h - 12, max);
    return fitIn(t, r, lay.next.w - 12, (i === 0 ? slotFor(t, r, 'v') : 1.95) * s - 12, max);
  }
  /** The turn a tray draws a piece in: the one it appears in, unless another's blocks are more than a quarter larger. */
  function trayTurn(t, view, i) {
    const spawn = Shapes.spawnRot(t, view.game.w);
    let best = spawn, bs = trayCell(t, spawn, view, i);
    const keep = bs;
    for (let r = 0; r < 4; r++) { const v = trayCell(t, r, view, i); if (v > bs + 1e-9) { bs = v; best = r; } }
    return keep >= 0.8 * bs ? spawn : best;
  }

  Recipe.viewPart({
    key: 'shapes', order: 10,
    // Hold and Next draw a piece in the turn it appears in, or in the one with the largest blocks in its box when that
    // one's are more than a quarter larger (a long bar on end in a tall slot).
    trayRot(e, view) {
      const t = Pieces.get(e.id), g = view.game;
      if (!t || !g || !view.lay || !view.lay.next) return null;
      return trayTurn(t, view, e === g.hold ? -1 : Math.max(0, g.queue.indexOf(e)));
    },
    // A long piece's first Next slot (and Hold box) is half its length, in tray cells, when that is longer than today's.
    traySlot(e, view, slot, dir) {
      const t = Pieces.get(e.id);
      if (!t) return null;
      return Math.ceil((dir === 'h' ? t.rotBounds[e.rot || 0].w : t.rotBounds[e.rot || 0].h) / 2);
    },
    // Next shows the first piece alone when the one after it would be drawn under 3 px a block (12 blocks on a phone):
    // one piece, legibly, rather than specks.
    nextCount(view) {
      const g = view.game, lay = view.lay;
      const t2 = g && lay && lay.next && g.queue[1] && Pieces.get(g.queue[1].id);
      return t2 && trayCell(t2, trayTurn(t2, view, 1), view, 1) < 3 ? 1 : null;
    },
    // The New board preview: the set's first pieces, faint, on the floor of the well (what the shapes are, to the board's scale).
    preview(ctx, geom, recipe, theme) {
      if (geom.style !== 'well' || !recipe || !recipe.shapes || recipe.shapes.preset === 'normal') return;
      const cells = sampleFloor(recipe.shapes, geom.w, geom.h), c = geom.c;
      if (!cells.length || c < 2) return;
      ctx.fillStyle = theme.accent;
      ctx.globalAlpha = 0.5;
      const gap = c >= 5 ? 1 : 0;
      for (const [x, y] of cells) ctx.fillRect(geom.x + x * c + gap, geom.y + (geom.h - 1 - y) * c + gap, c - gap * 2 || c, c - gap * 2 || c);
    },
  });

  // ---- the New board window: the Shapes tab ---------------------------------------------------------------------------

  /** A sample piece drawn fitted in a square canvas of px (cell: its blocks' size, px/4 by default). */
  function drawSample(ctx, px, look, id, cell) {
    Render.drawPieceIn(ctx, { id, rot: sampleRot(id) }, { x: 0, y: 0, w: px, h: px }, cell || Math.max(4, Math.floor(px / 4)), look);
  }
  /** Frantic's sample: a mix, a tromino, a domino and a block, at a tetromino's block size. */
  function drawMix(ctx, px, look) {
    const c = Math.max(3, Math.floor(px / 4)), ox = Math.round((px - 4 * c) / 2), oy = Math.round((px - 3 * c) / 2);
    const cells = [[0, 1, 10], [0, 2, 10], [1, 2, 10], [3, 0, 12], [3, 1, 12], [2, 0, 13]];
    for (const [x, y, k] of cells) Render.drawCell(ctx, look.skin, look.color(k), ox + x * c, oy + y * c, c, 1);
  }
  const sampleRot = (id) => { const t = Pieces.get(id); return t ? Shapes.spawnRot(t, 99) : 0; };
  const CLUSTER_SAMPLE = () => Pieces.clusterType([[0, 0], [1, 1], [2, 1], [1, 2]]).id;

  // The Custom set last made in this window (and in this session), so Custom comes back as it was after a detour.
  let lastCustom = null;
  const seenPreset = new WeakMap();

  Recipe.uiPart({
    key: 'shapes', order: 10, tab: 'shapes',
    chips: [
      { value: 'tiny', name: 'Tiny', piece: 'V3' },
      { value: 'frantic', name: 'Frantic', sample: (ctx, px, look) => drawMix(ctx, px, look) },
      { value: 'pentominoes', name: 'Pentominoes', piece: 'F' },
      { value: 'big', name: 'Big', sample: (ctx, px, look) => drawSample(ctx, px, look, 'BO', Math.max(3, Math.floor(px * 0.19))) },
      { value: 'custom', name: 'Custom', sample: (ctx, px, look) => drawSample(ctx, px, look, CLUSTER_SAMPLE()) },
    ],
    said: (path, v) => (path === 'shapes.custom' && v ? Shapes.describe(Shapes.normalize({ preset: 'custom', custom: v }).custom) : null),
    // Custom: what it deals, and Edit (the Custom shapes window).
    panel(r, api) {
      const was = seenPreset.get(api);
      seenPreset.set(api, r.shapes.preset);
      if (r.shapes.preset !== 'custom') return null;
      if (was && was !== 'custom' && lastCustom && JSON.stringify(lastCustom) !== JSON.stringify(r.shapes.custom)) {
        // Back to Custom: as it was made (after this redraw, never inside it).
        const want = clone(lastCustom);
        Promise.resolve().then(() => { if (api.recipe.shapes.preset === 'custom') api.choose('shapes.custom', want); });
      } else lastCustom = clone(r.shapes.custom);
      const text = Shapes.describe(r.shapes.custom);
      return h('div', { class: 'nb-custom' },
        h('span', { title: text }, text.charAt(0).toUpperCase() + text.slice(1)),
        h('button', { type: 'button', class: 'btn sm', 'data-focus': 'shapes-edit', onclick: () => openCustom(api.app, r.shapes.custom, (c) => { lastCustom = clone(c); api.choose('shapes.custom', c); }) }, 'Edit'));
    },
  });

  // ---- the Custom shapes window -----------------------------------------------------------------------------------------

  const groupName = (n) => n + (n === 1 ? ' block' : ' blocks');
  const narrow = () => !!(root.matchMedia && root.matchMedia('(max-width: 359px)').matches);
  const perRow = () => (narrow() ? 5 : 6);

  /**
   * The Custom shapes window, over New board: a row for each group of 1 to 12 blocks (on or off; All or how many are
   * picked), Clusters (from–to blocks) and Big (Less, Even, More or All). A row's button opens its view: the weight
   * (Less, Even, More: 7, 14 or 28 of a round) and, for a group, its shapes to pick (All, a page at a time; Picked;
   * Shuffle, a random page, for a group of more than 60; Draw, for 6 blocks and more). The last source that is on stays
   * on. Done gives the set to onDone; Cancel changes nothing.
   */
  function openCustom(app, custom, onDone) {
    const c = clone(Shapes.normalize({ preset: 'custom', custom }).custom || Shapes.CUSTOM_DEFAULT);
    // Every group's settings, on or off (so a group turned off and on again keeps its picks).
    const groups = {};
    for (let n = 1; n <= Shapes.MAX_N; n++) groups[n] = { n, on: false, weight: 'even', picks: [] };
    for (const g of c.groups) Object.assign(groups[g.n], { on: true, weight: g.weight, picks: (g.picks || []).slice() });
    const cl = Object.assign({ on: !!c.clusters, min: 3, max: 5, weight: 'even' }, c.clusters || {});
    const big = { on: c.big !== 'off', weight: c.big === 'off' ? 'even' : c.big };
    const look = UI.lookWith(app), lk = { skin: look.skin, color: (k) => look.colors[k], colors: look.colors, t: 0, alpha: 1 };
    const live = h('div', { class: 'sp-live', 'aria-live': 'polite' });
    const body = h('div', { class: 'sp-body' });
    let view = { kind: 'list' }, handle = null;

    const sources = () => Object.values(groups).filter((g) => g.on).length + (cl.on ? 1 : 0) + (big.on ? 1 : 0);
    const picksTotal = () => Object.values(groups).reduce((a, g) => a + (g.on ? g.picks.length : 0), 0);
    const result = () => ({
      groups: Object.values(groups).filter((g) => g.on).map((g) => Object.assign({ n: g.n, weight: g.weight }, g.picks.length ? { picks: g.picks.slice() } : {})),
      clusters: cl.on ? { min: cl.min, max: cl.max, weight: cl.weight } : undefined,
      big: big.on ? big.weight : 'off',
    });
    const say = (t) => { live.textContent = t; };

    const canvas = (px, id, rot) => UI.canvasFor(px, px, (ctx) => { if (id) Render.drawPieceIn(ctx, { id, rot: rot == null ? sampleRot(id) : rot }, { x: 0, y: 0, w: px, h: px }, Math.max(3, Math.floor(px / 5)), lk); });
    /** A checkbox row's box (role checkbox): the last source that is on is off-limits. */
    const check = (on, name, toggle, focus) => h('button', {
      type: 'button', role: 'checkbox', class: 'sp-check', 'aria-checked': String(on), 'data-focus': focus,
      'aria-disabled': on && sources() <= 1 ? 'true' : null, title: on && sources() <= 1 ? 'One source stays on' : null,
      onclick: () => { if (on && sources() <= 1) { say('One source stays on'); return; } toggle(); draw(focus); },
    }, h('span', { class: 'bx', 'aria-hidden': 'true', html: on ? L.Icons.icon('check') : '' }), h('span', { class: 'nm' }, name));
    const more = (text, label, open, focus) => h('button', { type: 'button', class: 'sp-more', 'aria-label': label, 'data-focus': focus, onclick: open }, h('span', null, text), h('span', { class: 'ch', 'aria-hidden': 'true', html: L.Icons.icon('chevRight') }));

    /** A segmented choice (How often: Less | Even | More [| All]), its name beside it. */
    const seg = (label, values, cur, pick, focus) => h('div', { class: 'sp-segrow' }, h('span', { class: 'sp-lab', 'aria-hidden': 'true' }, label),
      h('div', { class: 'seg sp-seg', role: 'group', 'aria-label': label }, values.map((v) => h('button', {
        type: 'button', 'aria-pressed': String(v === cur), 'data-focus': focus + '-' + v, onclick: () => { pick(v); say(label + ' ' + Shapes.WEIGHT_NAMES[v]); draw(focus + '-' + v); },
      }, Shapes.WEIGHT_NAMES[v]))));

    // ---- the list ----
    function listView() {
      const rows = [];
      for (let n = 1; n <= Shapes.MAX_N; n++) {
        const g = groups[n], sample = Shapes.SMALL[n] ? Shapes.SMALL[n][n === 4 ? 2 : 0] : null;
        rows.push(h('div', { class: 'sp-row' + (g.on ? ' on' : '') },
          check(g.on, groupName(n), () => { g.on = !g.on; say(groupName(n) + (g.on ? ' on' : ' off')); }, 'g' + n),
          h('span', { class: 'sp-sample', 'aria-hidden': 'true' }, canvas(28, sample || sampleOf(n))),
          g.on ? more(g.picks.length ? g.picks.length + ' picked' : 'All', groupName(n) + ': ' + (g.picks.length ? g.picks.length + ' picked' : 'all') + ', ' + Shapes.WEIGHT_NAMES[g.weight], () => go({ kind: 'group', n }), 'm' + n) : h('span', { class: 'sp-more-off' })));
      }
      const clText = cl.min === cl.max ? String(cl.min) : cl.min + '–' + cl.max;
      rows.push(h('div', { class: 'sp-row' + (cl.on ? ' on' : '') },
        check(cl.on, 'Clusters', () => { cl.on = !cl.on; say('Clusters' + (cl.on ? ' on' : ' off')); }, 'cl'),
        h('span', { class: 'sp-sample', 'aria-hidden': 'true' }, canvas(28, CLUSTER_SAMPLE())),
        cl.on ? more(clText, 'Clusters: ' + clText + ' blocks, ' + Shapes.WEIGHT_NAMES[cl.weight], () => go({ kind: 'clusters' }), 'mcl') : h('span', { class: 'sp-more-off' })));
      rows.push(h('div', { class: 'sp-row' + (big.on ? ' on' : '') },
        check(big.on, 'Big', () => { big.on = !big.on; say('Big' + (big.on ? ' on' : ' off')); }, 'big'),
        h('span', { class: 'sp-sample', 'aria-hidden': 'true' }, canvas(28, 'BT')),
        big.on ? more(Shapes.WEIGHT_NAMES[big.weight], 'Big: ' + Shapes.WEIGHT_NAMES[big.weight], () => go({ kind: 'big' }), 'mbig') : h('span', { class: 'sp-more-off' })));
      return [h('div', { class: 'sp-list', role: 'group', 'aria-label': 'Sources' }, rows)];
    }
    /** A group's sample: its first shape (groups of 6 and more; one enumeration walk, cached). */
    const SAMPLE_IDS = {};
    function sampleOf(n) {
      if (!SAMPLE_IDS[n]) { const k = { 6: 5, 7: 20, 8: 60, 9: 200, 10: 700, 11: 2500, 12: 9000 }[n] || 0; SAMPLE_IDS[n] = Shapes.page(n, k, 1)[0]; }
      return SAMPLE_IDS[n];
    }

    // ---- a sub-view's top: Back and its name ----
    const top = (name) => h('div', { class: 'sp-top' },
      h('button', { type: 'button', class: 'btn sm ghost sp-back', 'data-focus': 'back', onclick: () => back() }, h('span', { class: 'ch', 'aria-hidden': 'true', html: L.Icons.icon('chevLeft') }), 'Back'),
      h('b', { class: 'sp-name' }, name));

    // ---- clusters and big ----
    function clustersView() {
      const step = (label, key, lo, hi) => {
        const val = h('span', { class: 'sp-num', 'aria-live': 'off' }, String(cl[key]));
        const set = (v) => {
          v = Math.max(lo(), Math.min(hi(), v));
          if (v === cl[key]) return;
          cl[key] = v;
          say(label + ' ' + v);
          draw(key + (v > +val.textContent ? '+' : '-'));
        };
        return h('div', { class: 'sp-step', role: 'group', 'aria-label': label },
          h('span', { class: 'sp-lab' }, label),
          h('button', { type: 'button', class: 'icon-btn sp-pm', 'aria-label': 'Fewer: ' + label, 'data-focus': key + '-', 'aria-disabled': String(cl[key] <= lo()), html: L.Icons.icon('minus'), onclick: () => set(cl[key] - 1) }),
          val,
          h('button', { type: 'button', class: 'icon-btn sp-pm', 'aria-label': 'More: ' + label, 'data-focus': key + '+', 'aria-disabled': String(cl[key] >= hi()), html: L.Icons.icon('plus'), onclick: () => set(cl[key] + 1) }));
      };
      return [top('Clusters'),
        seg('How often', ['less', 'even', 'more'], cl.weight, (v) => { cl.weight = v; }, 'w'),
        h('div', { class: 'sp-steps' }, step('From', 'min', () => 2, () => cl.max), step('To', 'max', () => cl.min, () => 8)),
        h('div', { class: 'sp-samples', 'aria-hidden': 'true' }, clusterSamples())];
    }
    const clusterSamples = () => {
      const rng = new L.RNG('clusters' + cl.min + cl.max), out = [];
      for (let i = 0; i < 6; i++) out.push(canvas(40, Pieces.clusterType(Shapes.cluster(rng, cl.min, cl.max)).id));
      return out;
    };
    function bigView() {
      const pool = Object.values(groups).filter((g) => g.on && g.n <= 5).map((g) => g.n);
      return [top('Big'),
        seg('How often', ['less', 'even', 'more', 'all'], big.weight, (v) => { big.weight = v; }, 'w'),
        h('p', { class: 'sp-note' }, big.weight === 'all' ? 'Every piece doubled' : 'Doubled pieces of ' + (pool.length ? pool.join(', ') + (pool.length === 1 && pool[0] === 1 ? ' block' : ' blocks') : 'the seven'))];
    }

    // ---- a group ----
    function groupView(n) {
      const g = groups[n], total = Shapes.count(n);
      const tabs = ['all', 'picked'].concat(total > 60 ? ['shuffle'] : []).concat(n >= 6 ? ['draw'] : []);
      if (!tabs.includes(view.tab)) view.tab = n >= 9 ? 'shuffle' : 'all';
      const TAB_NAMES = { all: 'All', picked: 'Picked', shuffle: 'Shuffle', draw: 'Draw' };
      const tabRow = h('div', { class: 'seg sp-tabs', role: 'group', 'aria-label': 'Show' }, tabs.map((t) => h('button', {
        type: 'button', 'aria-pressed': String(view.tab === t), 'data-focus': 'tab-' + t,
        onclick: () => { if (t === 'shuffle') view.seed = (Math.random() * 4294967296) >>> 0; view.tab = t; view.page = 0; draw('tab-' + t); },
      }, TAB_NAMES[t])));
      const status = h('div', { class: 'sp-status' },
        h('span', null, g.picks.length ? g.picks.length + ' picked' : 'All ' + fmt(total) + (total === 1 ? ' shape' : ' shapes')),
        g.picks.length ? h('button', { type: 'button', class: 'btn sm ghost', 'data-focus': 'clear', onclick: () => { g.picks = []; say('All ' + groupName(n)); draw('clear'); } }, 'Clear') : null);
      const out = [top(groupName(n)), seg('How often', ['less', 'even', 'more'], g.weight, (v) => { g.weight = v; }, 'w'), tabRow];
      // Draw: what is drawn so far, Erase and Add, over the grid (in reach on a small phone); else what is picked.
      if (view.tab === 'draw') out.push(...drawView(n));
      else out.push(status, ...gridView(n));
      return out;
    }
    /** The page of shapes a tab shows: [{ key, id, k }]. */
    function shownIds(n) {
      const g = groups[n], total = Shapes.count(n), per = total > 60 ? (perRow() === 6 ? 48 : 45) : total;
      if (view.tab === 'picked') return { list: g.picks.map((key) => ({ key, id: Shapes.idOfKey(key) })), pages: 1 };
      if (view.tab === 'shuffle') {
        const rng = new L.RNG(view.seed || 1), seen = new Set(), list = [];
        for (let i = 0; i < 200 && list.length < Math.min(per, total); i++) { const k = rng.int(total); if (!seen.has(k)) { seen.add(k); list.push({ k }); } }
        return { list, pages: 1, lazy: true };
      }
      const pages = Math.ceil(total / per), page = Math.max(0, Math.min(pages - 1, view.page || 0));
      view.page = page;
      const start = page * per, len = Math.min(per, total - start);
      if (n <= 8) return { list: Shapes.page(n, start, len).map((id) => ({ id })), pages, page };
      return { list: Array.from({ length: len }, (_, i) => ({ k: start + i })), pages, page, lazy: true, start };
    }
    function gridView(n) {
      const g = groups[n], shown = shownIds(n);
      const cap = picksTotal() >= Shapes.MAX_PICKS;
      const buttons = [];
      const grid = h('div', { class: 'sp-grid', role: 'group', 'aria-label': groupName(n), style: { gridTemplateColumns: 'repeat(' + perRow() + ', 44px)' } });
      const fill = (item, b) => {
        if (!item.id) item.id = Shapes.idOfCells(Shapes.poly(n, item.k));
        const t = Pieces.get(item.id);
        item.key = item.key || Shapes.canon(t.rots[0]);
        const on = g.picks.includes(item.key);
        b.setAttribute('aria-pressed', String(on));
        b.setAttribute('aria-disabled', !on && cap ? 'true' : 'false');
        b.dataset.key = item.key;
        b.replaceChildren(canvas(40, item.id));
      };
      shown.list.forEach((item, i) => {
        const label = 'Shape ' + (item.k != null ? fmt(item.k + 1) : fmt((shown.start || 0) + i + 1));
        const b = h('button', { type: 'button', class: 'sp-shape', 'aria-label': label, 'aria-pressed': 'false', tabindex: i === (view.focus || 0) ? '0' : '-1', 'data-i': String(i), 'data-focus': 'shape-' + i,
          onclick: () => {
            if (!b.dataset.key) return;
            const key = b.dataset.key, at = g.picks.indexOf(key);
            if (at >= 0) g.picks.splice(at, 1);
            else if (picksTotal() >= Shapes.MAX_PICKS) { say(Shapes.MAX_PICKS + ' picks at most'); return; }
            else { g.picks.push(key); if (!g.on) g.on = true; }
            view.focus = i;
            say(g.picks.length ? g.picks.length + ' picked' : 'All ' + groupName(n));
            if (view.tab === 'picked') draw('shape-' + Math.min(i, g.picks.length - 1)); else refreshGrid();
          } });
        buttons.push(b);
        grid.appendChild(b);
        if (!shown.lazy) fill(item, b);
      });
      // Groups of 9 blocks and more: 8 thumbnails a frame, so a page never holds the window up.
      if (shown.lazy) {
        let i = 0;
        const step = () => { if (!grid.isConnected && i > 0) return; for (let k = 0; k < 8 && i < buttons.length; k++, i++) fill(shown.list[i], buttons[i]); if (i < buttons.length) requestAnimationFrame(step); };
        step();
      }
      const refreshGrid = () => {
        const capNow = picksTotal() >= Shapes.MAX_PICKS;
        buttons.forEach((b) => { if (!b.dataset.key) return; const on = g.picks.includes(b.dataset.key); b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-disabled', !on && capNow ? 'true' : 'false'); });
        const st = body.querySelector('.sp-status span');
        if (st) st.textContent = g.picks.length ? g.picks.length + ' picked' : 'All ' + fmt(Shapes.count(n)) + ' shapes';
        const had = !!body.querySelector('.sp-status .btn');
        if (had !== !!g.picks.length) draw('shape-' + (view.focus || 0));
      };
      grid.addEventListener('keydown', (e) => {
        const i = buttons.indexOf(document.activeElement);
        if (i < 0) return;
        const cols = perRow();
        const j = { ArrowRight: i + 1, ArrowLeft: i - 1, ArrowDown: i + cols, ArrowUp: i - cols, Home: 0, End: buttons.length - 1 }[e.key];
        if (e.key === 'PageDown' || e.key === 'PageUp') {
          if (shown.pages > 1) { view.page = (view.page || 0) + (e.key === 'PageDown' ? 1 : -1); view.page = Math.max(0, Math.min(shown.pages - 1, view.page)); view.focus = 0; draw('shape-0'); say('Page ' + (view.page + 1) + ' of ' + shown.pages); }
          e.preventDefault(); e.stopPropagation(); return;
        }
        if (j == null || j < 0 || j >= buttons.length) return;
        e.preventDefault(); e.stopPropagation();
        buttons[i].tabIndex = -1; buttons[j].tabIndex = 0; buttons[j].focus(); view.focus = j;
      });
      const out = [shown.list.length ? grid : h('p', { class: 'sp-empty' }, view.tab === 'picked' ? 'None picked' : 'None')];
      if (shown.pages > 1) {
        const pg = (d) => { view.page = Math.max(0, Math.min(shown.pages - 1, view.page + d)); view.focus = 0; draw(d < 0 ? 'prev' : 'next'); say('Page ' + (view.page + 1) + ' of ' + shown.pages); };
        out.push(h('div', { class: 'sp-pages' },
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Previous page', 'data-focus': 'prev', 'aria-disabled': String(view.page <= 0), html: L.Icons.icon('chevLeft'), onclick: () => { if (view.page > 0) pg(-1); } }),
          h('span', null, fmt(view.page + 1) + ' / ' + fmt(shown.pages)),
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Next page', 'data-focus': 'next', 'aria-disabled': String(view.page >= shown.pages - 1), html: L.Icons.icon('chevRight'), onclick: () => { if (view.page < shown.pages - 1) pg(1); } })));
      }
      if (view.tab === 'shuffle') out.push(h('div', { class: 'sp-pages' }, h('button', { type: 'button', class: 'btn sm', 'data-focus': 'again', onclick: () => { view.seed = (Math.random() * 4294967296) >>> 0; view.focus = 0; draw('again'); } }, 'Shuffle again')));
      return out;
    }

    // ---- drawing a shape ----
    function drawView(n) {
      const g = groups[n], side = Math.min(12, Math.max(n, 6)), px = Math.max(20, Math.floor(248 / side));
      const on = view.drawn || (view.drawn = new Set());
      let cur = view.cursor || 0;
      const cells = () => Array.from(on).map((i) => [i % side, side - 1 - Math.floor(i / side)]);
      const status = h('div', { class: 'sp-draw-status', 'aria-live': 'polite' });
      const add = h('button', { type: 'button', class: 'btn sm primary', 'data-focus': 'add', onclick: () => {
        const r = verdict();
        if (!r.ok) return;
        g.picks.push(r.key); g.on = true; on.clear();
        say('Added. ' + g.picks.length + ' picked');
        draw('draw');
      } }, 'Add');
      const verdict = () => {
        const c = cells(), r = Shapes.checkDrawn(c, n);
        let text = '';
        if (!c.length) text = 'Draw ' + groupName(n);
        else if (r.why) text = r.why;
        else if (c.length !== n) text = c.length + ' of ' + groupName(n);
        else if (g.picks.includes(r.key)) { text = 'Picked already'; r.ok = false; }
        else if (picksTotal() >= Shapes.MAX_PICKS) { text = Shapes.MAX_PICKS + ' picks at most'; r.ok = false; }
        else text = groupName(n);
        return Object.assign(r, { text });
      };
      const cellEls = [];
      const grid = h('div', { class: 'sp-draw', tabindex: '0', role: 'group', 'aria-label': 'Draw ' + groupName(n) + ': arrows move, Space fills or clears', 'data-focus': 'draw',
        style: { gridTemplateColumns: 'repeat(' + side + ', ' + px + 'px)', gridAutoRows: px + 'px' } });
      for (let i = 0; i < side * side; i++) { const d = h('div', { class: 'sp-dc' }); cellEls.push(d); grid.appendChild(d); }
      const show = () => {
        cellEls.forEach((d, i) => { d.classList.toggle('on', on.has(i)); d.classList.toggle('cur', i === cur && grid === document.activeElement); });
        const r = verdict();
        status.textContent = r.text;
        status.className = 'sp-draw-status' + (r.why ? ' bad' : r.ok ? ' ok' : '');
        add.disabled = !r.ok;
      };
      let paint = null;
      const at = (e) => { const r = grid.getBoundingClientRect(), x = Math.floor((e.clientX - r.left) / px), y = Math.floor((e.clientY - r.top) / px); return x >= 0 && y >= 0 && x < side && y < side ? y * side + x : -1; };
      const apply = (i) => { if (i < 0) return; if (paint) on.add(i); else on.delete(i); cur = view.cursor = i; show(); };
      grid.addEventListener('pointerdown', (e) => { const i = at(e); if (i < 0) return; paint = !on.has(i); grid.setPointerCapture(e.pointerId); apply(i); e.preventDefault(); });
      grid.addEventListener('pointermove', (e) => { if (paint === null) return; apply(at(e)); });
      const end = () => { paint = null; };
      grid.addEventListener('pointerup', end); grid.addEventListener('pointercancel', end);
      grid.addEventListener('focus', show); grid.addEventListener('blur', show);
      grid.addEventListener('keydown', (e) => {
        const x = cur % side, y = Math.floor(cur / side);
        const to = { ArrowRight: [x + 1, y], ArrowLeft: [x - 1, y], ArrowDown: [x, y + 1], ArrowUp: [x, y - 1] }[e.key];
        if (to) { cur = view.cursor = Math.max(0, Math.min(side - 1, to[1])) * side + Math.max(0, Math.min(side - 1, to[0])); show(); }
        else if (e.key === ' ' || e.key === 'Enter') { if (on.has(cur)) on.delete(cur); else on.add(cur); show(); }
        else return;
        e.preventDefault(); e.stopPropagation();
      });
      const clear = h('button', { type: 'button', class: 'btn sm ghost', 'data-focus': 'erase', onclick: () => { on.clear(); show(); } }, 'Erase');
      show();
      return [h('div', { class: 'sp-draw-row' }, status, clear, add), h('div', { class: 'sp-drawer' }, grid)];
    }

    // ---- views ----
    function go(v) { view = Object.assign({ kind: 'list' }, v); draw('back'); }
    function back() { const from = view; view = { kind: 'list' }; draw(from.kind === 'group' ? 'm' + from.n : from.kind === 'clusters' ? 'mcl' : 'mbig'); }
    function draw(focus) {
      const kids = view.kind === 'group' ? groupView(view.n) : view.kind === 'clusters' ? clustersView() : view.kind === 'big' ? bigView() : listView();
      const keepScroll = view.kind === 'list' && body.dataset.kind === 'list' ? handle && handle.el.querySelector('.body').scrollTop : 0;
      body.dataset.kind = view.kind;
      body.replaceChildren(...kids.filter(Boolean), live);
      if (handle) {
        const sc = handle.el.querySelector('.body');
        sc.scrollTop = keepScroll || 0;
        // Focus stays in the window (outside it, Escape and Enter would reach the window under it).
        const f = focus && body.querySelector('[data-focus="' + CSS.escape(focus) + '"]');
        if (f && !f.disabled) f.focus();
        if (!handle.el.contains(document.activeElement) || document.activeElement === handle.el) {
          const first = body.querySelector('button:not(:disabled):not([aria-disabled="true"]), [tabindex="0"]');
          if (first) first.focus(); else handle.el.focus();
        }
      }
    }
    draw();
    let done = false;
    handle = UI.openModal({
      title: 'Custom shapes', icon: 'group-shape', cls: 'modal-shapes', body,
      buttons: [{ label: 'Cancel' }, { label: 'Done', kind: 'primary', onClick: () => { done = true; onDone(Shapes.normalize({ preset: 'custom', custom: result() }).custom); } }],
    });
    // Enter on a button presses it (Done elsewhere); Escape in a view goes back to the list.
    handle.el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.closest('button') && !e.target.closest('.btn.primary')) e.stopPropagation();
      if (e.key === 'Escape' && view.kind !== 'list') { e.stopPropagation(); e.preventDefault(); back(); }
    });
    const first = body.querySelector('.sp-check');
    if (first) first.focus();
    handle.sp = { get view() { return view; }, result, go, back, groups, cl, big, draw };
    openCustom.last = handle;
    return handle;
  }

  Shapes.openCustom = openCustom;
})(typeof globalThis !== 'undefined' ? globalThis : this);
