/* Library: sidebar/source list, Home, All / Want to Read / Finished / Books / PDFs / My Samples, collections,
   grid & list views, import pipeline (EPUB, PDF, TXT), sample books, context menus, Get Info. */
(function (global) {
  'use strict';
  const $ = s => document.querySelector(s);
  const el = U.el;
  const VIEW_TITLES = { home: 'Home', all: 'All', want: 'Want to Read', finished: 'Finished', books: 'Books', pdfs: 'PDFs', samples: 'My Samples' };
  const VIEW_ICONS = { home: 'house', all: 'books', want: 'bookmark', finished: 'checkCircle', books: 'book', pdfs: 'doc', samples: 'sample' };

  const Library = {
    books: [], collections: [], annotations: [], route: { view: 'home' }, history: [], future: [],
    selection: new Set(), search: '', _covers: new Map(), _importing: null,

    /* ------------------------------------------------------------------ data */
    async load() {
      this.books = await DB.getAll('books');
      this.collections = (await DB.getAll('collections')).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.createdAt - b.createdAt);
      this.annotations = await DB.getAll('annotations');
      const last = Settings.get('lastRoute');
      if (last && this.routeValid(last)) this.route = last;
    },
    routeValid(r) { return r && (VIEW_TITLES[r.view] || (r.view === 'collection' && this.collections.some(c => c.id === r.id))); },
    get(id) { return this.books.find(b => b.id === id) || null; },
    collection(id) { return this.collections.find(c => c.id === id) || null; },
    annotationsFor(bookId) { return this.annotations.filter(a => a.bookId === bookId); },
    annCounts(bookId) {
      const c = { highlights: 0, notes: 0, bookmarks: 0 };
      for (const a of this.annotations) if (a.bookId === bookId) { if (a.type === 'bookmark') c.bookmarks++; else { c.highlights++; if (a.note) c.notes++; } }
      return c;
    },
    async refreshAnnotations() { this.annotations = await DB.getAll('annotations'); },

    coverURL(book) {
      if (!book || !book.cover) return '';
      let url = this._covers.get(book.id);
      if (!url) { url = URL.createObjectURL(book.cover); this._covers.set(book.id, url); }
      return url;
    },
    _dropCover(id) { const u = this._covers.get(id); if (u) { URL.revokeObjectURL(u); this._covers.delete(id); } },

    async updateBook(id, patch, opts = {}) {
      const book = this.get(id); if (!book) return null;
      Object.assign(book, patch);
      if ('cover' in patch) this._dropCover(id);
      await DB.put('books', book);
      if (!opts.silent) this.render();
      window.dispatchEvent(new CustomEvent('library:change', { detail: { id, patch } }));
      return book;
    },

    /* --------------------------------------------------------------- routing */
    navigate(route, opts = {}) {
      if (!this.routeValid(route)) route = { view: 'home' };
      if (!opts.replace && !opts.noHistory && JSON.stringify(route) !== JSON.stringify(this.route)) { this.history.push(this.route); this.future = []; if (this.history.length > 50) this.history.shift(); }
      this.route = route; this.selection.clear(); this.search = ''; $('#search-field').value = '';
      Settings.set('lastRoute', route);
      this.render();
      $('#view').scrollTop = 0;
    },
    back() { if (!this.history.length) return; this.future.push(this.route); this.navigate(this.history.pop(), { noHistory: true }); },
    forward() { if (!this.future.length) return; this.history.push(this.route); this.navigate(this.future.pop(), { noHistory: true }); },
    routeTitle(r = this.route) { return r.view === 'collection' ? (this.collection(r.id)?.name || 'Collection') : VIEW_TITLES[r.view] || 'Books'; },

    booksFor(route = this.route) {
      let list;
      switch (route.view) {
        case 'all': list = this.books; break;
        case 'want': list = this.books.filter(b => b.wantToRead); break;
        case 'finished': list = this.books.filter(b => b.finishedAt); break;
        case 'books': list = this.books.filter(b => b.kind !== 'pdf' && !b.sample); break;
        case 'pdfs': list = this.books.filter(b => b.kind === 'pdf'); break;
        case 'samples': list = this.books.filter(b => b.sample); break;
        case 'collection': { const c = this.collection(route.id); list = c ? c.bookIds.map(id => this.get(id)).filter(Boolean) : []; break; }
        default: list = this.books;
      }
      if (this.search) { const q = this.search.toLowerCase(); list = list.filter(b => (b.title + ' ' + b.author).toLowerCase().includes(q)); }
      return this.sorted(list);
    },
    sorted(list) {
      const sort = Settings.get('sort');
      const c = U.collator;
      return [...list].sort((a, b) => {
        if (sort === 'title') return c.compare(U.titleSortKey(a.title), U.titleSortKey(b.title)) || c.compare(a.author, b.author);
        if (sort === 'author') return c.compare(a.authorSort || U.authorSortKey(a.author), b.authorSort || U.authorSortKey(b.author)) || c.compare(U.titleSortKey(a.title), U.titleSortKey(b.title));
        return (Math.max(b.lastOpenedAt || 0, b.addedAt) - Math.max(a.lastOpenedAt || 0, a.addedAt));
      });
    },

    /* ------------------------------------------------------------- rendering */
    render() {
      if (!document.getElementById('source-list')) return;
      this.renderSidebar();
      this.renderToolbar();
      this.renderView();
    },
    renderSidebar() {
      const nav = $('#source-list'); nav.innerHTML = '';
      const active = r => (r.view === this.route.view && (r.view !== 'collection' || r.id === this.route.id));
      const item = (route, label, icon, count, opts = {}) => {
        const it = el('div.sl-item', { class: active(route) ? 'active' : '', role: 'button', tabindex: 0, dataset: { route: JSON.stringify(route) } },
          U.svg(Icons.icon(icon, { size: 18 })), el('span.sl-label', label), count != null ? el('span.sl-count', count) : null);
        it.addEventListener('click', () => this.navigate(route));
        it.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.navigate(route); } });
        if (opts.onContext) it.addEventListener('contextmenu', e => { e.preventDefault(); opts.onContext(e); });
        if (opts.dropTarget) this._dropTarget(it, opts.dropTarget);
        return it;
      };
      nav.appendChild(item({ view: 'home' }, 'Home', 'house'));
      nav.appendChild(el('div.sl-section', 'Library'));
      nav.appendChild(item({ view: 'all' }, 'All', 'books', this.books.length || null));
      nav.appendChild(item({ view: 'want' }, 'Want to Read', 'bookmark', this.books.filter(b => b.wantToRead).length || null, { dropTarget: { want: true } }));
      nav.appendChild(item({ view: 'finished' }, 'Finished', 'checkCircle', this.books.filter(b => b.finishedAt).length || null, { dropTarget: { finished: true } }));
      nav.appendChild(item({ view: 'books' }, 'Books', 'book', this.books.filter(b => b.kind !== 'pdf' && !b.sample).length || null));
      nav.appendChild(item({ view: 'pdfs' }, 'PDFs', 'doc', this.books.filter(b => b.kind === 'pdf').length || null));
      if (this.books.some(b => b.sample)) nav.appendChild(item({ view: 'samples' }, 'My Samples', 'sample', this.books.filter(b => b.sample).length));
      nav.appendChild(el('div.sl-section', 'My Collections'));
      for (const c of this.collections) {
        nav.appendChild(item({ view: 'collection', id: c.id }, c.name, 'folder', c.bookIds.length || null, {
          dropTarget: { collection: c.id },
          onContext: e => UI.menu([
            { label: 'Rename…', action: () => this.renameCollection(c.id) },
            { label: 'Delete Collection…', danger: true, action: () => this.deleteCollection(c.id) },
          ], { x: e.clientX, y: e.clientY }),
        }));
      }
      if (!this.collections.length) nav.appendChild(el('div.sl-item', { style: { color: 'var(--text-3)', fontSize: '12px' } }, 'No collections yet'));
    },
    _dropTarget(node, target) {
      node.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('text/x-book-ids')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; node.classList.add('drop-target'); } });
      node.addEventListener('dragleave', () => node.classList.remove('drop-target'));
      node.addEventListener('drop', async e => {
        node.classList.remove('drop-target');
        const ids = (e.dataTransfer.getData('text/x-book-ids') || '').split(',').filter(Boolean);
        if (!ids.length) return;
        e.preventDefault(); e.stopPropagation();
        if (target.collection) await this.addToCollection(ids, target.collection);
        else if (target.want) { for (const id of ids) await this.updateBook(id, { wantToRead: true }, { silent: true }); this.render(); UI.toast(ids.length === 1 ? 'Added to Want to Read' : `Added ${ids.length} books to Want to Read`); }
        else if (target.finished) { for (const id of ids) await this.updateBook(id, { finishedAt: Date.now() }, { silent: true }); this.render(); UI.toast('Marked as Finished'); }
      });
    },
    renderToolbar() {
      $('#toolbar-title').textContent = this.routeTitle();
      const isHome = this.route.view === 'home';
      $('#sort-btn').hidden = isHome; $('#view-seg').hidden = isHome;
      $('#sort-label').textContent = { recent: 'Recent', title: 'Title', author: 'Author' }[Settings.get('sort')] || 'Recent';
      for (const b of $('#view-seg').querySelectorAll('button')) b.classList.toggle('active', b.dataset.view === Settings.get('view'));
      $('#btn-back').disabled = !this.history.length; $('#btn-forward').disabled = !this.future.length;
    },
    renderView() {
      const view = $('#view'); view.innerHTML = '';
      this._renderToken = (this._renderToken || 0) + 1;
      if (this.route.view === 'home') { this.renderHome(view, this._renderToken); return; }
      const books = this.booksFor();
      const head = el('div.view-header', el('h1', this.routeTitle()), el('div.view-actions',
        el('span.view-count', this.search ? `${books.length} of ${this.countFor(this.route)} ${this.kindWord(this.route)}` : `${books.length} ${this.kindWord(this.route, books.length)}`)));
      view.appendChild(head);
      if (!books.length) { view.appendChild(this.emptyState()); return; }
      view.appendChild(Settings.get('view') === 'list' ? this.renderList(books) : this.renderGrid(books));
    },
    countFor(route) { const s = this.search; this.search = ''; const n = this.booksFor(route).length; this.search = s; return n; },
    kindWord(route, n = 2) { const one = route.view === 'pdfs' ? 'PDF' : route.view === 'samples' ? 'sample' : 'book'; return n === 1 ? one : one + 's'; },
    emptyState() {
      const r = this.route;
      const msg = {
        all: ['No Books', 'Books, PDFs and text files you add appear here.'],
        want: ['Nothing to Read Yet', 'Mark books you want to read from the ••• menu or by right-clicking a book.'],
        finished: ['No Finished Books', 'Books you finish show up here automatically.'],
        books: ['No Books', 'Add EPUB or text files to your library to see them here.'],
        pdfs: ['No PDFs', 'PDF files you add appear here.'],
        samples: ['No Samples', 'Sample books have been removed. You can add them back from the ••• menu.'],
        collection: ['Empty Collection', 'Drag books here or use “Add to Collection” from a book’s menu.'],
      }[r.view] || ['No Books', ''];
      if (this.search) return el('div.empty-state', U.svg(Icons.icon('search', { size: 64, stroke: 1.2 })), el('h3', 'No Results'), el('p', `Nothing in ${this.routeTitle()} matches “${this.search}”.`));
      const actions = el('div.actions', el('button.btn', { type: 'button', onclick: () => App.pickFiles() }, 'Add to Library…'));
      if (r.view === 'all' || r.view === 'books' || r.view === 'samples') actions.appendChild(el('button.btn', { type: 'button', onclick: () => this.installSamples() }, 'Add Sample Books'));
      return el('div.empty-state', U.svg(Icons.icon(VIEW_ICONS[r.view] || 'folder', { size: 64, stroke: 1.2 })), el('h3', msg[0]), el('p', msg[1]), actions);
    },

    badgeFor(book) {
      if (book.sample) return el('span.badge', 'SAMPLE');
      if (!book.lastOpenedAt && !book.finishedAt) return el('span.badge.new', 'NEW');
      return null;
    },
    coverEl(book, cls = 'cover') {
      const img = el('img', { class: cls, src: this.coverURL(book), alt: '', draggable: false, loading: 'lazy' });
      return img;
    },
    progressLabel(book) {
      const p = book.progress;
      if (book.finishedAt) return 'Finished';
      if (!p || !p.percent) return '';
      return Math.round(p.percent * 100) + '%';
    },
    timeLeft(book) {
      const p = book.progress; if (!book.words) return '';
      const mins = book.words * (1 - (p?.percent || 0)) / U.WPM;
      return mins < 1 ? 'Less than a minute left' : U.fmtMinutes(mins) + ' left';
    },

    renderGrid(books) {
      const grid = el('div.book-grid', { role: 'list' });
      for (const book of books) {
        const meta = el('div.book-meta');
        if (book.finishedAt) meta.append(el('span', 'Finished'));
        else if (book.progress?.percent) meta.append(el('span.mini-bar', el('i', { style: { width: Math.round(book.progress.percent * 100) + '%' } })), el('span', Math.round(book.progress.percent * 100) + '%'));
        const card = el('div.book-card', { role: 'listitem', tabindex: 0, draggable: true, dataset: { id: book.id }, class: this.selection.has(book.id) ? 'selected' : '', title: `${book.title}\n${book.author}` },
          el('div.cover-wrap', this.coverEl(book), this.badgeFor(book), book.finishedAt ? el('span.finished-mark', U.svg(Icons.icon('checkmarkSeal', { size: 18 }))) : null),
          el('div.book-title', book.title), el('div.book-author', book.author), meta);
        this._wireBookItem(card, book, grid);
        grid.appendChild(card);
      }
      grid.addEventListener('click', e => { if (e.target === grid) { this.selection.clear(); this._syncSelection(grid); } });
      return grid;
    },
    renderList(books) {
      const table = el('table.book-table');
      const cols = [['', ''], ['Title', 'title'], ['Author', 'author'], ['Kind', ''], ['Progress', ''], ['Added', 'recent']];
      const thead = el('thead', el('tr', cols.map(([label, sortKey]) => {
        const th = el('th', { class: (sortKey ? 'sortable ' : '') + (sortKey && Settings.get('sort') === sortKey ? 'sorted' : '') }, label);
        if (sortKey) th.addEventListener('click', () => { Settings.set('sort', sortKey); this.render(); });
        return th;
      })));
      const tbody = el('tbody');
      for (const book of books) {
        const pct = book.progress?.percent || 0;
        const tr = el('tr', { tabindex: 0, draggable: true, dataset: { id: book.id }, class: this.selection.has(book.id) ? 'selected' : '' },
          el('td', { style: { width: '44px' } }, this.coverEl(book, 'cover-mini')),
          el('td', el('strong', book.title)),
          el('td.muted', book.author),
          el('td.muted', book.kind === 'pdf' ? 'PDF' : book.sample ? 'Sample' : 'Book'),
          el('td', el('div.progress-cell', book.finishedAt ? el('span.muted', 'Finished') : pct ? [el('span.mini-bar', el('i', { style: { width: Math.round(pct * 100) + '%' } })), el('span.muted', Math.round(pct * 100) + '%')] : el('span.muted', book.lastOpenedAt ? 'Started' : 'New'))),
          el('td.muted', U.fmtDate(book.addedAt)));
        this._wireBookItem(tr, book, tbody);
        tbody.appendChild(tr);
      }
      table.append(thead, tbody);
      return table;
    },
    _wireBookItem(node, book, container) {
      node.addEventListener('click', e => {
        if (U.isModKey(e)) { this.selection.has(book.id) ? this.selection.delete(book.id) : this.selection.add(book.id); }
        else if (e.shiftKey && this.selection.size) {
          const items = [...container.querySelectorAll('[data-id]')].map(n => n.dataset.id);
          const anchor = items.indexOf([...this.selection][0]), cur = items.indexOf(book.id);
          this.selection.clear(); for (let i = Math.min(anchor, cur); i <= Math.max(anchor, cur); i++) this.selection.add(items[i]);
        } else { this.selection.clear(); this.selection.add(book.id); }
        this._syncSelection(container); node.focus({ preventScroll: true });
      });
      node.addEventListener('dblclick', () => this.openBook(book.id));
      node.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); this.openBook(book.id); }
        else if (e.key === ' ') { e.preventDefault(); this.showInfo(book); }
        else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); this.deleteBooks([...(this.selection.size ? this.selection : [book.id])]); }
        else if (/^Arrow/.test(e.key)) { e.preventDefault(); this._moveSelection(container, book.id, e.key); }
      });
      node.addEventListener('contextmenu', e => {
        e.preventDefault();
        if (!this.selection.has(book.id)) { this.selection.clear(); this.selection.add(book.id); this._syncSelection(container); }
        this.contextMenu(book, e.clientX, e.clientY);
      });
      node.addEventListener('dragstart', e => {
        if (!this.selection.has(book.id)) { this.selection.clear(); this.selection.add(book.id); this._syncSelection(container); }
        e.dataTransfer.setData('text/x-book-ids', [...this.selection].join(','));
        e.dataTransfer.setData('text/plain', book.title);
        e.dataTransfer.effectAllowed = 'copy';
        const img = node.querySelector('img'); if (img) e.dataTransfer.setDragImage(img, 30, 40);
      });
    },
    _syncSelection(container) { for (const n of container.querySelectorAll('[data-id]')) n.classList.toggle('selected', this.selection.has(n.dataset.id)); },
    _moveSelection(container, id, key) {
      const items = [...container.querySelectorAll('[data-id]')];
      const idx = items.findIndex(n => n.dataset.id === id); if (idx < 0) return;
      let cols = 1;
      if (container.classList.contains('book-grid')) cols = getComputedStyle(container).gridTemplateColumns.split(' ').length;
      const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[key] || 0;
      const next = items[U.clamp(idx + delta, 0, items.length - 1)];
      if (!next) return;
      this.selection.clear(); this.selection.add(next.dataset.id); this._syncSelection(container); next.focus();
    },
    selectAll() { for (const b of this.booksFor()) this.selection.add(b.id); const c = $('#view .book-grid, #view .book-table tbody'); if (c) this._syncSelection(c); },

    /* ------------------------------------------------------------------ Home */
    async renderHome(view, token) {
      view.appendChild(el('div.view-header', el('h1', 'Home')));
      const stale = () => token !== this._renderToken;
      if (!this.books.length) {
        view.appendChild(el('div.home-empty',
          el('div.big-icon', U.svg(Icons.icon('bookOpen', { size: 56, stroke: 1.5 }))),
          el('h2', 'Welcome to Books'),
          el('p', 'Add EPUB, PDF or plain-text files to build your library. Everything stays on this device — no account, no internet connection required.'),
          el('div.actions', { style: { display: 'flex', gap: '10px', justifyContent: 'center' } },
            el('button.btn.primary.large', { type: 'button', onclick: () => App.pickFiles() }, 'Add to Library…'),
            el('button.btn.large', { type: 'button', onclick: () => this.installSamples() }, 'Add Sample Books'))));
        return;
      }
      // Continue
      const reading = this.sorted(this.books.filter(b => !b.finishedAt)).filter(b => b.kind !== 'pdf' || b.lastOpenedAt).slice(0, 10);
      if (reading.length) {
        const row = el('div.continue-row');
        for (const book of reading) row.appendChild(this.continueCard(book));
        view.appendChild(el('div.home-section', el('div.home-section-head', el('h2', reading.some(b => b.progress?.percent) ? 'Continue' : 'Start Reading')), row));
        row.addEventListener('wheel', e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && row.scrollWidth > row.clientWidth) { e.preventDefault(); row.scrollLeft += e.deltaY; } }, { passive: false });
      }
      // Reading goals
      const rows = await Stats.all();
      if (stale()) return;
      const today = rows.find(r => r.day === U.todayKey()) || { seconds: 0 };
      const goalMin = Settings.get('dailyGoalMinutes'), yearGoal = Settings.get('yearlyGoalBooks');
      const minutes = today.seconds / 60;
      const pct = Math.min(1, minutes / goalMin);
      const streak = Stats.streak(rows, goalMin);
      const year = new Date().getFullYear();
      const finishedThisYear = this.books.filter(b => b.finishedAt && new Date(b.finishedAt).getFullYear() === year).sort((a, b) => b.finishedAt - a.finishedAt);
      const ring = (p, label, done) => {
        const r = 36, c = 2 * Math.PI * r;
        return el('div.ring', { class: done ? 'done' : '' }, U.svg(`<svg width="84" height="84" viewBox="0 0 84 84"><circle class="track" cx="42" cy="42" r="${r}"/><circle class="fill" cx="42" cy="42" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}"/></svg>`), el('div.ring-label', label));
      };
      const goals = el('div.goals-grid',
        el('div.goal-card', ring(pct, pct >= 1 ? U.svg(Icons.icon('check', { size: 22, stroke: 2.6 })) : Math.round(minutes) + 'm', pct >= 1),
          el('div.goal-body', el('div.goal-title', 'Today’s Reading'), el('div.goal-sub', pct >= 1 ? 'Goal reached — nice work.' : `${U.fmtMinutes(Math.max(0, goalMin - minutes))} to reach your goal`),
            el('div.goal-big', `${Math.round(minutes)} `, el('small', `of ${goalMin} min`)),
            el('div.goal-foot', streak ? el('span.streak', U.svg(Icons.icon('flame', { size: 14, stroke: 2 })), `${streak}-day streak`) : el('span', 'Read every day to start a streak')))),
        el('div.goal-card', ring(Math.min(1, finishedThisYear.length / yearGoal), finishedThisYear.length, finishedThisYear.length >= yearGoal),
          el('div.goal-body', el('div.goal-title', 'Books Read This Year'), el('div.goal-sub', finishedThisYear.length >= yearGoal ? `You beat your goal of ${yearGoal}.` : `${yearGoal - finishedThisYear.length} more to reach ${yearGoal} in ${year}`),
            finishedThisYear.length ? el('div.mini-covers', finishedThisYear.slice(0, 6).map(b => el('img', { src: this.coverURL(b), alt: b.title, title: b.title })), finishedThisYear.length > 6 ? el('span.more', '+' + (finishedThisYear.length - 6)) : null) : el('div.goal-big', '0 ', el('small', `of ${yearGoal}`)))));
      view.appendChild(el('div.home-section', el('div.home-section-head', el('h2', 'Reading Goals'), el('button.see-all', { type: 'button', onclick: () => this.editGoals() }, 'Adjust Goals…')), goals));
      // Library at a glance
      const totalSecs = rows.reduce((n, r) => n + (r.seconds || 0), 0);
      const hl = this.annotations.filter(a => a.type !== 'bookmark').length;
      const tiles = el('div.stat-tiles',
        this.statTile(this.books.length, 'books', 'in your library', { view: 'all' }),
        this.statTile(this.books.filter(b => b.finishedAt).length, 'checkCircle', 'finished', { view: 'finished' }),
        this.statTile(hl, 'highlighter', U.plural(hl, 'highlight & note', 'highlights & notes').replace(/^\d+ /, '')),
        this.statTile(totalSecs ? U.fmtDurationSec(totalSecs) : '0 min', 'clock', 'total reading time'));
      view.appendChild(el('div.home-section', el('div.home-section-head', el('h2', 'Your Library')), tiles));
    },
    statTile(value, icon, label, route) {
      const t = el('div.stat-tile', { style: route ? { cursor: 'default' } : null }, el('div.stat-value', String(value)), el('div.stat-label', U.svg(Icons.icon(icon, { size: 13 })), label));
      if (route) t.addEventListener('click', () => this.navigate(route));
      return t;
    },
    continueCard(book) {
      const pct = book.progress?.percent || 0;
      const card = el('div.continue-card', { tabindex: 0, dataset: { id: book.id } },
        el('div.cover-wrap', this.coverEl(book)),
        el('div.continue-info',
          el('div.c-title', book.title), el('div.c-author', book.author),
          book.progress?.chapter ? el('div.c-chapter', book.progress.chapter) : null,
          el('div.c-progress', el('span', pct ? Math.round(pct * 100) + '%' : (book.kind === 'pdf' ? 'PDF' : 'Not started')), el('span', this.timeLeft(book))),
          el('div.progress-bar', el('i', { style: { width: Math.round(pct * 100) + '%' } })),
          el('div.c-actions', el('button.btn.pill.filled', { type: 'button', onclick: e => { e.stopPropagation(); this.openBook(book.id); } }, pct ? 'Continue' : 'Read'),
            el('button.btn.pill', { type: 'button', onclick: e => { e.stopPropagation(); this.showInfo(book); } }, 'Details'))));
      card.addEventListener('dblclick', () => this.openBook(book.id));
      card.addEventListener('keydown', e => { if (e.key === 'Enter') this.openBook(book.id); });
      card.addEventListener('contextmenu', e => { e.preventDefault(); this.contextMenu(book, e.clientX, e.clientY); });
      return card;
    },
    async editGoals() {
      let daily = Settings.get('dailyGoalMinutes'), yearly = Settings.get('yearlyGoalBooks');
      const body = el('div',
        el('div.form-row', el('div', el('label', 'Daily reading goal'), el('span.hint', 'Minutes read per day. Books uses 5 minutes by default.')), UI.stepper(daily, 1, 240, v => { daily = v; }, { step: 1 })),
        el('div.form-row', el('div', el('label', 'Books per year'), el('span.hint', `Finished books count toward ${new Date().getFullYear()}.`)), UI.stepper(yearly, 1, 365, v => { yearly = v; })));
      const ok = await UI.sheet({ title: 'Reading Goals', body, buttons: [{ label: 'Cancel', value: false }, { label: 'Save', primary: true, value: true }] });
      if (ok) { Settings.set('dailyGoalMinutes', daily); Settings.set('yearlyGoalBooks', yearly); this.render(); }
    },

    /* --------------------------------------------------------------- actions */
    openBook(id) { const b = this.get(id); if (b) Reader.open(b); },
    contextMenu(book, x, y) {
      const ids = this.selection.has(book.id) && this.selection.size > 1 ? [...this.selection] : [book.id];
      const many = ids.length > 1;
      const inColl = this.route.view === 'collection' ? this.collection(this.route.id) : null;
      const items = [
        !many && { label: book.progress?.percent && !book.finishedAt ? 'Continue Reading' : 'Read', icon: 'bookOpen', action: () => this.openBook(book.id) },
        !many && { label: 'Get Info', icon: 'info', shortcut: 'Space', action: () => this.showInfo(book) },
        { separator: true },
        { label: book.finishedAt ? 'Mark as Unfinished' : 'Mark as Finished', action: () => this.markFinished(ids, !book.finishedAt) },
        { label: book.wantToRead ? 'Remove from Want to Read' : 'Add to Want to Read', action: () => this.setWantToRead(ids, !book.wantToRead) },
        { label: 'Add to Collection', submenu: [
          ...this.collections.map(c => ({ label: c.name, icon: 'folder', checked: ids.every(id => c.bookIds.includes(id)), action: () => this.addToCollection(ids, c.id) })),
          this.collections.length ? { separator: true } : null,
          { label: 'New Collection…', action: () => this.createCollection(ids) },
        ] },
        inColl && { label: `Remove from “${inColl.name}”`, action: () => this.removeFromCollection(ids, inColl.id) },
        { separator: true },
        !many && book.progress?.percent && { label: 'Reset Reading Position', action: () => this.updateBook(book.id, { progress: null }) },
        { label: many ? `Delete ${ids.length} Books…` : 'Delete…', danger: true, action: () => this.deleteBooks(ids) },
      ].filter(Boolean);
      UI.menu(items, { x, y });
    },
    async markFinished(ids, finished) {
      for (const id of ids) await this.updateBook(id, { finishedAt: finished ? Date.now() : null, wantToRead: finished ? false : this.get(id)?.wantToRead }, { silent: true });
      this.render();
      UI.toast(finished ? (ids.length === 1 ? 'Marked as Finished' : `Marked ${ids.length} books as Finished`) : 'Marked as Unfinished', { icon: finished ? 'checkCircle' : undefined });
    },
    async setWantToRead(ids, want) {
      for (const id of ids) await this.updateBook(id, { wantToRead: want }, { silent: true });
      this.render();
      UI.toast(want ? 'Added to Want to Read' : 'Removed from Want to Read', { icon: 'bookmark' });
    },
    async deleteBooks(ids) {
      ids = ids.filter(id => this.get(id)); if (!ids.length) return;
      const one = ids.length === 1 ? this.get(ids[0]) : null;
      const ok = await UI.confirm({
        title: one ? `Delete “${one.title}”?` : `Delete ${ids.length} books?`,
        message: 'The file, your reading position, bookmarks, highlights and notes will be removed from this device. This cannot be undone.',
        confirmLabel: 'Delete', danger: true,
      });
      if (!ok) return;
      for (const id of ids) {
        const b = this.get(id);
        await DB.delete('books', id);
        if (b.fileId) await DB.delete('files', b.fileId);
        const anns = this.annotations.filter(a => a.bookId === id).map(a => a.id);
        if (anns.length) await DB.deleteMany('annotations', anns);
        this.annotations = this.annotations.filter(a => a.bookId !== id);
        for (const c of this.collections) if (c.bookIds.includes(id)) { c.bookIds = c.bookIds.filter(x => x !== id); await DB.put('collections', c); }
        this._dropCover(id);
        this.books = this.books.filter(x => x.id !== id);
        this.selection.delete(id);
      }
      this.render();
      UI.toast(ids.length === 1 ? 'Book deleted' : `${ids.length} books deleted`);
    },

    async createCollection(bookIds = []) {
      const name = await UI.prompt({ title: 'New Collection', message: 'Enter a name for this collection.', placeholder: 'Collection name', icon: 'folder', confirmLabel: 'Create' });
      if (!name) return null;
      const c = { id: U.uuid(), name, bookIds: [...bookIds], createdAt: Date.now(), order: this.collections.length };
      await DB.put('collections', c);
      this.collections.push(c);
      if (bookIds.length) UI.toast(`Added to “${name}”`, { icon: 'folder' });
      this.render();
      return c;
    },
    async renameCollection(id) {
      const c = this.collection(id); if (!c) return;
      const name = await UI.prompt({ title: 'Rename Collection', value: c.name, icon: 'folder', confirmLabel: 'Rename' });
      if (!name || name === c.name) return;
      c.name = name; await DB.put('collections', c); this.render();
    },
    async deleteCollection(id) {
      const c = this.collection(id); if (!c) return;
      const ok = await UI.confirm({ title: `Delete “${c.name}”?`, message: 'The books in this collection stay in your library.', confirmLabel: 'Delete', danger: true, icon: 'folder' });
      if (!ok) return;
      await DB.delete('collections', id);
      this.collections = this.collections.filter(x => x.id !== id);
      if (this.route.view === 'collection' && this.route.id === id) this.navigate({ view: 'all' }, { replace: true }); else this.render();
    },
    async addToCollection(ids, collId) {
      const c = this.collection(collId); if (!c) return;
      let added = 0;
      for (const id of ids) if (!c.bookIds.includes(id) && this.get(id)) { c.bookIds.push(id); added++; }
      await DB.put('collections', c);
      this.render();
      UI.toast(added ? `Added to “${c.name}”` : `Already in “${c.name}”`, { icon: 'folder' });
    },
    async removeFromCollection(ids, collId) {
      const c = this.collection(collId); if (!c) return;
      c.bookIds = c.bookIds.filter(id => !ids.includes(id));
      await DB.put('collections', c);
      this.render();
    },

    /* ----------------------------------------------------------------- info */
    async showInfo(book) {
      const counts = this.annCounts(book.id);
      const title = el('input.field', { value: book.title, 'aria-label': 'Title' });
      const author = el('input.field', { value: book.author, 'aria-label': 'Author' });
      const pages = book.kind === 'pdf' ? (book.pages ? String(book.pages) : '—') : book.words ? `≈ ${Math.max(1, Math.round(book.words / 250))}` : '—';
      const row = (k, v) => el('tr', el('td', k), el('td', v));
      const body = el('div.info-layout',
        el('div.cover-wrap', this.coverEl(book)),
        el('div.info-main',
          el('div.info-title', book.title), el('div.info-author', book.author),
          el('div.info-actions',
            el('button.btn.pill.filled', { type: 'button', onclick: () => { UI.closeAll(); this.openBook(book.id); } }, book.finishedAt ? 'Read Again' : book.progress?.percent ? 'Continue' : 'Read'),
            el('button.btn.pill', { type: 'button', onclick: () => this.setWantToRead([book.id], !book.wantToRead).then(() => { UI.closeAll(); this.showInfo(this.get(book.id)); }) }, book.wantToRead ? 'Remove from Want to Read' : 'Want to Read')),
          book.description ? el('div.info-desc', book.description) : el('div.info-desc', { style: { color: 'var(--text-3)' } }, 'No description.'),
          el('table.info-table',
            row('Title', title), row('Author', author),
            row('Kind', book.kind === 'pdf' ? 'PDF Document' : book.sample ? 'Sample Book (EPUB)' : 'EPUB Book'),
            row('Pages', pages), row('Size', U.fmtBytes(book.fileSize)),
            book.publisher ? row('Publisher', book.publisher) : null, book.published ? row('Published', String(book.published).slice(0, 10)) : null,
            book.language ? row('Language', book.language.toUpperCase()) : null,
            book.subjects?.length ? row('Subjects', book.subjects.join(', ')) : null,
            row('Added', U.fmtDate(book.addedAt)), row('Last Read', book.lastOpenedAt ? U.relTime(book.lastOpenedAt) : 'Never'),
            row('Progress', book.finishedAt ? `Finished ${U.fmtDate(book.finishedAt)}` : book.progress?.percent ? `${Math.round(book.progress.percent * 100)}%${book.progress.chapter ? ' · ' + book.progress.chapter : ''}` : 'Not started'),
            row('Annotations', `${U.plural(counts.highlights, 'highlight')}, ${U.plural(counts.notes, 'note')}, ${U.plural(counts.bookmarks, 'bookmark')}`),
            row('File', book.fileName || '—'))));
      const ok = await UI.sheet({ className: 'info', body, buttons: [{ label: 'Done', primary: true, value: true }] });
      if (ok !== null) {
        const patch = {};
        if (title.value.trim() && title.value.trim() !== book.title) patch.title = title.value.trim();
        if (author.value.trim() !== book.author) { patch.author = author.value.trim() || 'Unknown Author'; patch.authorSort = null; }
        if (Object.keys(patch).length) await this.updateBook(book.id, patch);
      }
    },

    /* --------------------------------------------------------------- import */
    async addFiles(files, opts = {}) {
      files = [...files].filter(f => f && (f.size > 0 || f.name));
      if (!files.length) return [];
      const status = this._status(`Adding ${files.length === 1 ? '1 item' : files.length + ' items'}…`);
      const added = [], failed = [], skipped = [];
      for (let i = 0; i < files.length; i++) {
        status.update(`Adding “${files[i].name}”…`, i / files.length);
        try {
          const res = await this.importFile(files[i], opts);
          if (res.skipped) skipped.push(res.skipped); else added.push(res);
        } catch (e) { console.error('import failed', files[i].name, e); failed.push({ name: files[i].name, error: e.message || String(e) }); }
      }
      status.close();
      this.render();
      if (added.length && !opts.quiet) UI.toast(added.length === 1 ? `Added “${added[0].title}” to your library` : `Added ${added.length} books to your library`, { icon: 'check' });
      if (skipped.length) UI.toast(skipped.length === 1 ? `“${skipped[0]}” is already in your library` : `${skipped.length} items were already in your library`);
      if (failed.length) UI.sheet({ alert: true, icon: 'warning', title: failed.length === 1 ? `“${failed[0].name}” could not be added` : `${failed.length} items could not be added`, message: failed.map(f => f.name + ': ' + f.error).join('\n') });
      if (added.length === 1 && !opts.quiet && this.route.view !== 'home') { this.selection.clear(); this.selection.add(added[0].id); this.render(); }
      return added;
    },
    _status(text) {
      const label = el('div', text), bar = el('div.progress-bar', el('i', { style: { width: '0%' } }));
      const box = el('div.import-status', label, bar);
      document.getElementById('overlays').appendChild(box);
      return { update: (t, p) => { label.textContent = t; bar.firstChild.style.width = Math.round(p * 100) + '%'; }, close: () => box.remove() };
    },
    async importFile(file, opts = {}) {
      const name = file.name || 'Untitled';
      const ext = (name.split('.').pop() || '').toLowerCase();
      let kind, blob = file, meta = {}, cover = null, words = 0, pages = null;
      if (ext === 'epub' || file.type === 'application/epub+zip') kind = 'epub';
      else if (ext === 'pdf' || file.type === 'application/pdf') kind = 'pdf';
      else if (['txt', 'text', 'md', 'markdown'].includes(ext) || /^text\//.test(file.type)) kind = 'text';
      else throw new Error('Only EPUB, PDF and plain-text files can be added.');

      if (kind === 'epub') {
        if (!Zip.supported) throw new Error('This browser cannot open EPUB files (no DecompressionStream support).');
        const epub = await EPUB.open(file);
        meta = epub.metadata;
        try { cover = await epub.coverBlob(); } catch (e) { cover = null; }
        epub.dispose();
      } else if (kind === 'pdf') {
        meta = await this._pdfMeta(file, name);
        pages = meta.pages || null;
      } else {
        const text = await file.text();
        const guess = EPUB.guessTitleAuthor(name, text);
        const chapters = EPUB.textToChapters(text);
        words = U.wordCount(text);
        const coverSVG = U.makeCoverSVG(guess.title, guess.author);
        blob = EPUB.build({ title: guess.title, author: guess.author, chapters, coverSVG, language: 'en' });
        cover = new Blob([coverSVG], { type: 'image/svg+xml' });
        meta = { title: guess.title, author: guess.author };
        kind = 'epub';
      }
      const title = (opts.title || meta.title || name.replace(/\.[^.]+$/, '')).trim();
      const author = (opts.author || meta.author || (kind === 'pdf' ? '' : 'Unknown Author')).trim() || (kind === 'pdf' ? 'PDF Document' : 'Unknown Author');
      const dup = this.books.find(b => (meta.identifier && b.identifier && b.identifier === meta.identifier && !/^urn:uuid/.test(meta.identifier)) || (b.title.toLowerCase() === title.toLowerCase() && b.author.toLowerCase() === author.toLowerCase() && b.fileSize === blob.size));
      if (dup && !opts.allowDuplicates) return { skipped: title };
      if (!cover) cover = new Blob([U.makeCoverSVG(title, author, opts.palette || null, { kind: kind === 'pdf' ? 'PDF' : '' })], { type: 'image/svg+xml' });
      const id = U.uuid(), fileId = 'file-' + id;
      await DB.put('files', { id: fileId, blob, name, size: blob.size, type: blob.type || '' });
      const book = {
        id, title, author, authorSort: meta.authorSort || null, kind, fileId, fileName: name, fileSize: blob.size, cover,
        description: opts.description || meta.description || '', publisher: opts.publisher || meta.publisher || '', published: opts.published || meta.date || '',
        language: meta.language || '', subjects: opts.subjects || meta.subjects || [], identifier: meta.identifier || '',
        addedAt: Date.now(), lastOpenedAt: null, finishedAt: null, wantToRead: false, sample: !!opts.sample, progress: null, words: opts.words || words || 0, pages,
      };
      await DB.put('books', book);
      this.books.push(book);
      return book;
    },
    async _pdfMeta(file, name) {
      const meta = { title: name.replace(/\.[^.]+$/, ''), author: '' };
      try {
        const head = new TextDecoder('latin1').decode(new Uint8Array(await file.slice(0, Math.min(file.size, 2 * 1024 * 1024)).arrayBuffer()));
        const tail = file.size > 2 * 1024 * 1024 ? new TextDecoder('latin1').decode(new Uint8Array(await file.slice(file.size - 1024 * 1024).arrayBuffer())) : '';
        const text = head + tail;
        const grab = key => { const m = new RegExp('/' + key + '\\s*\\(([^)]{1,300})\\)').exec(text); return m ? m[1].replace(/\\\(/g, '(').replace(/\\\)/g, ')').replace(/\\(\d{3})/g, (s, o) => String.fromCharCode(parseInt(o, 8))).trim() : ''; };
        const t = grab('Title'); if (t && !/^\xfe\xff/.test(t)) meta.title = t;
        const a = grab('Author'); if (a && !/^\xfe\xff/.test(a)) meta.author = a;
        const count = (text.match(/\/Type\s*\/Page(?![s])/g) || []).length; if (count) meta.pages = count;
        const n = /\/Count\s+(\d+)/.exec(head); if (n && (!meta.pages || +n[1] > meta.pages)) meta.pages = +n[1];
      } catch (e) { /* ignore */ }
      return meta;
    },

    async installSamples() {
      if (!window.SAMPLE_BOOKS) {
        const status = this._status('Loading sample books…');
        try { await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'js/samples.js'; s.onload = res; s.onerror = () => rej(new Error('Could not load js/samples.js')); document.head.appendChild(s); }); }
        catch (e) { status.close(); UI.sheet({ alert: true, icon: 'warning', title: 'Sample books unavailable', message: e.message }); return; }
        status.close();
      }
      const status = this._status('Adding sample books…');
      let n = 0;
      for (const s of window.SAMPLE_BOOKS) {
        status.update(`Adding “${s.title}”…`, n++ / window.SAMPLE_BOOKS.length);
        if (this.books.some(b => b.sample && b.sampleId === s.id)) continue;
        try {
          const coverSVG = U.makeCoverSVG(s.title, s.author, s.palette);
          const blob = EPUB.build({ title: s.title, author: s.author, language: s.language, year: s.year, publisher: s.publisher, description: s.description, subjects: s.subjects, chapters: s.chapters, coverSVG, source: s.source, sourceNote: 'Public domain text from Project Gutenberg' });
          const file = new File([blob], s.title.replace(/[^\w\s-]/g, '') + '.epub', { type: 'application/epub+zip' });
          const book = await this.importFile(file, { sample: true, allowDuplicates: true, words: s.words, palette: s.palette, description: s.description, publisher: s.publisher, published: String(s.year), subjects: s.subjects });
          if (book && !book.skipped) { book.sampleId = s.id; await DB.put('books', book); }
        } catch (e) { console.error('sample failed', s.id, e); }
      }
      status.close();
      Settings.set('samplesInstalled', true);
      this.render();
      UI.toast('Sample books added to My Samples', { icon: 'sample' });
    },
  };

  global.Library = Library;
})(window);
