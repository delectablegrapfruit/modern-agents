// Lull — Patterns on the Play tab (js/patterns.js has the detector; js/trainingview.js the controller this serves): the
// fit strip in the bar under the board, the notes drawn at the cells, the player's record, and the Guide.
//
// The fit strip: the seven pieces, each lit when it has a clean spot on the board now (nothing left open under it) and
// dimmed when it has none, updated as each piece is set; pointed at, focused or tapped, a piece's clean spots are
// outlined on the board. It lives in the bar under the board (where Per move keeps its counters), so the board keeps
// its size at every width.
//
// A note: a few words in a small pill by the cells it is about, with the pieces that fit (✓) or not (✗), the cells
// ringed, and for a piece left with no spot the place it would have to go and what it would leave; in quickly, gone in
// about two seconds (with reduced motion: still, a fade). At most one every few pieces; a shape learned is marked only,
// then silent (js/patterns.js pace).
//
// The Guide (the Training bar's Guide, or G; Per move has it too): a window over the board, so the game holds while it
// is open and goes on when it closes. Its index is the shapes by group (Risky, Good, Combinations, Advanced), each met
// in play dotted, with its measured cost; a card is four small boards drawn by the board's own cell painter from the
// detector (What it is, How it happens, How to avoid, How to recover), a caption of four words at most under each, and
// the measured cost. Opened from play it goes straight to the card of the last note. On a phone, one card a screen,
// with arrows and a swipe.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Patterns: P, UI, Render, Pieces, Bot } = L;
  if (!P || !UI || !Render) return;
  const { h } = UI;
  const ico = UI.icon;

  /** A note's time on the board (seconds): in quickly, out over its last third; with reduced motion a still fade. */
  const NOTE = 2.0, NOTE_STILL = 1.6, MARK = 1.2;
  const ROSE = { dark: '#eb8fa8', light: '#b8486a' };
  const GREEN = { dark: '#8fd6a8', light: '#2f8a57' };

  /** The patterns record in the save (state.patterns): seen and met shapes, the games' lines. */
  function memOf(app) {
    const S = app.store.state;
    if (!S.patterns || typeof S.patterns !== 'object') S.patterns = { seen: {}, met: {}, log: [] };
    const M = S.patterns;
    if (!M.seen || typeof M.seen !== 'object') M.seen = {};
    if (!M.met || typeof M.met !== 'object') M.met = {};
    if (!Array.isArray(M.log)) M.log = [];
    return M;
  }

  // ---- a placement in Patterns ------------------------------------------------------------------------------------------

  /**
   * A piece set in Patterns (the controller ctl, its lock r, the board and Next as they are now): looked at by the
   * detector, the record kept, the note chosen (pace) and handed to the board, the fit strip brought up to date.
   * Returns the look.
   */
  function onLock(ctl, play, r) {
    const app = play.app, g = play.game, T = L.Training.of(g), o = P.settingsOf(app.settings), M = memOf(app);
    const k = g.recipe.classic || {}, W = g.w, H = g.h;
    const before = T && T.turn ? Bot.rowsOf({ w: W, h: H, cells: T.turn.cells }) : Bot.rowsOf(g.board);
    const vis = g.queue.slice(0, Math.max(0, k.next | 0)).map((e) => e.id);
    const visBefore = T && T.turn ? T.turn.queue.slice(0, Math.max(0, k.next | 0)).map((e) => e.id) : vis;
    const holdUsed = !!T && !!T.turn && (g.s.holds || 0) > (T.turn.s.holds || 0);
    const sinceIBefore = ctl.sinceI || 0;
    ctl.sinceI = r.type === 'I' ? 0 : sinceIBefore + 1;
    let minKeys = null;
    if (o.advanced && T && T.turn && T.turn.piece && !holdUsed) minKeys = keysFor(g, T.turn, r.cells || []);
    const lk = P.look({
      W, H, before, cells: r.cells || [], id: r.type, holdUsed, held: g.hold ? g.hold.id : null, visible: vis, visibleBefore: visBefore,
      rand: k.rand, sinceI: ctl.sinceI, sinceIBefore, level: L.Classic.levelOf(k, (L.Classic.of(g) || {}).lines || 0),
      streak: !!r.b2b, combo: r.lines ? r.combo || 0 : -1, keys: minKeys != null ? ctl.keys : null, minKeys,
    });
    // The player's record: one more piece, the holes it made, the height it left.
    const made = lk.events.filter((e) => e.id === 'hole').reduce((a, e) => a + e.cells.length, 0);
    if (T) { if (!T.gid) T.gid = 'g' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36); P.record(M, T.gid, made, lk.Fa.top, Date.now()); }
    const memo = { seen: M.seen, met: M.met, last: ctl.lastNote };
    const evs = lk.events.filter((e) => P.noted(e.id) && P.cardOf(e.id));
    const n = P.pace(evs, memo, o, g.s.pieces);
    ctl.lastNote = memo.last;
    if (n) {
      const reduced = play.reduced;
      ctl.note = { e: n, t: 0, dur: n.stage === 'mark' ? MARK : reduced ? NOTE_STILL : NOTE, reduced };
      ctl.noteCard = P.cardOf(n.id);
    }
    ctl.fit = lk.Fa.fits;
    ctl.keys = 0;
    app.store.touch();
    play.view.dirty = true;
    return lk;
  }

  /** The fewest keys that set the piece where it was set, from where it appeared (turns and slides; soft drop rows aside). */
  function keysFor(g, turn, cells) {
    const p = turn.piece, type = Pieces.get(p.entry.id);
    const rows = Bot.rowsOf({ w: g.w, h: g.h, cells: turn.cells });
    const rch = Bot.reach(rows, g.w, g.h, type, { rot: p.rot, x: p.x, y: p.y }, { r180: true, ceiling: g.ceiling, twist: true });
    const want = L.Training.cellKey(cells);
    const pl = rch.places.find((q) => L.Training.cellKey(type.rots[q.r].map(([cx, cy]) => [q.x + cx, q.y + cy])) === want);
    return pl ? rch.route(pl).filter((m) => m !== 'D' && m !== 'drop').length : null;
  }

  /** The fit strip's spots now (the board as it is). */
  function fitsNow(g) { return P.analyze(Bot.rowsOf(g.board), g.w, g.h).fits; }

  // ---- the bar: the fit strip ---------------------------------------------------------------------------------------------

  /** A piece drawn small, its cells s px, centred in w × h (the look's colours). */
  function miniPiece(app, id, w, hh, s, dim) {
    const look = Render.makeLook(app.store.state.equipped, app.theme, 0, true);
    return UI.canvasFor(w, hh, (ctx) => {
      const t = Pieces.get(id), cells = t.rots[0], b = Pieces.boundsOf(cells);
      const x0 = (w - b.w * s) / 2, y0 = (hh - b.h * s) / 2;
      ctx.globalAlpha = dim ? 0.32 : 1;
      for (const [cx, cy] of cells) Render.drawCell(ctx, look.skin, look.colors[t.color], x0 + (cx - b.minX) * s, y0 + (b.maxY - cy) * s, s);
    });
  }

  /**
   * The fit strip: the seven, lit with a clean spot, dimmed with none. Pointed at or focused, a piece's spots show on
   * the board; tapped, they stay a few seconds (or till the next piece). ctl.showFit: the piece shown.
   */
  function strip(ctl, play) {
    const app = play.app, fit = ctl.fit || (ctl.fit = fitsNow(play.game));
    const show = (id, sticky) => { ctl.showFit = id; ctl.fitSticky = sticky ? 3 : 0; play.view.dirty = true; };
    return h('div', { class: 'pt-strip', role: 'group', 'aria-label': 'Pieces with a clean spot' },
      P.IDS.map((id) => {
        const n = (fit[id] || []).length;
        return h('button', {
          type: 'button', class: 'pt-fit' + (n ? '' : ' none'), 'data-piece': id, 'aria-pressed': String(ctl.showFit === id && ctl.fitSticky > 0),
          'aria-label': id + (n ? ': ' + n + (n === 1 ? ' clean spot' : ' clean spots') : ': no clean spot'), 'data-tip': n ? id + ' fits: ' + n + (n === 1 ? ' spot' : ' spots') : 'No clean spot for ' + id,
          onmouseenter: () => show(id, false), onmouseleave: () => { if (!ctl.fitSticky) show(null, false); },
          onfocus: () => show(id, false), onblur: () => { if (!ctl.fitSticky) show(null, false); },
          onclick: () => show(ctl.showFit === id && ctl.fitSticky ? null : id, true),
        }, miniPiece(app, id, 22, 14, 5, !n));
      }));
  }

  // ---- on the board ---------------------------------------------------------------------------------------------------

  const inside = (view, cells) => cells.filter(([x, y]) => x >= 0 && x < view.game.w && y >= 0 && y < view.game.h);
  function outline(ctx, view, cells) {
    const s = view.lay.s, keys = new Set(cells.map(([x, y]) => x + ',' + y));
    ctx.beginPath();
    for (const [x, y] of cells) {
      const [sx, sy] = view.toScreen(x, y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (keys.has((x + dx) + ',' + (y + dy))) continue;
        const [nx, ny] = view.toScreen(x + dx, y + dy);
        if (nx > sx) { ctx.moveTo(sx + s, sy); ctx.lineTo(sx + s, sy + s); }
        else if (nx < sx) { ctx.moveTo(sx, sy); ctx.lineTo(sx, sy + s); }
        else if (ny > sy) { ctx.moveTo(sx, sy + s); ctx.lineTo(sx + s, sy + s); }
        else { ctx.moveTo(sx, sy); ctx.lineTo(sx + s, sy); }
      }
    }
    ctx.stroke();
  }

  /**
   * Under the piece: the clean spots of the piece pointed at in the strip, all at once without a tangle of outlines:
   * the cells they cover in a faint fill, and where each one rests on the stack a short bar in the accent.
   */
  function drawFits(ctx, view, ctl) {
    if (!ctl.showFit || !ctl.fit) return;
    const { s } = view.lay, theme = view.look.theme, acc = theme.accent, spots = ctl.fit[ctl.showFit] || [];
    const all = new Map();
    for (const sp of spots) for (const c of inside(view, sp.cells)) all.set(c[0] + ',' + c[1], c);
    ctx.fillStyle = Render.rgba(acc, 0.09);
    for (const [x, y] of all.values()) { const [sx, sy] = view.toScreen(x, y); ctx.fillRect(sx, sy, s, s); }
    ctx.strokeStyle = Render.rgba(acc, 0.9); ctx.lineWidth = Math.max(2, s * 0.12); ctx.lineCap = 'round';
    ctx.beginPath();
    for (const sp of spots) {
      const mine = new Set(sp.cells.map(([x, y]) => x + ',' + y));
      for (const [x, y] of inside(view, sp.cells)) {
        if (mine.has(x + ',' + (y - 1))) continue;
        const [sx, sy] = view.toScreen(x, y);
        ctx.moveTo(sx + s * 0.18, sy + s - 1.5); ctx.lineTo(sx + s * 0.82, sy + s - 1.5);
      }
    }
    ctx.stroke();
  }

  /** A tick or a cross, drawn small at (x, y) in a box of size z. */
  function mark(ctx, x, y, z, ok, color) {
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.4, z * 0.16); ctx.lineCap = 'round'; ctx.beginPath();
    if (ok) { ctx.moveTo(x + z * 0.15, y + z * 0.55); ctx.lineTo(x + z * 0.42, y + z * 0.8); ctx.lineTo(x + z * 0.88, y + z * 0.22); }
    else { ctx.moveTo(x + z * 0.2, y + z * 0.2); ctx.lineTo(x + z * 0.8, y + z * 0.8); ctx.moveTo(x + z * 0.8, y + z * 0.2); ctx.lineTo(x + z * 0.2, y + z * 0.8); }
    ctx.stroke();
  }

  /**
   * A note at its cells (ctl.note): the cells ringed (rose for a risk, green for a good shape or a recovery), the place a
   * piece with no spot would go, dashed, with what it would leave crossed; and in full, its words in a pill over the
   * cells (under them at the top), with the pieces that fit (✓) or not (✗). In quickly, out over the last third; with
   * reduced motion nothing moves, it fades.
   */
  function drawNote(ctx, view, ctl) {
    const N = ctl.note, e = N && N.e;
    if (!e || !view.lay) return;
    const { s, board } = view.lay, theme = view.look.theme, light = theme.name === 'light';
    const p = Math.min(1, N.t / N.dur);
    const a = N.reduced ? 1 - p : Math.min(1, N.t / 0.15) * Math.min(1, (1 - p) / 0.35);
    if (a <= 0) return;
    const good = e.group === 'good' || e.kind === 'cleared';
    const tone = good ? (light ? GREEN.light : GREEN.dark) : (light ? ROSE.light : ROSE.dark);
    ctx.save();
    ctx.globalAlpha = Math.max(0, a);
    const cells = inside(view, e.cells || []);
    ctx.lineWidth = Math.max(1.5, s * 0.08);
    ctx.strokeStyle = Render.rgba(tone, 0.95);
    ctx.fillStyle = Render.rgba(tone, 0.14);
    for (const [x, y] of cells) {
      const [sx, sy] = view.toScreen(x, y), grow = N.reduced ? 0 : 0.06 * Math.sin(Math.min(1, N.t / 0.5) * Math.PI);
      ctx.fillRect(sx + 1, sy + 1, s - 2, s - 2);
      ctx.beginPath(); ctx.arc(sx + s / 2, sy + s / 2, s * (0.3 + grow), 0, Math.PI * 2); ctx.stroke();
    }
    if (e.ghost && N.e.stage === 'full') {
      ctx.setLineDash([Math.max(2, s * 0.15), Math.max(2, s * 0.12)]);
      ctx.strokeStyle = Render.rgba(tone, 0.9);
      outline(ctx, view, inside(view, e.ghost.cells));
      ctx.setLineDash([]);
      for (const [x, y] of inside(view, e.ghost.under)) { const [sx, sy] = view.toScreen(x, y); mark(ctx, sx + s * 0.2, sy + s * 0.2, s * 0.6, false, Render.rgba(tone, 0.95)); }
    }
    if (N.e.stage === 'full' && N.e.text) pill(ctx, view, N, tone, cells.length ? cells : [[Math.floor(view.game.w / 2), 0]], board, light);
    ctx.restore();
  }
  /** The note's pill: its words, then each piece it names drawn small with a tick or a cross, kept inside the board. */
  function pill(ctx, view, N, tone, cells, room, light) {
    const { s } = view.lay, e = N.e, look = view.look;
    const fs = Math.max(10.5, Math.min(13, s * 0.5)), pad = fs * 0.6, ht = fs * 1.75, cz = Math.max(3, Math.round(fs * 0.33));
    ctx.font = '650 ' + fs + 'px ' + Render.FONT;
    ctx.textBaseline = 'middle';
    const icons = (e.icons || []).slice(0, 2), iconW = icons.length ? icons.length * (cz * 4 + fs * 0.9 + 4) + 2 : 0;
    const tw = ctx.measureText(e.text).width + pad * 2 + iconW;
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (const [x, y] of cells) { const [sx, sy] = view.toScreen(x, y); left = Math.min(left, sx); right = Math.max(right, sx + s); top = Math.min(top, sy); bottom = Math.max(bottom, sy + s); }
    const rise = N.reduced ? 0 : (1 - Math.pow(1 - Math.min(1, N.t / N.dur), 2)) * s * 0.25;
    let y = top - ht - s * 0.25 - rise;
    if (y < room.y + 2) y = bottom + s * 0.25;
    y = Math.min(y, room.y + room.h - ht - 2);
    const x = Math.max(room.x + 2, Math.min(room.x + room.w - tw - 2, (left + right) / 2 - tw / 2));
    ctx.fillStyle = light ? 'rgba(255,255,255,0.93)' : 'rgba(20,22,30,0.88)';
    Render.rr(ctx, x, y, tw, ht, ht / 2); ctx.fill();
    ctx.strokeStyle = Render.rgba(tone, 0.7); ctx.lineWidth = 1; Render.rr(ctx, x + 0.5, y + 0.5, tw - 1, ht - 1, ht / 2); ctx.stroke();
    ctx.fillStyle = light ? Render.shade(tone, -0.2) : tone;
    ctx.fillText(e.text, x + pad, y + ht / 2 + 0.5);
    let ix = x + pad + ctx.measureText(e.text).width + 6;
    for (const [id, ok] of icons) {
      const t = Pieces.get(id), b = Pieces.boundsOf(t.rots[0]), py = y + (ht - b.h * cz) / 2;
      for (const [cx, cy] of t.rots[0]) Render.drawCell(ctx, look.skin, view.colorOf(t.color), ix + (cx - b.minX) * cz, py + (b.maxY - cy) * cz, cz);
      ix += b.w * cz + 2;
      mark(ctx, ix, y + ht / 2 - fs * 0.42, fs * 0.84, ok, ok ? (light ? GREEN.light : GREEN.dark) : (light ? ROSE.light : ROSE.dark));
      ix += fs * 0.9 + 4;
    }
  }

  // ---- the player's record ------------------------------------------------------------------------------------------------

  const f1 = (v) => (v == null ? '–' : (Math.round(v * 10) / 10).toFixed(1));
  /** The record as a few rows (this game and the ones before): holes a 100 pieces, the average height, top outs. */
  function recordRows(app, gid) {
    const sm = P.summary(memOf(app), gid);
    const row = (label, now, before) => h('tr', null, h('th', { scope: 'row' }, label), h('td', null, now), h('td', null, before));
    return h('table', { class: 'pt-record' },
      h('thead', null, h('tr', null, h('th', null, ''), h('th', { scope: 'col' }, 'This game'), h('th', { scope: 'col' }, sm.before.games ? 'Earlier (' + sm.before.games + ')' : 'Earlier'))),
      h('tbody', null,
        row('Holes / 100 pieces', f1(sm.now.holes100), f1(sm.before.holes100)),
        row('Average height', f1(sm.now.height), f1(sm.before.height)),
        row('Top outs', sm.now.pieces ? String(sm.now.topouts) : '–', sm.before.pieces ? String(sm.before.topouts) : '–')));
  }

  // ---- the Guide ------------------------------------------------------------------------------------------------------

  /**
   * One small board of a card (P.diagram): the well, the stack and the piece set by the board's cell painter, the rows
   * it clears banded, what the detector found ringed (rose: the shape; green: a good one, or what recovering made),
   * a piece with no spot dashed where it would go, and the board's other needs as a tag (Next, Hold, the speed, keys).
   */
  function diagramCanvas(app, id, which, cell) {
    const d = P.diagram(id, which), theme = app.theme, light = theme.name === 'light';
    const look = Render.makeLook(app.store.state.equipped, theme, 0, true), s = cell, W = d.W * s, H = d.H * s;
    const good = P.BY[id].group === 'good';
    const tone = (good || which === 'recover') && which !== 'avoid' ? (light ? GREEN.light : GREEN.dark) : (light ? ROSE.light : ROSE.dark);
    const c = UI.canvasFor(W + 2, H + 2, (ctx) => {
      ctx.translate(1, 1);
      const gr = ctx.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, theme.wellTop || theme.well); gr.addColorStop(1, theme.wellBottom || theme.well);
      ctx.fillStyle = gr; Render.rr(ctx, -1, -1, W + 2, H + 2, 4); ctx.fill();
      ctx.fillStyle = theme.grid || theme.line;
      for (let x = 1; x < d.W; x++) ctx.fillRect(x * s, 0, 1, H);
      for (let y = 1; y < d.H; y++) ctx.fillRect(0, y * s, W, 1);
      const at = (x, y) => [x * s, (d.H - 1 - y) * s];
      for (const y of d.cleared) { ctx.fillStyle = Render.rgba(light ? GREEN.light : GREEN.dark, 0.22); ctx.fillRect(0, at(0, y)[1], W, s); }
      const pc = new Set((d.piece ? d.piece.cells : []).map(([x, y]) => x + ',' + y));
      for (let y = 0; y < d.H; y++) for (let x = 0; x < d.W; x++) {
        if (!((d.rows[y] >>> x) & 1)) continue;
        const col = d.colors[x + ',' + y] || Pieces.COLOR.GARBAGE, [sx, sy] = at(x, y);
        ctx.globalAlpha = pc.has(x + ',' + y) ? 1 : 0.72;
        Render.drawCell(ctx, look.skin, look.colors[col], sx, sy, s);
      }
      ctx.globalAlpha = 1;
      // The piece set: a line around it, so the eye finds what moved.
      if (d.piece) {
        ctx.strokeStyle = light ? 'rgba(20,24,34,0.8)' : 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.5;
        const keys = pc;
        ctx.beginPath();
        for (const [x, y] of d.piece.cells) {
          const [sx, sy] = at(x, y);
          if (!keys.has(x + ',' + (y + 1))) { ctx.moveTo(sx, sy); ctx.lineTo(sx + s, sy); }
          if (!keys.has(x + ',' + (y - 1))) { ctx.moveTo(sx, sy + s); ctx.lineTo(sx + s, sy + s); }
          if (!keys.has((x - 1) + ',' + y)) { ctx.moveTo(sx, sy); ctx.lineTo(sx, sy + s); }
          if (!keys.has((x + 1) + ',' + y)) { ctx.moveTo(sx + s, sy); ctx.lineTo(sx + s, sy + s); }
        }
        ctx.stroke();
      }
      ctx.strokeStyle = tone; ctx.lineWidth = Math.max(1.5, s * 0.12);
      for (const [x, y] of d.marks || []) { if (y < 0 || y >= d.H) continue; const [sx, sy] = at(x, y); ctx.beginPath(); ctx.arc(sx + s / 2, sy + s / 2, s * 0.3, 0, Math.PI * 2); ctx.stroke(); }
      if (d.ghost) {
        ctx.setLineDash([3, 2]); ctx.lineWidth = 1.5;
        for (const [x, y] of d.ghost.cells) { const [sx, sy] = at(x, y); if (y < d.H) ctx.strokeRect(sx + 1.5, sy + 1.5, s - 3, s - 3); }
        ctx.setLineDash([]);
      }
      // How to avoid: a tick in the corner (nothing made); a recovery: the same.
      if (which === 'avoid' || which === 'recover') mark(ctx, W - s * 1.05, 2, s * 0.9, true, light ? GREEN.light : GREEN.dark);
      const tag = tagOf(d.ctx);
      if (tag) {
        ctx.font = '650 ' + Math.max(9, Math.round(s * 0.62)) + 'px ' + Render.FONT; ctx.textBaseline = 'top';
        const tw = ctx.measureText(tag).width + 6;
        ctx.fillStyle = light ? 'rgba(255,255,255,0.88)' : 'rgba(20,22,30,0.82)'; Render.rr(ctx, 2, 2, tw, s * 0.62 + 6, 4); ctx.fill();
        ctx.fillStyle = theme.fg || (light ? '#222' : '#eee'); ctx.fillText(tag, 5, 5);
      }
    });
    c.className = 'pt-dia';
    c.setAttribute('role', 'img');
    c.setAttribute('aria-label', P.labelsOf(id)[['what', 'happens', 'avoid', 'recover'].indexOf(which)] + ': ' + d.cap);
    c.dataset.ok = String(d.ok);
    return c;
  }
  /** What else a diagram's board needs said, in a word or two. */
  function tagOf(c) {
    if (!c) return '';
    if (c.keys != null) return c.keys + ' keys';
    if (c.level) return 'Level ' + c.level;
    if (c.holdUsed && c.held) return 'Hold ' + c.held;
    if (c.streak) return 'Streak';
    if (c.combo >= 2) return 'Combo';
    if (c.sinceI != null) return c.sinceI + ' since I';
    if (c.visible && c.visible.length) return 'Next ' + c.visible[0];
    return '';
  }

  /** A card: its name and group, the four boards with their captions, the measured cost. */
  function card(app, id, cell) {
    const S = P.BY[id], labels = P.labelsOf(id), card = P.CARDS[id], cost = P.costLine(id);
    const merged = P.SHAPES.filter((x) => x.id !== id && P.cardOf(x.id) === id).map((x) => x.name);
    return h('article', { class: 'pt-card', 'data-card': id, 'data-group': S.group },
      h('header', { class: 'pt-card-h' }, h('span', { class: 'pt-grp' }, (P.GROUPS.find((g) => g[0] === S.group) || [])[1]), h('h3', null, S.name)),
      h('div', { class: 'pt-dias' }, ['what', 'happens', 'avoid', 'recover'].map((w, i) => h('figure', { class: 'pt-fig' },
        diagramCanvas(app, id, w, cell),
        h('figcaption', null, h('span', { class: 'pt-lab' }, labels[i]), h('b', null, card[w].cap))))),
      cost ? h('p', { class: 'pt-cost' }, (S.group === 'good' ? 'Gain: ' : 'Cost: ') + cost.charAt(0).toLowerCase() + cost.slice(1)) : null,
      merged.length ? h('p', { class: 'pt-also' }, 'Also: ' + merged.join(', ')) : null);
  }

  /** The cards in order (by group), each id once. */
  function order() { return [].concat(...P.cardsByGroup().map((g) => g[2])); }

  /**
   * The Guide: a window over the board (the game holds while it is open). at: a card to open on (the last note's), else
   * the index. Returns its handle; its body is redrawn in place as you move between the index and the cards.
   */
  function openGuide(app, at, o) {
    o = o || {};
    if (app.guide && app.guide.el && app.guide.el.isConnected) return app.guide;
    const body = h('div', { class: 'pt-guide' });
    const narrow = () => (root.innerWidth || 800) <= 560;
    const cellFor = () => (narrow() ? Math.max(11, Math.min(15, Math.floor(((root.innerWidth || 360) - 64) / 2 / 7) - 1)) : 13);
    let cur = at && order().includes(at) ? at : null;
    const M = memOf(app);
    const show = (id) => { cur = id; draw(); const f = body.querySelector(id ? '.pt-nav .pt-prev' : '.pt-row'); if (f) f.focus({ preventScroll: true }); body.scrollTop = 0; };
    const draw = () => {
      const ids = order();
      if (cur) {
        const i = ids.indexOf(cur);
        body.replaceChildren(
          h('div', { class: 'pt-nav' },
            h('button', { type: 'button', class: 'btn sm pt-all', onclick: () => show(null) }, ico('chevLeft'), 'All'),
            h('span', { class: 'pt-pos' }, (i + 1) + ' of ' + ids.length),
            h('button', { type: 'button', class: 'icon-btn pt-prev', 'aria-label': 'Previous card', disabled: i <= 0, html: L.Icons.icon('chevLeft'), onclick: () => show(ids[i - 1]) }),
            h('button', { type: 'button', class: 'icon-btn pt-next', 'aria-label': 'Next card', disabled: i >= ids.length - 1, html: L.Icons.icon('chevRight'), onclick: () => show(ids[i + 1]) })),
          card(app, cur, cellFor()));
        return;
      }
      const sum = P.summary(M, o.gid);
      body.replaceChildren(...[
        sum.games ? h('section', { class: 'pt-mine' }, h('h3', null, 'Your play'), recordRows(app, o.gid)) : null,
        ...P.cardsByGroup().map(([g, name, list]) => list.length ? h('section', { class: 'pt-group', 'data-group': g },
          h('h3', null, name, g === 'advanced' ? h('span', { class: 'pt-note' }, P.settingsOf(app.settings).advanced ? 'notes on' : 'notes off') : null),
          h('ul', { class: 'pt-list' }, list.map((id) => {
            const met = !!M.met[id] || P.SHAPES.some((x) => P.cardOf(x.id) === id && M.met[x.id]);
            const learned = P.stageOf(M.seen, id) === 'learned';
            return h('li', null, h('button', { type: 'button', class: 'pt-row' + (met ? ' met' : ''), 'data-card': id, onclick: () => show(id) },
              h('span', { class: 'pt-dot', 'aria-hidden': 'true' }),
              h('span', { class: 'pt-nm' }, P.BY[id].name),
              learned ? h('span', { class: 'pt-tag' }, 'learned') : null,
              h('span', { class: 'pt-c' }, P.costLine(id).split(' · ')[0] || ''),
              h('span', { class: 'pt-sr' }, met ? ' (met)' : '')));
          }))) : null),
        h('p', { class: 'pt-foot' }, 'Measured in bot games: made once in 10 pieces, against not. ',
          h('button', { type: 'button', class: 'pt-reset', onclick: () => { M.seen = {}; app.store.touch(); draw(); } }, 'Show every note again')),
      ].filter(Boolean));
    };
    draw();
    let sx = null, sy = null;
    body.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; });
    body.addEventListener('pointerup', (e) => {
      if (sx == null || !cur) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      sx = null;
      if (Math.abs(dx) > 48 && Math.abs(dx) > 1.5 * Math.abs(dy)) { const ids = order(), i = ids.indexOf(cur), j = i + (dx < 0 ? 1 : -1); if (j >= 0 && j < ids.length) show(ids[j]); }
    });
    const handle = UI.openModal({ title: 'Guide', icon: 'guide', cls: 'modal-guide', width: 720, body, onClose: () => { app.guide = null; if (o.onClose) o.onClose(); } });
    // Arrows step through the cards (wherever focus is in the window); a swipe sideways too.
    handle.el.addEventListener('keydown', (e) => {
      if (!cur || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
      const ids = order(), i = ids.indexOf(cur), j = i + (e.key === 'ArrowRight' ? 1 : -1);
      if (j >= 0 && j < ids.length) { e.preventDefault(); show(ids[j]); }
    });
    app.guide = handle;
    handle.show = show;
    handle.current = () => cur;
    return handle;
  }

  L.PatternsView = { onLock, fitsNow, strip, drawFits, drawNote, openGuide, recordRows, diagramCanvas, card, order, memOf, keysFor, NOTE, NOTE_STILL, MARK };
})(typeof globalThis !== 'undefined' ? globalThis : this);
