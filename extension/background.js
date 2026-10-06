// Service worker: context menu, keyboard shortcuts, toolbar badge, and the playback check — a per-tab log of the
// requests a video needs (stream, bot check, player), matched against "stuck" reports from page.js to say which
// request fails and who blocks it.
importScripts('src/schema.js', 'src/store.js');

const MENU_ID = 'yff-hide-element';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: 'Hide this element…',
    contexts: ['all'],
    documentUrlPatterns: ['*://*.youtube.com/*'],
  });
});

const pick = (tabId, frameId = 0, fromContext = false) =>
  chrome.tabs.sendMessage(tabId, { type: 'yff:pick', fromContext }, { frameId }).catch(() => {});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID && tab?.id >= 0) pick(tab.id, info.frameId ?? 0, true);
});

// Shortcuts skip the popup's friction, so with a pause delay set, or while locked, they can't switch hiding off.
chrome.commands.onCommand.addListener(async (command, tab) => {
  const settings = await YFFStore.load();
  const mayLoosen = !YFF.locked(settings) && !settings.friction.pauseDelaySec;
  if (command === 'pick-element') {
    tab ??= (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
    if (tab?.id >= 0) pick(tab.id);
  } else if (command === 'toggle-hiding') {
    if (!settings.enabled || mayLoosen) YFFStore.save({ enabled: !settings.enabled });
  } else if (command === 'pause-15' && mayLoosen) {
    YFFStore.setPausedUntil(Date.now() + 15 * 60 * 1000);
  }
});

// Playback check -----------------------------------------------------------------------------------------------

const WATCHED = [
  '*://*.googlevideo.com/videoplayback*',
  '*://jnn-pa.googleapis.com/*',
  '*://www.google.com/js/th/*',
  '*://www.youtube.com/api/jnn/*',
  '*://www.youtube.com/youtubei/v1/att/*',
  '*://www.youtube.com/youtubei/v1/player*',
];
const BLOCKED_BY_EXTENSION = 'net::ERR_BLOCKED_BY_CLIENT';
const IGNORED_ERRORS = new Set(['net::ERR_ABORTED']); // the player cancelling its own requests
const MAX_EVENTS = 300;

// tabId -> { events, count, stuckAt, rerouted, restarts, previous }; lost when the worker sleeps, rebuilt as it goes.
// `previous` is the log of the page before the last load, so a report still shows what led to a restart.
const tabs = new Map();

const freshState = (before) => ({
  events: [],
  count: 0,
  stuckAt: 0,
  rerouted: false,
  restarts: before?.restarts ?? 0,
  previous: before?.events.length ? before.events : (before?.previous ?? []),
});

const tabState = (tabId) => {
  let state = tabs.get(tabId);
  if (!state) tabs.set(tabId, (state = freshState()));
  return state;
};

const kindOf = (url) => {
  if (url.hostname.endsWith('.googlevideo.com')) return 'media';
  if (url.pathname.startsWith('/youtubei/v1/player')) return 'player';
  return 'attest';
};

const unique = (list) => [...new Set(list)];

const diagnose = (tabId) => {
  const state = tabs.get(tabId) ?? { events: [], stuckAt: 0, rerouted: false };
  const now = Date.now();
  const of = (kind, since = 0) => state.events.filter((e) => e.kind === kind && e.t >= since);
  const failed = (list, test) => list.filter((e) => e.error && !IGNORED_ERRORS.has(e.error) && test(e.error));

  const attest = of('attest');
  const media = of('media', now - 60000);
  const rerouteOk = attest.some((e) => e.path.startsWith('/api/jnn/') && e.status >= 200 && e.status < 300);
  const rescued = state.rerouted && rerouteOk;
  const findings = [];

  const attestBlocked = failed(attest, (error) => error === BLOCKED_BY_EXTENSION);
  if (attestBlocked.length) {
    findings.push({ id: 'attest-extension', level: rescued ? 'info' : 'error', hosts: unique(attestBlocked.map((e) => e.host)) });
  }
  const attestNetwork = failed(attest, (error) => error !== BLOCKED_BY_EXTENSION);
  if (attestNetwork.length) {
    findings.push({
      id: 'attest-network',
      level: rescued ? 'info' : 'error',
      hosts: unique(attestNetwork.map((e) => e.host)),
      error: attestNetwork.at(-1).error,
    });
  }
  const attestHttp = attest.filter((e) => e.status >= 400);
  if (attestHttp.length) findings.push({ id: 'attest-http', level: 'error', status: attestHttp.at(-1).status, host: attestHttp.at(-1).host });
  if (state.rerouted) findings.push({ id: 'attest-rerouted', level: rerouteOk ? 'info' : 'error' });

  const media403 = media.filter((e) => e.status === 403).length;
  if (media403) findings.push({ id: 'media-403', level: 'error', count: media403 });
  const mediaBlocked = failed(media, (error) => error === BLOCKED_BY_EXTENSION).length;
  if (mediaBlocked) findings.push({ id: 'media-extension', level: 'error', count: mediaBlocked });
  const mediaNetwork = failed(media, (error) => error !== BLOCKED_BY_EXTENSION);
  if (mediaNetwork.length) {
    findings.push({ id: 'media-network', level: 'error', count: mediaNetwork.length, error: mediaNetwork.at(-1).error });
  }

  const stuck = Boolean(state.stuckAt);
  const rate = of('media', now - 10000).length;
  if (stuck && !findings.some((f) => f.level === 'error')) findings.push({ id: rate >= 5 ? 'media-loop' : 'stuck', level: 'warn', rate });
  if (state.restarts) findings.push({ id: 'restarted', level: 'info', count: state.restarts });

  return { stuck, findings, counts: { media: media.length, attest: attest.length, player: of('player').length } };
};

// What the popup's "Copy report" puts on the clipboard: no query strings (they carry signed stream URLs).
const report = (tabId) => {
  const now = Date.now();
  const state = tabs.get(tabId);
  const list = (events = []) =>
    events.slice(-100).map((e) => ({
      secondsAgo: Math.round((now - e.t) / 1000),
      kind: e.kind,
      host: e.host,
      path: e.path,
      ...(e.status ? { status: e.status } : {}),
      ...(e.error ? { error: e.error } : {}),
    }));
  return {
    extension: chrome.runtime.getManifest().version,
    browser: navigator.userAgent,
    at: new Date(now).toISOString(),
    ...diagnose(tabId),
    restarts: state?.restarts ?? 0,
    events: list(state?.events),
    previousPage: list(state?.previous),
  };
};

// The badge shows filtered videos; it turns into a red "!" while a stuck player has something to explain.
const paintBadge = (tabId) => {
  const state = tabState(tabId);
  const alert = state.stuckAt > 0 && diagnose(tabId).findings.some((f) => f.level !== 'info');
  chrome.action.setBadgeBackgroundColor({ tabId, color: alert ? '#d93025' : '#606060' }).catch(() => {});
  chrome.action.setBadgeText({ tabId, text: alert ? '!' : state.count ? String(state.count) : '' }).catch(() => {});
};

const record = (details, outcome) => {
  if (details.tabId < 0) return;
  const url = new URL(details.url);
  const state = tabState(details.tabId);
  state.events.push({ t: Date.now(), kind: kindOf(url), host: url.hostname, path: url.pathname, ...outcome });
  if (state.events.length > MAX_EVENTS) state.events.splice(0, state.events.length - MAX_EVENTS);
  if (state.stuckAt) paintBadge(details.tabId);
};

chrome.webRequest.onCompleted.addListener((d) => record(d, { status: d.statusCode }), { urls: WATCHED });
chrome.webRequest.onErrorOccurred.addListener((d) => record(d, { error: d.error }), { urls: WATCHED });
// A new YouTube page starts a new log.
chrome.webRequest.onBeforeRequest.addListener(
  (d) => {
    if (d.tabId >= 0) tabs.set(d.tabId, freshState(tabs.get(d.tabId)));
  },
  { urls: ['*://*.youtube.com/*'], types: ['main_frame'] },
);
chrome.tabs.onRemoved.addListener((tabId) => tabs.delete(tabId));

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  const tabId = sender.tab?.id;
  if (message?.type === 'yff:count' && tabId >= 0) {
    tabState(tabId).count = message.count;
    paintBadge(tabId);
  } else if (message?.type === 'yff:playback' && tabId >= 0) {
    const state = tabState(tabId);
    if (message.event === 'stuck') state.stuckAt = Date.now();
    else if (message.event === 'unstuck') state.stuckAt = 0;
    else if (message.event === 'attestationRerouted') state.rerouted = true;
    else if (message.event === 'pageReloads') state.restarts += 1;
    paintBadge(tabId);
  } else if (message?.type === 'yff:diagnose') {
    reply(diagnose(message.tabId));
  } else if (message?.type === 'yff:report') {
    reply(report(message.tabId));
  }
});
