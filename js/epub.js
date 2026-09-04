/* EPUB engine: parse EPUB 2/3 containers, resolve resources to blob URLs, scope stylesheets,
   and build EPUB 3 files in memory (plain-text imports, the CI self-test). No network, no third-party code. */
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

  /* ---------------------------------------------------------------------------------------------
     EPUB 3 builder — produces a valid, uncompressed EPUB from structured chapters. */
  const xml = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const toXHTML = html => String(html || '')
    .replace(/<br\s*>/gi, '<br/>').replace(/<hr\s*>/gi, '<hr/>').replace(/<img([^>]*[^\/])>/gi, '<img$1/>')
    .replace(/&nbsp;/g, '&#160;').replace(/&mdash;/g, '&#8212;').replace(/&ndash;/g, '&#8211;').replace(/&hellip;/g, '&#8230;')
    .replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/gi, '&amp;');

  const BUILDER_CSS = `
html, body { margin: 0; padding: 0; }
body { font-family: Georgia, "Iowan Old Style", "Palatino", "Times New Roman", serif; line-height: 1.5; }
section.chapter { margin: 0; }
header.chapter-head { margin: 3em 0 2.4em; text-align: center; }
header.chapter-head .chapter-label { font-size: 0.85em; letter-spacing: 0.14em; text-transform: uppercase; opacity: 0.7; margin: 0 0 0.5em; }
header.chapter-head h2 { font-size: 1.6em; font-weight: 600; margin: 0; line-height: 1.25; }
h3.section { text-align: center; font-weight: 600; margin: 1.6em 0 0.8em; font-size: 1.05em; }
p { margin: 0 0 0.9em; text-indent: 0; }
p + p { text-indent: 1.4em; margin-top: -0.2em; }
p.verse { white-space: pre-wrap; margin: 1em 1.5em 1em 2.2em; text-indent: 0; }
p.the-end { text-align: center; letter-spacing: 0.2em; margin-top: 2.5em; text-indent: 0; }
p.separator { text-align: center; letter-spacing: 0.6em; margin: 1.5em 0; text-indent: 0; }
p.front-matter { text-indent: 0; }
.cover-page { text-align: center; margin: 0; padding: 0; height: 100%; }
.cover-page img { max-width: 100%; max-height: 100%; }
.title-page { text-align: center; margin-top: 30%; }
.title-page h1 { font-size: 2em; font-weight: 600; margin-bottom: 0.4em; }
.title-page .author { font-style: italic; font-size: 1.2em; opacity: 0.85; }
.title-page .source { margin-top: 4em; font-size: 0.8em; opacity: 0.6; }
`;

  function buildEPUB(spec) {
    const id = spec.identifier || ('urn:uuid:' + U.uuid());
    const modified = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const zw = new Zip.ZipWriter();
    zw.add('mimetype', 'application/epub+zip');
    zw.add('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
    const chapters = spec.chapters.map((c, i) => ({ ...c, file: `ch${String(i + 1).padStart(3, '0')}.xhtml`, id: `ch${i + 1}`, navTitle: [c.label, c.title].filter(Boolean).join(': ') || `Chapter ${i + 1}` }));
    const page = (title, body) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${xml(spec.language || 'en')}" lang="${xml(spec.language || 'en')}">
<head><meta charset="utf-8"/><title>${xml(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>${body}</body></html>`;
    const hasCover = !!spec.coverSVG;
    if (hasCover) {
      zw.add('OEBPS/cover.svg', spec.coverSVG);
      zw.add('OEBPS/cover.xhtml', page('Cover', `<div class="cover-page" epub:type="cover"><img src="cover.svg" alt="Cover"/></div>`));
    }
    zw.add('OEBPS/titlepage.xhtml', page(spec.title, `<section class="title-page" epub:type="titlepage"><h1>${xml(spec.title)}</h1><p class="author">${xml(spec.author || '')}</p>${spec.source ? `<p class="source">${xml(spec.sourceNote || 'Public domain text')}</p>` : ''}</section>`));
    for (const c of chapters) {
      const head = (c.label || c.title) ? `<header class="chapter-head">${c.label ? `<p class="chapter-label">${xml(c.label)}</p>` : ''}${c.title ? `<h2>${xml(c.title)}</h2>` : ''}</header>` : '';
      zw.add('OEBPS/' + c.file, page(c.navTitle, `<section class="chapter" epub:type="${c.frontMatter ? 'frontmatter' : 'chapter'}">${head}${toXHTML(c.html)}</section>`));
    }
    zw.add('OEBPS/style.css', BUILDER_CSS + (spec.extraCSS || ''));
    zw.add('OEBPS/nav.xhtml', `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head>
<body><nav epub:type="toc" id="toc"><h1>Contents</h1><ol>${chapters.map(c => `<li><a href="${c.file}">${xml(c.navTitle)}</a></li>`).join('')}</ol></nav>
<nav epub:type="landmarks" hidden=""><ol>${hasCover ? '<li><a epub:type="cover" href="cover.xhtml">Cover</a></li>' : ''}<li><a epub:type="titlepage" href="titlepage.xhtml">Title Page</a></li><li><a epub:type="bodymatter" href="${chapters[0]?.file || 'titlepage.xhtml'}">Start</a></li></ol></nav></body></html>`);
    zw.add('OEBPS/toc.ncx', `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="${xml(id)}"/></head><docTitle><text>${xml(spec.title)}</text></docTitle>
<navMap>${chapters.map((c, i) => `<navPoint id="np${i + 1}" playOrder="${i + 1}"><navLabel><text>${xml(c.navTitle)}</text></navLabel><content src="${c.file}"/></navPoint>`).join('')}</navMap></ncx>`);
    zw.add('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="${xml(spec.language || 'en')}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="pub-id">${xml(id)}</dc:identifier>
<dc:title>${xml(spec.title)}</dc:title>
<dc:creator id="creator">${xml(spec.author || 'Unknown Author')}</dc:creator>${spec.authorSort ? `<meta refines="#creator" property="file-as">${xml(spec.authorSort)}</meta>` : ''}
<dc:language>${xml(spec.language || 'en')}</dc:language>
${spec.publisher ? `<dc:publisher>${xml(spec.publisher)}</dc:publisher>` : ''}
${spec.year ? `<dc:date>${xml(String(spec.year))}</dc:date>` : ''}
${spec.description ? `<dc:description>${xml(spec.description)}</dc:description>` : ''}
${(spec.subjects || []).map(s => `<dc:subject>${xml(s)}</dc:subject>`).join('')}
<meta property="dcterms:modified">${modified}</meta>
${hasCover ? '<meta name="cover" content="cover-image"/>' : ''}
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
<item id="css" href="style.css" media-type="text/css"/>
${hasCover ? '<item id="cover-image" href="cover.svg" media-type="image/svg+xml" properties="cover-image"/><item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>' : ''}
<item id="titlepage" href="titlepage.xhtml" media-type="application/xhtml+xml"/>
${chapters.map(c => `<item id="${c.id}" href="${c.file}" media-type="application/xhtml+xml"/>`).join('\n')}
</manifest>
<spine toc="ncx">
${hasCover ? '<itemref idref="cover" linear="yes"/>' : ''}
<itemref idref="titlepage"/>
${chapters.map(c => `<itemref idref="${c.id}"/>`).join('\n')}
</spine>
</package>`);
    return zw.toBlob('application/epub+zip');
  }

  /** Plain text → chapters (Gutenberg boilerplate stripped, headings detected). */
  function textToChapters(raw) {
    let text = String(raw || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    const start = text.search(/^\*\*\* ?START OF[^\n]*\*\*\*\s*$/m);
    const end = text.search(/^\*\*\* ?END OF[^\n]*$/m);
    if (start >= 0 && end > start) text = text.slice(text.indexOf('\n', start) + 1, end);
    else if (start >= 0) text = text.slice(text.indexOf('\n', start) + 1);
    else if (end > 0) text = text.slice(0, end);
    const lines = text.split('\n');
    const isHeading = (l, i) => {
      const t = l.trim();
      if (!t || t.length > 80) return false;
      const prevBlank = i === 0 || !lines[i - 1].trim(), nextBlank = i + 1 >= lines.length || !lines[i + 1].trim();
      if (!prevBlank || !nextBlank) return false;
      return /^(chapter|part|book|stave|letter|act|scene|canto|prologue|epilogue|preface|introduction|afterword|appendix)\b/i.test(t) || /^[IVXLC]+\.?$/.test(t) || (/^[A-Z0-9][A-Z0-9 ,.'’:;\-!?]{4,}$/.test(t) && !/[a-z]/.test(t));
    };
    const chapters = []; let cur = { title: null, lines: [] };
    lines.forEach((l, i) => { if (isHeading(l, i)) { if (cur.lines.some(x => x.trim())) chapters.push(cur); cur = { title: l.trim(), lines: [] }; } else cur.lines.push(l); });
    if (cur.lines.some(x => x.trim()) || cur.title) chapters.push(cur);
    const toHtml = ls => {
      const out = []; let block = [];
      const flush = () => {
        if (!block.length) return;
        const indented = block.filter(x => /^\s{2,}\S/.test(x)).length;
        if (block.length >= 2 && indented >= block.length * 0.6) out.push('<p class="verse">' + block.map(x => xml(x.replace(/^\s{0,2}/, '').replace(/\s+$/, ''))).join('<br/>') + '</p>');
        else out.push('<p>' + xml(block.map(x => x.trim()).join(' ')).replace(/_([^_]{1,300}?)_/g, '<em>$1</em>') + '</p>');
        block = [];
      };
      for (const l of ls) { if (!l.trim()) flush(); else block.push(l); }
      flush();
      return out.join('\n');
    };
    let built = chapters.filter(c => c.lines.some(x => x.trim()) || c.title).map(c => ({ title: c.title, label: null, html: toHtml(c.lines) }));
    if (built.length > 1 && !built[0].title) {
      // Untitled preamble before the first heading: drop it when it is just title/author lines, otherwise keep it as front matter.
      const words = built[0].html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
      if (words < 60) built = built.slice(1); else built[0].title = 'Front Matter';
    }
    return built.length ? built : [{ title: 'Text', label: null, html: toHtml(lines) }];
  }

  function guessTitleAuthor(fileName, text) {
    let title = fileName.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();
    let author = '';
    const m = /^(.*?)\s+[-–—]\s+(.*)$/.exec(title);
    if (m) { author = m[1].trim(); title = m[2].trim(); if (/\d/.test(author) === false && author.split(' ').length > 3) { [title, author] = [author, title]; } }
    const t = /^Title:\s*(.+)$/m.exec(text || ''); if (t) title = t[1].trim();
    const a = /^Author:\s*(.+)$/m.exec(text || ''); if (a) author = a[1].trim();
    return { title: title || 'Untitled', author: author || 'Unknown Author' };
  }

  global.EPUB = { Book, open: blob => Book.open(blob), build: buildEPUB, textToChapters, guessTitleAuthor, scopeCSS, mimeFor };
})(window);
