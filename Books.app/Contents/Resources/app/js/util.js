/* Books (offline) — shared helpers. Classic script so the app runs from file:// as well as http(s). */
(function (global) {
  'use strict';
  const U = {};

  U.uuid = function () {
    if (global.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  };

  // Hyperscript-style element builder: U.el('button.primary#go', {onclick, title}, 'Label', childNode, ...)
  U.el = function (spec, attrs, ...children) {
    const m = String(spec).match(/^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i);
    const node = document.createElement((m && m[1]) || 'div');
    if (m && m[2]) for (const part of m[2].match(/[.#][\w-]+/g)) {
      if (part[0] === '.') node.classList.add(part.slice(1)); else node.id = part.slice(1);
    }
    if (attrs && typeof attrs === 'object' && !(attrs instanceof Node) && !Array.isArray(attrs)) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class' || k === 'className') node.className += (node.className ? ' ' : '') + v;
        else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sv == null) continue; if (sk.startsWith('--')) node.style.setProperty(sk, sv); else node.style[sk] = sv; } }
        else if (k === 'dataset') Object.assign(node.dataset, v);
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'text') node.textContent = v;
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
        else if (typeof v === 'boolean') { if (k in node) node[k] = v; else node.setAttribute(k, ''); }
        else node.setAttribute(k, v);
      }
    } else if (attrs != null) children.unshift(attrs);
    return U.append(node, children);
  };
  U.append = function (node, children) {
    for (const c of children.flat(Infinity)) {
      if (c == null || c === false) continue;
      node.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return node;
  };
  U.svg = function (markup) { const t = document.createElement('template'); t.innerHTML = markup.trim(); return t.content.firstChild; };
  U.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  U.clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  U.debounce = function (fn, ms) { let t; return function (...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); }; };
  U.throttle = function (fn, ms) {
    let last = 0, t;
    return function (...a) {
      const now = Date.now(), rem = ms - (now - last);
      if (rem <= 0) { last = now; fn.apply(this, a); }
      else { clearTimeout(t); t = setTimeout(() => { last = Date.now(); fn.apply(this, a); }, rem); }
    };
  };
  U.sleep = ms => new Promise(r => setTimeout(r, ms));
  U.nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));

  U.isMac = /Mac|iPhone|iPad/.test(navigator.platform || '') || /Macintosh/.test(navigator.userAgent);
  U.modKey = U.isMac ? '⌘' : 'Ctrl';
  U.isModKey = e => (U.isMac ? e.metaKey : e.ctrlKey);

  U.fmtDate = ts => ts ? new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';
  U.fmtBytes = n => { if (n == null) return ''; const u = ['B', 'KB', 'MB', 'GB']; let i = 0; while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; } return (i ? n.toFixed(1) : n) + ' ' + u[i]; };
  U.fmtMinutes = m => { m = Math.round(m); if (m < 1) return 'Less than a minute'; if (m < 60) return m + ' min'; const h = Math.floor(m / 60), r = m % 60; return r ? `${h} hr ${r} min` : `${h} hr`; };
  U.fmtDurationSec = s => { s = Math.round(s || 0); if (s < 60) return s + ' sec'; return U.fmtMinutes(s / 60); };
  U.relTime = ts => {
    if (!ts) return '';
    const m = Math.round((Date.now() - ts) / 60000);
    if (m < 1) return 'Just now'; if (m < 60) return m + ' min ago';
    const h = Math.round(m / 60); if (h < 24) return h === 1 ? '1 hour ago' : h + ' hours ago';
    const d = Math.round(h / 24); if (d === 1) return 'Yesterday'; if (d < 7) return d + ' days ago';
    return U.fmtDate(ts);
  };
  U.todayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  U.dayOffsetKey = n => { const d = new Date(); d.setDate(d.getDate() + n); return U.todayKey(d); };

  U.titleSortKey = t => String(t || '').toLowerCase().replace(/^(the|a|an)\s+/, '').replace(/[^\p{L}\p{N}\s]/gu, '').trim();
  U.authorSortKey = a => {
    const s = String(a || '').split(/[,;&]| and /)[0].trim();
    if (!s) return '~';
    const parts = s.split(/\s+/);
    return (parts[parts.length - 1] + ' ' + parts.slice(0, -1).join(' ')).toLowerCase();
  };
  U.collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

  U.readFile = (file, as = 'arrayBuffer') => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result); r.onerror = () => rej(r.error);
    if (as === 'text') r.readAsText(file); else if (as === 'dataURL') r.readAsDataURL(file); else r.readAsArrayBuffer(file);
  });
  U.blobToDataURL = blob => U.readFile(blob, 'dataURL');

  // Path helpers for zip-internal hrefs
  U.dirname = p => { const i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i); };
  U.basename = p => p.slice(p.lastIndexOf('/') + 1);
  U.isAbsoluteURL = s => /^[a-z][a-z0-9+.-]*:/i.test(s || '');
  U.resolvePath = function (baseDir, rel) {
    if (!rel) return baseDir;
    if (U.isAbsoluteURL(rel)) return rel;
    let clean = rel.split('#')[0].split('?')[0];
    try { clean = decodeURIComponent(clean); } catch (e) { /* keep raw */ }
    const parts = (clean.startsWith('/') ? [] : (baseDir ? baseDir.split('/') : [])).concat(clean.split('/'));
    const out = [];
    for (const part of parts) { if (part === '..') out.pop(); else if (part && part !== '.') out.push(part); }
    return out.join('/');
  };
  U.fragmentOf = href => { const i = (href || '').indexOf('#'); return i < 0 ? '' : href.slice(i + 1); };

  U.wordCount = text => (String(text || '').match(/\S+/g) || []).length;
  U.WPM = 240; // reading speed used for "time left" estimates
  U.hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
  U.plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + 's')}`;

  U.COVER_PALETTES = [
    { bg: '#2d5f8b', fg: '#f4efe6', accent: '#e9c46a' }, { bg: '#7a1f2b', fg: '#f6efe3', accent: '#d9a441' },
    { bg: '#1f3b2d', fg: '#efe9d8', accent: '#c7a24b' }, { bg: '#3a2f4b', fg: '#efe8f4', accent: '#c9b458' },
    { bg: '#0f2a44', fg: '#f3ecd8', accent: '#d4af37' }, { bg: '#2b2b2f', fg: '#ece6da', accent: '#a9c3d6' },
    { bg: '#4a3423', fg: '#f2e9dc', accent: '#c58f3a' }, { bg: '#5b3a5e', fg: '#f5eaf3', accent: '#e0b0ff' },
    { bg: '#1c4b5a', fg: '#e9f2f1', accent: '#f4a261' }, { bg: '#6b4f1d', fg: '#f7f1e1', accent: '#e9c46a' },
  ];
  U.paletteFor = seed => U.COVER_PALETTES[Math.abs([...String(seed)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % U.COVER_PALETTES.length];

  // Generated cover art (SVG) for books that ship without a cover — Books does the same with a plain typographic cover.
  U.makeCoverSVG = function (title, author, palette, opts = {}) {
    const p = palette || U.paletteFor(title + author);
    const W = 600, H = 900;
    const words = String(title || 'Untitled').split(/\s+/);
    const lines = []; let cur = '';
    for (const w of words) { if ((cur + ' ' + w).trim().length > 14 && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
    if (cur) lines.push(cur);
    const shown = lines.slice(0, 6);
    const longest = Math.max(...shown.map(l => l.length));
    const fontSize = U.clamp(Math.floor(900 / Math.max(longest, 7)), 44, 100);
    const lineH = fontSize * 1.15;
    const startY = H * 0.40 - (shown.length - 1) * lineH / 2;
    const serif = "Georgia, 'Iowan Old Style', 'Times New Roman', serif";
    const titleText = shown.map((l, i) => `<text x="${W / 2}" y="${(startY + i * lineH).toFixed(1)}" text-anchor="middle" font-family="${serif}" font-size="${fontSize}" fill="${p.fg}" font-weight="600">${U.esc(l)}</text>`).join('');
    const kind = opts.kind ? `<text x="${W / 2}" y="${H - 60}" text-anchor="middle" font-family="-apple-system, Helvetica, Arial, sans-serif" font-size="22" letter-spacing="6" fill="${p.accent}" opacity=".9">${U.esc(opts.kind.toUpperCase())}</text>` : '';
    const ruleTop = (startY - fontSize - 40).toFixed(1), ruleBottom = (startY + (shown.length - 1) * lineH + 40).toFixed(1);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></linearGradient>
<linearGradient id="s" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".28"/><stop offset=".08" stop-color="#000" stop-opacity="0"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="${p.bg}"/><rect width="${W}" height="${H}" fill="url(#g)"/><rect width="${W}" height="${H}" fill="url(#s)"/>
<rect x="60" y="${ruleTop}" width="${W - 120}" height="3" fill="${p.accent}" opacity=".9"/>
${titleText}
<rect x="60" y="${ruleBottom}" width="${W - 120}" height="3" fill="${p.accent}" opacity=".9"/>
<text x="${W / 2}" y="${(+ruleBottom + 70).toFixed(1)}" text-anchor="middle" font-family="${serif}" font-size="30" font-style="italic" fill="${p.fg}" opacity=".9">${U.esc(author || '')}</text>
${kind}
</svg>`;
  };

  global.U = U;
})(window);
