/* Application bootstrap: appearance, toolbar, sidebar, drag & drop import, keyboard shortcuts, native-shell bridge, PWA plumbing. */
(function (global) {
  'use strict';
  const $ = s => document.querySelector(s);
  const el = U.el;

  const App = {
    shell: null,              // set when running inside the native macOS shell (Books.app)
    _nativeFullscreen: false,

    async init() {
      this.initShell();
      this.applyAppearance();
      try { await DB.open(); } catch (e) {
        UI.sheet({ alert: true, icon: 'warning', title: 'Storage unavailable', message: 'Books needs IndexedDB to keep your library on this device. ' + (e.message || '') });
        return;
      }
      await Settings.load();
      this.applyAppearance();
      await Library.load();
      this.setIcons();
      this.wireToolbar();
      this.wireDragDrop();
      this.wireKeys();
      Reader.init();
      $('#app').classList.toggle('sidebar-collapsed', !!Settings.get('sidebarCollapsed'));
      Library.render();
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.applyAppearance());
      window.addEventListener('settings:change', e => { if (e.detail.key === 'appearance') this.applyAppearance(); });
      window.addEventListener('resize', U.debounce(() => window.dispatchEvent(new CustomEvent('app:fullscreen', { detail: this.isFullscreen() })), 150));
      window.addEventListener('beforeunload', () => { if (Reader.isOpen) { Reader.saveProgress(); Reader.flushStats(); } });
      this.registerServiceWorker();
      this.handleLaunchFiles();
      DB.persist();
      if (this.shell) this.shell.post({ type: 'ready', books: Library.books.length });
    },

    systemDark() { return matchMedia('(prefers-color-scheme: dark)').matches; },
    applyAppearance() {
      const a = Settings.get('appearance');
      if (a === 'light' || a === 'dark') document.documentElement.dataset.theme = a; else delete document.documentElement.dataset.theme;
    },
    pickFiles() { const input = $('#file-input'); input.value = ''; input.click(); },

    /* Fullscreen can come from the Fullscreen API, the native window (green button) or a PWA display mode. */
    isFullscreen() { return !!document.fullscreenElement || this._nativeFullscreen || matchMedia('(display-mode: fullscreen)').matches; },
    setNativeFullscreen(on) { this._nativeFullscreen = !!on; window.dispatchEvent(new CustomEvent('app:fullscreen', { detail: this.isFullscreen() })); },

    setIcons() {
      const set = (id, icon, size) => { const b = $('#' + id); if (b) b.insertAdjacentHTML('afterbegin', Icons.icon(icon, { size: size || 18 })); };
      set('btn-sidebar', 'sidebar', 19); set('btn-back', 'chevronLeft', 18); set('btn-forward', 'chevronRight', 18); set('btn-add', 'plus', 19); set('btn-more', 'ellipsis', 19);
      $('#view-seg [data-view="grid"]').insertAdjacentHTML('afterbegin', Icons.icon('grid', { size: 16 }));
      $('#view-seg [data-view="list"]').insertAdjacentHTML('afterbegin', Icons.icon('list', { size: 16 }));
      $('#search-wrap .search-icon').innerHTML = Icons.icon('search', { size: 15 });
      $('#sort-btn .popup-chevrons').innerHTML = Icons.icon('chevronUp', { size: 11, stroke: 2.6 }) + Icons.icon('chevronDown', { size: 11, stroke: 2.6 });
      $('#drop-overlay .drop-icon').innerHTML = Icons.icon('inbox', { size: 40, stroke: 1.4 });
    },

    wireToolbar() {
      $('#btn-sidebar').addEventListener('click', () => this.toggleSidebar());
      $('#btn-back').addEventListener('click', () => Library.back());
      $('#btn-forward').addEventListener('click', () => Library.forward());
      $('#btn-add').addEventListener('click', () => this.pickFiles());
      $('#file-input').addEventListener('change', e => { const files = [...e.target.files]; if (files.length) Library.addFiles(files); });
      $('#sort-btn').addEventListener('click', e => UI.menu([
        { title: 'Sort By' },
        ...['recent', 'title', 'author'].map(s => ({ label: s[0].toUpperCase() + s.slice(1), checked: Settings.get('sort') === s, action: () => { Settings.set('sort', s); Library.render(); } })),
      ], { anchor: e.currentTarget, matchWidth: true }));
      for (const b of $('#view-seg').querySelectorAll('button')) b.addEventListener('click', () => { Settings.set('view', b.dataset.view); Library.render(); });
      const search = $('#search-field');
      search.addEventListener('input', U.debounce(() => { Library.search = search.value.trim(); Library.renderView(); Library.renderToolbar(); }, 120));
      search.addEventListener('keydown', e => {
        if (e.key === 'Escape') { search.value = ''; Library.search = ''; Library.renderView(); search.blur(); }
        if (e.key === 'Enter') { const first = $('#view [data-id]'); if (first) { first.focus(); first.click(); } }
      });
      $('#btn-more').addEventListener('click', e => this.moreMenu(e.currentTarget));
      $('#btn-new-collection').addEventListener('click', () => Library.createCollection());
      $('#tl-zoom').addEventListener('click', () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {}); });
      $('#tl-close').addEventListener('click', () => { if (matchMedia('(display-mode: standalone)').matches) window.close(); });
    },
    toggleSidebar() {
      const c = $('#app').classList.toggle('sidebar-collapsed');
      Settings.set('sidebarCollapsed', c);
      $('#btn-sidebar').title = (c ? 'Show Sidebar' : 'Hide Sidebar') + ' (⌃⌘S)';
    },
    moreMenu(anchor) {
      const appearance = Settings.get('appearance');
      UI.menu([
        { label: 'Add to Library…', icon: 'plus', shortcut: U.modKey + 'O', action: () => this.pickFiles() },
        { label: 'New Collection…', icon: 'folderPlus', action: () => Library.createCollection() },
        { separator: true },
        { label: 'Customize Home', icon: 'sliders', submenu: Library.HOME_SECTIONS.map(([key, label]) => ({ label, checked: !!Settings.get(key), action: () => { Settings.set(key, !Settings.get(key)); if (Library.route.view === 'home') Library.renderView(); } })) },
        { label: 'Appearance', icon: appearance === 'dark' ? 'moon' : 'sun', submenu: [
          { label: 'Match System', checked: appearance === 'system', action: () => Settings.set('appearance', 'system') },
          { label: 'Light', checked: appearance === 'light', action: () => Settings.set('appearance', 'light') },
          { label: 'Dark', checked: appearance === 'dark', action: () => Settings.set('appearance', 'dark') },
        ] },
        { label: 'Reading Goals…', icon: 'target', action: () => Library.editGoals() },
        { label: 'Keyboard Shortcuts', icon: 'keyboard', shortcut: U.modKey + '/', action: () => this.showShortcuts() },
        { separator: true },
        { label: 'Storage & Data…', icon: 'gear', action: () => this.showStorage() },
        { label: 'About Books', icon: 'info', action: () => this.showAbout() },
      ], { anchor, align: 'end' });
    },
    wireDragDrop() {
      const overlay = $('#drop-overlay');
      let depth = 0;
      const hasFiles = e => e.dataTransfer && [...e.dataTransfer.types].includes('Files') && ![...e.dataTransfer.types].includes('text/x-book-ids');
      document.addEventListener('dragenter', e => { if (!hasFiles(e) || Reader.isOpen) return; e.preventDefault(); depth++; overlay.hidden = false; });
      document.addEventListener('dragover', e => { if (!hasFiles(e) || Reader.isOpen) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
      document.addEventListener('dragleave', e => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) overlay.hidden = true; });
      document.addEventListener('drop', e => {
        if (!hasFiles(e)) return;
        e.preventDefault(); depth = 0; overlay.hidden = true;
        if (Reader.isOpen) return;
        const files = [...e.dataTransfer.files];
        if (files.length) Library.addFiles(files);
      });
      $('#content').addEventListener('contextmenu', e => {
        if (e.target.closest('[data-id], .continue-card, input, textarea, button')) return;
        if (Library.route.view === 'home') return;
        e.preventDefault();
        UI.menu([
          { label: 'Add to Library…', action: () => this.pickFiles() },
          { label: 'New Collection…', action: () => Library.createCollection() },
          { separator: true },
          { label: 'Sort By', submenu: ['recent', 'title', 'author'].map(s => ({ label: s[0].toUpperCase() + s.slice(1), checked: Settings.get('sort') === s, action: () => { Settings.set('sort', s); Library.render(); } })) },
          { label: 'View As', submenu: [{ label: 'Grid', checked: Settings.get('view') === 'grid', action: () => { Settings.set('view', 'grid'); Library.render(); } }, { label: 'List', checked: Settings.get('view') === 'list', action: () => { Settings.set('view', 'list'); Library.render(); } }] },
        ], { x: e.clientX, y: e.clientY });
      });
    },
    wireKeys() {
      document.addEventListener('keydown', e => {
        if (Reader.isOpen) return;
        const tag = ((e.target && e.target.tagName) || '').toLowerCase();
        const typing = ['input', 'textarea', 'select'].includes(tag);
        const mod = U.isModKey(e);
        if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); this.pickFiles(); return; }
        if (mod && e.key.toLowerCase() === 'f') { e.preventDefault(); $('#search-field').focus(); $('#search-field').select(); return; }
        if (mod && e.key === '/') { e.preventDefault(); this.showShortcuts(); return; }
        if (mod && e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); this.toggleSidebar(); return; }
        if (mod && e.shiftKey && e.key.toLowerCase() === 'n') { e.preventDefault(); Library.createCollection(); return; }
        if (mod && e.key === '[') { e.preventDefault(); Library.back(); return; }
        if (mod && e.key === ']') { e.preventDefault(); Library.forward(); return; }
        if (typing || UI.hasOpen()) return;
        if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); Library.selectAll(); return; }
        if (mod && e.key === '1') { e.preventDefault(); Library.navigate({ view: 'home' }); return; }
        if (mod && e.key === '2') { e.preventDefault(); Library.navigate({ view: 'all' }); return; }
        if (mod && e.key === '3') { e.preventDefault(); Library.navigate({ view: 'finished' }); return; }
        if (e.key === 'Escape') { Library.selection.clear(); const c = $('#view .book-grid, #view .book-table tbody'); if (c) Library._syncSelection(c); }
        if (e.key === 'Enter' && Library.selection.size === 1 && !e.target.closest('[data-id]')) Library.openBook([...Library.selection][0]);
      });
    },

    showShortcuts() {
      const m = U.modKey;
      const groups = [
        ['Library', [['Add to Library…', m + ' O'], ['Search library', m + ' F'], ['Open selected book', 'Return'], ['Get Info', 'Space'], ['Delete selected', '⌫'], ['Select all', m + ' A'], ['Toggle sidebar', '⌃' + m + ' S'], ['Back / Forward', m + ' [  ' + m + ' ]'], ['Home / All / Finished', m + ' 1  ' + m + ' 2  ' + m + ' 3']]],
        ['Reader', [['Next page', '→  ↓  Space  Page Down'], ['Previous page', '←  ↑  ⇧Space  Page Up'], ['Next / previous chapter', '⌥→  ⌥←  or  ' + m + ' ]  ' + m + ' ['], ['First / last page', 'Home  End'], ['Search in book', m + ' F'], ['Add / remove bookmark', m + ' D'], ['Text larger / smaller', m + ' +   ' + m + ' −'], ['Reset text size', m + ' 0'], ['Back to library', 'Esc']]],
        ['Mouse & Trackpad', [['Turn page', 'Scroll wheel / two-finger scroll'], ['Turn page (horizontal)', 'Horizontal wheel, tilt wheel or ⇧ + wheel'], ['Text size', m + ' + scroll wheel / pinch'], ['Highlight', 'Select text, pick a colour'], ['Book actions', 'Right-click a book']]],
      ];
      const body = el('div', groups.map(([title, rows]) => el('div.shortcut-group', el('div.section-title', title), el('div.shortcut-list', rows.map(([a, b]) => el('div.row', el('span', a), el('span', b)))))));
      UI.sheet({ title: 'Keyboard Shortcuts', body, className: 'info', buttons: [{ label: 'Done', primary: true, value: true }] });
    },
    async showStorage() {
      const est = await DB.estimate();
      const files = await DB.getAll('files');
      const total = files.reduce((n, f) => n + (f.size || 0), 0);
      const rows = [['Books in library', String(Library.books.length)], ['Book files', U.fmtBytes(total)], ['Annotations', String(Library.annotations.length)], ['Collections', String(Library.collections.length)]];
      if (est && est.usage != null) rows.push(['Storage used', U.fmtBytes(est.usage) + (est.quota ? ` of ${U.fmtBytes(est.quota)} available` : '')]);
      const body = el('div', el('table.info-table', rows.map(([k, v]) => el('tr', el('td', k), el('td', v)))),
        el('p.msg', 'Everything is stored in this browser’s local database (IndexedDB) and never leaves your device. Clearing site data removes the library.'),
        el('div.button-row',
          el('button.btn', { type: 'button', onclick: () => this.exportAnnotations() }, 'Export Highlights & Notes…'),
          el('button.btn.danger', { type: 'button', onclick: () => this.resetLibrary() }, 'Delete Library…')));
      UI.sheet({ title: 'Storage & Data', body, buttons: [{ label: 'Done', primary: true, value: true }] });
    },
    async exportAnnotations() {
      const byBook = new Map();
      for (const a of Library.annotations) { const b = Library.get(a.bookId); if (!b) continue; if (!byBook.has(b)) byBook.set(b, []); byBook.get(b).push(a); }
      let md = '# Highlights & Notes\n\n';
      for (const [b, anns] of byBook) {
        md += `## ${b.title}\n*${b.author}*\n\n`;
        for (const a of anns.sort((x, y) => x.spine - y.spine || (x.start ?? x.offset ?? 0) - (y.start ?? y.offset ?? 0))) {
          md += a.type === 'bookmark' ? `- 🔖 Bookmark${a.chapter ? ' — ' + a.chapter : ''}: “${a.text}”\n` : `- **${a.color}**${a.chapter ? ' — ' + a.chapter : ''}: “${a.text}”${a.note ? `\n  - Note: ${a.note}` : ''}\n`;
        }
        md += '\n';
      }
      if (this.shell) { this.shell.saveFile('Books Highlights.md', md); return; }
      const blob = new Blob([md], { type: 'text/markdown' });
      const a = el('a', { href: URL.createObjectURL(blob), download: 'Books Highlights.md' });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    },
    async resetLibrary() {
      const ok = await UI.confirm({ title: 'Delete your entire library?', message: 'All books, files, collections, highlights, notes and reading statistics on this device will be erased.', confirmLabel: 'Delete Everything', danger: true, icon: 'warning' });
      if (!ok) return;
      for (const s of ['books', 'files', 'annotations', 'collections', 'stats']) await DB.clear(s);
      await Library.load(); Library.navigate({ view: 'home' }, { replace: true });
      UI.toast('Library deleted');
    },
    showAbout() {
      UI.sheet({ alert: true, icon: 'bookOpen', title: 'Books (offline)', message: 'A self-contained reader modelled on Books for macOS. EPUB, PDF and plain-text files are stored locally on this device. No account, no store, no network.' });
    },

    registerServiceWorker() {
      if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
      navigator.serviceWorker.register('sw.js').catch(e => console.warn('service worker registration failed', e));
    },
    handleLaunchFiles() {
      if (!('launchQueue' in window)) return;
      try { window.launchQueue.setConsumer(async params => { if (!params.files || !params.files.length) return; const files = await Promise.all(params.files.map(h => h.getFile())); Library.addFiles(files); }); } catch (e) { /* ignore */ }
    },

    /* Native shell bridge (macos/BooksShell.c): window drag/zoom from HTML chrome, file hand-off, save panel, fullscreen state. */
    initShell() {
      const handler = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.books;
      if (!handler && !window.__BOOKS_SHELL__) return;
      const post = msg => { try { if (handler) handler.postMessage(msg); } catch (e) { /* ignore */ } };
      this.shell = { post, saveFile: (name, content) => post({ type: 'saveFile', name, content }) };
      document.documentElement.dataset.shell = window.__BOOKS_SHELL__ || 'macos';
      const isDragRegion = e => {
        if (e.type === 'mousedown' && e.button !== 0) return false;
        const t = e.target instanceof Element ? e.target : null;
        if (!t || t.closest('button, input, textarea, select, a, [data-id], .sl-item, .continue-card, .rd-btn, .segmented, .menu, .popover, .sheet, .reader-scrubber')) return false;
        return !!t.closest('.toolbar, .traffic-lights, .source-list, .sidebar-footer, .reader-toolbar, .reader-footer');
      };
      document.addEventListener('mousedown', e => { if (isDragRegion(e)) post({ type: 'dragWindow' }); });
      document.addEventListener('dblclick', e => { if (isDragRegion(e)) post({ type: 'zoomWindow' }); });
      document.addEventListener('contextmenu', e => { const t = e.target; if (e.altKey || (t instanceof Element && t.closest('input, textarea'))) return; e.preventDefault(); });
    },
    /** Files chosen in a native panel or opened from the Finder arrive here as base64. */
    receiveFiles(list) {
      if (!Array.isArray(list)) return;
      const files = [];
      for (const f of list) {
        if (!f || typeof f.data !== 'string') continue;
        const bin = atob(f.data), bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        files.push(new File([bytes], f.name || 'Untitled'));
      }
      if (files.length) Library.addFiles(files);
    },

    /** Exercised by CI (BOOKS_SELFTEST=1): import a generated book, open it, turn a page for real, report back. */
    async selfTest() {
      const report = r => { if (this.shell) this.shell.post({ type: 'selftest', ...r }); return r; };
      this._selfTesting = true;
      let book = null;
      try {
        const para = '<p>' + 'The quick brown fox jumps over the lazy dog while the five boxing wizards jump quickly. '.repeat(90) + '</p>';
        const chapters = Array.from({ length: 6 }, (_, i) => ({ label: `Chapter ${i + 1}`, title: `Self-test chapter ${i + 1}`, html: para.repeat(3) }));
        const blob = EPUB.build({ title: 'Books Self-Test', author: 'Continuous Integration', chapters, language: 'en', coverSVG: U.makeCoverSVG('Books Self-Test', 'CI') });
        [book] = await Library.addFiles([new File([blob], 'Books Self-Test.epub', { type: 'application/epub+zip' })], { quiet: true, allowDuplicates: true });
        if (!book) return report({ ok: false, detail: 'the generated test book could not be imported' });
        await Reader.open(book);
        if (!Reader.isOpen || !Reader.layout) return report({ ok: false, detail: `the test book did not open: ${Reader.lastError || 'unknown error'}` });
        const L = Reader.layout, before = Reader.page;
        Reader.next();
        await U.sleep(600);
        const se = Reader.se, scrolled = se ? se.scrollLeft : -1;
        const afterNext = Reader.page;
        // Native shell: genuine scroll-wheel notches (down, tilt right, ⇧ + down, up) delivered through WKWebView.
        let wheelOk = true, wheelDetail = '';
        if (this.shell && window.webkit && window.webkit.messageHandlers) {
          const notch = async (dy, dx, shift) => { const p = Reader.page; this.shell.post({ type: 'selftestWheel', dy, dx, shift: !!shift }); await U.sleep(700); return Reader.page - p; };
          const down = await notch(-1, 0), tilt = await notch(0, -1), shifted = await notch(-1, 0, true), up = await notch(1, 0);
          wheelOk = down > 0 && tilt > 0 && shifted > 0 && up < 0;
          wheelDetail = `, wheel notches (pages moved): down ${down}, tilt ${tilt}, shift+down ${shifted}, up ${up}`;
        }
        const ok = L.total > 3 && afterNext > before && scrolled > 0 && !Reader._endShown && wheelOk;
        const detail = `${L.total} pages, ${L.cols} column(s), page ${before + 1} → ${afterNext + 1}, scrollLeft ${Math.round(scrolled)}, end card ${Reader._endShown ? 'shown' : 'not shown'}, theme ${Reader.effectiveTheme()}${wheelDetail}; ${navigator.userAgent}`;
        await Reader.close({ silent: true });
        return report({ ok, detail });
      } catch (e) { return report({ ok: false, detail: 'exception: ' + ((e && e.stack) || e) }); }
      finally { this._selfTesting = false; if (book) await Library.deleteBooks([book.id], { confirm: false, quiet: true }).catch(() => {}); }
    },
  };

  global.App = App;
  document.addEventListener('DOMContentLoaded', () => App.init());
})(window);
