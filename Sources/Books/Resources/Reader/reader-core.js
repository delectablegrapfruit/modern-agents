/* Reader web core — the chrome-less page a WKWebView hosts.
 *
 * The whole document is the book: the spine sections are written straight into this page (no iframe, because the
 * native app already gives us one isolated web view) and CSS multi-column layout with `column-fill: auto` turns the
 * section strip into pages that are paged by scrolling the viewport horizontally. Everything the reader used to draw
 * itself — toolbars, panels, popovers, settings, persistence — belongs to the app now: this file only lays the book
 * out, keeps the position, renders highlights, searches, and talks to Swift through the protocol in PROTOCOL.md.
 *
 * All state arrives through open()/applySettings(); nothing is stored here and nothing is read back from disk.
 */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ bridge
     WKWebView delivers messages through its script-message handler; the tests install window.__readerBridge instead. */
  function post(msg) {
    try {
      global.webkit && global.webkit.messageHandlers && global.webkit.messageHandlers.reader
        ? global.webkit.messageHandlers.reader.postMessage(msg)
        : global.__readerBridge && global.__readerBridge(msg);
    } catch (e) { /* a broken bridge must never stop the typesetting */ }
  }
  const fail = e => post({ type: 'error', message: (e && e.message) ? e.message : String(e) });
  /* Rects always leave the page as viewport ("web view") coordinates in CSS px: getBoundingClientRect() is already
     viewport-relative, which is exactly what the app needs to place a popover — even though the paginated layout
     lives far to the right of the viewport in document coordinates. */
  const rectOf = r => ({ x: r.left, y: r.top, width: r.width, height: r.height });

  /* ------------------------------------------------------------------ appearance tables (same values as the web reader) */
  const THEMES = {
    original: { name: 'Original', bg: '#ffffff', fg: '#1c1c1e', accent: '#007aff', keepColors: true },
    quiet:    { name: 'Quiet',    bg: '#3d3d3f', fg: '#e4e4e7', accent: '#7cc0ff', dark: true },
    paper:    { name: 'Paper',    bg: '#f8f1e2', fg: '#4a3c2d', accent: '#8a5a2b' },
    bold:     { name: 'Bold',     bg: '#ffffff', fg: '#000000', accent: '#007aff', bold: true },
    calm:     { name: 'Calm',     bg: '#2e2926', fg: '#e8dece', accent: '#d6a35c', dark: true },
    focus:    { name: 'Focus',    bg: '#000000', fg: '#f5f5f7', accent: '#ffd60a', dark: true, focus: true },
  };
  /* `original` keeps the book's own fonts; every other id maps to a stack whose first family ships with macOS. */
  const FONTS = {
    original: null,
    athelas: 'Athelas, "Iowan Old Style", Georgia, serif',
    charter: 'Charter, "Bitstream Charter", "Sitka Text", Georgia, serif',
    georgia: 'Georgia, "Times New Roman", serif',
    iowan: '"Iowan Old Style", Georgia, serif',
    newyork: '"New York", ui-serif, "Iowan Old Style", Georgia, serif',
    palatino: 'Palatino, "Palatino Linotype", "Book Antiqua", "URW Palladio L", Georgia, serif',
    sanfrancisco: '-apple-system, BlinkMacSystemFont, system-ui, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif',
    seravek: 'Seravek, "Gill Sans", "Trebuchet MS", Verdana, sans-serif',
    times: '"Times New Roman", Times, "Liberation Serif", serif',
  };
  const HL_COLORS = { yellow: '#ffd60a', green: '#30d158', blue: '#5ac8fa', pink: '#ff6482', purple: '#bf5af2' };
  const LINE_HEIGHTS = { tight: 1.3, normal: 1.55, relaxed: 1.7, loose: 1.85 };
  /* Text column width. Paginated: side margin of each page. Scrolling: maximum column width. */
  const TEXT_WIDTH = { narrow: { margin: 120, scroll: 620 }, medium: { margin: 76, scroll: 880 }, wide: { margin: 44, scroll: 1120 }, full: { margin: 32, scroll: Infinity } };
  const WHEEL_THRESHOLD = { low: 140, medium: 60, high: 24 };
  const M_TOP = 68, M_BOTTOM = 56;          // page margins that keep text clear of the app's floating chrome
  const FS_TOP = 40, FS_BOTTOM = 40;        // …which is hidden in full screen, so the text may breathe wider
  const SCROLL_TOP = 84, SCROLL_SIDE = 36;  // vertical-scrolling layout
  const SEARCH_BATCH = 40, SEARCH_MAX = 400;

  const DEFAULTS = {
    theme: 'original', font: 'original', fontSize: 100, lineHeight: 'normal', textWidth: 'medium',
    justify: false, hyphenate: true, layout: 'paginated', spread: 'auto', pageTurn: 'slide',
    wheelTurnsPages: true, wheelSensitivity: 'medium', wheelInvert: false, wheelHorizontal: true,
  };
  /* Settings that change where the text falls: they need a relayout with the reading position kept. */
  const LAYOUT_KEYS = ['theme', 'font', 'fontSize', 'lineHeight', 'textWidth', 'justify', 'hyphenate', 'layout', 'spread'];

  function normalizeSettings(s) {
    const out = Object.assign({}, DEFAULTS, s || {});
    if (!THEMES[out.theme]) out.theme = DEFAULTS.theme;
    if (!(out.font in FONTS)) out.font = DEFAULTS.font;
    if (!LINE_HEIGHTS[out.lineHeight]) out.lineHeight = DEFAULTS.lineHeight;
    if (!TEXT_WIDTH[out.textWidth]) out.textWidth = DEFAULTS.textWidth;
    if (!WHEEL_THRESHOLD[out.wheelSensitivity]) out.wheelSensitivity = DEFAULTS.wheelSensitivity;
    out.layout = out.layout === 'scroll' ? 'scroll' : 'paginated';
    // The web reader called the spreads single/double; the app's protocol says one/two. Accept both.
    out.spread = (out.spread === 'one' || out.spread === 'single') ? 'one' : (out.spread === 'two' || out.spread === 'double') ? 'two' : 'auto';
    out.pageTurn = out.pageTurn === 'none' ? 'none' : 'slide';
    out.fontSize = U.clamp(Math.round(+out.fontSize || 100), 50, 300);
    for (const k of ['justify', 'hyphenate', 'wheelTurnsPages', 'wheelInvert', 'wheelHorizontal']) out[k] = !!out[k];
    return out;
  }
  const normHighlight = h => ({ id: h.id, spine: (h.locator && h.locator.spine) || h.spine || 0, start: (h.locator ? h.locator.start : h.start) || 0, end: (h.locator ? h.locator.end : h.end) || 0, color: h.color || 'yellow', note: h.note || '', text: h.text || '' });
  const normBookmark = b => ({ id: b.id, spine: (b.locator && b.locator.spine) || b.spine || 0, offset: (b.locator ? b.locator.offset : b.offset) || 0, pos: null });

  /* ================================================================== the core */
  const Reader = {
    isOpen: false, epub: null, sections: [], secEls: [], root: null, title: '', words: 0,
    layout: null, page: 0, sectionStarts: [], tocEntries: [], highlights: [], bookmarks: [],
    settings: normalizeSettings(null), anchor: null, fullscreen: false,
    _wheel: { acc: 0, last: 0, lastDelta: 0, locked: false },
    _sel: null, _searchToken: 0, _relayoutTimer: null, _resizeTimer: null, _scrollPoll: null, _lastY: 0, _relayoutToken: 0, _locCache: null,

    init() {
      this.root = document.getElementById('book-root');
      this._postPosition = U.throttle(() => this._sendPosition(), 100);
      this._postPointer = U.throttle((x, y) => post({ type: 'pointer', x, y }), 80);
      // `activity` only drives the app's reading-time idle detection, so a notification every half second is plenty
      // and keeps a fast trackpad from flooding the message bridge.
      this._postActivity = U.throttle(() => post({ type: 'activity' }), 500);
      document.addEventListener('wheel', e => this.onWheel(e), { passive: false });
      document.addEventListener('keydown', e => this.onKey(e));
      document.addEventListener('mouseup', () => setTimeout(() => this.onSelectionEnd(), 0));
      document.addEventListener('click', e => this.onClick(e));
      document.addEventListener('mousemove', e => this.onMouseMove(e));
      document.addEventListener('scroll', U.throttle(() => this.onScroll(), 80), { passive: true });
      document.addEventListener('selectionchange', () => this.onSelectionChange());
      global.addEventListener('resize', () => {
        if (!this.isOpen) return;
        clearTimeout(this._resizeTimer);
        this._resizeTimer = setTimeout(() => this._queueRelayout(this.anchor || this.currentLocator()), 120);
      });
      this.applyTheme(); // paint the themed background before a book is even open
    },

    /* ------------------------------------------------------------------ open */
    async open(opts) {
      opts = opts || {};
      try {
        this._reset();
        if (opts.settings) this.settings = normalizeSettings(opts.settings);
        this.applyTheme();
        if (!Zip.supported) throw new Error('This engine cannot read EPUB files (DecompressionStream is unavailable).');
        if (!opts.url) throw new Error('No book URL was given.');
        const res = await fetch(opts.url);
        if (!res.ok) throw new Error('The book could not be loaded (HTTP ' + res.status + ').');
        const epub = await EPUB.open(await res.blob());
        this.epub = epub;
        const { sections, css, words } = await epub.loadAll();
        this.sections = sections; this.words = words; this.title = epub.metadata.title || '';
        this._render(css);
        await this._waitForAssets();
        this.applyTextSettings();
        this.unwrapMonolithic(0.6);
        this.buildTocEntries();
        this.highlights = (opts.highlights || []).map(normHighlight);
        this.bookmarks = (opts.bookmarks || []).map(normBookmark);
        this.isOpen = true;
        await this.relayout({ restore: opts.locator || null, silent: true });
        this.renderHighlights();
        post(Object.assign({ type: 'opened', title: this.title, spineCount: this.sections.length, words: this.words, toc: this.tocPayload() }, this.layoutFields()));
        this._sendPosition();
      } catch (e) { fail(e); }
    },
    _reset() {
      this.isOpen = false; this.layout = null; this.anchor = null; this.page = 0; this._sel = null; this._locCache = null;
      this._searchToken++; this._watchScroll(false);
      clearTimeout(this._relayoutTimer);
      if (this.epub) { this.epub.dispose(); this.epub = null; }
      this.sections = []; this.secEls = []; this.sectionStarts = []; this.tocEntries = []; this.highlights = []; this.bookmarks = [];
      this._unwrapped = false;
      document.getElementById('book-css').textContent = '';
      this.root.innerHTML = '<div class="book-end" id="book-end"></div>';
      document.body.className = '';
    },
    /* The sections go into this very document — same shape the web reader wrote into its iframe, so the book's own
       (scoped) CSS and every offset/locator rule below still apply unchanged. */
    _render(css) {
      document.getElementById('book-css').textContent = css || '';
      this.root.innerHTML = this.sections.map(s =>
        `<section class="books-section" id="sec-${s.idx}" data-spine="${s.idx}">` +
        `<div class="book-body${s.bodyClass ? ' ' + U.esc(s.bodyClass) : ''}"${s.bodyId ? ` id="${U.esc(s.bodyId)}"` : ''}>${s.html}</div></section>`).join('') +
        '<div class="book-end" id="book-end"></div>';
      this.secEls = this.sections.map(s => document.getElementById('sec-' + s.idx));
    },
    /* Multi-column pagination cannot break a scroll container (overflow other than visible), an absolutely positioned
       box or an atomic inline: a wrapper like that around a chapter leaves the whole chapter in one clipped column and
       the book measures one page. Wrappers holding at least `share` of a section's text are made plain blocks. */
    unwrapMonolithic(share) {
      const fix = ['overflow', 'overflow-x', 'overflow-y', 'position', 'height', 'max-height', 'min-height', 'width', 'max-width', 'transform', 'column-count', 'columns', 'float', 'clip-path', 'contain'];
      for (const sec of this.secEls) {
        const total = (sec.textContent || '').replace(/\s+/g, '').length;
        if (total < 200) continue;
        const stack = [sec.firstElementChild];
        while (stack.length) {
          const el = stack.pop(); if (!el) continue;
          for (const child of el.children) {
            const len = (child.textContent || '').replace(/\s+/g, '').length;
            if (len < total * share) continue;
            const tag = child.tagName.toLowerCase();
            if (['table', 'tbody', 'tr', 'td', 'th', 'pre', 'svg', 'img', 'ol', 'ul'].includes(tag)) { stack.push(child); continue; }
            const cs = getComputedStyle(child);
            const display = cs.display;
            for (const prop of fix) child.style.removeProperty(prop);
            child.style.setProperty('overflow', 'visible', 'important');
            child.style.setProperty('position', 'static', 'important');
            child.style.setProperty('height', 'auto', 'important');
            child.style.setProperty('max-height', 'none', 'important');
            child.style.setProperty('width', 'auto', 'important');
            child.style.setProperty('max-width', 'none', 'important');
            child.style.setProperty('transform', 'none', 'important');
            child.style.setProperty('column-count', 'auto', 'important');
            child.style.setProperty('float', 'none', 'important');
            if (/inline|flex|grid|table/.test(display)) child.style.setProperty('display', 'block', 'important');
            stack.push(child);
          }
        }
      }
    },
    /* Images and web fonts must be laid out before the first measurement, or the page count is wrong. */
    async _waitForAssets() {
      const imgs = [...document.images].filter(i => !i.complete);
      const waits = imgs.map(i => new Promise(r => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); }));
      if (document.fonts && document.fonts.ready) waits.push(document.fonts.ready.catch(() => {}));
      await Promise.race([Promise.all(waits), U.sleep(4000)]);
      await U.nextFrame();
    },

    /* ------------------------------------------------------------------ settings */
    applySettings(s) {
      const before = this.settings;
      this.settings = normalizeSettings(Object.assign({}, this.settings, s || {}));
      this.applyTextSettings();
      if (!this.isOpen) return;
      if (this.settings.theme !== before.theme) this.renderHighlights();  // the tint depends on whether the theme is dark
      if (LAYOUT_KEYS.some(k => this.settings[k] !== before[k])) this._queueRelayout(this.anchor || this.currentLocator());
      else this._sendPosition();
    },
    setFullscreen(on) {
      const v = !!on;
      if (v === this.fullscreen) return;
      this.fullscreen = v;
      if (this.isOpen) this._queueRelayout(this.anchor || this.currentLocator());
    },
    applyTheme() {
      const t = THEMES[this.settings.theme] || THEMES.original;
      const de = document.documentElement, b = document.body;
      de.classList.toggle('dark', !!t.dark);
      de.style.setProperty('--fg', t.fg); de.style.setProperty('--bg', t.bg); de.style.setProperty('--accent', t.accent);
      de.style.setProperty('--fg-2', t.dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)');
      de.style.setProperty('--fg-3', t.dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.25)');
      b.classList.toggle('theme-dark', !!t.dark); b.classList.toggle('theme-bold', !!t.bold);
      b.classList.toggle('theme-focus', !!t.focus); b.classList.toggle('keep-colors', !!t.keepColors);
    },
    applyTextSettings() {
      const de = document.documentElement, b = document.body, s = this.settings;
      de.style.setProperty('--fs', (16 * s.fontSize / 100).toFixed(2) + 'px');
      de.style.setProperty('--lh', String(LINE_HEIGHTS[s.lineHeight] || 1.55));
      const font = FONTS[s.font];
      b.classList.toggle('font-custom', !!font); de.style.setProperty('--font-family', font || 'inherit');
      b.classList.toggle('justify', !!s.justify);
      de.style.setProperty('--hyphens', s.hyphenate ? 'auto' : 'manual');
      this.applyTheme();
    },
    _queueRelayout(loc) {
      if (loc) this.anchor = loc;
      clearTimeout(this._relayoutTimer);
      this._relayoutTimer = setTimeout(() => this.relayout(), 40);
    },

    /* ------------------------------------------------------------------ layout */
    async relayout(opts) {
      opts = opts || {};
      if (!this.isOpen || !this.root) return;
      const token = ++this._relayoutToken;
      const restore = opts.restore !== undefined ? opts.restore : (this.anchor || (this.layout ? this.currentLocator() : null));
      if (restore) this.anchor = restore;
      const de = document.documentElement, body = document.body, s = this.settings;
      const W = de.clientWidth || global.innerWidth, H = de.clientHeight || global.innerHeight;
      const mode = s.layout;
      const tw = TEXT_WIDTH[s.textWidth] || TEXT_WIDTH.medium;
      const mSide = tw.margin;
      const cols = mode === 'paginated' ? (s.spread === 'two' ? 2 : s.spread === 'one' ? 1 : (W >= 1000 ? 2 : 1)) : 1;
      const gap = mSide * 2; // keeps neighbouring columns fully outside the viewport in single-page mode too
      const boxW = Math.max(200, W - 2 * mSide);
      const colW = (boxW - gap * (cols - 1)) / cols;
      const step = colW + gap;
      const mTop = this.fullscreen ? FS_TOP : M_TOP, mBottom = this.fullscreen ? FS_BOTTOM : M_BOTTOM;
      const colH = Math.max(200, H - mTop - mBottom);
      const scrollW = Math.min(tw.scroll === Infinity ? Infinity : tw.scroll, Math.max(320, W - 2 * SCROLL_SIDE));
      de.style.setProperty('--cols', String(cols)); de.style.setProperty('--gap', gap + 'px'); de.style.setProperty('--box-w', boxW + 'px');
      de.style.setProperty('--col-h', colH + 'px'); de.style.setProperty('--col-w', colW + 'px'); de.style.setProperty('--m-top', mTop + 'px'); de.style.setProperty('--m-side', mSide + 'px');
      de.style.setProperty('--scroll-w', scrollW + 'px'); de.style.setProperty('--scroll-top', SCROLL_TOP + 'px'); de.style.setProperty('--scroll-side', SCROLL_SIDE + 'px');
      body.classList.toggle('paginated', mode === 'paginated'); body.classList.toggle('scroll', mode === 'scroll');
      this.layout = { mode, cols, colW, gap, step, colH, mSide, W, H, total: 1 };
      await U.nextFrame(); await U.nextFrame();
      if (token !== this._relayoutToken || !this.root) return; // a newer relayout took over
      // A layout switch must not inherit the other axis' scroll offset (pages would sit shifted up / scrolling shifted left).
      if (mode === 'paginated') this.se.scrollTop = 0; else this.se.scrollLeft = 0;
      this.measure();
      if (restore) this.goToLocator(restore, { instant: true, keepAnchor: true, silent: true });
      else this.goTo(mode === 'paginated' ? this.page : 0, { instant: true, keepAnchor: true, silent: true });
      this.recomputeBookmarkPositions();
      this._watchScroll(mode === 'scroll');
      if (!opts.silent) { this.postLayout(); this._sendPosition(); }
    },
    /* Vertical scrolling: besides scroll events, poll the position so progress never stalls (engines differ in event delivery). */
    _watchScroll(on) {
      clearInterval(this._scrollPoll); this._scrollPoll = null;
      if (!on) return;
      this._lastY = this.currentY();
      this._scrollPoll = setInterval(() => {
        if (!this.isOpen) return;
        const y = this.currentY();
        if (y !== this._lastY) { this._lastY = y; this.onScroll(); }
      }, 200);
    },
    get se() { return document.scrollingElement || document.documentElement; },

    /** Measures the total extent (columns or scroll height) robustly: end marker, last section start and last visible glyph. */
    measure() {
      const L = this.layout, se = this.se;
      const endRect = document.getElementById('book-end').getBoundingClientRect();
      const lastRect = this.lastContentRect();
      if (L.mode === 'paginated') {
        this.sectionStarts = this.secEls.map(s => this.colOfStart(s.getBoundingClientRect().left + se.scrollLeft));
        let endCol = this.colOfStart(endRect.left + se.scrollLeft);
        if (lastRect) endCol = Math.max(endCol, Math.floor((lastRect.left + se.scrollLeft - L.mSide + 2) / L.step));
        const lastStart = this.sectionStarts.length ? this.sectionStarts[this.sectionStarts.length - 1] : 0;
        L.total = Math.max(1, endCol + 1, lastStart + 1);
        // Content taller than a column means something did not fragment: unwrap harder and measure again, once.
        if (!this._unwrapped && this.root.scrollHeight > L.colH + 40) {
          this._unwrapped = true;
          this.unwrapMonolithic(0.3);
          return this.measure();
        }
      } else {
        this.sectionStarts = this.secEls.map(s => Math.max(0, s.getBoundingClientRect().top + se.scrollTop - SCROLL_TOP + 12));
        const byEnd = Math.round(endRect.bottom + se.scrollTop - se.clientHeight);
        const byLast = lastRect ? Math.round(lastRect.bottom + se.scrollTop - se.clientHeight) : 0;
        const byScroll = se.scrollHeight - se.clientHeight;
        L.total = Math.max(1, byEnd, byLast, byScroll);
      }
      for (const t of this.tocEntries) t.pos = this.hrefToPos(t.href);
    },
    /** The last glyph (or image) that actually renders — an empty trailing element must not add a blank page. */
    lastContentRect() {
      const range = document.createRange();
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
      const L = this.layout; if (!L || !this.isOpen) return false;
      if (L.mode === 'paginated') return this.page + L.cols >= L.total;
      return this.currentY() >= L.total - 2;
    },

    /* ------------------------------------------------------------------ navigation */
    goTo(pos, opts) {
      opts = opts || {};
      const L = this.layout; if (!L) return;
      if (!opts.keepAnchor) this.anchor = null;
      const se = this.se, smooth = !opts.instant && this.settings.pageTurn !== 'none';
      if (L.mode === 'scroll') {
        const y = U.clamp(Math.round(pos), 0, L.total); this.page = y;
        if (smooth) se.scrollTo({ top: y, behavior: 'smooth' }); else se.scrollTop = y;
      } else {
        let col = U.clamp(Math.round(pos), 0, Math.max(0, L.total - 1));
        col = Math.floor(col / L.cols) * L.cols;  // a spread always starts on an even column
        this.page = col;
        const x = col * L.step;
        if (se.scrollTop) se.scrollTop = 0;
        if (smooth) se.scrollTo({ left: x, behavior: 'smooth' }); else se.scrollLeft = x;
      }
      if (!opts.silent) this.postPosition();
    },
    next() {
      const L = this.layout; if (!L) return;
      if (this.isAtEnd()) { post({ type: 'end' }); return; }
      if (L.mode === 'scroll') this.goTo(this.currentY() + this.se.clientHeight * 0.85); else this.goTo(this.page + L.cols);
    },
    prev() {
      const L = this.layout; if (!L) return;
      if (L.mode === 'scroll') { if (this.currentY() <= 0) return; this.goTo(this.currentY() - this.se.clientHeight * 0.85); return; }
      if (this.page <= 0) return;
      this.goTo(this.page - L.cols);
    },
    nextChapter() {
      const L = this.layout; if (!L) return;
      // A spread always starts on an even column, so in two-page mode the next chapter may already be showing on the
      // right-hand page: skip to the first start that is not on screen, or "next chapter" would stay put.
      const after = (L.mode === 'paginated' ? this.page + L.cols - 1 : this.curPos()) + 0.5;
      const starts = this.chapterStarts().filter(s => s > after);
      if (starts.length) this.goTo(starts[0]);
      else if (this.isAtEnd()) post({ type: 'end' });
      else this.goTo(L.mode === 'paginated' ? L.total - 1 : L.total);
    },
    prevChapter() { const cur = this.curPos(); const starts = this.chapterStarts().filter(s => s < cur - 0.5); this.goTo(starts.length ? starts[starts.length - 1] : 0); },
    /** Section boundaries and TOC targets together: what "a chapter" means for navigation and "pages left". */
    chapterStarts() { const set = new Set(this.sectionStarts); for (const t of this.tocEntries) if (t.pos != null) set.add(t.pos); return [...set].sort((a, b) => a - b); },
    goToPage(n) { this.goTo(+n || 0); },
    goToPos(pos) { this.goTo(+pos || 0); },
    goToFraction(f) {
      const L = this.layout; if (!L) return;
      const frac = U.clamp(+f || 0, 0, 1);
      this.goTo(L.mode === 'paginated' ? Math.round(frac * Math.max(0, L.total - 1)) : Math.round(frac * L.total));
    },
    goToLocator(loc, opts) {
      const L = this.layout; if (!L || !loc) return;
      const idx = U.clamp(loc.spine || 0, 0, this.secEls.length - 1);
      const offset = loc.offset != null ? loc.offset : loc.start;
      const r = offset ? this.positionRect(idx, offset) : null;
      if (L.mode === 'paginated') this.goTo(r ? this.colOfPoint(r.left + this.se.scrollLeft) : (this.sectionStarts[idx] || 0), opts);
      else this.goTo(r ? Math.max(0, r.top + this.se.scrollTop - SCROLL_TOP + 12) : (this.sectionStarts[idx] || 0), opts);
      // A range locator ({spine, start, end} — what highlights and search hits carry) is also shown selected, so the
      // reader can see what was jumped to. A plain {spine, offset} locator only scrolls.
      if (loc.start != null && loc.end != null) {
        const range = this.rangeFromOffsets(idx, loc.start, loc.end);
        const sel = global.getSelection();
        if (range && sel) { sel.removeAllRanges(); sel.addRange(range); }
      }
    },
    hrefTarget(href) {
      if (!href || !this.epub) return null;
      const parts = href.split('#'), path = parts[0], frag = parts[1];
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
    /* A notch of a mouse wheel, delivered by the app: scrolls the text in the scrolling layout, turns a page otherwise. */
    scrollBy(dy) {
      const L = this.layout; if (!L || !this.isOpen || !dy) return;
      this.activity();
      if (L.mode === 'scroll') { this.se.scrollTop += dy; this.onScroll(); }
      else if (dy > 0) this.next(); else this.prev();
    },
    onScroll() {
      if (!this.layout || this.layout.mode !== 'scroll' || !this.isOpen) return;
      this.page = this.currentY(); this.anchor = null;
      this.postPosition();
    },

    /* ------------------------------------------------------------------ locators
       A locator is a character offset into a section's text: it survives font, size, width and window changes,
       which page indices and pixel offsets do not. */
    textNodes(sec) {
      const out = []; const w = document.createTreeWalker(sec, NodeFilter.SHOW_TEXT); let n, acc = 0;
      while ((n = w.nextNode())) { out.push({ node: n, start: acc, end: acc + n.nodeValue.length }); acc += n.nodeValue.length; }
      return out;
    },
    sectionAt(pos) { let idx = 0; for (let i = 0; i < this.sectionStarts.length; i++) { if (this.sectionStarts[i] <= pos + 0.5) idx = i; else break; } return idx; },
    currentLocator() {
      const L = this.layout; if (!L || !this.isOpen) return null;
      const se = this.se;
      // Finding the character at the top-left of the page walks the section and asks for rects, so remember the answer:
      // position reports, state() and the next relayout all ask for the same locator at the same place.
      const key = L.mode + ':' + (L.mode === 'paginated' ? this.page : se.scrollTop) + ':' + this._relayoutToken;
      if (this._locCache && this._locCache.key === key) return this._locCache.loc;
      const loc = this._computeLocator();
      this._locCache = { key, loc };
      return loc;
    },
    _computeLocator() {
      const L = this.layout, se = this.se;
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
    /** First character of the section whose rect satisfies `pred` — binary search inside the text node that straddles it. */
    findFirstTextAt(secIdx, pred) {
      const sec = this.secEls[secIdx]; if (!sec) return null;
      const range = document.createRange();
      const walker = document.createTreeWalker(sec, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
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
      const range = document.createRange();
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
      const range = document.createRange(); let s = null, e = null;
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
    offsetIn(sec, node, off) { const r = document.createRange(); r.setStart(sec, 0); r.setEnd(node, off); return r.toString().length; },

    /* ------------------------------------------------------------------ chapters */
    buildTocEntries() {
      this.tocEntries = this.epub.flatToc().filter(t => t.href).map(t => ({
        label: t.label, href: t.href, depth: t.depth, spine: this.epub.spineIndexOf(t.href), pos: null,
      }));
    },
    tocPayload() { return this.tocEntries.map(t => ({ label: t.label, href: t.href, level: t.depth, pos: t.pos, spine: t.spine })); },
    /** The TOC entry covering `pos`, falling back to the section's own title for books whose TOC skips sections. */
    chapterAt(pos) {
      let best = null, bestIdx = -1;
      this.tocEntries.forEach((t, i) => { if (t.pos != null && t.pos <= pos + 0.5 && (!best || t.pos >= best.pos)) { best = t; bestIdx = i; } });
      if (best) return { label: best.label, pos: best.pos, index: bestIdx };
      const idx = this.sectionAt(pos), s = this.sections[idx];
      return { label: (s && s.title) || '', pos: this.sectionStarts[idx] || 0, index: -1 };
    },
    /** The chapter the reader is looking at. A two-page spread may open a new chapter on its right-hand page —
        after a jump from the table of contents that is the chapter the reader asked for, so name that one. */
    currentChapter() {
      const L = this.layout;
      return this.chapterAt(L.mode === 'paginated' ? this.page + L.cols - 1 : this.curPos());
    },
    nextChapterStart(pos) {
      let next = Infinity;
      for (const s of this.chapterStarts()) if (s > pos + 0.5 && s < next) next = s;
      return next === Infinity ? this.layout.total : next;
    },

    /* ------------------------------------------------------------------ reporting */
    layoutFields() {
      const L = this.layout; if (!L) return { mode: 'paginated', total: 1, cols: 1, chapters: [], bookmarks: [] };
      return {
        mode: L.mode, total: L.total, cols: L.cols,
        chapters: this.tocEntries.filter(t => t.pos != null).map(t => ({ label: t.label, pos: t.pos, level: t.depth })),
        bookmarks: this.bookmarks.filter(b => b.pos != null).map(b => ({ id: b.id, pos: b.pos })),
      };
    },
    postLayout() { if (this.layout) post(Object.assign({ type: 'layout' }, this.layoutFields())); },
    postPosition() { this._postPosition(); },   // throttled to ~100 ms (leading + trailing)
    positionFields() {
      const L = this.layout; if (!L || !this.isOpen) return null;
      const paginated = L.mode === 'paginated';
      const cur = this.curPos();
      const ch = this.currentChapter();
      const percent = paginated
        ? Math.min(100, ((this.page + L.cols) / Math.max(1, L.total)) * 100)
        : (L.total > 0 ? Math.min(100, (cur / L.total) * 100) : 0);
      const bm = this.bookmarkOnPage();
      return {
        page: Math.round(cur), total: L.total, percent: Math.round(percent * 10) / 10,
        chapter: ch.label, chapterIndex: ch.index,
        pagesLeftInChapter: paginated ? Math.max(0, Math.ceil((this.nextChapterStart(this.page + L.cols - 1) - (this.page + L.cols - 1)) / L.cols) - 1) : 0,
        // The anchor, when set, is the exact character the last relayout was asked to show: reporting it keeps a
        // settings round-trip (and the progress the app stores) from drifting to the top of the page.
        locator: this.anchor || this.currentLocator(),
        atEnd: this.isAtEnd(), bookmark: bm ? bm.id : null,
      };
    },
    _sendPosition() { const p = this.positionFields(); if (p) post(Object.assign({ type: 'position' }, p)); },
    state() { return JSON.stringify(Object.assign({ open: this.isOpen }, this.layoutFields(), this.positionFields() || {})); },

    /* ------------------------------------------------------------------ input */
    activity() { this._postActivity(); },
    onWheel(e) {
      this.activity();
      const L = this.layout; if (!L) return;
      // ⌘/pinch belongs to the app (it owns the text size); swallow it so WebKit does not zoom the page instead.
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); return; }
      let dy = e.deltaY, dx = e.deltaX;
      if (e.deltaMode === 1) { dy *= 16; dx *= 16; } else if (e.deltaMode === 2) { dy *= L.H; dx *= L.W; }
      let horizontal = Math.abs(dx) > Math.abs(dy);
      let d = horizontal ? dx : dy;
      if (e.shiftKey && !horizontal) { horizontal = true; d = dy; } // ⇧ + wheel behaves like a horizontal wheel
      if (L.mode === 'scroll' && !horizontal) return;               // vertical scrolling layout: the wheel scrolls the text
      e.preventDefault();
      if (!this.settings.wheelTurnsPages) return;
      if (horizontal && !this.settings.wheelHorizontal) return;
      if (this.settings.wheelInvert) d = -d;
      if (!d) return;
      // A click of a notched mouse wheel (or tilt wheel) is one page, regardless of how many pixels the OS maps it to.
      const legacy = horizontal ? (e.wheelDeltaX || 0) : (e.wheelDeltaY || 0);
      const discrete = e.deltaMode !== 0 || Math.abs(legacy) >= 100 || Math.abs(d) >= 50;
      const threshold = (WHEEL_THRESHOLD[this.settings.wheelSensitivity] || WHEEL_THRESHOLD.medium) * (horizontal ? 0.6 : 1);
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
      const t = e.target;
      const tag = ((t && t.tagName) || '').toLowerCase();
      if (['input', 'textarea', 'select'].includes(tag) || (t && t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey) return;   // every ⌘ shortcut is the app's
      const L = this.layout; if (!L) return;
      const k = e.key;
      const stop = () => { e.preventDefault(); e.stopPropagation(); };
      if (k === 'ArrowRight' || k === 'PageDown' || (k === ' ' && !e.shiftKey)) { stop(); this.activity(); e.altKey && k === 'ArrowRight' ? this.nextChapter() : this.next(); }
      else if (k === 'ArrowLeft' || k === 'PageUp' || (k === ' ' && e.shiftKey)) { stop(); this.activity(); e.altKey && k === 'ArrowLeft' ? this.prevChapter() : this.prev(); }
      else if (k === 'ArrowDown' && L.mode === 'paginated') { stop(); this.activity(); this.next(); }
      else if (k === 'ArrowUp' && L.mode === 'paginated') { stop(); this.activity(); this.prev(); }
      else if (k === 'Home') { stop(); this.activity(); this.goTo(0); }
      else if (k === 'End') { stop(); this.activity(); this.goTo(L.mode === 'paginated' ? L.total - 1 : L.total); }
    },
    onClick(e) {
      this.activity();
      const t = e.target && e.target.nodeType === 1 ? e.target : (e.target && e.target.parentElement);
      if (!t || !t.closest) return;
      const a = t.closest('a[href], a[data-internal-href]');
      if (a) {
        e.preventDefault();
        // epub.js tagged in-book destinations with data-internal-href; anything else leaves the book.
        if (a.dataset.internalHref) this.goToHref(a.dataset.internalHref);
        else { const href = a.getAttribute('href'); if (href) post({ type: 'link', href }); }
        return;
      }
      const hl = t.closest('span.books-hl');
      if (hl) {
        const sel = global.getSelection();
        if (sel && !sel.isCollapsed) return;  // the tap ended a selection gesture, not a highlight tap
        post({ type: 'highlightTapped', id: hl.dataset.id, rect: rectOf(hl.getBoundingClientRect()) });
      }
    },
    onMouseMove(e) { if (this.isOpen) this._postPointer(e.clientX, e.clientY); },

    /* ------------------------------------------------------------------ selection */
    /** The live selection as {spine, start, end, text, rect}, or null when there is none inside the book. */
    readSelection() {
      const sel = global.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
      const range = sel.getRangeAt(0);
      const text = range.toString().replace(/\s+/g, ' ').trim(); if (!text) return null;
      const s = this.sectionOfNode(range.startContainer), en = this.sectionOfNode(range.endContainer);
      if (s < 0) return null;
      const sec = this.secEls[s];
      const start = this.offsetIn(sec, range.startContainer, range.startOffset);
      const end = en === s ? this.offsetIn(sec, range.endContainer, range.endOffset) : sec.textContent.length;
      if (end <= start) return null;
      return { spine: s, start, end, text: text.slice(0, 3000), rect: range.getBoundingClientRect() };
    },
    /** The chapter a range sits in — not necessarily the one named for the page, on a spread that turns a chapter. */
    chapterOf(sel) { return this.chapterAt(this.locatorToPos({ spine: sel.spine, offset: sel.start })).label; },
    onSelectionEnd() {
      if (!this.isOpen) return;
      const sel = this.readSelection();
      if (!sel) return;
      this._sel = sel;
      post({ type: 'selection', text: sel.text, locator: { spine: sel.spine, start: sel.start, end: sel.end }, rect: rectOf(sel.rect), chapter: this.chapterOf(sel) });
    },
    onSelectionChange() {
      if (!this._sel) return;
      const sel = global.getSelection();
      if (sel && !sel.isCollapsed && sel.rangeCount) return;
      this._sel = null;
      post({ type: 'selectionCleared' });
    },
    clearSelection() {
      const sel = global.getSelection();
      if (sel) sel.removeAllRanges();
      if (this._sel) { this._sel = null; post({ type: 'selectionCleared' }); }
    },

    /* ------------------------------------------------------------------ highlights */
    hlColor(name) {
      const hex = HL_COLORS[name] || HL_COLORS.yellow;
      const dark = !!(THEMES[this.settings.theme] || THEMES.original).dark;
      return `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${dark ? 0.42 : 0.45})`;
    },
    renderHighlights() {
      if (!this.root) return;
      this.unwrapAll();
      for (const h of [...this.highlights].sort((a, b) => a.spine - b.spine || a.start - b.start)) this.wrapHighlight(h);
    },
    unwrapAll() {
      for (const span of [...document.querySelectorAll('span.books-hl')]) { const p = span.parentNode; while (span.firstChild) p.insertBefore(span.firstChild, span); p.removeChild(span); }
    },
    /** Splits the text nodes the range covers and wraps each piece: a highlight may span elements and pages. */
    wrapHighlight(h) {
      const sec = this.secEls[h.spine]; if (!sec) return;
      // `underline` is a style rather than a colour in the protocol; it keeps the yellow stroke the web reader drew.
      const underline = h.color === 'underline';
      for (const t of this.textNodes(sec)) {
        if (t.end <= h.start || t.start >= h.end || !t.node.nodeValue.trim()) continue;
        let node = t.node;
        const s = Math.max(0, h.start - t.start), e = Math.min(t.node.nodeValue.length, h.end - t.start);
        if (e <= s) continue;
        if (s > 0) node = node.splitText(s);
        if (e - s < node.nodeValue.length) node.splitText(e - s);
        const span = document.createElement('span');
        span.className = 'books-hl' + (underline ? ' underline' : '');
        span.dataset.id = h.id;
        span.style.setProperty('--hl', underline ? HL_COLORS.yellow : this.hlColor(h.color));
        node.parentNode.insertBefore(span, node); span.appendChild(node);
      }
    },
    addHighlight(data) {
      data = data || {};
      const sel = this.readSelection() || this._sel;
      if (!sel) { fail(new Error('Nothing is selected.')); return null; }
      const h = {
        id: data.id || U.uuid(), spine: sel.spine, start: sel.start, end: sel.end,
        text: sel.text, color: data.color || 'yellow', note: data.note || '',
        chapter: this.chapterOf(sel),
      };
      this.highlights.push(h);
      this.wrapHighlight(h);
      const s = global.getSelection(); if (s) s.removeAllRanges();
      this._sel = null;
      post({ type: 'highlightAdded', id: h.id, locator: { spine: h.spine, start: h.start, end: h.end }, text: h.text, chapter: h.chapter, color: h.color, note: h.note });
      return h.id;
    },
    updateHighlight(patch) {
      patch = patch || {};
      const h = this.highlights.find(x => x.id === patch.id); if (!h) return;
      if (patch.color != null) h.color = patch.color;
      if (patch.note != null) h.note = patch.note;
      this.renderHighlights();
    },
    removeHighlight(id) {
      const n = this.highlights.length;
      this.highlights = this.highlights.filter(h => h.id !== id);
      if (this.highlights.length !== n) this.renderHighlights();
    },

    /* ------------------------------------------------------------------ bookmarks */
    locatorToPos(loc) {
      const L = this.layout; if (!L) return 0;
      const idx = U.clamp(loc.spine || 0, 0, this.secEls.length - 1);
      const r = loc.offset ? this.positionRect(idx, loc.offset) : null;
      if (L.mode === 'paginated') return r ? this.colOfPoint(r.left + this.se.scrollLeft) : (this.sectionStarts[idx] || 0);
      return r ? Math.max(0, r.top + this.se.scrollTop - SCROLL_TOP + 12) : (this.sectionStarts[idx] || 0);
    },
    recomputeBookmarkPositions() { for (const b of this.bookmarks) b.pos = this.locatorToPos(b); },
    bookmarkOnPage() {
      const L = this.layout; if (!L) return null;
      if (L.mode === 'paginated') return this.bookmarks.find(b => b.pos != null && b.pos >= this.page && b.pos < this.page + L.cols) || null;
      const y = this.currentY();
      return this.bookmarks.find(b => b.pos != null && b.pos >= y - 10 && b.pos < y + L.H * 0.85) || null;
    },
    setBookmarks(list) {
      this.bookmarks = (list || []).map(normBookmark);
      if (!this.layout) return;
      this.recomputeBookmarkPositions();
      this.postLayout();
      this._sendPosition();
    },

    /* ------------------------------------------------------------------ search
       Scanned section by section and reported in batches so a long book never blocks the page; `pos` is the page
       index (or scroll offset) of the hit so the app can show where each result sits and group them by chapter. */
    search(query) {
      const token = ++this._searchToken;
      const q = String(query == null ? '' : query).trim();
      if (!q || !this.isOpen) { post({ type: 'searchResults', query: q, results: [], done: true }); return; }
      const needle = q.toLowerCase();
      let batch = [], found = 0, idx = 0;
      const flush = done => { post({ type: 'searchResults', query: q, results: batch, done: !!done }); batch = []; };
      const step = () => {
        if (token !== this._searchToken || !this.isOpen) return;  // a newer search (or a close) cancelled this one
        const sec = this.secEls[idx];
        if (sec) {
          const text = sec.textContent, lower = text.toLowerCase();
          let i = 0;
          while (found < SEARCH_MAX && (i = lower.indexOf(needle, i)) >= 0) {
            const pos = this.locatorToPos({ spine: idx, offset: i });
            const from = Math.max(0, i - 48), to = Math.min(text.length, i + needle.length + 64);
            batch.push({
              spine: idx, offset: i, pos,
              excerpt: (from > 0 ? '…' : '') + text.slice(from, to).replace(/\s+/g, ' ').trim() + (to < text.length ? '…' : ''),
              chapter: this.chapterAt(pos).label,
            });
            found++; i += needle.length;
            if (batch.length >= SEARCH_BATCH) flush(false);
          }
        }
        idx++;
        if (idx >= this.secEls.length || found >= SEARCH_MAX) { flush(true); return; }
        setTimeout(step, 0);
      };
      setTimeout(step, 0);
    },

    /* ------------------------------------------------------------------ boot */
    ready() { post({ type: 'ready' }); },
  };

  /* The public surface the app calls into (PROTOCOL.md); everything else stays private to this file. */
  const api = {
    open: o => Reader.open(o),
    applySettings: s => Reader.applySettings(s),
    next: () => Reader.next(), prev: () => Reader.prev(),
    nextChapter: () => Reader.nextChapter(), prevChapter: () => Reader.prevChapter(),
    goToPage: n => Reader.goToPage(n), goToFraction: f => Reader.goToFraction(f),
    goToHref: h => Reader.goToHref(h), goToLocator: l => Reader.goToLocator(l), goToPos: p => Reader.goToPos(p),
    addHighlight: d => Reader.addHighlight(d), updateHighlight: d => Reader.updateHighlight(d), removeHighlight: id => Reader.removeHighlight(id),
    setBookmarks: b => Reader.setBookmarks(b),
    search: q => Reader.search(q),
    clearSelection: () => Reader.clearSelection(),
    state: () => Reader.state(),
    setFullscreen: v => Reader.setFullscreen(v),
    scrollBy: dy => Reader.scrollBy(dy),
    _core: Reader,   // self-tests and the shell's diagnostics reach the internals here
  };

  function boot() { Reader.init(); global.reader = api; Reader.ready(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  global.addEventListener('error', e => fail(e.error || e.message));
  global.addEventListener('unhandledrejection', e => fail(e.reason));
})(window);
