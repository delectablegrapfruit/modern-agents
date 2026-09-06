/* EPUB engine: parse EPUB 2/3 containers, resolve resources to blob URLs and scope stylesheets so the
   sections can be embedded straight into the reader page. No network, no third-party code. */
(function (global) {
  'use strict';
  const XHTML_NS = 'http://www.w3.org/1999/xhtml';
  const DC_NS = 'http://purl.org/dc/elements/1.1/';
  const OPS_NS = 'http://www.idpf.org/2007/ops';
  const XLINK_NS = 'http://www.w3.org/1999/xlink';
  const parser = new DOMParser();

  const MIME_BY_EXT = {
    xhtml: 'application/xhtml+xml', html: 'text/html', htm: 'text/html', xml: 'application/xml', css: 'text/css',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp',
    ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2', mp3: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'video/mp4', js: 'text/javascript', ncx: 'application/x-dtbncx+xml',
  };
  const mimeFor = path => MIME_BY_EXT[(path.split('.').pop() || '').toLowerCase()] || 'application/octet-stream';
  const isImage = t => /^image\//.test(t || '');
  const isDoc = t => /xhtml|html|xml/.test(t || '');

  function parseXML(text, type) {
    const doc = parser.parseFromString(text, type || 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) return null;
    return doc;
  }
  function parseXHTML(text) {
    let doc = parseXML(text, 'application/xhtml+xml');
    if (!doc || !doc.body) doc = parser.parseFromString(text, 'text/html');
    return doc;
  }
  const firstNS = (root, ns, name) => root.getElementsByTagNameNS(ns, name)[0] || root.getElementsByTagName(name)[0] || null;
  const allNS = (root, ns, name) => { const a = root.getElementsByTagNameNS(ns, name); return a.length ? [...a] : [...root.getElementsByTagName(name)]; };
  const textOf = n => (n ? n.textContent : '').replace(/\s+/g, ' ').trim();

  class Book {
    constructor(zip) {
      this.zip = zip;
      this.metadata = {}; this.manifest = new Map(); this.spine = []; this.toc = []; this.landmarks = [];
      this.coverPath = null; this.opfPath = ''; this.opfDir = '';
      this._urls = new Map(); this._cssCache = new Map(); this._sections = null;
    }

    static async open(blob) {
      const zip = await Zip.ZipReader.fromBlob(blob);
      const book = new Book(zip);
      await book._load();
      return book;
    }

    async _load() {
      const zip = this.zip;
      let opfPath = null;
      if (zip.find('META-INF/container.xml')) {
        const cdoc = parseXML(await zip.text('META-INF/container.xml'));
        const rf = cdoc && [...cdoc.getElementsByTagName('rootfile')].find(r => /oebps-package|opf/.test(r.getAttribute('media-type') || '') || /\.opf$/i.test(r.getAttribute('full-path') || ''));
        if (rf) opfPath = rf.getAttribute('full-path');
      }
      if (!opfPath || !zip.find(opfPath)) opfPath = zip.names().find(n => /\.opf$/i.test(n));
      if (!opfPath) throw new Error('No OPF package document found — this does not look like an EPUB.');
      this.opfPath = zip.find(opfPath); this.opfDir = U.dirname(this.opfPath);
      const opf = parseXML(await zip.text(this.opfPath));
      if (!opf) throw new Error('The package document (OPF) is malformed.');
      const pkg = opf.documentElement;
      this.version = pkg.getAttribute('version') || '2.0';

      // --- metadata
      const md = firstNS(pkg, pkg.namespaceURI, 'metadata') || pkg;
      const dc = name => allNS(md, DC_NS, name).map(textOf).filter(Boolean);
      const metas = [...md.getElementsByTagName('meta')];
      const creators = allNS(md, DC_NS, 'creator').map(el => ({ name: textOf(el), fileAs: el.getAttributeNS('http://www.idpf.org/2007/opf', 'file-as') || el.getAttribute('opf:file-as') || null, role: el.getAttributeNS('http://www.idpf.org/2007/opf', 'role') || el.getAttribute('opf:role') || null }));
      const fileAsMeta = metas.find(m => m.getAttribute('property') === 'file-as' && (m.getAttribute('refines') || '').replace('#', '') === (allNS(md, DC_NS, 'creator')[0]?.getAttribute('id') || '__'));
      this.metadata = {
        title: dc('title')[0] || U.basename(this.opfPath).replace(/\.opf$/i, '') || 'Untitled',
        creators,
        author: creators.map(c => c.name).filter(Boolean).join(', ') || 'Unknown Author',
        authorSort: creators[0]?.fileAs || fileAsMeta?.textContent || null,
        language: dc('language')[0] || '',
        publisher: dc('publisher')[0] || '',
        date: dc('date')[0] || '',
        description: dc('description')[0] || '',
        identifier: dc('identifier')[0] || '',
        subjects: dc('subject'),
        rights: dc('rights')[0] || '',
      };
      // --- manifest
      const manifestEl = firstNS(pkg, pkg.namespaceURI, 'manifest');
      for (const item of manifestEl ? [...manifestEl.getElementsByTagName('item')] : []) {
        const href = item.getAttribute('href') || '';
        const path = U.resolvePath(this.opfDir, href);
        this.manifest.set(item.getAttribute('id'), { id: item.getAttribute('id'), href, path, mediaType: item.getAttribute('media-type') || mimeFor(path), properties: (item.getAttribute('properties') || '').split(/\s+/).filter(Boolean) });
      }
      this.byPath = new Map([...this.manifest.values()].map(m => [m.path, m]));
      // --- spine
      const spineEl = firstNS(pkg, pkg.namespaceURI, 'spine');
      const ncxId = spineEl && spineEl.getAttribute('toc');
      this.direction = (spineEl && spineEl.getAttribute('page-progression-direction')) || 'ltr';
      let idx = 0;
      for (const ref of spineEl ? [...spineEl.getElementsByTagName('itemref')] : []) {
        const item = this.manifest.get(ref.getAttribute('idref'));
        if (!item || !this.zip.find(item.path)) continue;
        this.spine.push({ idx: idx++, id: item.id, path: item.path, mediaType: item.mediaType, linear: ref.getAttribute('linear') !== 'no', properties: item.properties });
      }
      if (!this.spine.length) { // last resort: every (x)html document in manifest order
        for (const m of this.manifest.values()) if (isDoc(m.mediaType) && !m.properties.includes('nav')) this.spine.push({ idx: this.spine.length, id: m.id, path: m.path, mediaType: m.mediaType, linear: true, properties: m.properties });
      }
      this.spineByPath = new Map(this.spine.map(s => [s.path, s]));
      // --- cover
      const coverItem = [...this.manifest.values()].find(m => m.properties.includes('cover-image'));
      if (coverItem) this.coverPath = coverItem.path;
      if (!this.coverPath) {
        const meta = metas.find(m => (m.getAttribute('name') || '').toLowerCase() === 'cover');
        if (meta) {
          const ref = meta.getAttribute('content');
          const byId = this.manifest.get(ref);
          if (byId && isImage(byId.mediaType)) this.coverPath = byId.path;
          else if (ref && this.zip.find(U.resolvePath(this.opfDir, ref))) this.coverPath = U.resolvePath(this.opfDir, ref);
        }
      }
      if (!this.coverPath) {
        const guess = [...this.manifest.values()].find(m => isImage(m.mediaType) && /cover/i.test(m.id + ' ' + m.href));
        if (guess) this.coverPath = guess.path;
      }
      this.coverPagePath = null;
      const guide = firstNS(pkg, pkg.namespaceURI, 'guide');
      if (guide) for (const ref of [...guide.getElementsByTagName('reference')]) {
        if ((ref.getAttribute('type') || '').toLowerCase() === 'cover') this.coverPagePath = U.resolvePath(this.opfDir, ref.getAttribute('href') || '');
      }
      // --- navigation
      const navItem = [...this.manifest.values()].find(m => m.properties.includes('nav'));
      if (navItem && this.zip.find(navItem.path)) await this._parseNav(navItem.path).catch(e => console.warn('nav parse failed', e));
      if (!this.toc.length) {
        const ncx = (ncxId && this.manifest.get(ncxId)) || [...this.manifest.values()].find(m => /ncx/.test(m.mediaType) || /\.ncx$/i.test(m.path));
        if (ncx && this.zip.find(ncx.path)) await this._parseNCX(ncx.path).catch(e => console.warn('ncx parse failed', e));
      }
      if (!this.toc.length) this.toc = this.spine.filter(s => s.linear).map(s => ({ label: U.basename(s.path).replace(/\.[^.]+$/, ''), href: s.path, children: [] }));
      if (this.coverPagePath == null) {
        const lm = this.landmarks.find(l => l.type === 'cover');
        if (lm) this.coverPagePath = lm.href.split('#')[0];
      }
    }

    async _parseNav(path) {
      const doc = parseXHTML(await this.zip.text(path));
      const dir = U.dirname(path);
      const navs = [...doc.getElementsByTagName('nav')];
      const typeOf = n => n.getAttributeNS(OPS_NS, 'type') || n.getAttribute('epub:type') || '';
      const tocNav = navs.find(n => /\btoc\b/.test(typeOf(n))) || navs[0];
      const walk = ol => [...ol.children].filter(li => li.localName === 'li').map(li => {
        const a = [...li.children].find(c => c.localName === 'a' || c.localName === 'span');
        const sub = [...li.children].find(c => c.localName === 'ol');
        const href = a && a.getAttribute('href');
        return { label: textOf(a) || 'Untitled', href: href ? this._resolveHref(dir, href) : null, children: sub ? walk(sub) : [] };
      });
      const ol = tocNav && [...tocNav.children].find(c => c.localName === 'ol');
      if (ol) this.toc = walk(ol);
      const lmNav = navs.find(n => /\blandmarks\b/.test(typeOf(n)));
      if (lmNav) for (const a of [...lmNav.getElementsByTagName('a')]) this.landmarks.push({ type: typeOf(a).replace(/.*\b(cover|toc|bodymatter|titlepage)\b.*/, '$1'), href: this._resolveHref(dir, a.getAttribute('href') || '') });
    }
    async _parseNCX(path) {
      const doc = parseXML(await this.zip.text(path));
      if (!doc) return;
      const dir = U.dirname(path);
      const walk = parent => [...parent.children].filter(c => c.localName === 'navPoint').map(np => {
        const label = textOf([...np.children].find(c => c.localName === 'navLabel'));
        const content = [...np.children].find(c => c.localName === 'content');
        return { label: label || 'Untitled', href: content ? this._resolveHref(dir, content.getAttribute('src') || '') : null, children: walk(np) };
      });
      const map = doc.getElementsByTagName('navMap')[0];
      if (map) this.toc = walk(map);
    }
    _resolveHref(dir, href) {
      const frag = U.fragmentOf(href);
      const path = U.resolvePath(dir, href);
      return frag ? path + '#' + frag : path;
    }

    /** Flat TOC with depth, used by the contents panel. */
    flatToc() { const out = []; const walk = (items, depth) => items.forEach(i => { out.push({ ...i, depth }); walk(i.children || [], depth + 1); }); walk(this.toc, 0); return out; }
    spineIndexOf(pathWithFrag) { const p = (pathWithFrag || '').split('#')[0]; const s = this.spineByPath.get(p) || this.spineByPath.get(this.zip.find(p)); return s ? s.idx : -1; }

    async coverBlob() {
      if (this.coverPath && this.zip.find(this.coverPath)) return this.zip.blob(this.coverPath, mimeFor(this.coverPath));
      // cover page with a single image
      const page = this.coverPagePath || this.spine[0]?.path;
      if (page && this.zip.find(page)) {
        try {
          const doc = parseXHTML(await this.zip.text(page));
          const img = doc.getElementsByTagName('img')[0] || doc.getElementsByTagName('image')[0];
          const src = img && (img.getAttribute('src') || img.getAttributeNS(XLINK_NS, 'href') || img.getAttribute('href'));
          if (src) { const p = U.resolvePath(U.dirname(page), src); if (this.zip.find(p)) return this.zip.blob(p, mimeFor(p)); }
        } catch (e) { /* ignore */ }
      }
      return null;
    }

    async resourceURL(path) {
      const key = this.zip.find(path);
      if (!key) return null;
      if (this._urls.has(key)) return this._urls.get(key);
      const blob = await this.zip.blob(key, mimeFor(key));
      const url = URL.createObjectURL(blob);
      this._urls.set(key, url);
      return url;
    }

    async _css(path, depth = 0) {
      const key = this.zip.find(path);
      if (!key) return '';
      if (this._cssCache.has(key)) return this._cssCache.get(key);
      let css = await this.zip.text(key);
      css = css.replace(/^﻿/, '');
      const dir = U.dirname(key);
      // resolve @import (max depth 3)
      const imports = [];
      css = css.replace(/@import\s+(?:url\()?\s*["']?([^"')\s]+)["']?\s*\)?[^;]*;/g, (m, href) => { imports.push(href); return ''; });
      let prefix = '';
      if (depth < 3) for (const href of imports) prefix += await this._css(U.resolvePath(dir, href), depth + 1) + '\n';
      css = await this._rewriteCssUrls(css, dir);
      const out = prefix + scopeCSS(css);
      this._cssCache.set(key, out);
      return out;
    }
    async _rewriteCssUrls(css, dir) {
      const refs = [];
      css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, href) => { if (!/^(data:|https?:|#)/.test(href)) refs.push(href); return m; });
      const map = new Map();
      await Promise.all([...new Set(refs)].map(async href => { const url = await this.resourceURL(U.resolvePath(dir, href)); if (url) map.set(href, url); }));
      return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, href) => map.has(href) ? `url("${map.get(href)}")` : m);
    }

    /** Load every spine document, rewrite it for embedding and return { sections, css, words }. */
    async loadAll(onProgress) {
      if (this._sections) return this._sections;
      const sections = [], cssParts = new Map();
      let words = 0;
      for (const item of this.spine) {
        let sec;
        try { sec = await this._loadSection(item, cssParts); }
        catch (e) { console.warn('section failed', item.path, e); sec = { idx: item.idx, path: item.path, html: `<p class="books-error">This section could not be displayed.</p>`, bodyClass: '', bodyId: '', title: '', words: 0, linear: item.linear }; }
        words += sec.words;
        sections.push(sec);
        if (onProgress) onProgress(sections.length, this.spine.length);
      }
      this.words = words;
      this._sections = { sections, css: [...cssParts.values()].join('\n'), words };
      return this._sections;
    }

    async _loadSection(item, cssParts) {
      const text = await this.zip.text(item.path);
      const doc = parseXHTML(text);
      const dir = U.dirname(item.path);
      // stylesheets
      for (const link of [...doc.getElementsByTagName('link')]) {
        if (!/stylesheet/i.test(link.getAttribute('rel') || '') && !/css/i.test(link.getAttribute('type') || '')) continue;
        const href = link.getAttribute('href'); if (!href) continue;
        const path = U.resolvePath(dir, href);
        const key = this.zip.find(path) || path;
        if (!cssParts.has(key)) cssParts.set(key, await this._css(path));
      }
      for (const style of [...doc.getElementsByTagName('style')]) {
        const css = await this._rewriteCssUrls(style.textContent || '', dir);
        const key = 'inline:' + U.hash(css);
        if (!cssParts.has(key)) cssParts.set(key, scopeCSS(css));
        style.remove();
      }
      const body = doc.body || doc.documentElement;
      // security: strip active content
      for (const el of [...body.querySelectorAll('script, iframe, embed, object, applet, form, link, meta, base')]) el.remove();
      for (const el of body.querySelectorAll('*')) for (const a of [...el.attributes]) if (/^on/i.test(a.name) || (/^(href|src|xlink:href|data|action)$/i.test(a.name) && /^\s*javascript:/i.test(a.value))) el.removeAttribute(a.name);
      // resources → blob URLs
      const jobs = [];
      const queue = (el, attr, value, isNS) => {
        if (!value || /^(data:|https?:|blob:|#|mailto:)/i.test(value)) return;
        jobs.push(this.resourceURL(U.resolvePath(dir, value)).then(url => { if (url) { if (isNS) el.setAttributeNS(XLINK_NS, 'xlink:href', url); else el.setAttribute(attr, url); } }));
      };
      for (const el of body.querySelectorAll('img[src], source[src], video[src], audio[src], input[src], track[src]')) queue(el, 'src', el.getAttribute('src'));
      for (const el of body.querySelectorAll('[poster]')) queue(el, 'poster', el.getAttribute('poster'));
      for (const el of body.querySelectorAll('image, use')) {
        if (el.getAttributeNS(XLINK_NS, 'href')) queue(el, 'xlink:href', el.getAttributeNS(XLINK_NS, 'href'), true);
        if (el.getAttribute('href')) queue(el, 'href', el.getAttribute('href'));
      }
      for (const el of body.querySelectorAll('[srcset]')) el.removeAttribute('srcset');
      for (const el of body.querySelectorAll('[style*="url("]')) {
        const st = el.getAttribute('style');
        jobs.push(this._rewriteCssUrls(st, dir).then(v => el.setAttribute('style', v)));
      }
      for (const a of body.querySelectorAll('a[href]')) {
        const href = a.getAttribute('href');
        if (/^(https?:|mailto:|tel:)/i.test(href)) { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener'); continue; }
        if (href.startsWith('#')) { a.setAttribute('data-internal-href', item.path + href); continue; }
        a.setAttribute('data-internal-href', this._resolveHref(dir, href));
        a.removeAttribute('target');
      }
      await Promise.all(jobs);
      // title
      let title = textOf(doc.getElementsByTagName('title')[0]);
      const heading = body.querySelector('h1, h2, h3');
      if (!title && heading) title = textOf(heading);
      // serialize body children as (X)HTML
      let html;
      if (doc.documentElement.namespaceURI === XHTML_NS && doc.body) { html = body.innerHTML; }
      else { html = new XMLSerializer().serializeToString(body).replace(/^<body[^>]*>/i, '').replace(/<\/body>\s*$/i, ''); }
      const words = U.wordCount(body.textContent);
      return { idx: item.idx, path: item.path, html, bodyClass: body.getAttribute('class') || '', bodyId: body.getAttribute('id') || '', title, words, linear: item.linear };
    }

    dispose() { for (const url of this._urls.values()) URL.revokeObjectURL(url); this._urls.clear(); }
  }

  /** Rewrites html/body selectors so book CSS applies to the embedded section roots. */
  function scopeCSS(css) {
    const naive = () => css.replace(/(^|[\s,}>+~])html\b(?![-\w])/g, '$1.book-root').replace(/(^|[\s,}>+~])body\b(?![-\w])/g, '$1.book-body');
    if (typeof CSSStyleSheet === 'undefined' || !CSSStyleSheet.prototype.replaceSync) return naive();
    let sheet;
    try { sheet = new CSSStyleSheet(); sheet.replaceSync(css); } catch (e) { return naive(); }
    const rewriteSel = sel => sel.split(',').map(s => s.trim()
      .replace(/^html(?![-\w])/, '.book-root').replace(/^body(?![-\w])/, '.book-body')
      .replace(/([\s>+~])html(?![-\w])/g, '$1.book-root').replace(/([\s>+~])body(?![-\w])/g, '$1.book-body')
      .replace(/^\*:root/, '.book-root').replace(/^:root/, '.book-root')).join(', ');
    const ruleText = rule => {
      if (rule.type === 1) return rewriteSel(rule.selectorText) + ' { ' + rule.style.cssText + ' }';
      if (rule.type === 3) return ''; // @import already inlined
      if (rule.cssRules) { const head = rule.cssText.slice(0, rule.cssText.indexOf('{')); return head + ' {\n' + [...rule.cssRules].map(ruleText).join('\n') + '\n}'; }
      return rule.cssText;
    };
    return [...sheet.cssRules].map(ruleText).join('\n');
  }

  global.EPUB = { Book, open: blob => Book.open(blob), scopeCSS, mimeFor };
})(window);
