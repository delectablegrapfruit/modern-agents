/* Reader: paginated (single/two-page) or vertically scrolling EPUB rendering inside a sandboxed iframe,
   themes & typography, mouse-wheel/trackpad page turning, contents/bookmarks/notes, highlights, search,
   reading-time statistics and PDF viewing via the browser's built-in viewer. */
(function (global) {
  'use strict';
  const $ = s => document.querySelector(s);
  const el = U.el;

  const THEMES = {
    original: { name: 'Original', bg: '#ffffff', fg: '#1c1c1e', accent: '#007aff', keepColors: true },
    quiet:    { name: 'Quiet',    bg: '#3d3d3f', fg: '#e4e4e7', accent: '#7cc0ff', dark: true },
    paper:    { name: 'Paper',    bg: '#f8f1e2', fg: '#4a3c2d', accent: '#8a5a2b' },
    bold:     { name: 'Bold',     bg: '#ffffff', fg: '#000000', accent: '#007aff', bold: true },
    calm:     { name: 'Calm',     bg: '#2e2926', fg: '#e8dece', accent: '#d6a35c', dark: true },
    focus:    { name: 'Focus',    bg: '#000000', fg: '#f5f5f7', accent: '#ffd60a', dark: true, focus: true },
  };
  const NIGHT_MAP = { original: 'focus', paper: 'calm', bold: 'focus' };
  const FONTS = [
    { id: 'original', name: 'Original', css: null },
    { id: 'athelas', name: 'Athelas', css: 'Athelas, "Iowan Old Style", Georgia, serif' },
    { id: 'charter', name: 'Charter', css: 'Charter, "Bitstream Charter", "Sitka Text", Georgia, serif' },
    { id: 'georgia', name: 'Georgia', css: 'Georgia, "Times New Roman", serif' },
    { id: 'iowan', name: 'Iowan', css: '"Iowan Old Style", Georgia, serif' },
    { id: 'newyork', name: 'New York', css: '"New York", ui-serif, "Iowan Old Style", Georgia, serif' },
    { id: 'palatino', name: 'Palatino', css: 'Palatino, "Palatino Linotype", "Book Antiqua", "URW Palladio L", Georgia, serif' },
    { id: 'sanfrancisco', name: 'San Francisco', css: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif' },
    { id: 'seravek', name: 'Seravek', css: 'Seravek, "Gill Sans", "Trebuchet MS", Verdana, sans-serif' },
    { id: 'times', name: 'Times New Roman', css: '"Times New Roman", Times, "Liberation Serif", serif' },
  ];
  const HL_COLORS = { yellow: '#ffd60a', green: '#30d158', blue: '#5ac8fa', pink: '#ff6482', purple: '#bf5af2' };
  const LINE_HEIGHTS = { tight: 1.3, normal: 1.55, loose: 1.85 };
  /* Text column width. Paginated: side margin of each page. Scrolling: maximum column width. */
  const TEXT_WIDTH = { narrow: { margin: 120, scroll: 620 }, medium: { margin: 76, scroll: 880 }, wide: { margin: 44, scroll: 1120 }, full: { margin: 32, scroll: Infinity } };
  const WHEEL_THRESHOLD = { low: 140, medium: 60, high: 24 };
  const M_TOP = 68, M_BOTTOM = 56;          // page margins that keep text clear of the floating toolbar / footer
  const SCROLL_TOP = 84, SCROLL_SIDE = 36;  // vertical-scrolling layout

  const BASE_CSS = `
html, body { margin: 0 !important; padding: 0 !important; }
html { height: 100%; font-size: var(--fs, 16px); background: var(--bg, #fff) !important; color-scheme: light; scrollbar-color: var(--fg-3, rgba(0,0,0,0.3)) transparent; scrollbar-width: thin; }
html.dark { color-scheme: dark; }
::-webkit-scrollbar { width: 12px; height: 12px; background: transparent; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--fg-3, rgba(0,0,0,0.3)); border-radius: 8px; border: 3px solid transparent; background-clip: padding-box; }
::-webkit-scrollbar-thumb:hover { background: var(--fg-2, rgba(0,0,0,0.5)); border: 3px solid transparent; background-clip: padding-box; }
body { height: 100%; overflow: hidden; background: transparent !important; color: var(--fg, #000); font-size: 1rem; line-height: var(--lh, 1.55); -webkit-text-size-adjust: 100%; text-rendering: optimizeLegibility; overscroll-behavior: none; }
body.scroll { overflow-y: auto; overflow-x: hidden; height: auto; min-height: 100%; }
.book-root { position: relative; box-sizing: border-box; }
body.paginated .book-root { height: var(--col-h); width: var(--box-w); margin: var(--m-top) var(--m-side) 0 !important; column-count: var(--cols); column-gap: var(--gap); column-fill: auto; overflow: visible; }
body.scroll .book-root { max-width: var(--scroll-w); margin: 0 auto !important; padding: var(--scroll-top) var(--scroll-side) 45vh !important; }
.books-section { break-before: column; -webkit-column-break-before: always; }
.books-section:first-child { break-before: auto; -webkit-column-break-before: auto; }
body.scroll .books-section { break-before: auto; -webkit-column-break-before: auto; margin-bottom: 4em !important; }
.books-section, .book-body { width: auto !important; max-width: none !important; min-width: 0 !important; margin: 0 !important; padding: 0 !important; height: auto !important; min-height: 0 !important; max-height: none !important; position: static !important; overflow: visible !important; columns: auto !important; column-count: auto !important; float: none !important; transform: none !important; }
.book-body { font-size: 1em !important; }
.book-end { height: 0; }
img, svg, video, canvas { max-width: 100% !important; max-height: var(--col-h, 100vh) !important; height: auto; box-sizing: border-box; object-fit: contain; break-inside: avoid; -webkit-column-break-inside: avoid; }
body.scroll img, body.scroll svg, body.scroll video { max-height: 90vh !important; }
figure { break-inside: avoid; margin-left: 0; margin-right: 0; max-width: 100%; }
table { max-width: 100% !important; } pre { white-space: pre-wrap !important; overflow-wrap: anywhere; }
h1, h2, h3, h4, h5, h6 { break-after: avoid; -webkit-column-break-after: avoid; }
.books-section, .books-section :is(p, li, dd, dt, blockquote, div, figcaption, td, th) { line-height: var(--lh, 1.55) !important; }
.books-section { -webkit-hyphens: var(--hyphens, auto); hyphens: var(--hyphens, auto); overflow-wrap: break-word; }
body.justify .books-section p { text-align: justify !important; }
body.font-custom .books-section, body.font-custom .books-section :not(pre, code, kbd, samp, tt, var) { font-family: var(--font-family) !important; }
body.theme-bold .books-section :is(p, li, dd, dt, td, th, blockquote, figcaption, div) { font-weight: 600 !important; }
body.theme-focus .books-section { letter-spacing: 0.01em; word-spacing: 0.06em; }
body:not(.keep-colors) .books-section, body:not(.keep-colors) .books-section *:not(.books-hl):not(img):not(svg):not(svg *) { color: var(--fg) !important; background-color: transparent !important; border-color: var(--fg-3) !important; text-shadow: none !important; }
body:not(.keep-colors) .books-section a, body:not(.keep-colors) .books-section a * { color: var(--accent) !important; }
body.theme-dark img { filter: brightness(0.92); }
a { color: var(--accent); }
span.books-hl { background: var(--hl); color: inherit; border-radius: 2px; box-decoration-break: clone; -webkit-box-decoration-break: clone; padding: 0.06em 0; cursor: pointer; }
span.books-hl.underline { background: transparent; border-bottom: 2px solid var(--hl); text-decoration: none; }
::selection { background: color-mix(in srgb, var(--accent, #007aff) 32%, transparent); }
body:not(.keep-colors) ::selection { background: color-mix(in srgb, var(--accent, #007aff) 45%, transparent); }
p.books-error { text-align: center; opacity: 0.6; margin-top: 30%; }
`;

  const Reader = {
    isOpen: false, book: null, epub: null, sections: [], secEls: [], doc: null, win: null, frame: null, root: null,
    layout: null, page: 0, sectionStarts: [], tocEntries: [], highlights: [], bookmarks: [],
    _wheel: { acc: 0, last: 0, lastDelta: 0, locked: false, zoom: 0 }, _ticker: null, _pendingSecs: 0, _pagesTurned: 0, _lastInteraction: 0,
    _saveTimer: null, _endShown: false, _hlPopover: null, _relayoutTimer: null, _chromeTimer: null, _pdfURL: null, lastError: null,
    THEMES, FONTS, HL_COLORS, TEXT_WIDTH,

    init() {
      this.frame = $('#rd-frame');
      const set = (id, icon, size) => { const b = $('#' + id); if (b) b.insertAdjacentHTML('afterbegin', Icons.icon(icon, { size: size || 18 })); };
      set('rd-back', 'chevronLeft', 18); set('rd-toc', 'toc'); set('rd-appearance', 'textformat', 22); set('rd-search', 'search'); set('rd-bookmark', 'bookmark'); set('rd-fullscreen', 'fullscreen', 16);
      set('rd-prev', 'chevronLeft', 22); set('rd-next', 'chevronRight', 22);
      $('#rd-back').addEventListener('click', () => this.close());
      $('#rd-toc').addEventListener('click', () => this.openContents());
      $('#rd-appearance').addEventListener('click', () => this.openAppearance());
      $('#rd-search').addEventListener('click', () => this.openSearch());
      $('#rd-bookmark').addEventListener('click', () => this.toggleBookmark());
      $('#rd-fullscreen').addEventListener('click', () => this.toggleFullscreen());
      $('#rd-prev').addEventListener('click', () => { this.prev(); this.touch(); });
      $('#rd-next').addEventListener('click', () => { this.next(); this.touch(); });
      this.initTimeline();
      $('#reader').addEventListener('mouseleave', () => $('#rd-stage').classList.remove('near-left', 'near-right'));
      document.addEventListener('fullscreenchange', () => this.refreshChrome());
      window.addEventListener('app:fullscreen', () => this.refreshChrome());
      window.addEventListener('settings:change', e => this.onSettingChange(e.detail.key));
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (this.isOpen) { this.applyTheme(); this.renderHighlights(); } });
      new ResizeObserver(() => { if (this.isOpen && this.doc) { clearTimeout(this._relayoutTimer); this._relayoutTimer = setTimeout(() => this.relayout(), 120); } }).observe($('#rd-stage'));
      $('#reader').addEventListener('mousemove', e => this.onMouseMove(e, false));
      this._onKey = e => this.onKey(e);
    },

    /* ------------------------------------------------------------------ open / close */
    async open(book) {
      if (this.isOpen) await this.close({ silent: true });
      UI.closeAll();
      this.book = book; this.isOpen = true; this._endShown = false; this.page = 0; this.layout = null; this._pagesTurned = 0; this.lastError = null;
      const reader = $('#reader'); reader.hidden = false; reader.classList.remove('chrome-hidden');
      $('#rd-book-title').textContent = book.title;
      for (const id of ['rd-toc', 'rd-appearance', 'rd-search', 'rd-bookmark']) $('#' + id).disabled = false;
      $('#rd-pdf').hidden = true; $('#rd-timeline').hidden = false;
      $('#rd-stage').classList.remove('near-left', 'near-right');
      this._showLoading(`Opening “${book.title}”…`);
      this.applyTheme();
      document.addEventListener('keydown', this._onKey);
      try {
        const file = await DB.get('files', book.fileId);
        if (!file) throw new Error('The book’s file is missing from local storage.');
        if (book.kind === 'pdf') { await this.openPDF(book, file.blob); return; }
        if (!Zip.supported) throw new Error('This browser cannot open EPUB files (DecompressionStream is unavailable).');
        const epub = await EPUB.open(file.blob);
        this.epub = epub;
        const { sections, css, words } = await epub.loadAll((i, n) => this._showLoading(`Preparing ${i} of ${n}…`));
        if (!this.isOpen || this.book !== book) return; // closed while loading
        this.sections = sections;
        if (words && words !== book.words) Library.updateBook(book.id, { words }, { silent: true });
        const anns = Library.annotationsFor(book.id);
        this.highlights = anns.filter(a => a.type !== 'bookmark'); this.bookmarks = anns.filter(a => a.type === 'bookmark');
        this._writeDocument(css);
        await this._waitForAssets();
        this.applyTextSettings();
        this.buildTocEntries();
        await this.relayout({ restore: book.progress?.locator || null });
        this.renderHighlights();
        this._hideLoading();
        this.win.focus();
        this.refreshChrome();
        Library.updateBook(book.id, { lastOpenedAt: Date.now() }, { silent: true });
        this.startTicker();
      } catch (e) {
        console.error(e);
        this.lastError = e && e.message ? e.message : String(e);
        this._hideLoading();
        if (!(global.App && App._selfTesting)) await UI.sheet({ alert: true, icon: 'warning', title: 'The book could not be opened', message: e.message || String(e) });
        this.close();
      }
    },
    async openPDF(book, blob) {
      const url = URL.createObjectURL(blob); this._pdfURL = url;
      const wrap = $('#rd-pdf'); wrap.innerHTML = ''; wrap.hidden = false;
      wrap.appendChild(el('iframe', { src: url + '#view=FitH', title: book.title }));
      wrap.appendChild(el('div.pdf-note', 'PDF pages are rendered by the browser’s built-in viewer'));
      this._hideLoading();
      $('#rd-chapter').textContent = 'PDF'; $('#rd-page').textContent = book.pages ? U.plural(book.pages, 'page') : ''; $('#rd-left').textContent = U.fmtBytes(book.fileSize);
      for (const id of ['rd-toc', 'rd-search', 'rd-bookmark']) $('#' + id).disabled = true;
      $('#rd-prev').disabled = true; $('#rd-next').disabled = true; $('#rd-spine').hidden = true;
      $('#rd-timeline').hidden = true;
      this.refreshChrome();
      Library.updateBook(book.id, { lastOpenedAt: Date.now() }, { silent: true });
      this.startTicker(); this.touch();
    },
    async close(opts = {}) {
      if (!this.isOpen) return;
      clearTimeout(this._saveTimer);
      try { this.saveProgress(); } catch (e) { /* ignore */ }
      await this.flushStats(); this.stopTicker();
      this.hideHLPopover(); UI.closeAll();
      document.removeEventListener('keydown', this._onKey);
      clearTimeout(this._chromeTimer); this._chromeTimer = null;
      this._watchScroll(false);
      if (this.epub) { this.epub.dispose(); this.epub = null; }
      if (this._pdfURL) { URL.revokeObjectURL(this._pdfURL); this._pdfURL = null; }
      $('#rd-pdf').innerHTML = ''; $('#rd-pdf').hidden = true;
      $('#rd-stage').querySelectorAll('.rd-end-card').forEach(n => n.remove());
      if (this.frame) { const fresh = this.frame.cloneNode(false); this.frame.replaceWith(fresh); this.frame = fresh; }
      this.doc = null; this.win = null; this.root = null; this.layout = null; this.sections = []; this.secEls = []; this.tocEntries = []; this.highlights = []; this.bookmarks = [];
      $('#reader').hidden = true; this.isOpen = false;
      if (document.fullscreenElement && !opts.keepFullscreen) document.exitFullscreen().catch(() => {});
      await Library.refreshAnnotations();
      const closed = this.book; this.book = null;
      if (!opts.silent) { Library.render(); $('#view').focus(); }
      return closed;
    },
    _showLoading(text) { $('#rd-loading').hidden = false; $('#rd-loading-text').textContent = text; },
    _hideLoading() { $('#rd-loading').hidden = true; },

    _writeDocument(css) {
      const fresh = this.frame.cloneNode(false); fresh.hidden = false;
      this.frame.replaceWith(fresh); this.frame = fresh;
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style id="book-css">${css}</style><style id="base-css">${BASE_CSS}</style></head><body>` +
        `<div class="book-root" id="book-root">` +
        this.sections.map(s => `<section class="books-section" id="sec-${s.idx}" data-spine="${s.idx}"><div class="book-body${s.bodyClass ? ' ' + U.esc(s.bodyClass) : ''}"${s.bodyId ? ` id="${U.esc(s.bodyId)}"` : ''}>${s.html}</div></section>`).join('') +
        `<div class="book-end" id="book-end"></div></div></body></html>`;
      const doc = fresh.contentDocument;
      doc.open(); doc.write(html); doc.close();
      this.doc = fresh.contentDocument; this.win = fresh.contentWindow; this.root = this.doc.getElementById('book-root');
      this.secEls = this.sections.map(s => this.doc.getElementById('sec-' + s.idx));
      this._bindDoc();
    },
    async _waitForAssets() {
      const imgs = [...this.doc.images].filter(i => !i.complete);
      const waits = imgs.map(i => new Promise(r => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); }));
      if (this.doc.fonts && this.doc.fonts.ready) waits.push(this.doc.fonts.ready.catch(() => {}));
      await Promise.race([Promise.all(waits), U.sleep(4000)]);
      await U.nextFrame();
    },
    _bindDoc() {
      const doc = this.doc;
      doc.addEventListener('wheel', e => this.onWheel(e), { passive: false });
      doc.addEventListener('keydown', this._onKey);
      doc.addEventListener('mouseup', () => setTimeout(() => this.onSelectionEnd(), 0));
      doc.addEventListener('mousedown', e => { this.touch(); if (!(e.target.closest && e.target.closest('.books-hl'))) this.hideHLPopover(); });
      doc.addEventListener('click', e => this.onDocClick(e));
      doc.addEventListener('mousemove', e => this.onMouseMove(e, true));
      doc.addEventListener('scroll', U.throttle(() => this.onScroll(), 80), { passive: true });
      doc.addEventListener('contextmenu', e => {
        const sel = this.win.getSelection();
        if (sel && !sel.isCollapsed) { e.preventDefault(); this.onSelectionEnd(); }
        else if (global.App && App.shell && !e.altKey) e.preventDefault();
      });
    },

    /* ------------------------------------------------------------------ theme & type */
    effectiveTheme() {
      let id = Settings.get('theme'); if (!THEMES[id]) id = 'original';
      if (Settings.get('autoNight') && App.systemDark() && NIGHT_MAP[id]) id = NIGHT_MAP[id];
      return id;
    },
    applyTheme() {
      const id = this.effectiveTheme(), t = THEMES[id];
      const reader = $('#reader');
      reader.style.setProperty('--rd-bg', t.bg); reader.style.setProperty('--rd-fg', t.fg); reader.style.setProperty('--rd-accent', t.accent);
      reader.dataset.theme = id;
      reader.classList.toggle('rd-dark', !!t.dark);
      $('#rd-pdf').dataset.theme = id;
      if (this.doc && this.doc.body) {
        const b = this.doc.body, de = this.doc.documentElement;
        b.classList.toggle('theme-dark', !!t.dark); b.classList.toggle('theme-bold', !!t.bold); b.classList.toggle('theme-focus', !!t.focus); b.classList.toggle('keep-colors', !!t.keepColors);
        de.classList.toggle('dark', !!t.dark);
        de.style.setProperty('--fg', t.fg); de.style.setProperty('--bg', t.bg); de.style.setProperty('--accent', t.accent);
        de.style.setProperty('--fg-2', t.dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)');
        de.style.setProperty('--fg-3', t.dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.25)');
      }
    },
    applyTextSettings() {
      if (!this.doc) return;
      const de = this.doc.documentElement, body = this.doc.body;
      de.style.setProperty('--fs', (16 * Settings.get('fontSize') / 100).toFixed(2) + 'px');
      de.style.setProperty('--lh', String(LINE_HEIGHTS[Settings.get('lineHeight')] || 1.55));
      const font = FONTS.find(f => f.id === Settings.get('font')) || FONTS[0];
      body.classList.toggle('font-custom', !!font.css); de.style.setProperty('--font-family', font.css || 'inherit');
      body.classList.toggle('justify', !!Settings.get('justify'));
      de.style.setProperty('--hyphens', Settings.get('hyphenate') ? 'auto' : 'manual');
      this.applyTheme();
    },
    changeFontSize(delta) { Settings.set('fontSize', U.clamp(Math.round((Settings.get('fontSize') + delta) / 5) * 5, 60, 240)); },
    onSettingChange(key) {
      if (!this.isOpen || !this.doc) return;
      if (['theme', 'autoNight'].includes(key)) { const loc = this.anchor || this.currentLocator(); this.applyTheme(); this.renderHighlights(); this._queueRelayout(loc); }
      else if (['font', 'fontSize', 'lineHeight', 'justify', 'hyphenate'].includes(key)) { const loc = this.anchor || this.currentLocator(); this.applyTextSettings(); this._queueRelayout(loc); }
      else if (['layout', 'spread', 'textWidth'].includes(key)) this._queueRelayout(this.anchor || this.currentLocator());
      else if (['showPageNumbers', 'showChapterProgress'].includes(key)) this.updateUI();
    },
    _queueRelayout(loc) { if (loc) this.anchor = loc; clearTimeout(this._relayoutTimer); this._relayoutTimer = setTimeout(() => this.relayout(), 40); },

    /* ------------------------------------------------------------------ layout */
    async relayout(opts = {}) {
      if (!this.doc || !this.isOpen || this.book?.kind === 'pdf') return;
      const restore = opts.restore !== undefined ? opts.restore : (this.anchor || (this.layout ? this.currentLocator() : null));
      if (restore) this.anchor = restore;
      const stage = $('#rd-stage');
      const W = stage.clientWidth, H = stage.clientHeight;
      const mode = Settings.get('layout') === 'scroll' ? 'scroll' : 'paginated';
      const spread = Settings.get('spread');
      const tw = TEXT_WIDTH[Settings.get('textWidth')] || TEXT_WIDTH.medium;
      const mSide = tw.margin;
      const cols = mode === 'paginated' ? (spread === 'double' ? 2 : spread === 'single' ? 1 : (W >= 1000 ? 2 : 1)) : 1;
      const gap = mSide * 2; // keeps neighbouring columns fully outside the viewport in single-page mode too
      const boxW = Math.max(200, W - 2 * mSide);
      const colW = (boxW - gap * (cols - 1)) / cols;
      const step = colW + gap;
      const colH = Math.max(200, H - M_TOP - M_BOTTOM);
      const scrollW = Math.min(tw.scroll === Infinity ? Infinity : tw.scroll, Math.max(320, W - 2 * SCROLL_SIDE));
      const de = this.doc.documentElement, body = this.doc.body;
      de.style.setProperty('--cols', String(cols)); de.style.setProperty('--gap', gap + 'px'); de.style.setProperty('--box-w', boxW + 'px');
      de.style.setProperty('--col-h', colH + 'px'); de.style.setProperty('--col-w', colW + 'px'); de.style.setProperty('--m-top', M_TOP + 'px'); de.style.setProperty('--m-side', mSide + 'px');
      de.style.setProperty('--scroll-w', scrollW + 'px'); de.style.setProperty('--scroll-top', SCROLL_TOP + 'px'); de.style.setProperty('--scroll-side', SCROLL_SIDE + 'px');
      body.classList.toggle('paginated', mode === 'paginated'); body.classList.toggle('scroll', mode === 'scroll');
      $('#rd-spine').hidden = cols !== 2;
      this.layout = { mode, cols, colW, gap, step, colH, mSide, W, H, total: 1 };
      await U.nextFrame(); await U.nextFrame();
      if (!this.doc) return;
      // A layout switch must not inherit the other axis' scroll offset (pages would sit shifted up / scrolling shifted left).
      if (mode === 'paginated') this.se.scrollTop = 0; else this.se.scrollLeft = 0;
      this.measure();
      if (restore) this.goToLocator(restore, { instant: true, keepAnchor: true });
      else this.goTo(mode === 'paginated' ? this.page : 0, { instant: true, keepAnchor: true });
      this.recomputeBookmarkCols();
      this.renderTimelineMarks();
      this.updateUI();
      this._watchScroll(mode === 'scroll');
    },
    /* Vertical scrolling: besides scroll events, poll the position so progress never stalls (engines differ in event delivery). */
    _watchScroll(on) {
      clearInterval(this._scrollPoll); this._scrollPoll = null;
      if (!on) return;
      this._lastY = this.currentY();
      this._scrollPoll = setInterval(() => { if (!this.doc) return; const y = this.currentY(); if (y !== this._lastY) { this._lastY = y; this.onScroll(); } }, 200);
    },
    get se() { return this.doc ? (this.doc.scrollingElement || this.doc.documentElement) : null; },
    /** Measures the total extent (columns or scroll height) robustly: end marker, last section start and last visible glyph. */
    measure() {
      const L = this.layout, se = this.se;
      const endRect = this.doc.getElementById('book-end').getBoundingClientRect();
      const lastRect = this.lastContentRect();
      if (L.mode === 'paginated') {
        this.sectionStarts = this.secEls.map(s => this.colOfStart(s.getBoundingClientRect().left + se.scrollLeft));
        let endCol = this.colOfStart(endRect.left + se.scrollLeft);
        if (lastRect) endCol = Math.max(endCol, Math.floor((lastRect.left + se.scrollLeft - L.mSide + 2) / L.step));
        const lastStart = this.sectionStarts.length ? this.sectionStarts[this.sectionStarts.length - 1] : 0;
        L.total = Math.max(1, endCol + 1, lastStart + 1);
      } else {
        this.sectionStarts = this.secEls.map(s => Math.max(0, s.getBoundingClientRect().top + se.scrollTop - SCROLL_TOP + 12));
        const byEnd = Math.round(endRect.bottom + se.scrollTop - se.clientHeight);
        const byLast = lastRect ? Math.round(lastRect.bottom + se.scrollTop - se.clientHeight) : 0;
        const byScroll = se.scrollHeight - se.clientHeight;
        L.total = Math.max(1, byEnd, byLast, byScroll);
      }
      for (const t of this.tocEntries) t.pos = this.hrefToPos(t.href);
      this.renderTimelineMarks();
    },
    lastContentRect() {
      const range = this.doc.createRange();
      for (let i = this.secEls.length - 1; i >= 0; i--) {
        const sec = this.secEls[i];
        const nodes = this.textNodes(sec);
        for (let k = nodes.length - 1; k >= 0; k--) {
          const text = nodes[k].node.nodeValue;
          for (let c = text.length - 1; c >= 0 && c >= text.length - 300; c--) {
            if (/\s/.test(text[c])) continue;
            range.setStart(nodes[k].node, c); range.setEnd(nodes[k].node, c + 1);
            const r = range.getClientRects()[0];
            if (r && (r.width || r.height)) return r;
          }
        }
        const media = sec.querySelectorAll('img, svg, video');
        if (media.length) { const r = media[media.length - 1].getBoundingClientRect(); if (r.width || r.height) return r; }
      }
      return null;
    },
    colOfStart(absX) { const L = this.layout; return Math.max(0, Math.round((absX - L.mSide) / L.step)); },
    colOfPoint(absX) { const L = this.layout; return U.clamp(Math.floor((absX - L.mSide + 2) / L.step), 0, Math.max(0, L.total - 1)); },
    currentY() { return this.se ? this.se.scrollTop : 0; },
    curPos() { return this.layout.mode === 'paginated' ? this.page : this.currentY(); },
    isAtEnd() {
      const L = this.layout; if (!L || !this.doc) return false;
      if (L.mode === 'paginated') return this.page + L.cols >= L.total;
      return this.currentY() >= L.total - 2;
    },

    /* ------------------------------------------------------------------ navigation */
    goTo(pos, opts = {}) {
      const L = this.layout; if (!L || !this.doc) return;
      if (!opts.keepAnchor) this.anchor = null;
      const se = this.se, smooth = !opts.instant && Settings.get('pageTurn') !== 'none';
      if (L.mode === 'scroll') {
        const y = U.clamp(Math.round(pos), 0, L.total); this.page = y;
        if (smooth) se.scrollTo({ top: y, behavior: 'smooth' }); else se.scrollTop = y;
      } else {
        let col = U.clamp(Math.round(pos), 0, Math.max(0, L.total - 1));
        col = Math.floor(col / L.cols) * L.cols;
        this.page = col;
        const x = col * L.step;
        if (se.scrollTop) se.scrollTop = 0;
        if (smooth) se.scrollTo({ left: x, behavior: 'smooth' }); else se.scrollLeft = x;
      }
      this.hideHLPopover();
      this.updateUI();
      this.scheduleSave();
    },
    next() {
      const L = this.layout; if (!L) return;
      if (this.isAtEnd()) { this.reachedEnd(); return; }
      this._pagesTurned++;
      if (L.mode === 'scroll') this.goTo(this.currentY() + this.se.clientHeight * 0.85); else this.goTo(this.page + L.cols);
    },
    prev() {
      const L = this.layout; if (!L) return;
      if (L.mode === 'scroll') { if (this.currentY() <= 0) return; this.goTo(this.currentY() - this.se.clientHeight * 0.85); return; }
      if (this.page <= 0) return;
      this._pagesTurned++;
      this.goTo(this.page - L.cols);
    },
    nextChapter() { const cur = this.curPos(); const starts = this.chapterStarts().filter(s => s > cur + 0.5); if (starts.length) this.goTo(starts[0]); else if (this.isAtEnd()) this.reachedEnd(); else this.goTo(this.layout.mode === 'paginated' ? this.layout.total - 1 : this.layout.total); },
    prevChapter() { const cur = this.curPos(); const starts = this.chapterStarts().filter(s => s < cur - 0.5); this.goTo(starts.length ? starts[starts.length - 1] : 0); },
    chapterStarts() { const set = new Set(this.sectionStarts); for (const t of this.tocEntries) if (t.pos != null) set.add(t.pos); return [...set].sort((a, b) => a - b); },
    goToLocator(loc, opts = {}) {
      const L = this.layout; if (!L || !loc) return;
      const idx = U.clamp(loc.spine || 0, 0, this.secEls.length - 1);
      const r = loc.offset ? this.positionRect(idx, loc.offset) : null;
      if (L.mode === 'paginated') this.goTo(r ? this.colOfPoint(r.left + this.se.scrollLeft) : (this.sectionStarts[idx] || 0), opts);
      else this.goTo(r ? Math.max(0, r.top + this.se.scrollTop - SCROLL_TOP + 12) : (this.sectionStarts[idx] || 0), opts);
    },
    hrefTarget(href) {
      if (!href || !this.epub) return null;
      const [path, frag] = href.split('#');
      const idx = this.epub.spineIndexOf(path);
      if (idx < 0 || !this.secEls[idx]) return null;
      const sec = this.secEls[idx];
      let target = sec;
      if (frag) { try { target = sec.querySelector('#' + CSS.escape(frag)) || sec.querySelector(`[name="${frag.replace(/"/g, '\\"')}"]`) || sec; } catch (e) { target = sec; } }
      return { idx, target, sec };
    },
    hrefToPos(href) {
      const t = this.hrefTarget(href); if (!t) return null;
      if (t.target === t.sec) return this.sectionStarts[t.idx];
      const r = t.target.getBoundingClientRect();
      return this.layout.mode === 'paginated' ? this.colOfPoint(r.left + this.se.scrollLeft) : Math.max(0, r.top + this.se.scrollTop - SCROLL_TOP + 12);
    },
    goToHref(href) { const pos = this.hrefToPos(href); if (pos == null) return; this.goTo(pos); },
    onScroll() {
      if (!this.layout || this.layout.mode !== 'scroll') return;
      this.page = this.currentY(); this.anchor = null;
      this.updateUI(); this.scheduleSave(); this.touch();
    },

    /* ------------------------------------------------------------------ locators */
    textNodes(sec) {
      const out = []; const w = this.doc.createTreeWalker(sec, NodeFilter.SHOW_TEXT); let n, acc = 0;
      while ((n = w.nextNode())) { out.push({ node: n, start: acc, end: acc + n.nodeValue.length }); acc += n.nodeValue.length; }
      return out;
    },
    sectionAt(pos) { let idx = 0; for (let i = 0; i < this.sectionStarts.length; i++) { if (this.sectionStarts[i] <= pos + 0.5) idx = i; else break; } return idx; },
    currentLocator() {
      const L = this.layout; if (!L || !this.doc) return null;
      const se = this.se;
      if (L.mode === 'paginated') {
        const col = this.page, secIdx = this.sectionAt(col);
        const colLeft = L.mSide + col * L.step;
        const off = this.findFirstTextAt(secIdx, rect => rect.left + se.scrollLeft >= colLeft - 2);
        return { spine: secIdx, offset: off == null ? 0 : off };
      }
      const y = se.scrollTop, secIdx = this.sectionAt(y + SCROLL_TOP);
      const off = this.findFirstTextAt(secIdx, rect => rect.bottom + se.scrollTop >= y + SCROLL_TOP - 8);
      return { spine: secIdx, offset: off == null ? 0 : off };
    },
    findFirstTextAt(secIdx, pred) {
      const sec = this.secEls[secIdx]; if (!sec) return null;
      const range = this.doc.createRange();
      const walker = this.doc.createTreeWalker(sec, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
        acceptNode: n => n.nodeType === 3 ? NodeFilter.FILTER_ACCEPT : (/^(img|svg|video|canvas|hr|table|figure)$/i.test(n.localName) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
      });
      let acc = 0, n;
      const rectAt = (node, i) => { for (let k = i; k < Math.min(node.nodeValue.length, i + 4); k++) { range.setStart(node, k); range.setEnd(node, k + 1); const r = range.getClientRects()[0]; if (r && (r.width || r.height)) return r; } return null; };
      while ((n = walker.nextNode())) {
        if (n.nodeType === 3) {
          const len = n.nodeValue.length;
          if (n.nodeValue.trim()) {
            range.selectNodeContents(n);
            const rects = [...range.getClientRects()].filter(r => r.width > 0 || r.height > 0);
            if (rects.some(pred)) {
              let lo = 0, hi = len - 1;
              while (lo < hi) { const mid = (lo + hi) >> 1; const r = rectAt(n, mid); if (!r || pred(r)) hi = mid; else lo = mid + 1; }
              return acc + lo;
            }
          }
          acc += len;
        } else {
          const r = n.getBoundingClientRect();
          if ((r.width > 0 || r.height > 0) && pred(r)) return acc;
        }
      }
      return null;
    },
    positionRect(secIdx, offset) {
      const sec = this.secEls[secIdx]; if (!sec) return null;
      const nodes = this.textNodes(sec);
      let i = nodes.findIndex(t => offset < t.end);
      if (i < 0) { if (!nodes.length) return this.firstBoxRect(sec); i = nodes.length - 1; }
      const range = this.doc.createRange();
      let steps = 0;
      for (let k = i; k < nodes.length && steps < 4000; k++) {
        const t = nodes[k], text = t.node.nodeValue;
        for (let c = k === i ? Math.max(0, offset - t.start) : 0; c < text.length && steps < 4000; c++, steps++) {
          if (/\s/.test(text[c])) continue;
          range.setStart(t.node, c); range.setEnd(t.node, c + 1);
          const r = range.getClientRects()[0];
          if (r && (r.width || r.height)) return r;
        }
      }
      return this.firstBoxRect(sec);
    },
    firstBoxRect(sec) { const img = sec.querySelector('img, svg, video'); return (img || sec).getBoundingClientRect(); },
    rangeFromOffsets(secIdx, start, end) {
      const sec = this.secEls[secIdx]; if (!sec) return null;
      const nodes = this.textNodes(sec); if (!nodes.length) return null;
      const range = this.doc.createRange(); let s = null, e = null;
      for (const t of nodes) {
        if (s === null && start < t.end) s = [t.node, Math.max(0, start - t.start)];
        if (s !== null && end <= t.end) { e = [t.node, Math.max(0, end - t.start)]; break; }
      }
      if (!s) return null;
      if (!e) { const last = nodes[nodes.length - 1]; e = [last.node, last.node.nodeValue.length]; }
      range.setStart(s[0], s[1]); range.setEnd(e[0], e[1]);
      return range;
    },
    sectionOfNode(node) { const x = node.nodeType === 1 ? node : node.parentElement; const sec = x && x.closest('section.books-section[data-spine]'); return sec ? +sec.dataset.spine : -1; },
    offsetIn(sec, node, off) { const r = this.doc.createRange(); r.setStart(sec, 0); r.setEnd(node, off); return r.toString().length; },
    snippetAt(spine, offset, len = 140) { const t = this.secEls[spine]?.textContent || ''; return t.slice(offset, offset + len).replace(/\s+/g, ' ').trim(); },

    /* ------------------------------------------------------------------ chapters / footer */
    buildTocEntries() { this.tocEntries = this.epub.flatToc().filter(t => t.href).map(t => ({ label: t.label, href: t.href, depth: t.depth, pos: null })); },
    chapterAt(pos) {
      let best = null;
      for (const t of this.tocEntries) if (t.pos != null && t.pos <= pos + 0.5 && (!best || t.pos >= best.pos)) best = t;
      if (best) return best;
      const idx = this.sectionAt(pos); const s = this.sections[idx];
      return s ? { label: s.title || '', pos: this.sectionStarts[idx] } : null;
    },
    nextChapterStart(pos) {
      let next = Infinity;
      for (const s of this.chapterStarts()) if (s > pos + 0.5 && s < next) next = s;
      return next === Infinity ? this.layout.total : next;
    },
    updateUI() {
      const L = this.layout; if (!L) return;
      const isPag = L.mode === 'paginated';
      const cur = isPag ? this.page : this.currentY();
      const entry = this.chapterAt(cur);
      $('#rd-chapter').textContent = entry ? entry.label : '';
      if (isPag) {
        const first = this.page + 1, last = Math.min(L.total, this.page + L.cols);
        $('#rd-page').textContent = Settings.get('showPageNumbers') ? (L.cols === 2 && last > first ? `Pages ${first}–${last} of ${L.total}` : `Page ${first} of ${L.total}`) : '';
        const left = Math.max(0, Math.ceil((this.nextChapterStart(this.page) - this.page) / L.cols) - 1);
        $('#rd-left').textContent = Settings.get('showChapterProgress') ? (left === 0 ? 'Last page in this chapter' : `${U.plural(left, 'page')} left in this chapter`) : '';
        $('#rd-prev').disabled = this.page <= 0; $('#rd-next').disabled = false;
      } else {
        const pct = L.total > 0 ? Math.min(1, cur / L.total) : 0;
        $('#rd-page').textContent = Settings.get('showPageNumbers') ? Math.round(pct * 100) + '%' : '';
        $('#rd-left').textContent = '';
        $('#rd-prev').disabled = cur <= 0; $('#rd-next').disabled = false;
      }
      this.updateTimeline();
      this.updateBookmarkButton();
    },
    scheduleSave() { clearTimeout(this._saveTimer); this._saveTimer = setTimeout(() => this.saveProgress(), 600); },
    saveProgress() {
      if (!this.isOpen || !this.layout || !this.book || this.book.kind === 'pdf' || !this.doc) return;
      const L = this.layout, loc = this.currentLocator(); if (!loc) return;
      const cur = this.curPos();
      const percent = L.mode === 'paginated' ? Math.min(1, (this.page + L.cols) / L.total) : (L.total ? Math.min(1, cur / L.total) : 0);
      const entry = this.chapterAt(cur);
      const patch = { progress: { locator: { spine: loc.spine, offset: loc.offset }, percent, chapter: entry ? entry.label : '', updatedAt: Date.now() } };
      if (this.isAtEnd() && L.total > 1 && !this.book.finishedAt) { patch.finishedAt = Date.now(); this.book.finishedAt = patch.finishedAt; }
      Library.updateBook(this.book.id, patch, { silent: true });
    },
    reachedEnd() {
      if (this._endShown || !this.isAtEnd()) return;
      this._endShown = true;
      this.saveProgress();
      const card = el('div.rd-end-card', el('div.card', U.svg(Icons.icon('checkCircle', { size: 44, stroke: 1.6 })), el('h3', 'You finished this book'),
        el('p', `“${this.book.title}” has been added to Finished.`),
        el('div.actions', el('button.btn.primary', { type: 'button', onclick: () => { card.remove(); this.close(); } }, 'Back to Library'), el('button.btn', { type: 'button', onclick: () => card.remove() }, 'Keep Reading'))));
      $('#rd-stage').appendChild(card);
    },

    /* ------------------------------------------------------------------ input */
    onWheel(e) {
      this.touch();
      const L = this.layout; if (!L) return;
      if (e.ctrlKey || e.metaKey) { // pinch / ⌘-scroll → text size
        e.preventDefault();
        this._wheel.zoom += e.deltaY;
        if (Math.abs(this._wheel.zoom) >= 40) { this.changeFontSize(this._wheel.zoom < 0 ? 10 : -10); this._wheel.zoom = 0; }
        return;
      }
      let dy = e.deltaY, dx = e.deltaX;
      if (e.deltaMode === 1) { dy *= 16; dx *= 16; } else if (e.deltaMode === 2) { dy *= L.H; dx *= L.W; }
      let horizontal = Math.abs(dx) > Math.abs(dy);
      let d = horizontal ? dx : dy;
      if (e.shiftKey && !horizontal) { horizontal = true; d = dy; } // ⇧ + wheel behaves like a horizontal wheel
      if (L.mode === 'scroll' && !horizontal) return;                 // vertical scrolling layout: the wheel scrolls the text
      e.preventDefault();
      if (!Settings.get('wheelTurnsPages')) return;
      if (horizontal && !Settings.get('wheelHorizontal')) return;
      if (Settings.get('wheelInvert')) d = -d;
      if (!d) return;
      // A click of a notched mouse wheel (or tilt wheel) is one page, regardless of how many pixels the OS maps it to.
      const legacy = horizontal ? (e.wheelDeltaX || 0) : (e.wheelDeltaY || 0);
      const discrete = e.deltaMode !== 0 || Math.abs(legacy) >= 100 || Math.abs(d) >= 50;
      const threshold = (WHEEL_THRESHOLD[Settings.get('wheelSensitivity')] || WHEEL_THRESHOLD.medium) * (horizontal ? 0.6 : 1);
      const w = this._wheel, now = performance.now();
      const gap = now - w.last; w.last = now;
      if (gap > 400) { w.acc = 0; w.locked = false; w.lastDelta = 0; }
      const turn = () => { d > 0 ? this.next() : this.prev(); w.acc = 0; w.locked = true; };
      if (discrete) { turn(); w.lastDelta = d; return; }
      if (w.locked) {
        // After a turn, ignore the decaying tail of an inertial trackpad gesture; steady or increasing input keeps turning at double the threshold.
        if (Math.abs(d) >= Math.abs(w.lastDelta) * 0.85) { w.acc += d; if (Math.abs(w.acc) >= threshold * 2) turn(); }
        w.lastDelta = d; return;
      }
      w.acc += d; w.lastDelta = d;
      if (Math.abs(w.acc) >= threshold) turn();
    },
    onKey(e) {
      if (!this.isOpen) return;
      const tag = ((e.target && e.target.tagName) || '').toLowerCase();
      if (['input', 'textarea', 'select'].includes(tag) || (e.target && e.target.isContentEditable)) return;
      if (UI.hasOpen('sheet')) return;
      const mod = U.isModKey(e), k = e.key;
      const stop = () => { e.preventDefault(); e.stopPropagation(); };
      if (mod && k.toLowerCase() === 'f') { stop(); this.openSearch(); return; }
      if (mod && k.toLowerCase() === 'd') { stop(); this.toggleBookmark(); return; }
      if (mod && (k === '=' || k === '+')) { stop(); this.changeFontSize(10); return; }
      if (mod && k === '-') { stop(); this.changeFontSize(-10); return; }
      if (mod && k === '0') { stop(); Settings.set('fontSize', 100); return; }
      if (mod && k === ']') { stop(); this.nextChapter(); return; }
      if (mod && k === '[') { stop(); this.prevChapter(); return; }
      if (UI.hasOpen()) return;
      if (k === 'Escape') { stop(); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else this.close(); return; }
      if (!this.layout || this.book.kind === 'pdf') return;
      const L = this.layout;
      this.touch();
      if (k === 'ArrowRight' || k === 'PageDown' || (k === ' ' && !e.shiftKey)) { stop(); e.altKey && k === 'ArrowRight' ? this.nextChapter() : this.next(); }
      else if (k === 'ArrowLeft' || k === 'PageUp' || (k === ' ' && e.shiftKey)) { stop(); e.altKey && k === 'ArrowLeft' ? this.prevChapter() : this.prev(); }
      else if (k === 'ArrowDown' && L.mode === 'paginated') { stop(); this.next(); }
      else if (k === 'ArrowUp' && L.mode === 'paginated') { stop(); this.prev(); }
      else if (k === 'Home') { stop(); this.goTo(0); }
      else if (k === 'End') { stop(); this.goTo(L.mode === 'paginated' ? L.total - 1 : L.total); }
    },
    onDocClick(e) {
      const t = e.target && e.target.nodeType === 1 ? e.target : e.target && e.target.parentElement;
      if (!t) return;
      const a = t.closest('a[href], a[data-internal-href]');
      if (a) {
        e.preventDefault();
        if (a.dataset.internalHref) this.goToHref(a.dataset.internalHref);
        else UI.toast('Web links are unavailable offline');
        return;
      }
      const hl = t.closest('.books-hl');
      if (hl) {
        const h = this.highlights.find(x => x.id === hl.dataset.id);
        if (h) { const sel = this.win.getSelection(); if (sel && !sel.isCollapsed) return; this.showHLPopover(null, hl.getBoundingClientRect(), h); }
      }
    },
    onSelectionEnd() {
      if (!this.doc) return;
      const sel = this.win.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      const text = range.toString().replace(/\s+/g, ' ').trim(); if (!text) return;
      const s = this.sectionOfNode(range.startContainer), en = this.sectionOfNode(range.endContainer);
      if (s < 0) return;
      const sec = this.secEls[s];
      const start = this.offsetIn(sec, range.startContainer, range.startOffset);
      const end = en === s ? this.offsetIn(sec, range.endContainer, range.endOffset) : sec.textContent.length;
      if (end <= start) return;
      this.showHLPopover({ spine: s, start, end, text: text.slice(0, 3000) }, range.getBoundingClientRect(), null);
    },

    /* ------------------------------------------------------------------ fullscreen & chrome */
    toggleFullscreen() {
      const native = () => { if (global.App && App.shell) App.shell.post({ type: 'toggleFullScreen' }); };
      if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
      if (global.App && App._nativeFullscreen) { native(); return; }
      if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(native);
      else native();
    },
    /** In full screen the toolbar and footer hide; they come back when the pointer approaches the top or bottom edge. */
    refreshChrome(pointerY) {
      if (!this.isOpen) return;
      const reader = $('#reader');
      const fs = global.App ? App.isFullscreen() : !!document.fullscreenElement;
      const b = $('#rd-fullscreen'); b.innerHTML = Icons.icon(fs ? 'fullscreenExit' : 'fullscreen', { size: 16 }); b.title = fs ? 'Exit Full Screen' : 'Full Screen';
      const show = () => { reader.classList.remove('chrome-hidden'); clearTimeout(this._chromeTimer); this._chromeTimer = null; };
      if (!fs) { show(); return; }
      const H = window.innerHeight;
      const nearBars = pointerY != null && (pointerY < 96 || pointerY > H - 120);
      if (nearBars || UI.hasOpen() || this._hlPopover || this._tlDragging) { show(); return; }
      if (!this._chromeTimer) this._chromeTimer = setTimeout(() => {
        this._chromeTimer = null;
        if (this.isOpen && (global.App ? App.isFullscreen() : !!document.fullscreenElement) && !UI.hasOpen() && !this._hlPopover && !this._tlDragging) reader.classList.add('chrome-hidden');
      }, 1000);
    },
    onMouseMove(e, fromFrame) {
      if (!this.isOpen) return;
      let x = e.clientX, y = e.clientY;
      if (fromFrame && this.frame) { const r = this.frame.getBoundingClientRect(); x += r.left; y += r.top; }
      const stage = $('#rd-stage'), W = window.innerWidth;
      const paged = this.layout && this.layout.mode === 'paginated' && this.book && this.book.kind !== 'pdf';
      stage.classList.toggle('near-left', paged && x < 110);
      stage.classList.toggle('near-right', paged && x > W - 110);
      this.refreshChrome(y);
    },

    /* ------------------------------------------------------------------ highlights */
    hlColor(name) {
      const hex = HL_COLORS[name] || HL_COLORS.yellow;
      const dark = !!THEMES[this.effectiveTheme()].dark;
      return `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${dark ? 0.42 : 0.45})`;
    },
    renderHighlights() {
      if (!this.doc) return;
      this.unwrapAll();
      for (const h of [...this.highlights].sort((a, b) => a.spine - b.spine || a.start - b.start)) this.wrapHighlight(h);
    },
    unwrapAll() {
      for (const span of [...this.doc.querySelectorAll('span.books-hl')]) { const p = span.parentNode; while (span.firstChild) p.insertBefore(span.firstChild, span); p.removeChild(span); }
    },
    wrapHighlight(h) {
      const sec = this.secEls[h.spine]; if (!sec) return;
      for (const t of this.textNodes(sec)) {
        if (t.end <= h.start || t.start >= h.end || !t.node.nodeValue.trim()) continue;
        let node = t.node;
        const s = Math.max(0, h.start - t.start), e = Math.min(t.node.nodeValue.length, h.end - t.start);
        if (e <= s) continue;
        if (s > 0) node = node.splitText(s);
        if (e - s < node.nodeValue.length) node.splitText(e - s);
        const span = this.doc.createElement('span');
        span.className = 'books-hl' + (h.style === 'underline' ? ' underline' : '');
        span.dataset.id = h.id; span.style.setProperty('--hl', h.style === 'underline' ? (HL_COLORS[h.color] || HL_COLORS.yellow) : this.hlColor(h.color));
        node.parentNode.insertBefore(span, node); span.appendChild(node);
      }
    },
    async addHighlight(data, opts = {}) {
      const entry = this.chapterAt(this.curPos());
      const h = { id: U.uuid(), bookId: this.book.id, type: 'highlight', spine: data.spine, start: data.start, end: data.end, text: data.text, color: data.color || 'yellow', style: data.style || 'highlight', note: '', chapter: entry ? entry.label : '', createdAt: Date.now() };
      await DB.put('annotations', h);
      this.highlights.push(h);
      this.wrapHighlight(h);
      const sel = this.win.getSelection(); if (sel) sel.removeAllRanges();
      this.hideHLPopover();
      if (opts.note) this.editNote(h);
    },
    async updateHighlight(id, patch) {
      const h = this.highlights.find(x => x.id === id); if (!h) return;
      Object.assign(h, patch); await DB.put('annotations', h);
      this.renderHighlights(); this.hideHLPopover();
    },
    async removeHighlight(id) {
      await DB.delete('annotations', id);
      this.highlights = this.highlights.filter(h => h.id !== id);
      this.renderHighlights(); this.hideHLPopover();
    },
    async editNote(h) {
      const ta = el('textarea.field', { placeholder: 'Add a note…' }); ta.value = h.note || '';
      const v = await UI.sheet({ title: h.note ? 'Edit Note' : 'Add Note', body: el('div', el('div.note-quote', { style: { '--c': HL_COLORS[h.color] || HL_COLORS.yellow } }, h.text), ta),
        buttons: [h.note ? { label: 'Delete Note', danger: true, value: 'delete' } : null, { label: 'Cancel', value: null }, { label: 'Save', primary: true, value: 'save' }].filter(Boolean) });
      if (v === 'save') await this.updateHighlight(h.id, { note: ta.value.trim() });
      else if (v === 'delete') await this.updateHighlight(h.id, { note: '' });
    },
    copyText(text) { (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => UI.toast('Copied'), () => UI.toast('Copy is not available here')); },
    showHLPopover(sel, rect, existing) {
      this.hideHLPopover();
      const pop = el('div.hl-popover');
      const colors = el('div.hl-colors');
      for (const [name, hex] of Object.entries(HL_COLORS)) {
        colors.appendChild(el('button.hl-color', { type: 'button', title: name[0].toUpperCase() + name.slice(1), class: existing && existing.color === name && existing.style !== 'underline' ? 'active' : '', style: { '--c': hex },
          onclick: () => existing ? this.updateHighlight(existing.id, { color: name, style: 'highlight' }) : this.addHighlight({ ...sel, color: name, style: 'highlight' }) }));
      }
      colors.appendChild(el('button.hl-color.underline-style', { type: 'button', title: 'Underline', class: existing && existing.style === 'underline' ? 'active' : '',
        onclick: () => existing ? this.updateHighlight(existing.id, { style: 'underline' }) : this.addHighlight({ ...sel, color: 'yellow', style: 'underline' }) }));
      pop.appendChild(colors); pop.appendChild(el('span.hl-sep'));
      pop.appendChild(el('button.hl-btn', { type: 'button', onclick: () => existing ? this.editNote(existing) : this.addHighlight({ ...sel, color: 'yellow', style: 'highlight' }, { note: true }) }, U.svg(Icons.icon('note', { size: 14 })), existing && existing.note ? 'Edit Note' : 'Add Note'));
      pop.appendChild(el('button.hl-btn', { type: 'button', onclick: () => { this.copyText(existing ? existing.text : sel.text); this.hideHLPopover(); } }, U.svg(Icons.icon('copy', { size: 14 })), 'Copy'));
      pop.appendChild(el('button.hl-btn', { type: 'button', onclick: () => { const q = (existing ? existing.text : sel.text).slice(0, 80); this.hideHLPopover(); this.openSearch(q); } }, U.svg(Icons.icon('search', { size: 14 })), 'Search'));
      if (existing) { pop.appendChild(el('span.hl-sep')); pop.appendChild(el('button.hl-btn.danger', { type: 'button', onclick: () => this.removeHighlight(existing.id) }, U.svg(Icons.icon('trash', { size: 14 })), 'Remove')); }
      document.getElementById('overlays').appendChild(pop);
      const fr = this.frame.getBoundingClientRect();
      const cx = fr.left + rect.left + rect.width / 2, w = pop.offsetWidth, h = pop.offsetHeight;
      const left = U.clamp(cx - w / 2, 8, window.innerWidth - w - 8);
      let top = fr.top + rect.top - h - 12, below = false;
      if (top < 8) { top = fr.top + rect.bottom + 12; below = true; }
      pop.style.left = left + 'px'; pop.style.top = top + 'px'; pop.classList.toggle('below', below);
      pop.style.setProperty('--arrow-x', U.clamp(cx - left, 16, w - 16) + 'px');
      this._hlPopover = pop;
      this.refreshChrome();
    },
    hideHLPopover() { if (this._hlPopover) { this._hlPopover.remove(); this._hlPopover = null; } },

    /* ------------------------------------------------------------------ bookmarks */
    locatorToPos(loc) {
      const L = this.layout; if (!L) return 0;
      const idx = U.clamp(loc.spine || 0, 0, this.secEls.length - 1);
      const r = loc.offset ? this.positionRect(idx, loc.offset) : null;
      if (L.mode === 'paginated') return r ? this.colOfPoint(r.left + this.se.scrollLeft) : (this.sectionStarts[idx] || 0);
      return r ? Math.max(0, r.top + this.se.scrollTop - SCROLL_TOP + 12) : (this.sectionStarts[idx] || 0);
    },
    recomputeBookmarkCols() { for (const b of this.bookmarks) b._pos = this.locatorToPos(b); },
    bookmarkOnPage() {
      const L = this.layout; if (!L) return null;
      if (L.mode === 'paginated') return this.bookmarks.find(b => b._pos >= this.page && b._pos < this.page + L.cols) || null;
      const y = this.currentY(); return this.bookmarks.find(b => b._pos >= y - 10 && b._pos < y + L.H * 0.85) || null;
    },
    updateBookmarkButton() { const b = $('#rd-bookmark'); const on = !!this.bookmarkOnPage(); b.classList.toggle('bookmarked', on); b.innerHTML = Icons.icon(on ? 'bookmarkFill' : 'bookmark'); b.title = on ? 'Remove Bookmark (⌘D)' : 'Add Bookmark (⌘D)'; },
    async toggleBookmark() {
      if (!this.layout) return;
      const existing = this.bookmarkOnPage();
      if (existing) { await DB.delete('annotations', existing.id); this.bookmarks = this.bookmarks.filter(b => b.id !== existing.id); UI.toast('Bookmark removed'); }
      else {
        const loc = this.currentLocator(); if (!loc) return;
        const entry = this.chapterAt(this.curPos());
        const b = { id: U.uuid(), bookId: this.book.id, type: 'bookmark', spine: loc.spine, offset: loc.offset, text: this.snippetAt(loc.spine, loc.offset), chapter: entry ? entry.label : '', createdAt: Date.now() };
        await DB.put('annotations', b);
        b._pos = this.curPos(); this.bookmarks.push(b);
        UI.toast('Bookmark added', { icon: 'bookmarkFill' });
      }
      this.updateBookmarkButton();
      this.renderTimelineMarks();
    },

    /* ------------------------------------------------------------------ panels */
    posLabel(pos) { const L = this.layout; if (!L || pos == null) return ''; return L.mode === 'paginated' ? `p. ${pos + 1}` : Math.round(Math.min(1, pos / L.total) * 100) + '%'; },
    openContents(tab = 'contents') {
      const btn = $('#rd-toc');
      if (btn._popover) { btn._popover.close(); return; }
      const list = el('div.rd-panel-list');
      const fill = () => { list.innerHTML = ''; if (tab === 'contents') this.fillToc(list); else if (tab === 'bookmarks') this.fillBookmarks(list); else this.fillNotes(list); };
      const tabs = UI.segmented([{ value: 'contents', label: 'Contents' }, { value: 'bookmarks', label: 'Bookmarks' }, { value: 'notes', label: 'Notes' }], tab, v => { tab = v; fill(); }, { className: 'stretch' });
      const panel = el('div.rd-panel', el('div.rd-panel-head', tabs), list);
      UI.popover(btn, panel, { align: 'start' });
      fill();
    },
    fillToc(list) {
      const cur = this.chapterAt(this.curPos());
      if (!this.tocEntries.length) { list.appendChild(el('div.rd-panel-empty', 'This book has no table of contents.')); return; }
      for (const t of this.tocEntries) {
        const item = el('div.toc-item', { class: `depth-${Math.min(3, t.depth)}${t === cur ? ' current' : ''}`, tabindex: 0 }, el('span.toc-label', t.label), el('span.toc-page', this.posLabel(t.pos)));
        const go = () => { if (t.pos != null) this.goTo(t.pos); else this.goToHref(t.href); UI.closeAll('popover'); this.touch(); };
        item.addEventListener('click', go); item.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
        list.appendChild(item);
        if (t === cur) setTimeout(() => item.scrollIntoView({ block: 'center' }), 0);
      }
    },
    fillBookmarks(list) {
      const items = [...this.bookmarks].sort((a, b) => (a._pos ?? 0) - (b._pos ?? 0));
      if (!items.length) { list.appendChild(el('div.rd-panel-empty', 'No bookmarks yet. Click the bookmark button or press ⌘D to bookmark the current page.')); return; }
      for (const b of items) {
        const item = el('div.ann-item', el('span.ann-bar', { style: { '--c': 'var(--accent)' } }), el('div.ann-body', el('div.ann-text.quote', b.text || '—'), el('div.ann-meta', el('span', b.chapter || ''), el('span', this.posLabel(b._pos)), el('span', U.fmtDate(b.createdAt)))),
          el('button.ann-delete', { type: 'button', title: 'Remove bookmark', onclick: async e => { e.stopPropagation(); await DB.delete('annotations', b.id); this.bookmarks = this.bookmarks.filter(x => x.id !== b.id); item.remove(); this.updateBookmarkButton(); if (!this.bookmarks.length) this.fillBookmarks(list); } }, U.svg(Icons.icon('trash', { size: 14 }))));
        item.addEventListener('click', () => { this.goToLocator(b); UI.closeAll('popover'); });
        list.appendChild(item);
      }
    },
    fillNotes(list) {
      const items = [...this.highlights].sort((a, b) => a.spine - b.spine || a.start - b.start);
      if (!items.length) { list.appendChild(el('div.rd-panel-empty', 'Select text in the book to highlight it or add a note. Your highlights and notes appear here.')); return; }
      for (const h of items) {
        const item = el('div.ann-item', el('span.ann-bar', { style: { '--c': HL_COLORS[h.color] || HL_COLORS.yellow } }),
          el('div.ann-body', el('div.ann-text.quote', h.text), h.note ? el('div.ann-note', h.note) : null, el('div.ann-meta', el('span', h.chapter || ''), el('span', U.fmtDate(h.createdAt)))),
          el('button.ann-delete', { type: 'button', title: 'Remove highlight', onclick: async e => { e.stopPropagation(); await this.removeHighlight(h.id); item.remove(); if (!this.highlights.length) this.fillNotes(list); } }, U.svg(Icons.icon('trash', { size: 14 }))));
        item.addEventListener('click', () => { this.goToLocator({ spine: h.spine, offset: h.start }); UI.closeAll('popover'); });
        list.appendChild(item);
      }
    },
    searchBook(query) {
      const q = query.toLowerCase(), out = [];
      this.secEls.forEach((sec, idx) => {
        const text = sec.textContent, lower = text.toLowerCase(); let i = 0;
        while ((i = lower.indexOf(q, i)) >= 0 && out.length < 400) {
          out.push({ spine: idx, start: i, end: i + q.length, before: text.slice(Math.max(0, i - 48), i).replace(/\s+/g, ' '), match: text.slice(i, i + q.length), after: text.slice(i + q.length, i + q.length + 64).replace(/\s+/g, ' ') });
          i += q.length;
        }
      });
      return out;
    },
    showResult(r) {
      this.goToLocator({ spine: r.spine, offset: r.start }, { instant: true });
      const range = this.rangeFromOffsets(r.spine, r.start, r.end);
      if (range) { const sel = this.win.getSelection(); sel.removeAllRanges(); sel.addRange(range); }
    },
    openSearch(initial = '') {
      const btn = $('#rd-search');
      if (btn._popover) { btn._popover.close(); if (!initial) return; }
      const input = el('input.field', { type: 'search', placeholder: 'Search in book', value: initial, autocomplete: 'off', spellcheck: false });
      const count = el('div.sr-count', 'Type at least two characters');
      const list = el('div.rd-panel-list');
      const panel = el('div.rd-panel.rd-search-panel', el('div.rd-panel-head', input, count), list);
      UI.popover(btn, panel, { align: 'end' });
      let results = [], current = -1, rows = [];
      const render = () => {
        list.innerHTML = ''; rows = [];
        count.textContent = !input.value.trim() ? 'Type at least two characters' : results.length ? `${results.length >= 400 ? '400+' : results.length} ${results.length === 1 ? 'result' : 'results'}` : 'No results';
        let lastChapter = null;
        results.forEach((r, i) => {
          const pos = this.locatorToPos({ spine: r.spine, offset: r.start });
          const ch = this.chapterAt(pos);
          const chLabel = ch ? ch.label : (this.sections[r.spine].title || `Section ${r.spine + 1}`);
          if (chLabel !== lastChapter) { list.appendChild(el('div.sr-chapter', chLabel)); lastChapter = chLabel; }
          const row = el('div.sr-item', { tabindex: 0 }, el('div.sr-text', r.before, el('mark', r.match), r.after), el('span.sr-page', this.posLabel(pos)));
          row.addEventListener('click', () => { current = i; this.showResult(r); rows.forEach((x, k) => x.classList.toggle('current', k === i)); });
          rows.push(row); list.appendChild(row);
        });
      };
      const run = () => { const q = input.value.trim(); results = q.length >= 2 ? this.searchBook(q) : []; current = -1; render(); };
      input.addEventListener('input', U.debounce(run, 180));
      input.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (!results.length) { run(); return; }
        current = (current + (e.shiftKey ? -1 : 1) + results.length) % results.length;
        this.showResult(results[current]); rows.forEach((x, k) => x.classList.toggle('current', k === current)); rows[current]?.scrollIntoView({ block: 'nearest' });
      });
      setTimeout(() => { input.focus(); input.select(); }, 30);
      if (initial) run();
    },
    openAppearance() {
      const btn = $('#rd-appearance');
      if (btn._popover) { btn._popover.close(); return; }
      const box = el('div.appearance');
      const pdf = this.book && this.book.kind === 'pdf';
      const row = (label, control, sub, key) => el('div.ap-row', { dataset: key ? { row: key } : null }, el('div.ap-label', label, sub ? el('span.ap-sub', sub) : null), control);
      const sizeVal = el('div.ap-size-value');
      const themes = el('div.themes');
      const fontBtn = el('button.popup-button', { type: 'button' }, el('span.popup-label', ''), el('span.popup-chevrons', { html: Icons.icon('chevronUp', { size: 11, stroke: 2.6 }) + Icons.icon('chevronDown', { size: 11, stroke: 2.6 }) }));
      const refresh = () => {
        sizeVal.textContent = `Text size ${Settings.get('fontSize')}%`;
        for (const s of themes.children) s.classList.toggle('active', s.dataset.theme === Settings.get('theme'));
        fontBtn.firstChild.textContent = (FONTS.find(f => f.id === Settings.get('font')) || FONTS[0]).name;
        const scrolling = Settings.get('layout') === 'scroll';
        for (const r of box.querySelectorAll('[data-row="paginated-only"]')) r.classList.toggle('disabled', scrolling);
      };
      if (!pdf) {
        box.appendChild(el('div.ap-size', el('button', { type: 'button', title: 'Smaller text (⌘−)', onclick: () => this.changeFontSize(-10) }, 'A'), el('button', { type: 'button', title: 'Larger text (⌘+)', onclick: () => this.changeFontSize(10) }, 'A')));
        box.appendChild(sizeVal);
      }
      box.appendChild(el('div.section-title', 'Themes'));
      for (const [id, t] of Object.entries(THEMES)) {
        const sw = el('div.theme-swatch', { dataset: { theme: id }, class: t.bold ? 'bold' : '', style: { '--tbg': t.bg, '--tfg': t.fg }, role: 'button', tabindex: 0 }, 'Aa', el('small', t.name));
        sw.addEventListener('click', () => { Settings.set('theme', id); refresh(); });
        themes.appendChild(sw);
      }
      box.appendChild(themes);
      box.appendChild(row('Auto-Night Theme', UI.switchEl(Settings.get('autoNight'), v => Settings.set('autoNight', v)), 'Follow the system: Original in Light Mode, Focus in Dark Mode'));
      if (pdf) {
        box.appendChild(el('div.ap-note', 'Themes tint the PDF viewer. Text size, fonts and layout apply to books.'));
        const onChangePdf = () => refresh();
        window.addEventListener('settings:change', onChangePdf);
        UI.popover(btn, box, { align: 'start', onClose: () => window.removeEventListener('settings:change', onChangePdf) });
        refresh();
        return;
      }
      box.appendChild(el('div.section-title', 'Font'));
      fontBtn.addEventListener('click', () => UI.menu(FONTS.map(f => ({ label: f.name, font: f.css || undefined, checked: Settings.get('font') === f.id, action: () => { Settings.set('font', f.id); refresh(); } })), { anchor: fontBtn, matchWidth: true }));
      box.appendChild(row('Font', fontBtn));
      box.appendChild(el('div.section-title', 'Layout'));
      box.appendChild(row('Vertical Scrolling', UI.switchEl(Settings.get('layout') === 'scroll', v => { Settings.set('layout', v ? 'scroll' : 'paginated'); refresh(); }), 'Read as one continuous scroll instead of pages'));
      box.appendChild(row('Pages', UI.segmented([{ value: 'auto', label: 'Auto' }, { value: 'single', label: 'One' }, { value: 'double', label: 'Two' }], Settings.get('spread'), v => Settings.set('spread', v)), 'Two pages need a window at least 1000 px wide · paginated layout only', 'paginated-only'));
      box.appendChild(row('Page Turn', UI.segmented([{ value: 'slide', label: 'Slide' }, { value: 'none', label: 'None' }], Settings.get('pageTurn'), v => Settings.set('pageTurn', v)), 'Paginated layout only', 'paginated-only'));
      box.appendChild(row('Text Width', UI.segmented([{ value: 'narrow', label: 'Narrow' }, { value: 'medium', label: 'Medium' }, { value: 'wide', label: 'Wide' }, { value: 'full', label: 'Full' }], Settings.get('textWidth'), v => Settings.set('textWidth', v)), 'How much of the page the text fills'));
      box.appendChild(row('Line Spacing', UI.segmented([{ value: 'tight', label: 'Tight' }, { value: 'normal', label: 'Normal' }, { value: 'loose', label: 'Loose' }], Settings.get('lineHeight'), v => Settings.set('lineHeight', v))));
      box.appendChild(row('Justified Text', UI.switchEl(Settings.get('justify'), v => Settings.set('justify', v))));
      box.appendChild(row('Hyphenation', UI.switchEl(Settings.get('hyphenate'), v => Settings.set('hyphenate', v))));
      box.appendChild(el('div.section-title', 'Scroll Wheel & Trackpad'));
      box.appendChild(row('Scroll Wheel Turns Pages', UI.switchEl(Settings.get('wheelTurnsPages'), v => Settings.set('wheelTurnsPages', v)), 'Scroll down or right for the next page, up or left for the previous one'));
      box.appendChild(row('Sensitivity', UI.segmented([{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }], Settings.get('wheelSensitivity'), v => Settings.set('wheelSensitivity', v))));
      box.appendChild(row('Invert Direction', UI.switchEl(Settings.get('wheelInvert'), v => Settings.set('wheelInvert', v))));
      box.appendChild(row('Horizontal Scrolling', UI.switchEl(Settings.get('wheelHorizontal'), v => Settings.set('wheelHorizontal', v)), 'A horizontal or tilt wheel, ⇧ + wheel and two-finger swipes turn pages'));
      box.appendChild(el('div.ap-note', `Hold ${U.modKey} while scrolling to change the text size. With Vertical Scrolling on, the wheel scrolls the text and horizontal gestures move a screen at a time.`));
      box.appendChild(el('div.section-title', 'Display'));
      box.appendChild(row('Page Numbers', UI.switchEl(Settings.get('showPageNumbers'), v => Settings.set('showPageNumbers', v))));
      box.appendChild(row('Pages Left in Chapter', UI.switchEl(Settings.get('showChapterProgress'), v => Settings.set('showChapterProgress', v))));
      const onChange = () => refresh();
      window.addEventListener('settings:change', onChange);
      UI.popover(btn, box, { align: 'start', onClose: () => window.removeEventListener('settings:change', onChange) });
      refresh();
    },

    /* ------------------------------------------------------------------ timeline */
    initTimeline() {
      const tl = $('#rd-timeline'), track = tl.querySelector('.tl-track');
      const fractionAt = clientX => { const r = track.getBoundingClientRect(); return U.clamp((clientX - r.left) / r.width, 0, 1); };
      const posAt = f => { const L = this.layout; if (!L) return 0; return L.mode === 'paginated' ? Math.round(f * Math.max(0, L.total - 1)) : Math.round(f * L.total); };
      const preview = (f, pinned) => { this._tlPreview = pinned ? f : null; this.updateTimeline(f); };
      tl.addEventListener('pointerdown', e => {
        if (!this.layout || e.button !== 0) return;
        e.preventDefault();
        this._tlDragging = true; $('#reader').classList.add('tl-dragging');
        tl.setPointerCapture(e.pointerId);
        const f = fractionAt(e.clientX); preview(f, true); this.goTo(posAt(f), { instant: true });
      });
      tl.addEventListener('pointermove', e => {
        if (!this.layout) return;
        const f = fractionAt(e.clientX);
        if (this._tlDragging) { preview(f, true); this.goTo(posAt(f), { instant: true }); }
        else preview(f, false);
      });
      const release = e => {
        if (!this._tlDragging) return;
        this._tlDragging = false; $('#reader').classList.remove('tl-dragging'); this._tlPreview = null;
        try { tl.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        this.updateTimeline(); this.touch();
      };
      tl.addEventListener('pointerup', release); tl.addEventListener('pointercancel', release);
      tl.addEventListener('pointerleave', () => { if (!this._tlDragging) { this._tlPreview = null; tl.classList.remove('hovering'); this.updateTimeline(); } });
      tl.addEventListener('pointerenter', () => tl.classList.add('hovering'));
      tl.addEventListener('keydown', e => { if (e.key === 'ArrowRight') { e.preventDefault(); this.next(); } else if (e.key === 'ArrowLeft') { e.preventDefault(); this.prev(); } });
    },
    /** Chapter ticks and bookmark dots along the track. */
    renderTimelineMarks() {
      const L = this.layout, marks = $('#tl-marks'), dots = $('#tl-bookmarks'); if (!L || !marks) return;
      marks.innerHTML = ''; dots.innerHTML = '';
      const span = L.mode === 'paginated' ? Math.max(1, L.total - 1) : Math.max(1, L.total);
      for (const s of this.chapterStarts()) { if (s <= 0 || s >= span) continue; marks.appendChild(el('i', { style: { left: (s / span * 100) + '%' } })); }
      for (const b of this.bookmarks) { if (b._pos == null) continue; dots.appendChild(el('i', { style: { left: (U.clamp(b._pos / span, 0, 1) * 100) + '%' }, title: b.chapter || 'Bookmark' })); }
    },
    /** Fill, thumb and label. `hoverFraction` previews a position under the pointer without moving. */
    updateTimeline(hoverFraction) {
      const L = this.layout, tl = $('#rd-timeline'); if (!L || !tl || tl.hidden) return;
      const span = L.mode === 'paginated' ? Math.max(1, L.total - 1) : Math.max(1, L.total);
      const cur = L.mode === 'paginated' ? this.page : this.currentY();
      const curF = U.clamp(cur / span, 0, 1);
      const f = hoverFraction != null ? hoverFraction : (this._tlPreview != null ? this._tlPreview : curF);
      const pos = L.mode === 'paginated' ? Math.round(f * span) : Math.round(f * span);
      $('#tl-fill').style.width = (curF * 100) + '%';
      $('#tl-thumb').style.left = (curF * 100) + '%';
      const label = $('#tl-label');
      const entry = this.chapterAt(pos);
      const where = L.mode === 'paginated' ? `Page ${Math.min(L.total, pos + 1)} of ${L.total}` : `${Math.round(f * 100)}%`;
      label.textContent = entry && entry.label ? `${where} · ${entry.label}` : where;
      label.style.left = (f * 100) + '%';
      tl.classList.toggle('previewing', hoverFraction != null && !this._tlDragging);
      tl.setAttribute('aria-valuenow', String(Math.round(curF * 100)));
    },

    /* ------------------------------------------------------------------ statistics */
    startTicker() {
      this.stopTicker(); this._lastInteraction = Date.now(); this._pendingSecs = 0;
      this._ticker = setInterval(() => {
        if (document.visibilityState !== 'visible' || Date.now() - this._lastInteraction > 120000) return;
        this._pendingSecs++;
        if (this._pendingSecs >= 15) this.flushStats();
      }, 1000);
    },
    stopTicker() { if (this._ticker) clearInterval(this._ticker); this._ticker = null; },
    async flushStats() {
      const s = this._pendingSecs, p = this._pagesTurned; this._pendingSecs = 0; this._pagesTurned = 0;
      if (s) { try { await Stats.addSeconds(s, p); } catch (e) { /* ignore */ } }
    },
    touch() { this._lastInteraction = Date.now(); },
  };

  global.Reader = Reader;
})(window);
