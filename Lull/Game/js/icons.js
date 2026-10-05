// Lull — the icon set: one family of small inline SVGs on a 16-unit grid, drawn with a 1.5 stroke, round caps and
// joins, in currentColor. Two rules keep them coherent: the places to play (and anything that is a piece) are drawn in
// blocks, the game's own shape; everything else is a line drawing. Every icon is legible at 14–16 px and never an emoji.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});

  const open = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">';
  const svg = (body) => open + body + '</svg>';
  /** A filled block (a mino): top-left corner and size, softly rounded. */
  const blk = (x, y, s, r) => '<rect x="' + x + '" y="' + y + '" width="' + (s || 4) + '" height="' + (s || 4) + '" rx="' + (r == null ? 1 : r) + '" fill="currentColor" stroke="none"/>';
  const dot = (x, y, r) => '<circle cx="' + x + '" cy="' + y + '" r="' + (r || 0.9) + '" fill="currentColor" stroke="none"/>';

  const I = {
    // ---- places ------------------------------------------------------------------------------------------------------
    play: svg(blk(1.5, 8.5) + blk(6, 8.5) + blk(10.5, 8.5) + blk(6, 4)),
    puzzle: svg(blk(2, 2, 5.5, 1.2) + blk(8.5, 2, 5.5, 1.2) + blk(2, 8.5, 5.5, 1.2) + '<rect x="9.25" y="9.25" width="4" height="4" rx="0.9" stroke-width="1.5" opacity="0.9"/>'),
    factory: svg('<path d="M1.75 14.25V7.4l3.9-2.35V7.4l3.9-2.35V7.4l2.2-1.3V1.75h2.5v12.5z" fill="currentColor" stroke="none"/>'),
    classic: svg(blk(6, 1.25, 4, 0.9) + '<path d="M8 6.5v2.4M6.75 7.9 8 9.15l1.25-1.25" stroke-width="1.3"/>' + blk(1.5, 10.75, 4, 0.9) + blk(6, 10.75, 4, 0.9) + blk(10.5, 10.75, 4, 0.9)),
    stats: svg('<rect x="2.25" y="8.25" width="2.75" height="5.5" rx="1"/><rect x="6.625" y="2.25" width="2.75" height="11.5" rx="1"/><rect x="11" y="5.25" width="2.75" height="8.5" rx="1"/>'),
    // Lifetime (the achievements across every place): an hourglass.
    lifetime: svg('<path d="M4.25 1.75h7.5M4.25 14.25h7.5M5.25 1.75v2.1c0 1.55 2.75 2.6 2.75 4.15S5.25 10.6 5.25 12.15v2.1M10.75 1.75v2.1c0 1.55-2.75 2.6-2.75 4.15s2.75 2.6 2.75 4.15v2.1"/><path d="M6.4 12.9 8 11.5l1.6 1.4z" fill="currentColor" stroke-width="1"/>'),
    trophy: svg('<path d="M4.75 2.25h6.5v3.9a3.25 3.25 0 0 1-6.5 0z"/><path d="M4.75 3.75h-2v.9a2.6 2.6 0 0 0 2.35 2.6M11.25 3.75h2v.9a2.6 2.6 0 0 1-2.35 2.6M8 9.4v3.1M5.25 13.75h5.5"/>'),
    shop: svg('<path d="M3 5.5h10l-.75 8.25H3.75z"/><path d="M5.75 5.5V4.4a2.25 2.25 0 0 1 4.5 0v1.1"/>'),

    // ---- the window and its tools ------------------------------------------------------------------------------------
    settings: svg('<path d="M2.25 4.25h6.5M12.25 4.25h1.5M2.25 8h1.5M7.25 8h6.5M2.25 11.75h8M13.5 11.75h.25"/><circle cx="10.5" cy="4.25" r="1.75"/><circle cx="5.5" cy="8" r="1.75"/><circle cx="11.75" cy="11.75" r="1.75"/>'),
    sound: svg('<path d="M2.25 6.1h2.3L7.9 3.3v9.4L4.55 9.9h-2.3z"/><path d="M10.4 6a2.9 2.9 0 0 1 0 4M12.3 4.1a5.6 5.6 0 0 1 0 7.8"/>'),
    muted: svg('<path d="M2.25 6.1h2.3L7.9 3.3v9.4L4.55 9.9h-2.3z"/><path d="M10.75 6.25l3.5 3.5M14.25 6.25l-3.5 3.5"/>'),
    pin: svg('<path d="M5.5 2.25h5M6.5 2.25v3.6L4.5 8.6h7l-2-2.75v-3.6M8 8.6v5.15"/>'),
    hide: svg('<path d="M3.75 8h8.5"/>'),
    close: svg('<path d="M4.25 4.25l7.5 7.5M11.75 4.25l-7.5 7.5"/>'),
    chevUp: svg('<path d="M4.25 10 8 6.25 11.75 10"/>'),
    chevDown: svg('<path d="M4.25 6.25 8 10l3.75-3.75"/>'),
    chevLeft: svg('<path d="M10 3.75 5.75 8 10 12.25"/>'),
    chevRight: svg('<path d="M6 3.75 10.25 8 6 12.25"/>'),
    // The currency, large: a line running into a dark disc with a thin glowing ring (text uses L.LINE, the same shape).
    line: '<svg viewBox="0 0 22 14" aria-hidden="true" focusable="false"><circle cx="11" cy="7" r="6.4" fill="currentColor" opacity="0.10"/><circle cx="11" cy="7" r="4.9" fill="currentColor" opacity="0.16"/><path d="M0.6 7Q0.6 6.55 1.1 6.5L7.2 5.9 7.2 8.1 1.1 7.5Q0.6 7.45 0.6 7ZM21.4 7Q21.4 6.55 20.9 6.5L14.8 5.9 14.8 8.1 20.9 7.5Q21.4 7.45 21.4 7Z" fill="currentColor"/><circle cx="11" cy="7" r="3.55" fill="var(--hole, #05070c)" stroke="currentColor" stroke-width="1.3"/></svg>',

    // ---- actions -------------------------------------------------------------------------------------------------------
    undo: svg('<path d="M5.25 3.25 2.5 6l2.75 2.75"/><path d="M2.5 6h6.75a3.75 3.75 0 0 1 0 7.5H6.5"/>'),
    retry: svg('<path d="M13.25 8.5A5.25 5.25 0 1 1 11.6 4.2"/><path d="M12.1 1.6v3.1H9"/>'),
    hint: svg('<path d="M6.1 12.1h3.8M6.6 14.1h2.8M8 1.9a4.1 4.1 0 0 0-2.45 7.4c.5.37.8.92.8 1.5v.3h3.3v-.3c0-.58.3-1.13.8-1.5A4.1 4.1 0 0 0 8 1.9z"/>'),
    skip: svg('<path d="M3.25 3.75 9.25 8l-6 4.25z"/><path d="M12.5 3.5v9"/>'),
    next: svg('<path d="M2.75 8h10M9 4.25 12.75 8 9 11.75"/>'),
    minus: svg('<path d="M3.75 8h8.5"/>'),
    plus: svg('<path d="M8 3.75v8.5M3.75 8h8.5"/>'),
    newBoard: svg('<rect x="2.25" y="2.25" width="11.5" height="11.5" rx="2.5"/><path d="M8 5.25v5.5M5.25 8h5.5"/>'),
    // The board library: a board in front of another, holding a small stack; retire files it away; rename, delete.
    menu: svg('<path d="M2.75 4h10.5M2.75 8h10.5M2.75 12h10.5"/>'),
    boards: svg('<path d="M6 1.75h6.25a1.5 1.5 0 0 1 1.5 1.5v8"/><rect x="2.25" y="4.25" width="8.5" height="10" rx="1.6"/>' + blk(4, 10.6, 2.4, 0.6) + blk(6.6, 10.6, 2.4, 0.6) + blk(6.6, 8, 2.4, 0.6)),
    // Full view (a retired board at play size): the four corners of a screen.
    expand: svg('<path d="M2 5.5V2h3.5M10.5 2H14v3.5M14 10.5V14h-3.5M5.5 14H2v-3.5"/>'),
    retire: svg('<rect x="1.75" y="2.5" width="12.5" height="3.5" rx="1"/><path d="M2.75 6v6.25a1.5 1.5 0 0 0 1.5 1.5h7.5a1.5 1.5 0 0 0 1.5-1.5V6M6.5 9h3"/>'),
    rename: svg('<path d="M10.6 2.4a1.5 1.5 0 0 1 2.1 2.1L5.5 11.7l-2.75.75.75-2.75z"/><path d="M9.25 3.75l2.1 2.1M8.75 13.75h4.5"/>'),
    trash: svg('<path d="M2.75 4.25h10.5M6.25 4.25v-1.5h3.5v1.5M4 4.25l.7 9a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9l.7-9M6.75 7v4.25M9.25 7v4.25"/>'),
    playIcon: svg('<path d="M5 3.1v9.8c0 .5.55.8.95.5l7.1-4.9a.6.6 0 0 0 0-1L5.95 2.6C5.55 2.3 5 2.6 5 3.1z" fill="currentColor" stroke="none"/>'),
    pause: svg('<path d="M5.5 3.5v9M10.5 3.5v9"/>'),
    // Watch (Classic): an eye; Take over: a hand on the keys (a key with a chevron into it).
    watch: svg('<path d="M1.75 8s2.3-4.25 6.25-4.25S14.25 8 14.25 8 11.95 12.25 8 12.25 1.75 8 1.75 8z"/><circle cx="8" cy="8" r="1.9"/>'),
    takeOver: svg('<rect x="1.75" y="5.25" width="12.5" height="7.5" rx="1.75"/><path d="M4.5 9h.01M7 9h.01M9.5 9h2M8 1.75v2.1M6.6 2.55 8 3.95l1.4-1.4"/>'),
    music: svg('<path d="M6 12V3.4l7-1.4v8.4"/><circle cx="4.25" cy="12" r="1.75"/><circle cx="11.25" cy="10.4" r="1.75"/>'),
    musicOff: svg('<path d="M6 8.5V3.4l7-1.4v5"/><circle cx="4.25" cy="12" r="1.75"/><path d="M2.25 2.25l11.5 11.5"/>'),
    copy: svg('<rect x="5.5" y="5.5" width="8.25" height="8.25" rx="1.75"/><path d="M10.5 3.2a1.2 1.2 0 0 0-1.15-.95H3.45a1.2 1.2 0 0 0-1.2 1.2v5.9a1.2 1.2 0 0 0 .95 1.15"/>'),
    check: svg('<path d="M3.25 8.4 6.5 11.5l6.25-7"/>'),
    checkCircle: svg('<circle cx="8" cy="8" r="6"/><path d="M5.3 8.2l1.9 1.9 3.6-3.8"/>'),
    circle: svg('<circle cx="8" cy="8" r="6"/>'),
    star: svg('<path d="M8 1.9l1.85 3.85 4.2.55-3.07 2.92.78 4.18L8 11.37 4.24 13.4l.78-4.18L1.95 6.3l4.2-.55z"/>'),
    starOn: svg('<path d="M8 1.9l1.85 3.85 4.2.55-3.07 2.92.78 4.18L8 11.37 4.24 13.4l.78-4.18L1.95 6.3l4.2-.55z" fill="currentColor"/>'),
    sparkle: svg('<path d="M8 1.75c.35 3.2 1.55 4.45 4.75 4.75-3.2.3-4.4 1.55-4.75 4.75-.35-3.2-1.55-4.45-4.75-4.75 3.2-.3 4.4-1.55 4.75-4.75z"/><path d="M12.75 10.75v2.5M11.5 12h2.5"/>'),
    legend: svg('<path d="M8 1.75 12.5 6 8 14.25 3.5 6z"/><path d="M3.5 6h9M6.25 6 8 14.25 9.75 6M6.25 6 8 1.75 9.75 6"/>'),
    info: svg('<circle cx="8" cy="8" r="6"/><path d="M8 7.25v3.75"/>' + dot(8, 4.9, 0.85)),
    lock: svg('<rect x="3.5" y="7" width="9" height="6.75" rx="1.6"/><path d="M5.5 7V5.25a2.5 2.5 0 0 1 5 0V7"/>'),
    gift: svg('<rect x="2.5" y="6.75" width="11" height="7" rx="1.25"/><path d="M1.75 4.5h12.5v2.25H1.75zM8 4.5v9.25"/><path d="M8 4.5C6.9 2.3 4.6 2.1 4.6 3.4c0 1.05 2 1.1 3.4 1.1 1.4 0 3.4-.05 3.4-1.1 0-1.3-2.3-1.1-3.4 1.1z"/>'),
    seed: svg('<path d="M6.25 2.5 5 13.5M11 2.5 9.75 13.5M2.75 6h10.75M2.5 10h10.75"/>'),
    daily: svg('<rect x="2.25" y="3.25" width="11.5" height="10.5" rx="2"/><path d="M2.25 6.75h11.5M5.5 1.75v3M10.5 1.75v3"/>'),
    history: svg('<path d="M2.75 8a5.25 5.25 0 1 0 1.55-3.72"/><path d="M2.5 2.25v3h3M8 5.25V8l2 1.4"/>'),

    // ---- Settings -----------------------------------------------------------------------------------------------------
    look: svg('<circle cx="8" cy="8" r="6"/><path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor" stroke="none"/>'),
    window: svg('<rect x="1.75" y="2.75" width="12.5" height="10.5" rx="2"/><path d="M1.75 5.75h12.5"/>' + dot(4, 4.25, 0.6) + dot(5.9, 4.25, 0.6)),
    controls: svg('<path d="M4.9 4.25h6.2a3.4 3.4 0 0 1 3.3 2.6l.6 2.6a2 2 0 0 1-3.4 1.8L10.4 10H5.6l-1.2 1.25A2 2 0 0 1 1 9.45l.6-2.6a3.4 3.4 0 0 1 3.3-2.6z"/><path d="M5 6.25v2.5M3.75 7.5h2.5"/>' + dot(10.5, 6.75, 0.75) + dot(11.9, 8.1, 0.75)),
    keys: svg('<rect x="1.5" y="3.75" width="13" height="8.5" rx="1.75"/><path d="M4.25 6.5h.01M6.75 6.5h.01M9.25 6.5h.01M11.75 6.5h.01M5.25 9.5h5.5"/>'),
    // By touch alone, Keys is Gestures: a fingertip and the ripple of its tap.
    gestures: svg('<path d="M6.5 14.25V8a1.5 1.5 0 0 1 3 0v2.6l2.35.5a1.5 1.5 0 0 1 1.17 1.66l-.22 1.49"/><path d="M5.2 5.5a3.4 3.4 0 0 1 5.6 0M3.4 3.85a5.9 5.9 0 0 1 9.2 0"/>'),
    data: svg('<ellipse cx="8" cy="3.9" rx="5.25" ry="1.9"/><path d="M2.75 3.9v8.2c0 1.05 2.35 1.9 5.25 1.9s5.25-.85 5.25-1.9V3.9M2.75 8c0 1.05 2.35 1.9 5.25 1.9s5.25-.85 5.25-1.9"/>'),

    // ---- power-up types --------------------------------------------------------------------------------------------------
    'group-shape': svg('<path d="M4.75 2.1 7.4 6.6H2.1z"/><circle cx="11.25" cy="4.75" r="2.6"/><rect x="2.4" y="9.1" width="4.75" height="4.75" rx="1"/><path d="M9.25 11.5h4M11.25 9.5v4"/>'),
    'group-choice': svg('<path d="M8 14V9.25M8 9.25 3.75 5M8 9.25 12.25 5"/><path d="M3.5 2.25v3h3M12.5 2.25v3h-3"/>'),
    'group-tool': svg('<path d="M10.1 2.2a3.3 3.3 0 0 0-3.2 4.3l-4.35 4.35a1.45 1.45 0 0 0 2.05 2.05L8.95 8.55a3.3 3.3 0 0 0 4.3-3.2l-1.95 1.3-1.95-.45-.45-1.95z"/>'),
    'group-board': svg('<rect x="2.75" y="1.75" width="10.5" height="12.5" rx="1.75"/><path d="M2.75 10h10.5M2.75 6.75h4.5M7.25 6.75V10"/>'),
    'group-luck': svg('<path d="M8 1.75c.35 3.3 1.6 4.55 4.9 4.9-3.3.35-4.55 1.6-4.9 4.9-.35-3.3-1.6-4.55-4.9-4.9 3.3-.35 4.55-1.6 4.9-4.9z"/><path d="M12.9 11.25v3M11.4 12.75h3"/>'),

    // ---- power-ups ------------------------------------------------------------------------------------------------------
    'item-reroll': svg('<rect x="2.25" y="2.25" width="11.5" height="11.5" rx="2.75"/>' + dot(5.4, 5.4, 1.05) + dot(8, 8, 1.05) + dot(10.6, 10.6, 1.05)),
    'item-mirror': svg('<path d="M8 1.75v12.5" stroke-dasharray="1.6 2.1"/><path d="M5.75 4.25v7.5L1.75 11.75z"/><path d="M10.25 4.25v7.5l4 0z"/>'),
    'item-pebble': svg(blk(4.75, 4.75, 6.5, 1.5)),
    'item-noodle': svg('<rect x="1.5" y="6" width="13" height="4" rx="1.25"/><path d="M5.85 6v4M10.15 6v4"/>'),
    'item-giant': svg('<rect x="5" y="5" width="6" height="6" rx="1.25"/><path d="M1.75 5V1.75H5M14.25 5V1.75H11M1.75 11v3.25H5M14.25 11v3.25H11"/>'),
    'item-blueprint': svg('<path d="M11.1 1.9a1.45 1.45 0 0 1 2.05 2.05L6.5 10.6l-2.75.7.7-2.75z"/><path d="M9.75 3.25l2.05 2.05"/><rect x="1.75" y="11.25" width="3" height="3" rx="0.6" stroke-width="1.2"/><path d="M8 13.75h6.25" stroke-dasharray="1.4 1.8"/>'),
    'item-pick': svg('<rect x="1.25" y="7.75" width="3.75" height="3.75" rx="0.9"/>' + blk(6.125, 4.5, 3.75, 0.9) + '<rect x="11" y="7.75" width="3.75" height="3.75" rx="0.9"/><path d="M6.5 13.75h3"/>'),
    'item-fit': svg('<path d="M1.75 8.75v4.5a1 1 0 0 0 1 1h10.5a1 1 0 0 0 1-1v-4.5h-3.5v2.5h-5.5v-2.5z"/>' + blk(5.75, 2.25, 4.5, 1)),
    'item-order': svg('<path d="M3.5 1.75h9v12.5l-1.5-1-1.5 1-1.5-1-1.5 1-1.5-1-1.5 1z"/><path d="M5.75 5h4.5M5.75 7.75h4.5M5.75 10.5h2.5"/>'),
    'item-patch': svg('<rect x="1.4" y="5.35" width="13.2" height="5.3" rx="2.65" transform="rotate(-45 8 8)"/><rect x="6.1" y="6.1" width="3.8" height="3.8" rx="0.6" transform="rotate(-45 8 8)"/>'),
    'item-phase': svg('<path d="M3.5 14V7.25a4.5 4.5 0 0 1 9 0V14l-1.5-1.1-1.5 1.1L8 12.9 6.5 14 5 12.9z"/>' + dot(6.25, 7.25, 0.95) + dot(9.75, 7.25, 0.95)),
    'item-drill': svg('<path d="M4.5 1.75h7M5.75 1.75v4.5L8 14.25l2.25-8v-4.5"/><path d="M5.9 5.1l4.2 1.2M6.4 8.1l3.2.95"/>'),
    'item-bomb': svg('<circle cx="7" cy="9.5" r="4.5"/><path d="M10.2 6.3c.5-.8 1.2-1.4 2.1-1.7"/>' + dot(13.4, 3.6, 1.15)),
    'item-laser': svg('<rect x="1.25" y="5.75" width="4" height="4.5" rx="1"/><path d="M5.25 8h9"/><path d="M8.5 5.25l1 1.25M11.5 5.25l1 1.25M8.5 10.75l1-1.25M11.5 10.75l1-1.25" stroke-width="1.2"/>'),
    'item-blackhole': svg('<circle cx="8" cy="8" r="1.6"/><path d="M9.6 8a4.1 4.1 0 0 1-6.3 3.45M6.4 8a4.1 4.1 0 0 1 6.3-3.45M12.9 4.6a5.9 5.9 0 0 1-.95 8.05M3.1 11.4a5.9 5.9 0 0 1 .95-8.05"/>'),
    'item-flip': svg('<path d="M2.25 5.25h11M10.5 2.5l2.75 2.75L10.5 8M13.75 10.75h-11M5.5 8l-2.75 2.75L5.5 13.5"/>'),
    'item-trapdoor': svg('<rect x="1.75" y="1.75" width="12.5" height="7.5" rx="1.5"/><path d="M1.75 11.25l3.5 3M14.25 11.25l-3.5 3M5.25 5.5h5.5"/>'),
    'item-tornado': svg('<path d="M1.75 2.75h12.5M3.25 5.75h9.5M5 8.75h6.5M6.75 11.75h3.5M8.25 14.25h.5"/>'),
    'item-settle': svg('<path d="M4.5 1.75v6.5M2.5 6.25l2 2 2-2M11.5 1.75v6.5M9.5 6.25l2 2 2-2M1.75 11h12.5M1.75 14h12.5"/>'),
    'item-golden': svg('<rect x="1.75" y="4.25" width="10" height="10" rx="2"/><path d="M4.5 11.5l4.5-4.5M4.5 8.25l1.75-1.75" opacity="0.8"/><path d="M13 1.25c.15 1.2.55 1.6 1.75 1.75-1.2.15-1.6.55-1.75 1.75-.15-1.2-.55-1.6-1.75-1.75 1.2-.15 1.6-.55 1.75-1.75z" stroke-width="1.1"/>'),
    'item-double': svg('<circle cx="6.25" cy="8" r="4.5"/><path d="M6.25 3.5a4.5 4.5 0 0 1 0 9z" fill="currentColor" stroke="none"/><path d="M11.4 4a4.5 4.5 0 0 1 0 8" opacity="0.7"/><path d="M13.5 5.4a4.5 4.5 0 0 1 0 5.2" opacity="0.45"/>'),
    'item-net': svg('<path d="M8 1.75l5.25 2v4.1c0 3.1-2.25 5.4-5.25 6.4-3-1-5.25-3.3-5.25-6.4v-4.1z"/><path d="M5.5 8.1l1.75 1.75L10.6 6.5"/>'),

    // ---- puzzle wildcards and goals -----------------------------------------------------------------------------------------
    'mod-big': svg('<rect x="2.25" y="2.25" width="11.5" height="11.5" rx="1.75"/><path d="M8 2.25v11.5M2.25 8h11.5"/>'),
    'mod-odd': svg('<path d="M6 2.25h4V6h3.75v4H10v3.75H6V10H2.25V6H6z"/>'),
    'mod-wrap': svg('<path d="M2 2.75v10.5M14 2.75v10.5M4.5 8h7M9.5 6l2 2-2 2"/>'),
    'mod-rigid': svg('<rect x="3.5" y="7" width="9" height="6.75" rx="1.6"/><path d="M5.5 7V5.25a2.5 2.5 0 0 1 5 0V7"/>'),
    'mod-heavy': svg('<path d="M8 2.25v8M4.75 7.25 8 10.5l3.25-3.25M2.75 13.75h10.5"/>'),
    'mod-invert': svg('<path d="M2.75 5.25h9.5M9.75 2.75l2.5 2.5-2.5 2.5M13.25 10.75h-9.5M6.25 8.25l-2.5 2.5 2.5 2.5"/>'),
    'mod-flip': svg('<path d="M5.25 13.25V2.75M2.75 5.25l2.5-2.5 2.5 2.5M10.75 2.75v10.5M8.25 10.75l2.5 2.5 2.5-2.5"/>'),
    'mod-side': svg('<path d="M12.75 2.75v5a3 3 0 0 1-3 3h-6.5M6.25 7.75l-3 3 3 3"/>'),
    'mod-fog': svg('<path d="M2.25 5c1.45-1 2.65-1 4 0s2.6 1 4 0 2.3-.85 3.5 0M2.25 8.5c1.45-1 2.65-1 4 0s2.6 1 4 0 2.3-.85 3.5 0M2.25 12c1.45-1 2.65-1 4 0s2.6 1 4 0 2.3-.85 3.5 0"/>'),
    'mod-vanish': svg('<rect x="2.75" y="2.75" width="10.5" height="10.5" rx="1.75" stroke-dasharray="2.2 2.1"/>'),
    'mod-blind': svg('<path d="M1.75 8s2.3-4.25 6.25-4.25S14.25 8 14.25 8 11.95 12.25 8 12.25 1.75 8 1.75 8z"/><circle cx="8" cy="8" r="1.75"/><path d="M2.75 13.25 13.25 2.75"/>'),
    'mod-hold': svg('<rect x="2.25" y="6.5" width="11.5" height="7.25" rx="1.6"/><path d="M8 1.75v6M5.6 5.4 8 7.75l2.4-2.35"/>'),
    'mod-spin': svg('<path d="M3.5 8A4.5 4.5 0 1 0 8 3.5H6.25"/><path d="M8.25 1.5l-2 2 2 2"/>'),
    'mod-mono': svg('<circle cx="8" cy="8" r="6"/><path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor" stroke="none"/>'),
    'goal-clear': svg('<circle cx="8" cy="8" r="6"/>' + dot(8, 8, 2)),
    'goal-lines': svg('<path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11"/>'),
    'goal-gems': svg('<path d="M8 2l4.9 6L8 14 3.1 8z" fill="currentColor" stroke="none"/>'),
  };

  // Undo (the power-up 'rewind') is one item in Relaxed and Puzzles, so it has one icon: the Puzzles tab's Undo arrow.
  I['item-rewind'] = I.undo;

  /** An icon by name, as markup; an unknown name draws nothing rather than a stray glyph. */
  function icon(name) { return I[name] || ''; }
  /** An element holding the icon, for building DOM (class `ico` plus any given). */
  function iconEl(name, cls) {
    const el = root.document.createElement('span');
    el.className = 'ico' + (cls ? ' ' + cls : '');
    el.innerHTML = icon(name);
    return el;
  }

  L.Icons = { I, icon, iconEl };
})(typeof globalThis !== 'undefined' ? globalThis : this);
