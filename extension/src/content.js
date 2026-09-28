// Isolated-world content script, on every YouTube frame from document_start:
// - hands page.js its playback-fix settings (DOM event) and counts what it reports back
// - hide features: one stylesheet built from schema.js, switched by tokens in <html data-yff="…">
// - custom rules from the element picker, the schedule and pause, redirects, the Autoplay switch, feed filters
(() => {
  'use strict';

  const EVENTS = { config: 'yff:config', ready: 'yff:ready', stat: 'yff:stat' };
  const ITEMS = [
    'ytd-rich-item-renderer',
    'ytd-video-renderer',
    'ytd-compact-video-renderer',
    'ytd-grid-video-renderer',
    'ytd-radio-renderer',
    'ytd-compact-radio-renderer',
    'ytd-playlist-renderer',
    'ytd-reel-item-renderer',
    'yt-lockup-view-model',
    'ytm-shorts-lockup-view-model',
    'ytm-shorts-lockup-view-model-v2',
  ].join(', ');
  const NO_FILTER_PAGES = new Set(['history', 'playlist', 'library']); // lists the viewer made
  const isTop = window === window.top;
  const root = document.documentElement;

  const fixStats = { requestsPatched: 0, timersBoosted: 0, adsFastForwarded: 0, stallsRecovered: 0, dialogsDismissed: 0 };
  let settings = null;
  let pausedUntil = 0;
  let active = false;
  let matchers = null;
  let filterVersion = 0;
  let filteredCount = -1;

  const addStyle = (id, css = '') => {
    const el = document.createElement('style');
    el.id = id;
    el.textContent = css;
    root.append(el);
    return el;
  };
  addStyle('yff-hide', YFF.buildCss());
  const customStyle = addStyle('yff-custom');

  // Playback fixes (page.js) -----------------------------------------------------------------------------------

  const pushFix = () => {
    if (settings) document.dispatchEvent(new CustomEvent(EVENTS.config, { detail: JSON.stringify(settings.fix) }));
  };
  document.addEventListener(EVENTS.ready, pushFix);
  // Only counted, never trusted with anything else: page scripts can fire this too.
  document.addEventListener(EVENTS.stat, (event) => {
    if (Object.hasOwn(fixStats, event.detail)) fixStats[event.detail] += 1;
  });

  // Custom rules -----------------------------------------------------------------------------------------------

  const validSelector = (selector) => {
    try {
      document.createDocumentFragment().querySelector(selector);
      return true;
    } catch {
      return false;
    }
  };

  const customCss = () =>
    settings.custom
      .filter((rule) => typeof rule.selector === 'string' && validSelector(rule.selector))
      .map((rule) => {
        const page = rule.page in YFF.PAGE_LABELS && rule.page !== 'all' ? `[data-yff-page="${rule.page}"]` : '';
        return `html[data-yff-active]${page} :is(${rule.selector}) { display: none !important; }`;
      })
      .join('\n');

  const addCustomRule = (rule) => {
    if (settings.custom.some((r) => r.selector === rule.selector && r.page === rule.page)) return;
    YFFStore.save({ custom: [...settings.custom, rule] });
  };

  // Redirects --------------------------------------------------------------------------------------------------

  const redirectTarget = (url) => {
    const { hide } = settings;
    const path = url.pathname;
    if (hide.shortsRedirect && path.startsWith('/shorts/')) {
      const id = path.split('/')[2];
      return id ? `/watch?v=${encodeURIComponent(id)}` : null;
    }
    if (hide.subscriptions && path === '/feed/subscriptions') return '/';
    if (hide.explore && YFF.pageType(path) === 'explore') return '/';
    if (path === '/') {
      const target = YFF.HOME_REDIRECTS.find((r) => r.id === settings.homeRedirect)?.path;
      // Subscriptions hidden sends the feed home; sending home to it would loop.
      if (target && !(hide.subscriptions && target === '/feed/subscriptions')) return target;
    }
    return null;
  };

  const redirect = () => {
    if (!isTop || !active) return;
    const target = redirectTarget(location);
    if (target) location.replace(target);
  };

  // Autoplay ---------------------------------------------------------------------------------------------------
  // YouTube saves the switch's state itself, so one click per page is enough; never more, in case a click is
  // ignored.

  let autoplayHandledFor = '';
  const autoplayOff = () => {
    if (!active || !settings.hide.disableAutoplay || autoplayHandledFor === location.href) return;
    const toggle = document.querySelector('.ytp-autonav-toggle-button[aria-checked="true"]');
    if (!toggle) return;
    autoplayHandledFor = location.href;
    toggle.click();
  };

  // Feed filters -----------------------------------------------------------------------------------------------

  const compile = (filters) => {
    const names = (list) => list.map((c) => c.trim().toLowerCase()).filter(Boolean);
    const keywords = filters.keywords
      .map((k) => k.trim())
      .filter(Boolean)
      .map((k) => {
        const regex = /^\/(.+)\/([a-z]*)$/.exec(k);
        if (!regex) {
          const needle = k.toLowerCase();
          return (title) => title.toLowerCase().includes(needle);
        }
        try {
          const re = new RegExp(regex[1], regex[2].replace(/[gy]/g, ''));
          return (title) => re.test(title);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    return { keywords, channels: names(filters.channels), allow: names(filters.allowChannels) };
  };

  const filtersOn = () => {
    const f = settings.filters;
    return Boolean(
      matchers.keywords.length || matchers.channels.length || f.hideWatched || f.minMinutes > 0 || f.maxMinutes > 0 ||
        f.hideLive || f.hideUpcoming || f.hideMembers,
    );
  };

  const text = (el) => el?.textContent.trim() ?? '';
  const DURATION = /^(\d{1,2}:)?\d{1,2}:\d{2}$/;
  const CHANNEL = ['ytd-channel-name #text', 'ytd-channel-name a', '[class*="metadata-view-model"][class*="metadata-text"]', 'a[href^="/@"]'];

  // What a feed item shows, read from both the older ytd-* renderers and the newer *-view-model ones.
  const readItem = (item) => {
    const titleEl = item.querySelector('#video-title, [class*="lockup-metadata-view-model"][class*="title"], h3');
    const title = (titleEl?.getAttribute('title') || text(titleEl)).trim();
    // In priority order: an avatar link can come before the name in the DOM and has no text.
    const channel = CHANNEL.map((selector) => text(item.querySelector(selector))).find(Boolean) ?? '';
    const handles = [...item.querySelectorAll('a[href^="/@"]')].map((a) =>
      decodeURIComponent(a.getAttribute('href').slice(1).split(/[/?#]/)[0]).toLowerCase(),
    );
    const badges = [...item.querySelectorAll('ytd-thumbnail-overlay-time-status-renderer, badge-shape, [class*="badge"]')].map(text);
    const duration = badges.find((t) => DURATION.test(t));
    const progressEl = item.querySelector('#progress, [class*="progress-bar"][class*="segment"], [class*="ProgressBarSegment"]');
    const progress = progressEl ? parseFloat(progressEl.style.width) || 0 : 0;
    return {
      title,
      channel: channel.toLowerCase(),
      handles: [...new Set(handles)],
      seconds: duration ? duration.split(':').reduce((sum, part) => sum * 60 + Number(part), 0) : null,
      progress,
      live: Boolean(item.querySelector('[overlay-style="LIVE"], .badge-style-type-live-now-alpha, .badge-style-type-live-now')) || badges.includes('LIVE'),
      upcoming: Boolean(item.querySelector('[overlay-style="UPCOMING"]')) || badges.some((t) => /^(upcoming|premiere)/i.test(t)),
      members: Boolean(item.querySelector('.badge-style-type-members-only')) || badges.some((t) => /members only/i.test(t)),
    };
  };

  const channelMatch = (list, info) =>
    list.some((c) => c === info.channel || info.handles.includes(c.startsWith('@') ? c : `@${c}`));

  const reasonFor = (info) => {
    const f = settings.filters;
    if (channelMatch(matchers.allow, info)) return null;
    if (channelMatch(matchers.channels, info)) return 'channel';
    if (info.title && matchers.keywords.some((match) => match(info.title))) return 'keyword';
    if (f.hideWatched && info.progress >= f.watchedPercent) return 'watched';
    if (info.seconds !== null && f.minMinutes > 0 && info.seconds < f.minMinutes * 60) return 'too short';
    if (info.seconds !== null && f.maxMinutes > 0 && info.seconds > f.maxMinutes * 60) return 'too long';
    if (f.hideLive && info.live) return 'live';
    if (f.hideUpcoming && info.upcoming) return 'upcoming';
    if (f.hideMembers && info.members) return 'members only';
    return null;
  };

  const verdicts = new WeakMap(); // item -> { signature, reason }; YouTube reuses item elements for new videos

  const report = (count) => {
    if (!isTop || count === filteredCount) return;
    filteredCount = count;
    try {
      chrome.runtime.sendMessage({ type: 'yff:count', count }).catch(() => {});
    } catch {
      // Extension reloaded under this page.
    }
  };

  const scan = () => {
    if (!settings) return;
    autoplayOff();
    const enabled = active && filtersOn() && !NO_FILTER_PAGES.has(root.dataset.yffPage);
    if (!enabled) {
      for (const el of document.querySelectorAll('[data-yff-filtered]')) el.removeAttribute('data-yff-filtered');
      report(0);
      return;
    }
    let count = 0;
    for (const item of document.querySelectorAll(ITEMS)) {
      if (item.parentElement?.closest(ITEMS)) continue; // part of an item judged as a whole
      const info = readItem(item);
      const signature = JSON.stringify([filterVersion, info]);
      let verdict = verdicts.get(item);
      if (verdict?.signature !== signature) {
        verdict = { signature, reason: reasonFor(info) };
        verdicts.set(item, verdict);
      }
      if (verdict.reason) {
        count += 1;
        if (item.dataset.yffFiltered !== verdict.reason) item.dataset.yffFiltered = verdict.reason;
      } else if (item.hasAttribute('data-yff-filtered')) {
        item.removeAttribute('data-yff-filtered');
      }
    }
    report(count);
  };

  let scanTimer = 0;
  const scheduleScan = () => {
    if (!scanTimer) scanTimer = setTimeout(() => ((scanTimer = 0), scan()), 150);
  };

  // Changes inside the player (clock, progress bar) don't touch feeds; the Autoplay switch is the exception.
  new MutationObserver((mutations) => {
    for (const m of mutations) {
      const node = m.target.nodeType === Node.ELEMENT_NODE ? m.target : m.target.parentElement;
      if (m.attributeName === 'aria-checked' || (node && !node.closest('.html5-video-player'))) return scheduleScan();
    }
  }).observe(document, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['href', 'title', 'aria-checked', 'overlay-style'],
  });

  // State ------------------------------------------------------------------------------------------------------

  const apply = () => {
    if (!settings) return;
    root.dataset.yffPage = YFF.pageType(location.pathname);
    active = YFF.status(settings, pausedUntil) === 'active';
    root.dataset.yff = active ? YFF.FEATURES.filter((f) => settings.hide[f.id]).map((f) => f.id).join(' ') : '';
    root.toggleAttribute('data-yff-active', active);
    root.dataset.yffFilterMode = settings.filters.mode;
    redirect();
    scheduleScan();
  };

  let pauseTimer = 0;
  const load = async () => {
    [settings, pausedUntil] = await Promise.all([YFFStore.load(), YFFStore.pausedUntil()]);
    matchers = compile(settings.filters);
    filterVersion += 1;
    customStyle.textContent = customCss();
    pushFix();
    clearTimeout(pauseTimer);
    if (pausedUntil > Date.now()) pauseTimer = setTimeout(apply, pausedUntil - Date.now() + 50);
    apply();
  };
  YFFStore.onChange(load);
  load();

  // YouTube navigates without reloading; watch the URL. The schedule is re-checked twice a minute.
  let lastUrl = location.href;
  const onUrlChange = () => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    apply();
  };
  for (const type of ['yt-navigate-finish', 'popstate']) window.addEventListener(type, onUrlChange);
  setInterval(onUrlChange, 250);
  setInterval(() => {
    if (settings && (YFF.status(settings, pausedUntil) === 'active') !== active) apply();
  }, 30000);

  // Messages from the popup, the context menu and shortcuts ----------------------------------------------------

  let contextTarget = null;
  document.addEventListener('contextmenu', (event) => (contextTarget = event.target), true);

  chrome.runtime.onMessage.addListener((message, _sender, reply) => {
    if (message?.type === 'yff:stats') {
      reply({ ...fixStats, filtered: Math.max(filteredCount, 0), page: root.dataset.yffPage });
    } else if (message?.type === 'yff:pick') {
      YFFPicker.start({
        initial: message.fromContext ? contextTarget : null,
        page: root.dataset.yffPage,
        onSave: addCustomRule,
      });
    }
  });
})();
