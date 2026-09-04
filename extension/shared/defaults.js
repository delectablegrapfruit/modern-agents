/* Scroll to Scrub — settings schema shared by every context.
 *
 * Loaded as a classic script by the content script, the popup, the options
 * page and the service worker (via importScripts), so it must not use ES
 * module syntax. Few settings on purpose: defaults carry the load.
 */
(function (root) {
  'use strict';

  const DEFAULTS = Object.freeze({
    /* Master switch. */
    enabled: true,
    /* Scrub rate: seconds of video per 100 px of wheel movement. */
    secondsPer100px: 4,
    /* Scroll right rewinds. */
    invert: false,
    /* Modifier that must be held for scrubbing to happen at all. */
    requireModifier: 'none',
    /* Resume playback shortly after the wheel stops, if it was playing. */
    resumeAfter: true,
    /* Draw the timeline over the video while scrubbing. */
    showTimeline: true,
    /* Hostnames (and their subdomains) where the extension stays inactive.
     * Netflix's player crashes (error M7375) when its video element is
     * seeked directly. */
    disabledSites: ['netflix.com'],
  });

  const MODIFIERS = ['none', 'alt', 'ctrl', 'shift', 'meta'];

  const LIMITS = Object.freeze({
    secondsPer100px: { min: 0.05, max: 60 },
  });

  /* Fixed behaviour, not settings. */
  const FINE_MODIFIER = 'alt'; // 1/10 speed while held
  const FINE_FACTOR = 0.1;

  function clampNumber(value, fallback, { min, max }) {
    const n = typeof value === 'number' ? value : parseFloat(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function pick(value, list, fallback) {
    return list.includes(value) ? value : fallback;
  }

  /* Turn user input ("https://www.YouTube.com/watch", "www.youtube.com/")
   * into a bare lower-case hostname without a leading "www.". Returns ''
   * when nothing usable is left. */
  function normalizeHost(input) {
    let host = String(input == null ? '' : input)
      .trim()
      .toLowerCase();
    if (!host) return '';
    if (/^[a-z][a-z0-9+.-]*:\/\//.test(host)) {
      try {
        host = new URL(host).hostname;
      } catch {
        return '';
      }
    } else {
      host = host.split(/[/?#]/)[0];
      host = host.replace(/^[^@]*@/, ''); // user:pass@
      host = host.startsWith('[') ? host.replace(/^(\[[^\]]*\]):\d+$/, '$1') : host.replace(/:\d+$/, ''); // :port
    }
    host = host.replace(/^\*?\.+/, '').replace(/\.+$/, '');
    if (host.startsWith('www.')) host = host.slice(4);
    if (!host || /[\s/\\]/.test(host)) return '';
    return host;
  }

  /* Does `host` equal `pattern` or live under it as a subdomain? */
  function hostMatches(host, pattern) {
    host = String(host || '').toLowerCase();
    pattern = normalizeHost(pattern);
    if (!host || !pattern) return false;
    if (host.startsWith('www.')) host = host.slice(4);
    return host === pattern || host.endsWith('.' + pattern);
  }

  function normalizeSites(value) {
    const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[\n,]/) : [];
    const out = [];
    for (const item of list) {
      const host = normalizeHost(item);
      if (host && !out.includes(host)) out.push(host);
    }
    return out;
  }

  /* Validate an arbitrary object (partial, stale, or garbage) into a
   * complete settings object; anything missing or invalid falls back to
   * DEFAULTS. Keys from earlier versions are dropped. */
  function normalizeSettings(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const get = (k) => (r[k] === undefined || r[k] === null ? DEFAULTS[k] : r[k]);
    return {
      enabled: Boolean(get('enabled')),
      secondsPer100px: clampNumber(get('secondsPer100px'), DEFAULTS.secondsPer100px, LIMITS.secondsPer100px),
      invert: Boolean(get('invert')),
      requireModifier: pick(get('requireModifier'), MODIFIERS, DEFAULTS.requireModifier),
      resumeAfter: Boolean(get('resumeAfter')),
      showTimeline: r.showTimeline === undefined && r.showHud !== undefined ? Boolean(r.showHud) : Boolean(get('showTimeline')),
      disabledSites: normalizeSites(get('disabledSites')),
    };
  }

  root.ScrollToScrub = Object.freeze({
    DEFAULTS,
    MODIFIERS,
    LIMITS,
    FINE_MODIFIER,
    FINE_FACTOR,
    normalizeSettings,
    normalizeHost,
    hostMatches,
    normalizeSites,
  });
})(globalThis);
