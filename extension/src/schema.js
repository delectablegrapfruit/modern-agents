// Every setting the extension has, in one place: the popup and options page render from it, content.js builds its
// stylesheet from it, background.js reads its defaults. Loaded as a classic script in each of those contexts.
//
// Hide features are CSS: each one's rules only apply while <html data-yff~="<id>"> carries its id, so turning one on
// or off is an attribute change — instant, no reload. `hide` lists selectors to display:none; `css` is extra rules
// where `$` stands for that attribute prefix. Features with `action` are carried out by content.js instead.
// Selectors are YouTube's current element and class names and need updating when YouTube renames them.
const YFF = (() => {
  const GROUPS = [
    { id: 'home', label: 'Home' },
    { id: 'watch', label: 'Watch page' },
    { id: 'player', label: 'Player' },
    { id: 'search', label: 'Search' },
    { id: 'everywhere', label: 'Everywhere' },
    { id: 'nav', label: 'Header & menu' },
    { id: 'look', label: 'Look' },
    { id: 'fix', label: 'Playback fixes' },
  ];

  const SHORT_LINK = 'a[href^="/shorts/"]';
  const MIX_LINK = 'a[href*="list=RD"]';

  const FEATURES = [
    // Home
    {
      id: 'homeFeed',
      group: 'home',
      label: 'Home feed',
      hint: 'Recommendation grid and topic chips; search stays',
      hide: [
        'ytd-browse[page-subtype="home"] ytd-rich-grid-renderer',
        'ytd-browse[page-subtype="home"] ytd-feed-filter-chip-bar-renderer',
      ],
      css: `$ ytd-browse[page-subtype="home"] #primary::before {
        content: "Home feed hidden"; display: block; padding-top: 22vh; text-align: center;
        font: 500 2rem/1.4 Roboto, Arial, sans-serif; color: var(--yt-spec-text-secondary, #888);
      }`,
    },

    // Watch page
    { id: 'related', group: 'watch', label: 'Recommended videos', hint: 'Sidebar and below-video suggestions', hide: ['ytd-watch-flexy #related', 'ytd-watch-next-secondary-results-renderer'] },
    { id: 'sidebar', group: 'watch', label: 'Whole sidebar', hint: 'Recommendations, playlist and chat column', hide: ['ytd-watch-flexy #secondary'] },
    { id: 'comments', group: 'watch', label: 'Comments', hide: ['ytd-watch-flexy #comments', 'ytd-comments#comments', 'ytd-comments-entry-point-header-renderer'] },
    { id: 'liveChat', group: 'watch', label: 'Live chat', hide: ['ytd-watch-flexy #chat-container', 'ytd-watch-flexy #chat', 'ytd-live-chat-frame'] },
    { id: 'playlist', group: 'watch', label: 'Playlist panel', hint: 'Playback of the playlist continues', hide: ['ytd-watch-flexy ytd-playlist-panel-renderer#playlist'] },
    { id: 'videoInfo', group: 'watch', label: 'Everything under the player', hint: 'Title, channel, buttons, description', hide: ['ytd-watch-flexy ytd-watch-metadata'] },
    { id: 'channel', group: 'watch', label: 'Channel & Subscribe', hide: ['ytd-watch-metadata #owner'] },
    { id: 'buttons', group: 'watch', label: 'Like / share / save bar', hide: ['ytd-watch-metadata #actions'] },
    { id: 'description', group: 'watch', label: 'Description', hide: ['ytd-watch-metadata #description', 'ytd-watch-metadata #bottom-row'] },
    { id: 'infoPanels', group: 'watch', label: 'Info & context panels', hint: 'Topic, fact-check and clarification boxes', hide: ['ytd-info-panel-container-renderer', 'ytd-info-panel-content-renderer', 'ytd-clarification-renderer'] },

    // Player
    { id: 'endscreenWall', group: 'player', label: 'End-screen video wall', hint: 'Also the pause and autoplay-countdown overlays', hide: ['.html5-endscreen', '.ytp-endscreen-content', '.ytp-fullscreen-grid', '.ytp-autonav-endscreen', '.ytp-autonav-endscreen-countdown-overlay', '.ytp-pause-overlay'] },
    { id: 'endscreenCards', group: 'player', label: 'End-screen & info cards', hide: ['.ytp-ce-element', '.ytp-cards-teaser', '.ytp-cards-button', '.ytp-suggested-action'] },
    { id: 'annotations', group: 'player', label: 'Annotations & watermark', hide: ['.annotation', '.ytp-iv-video-content', '.iv-branding', '.branding-img-container'] },
    { id: 'disableAutoplay', group: 'player', label: 'Turn off Autoplay', hint: 'Flips the player’s own switch off', action: true },

    // Search
    { id: 'irrelevantSearch', group: 'search', label: 'Irrelevant results', hint: '“People also watched”, “Latest from”, “Searches related to”…', hide: ['ytd-search ytd-shelf-renderer', 'ytd-search ytd-horizontal-card-list-renderer'] },
    { id: 'searchSuggestions', group: 'search', label: 'Search suggestions', hint: 'Dropdown under the search box', hide: ['.ytSearchboxComponentSuggestionsContainer', '.sbdd_a', '.gstl_50'] },

    // Everywhere
    {
      id: 'shorts',
      group: 'everywhere',
      label: 'Shorts',
      hint: 'Shelves, feed items, menu entries, channel tab',
      hide: [
        'ytd-reel-shelf-renderer',
        'ytd-rich-shelf-renderer[is-shorts]',
        'ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts])',
        `ytd-rich-item-renderer:has(${SHORT_LINK})`,
        `ytd-video-renderer:has(${SHORT_LINK})`,
        `ytd-grid-video-renderer:has(${SHORT_LINK})`,
        `ytd-compact-video-renderer:has(${SHORT_LINK})`,
        'ytm-shorts-lockup-view-model',
        'ytm-shorts-lockup-view-model-v2',
        'grid-shelf-view-model:has(ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2)',
        'ytd-guide-entry-renderer:has(a[title="Shorts"])',
        'ytd-mini-guide-entry-renderer[aria-label="Shorts"]',
        'yt-tab-shape[tab-title="Shorts"]',
      ],
    },
    { id: 'shortsRedirect', group: 'everywhere', label: 'Open Shorts in the normal player', hint: '/shorts/ID → /watch?v=ID, with seek bar and speed', action: true },
    {
      id: 'mixes',
      group: 'everywhere',
      label: 'Mixes',
      hint: 'Endless auto-generated radio playlists',
      hide: ['ytd-radio-renderer', 'ytd-compact-radio-renderer', `ytd-rich-item-renderer:has(${MIX_LINK})`, `yt-lockup-view-model:has(${MIX_LINK})`],
    },
    { id: 'hoverPreviews', group: 'everywhere', label: 'Hover previews', hint: 'Thumbnails that start playing under the pointer', hide: ['ytd-video-preview', '#video-preview', 'ytd-moving-thumbnail-renderer', '#mouseover-overlay'] },
    {
      id: 'merch',
      group: 'everywhere',
      label: 'Merch, tickets, offers',
      hint: 'Also fundraisers',
      hide: ['ytd-merch-shelf-renderer', 'ytd-ticket-shelf-renderer', 'ytd-offer-module-renderer', 'ytd-donation-shelf-renderer', 'ytd-donation-unavailable-renderer', '#ticket-shelf'],
    },
    {
      id: 'promos',
      group: 'everywhere',
      label: 'Promos & banners',
      hint: 'Premium upsells, pop-up bars, in-feed ad slots',
      hide: [
        'ytd-mealbar-promo-renderer',
        'ytd-statement-banner-renderer',
        'ytd-banner-promo-renderer',
        'ytd-primetime-promo-renderer',
        'ytd-brand-video-singleton-renderer',
        'ytd-brand-video-shelf-renderer',
        'tp-yt-paper-dialog:has(> ytd-mealbar-promo-renderer)',
        '#masthead-ad',
        'ytd-ad-slot-renderer',
        'ytd-in-feed-ad-layout-renderer',
        'ytd-rich-item-renderer:has(ytd-ad-slot-renderer)',
      ],
    },
    {
      id: 'profilePhotos',
      group: 'everywhere',
      label: 'Profile photos',
      hint: 'Channel and commenter avatars (not your own)',
      hide: ['ytd-page-manager #avatar', 'ytd-page-manager #author-thumbnail', 'ytd-page-manager #channel-thumbnail', 'ytd-page-manager yt-avatar-shape', 'ytd-page-manager yt-decorated-avatar-view-model'],
    },
    {
      id: 'metrics',
      group: 'everywhere',
      label: 'View, like & subscriber counts',
      hint: 'Judge videos without the numbers',
      hide: [
        '#owner-sub-count',
        '#subscriber-count',
        '#vote-count-middle',
        'ytd-comments-header-renderer #count',
        'ytd-video-meta-block #metadata-line > span:first-of-type',
        'ytd-watch-info-text #info > span:nth-child(-n+2)',
        '[class*="content-metadata-view-model"][class*="metadata-row"]:last-child > span:nth-child(-n+2)',
        'like-button-view-model .yt-spec-button-shape-next__button-text-content',
      ],
    },

    // Header & menu
    {
      id: 'topHeader',
      group: 'nav',
      label: 'Top header',
      hint: 'Logo, search, account bar',
      hide: ['#masthead-container'],
      css: `$ ytd-app { --ytd-masthead-height: 0px !important; } $ ytd-page-manager { margin-top: 0 !important; }`,
    },
    {
      id: 'guide',
      group: 'nav',
      label: 'Left menu',
      hide: ['tp-yt-app-drawer#guide', 'ytd-mini-guide-renderer', '#guide-button'],
      css: `$ ytd-page-manager { margin-left: 0 !important; }`,
    },
    { id: 'notifications', group: 'nav', label: 'Notification bell', hide: ['ytd-notification-topbar-button-renderer'] },
    {
      id: 'explore',
      group: 'nav',
      label: 'Explore & Trending',
      hint: 'Menu entries hidden, pages sent home',
      action: true,
      hide: [
        'ytd-guide-section-renderer:has(a[href^="/feed/trending"])',
        'ytd-guide-section-renderer:has(a[href^="/feed/explore"])',
        'ytd-guide-entry-renderer:has(a[href^="/feed/trending"])',
        'ytd-guide-entry-renderer:has(a[href^="/feed/explore"])',
        'ytd-mini-guide-entry-renderer:has(a[href^="/feed/explore"])',
      ],
    },
    {
      id: 'moreFromYouTube',
      group: 'nav',
      label: 'More from YouTube',
      hint: 'Premium, Music, Kids links',
      hide: ['ytd-guide-section-renderer:has(a[href*="music.youtube.com"])', 'ytd-guide-section-renderer:has(a[href*="youtubekids.com"])', 'ytd-guide-renderer #footer'],
    },
    {
      id: 'subscriptions',
      group: 'nav',
      label: 'Subscriptions',
      hint: 'Menu entries and channel list hidden, feed sent home',
      action: true,
      hide: [
        'ytd-guide-entry-renderer:has(a[href="/feed/subscriptions"])',
        'ytd-mini-guide-entry-renderer:has(a[href="/feed/subscriptions"])',
        'ytd-guide-section-renderer:has(a[href="/feed/channels"])',
      ],
    },

    // Look
    { id: 'grayscale', group: 'look', label: 'Grayscale', hint: 'Takes the pull out of thumbnails', css: `$ { filter: grayscale(1); }` },
    {
      id: 'blurThumbnails',
      group: 'look',
      label: 'Blur thumbnails',
      hint: 'Sharp again under the pointer',
      css: `$ :is(ytd-thumbnail, yt-thumbnail-view-model, ytd-playlist-thumbnail, [class*="lockup-view-model"][class*="content-image"]) img {
        filter: blur(14px); transition: filter .15s;
      }
      $ :is(ytd-thumbnail, yt-thumbnail-view-model, ytd-playlist-thumbnail, [class*="lockup-view-model"][class*="content-image"]):hover img { filter: none; }`,
    },
    { id: 'hideThumbnails', group: 'look', label: 'No thumbnails', hint: 'Feeds become text lists', hide: ['ytd-thumbnail', 'yt-thumbnail-view-model', 'ytd-playlist-thumbnail', 'a[class*="lockup-view-model"][class*="content-image"]'] },
  ];

  // Playback fixes run in the page's own JS world (page.js) and keep their own settings object.
  const FIXES = [
    { id: 'noAdRequests', label: 'Ad backoff', hint: 'Ask for the no-ad stream, so no forced wait before playback' },
    {
      id: 'attestationFallback',
      label: 'Bot-check reroute',
      hint: 'If jnn-pa.googleapis.com is blocked (uBlock, VPN or DNS blocker), send YouTube’s bot check via youtube.com',
    },
    { id: 'timerBoost', label: 'Startup gate', hint: 'Cut the player’s 5 s ad-wait timer' },
    { id: 'adFastForward', label: 'Ad-slot dead time', hint: 'Black/frozen ad slots at 16×, muted, auto-skip' },
    {
      id: 'stallRecovery',
      label: 'Stalls',
      hint: 'No picture 2.5 s → player reload, 8 s more → page reload (once); frozen 4 s → re-seek → pause/play → reload',
    },
    { id: 'dismissEnforcement', label: 'Anti-adblock dialog', hint: 'Close it and resume playback' },
  ];

  const HOME_REDIRECTS = [
    { id: 'off', label: 'Stay on Home', path: null },
    { id: 'subscriptions', label: 'Subscriptions', path: '/feed/subscriptions' },
    { id: 'watchLater', label: 'Watch later', path: '/playlist?list=WL' },
    { id: 'you', label: 'You (library)', path: '/feed/you' },
    { id: 'history', label: 'History', path: '/feed/history' },
  ];

  // Presets set every hide feature outside Look; Look is a matter of taste and stays as it is.
  const PRESETS = [
    { id: 'off', label: 'Show all', ids: [] },
    {
      id: 'clean',
      label: 'Clean',
      ids: ['shorts', 'mixes', 'merch', 'promos', 'irrelevantSearch', 'endscreenCards', 'annotations', 'infoPanels', 'moreFromYouTube'],
    },
    {
      id: 'focus',
      label: 'Focus',
      ids: [
        'homeFeed', 'related', 'comments', 'endscreenWall', 'endscreenCards', 'annotations', 'disableAutoplay',
        'irrelevantSearch', 'searchSuggestions', 'shorts', 'mixes', 'hoverPreviews', 'merch', 'promos', 'infoPanels',
        'notifications', 'explore', 'moreFromYouTube',
      ],
    },
    {
      id: 'minimal',
      label: 'Minimal',
      ids: [
        'homeFeed', 'related', 'sidebar', 'comments', 'liveChat', 'endscreenWall', 'endscreenCards', 'annotations',
        'disableAutoplay', 'irrelevantSearch', 'searchSuggestions', 'shorts', 'shortsRedirect', 'mixes', 'hoverPreviews',
        'merch', 'promos', 'infoPanels', 'profilePhotos', 'metrics', 'guide', 'notifications', 'explore', 'moreFromYouTube',
      ],
    },
  ];

  const DEFAULTS = {
    enabled: true,
    hide: Object.fromEntries(FEATURES.map((f) => [f.id, PRESETS.find((p) => p.id === 'clean').ids.includes(f.id)])),
    homeRedirect: 'off',
    filters: {
      keywords: [],
      channels: [],
      allowChannels: [],
      hideWatched: false,
      watchedPercent: 90,
      minMinutes: 0,
      maxMinutes: 0,
      hideLive: false,
      hideUpcoming: false,
      hideMembers: false,
      mode: 'hide', // or 'dim'
    },
    schedule: { enabled: false, days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' },
    friction: { pauseDelaySec: 0, lockDuringSchedule: false },
    custom: [], // { selector, page: 'all' | page type, added }
    fix: Object.fromEntries(FIXES.map((f) => [f.id, true])),
  };

  // Stored values over defaults, one level deep, dropping keys and values that don't fit the schema.
  const sameType = (value, base) => (Array.isArray(base) ? Array.isArray(value) : value !== null && typeof value === typeof base);
  const merge = (stored = {}) => {
    const out = structuredClone(DEFAULTS);
    for (const [key, value] of Object.entries(stored)) {
      if (!(key in out) || !sameType(value, out[key])) continue;
      const base = out[key];
      if (typeof base === 'object' && !Array.isArray(base)) {
        for (const k of Object.keys(base)) if (sameType(value[k], base[k])) base[k] = value[k];
      } else {
        out[key] = value;
      }
    }
    return out;
  };

  const hideIds = (group) => FEATURES.filter((f) => f.group !== 'look' && (!group || f.group === group)).map((f) => f.id);

  const applyPreset = (hide, presetId) => {
    const preset = PRESETS.find((p) => p.id === presetId);
    const next = { ...hide };
    for (const id of hideIds()) next[id] = preset.ids.includes(id);
    return next;
  };

  const matchingPreset = (hide) =>
    PRESETS.find((p) => hideIds().every((id) => Boolean(hide[id]) === p.ids.includes(id)))?.id ?? null;

  const minutes = (hhmm) => {
    const [h, m] = String(hhmm).split(':').map(Number);
    return h * 60 + m;
  };

  // Whether hiding is on at `date` under the schedule. Windows may cross midnight (22:00–06:00 counts from the
  // day it starts).
  const inSchedule = (schedule, date = new Date()) => {
    if (!schedule.enabled) return true;
    const now = date.getHours() * 60 + date.getMinutes();
    const start = minutes(schedule.start);
    const end = minutes(schedule.end);
    const day = date.getDay();
    if (start === end) return schedule.days.includes(day);
    if (start < end) return schedule.days.includes(day) && now >= start && now < end;
    if (now >= start) return schedule.days.includes(day);
    return now < end && schedule.days.includes((day + 6) % 7);
  };

  // 'off' | 'paused' | 'outside' (the schedule) | 'active'
  const status = (settings, pausedUntil, now = Date.now()) => {
    if (!settings.enabled) return 'off';
    if (pausedUntil > now) return 'paused';
    if (!inSchedule(settings.schedule, new Date(now))) return 'outside';
    return 'active';
  };

  // Commitment mode: inside scheduled hours hiding can't be switched off or paused.
  const locked = (settings, now = Date.now()) =>
    settings.friction.lockDuringSchedule && settings.schedule.enabled && inSchedule(settings.schedule, new Date(now));

  // Page type from a path, for scoping custom rules and deciding where filters and redirects apply.
  const pageType = (path) => {
    if (path === '/') return 'home';
    if (path === '/watch') return 'watch';
    if (path === '/results') return 'search';
    if (path.startsWith('/shorts/')) return 'shorts';
    if (path === '/feed/subscriptions') return 'subscriptions';
    if (path.startsWith('/feed/trending') || path.startsWith('/feed/explore')) return 'explore';
    if (path === '/feed/history') return 'history';
    if (path === '/playlist') return 'playlist';
    if (path === '/feed/you' || path === '/feed/library') return 'library';
    if (/^\/(@|channel\/|c\/|user\/)/.test(path)) return 'channel';
    return 'other';
  };

  const PAGE_LABELS = {
    all: 'Every page',
    home: 'Home',
    watch: 'Watch pages',
    search: 'Search results',
    shorts: 'Shorts',
    subscriptions: 'Subscriptions',
    explore: 'Explore',
    history: 'History',
    playlist: 'Playlists',
    library: 'You',
    channel: 'Channel pages',
    other: 'Other pages',
  };

  const buildCss = () =>
    FEATURES.map((f) => {
      const prefix = `html[data-yff~="${f.id}"]`;
      const rules = [];
      if (f.hide) rules.push(`${prefix} :is(${f.hide.join(', ')}) { display: none !important; }`);
      if (f.css) rules.push(f.css.replaceAll('$', prefix));
      return rules.join('\n');
    })
      .filter(Boolean)
      .concat([
        // Filtered feed items (content.js marks them).
        'html:not([data-yff-filter-mode="dim"]) [data-yff-filtered] { display: none !important; }',
        'html[data-yff-filter-mode="dim"] [data-yff-filtered] { opacity: .18 !important; transition: opacity .15s; }',
        'html[data-yff-filter-mode="dim"] [data-yff-filtered]:hover { opacity: .7 !important; }',
      ])
      .join('\n');

  return {
    GROUPS, FEATURES, FIXES, HOME_REDIRECTS, PRESETS, DEFAULTS, PAGE_LABELS,
    merge, applyPreset, matchingPreset, inSchedule, status, locked, pageType, buildCss,
  };
})();
