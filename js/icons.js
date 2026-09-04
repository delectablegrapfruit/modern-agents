/* Inline SVG icons in the spirit of SF Symbols (stroke-based, currentColor). */
(function (global) {
  'use strict';
  const P = {
    house: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><path d="M10 19.5v-5h4v5"/>',
    books: '<rect x="3.5" y="4" width="4" height="16" rx=".8"/><rect x="9.5" y="4" width="4" height="16" rx=".8"/><path d="m15.2 5.2 3.9-1 3.9 14.6-3.9 1z"/>',
    book: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3"/><path d="M9 7h6"/>',
    bookOpen: '<path d="M12 6.5C10 5 7 4.5 3 4.8V19c4-.3 7 .2 9 1.7 2-1.5 5-2 9-1.7V4.8c-4-.3-7 .2-9 1.7z"/><path d="M12 6.5v14.2"/>',
    doc: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M10 13h4M10 16.5h4M10 9.5h1"/>',
    bookmark: '<path d="M6.5 3.5h11v17l-5.5-4-5.5 4z"/>',
    bookmarkFill: '<path fill="currentColor" d="M6.5 3.5h11v17l-5.5-4-5.5 4z"/>',
    checkCircle: '<circle cx="12" cy="12" r="8.5"/><path d="m8.5 12.3 2.3 2.3 4.7-5"/>',
    check: '<path d="m5.5 12.5 4 4 9-9.5"/>',
    sliders: '<path d="M4 7h16M4 12h16M4 17h16"/><circle cx="9" cy="7" r="2.2" fill="var(--icon-bg, #fff)"/><circle cx="15" cy="12" r="2.2" fill="var(--icon-bg, #fff)"/><circle cx="7" cy="17" r="2.2" fill="var(--icon-bg, #fff)"/>',
    folder: '<path d="M3.5 6.5A1.5 1.5 0 0 1 5 5h4.2l2 2H19a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z"/>',
    folderPlus: '<path d="M3.5 6.5A1.5 1.5 0 0 1 5 5h4.2l2 2H19a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z"/><path d="M12 10.5v5M9.5 13h5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    sidebar: '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="M9.5 4.5v15"/><path d="M5.5 8h2M5.5 11h2"/>',
    grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.2"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.8" cy="6" r="1" fill="currentColor"/><circle cx="4.8" cy="12" r="1" fill="currentColor"/><circle cx="4.8" cy="18" r="1" fill="currentColor"/>',
    toc: '<path d="M8 6h12M8 12h12M8 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01" stroke-width="2.4"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',
    chevronLeft: '<path d="m14.5 5.5-6.5 6.5 6.5 6.5"/>',
    chevronRight: '<path d="m9.5 5.5 6.5 6.5-6.5 6.5"/>',
    chevronDown: '<path d="m5.5 9.5 6.5 6.5 6.5-6.5"/>',
    chevronUp: '<path d="m5.5 14.5 6.5-6.5 6.5 6.5"/>',
    ellipsis: '<circle cx="5.5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="18.5" cy="12" r="1.3" fill="currentColor"/>',
    xmark: '<path d="m6 6 12 12M18 6 6 18"/>',
    textformat: '<text x="12" y="17" text-anchor="middle" font-size="15" font-family="-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif" fill="currentColor" stroke="none" font-weight="600">Aa</text>',
    fullscreen: '<path d="M4 9.5V4h5.5M20 14.5V20h-5.5M4 4l6 6M20 20l-6-6"/>',
    fullscreenExit: '<path d="M10 4v6H4M14 20v-6h6M10 10 4 4M14 14l6 6"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>',
    note: '<path d="M5 4.5h14v11l-4 4H5z"/><path d="M15 19.5v-4h4"/><path d="M8 9h8M8 12.5h5"/>',
    highlighter: '<path d="m9 16.5-3 3H3.5l3-3z"/><path d="M9.2 16.7 6.8 14.3 15.5 4.5a1.4 1.4 0 0 1 2.1 0l1.4 1.4a1.4 1.4 0 0 1 0 2.1z"/><path d="m13 7 3.5 3.5"/>',
    trash: '<path d="M5 6.5h14M9.5 6.5V4.5h5v2M7 6.5l.8 13h8.4l.8-13"/><path d="M10 10v6.5M14 10v6.5"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><circle cx="12" cy="8" r=".9" fill="currentColor"/>',
    pencil: '<path d="m4.5 19.5.9-3.9L15.8 5.2a1.6 1.6 0 0 1 2.3 0l.7.7a1.6 1.6 0 0 1 0 2.3L8.4 18.6z"/><path d="m14.5 6.5 3 3"/>',
    arrowLeft: '<path d="M19 12H5.5M11 5.5 4.5 12l6.5 6.5"/>',
    flame: '<path d="M12 21c-4 0-6.5-2.6-6.5-6.2 0-3.3 2.4-5 3.2-7.3.8 1 1.5 2 1.8 3.6C12 9 12.5 5.5 12.2 3c3.5 2.3 6.3 6.1 6.3 11.4 0 3.9-2.7 6.6-6.5 6.6z"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5.5l3.5 2"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    copy: '<rect x="8.5" y="8.5" width="11" height="12" rx="1.6"/><path d="M15.5 8.5V5.2A1.7 1.7 0 0 0 13.8 3.5H5.7A1.7 1.7 0 0 0 4 5.2v8.1a1.7 1.7 0 0 0 1.7 1.7h2.8"/>',
    underline: '<path d="M7 4.5v6.5a5 5 0 0 0 10 0V4.5M6 20h12"/>',
    scroll: '<path d="M12 4v16M8 8l4-4 4 4M8 16l4 4 4-4"/>',
    pages: '<rect x="3.5" y="5" width="7.5" height="14" rx="1.2"/><rect x="13" y="5" width="7.5" height="14" rx="1.2"/>',
    page: '<rect x="6" y="4" width="12" height="16" rx="1.5"/>',
    mouse: '<rect x="7" y="3" width="10" height="18" rx="5"/><path d="M12 7v3.5"/>',
    lines: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    warning: '<path d="M12 4 2.8 20h18.4z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.2" r=".9" fill="currentColor"/>',
    inbox: '<path d="M4 13.5V17a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3.5"/><path d="M4 13.5h4.5l1.5 2.5h4l1.5-2.5H20"/><path d="M12 4v8M8.5 8.5 12 12l3.5-3.5"/>',
    keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 9.5h.01M9.5 9.5h.01M13 9.5h.01M16.5 9.5h.01M6 12.5h.01M9.5 12.5h.01M13 12.5h.01M16.5 12.5h.01M8 15.5h8" stroke-width="2"/>',
    apps: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v8M8 12h8"/>',
    progress: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5H12z" fill="currentColor" stroke="none"/>',
    checkmarkSeal: '<circle cx="12" cy="12" r="8.5" fill="currentColor" stroke="none"/><path d="m8.5 12.3 2.3 2.3 4.7-5" stroke="#fff"/>',
    circle: '<circle cx="12" cy="12" r="8.5"/>',
    dot: '<circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/>',
  };
  function icon(name, opts = {}) {
    const size = opts.size || 18;
    const body = P[name] || P.circle;
    const sw = opts.stroke || 1.7;
    return `<svg class="icon icon-${name}${opts.className ? ' ' + opts.className : ''}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  }
  function el(name, opts) { return U.svg(icon(name, opts)); }
  global.Icons = { icon, el, paths: P };
})(window);
