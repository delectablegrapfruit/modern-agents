// Lull — DOM pieces: icons, toasts, modals, the Shop, Statistics, Settings, and the item pickers.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { fmt, fmtInt, fmtDuration, pct, Render, Pieces, ITEMS, ITEM_ORDER, COSMETICS, COSMETIC_LABELS, ACCENTS, Puzzles, Factory } = L;

  // ---- DOM helper ---------------------------------------------------------------------------------------------------

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'text') el.textContent = v;
        else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.appendChild(typeof kid === 'string' || typeof kid === 'number' ? document.createTextNode(String(kid)) : kid);
    }
    return el;
  }

  const ICONS = {
    play: '<svg viewBox="0 0 16 16" fill="currentColor"><rect x="1.5" y="8.5" width="4" height="4" rx="0.8"/><rect x="6" y="8.5" width="4" height="4" rx="0.8"/><rect x="10.5" y="8.5" width="4" height="4" rx="0.8"/><rect x="6" y="4" width="4" height="4" rx="0.8"/></svg>',
    puzzle: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2" y="2" width="5" height="5" rx="0.8" fill="currentColor" stroke="none"/><rect x="9" y="9" width="5" height="5" rx="0.8" fill="currentColor" stroke="none"/><rect x="9" y="2" width="5" height="5" rx="0.8" stroke-dasharray="1.6 1.4"/><rect x="2" y="9" width="5" height="5" rx="0.8" stroke-dasharray="1.6 1.4"/></svg>',
    factory: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 14.5V7.2l4 2.3V7.2l4 2.3V3h1.8v-1.5h1.6V3h1.6v11.5z"/></svg>',
    shop: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M3 5.5h10l-.8 8.5H3.8z"/><path d="M5.8 5.5V4.3a2.2 2.2 0 0 1 4.4 0v1.2"/></svg>',
    classic: '<svg viewBox="0 0 16 16" fill="currentColor"><rect x="6" y="1.5" width="4" height="4" rx="0.7"/><rect x="2" y="10.5" width="4" height="4" rx="0.7"/><rect x="6" y="10.5" width="4" height="4" rx="0.7"/><rect x="10" y="10.5" width="4" height="4" rx="0.7"/><path d="M8 6.5v2.5M6.6 7.8L8 9.2l1.4-1.4" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round"/></svg>',
    stats: '<svg viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="8" width="3" height="6" rx="0.7"/><rect x="6.5" y="3" width="3" height="11" rx="0.7"/><rect x="11" y="6" width="3" height="8" rx="0.7"/></svg>',
    settings: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M2 4h7M12 4h2M2 8h2M7 8h7M2 12h8M13 12h1"/><circle cx="10.5" cy="4" r="1.5"/><circle cx="5.5" cy="8" r="1.5"/><circle cx="11.5" cy="12" r="1.5"/></svg>',
    pin: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><rect x="3" y="2.5" width="10" height="7" rx="1.5"/><path d="M5.5 12.5h5M8 9.5v4"/></svg>',
    hide: '<svg viewBox="0 0 16 16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 8.5h8"/></svg>',
    close: '<svg viewBox="0 0 16 16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg>',
  };

  // ---- toasts and modals ----------------------------------------------------------------------------------------------

  function toast(msg, kind, ms) {
    const box = document.getElementById('toasts');
    const el = h('div', { class: 'toast ' + (kind || '') }, msg);
    box.appendChild(el);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms || 2600);
  }

  const modals = [];
  function openModal(opts) {
    const rootEl = document.getElementById('modal-root');
    const close = () => {
      const i = modals.indexOf(handle);
      if (i >= 0) modals.splice(i, 1);
      scrim.remove();
      if (L.app) L.app.postDragRegions();
      if (opts.onClose) opts.onClose();
    };
    const footer = opts.buttons && opts.buttons.length ? h('footer', null, opts.buttons.map((b) => h('button', {
      class: 'btn ' + (b.kind || ''), disabled: b.disabled,
      onclick: () => { if (b.onClick && b.onClick() === false) return; close(); },
    }, b.label))) : null;
    const modal = h('div', { class: 'modal' + (opts.cls ? ' ' + opts.cls : ''), role: 'dialog', style: opts.width ? { width: 'min(' + opts.width + 'px, calc(100% - 24px))' } : null },
      h('header', null, opts.title || '', h('button', { class: 'icon-btn x', html: ICONS.close, title: 'Close', onclick: close })),
      h('div', { class: 'body' }, opts.body),
      footer);
    const scrim = h('div', { class: 'scrim', onmousedown: (e) => { if (e.target === scrim) close(); } }, modal);
    rootEl.appendChild(scrim);
    const handle = { close, el: modal, opts };
    modals.push(handle);
    if (L.app) L.app.postDragRegions(); // a tall dialog covers the title bar: it must take its clicks
    const first = modal.querySelector('input, textarea');
    if (first) setTimeout(() => first.focus(), 30);
    return handle;
  }
  function modalOpen() { return modals.length > 0; }
  function closeTopModal() { const m = modals[modals.length - 1]; if (m) { m.close(); return true; } return false; }
  function submitTopModal() {
    const m = modals[modals.length - 1];
    if (!m) return false;
    const btn = m.el.querySelector('footer .btn.primary:not(:disabled)');
    if (btn) { btn.click(); return true; }
    return false;
  }

  function confirm(title, text, okLabel, onOk, kind) {
    return openModal({ title, body: h('p', null, text), buttons: [{ label: 'Cancel' }, { label: okLabel || 'OK', kind: kind || 'primary', onClick: onOk }] });
  }

  // ---- small canvases -------------------------------------------------------------------------------------------------

  function canvasFor(w, h2, draw) {
    const c = h('canvas');
    const dpr = Math.min(3, root.devicePixelRatio || 1);
    c.width = Math.round(w * dpr); c.height = Math.round(h2 * dpr);
    c.style.width = w + 'px'; c.style.height = h2 + 'px';
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.__dpr = dpr;
    draw(ctx, w, h2);
    return c;
  }

  function lookWith(app, kind, id) {
    const eq = Object.assign({}, app.store.state.equipped);
    if (kind) eq[kind] = id;
    return Render.makeLook(eq, app.theme, performance.now());
  }

  function drawMiniPiece(ctx, look, id, x, y, s, rot) {
    const t = Pieces.get(id);
    const cells = t.rots[rot || 0];
    const b = Pieces.boundsOf(cells);
    for (const [cx, cy] of cells) Render.drawCell(ctx, look.skin, look.colors[t.color], x + (cx - b.minX) * s, y + (b.maxY - cy) * s, s);
  }

  function cosmeticPreview(app, kind, id, w, hh) {
    const look = lookWith(app, kind, id);
    return canvasFor(w, hh, (ctx) => {
      if (kind === 'palette') {
        const s = Math.floor(Math.min(hh / 3.2, w / 13));
        const ids = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
        const pos = [[0.4, 1.6, 1], [4.6, 0.3, 0], [7.3, 0.3, 0], [2.4, 0.3, 0], [9.7, 1.2, 1], [10.4, 0.2, 2], [5, 1.9, 0]];
        const ox = (w - s * 12.2) / 2, oy = (hh - s * 3) / 2;
        ids.forEach((id2, i) => drawMiniPiece(ctx, look, id2, ox + pos[i][0] * s, oy + pos[i][1] * s, s, pos[i][2]));
      } else if (kind === 'skin') {
        const s = Math.floor(Math.min(hh / 2.6, w / 7));
        const ox = (w - s * 6.4) / 2, oy = (hh - s * 2) / 2;
        drawMiniPiece(ctx, look, 'T', ox, oy, s, 2);
        drawMiniPiece(ctx, look, 'L', ox + s * 3.4, oy, s, 0);
      } else if (kind === 'frame' || kind === 'backdrop' || kind === 'ghost') {
        const s = Math.floor(Math.min((hh - 16) / 4, (w - 24) / 8));
        const bw = s * 8, bh = s * 4, bx = Math.round((w - bw) / 2), by = Math.round((hh - bh) / 2);
        Render.drawBackdrop(ctx, look.backdrop, { x: bx, y: by, w: bw, h: bh }, s, 8, 4, app.theme, 0);
        const g = look.colors[8];
        for (const [cx, cy] of [[0, 3], [1, 3], [2, 3], [5, 3], [6, 3], [7, 3], [0, 2], [7, 2], [6, 2]]) Render.drawCell(ctx, look.skin, g, bx + cx * s, by + cy * s, s);
        if (kind === 'ghost') {
          const col = look.colors[3];
          for (const [cx, cy] of [[3, 3], [4, 3], [4, 2], [3, 2]]) Render.ghostCell(ctx, id, col, bx + cx * s, by + cy * s, s);
          for (const [cx, cy] of [[3, 0], [4, 0], [3, 1], [4, 1]]) Render.drawCell(ctx, look.skin, col, bx + cx * s, by + cy * s, s);
        } else {
          drawMiniPiece(ctx, look, 'T', bx + 2.5 * s, by + 0.2 * s, s, 2);
        }
        Render.drawFrame(ctx, look.frame, { x: bx, y: by, w: bw, h: bh }, app.theme.accent, performance.now());
      } else if (kind === 'effect') {
        const s = Math.floor(Math.min(hh / 3.2, w / 11));
        const fx = new Render.FX();
        const cells = [];
        const ox = (w - s * 10) / 2, oy = hh / 2 - s / 2;
        for (let i = 0; i < 10; i++) cells.push({ x: ox + i * s, y: oy, color: look.colors[(i % 7) + 1] });
        const r = new L.RNG(id);
        const saved = Math.random;
        Math.random = () => r.next();
        fx.burst(id, cells, s, false);
        if (id === 'ripple') fx.ring(w / 2, hh / 2, app.theme.accent, s * 7);
        Math.random = saved;
        fx.update(id === 'fade' ? 0.08 : 0.16);
        fx.draw(ctx);
      }
    });
  }

  // ---- shop -----------------------------------------------------------------------------------------------------------

  function renderShop(app, sub) {
    const tabs = document.getElementById('shop-tabs');
    const grid = document.getElementById('shop-grid');
    if (!COSMETICS[sub]) sub = 'palette';
    const subs = Object.keys(COSMETICS).map((k) => [k, COSMETIC_LABELS[k]]);
    tabs.replaceChildren(...subs.map(([k, label]) => h('button', { 'aria-selected': String(k === sub), onclick: () => { app.shopSub = k; renderShop(app, k); } }, label)));
    const st = app.store.state;
    const cards = [];
    {
      const cat = COSMETICS[sub];
      for (const [id, c] of Object.entries(cat)) {
        const owned = app.store.owns(sub, id);
        const equipped = st.equipped[sub] === id;
        let action;
        if (equipped) action = h('button', { class: 'btn sm', disabled: true }, 'Equipped');
        else if (owned) action = h('button', { class: 'btn sm primary', onclick: () => { app.store.equip(sub, id); app.applyLook(); renderShop(app, sub); } }, 'Equip');
        else if (c.reward) action = h('span', { class: 'lock' }, '🔒 Factory');
        else action = h('button', {
          class: 'btn sm primary', disabled: st.lines < c.price,
          onclick: () => {
            confirm('Buy ' + c.name + '?', 'Spend ' + fmtInt(c.price) + ' lines on the ' + c.name + ' ' + COSMETIC_LABELS[sub].toLowerCase().replace(/s$/, '') + '.', 'Buy', () => {
              if (app.store.buyCosmetic(sub, id)) { app.sound.play('buy'); app.store.equip(sub, id); app.applyLook(); app.refreshWallet(); toast(c.name + ' — yours', 'good'); renderShop(app, sub); }
            });
          },
        }, h('span', { class: 'gem' }, '◆'), fmtInt(c.price));
        const isSound = sub === 'sound';
        cards.push(h('div', { class: 'card' + (equipped ? ' equipped' : '') },
          isSound
            ? h('button', { class: 'preview sound-preview', title: 'Play a sample', onclick: () => app.sound.preview(id) }, h('span', { class: 'big-icon' }, '▶'), h('span', null, 'Listen'))
            : h('div', { class: 'preview' }, cosmeticPreview(app, sub, id, 150, 64)),
          h('h3', null, c.name),
          c.desc ? h('p', null, c.desc) : null,
          c.reward && !owned ? h('p', null, c.reward) : null,
          h('div', { class: 'foot' }, h('span', { class: 'owned' }, owned ? 'Owned' : c.animated ? 'Animated' : ''), action)));
      }
    }
    grid.replaceChildren(...cards);
  }

  // ---- statistics -----------------------------------------------------------------------------------------------------

  function count(n) { return n < 1000 ? fmtInt(Math.floor(n)) : fmt(n); }
  function kpi(v, l) { return h('div', { class: 'kpi' }, h('div', { class: 'v' }, v), h('div', { class: 'l' }, l)); }
  function table(rows, cls) { return h('table', { class: 'st ' + (cls || '') }, rows.map((r) => h('tr', null, r.map((c) => h('td', null, c))))); }
  function hbars(items, colorFn) {
    const max = Math.max(1, ...items.map((i) => i[1]));
    return h('div', { class: 'hbars' }, items.map(([label, v], i) => h('div', { class: 'hbar' },
      h('span', null, label),
      h('div', { class: 'track' }, h('i', { style: { width: (100 * v / max).toFixed(1) + '%', background: colorFn ? colorFn(i, label) : 'var(--accent)' } })),
      h('span', { class: 'n' }, fmtInt(v)))));
  }

  function historyChart(app, key, days) {
    const hist = app.store.state.history;
    const out = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const k = L.dateKey(d);
      out.push({ k, v: (hist[k] && hist[k][key]) || 0, label: i === 0 ? 'today' : String(d.getDate()), today: i === 0 });
    }
    const max = Math.max(1, ...out.map((o) => o.v));
    return h('div', { class: 'cols-chart' }, out.map((o) => h('div', { class: 'c' + (o.today ? ' today' : ''), title: o.k + ': ' + fmtInt(o.v) },
      h('i', { style: { height: (100 * o.v / max).toFixed(1) + '%' } }), h('span', null, o.label))));
  }

  function renderStats(app, sub) {
    const tabs = document.getElementById('stats-tabs');
    const body = document.getElementById('stats-body');
    const subs = [['overview', 'Overview'], ['free', 'Free Play'], ['classic', 'Classic'], ['puzzle', 'Puzzles'], ['factory', 'Factory'], ['items', 'Items & Shop'], ['achievements', 'Achievements']];
    tabs.replaceChildren(...subs.map(([k, label]) => h('button', { 'aria-selected': String(k === sub), onclick: () => { app.statsSub = k; renderStats(app, k); } }, label)));
    const st = app.store.state, S = st.stats;
    const look = lookWith(app);
    const els = [];
    const pz = S.puzzle;
    const solvedAll = pz.E.solved + pz.M.solved + pz.H.solved;
    if (sub === 'overview') {
      els.push(h('div', { class: 'kpis' },
        kpi(fmtInt(st.lines), 'Lines banked'),
        kpi(fmtInt(S.lines.earned), 'Lines earned, all time'),
        kpi(fmtInt(S.free.lines), 'Lines cleared in Free Play'),
        kpi(fmtInt(solvedAll), 'Puzzles solved'),
        kpi(count(st.factory.stats.shipped), 'Factory minos shipped'),
        kpi(fmtDuration(S.timeMs.total), 'Time with Lull'),
        kpi(fmtInt(S.sessions), 'Sessions'),
        kpi(Object.keys(st.history).length + '', 'Days played')));
      els.push(h('h4', null, 'Lines earned, last 14 days'), historyChart(app, 'lines', 14));
      els.push(h('h4', null, 'Where lines came from'), hbars([['Free Play', S.lines.play], ['Puzzles', S.lines.puzzles], ['Factory', S.lines.contracts], ['Achievements', S.lines.achievements || 0]]));
      els.push(h('h4', null, 'Time by mode'), table([
        ['Free Play', fmtDuration(S.timeMs.play)], ['Classic', fmtDuration(S.timeMs.classic || 0)], ['Puzzles', fmtDuration(S.timeMs.puzzle)], ['Factory (watching)', fmtDuration(S.timeMs.factory)],
      ]));
    } else if (sub === 'classic') {
      const C = S.classic;
      els.push(h('div', { class: 'kpis' }, kpi(fmtInt(C.best), 'Best score'), kpi(String(C.bestLevel || '—'), 'Highest level'), kpi(fmtInt(C.bestLines), 'Most lines, one game'),
        kpi(fmtInt(C.games), 'Games'), kpi(fmtInt(C.lines), 'Lines, all games'), kpi(fmtInt(C.pieces), 'Pieces'), kpi(fmtDuration(S.timeMs.classic || 0), 'Time played')));
    } else if (sub === 'free') {
      const F = S.free;
      const ppm = S.timeMs.play > 60000 ? F.pieces / (S.timeMs.play / 60000) : 0;
      els.push(h('div', { class: 'kpis' },
        kpi(fmtInt(F.pieces), 'Pieces placed'), kpi(fmtInt(F.lines), 'Lines cleared'), kpi(fmtInt(F.bestScore), 'Best board score'),
        kpi(fmtInt(F.bestLines), 'Most lines, one board'), kpi(ppm ? ppm.toFixed(1) : '—', 'Pieces / minute'), kpi(F.pieces ? (F.lines / F.pieces * 2.5).toFixed(2) : '—', 'Efficiency (1.00 = all quads)')));
      els.push(h('h4', null, 'Clears'), hbars([['Single', F.clears[1]], ['Double', F.clears[2]], ['Triple', F.clears[3]], ['Quad', F.clears[4]], ['5+ (items)', F.clears[5]]]));
      els.push(h('h4', null, 'Pieces placed'), hbars(Pieces.TETROMINOES.map((id) => [id, F.byType[id] || 0]).concat(Object.keys(F.byType).filter((k) => !Pieces.TETROMINOES.includes(k)).map((k) => [k, F.byType[k]])),
        (i, label) => look.colors[(Pieces.TYPES[label] && Pieces.TYPES[label].color) || 15]));
      els.push(h('h4', null, 'Technique'), table([
        ['T-spins', fmtInt(F.tspins)], ['Lines from T-spins', fmtInt(F.tspinLines)], ['Perfect clears', fmtInt(F.perfect)],
        ['Longest combo', fmtInt(F.maxCombo)], ['Longest back-to-back', fmtInt(Math.max(0, F.maxB2B))],
        ['Holds', fmtInt(F.holds)], ['Turns', fmtInt(F.rotations)], ['Moves', fmtInt(F.moves)], ['Lowers', fmtInt(F.lowers)], ['Hard drops', fmtInt(F.drops)],
        ['Boards started', fmtInt(F.boards)], ['Boards filled to the top', fmtInt(F.topouts)],
        ['Inputs per piece', F.pieces ? ((F.moves + F.rotations + F.lowers + F.drops + F.holds) / F.pieces).toFixed(2) : '—'],
      ]));
    } else if (sub === 'puzzle') {
      const rows = [['', 'Solved', '1st try', 'Tries', 'Best', 'Streak']];
      for (const d of ['E', 'M', 'H']) {
        const p = pz[d];
        rows.push([Puzzles.DIFFS[d].name, fmtInt(p.solved), p.solved ? pct(p.firstTry / p.solved) : '—', p.solved ? (p.attempts / p.solved).toFixed(1) : '—', p.bestMs ? L.fmtClock(p.bestMs) : '—', p.bestStreak + '']);
      }
      els.push(h('div', { class: 'kpis' }, kpi(fmtInt(solvedAll), 'Solved'), kpi(fmtInt(pz.E.played + pz.M.played + pz.H.played), 'Played'),
        kpi(fmtInt(pz.daily), 'Dailies solved'), kpi(fmtInt(pz.E.hints + pz.M.hints + pz.H.hints), 'Hints bought'),
        kpi(fmtInt(pz.E.fails + pz.M.fails + pz.H.fails), 'Retries')));
      els.push(h('h4', null, 'By difficulty'), h('table', { class: 'st cols' }, rows.map((r, i) => h('tr', null, r.map((c) => h(i ? 'td' : 'th', null, c))))));
      const modRows = Object.keys(Puzzles.MODS).map((m) => { const r = pz.mods[m] || { seen: 0, solved: 0 }; return [Puzzles.MODS[m].icon + ' ' + Puzzles.MODS[m].name, r.solved + ' / ' + r.seen]; });
      els.push(h('h4', null, 'Wildcards (solved / met)'), table(modRows));
      els.push(h('h4', null, 'Puzzles solved, last 14 days'), historyChart(app, 'puzzles', 14));
    } else if (sub === 'factory') {
      const f = st.factory, fs = f.stats, r = Factory.rates(f);
      const presses = Object.values(f.owned).reduce((a, b) => a + b, 0);
      els.push(h('div', { class: 'kpis' },
        kpi(fmt(r.perSec) + '¢', 'Per second'), kpi(fmt(f.lifetime) + '¢', 'Credits, all time'), kpi(fmtInt(presses), 'Presses'),
        kpi(fmtInt(f.crates), 'Crates opened'), kpi(fmtInt(fs.lines), 'Lines from crates'), kpi(count(fs.shipped), 'Minos shipped')));
      const lines = [];
      for (let t = 1; t <= Factory.MAX_TIER; t++) if (f.owned[t]) lines.push([Factory.TIERS[t].name, Math.round(Factory.tierRate(f, t))]);
      if (lines.length) els.push(h('h4', null, 'Income by press (¢/s)'), hbars(lines));
      const pulled = fs.caught + fs.caughtAuto;
      els.push(h('h4', null, 'Quality control'), table([
        ['Defects pulled by hand', count(fs.caught)], ['Defects pulled by the inspector', count(fs.caughtAuto)],
        ['Defects shipped (refunded)', count(fs.escaped)], ['Good minos binned', count(fs.wasted)], ['Catch rate', (pulled + fs.escaped) ? pct(pulled / (pulled + fs.escaped), 1) : '—'],
        ['Best streak', fmtInt(f.bestStreak)], ['Earned while away', fmt(fs.offlineEarned) + '¢'], ['Time in the factory', fmtDuration(S.timeMs.factory)],
      ]));
    } else if (sub === 'achievements') {
      const A = L.Achievements, got = st.achievements || {};
      const n = A.LIST.filter((a) => got[a.id]).length;
      els.push(h('div', { class: 'kpis' }, kpi(n + ' / ' + A.LIST.length, 'Earned'), kpi(fmtInt(S.lines.achievements || 0) + ' ◆', 'Lines from them'), kpi(fmtInt(A.total()) + ' ◆', 'All of them pay')));
      for (const g of A.GROUPS) {
        els.push(h('h4', null, g.name));
        els.push(h('div', { class: 'ach-list' }, A.LIST.filter((a) => a.group === g.id).map((a) => {
          const when = got[a.id], pr = !when && a.progress ? a.progress(st) : null;
          return h('div', { class: 'ach' + (when ? ' got' : '') },
            h('span', { class: 'ach-i' }, when ? '🏆' : '·'),
            h('div', { class: 'grow' },
              h('div', { class: 't' }, a.name),
              h('div', { class: 'd' }, a.desc + (when ? ' · ' + new Date(when).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '')),
              pr ? h('div', { class: 'bar' }, h('i', { style: { width: (100 * Math.min(1, pr[0] / pr[1])).toFixed(1) + '%' } })) : null),
            h('span', { class: 'ach-pay' }, (pr ? Math.min(pr[0], pr[1]) + '/' + pr[1] + ' · ' : '') + '+' + a.pay + ' ◆'));
        })));
      }
    } else {
      const bought = S.items.bought, used = S.items.used;
      els.push(h('div', { class: 'kpis' }, kpi(fmtInt(S.lines.spent), 'Lines spent'), kpi(fmtInt(S.cosmetics.bought), 'Cosmetics bought'),
        kpi(fmtInt(Object.values(used).reduce((a, b) => a + b, 0)), 'Items used'), kpi(fmtInt(S.lines.refunded), 'Lines rewound')));
      els.push(h('h4', null, 'Items'), h('table', { class: 'st cols' },
        h('tr', null, h('th', null, ''), h('th', null, 'Bought'), h('th', null, 'Used'), h('th', null, 'Have')),
        ITEM_ORDER.map((id) => h('tr', null, h('td', null, ITEMS[id].icon + ' ' + ITEMS[id].name), h('td', null, fmtInt(bought[id] || 0)), h('td', null, fmtInt(used[id] || 0)), h('td', null, fmtInt(st.inventory[id] || 0))))));
      const ownedRows = Object.keys(COSMETICS).map((k) => [COSMETIC_LABELS[k], st.owned[k].length + ' / ' + Object.keys(COSMETICS[k]).length]);
      els.push(h('h4', null, 'Collection'), table(ownedRows));
    }
    body.replaceChildren(...els);
  }

  // ---- settings -------------------------------------------------------------------------------------------------------

  function openSettings(app, section) {
    const s = app.store.state.settings;
    const isNative = L.native.available;
    const set = (k, v) => { s[k] = v; app.store.touch(); app.applySettings(); };
    const row = (label, hint, control) => h('div', { class: 'set-row' }, h('div', { class: 'lbl' }, label, hint ? h('span', { class: 'hint' }, hint) : null), control);
    const card = (title, ...rows) => h('div', { class: 'set-card' }, title ? h('div', { class: 'set-card-title' }, title) : null, rows);
    const toggle = (k, onChange) => {
      const b = h('button', { class: 'switch', role: 'switch', 'aria-checked': String(!!s[k]), onclick: () => { set(k, !s[k]); b.setAttribute('aria-checked', String(!!s[k])); if (onChange) onChange(); } });
      return b;
    };
    const range = (k, min, max, step, unit, scale) => {
      scale = scale || 1;
      const val = h('span', { class: 'val' }, Math.round(s[k] * scale) + unit);
      return h('div', { class: 'range' }, h('input', { type: 'range', min, max, step, value: s[k] * scale, oninput: (e) => { set(k, Number(e.target.value) / scale); val.textContent = Math.round(s[k] * scale) + unit; } }), val);
    };
    const tiles = (k, options, cls) => {
      const wrap = h('div', { class: 'tiles ' + (cls || '') });
      options.forEach(([v, label, preview]) => {
        const b = h('button', { class: 'tile', 'aria-pressed': String(s[k] === v), onclick: () => { set(k, v); wrap.querySelectorAll('.tile').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); } }, preview, h('span', null, label));
        wrap.appendChild(b);
      });
      return wrap;
    };
    const bgPreview = (mode) => h('span', { class: 'tile-prev bgp bgp-' + mode }, h('i'));
    const themePreview = (t) => h('span', { class: 'tile-prev thp thp-' + t }, h('i'), h('i'), h('i'));

    const sections = {
      look: {
        icon: '◐', label: 'Look',
        body: () => [
          card('Window background',
            tiles('bg', [['clear', 'Clear', bgPreview('clear')], ['glass', 'Glass', bgPreview('glass')], ['tint', 'Tint', bgPreview('tint')], ['solid', 'Solid', bgPreview('solid')]]),
            row('Tint strength', 'For the Tint background', range('tint', 20, 98, 1, '%', 100))),
          card('Theme', tiles('theme', [['dark', 'Dark', themePreview('dark')], ['light', 'Light', themePreview('light')], ['auto', 'Auto', themePreview('auto')]])),
          card('Border and accent', (() => {
            const sw = h('div', { class: 'swatches big' });
            ACCENTS.forEach((c) => {
              const b = h('button', { class: 'swatch', style: { background: c }, 'aria-pressed': String(s.accent === c), title: c, onclick: () => { set('accent', c); sw.querySelectorAll('.swatch').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); } });
              sw.appendChild(b);
            });
            return sw;
          })()),
          card('Motion', row('Effects', 'Reduced keeps line clears to a quick fade and redraws less', tiles('motion', [['full', 'Full', null], ['reduced', 'Reduced', null]], 'small'))),
        ],
      },
      window: isNative ? {
        icon: '▭', label: 'Window',
        body: () => [card(null,
          row('Float above other windows', 'Keeps Lull in view while you work', toggle('onTop')),
          row('Show and hide from anywhere', 'Press ⌥⌘L in any app. Esc tucks Lull away.', h('kbd', { class: 'big' }, '⌥⌘L')))],
      } : null,
      controls: {
        icon: '⌨', label: 'Controls',
        body: () => [
          card('Keyboard',
            row('Repeat delay', 'How long an arrow is held before it repeats', range('das', 60, 400, 5, ' ms')),
            row('Repeat rate', 'Time between repeats; 0 slides straight to the wall', range('arr', 0, 150, 5, ' ms')),
            row('Lower repeat', 'Held ↓ never sets a piece — tap again to set', range('lowerRepeat', 0, 150, 5, ' ms'))),
          card('Mouse',
            row('Mouse control', 'Point to aim (the ghost follows, even under ledges) · click to place · wheel to turn · right-click to hold', toggle('mouse'))),
          card('Board', row('Next pieces shown', null, range('preview', 1, 6, 1, ''))),
        ],
      },
      sound: {
        icon: '♪', label: 'Sound',
        body: () => [card(null,
          row('Sound effects', null, toggle('sound')),
          row('Volume', null, range('volume', 0, 100, 1, '%', 100)),
          row('Classic music', 'Korobeiniki, remixed soft and bright, while a Classic game runs', toggle('music', () => app.modes.classic && app.modes.classic.renderControls())),
          row('Classic announcer', 'A whisper calls out singles, doubles, triples, tetrises and T-spins', toggle('announcer')),
          row('Music volume', null, range('musicVolume', 0, 60, 1, '%', 100)),
          row('Sound pack', (L.SOUNDS[app.state.equipped.sound] || L.SOUNDS.soft).name + ' — more in the Shop', h('button', { class: 'btn sm', onclick: () => app.sound.preview(app.state.equipped.sound) }, '▶ Listen')))],
      },
      keys: {
        icon: '⌘', label: 'Keys',
        body: () => [card(null, h('div', { class: 'keys' }, L.KEY_HELP.map(([k, d]) => [h('span', { class: 'k' }, h('kbd', null, k)), h('span', null, d)])))],
      },
      data: {
        icon: '⛁', label: 'Data',
        body: () => [
          card('Save', row('Your progress', isNative ? 'Kept in ~/Library/Application Support/Lull' : 'Kept in this browser',
            h('div', { class: 'btns' }, h('button', { class: 'btn sm', onclick: () => openExport(app) }, 'Export'), h('button', { class: 'btn sm', onclick: () => openImport(app) }, 'Import')))),
          card('Start over', row('Reset everything', 'Lines, items, cosmetics, puzzles, factory and stats. Settings stay.',
            h('button', { class: 'btn sm danger', onclick: () => confirm('Start over?', 'Everything except your settings is wiped. This cannot be undone.', 'Wipe', () => { app.store.reset(); location.reload(); }, 'danger') }, 'Reset…'))),
          h('p', { class: 'set-about' }, 'Lull ' + (L.VERSION || '') + ' · puzzle generator v' + Puzzles.GEN_VERSION),
        ],
      },
    };
    const ids = Object.keys(sections).filter((k) => sections[k]);
    let cur = section && sections[section] ? section : 'look';
    const pane = h('div', { class: 'set-pane scroll' });
    const nav = h('nav', { class: 'set-nav' });
    const show = (id) => {
      cur = id;
      nav.querySelectorAll('button').forEach((b) => b.setAttribute('aria-current', String(b.dataset.id === id)));
      pane.replaceChildren(...sections[id].body());
      pane.scrollTop = 0;
    };
    ids.forEach((id) => nav.appendChild(h('button', { 'data-id': id, onclick: () => show(id) }, h('span', { class: 'ni' }, sections[id].icon), h('span', null, sections[id].label))));
    const body = h('div', { class: 'settings' }, nav, pane);
    const handle = openModal({ title: 'Settings', body, width: 620 });
    handle.el.classList.add('modal-settings');
    show(cur);
  }

  function openExport(app) {
    app.store.save();
    const ta = h('textarea', { readonly: true }, app.store.serialize());
    openModal({
      title: 'Export save', body: h('div', null, h('p', null, 'Copy this text somewhere safe. Import it on any machine to carry on.'), ta),
      buttons: [{ label: 'Close' }, { label: 'Copy', kind: 'primary', onClick: () => { ta.select(); copyText(ta.value); toast('Save copied', 'good'); return false; } }],
    });
  }

  function openImport(app) {
    const ta = h('textarea', { placeholder: 'Paste a Lull save here' });
    openModal({
      title: 'Import save', body: h('div', null, h('p', null, 'This replaces your current progress.'), ta),
      buttons: [{ label: 'Cancel' }, { label: 'Import', kind: 'primary', onClick: () => {
        try { app.store.importJSON(ta.value); location.reload(); } catch (e) { toast('That is not a Lull save', 'bad'); return false; }
      } }],
    });
  }

  function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).catch(() => fallbackCopy(text)); return; }
    } catch (e) { /* fall through */ }
    fallbackCopy(text);
  }
  function fallbackCopy(text) {
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } }, text);
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) { /* nothing more to try */ }
    ta.remove();
  }

  // ---- item pickers ---------------------------------------------------------------------------------------------------

  function openOrderSlip(app, onPick) {
    const look = lookWith(app);
    const ids = Pieces.TETROMINOES.concat(['I3', 'V3', 'D2']);
    let picked = false, handle = null;
    const choose = (id) => { picked = true; handle.close(); onPick(id); };
    const grid = h('div', { class: 'picker' }, ids.map((id) => h('button', { title: Pieces.TYPES[id].name, onclick: () => choose(id) },
      canvasFor(56, 54, (ctx) => { const t = Pieces.TYPES[id]; const b = Pieces.boundsOf(t.rots[0]); const s = Math.floor(Math.min(46 / b.w, 40 / b.h, 13)); drawMiniPiece(ctx, look, id, (56 - b.w * s) / 2, (54 - b.h * s) / 2, s, 0); }))));
    handle = openModal({ title: 'Order Slip — pick your piece', body: grid, onClose: () => { if (!picked) onPick(null); } });
  }

  function openBlueprint(app, onDone) {
    const N = 5;
    const on = new Set(['1,2', '2,2', '3,2', '2,1']);
    const status = h('div', { class: 'bp-status' });
    let handle = null;
    const cells = () => Array.from(on).map((k) => k.split(',').map(Number)).map(([x, y]) => [x, N - 1 - y]);
    const check = () => {
      const c = cells();
      let msg = '', ok = false;
      if (!c.length) msg = 'Tap cells to draw a piece';
      else if (c.length > 6) msg = 'Six blocks at most';
      else if (!Pieces.isConnected(c)) msg = 'Blocks must touch edge to edge';
      else { ok = true; msg = c.length + ' block' + (c.length > 1 ? 's' : '') + ' — looks buildable'; }
      status.textContent = msg; status.className = 'bp-status ' + (ok ? 'ok' : 'bad');
      if (handle) handle.el.querySelector('footer .btn.primary').disabled = !ok;
      return ok;
    };
    const grid = h('div', { class: 'bp-grid' });
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const k = x + ',' + y;
      const b = h('button', { class: on.has(k) ? 'on' : '', onclick: () => { if (on.has(k)) on.delete(k); else on.add(k); b.className = on.has(k) ? 'on' : ''; check(); } });
      grid.appendChild(b);
    }
    let done = false;
    handle = openModal({
      title: 'Blueprint — draw a piece', body: h('div', null, h('p', null, 'Up to six blocks, joined edge to edge. It replaces the piece in play.'), grid, status),
      buttons: [{ label: 'Cancel' }, { label: 'Build it', kind: 'primary', onClick: () => { if (!check()) return false; done = true; onDone(cells()); } }],
      onClose: () => { if (!done) onDone(null); },
    });
    check();
  }

  // ---- tooltips: any element with data-tip (and optional data-tip-title / data-tip-foot) --------------------------

  function initTooltips() {
    const app = document.getElementById('app');
    const tip = h('div', { class: 'tip hidden', role: 'tooltip' });
    app.appendChild(tip);
    let timer = null, cur = null;
    const hide = () => { clearTimeout(timer); tip.classList.add('hidden'); };
    const show = (el) => {
      if (!el.isConnected) return;
      tip.replaceChildren(
        el.dataset.tipTitle ? h('div', { class: 'tip-title' }, el.dataset.tipTitle) : null,
        h('div', { class: 'tip-body' }, el.dataset.tip),
        el.dataset.tipFoot ? h('div', { class: 'tip-foot' }, el.dataset.tipFoot) : null);
      tip.classList.remove('hidden');
      const a = app.getBoundingClientRect(), r = el.getBoundingClientRect(), t = tip.getBoundingClientRect();
      let x = r.left + r.width / 2 - t.width / 2 - a.left;
      x = Math.max(6, Math.min(a.width - t.width - 6, x));
      let y = r.top - t.height - 8 - a.top;
      if (y < 44) y = r.bottom + 8 - a.top;
      tip.style.left = x + 'px'; tip.style.top = y + 'px';
    };
    document.addEventListener('mouseover', (e) => {
      const el = e.target && e.target.closest ? e.target.closest('[data-tip]') : null;
      if (el === cur) return;
      cur = el;
      hide();
      if (el) timer = setTimeout(() => show(el), 260);
    });
    document.addEventListener('mousedown', hide, true);
    document.addEventListener('keydown', hide, true);
  }

  L.UI = { initTooltips, h, ICONS, toast, openModal, modalOpen, closeTopModal, submitTopModal, confirm, canvasFor, renderShop, renderStats, openSettings, openOrderSlip, openBlueprint, copyText, lookWith, drawMiniPiece };
})(typeof globalThis !== 'undefined' ? globalThis : this);
