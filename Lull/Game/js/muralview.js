// Lull — Mural's look and its place in Free Play (the rules are js/mural.js): every block drawn as its 2 × 2 quarter
// cells in the picture's colours (on the board, in play and in Next, turned with the piece), the place the piece in
// play belongs in outlined with its quarters faintly in it, the ghost as a plain outline, a set that is not in its place
// declined without a sound or a shake (the outline brightens once), Placed and Level in the status bar and the mural's
// progress under the board, the Finished card, the New board window's picture and level (a photo chosen, cropped and
// previewed in its own window), the library's tags, thumbnails and tiles, and the Mural line in Stats.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Recipe, Mural, Render, UI, Library, Pieces, fmtInt, fmtDuration } = L;
  if (!Recipe || !Mural || !UI || !Render) return;
  const { h } = UI;
  const ico = UI.icon;

  // The group's icon: a framed square of four quarters.
  if (L.Icons) L.Icons.I.mural = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    '<rect x="2" y="2" width="12" height="12" rx="2"/><path d="M8 2.5v11M2.5 8h11"/><rect x="3.5" y="3.5" width="3" height="3" rx="0.6" fill="currentColor" stroke="none"/><rect x="9.5" y="9.5" width="3" height="3" rx="0.6" fill="currentColor" stroke="none"/></svg>';

  const now = () => (Render.FREEZE != null ? 4321 : performance.now());
  const rr = (ctx, x, y, w, hh, r) => { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, hh, r); else ctx.rect(x, y, w, hh); };

  // ---- drawing -------------------------------------------------------------------------------------------------------

  /**
   * A block as its four quarters (q: colour numbers [top left, top right, bottom left, bottom right] in pal), in the
   * cell at (sx, sy), s across: a hairline gap round it, and a faint light edge above and shade below so the blocks read.
   */
  function drawBlock(ctx, sx, sy, s, q, pal, alpha, flat) {
    // A finished mural is drawn flat: no gap, no edge, the picture whole.
    const g = flat ? 0 : Math.max(0.5, s * 0.035), x = sx + g, y = sy + g, w = s - 2 * g, hw = w / 2;
    ctx.save();
    if (alpha != null && alpha !== 1) ctx.globalAlpha *= alpha;
    if (flat) { ctx.beginPath(); ctx.rect(x, y, w + 0.5, w + 0.5); } else rr(ctx, x, y, w, w, Math.max(1, s * 0.08));
    ctx.clip();
    const o = 0.35;
    ctx.fillStyle = pal[q[0]]; ctx.fillRect(x, y, hw + o, hw + o);
    ctx.fillStyle = pal[q[1]]; ctx.fillRect(x + hw, y, w - hw, hw + o);
    ctx.fillStyle = pal[q[2]]; ctx.fillRect(x, y + hw, hw + o, w - hw);
    ctx.fillStyle = pal[q[3]]; ctx.fillRect(x + hw, y + hw, w - hw, w - hw);
    if (flat) { ctx.restore(); return; }
    const e = Math.max(1, s * 0.06);
    ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(x, y, w, e); ctx.fillRect(x, y, e, w);
    ctx.fillStyle = 'rgba(0,0,0,0.11)'; ctx.fillRect(x, y + w - e, w, e); ctx.fillRect(x + w - e, y, e, w);
    ctx.restore();
  }

  /** The picture of a board: its mural's (in play), else its recipe's (a retired board in full view). */
  function picOf(game) {
    const X = Mural.extOf(game);
    if (X) return X.plan().pic;
    return game && game.recipe && Mural.on(game.recipe) ? Mural.picture(game.recipe) : null;
  }
  const kOf = (id) => { const m = /^U:(\d+):/.exec(id || ''); return m ? +m[1] : -1; };
  const idxIn = (cells, x, y) => cells.findIndex((c) => c[0] === x && c[1] === y);

  /** The edges of a set of cells that face outside it, as screen segments, for an outline. */
  function outline(view, cells) {
    const set = new Set(cells.map(([x, y]) => x + ',' + y)), s = view.lay.s, out = [];
    for (const [x, y] of cells) {
      const [sx, sy] = view.toScreen(x, y);
      if (!set.has(x + ',' + (y + 1))) out.push([sx, sy, sx + s, sy]);
      if (!set.has(x + ',' + (y - 1))) out.push([sx, sy + s, sx + s, sy + s]);
      if (!set.has((x - 1) + ',' + y)) out.push([sx, sy, sx, sy + s]);
      if (!set.has((x + 1) + ',' + y)) out.push([sx + s, sy, sx + s, sy + s]);
    }
    return out;
  }
  function strokeSegs(ctx, segs) { ctx.beginPath(); for (const [a, b, c, d] of segs) { ctx.moveTo(a, b); ctx.lineTo(c, d); } ctx.stroke(); }

  /** A recipe's picture over a box: c pixels a cell (each quarter c / 2), only the cells set where vals is given. */
  function paintPicture(ctx, pic, w, hh, x0, y0, c, vals) {
    const q = c / 2;
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
      if (vals && !vals[y * w + x]) continue;
      const qs = Mural.quartersAt(pic, hh, x, y), px = x0 + x * c, py = y0 + (hh - 1 - y) * c;
      for (let k = 0; k < 4; k++) {
        ctx.fillStyle = pic.pal[qs[k]];
        const ax = px + (k % 2) * q, ay = py + (k >> 1) * q;
        ctx.fillRect(Math.floor(ax), Math.floor(ay), Math.ceil(ax + q) - Math.floor(ax), Math.ceil(ay + q) - Math.floor(ay));
      }
    }
  }

  // ---- the board view's part ----------------------------------------------------------------------------------------

  const NUDGE_MS = 700;
  const VIEW = {
    key: 'mural', order: 60, dangerRim: false,
    active(game) { return !!picOf(game); },
    // Every own cell, the piece, its ghost and the trays.
    claims: 'rest',
    cell(ctx, v, sx, sy, s, kind, view, at) {
      const g = view.game, pic = picOf(g);
      if (!pic || !at) return false;
      const X = Mural.extOf(g), P = X && X.plan();
      if (kind === 'stack') { drawBlock(ctx, sx, sy, s, Mural.quartersAt(pic, g.h, at.x, at.y), pic.pal, 1, !X || (g.over && g.endKind === 'finished')); return true; }
      if (kind === 'piece') {
        const p = g.piece, pc = P && P.pieces[kOf(p && p.type.id)], i = pc ? idxIn(at.cells, at.x, at.y) : -1;
        if (i < 0) return false;
        drawBlock(ctx, sx, sy, s, Mural.cellQ(pc, p.rot, i), pic.pal);
        return true;
      }
      if (kind === 'ghost') {
        // A plain outline where it would land (its place is drawn by overStack).
        const set = new Set(at.cells.map(([x, y]) => x + ',' + y)), th = view.look.theme, lw = Math.max(1, s * 0.06);
        ctx.save(); ctx.strokeStyle = th.muted || th.line; ctx.globalAlpha = 0.7; ctx.lineWidth = lw; ctx.lineCap = 'round';
        const e = lw / 2, segs = [];
        if (!set.has(at.x + ',' + (at.y + 1))) segs.push([sx + e, sy + e, sx + s - e, sy + e]);
        if (!set.has(at.x + ',' + (at.y - 1))) segs.push([sx + e, sy + s - e, sx + s - e, sy + s - e]);
        if (!set.has((at.x - 1) + ',' + at.y)) segs.push([sx + e, sy + e, sx + e, sy + s - e]);
        if (!set.has((at.x + 1) + ',' + at.y)) segs.push([sx + s - e, sy + e, sx + s - e, sy + s - e]);
        strokeSegs(ctx, segs); ctx.restore();
        return true;
      }
      if (kind === 'tray' && P) {
        for (const e of g.queue) {
          const t = Pieces.get(e.id);
          if (!t || t.rots[e.rot || 0] !== at.cells) continue;
          const pc = P.pieces[kOf(e.id)], i = pc ? idxIn(at.cells, at.x, at.y) : -1;
          if (i < 0) return false;
          drawBlock(ctx, sx, sy, s, Mural.cellQ(pc, e.rot || 0, i), pic.pal, at.alpha);
          return true;
        }
      }
      return false;
    },
    /** The piece in play's place: its quarters faintly, and an outline (solid once a drop would set it there). */
    overStack(ctx, view) {
      const g = view.game, X = Mural.extOf(g), p = g.piece;
      if (!X || g.over || !p) return;
      const pc = X.current(g);
      if (!pc) return;
      const pic = X.plan().pic, s = view.lay.s, th = view.look.theme;
      ctx.save();
      for (let i = 0; i < pc.cells.length; i++) {
        const [x, y] = pc.cells[i], [sx, sy] = view.toScreen(x, y);
        drawBlock(ctx, sx, sy, s, pc.qt[i], pic.pal, 0.45);
      }
      const gy = g.ghostY(p), ready = gy != null && X.exact(g, p.rot, p.x, gy);
      const t = view.muralNudge ? (now() - view.muralNudge) / NUDGE_MS : 1, pulse = t < 1 ? Math.sin(Math.PI * t) : 0;
      const segs = outline(view, pc.cells), lw = Math.max(2, s * (0.1 + 0.06 * pulse));
      ctx.lineCap = 'round';
      // A soft halo under the line, so it reads on any colour of the picture and either theme.
      ctx.strokeStyle = th.name === 'light' ? 'rgba(255,255,255,0.85)' : 'rgba(8,10,16,0.7)'; ctx.lineWidth = lw + 2;
      strokeSegs(ctx, segs);
      ctx.strokeStyle = th.accent; ctx.lineWidth = lw;
      ctx.globalAlpha = ready ? 1 : 0.8 + 0.2 * pulse;
      if (!ready) ctx.setLineDash([Math.max(2, s * 0.24), Math.max(2, s * 0.14)]);
      strokeSegs(ctx, segs);
      ctx.restore();
    },
    busy(view) { return !!view.muralNudge && now() - view.muralNudge < NUDGE_MS; },
    /** The New board preview: the whole picture; a library thumbnail: the picture where the board has blocks. */
    preview(ctx, gm, recipe) {
      if (!Mural.on(recipe)) return;
      const r = Recipe.normalize(recipe), pic = Mural.picture(r);
      if (gm.style === 'thumb') { if (gm.cells) paintPicture(ctx, pic, gm.w, gm.h, gm.x, gm.y, gm.c, gm.cells); return; }
      paintPicture(ctx, pic, gm.w, gm.h, gm.x, gm.y, gm.c, null);
    },
  };
  Recipe.viewPart(VIEW);

  // ---- Free Play: the controller ----------------------------------------------------------------------------------------

  const blank = () => ({ placed: 0, finished: 0, own: 0, levels: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, pics: { coast: 0, still: 0, soft: 0, own: 0 } });
  const statsOf = (store) => {
    const F = store.state.stats.free, B = F.mural || (F.mural = blank()), d = blank();
    for (const k of Object.keys(d)) if (B[k] == null) B[k] = d[k];
    return B;
  };
  const subOf = (r) => Mural.PIC_NAMES[r.mural.pic] + ' · Level ' + r.mural.level;

  function controller(play) {
    const app = play.app;
    const g = () => play.game;
    const X = () => Mural.extOf(play.game);
    return {
      id: 'mural', timeKey: 'mural',

      attach() { play.view.muralNudge = 0; },
      detach() { play.itembar.classList.remove('mu-bar'); play.view.muralNudge = 0; },

      /** A set that would not be in its place: nothing happens but its place brightens once. */
      nudge() { play.view.muralNudge = now(); play.view.dirty = true; },
      /** A drop sets the piece only where it lands exactly in its place; Space on a finished mural brings its card back. */
      gate(act, rep) {
        const gm = g(), x = X();
        if (!gm || !x) return undefined;
        if (gm.over) {
          if ((act === 'drop' || act === 'pause') && !rep && !play.cardOpen && gm.endKind === 'finished') { this.showEnd(); return true; }
          if (act === 'drop' && !rep && play.cardOpen && gm.endKind === 'finished') { this.primary(); return true; }
          return undefined;
        }
        if (act !== 'drop' || !gm.piece) return undefined;
        const p = gm.piece, y = gm.ghostY(p);
        if (y != null && x.exact(gm, p.rot, p.x, y)) return undefined;
        if (!rep) this.nudge();
        return false;
      },
      /** Down: a row lower; resting, it sets only in its place. */
      softDrop(rep) {
        const gm = g(), p = gm && gm.piece, x = X();
        if (!p || !x) return false;
        if (gm.fitsAt(p, p.rot, p.x, p.y - 1)) return !!gm.lower();
        if (rep) return false;
        if (x.exact(gm, p.rot, p.x, p.y)) return !!gm.lower();
        this.nudge();
        return false;
      },
      tapStarts() { const gm = g(); return !!gm && gm.over && gm.endKind === 'finished' && !play.cardOpen; },

      onLock(r) {
        this.base.onLock(r);
        if (!r.mural || !X()) return;
        const st = app.store, gm = g();
        const pay = Library.bank(r.placed * Mural.PAY_CELL);
        if (pay) { st.addLines(pay, 'play'); gm.s.banked = Library.bank((gm.s.banked || 0) + pay); app.refreshWallet(true); }
        statsOf(st).placed++;
        st.touch();
        play.renderStatus();
        play.renderItems();
      },

      /** Placed in Score's place, and the level. */
      status(parts, o) {
        const x = X();
        if (!x) return o.prev;
        const n = x.plan().pieces.length, gm = g(), r = gm.recipe;
        return [o.stat('Placed', fmtInt(x.M.i) + ' of ' + fmtInt(n), null, subOf(r)), o.stat('Level', String(r.mural.level), 'opt', Mural.PIC_NAMES[r.mural.pic])];
      },
      /** The bar under the board: the mural's progress. */
      bar(el) {
        const x = X();
        if (!x) return false;
        const n = x.plan().pieces.length, k = n ? x.M.i / n : 0;
        el.replaceChildren(h('div', { class: 'mu-prog', role: 'progressbar', 'aria-label': 'Mural', 'aria-valuemin': '0', 'aria-valuemax': String(n), 'aria-valuenow': String(x.M.i) },
          h('i', { style: { width: (k * 100).toFixed(2) + '%' } })));
        el.classList.add('mu-bar');
        return true;
      },

      onEnd(kind, silent) {
        const gm = g(), x = X();
        if (kind !== 'finished' || !x) return this.base.onEnd(kind, silent);
        const r = gm.recipe;
        if (!silent) {
          const B = statsOf(app.store);
          B.finished++;
          B.levels[r.mural.level] = (B.levels[r.mural.level] || 0) + 1;
          B.pics[r.mural.pic] = (B.pics[r.mural.pic] || 0) + 1;
          if (r.mural.pic === 'own') B.own++;
          app.store.touch();
          app.sound.play('solve');
          app.achieve({ mode: 'mural', kind: 'finished', pic: r.mural.pic, level: r.mural.level, g: gm });
          if (app.saveNow) app.saveNow();
        }
        this.showEnd();
      },
      showEnd() {
        play.showCard(this.cards.finished(play), 'topout mu-card');
        play.renderStatus();
        play.renderItems();
      },
      /** The Finished card's main button (Space too): this mural kept in the library, and the New board window. */
      primary() {
        play.hideCard();
        play.newBoard('finished');
        if (play.openNewBoard) play.openNewBoard();
      },
      cards: {
        finished(pm) {
          const ctl = pm.ctl, gm = pm.game, x = Mural.extOf(gm), n = x ? x.plan().pieces.length : 0;
          return [
            h('h2', null, 'Finished'),
            h('p', { class: 'cl-sub' }, subOf(gm.recipe)),
            h('p', null, fmtInt(n) + ' pieces' + (gm.s.playMs ? ' in ' + fmtDuration(gm.s.playMs) : '')),
            h('div', { class: 'row' },
              h('button', { class: 'btn', onclick: () => pm.openLibrary() }, ico('boards'), 'Boards'),
              h('button', { class: 'btn', id: 'mu-look', onclick: () => { pm.hideCard(); pm.renderStatus(); } }, 'Look'),
              h('button', { class: 'btn primary', id: 'mu-new', onclick: () => ctl.primary() }, 'New board ', h('kbd', null, 'Space'))),
          ];
        },
      },

      tiles(game) {
        const x = Mural.extOf(game);
        return x ? tilesOf(Mural.summaryOf(x.M, x.plan(), game.recipe)) : [];
      },
    };
  }
  const tilesOf = (ext) => (ext && ext.total ? [[fmtInt(ext.placed) + ' of ' + fmtInt(ext.total), 'Placed'], [Mural.PIC_NAMES[ext.pic] || '', 'Picture']] : []);

  // ---- a photo: chosen, cropped to the board's shape, previewed in the level's colours ------------------------------------

  /** The photo chosen this session (never saved: only its grid is), and where it is cropped. */
  let PHOTO = null, LAST_OWN = null;

  /** A photo file to a canvas at most 800 px across. */
  function loadPhoto(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const k = Math.min(1, 800 / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * k)), hh = Math.max(1, Math.round(img.naturalHeight * k));
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = hh;
        cv.getContext('2d').drawImage(img, 0, 0, w, hh);
        URL.revokeObjectURL(url);
        res(cv);
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('not an image')); };
      img.src = url;
    });
  }
  function setPhoto(cv) { PHOTO = { cv, w: cv.width, h: cv.height, cx: 0.5, cy: 0.5, z: 1 }; return PHOTO; }
  /** Asks for a photo (the system's picker), then fn(PHOTO). */
  function pickPhoto(fn) {
    const old = document.getElementById('mu-file');
    if (old) old.remove();
    const input = h('input', { type: 'file', accept: 'image/*', id: 'mu-file', class: 'mu-file', 'aria-hidden': 'true', tabindex: '-1' });
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const f = input.files && input.files[0];
      input.remove();
      if (!f) return;
      loadPhoto(f).then((cv) => fn(setPhoto(cv))).catch(() => UI.toast('That file is not a photo', 'bad'));
    });
    input.click();
  }
  /** The crop (in the photo's pixels) for a board of aspect a: the largest of that shape, zoomed, about its centre. */
  function cropOf(ph, a) {
    let cw = ph.w, ch = ph.h;
    if (cw / ch > a) cw = ch * a; else ch = cw / a;
    cw /= ph.z; ch /= ph.z;
    const x = Math.max(0, Math.min(ph.w - cw, ph.cx * ph.w - cw / 2)), y = Math.max(0, Math.min(ph.h - ch, ph.cy * ph.h - ch / 2));
    ph.cx = (x + cw / 2) / ph.w; ph.cy = (y + ch / 2) / ph.h;
    return { x, y, w: cw, h: ch };
  }
  /** The photo, as cropped, made a mural's grid at a level: { w, h, pal, px }. */
  function ownFrom(ph, level) {
    const lv = Mural.LEVELS[level], c = cropOf(ph, lv.w / lv.h), S = 4, W = lv.w * 2 * S, H = lv.h * 2 * S;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(ph.cv, c.x, c.y, c.w, c.h, 0, 0, W, H);
    return Mural.fromPixels(ctx.getImageData(0, 0, W, H).data, W, H, lv.w, lv.h, lv.k);
  }

  /**
   * The Photo window: the photo with the crop frame (drag it; Zoom), the frame showing the mural it makes in the level's
   * colours; Use photo makes it the picture. api: the New board window's.
   */
  function openCrop(api) {
    const r = api.recipe, level = r.mural.level, lv = Mural.LEVELS[level], a = lv.w / lv.h, ph = PHOTO;
    const vw = Math.min(root.innerWidth || 520, 560), BOX = Math.max(200, Math.min(320, vw - 72)), BOXH = Math.max(180, Math.min(300, (root.innerHeight || 700) - 300));
    const k = Math.min(BOX / ph.w, BOXH / ph.h), cw = Math.round(ph.w * k), chh = Math.round(ph.h * k);
    const dpr = Math.min(3, root.devicePixelRatio || 1);
    const cv = h('canvas', { class: 'mu-crop', 'aria-label': 'Crop: drag to move', role: 'img', style: { width: cw + 'px', height: chh + 'px' } });
    cv.width = Math.round(cw * dpr); cv.height = Math.round(chh * dpr);
    let own = null, dragging = false;
    const draw = () => {
      const ctx = cv.getContext('2d'), c = cropOf(ph, a);
      ctx.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
      ctx.clearRect(0, 0, ph.w, ph.h);
      ctx.drawImage(ph.cv, 0, 0);
      ctx.fillStyle = 'rgba(10,12,18,0.55)';
      ctx.fillRect(0, 0, ph.w, c.y); ctx.fillRect(0, c.y + c.h, ph.w, ph.h - c.y - c.h);
      ctx.fillRect(0, c.y, c.x, c.h); ctx.fillRect(c.x + c.w, c.y, ph.w - c.x - c.w, c.h);
      if (own && !dragging) {
        const qw = c.w / own.w, qh = c.h / own.h;
        for (let y = 0; y < own.h; y++) for (let x = 0; x < own.w; x++) { ctx.fillStyle = own.pal[Mural.B36.indexOf(own.px[y * own.w + x])]; ctx.fillRect(c.x + x * qw, c.y + y * qh, qw + 0.6 / k, qh + 0.6 / k); }
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
      ctx.strokeRect(c.x * k + 1, c.y * k + 1, c.w * k - 2, c.h * k - 2);
    };
    const quant = () => { own = ownFrom(ph, level); draw(); };
    let drag = null;
    cv.addEventListener('pointerdown', (e) => { drag = { id: e.pointerId, x: e.clientX, y: e.clientY, cx: ph.cx, cy: ph.cy }; dragging = true; try { cv.setPointerCapture(e.pointerId); } catch (err) { /* no capture */ } e.preventDefault(); });
    cv.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      ph.cx = drag.cx + (e.clientX - drag.x) / k / ph.w; ph.cy = drag.cy + (e.clientY - drag.y) / k / ph.h;
      draw();
    });
    const up = (e) => { if (!drag || e.pointerId !== drag.id) return; drag = null; dragging = false; quant(); };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    // The arrows move the frame too.
    cv.tabIndex = 0;
    cv.addEventListener('keydown', (e) => {
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (!d) return;
      e.preventDefault(); e.stopPropagation();
      ph.cx += d[0] * 0.03; ph.cy += d[1] * 0.03; quant();
    });
    const zoom = h('input', { type: 'range', class: 'mu-zoom', min: '1', max: '4', step: '0.05', value: String(ph.z), 'aria-label': 'Zoom' });
    zoom.addEventListener('input', () => { ph.z = +zoom.value; quant(); });
    const again = h('button', { type: 'button', class: 'btn sm', id: 'mu-again', onclick: () => pickPhoto(() => { handle.close(); openCrop(api); }) }, 'Another photo');
    const body = h('div', { class: 'mu-cropper' }, h('div', { class: 'mu-stage' }, cv),
      h('label', { class: 'mu-zrow' }, h('span', null, 'Zoom'), zoom), h('div', { class: 'mu-crow' }, again));
    const handle = UI.openModal({
      title: 'Photo', icon: 'mural', cls: 'modal-mural-photo', body,
      buttons: [{ label: 'Cancel' }, { label: 'Use photo', kind: 'primary', onClick: () => {
        if (!own) quant();
        LAST_OWN = own;
        api.choose('mural', { pic: 'own', level, own });
      } }],
    });
    quant();
    setTimeout(() => cv.focus(), 40);
    handle.mural = { get own() { return own; }, quant, draw, photo: ph };
    L.MuralView.lastCrop = handle;
    return handle;
  }

  // ---- the New board window, the library, Stats ---------------------------------------------------------------------------

  /** A picture's chip sample: the picture small (a photo not chosen yet: a plain frame with a hill and a sun). */
  function sample(ctx, w, hh, r, pic) {
    if (pic === 'own' && !(r.mural.pic === 'own' || LAST_OWN)) {
      ctx.strokeStyle = 'currentColor'; ctx.fillStyle = 'currentColor'; ctx.lineWidth = 1.4;
      rr(ctx, 1.5, 1.5, w - 3, hh - 3, 3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(3, hh - 5); ctx.lineTo(w * 0.42, hh * 0.5); ctx.lineTo(w - 3, hh - 5); ctx.closePath(); ctx.globalAlpha = 0.55; ctx.fill(); ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(w * 0.68, hh * 0.3, w * 0.12, 0, Math.PI * 2); ctx.fill();
      return;
    }
    const rec = Recipe.normalize(pic === 'own' ? (r.mural.pic === 'own' ? r : { mode: 'mural', mural: { pic: 'own', level: r.mural.level, own: LAST_OWN } }) : { mode: 'mural', mural: { pic, level: r.mural.level } });
    const p = Mural.picture(rec), lv = Mural.levelOf(rec), c = Math.min(w / lv.w, hh / lv.h);
    ctx.save(); rr(ctx, 0, 0, w, hh, 3); ctx.clip();
    paintPicture(ctx, p, lv.w, lv.h, (w - lv.w * c) / 2, (hh - lv.h * c) / 2, c, null);
    ctx.restore();
  }

  Recipe.uiPart({
    key: 'mural', order: 60, mode: 'mural', name: 'Mural',
    tab: 'mode',
    /** The picture (three of Lull's own, or a photo) and the level, 1-5. */
    panel(r, api) {
      if (!Mural.on(r)) return null;
      const chip = (pic) => {
        const kids = [UI.canvasFor(20, 28, (ctx, w, hh) => sample(ctx, w, hh, r, pic)), h('span', { class: 'nm' + (Mural.PIC_NAMES[pic].length > 8 ? ' long' : '') }, Mural.PIC_NAMES[pic])];
        if (pic !== 'own') return api.option('mural.pic', pic, 'nb-chip mu-pic', kids);
        const on = r.mural.pic === 'own';
        return h('button', { type: 'button', class: 'nb-chip mu-pic', 'data-path': 'mural.pic', 'data-value': 'own', 'aria-pressed': String(on), 'aria-label': on ? 'Photo, crop again' : 'Photo, choose one',
          onclick: () => {
            if (PHOTO) { openCrop(api); return; }
            if (!on && LAST_OWN) { api.choose('mural', { pic: 'own', level: r.mural.level, own: LAST_OWN }); return; }
            pickPhoto(() => openCrop(api));
          } }, kids);
      };
      // A photo chosen at another level: cropped again for this one (its own grid and colours).
      if (r.mural.pic === 'own' && PHOTO) {
        const lv = Mural.levelOf(r);
        if (r.mural.own.w !== lv.w * 2 || r.mural.own.h !== lv.h * 2) setTimeout(() => { const own = ownFrom(PHOTO, r.mural.level); LAST_OWN = own; api.choose('mural', { pic: 'own', level: r.mural.level, own }); }, 0);
      }
      return h('div', { class: 'mu-panel' },
        h('div', { class: 'nb-chips mu-pics', role: 'group', 'aria-label': 'Picture' }, Mural.PIC_IDS.map(chip)),
        h('div', { class: 'cl-row mu-lvrow' }, h('span', { class: 'cl-nm' }, 'Level'),
          h('div', { class: 'seg cl-seg mu-lv', role: 'group', 'aria-label': 'Level' }, Mural.LEVEL_IDS.map((n) => api.option('mural.level', n, 'nb-level', String(n))))));
    },
    presets(r) { if (!Mural.on(r)) return null; const lv = Mural.levelOf(r); return [['Level ' + r.mural.level, lv.w, lv.h]]; },
    said(path, v) {
      if (path === 'mural.level') return 'Level ' + v;
      if (path === 'mural.pic') return Mural.PIC_NAMES[v] || null;
      if (path === 'mural') return v && Mural.PIC_NAMES[v.pic] ? Mural.PIC_NAMES[v.pic] : null;
      return null;
    },
    tags: (r, x, info) => {
      if (!Mural.on(r)) return [];
      if (info && info.ended === 'finished') return [{ text: 'Finished', cls: 'full cleared' }];
      return [];
    },
    tiles: (ext) => tilesOf(ext),
    endName: (reason) => (reason === 'finished' ? 'Finished' : null),
  });

  UI.statRow('mural', {
    sub: 'free', at: 'end',
    render(app, stats) {
      const P = stats.free && stats.free.mural;
      if (!P || !(P.placed || P.finished)) return null;
      const rows = [['Time', fmtDuration((stats.timeMs && stats.timeMs.mural) || 0)], ['Murals finished', fmtInt(P.finished || 0)], ['Pieces placed', fmtInt(P.placed || 0)]];
      for (const n of Mural.LEVEL_IDS) if (P.levels && P.levels[n]) rows.push(['Level ' + n, fmtInt(P.levels[n])]);
      if (P.own) rows.push(['From photos', fmtInt(P.own)]);
      return [h('h4', null, 'Mural'), h('table', { class: 'st' }, rows.map(([l, v]) => h('tr', null, h('td', null, l), h('td', null, v))))];
    },
  });

  L.MuralView = { controller, drawBlock, VIEW, openCrop, pickPhoto, setPhoto, ownFrom, cropOf, get photo() { return PHOTO; }, lastCrop: null };
})(typeof globalThis !== 'undefined' ? globalThis : this);
