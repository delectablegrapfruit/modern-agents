// Page-world half. Runs at document_start in YouTube's own JS world, before any of its scripts, so it can wrap
// fetch, XHR and setTimeout before the player captures them and call the player's API (movie_player.seekTo() and
// friends are page-world expandos an isolated content script cannot see). It has no chrome.* access: settings
// arrive from content.js as JSON on a DOM event and stat counts go back the same way.
(() => {
  'use strict';

  const EVENTS = { config: 'yff:config', ready: 'yff:ready', stat: 'yff:stat' };

  // All on until content.js has read chrome.storage (a few ms after document_start).
  const settings = {
    noAdRequests: true,
    timerBoost: true,
    adFastForward: true,
    stallRecovery: true,
    dismissEnforcement: true,
  };

  // Tunables. Endpoints, fields and selectors are YouTube's current ones and break when YouTube renames them.
  const PLAYER = '.html5-video-player';
  const TICK_MS = 300;
  const NO_AD_PATHS = ['/youtubei/v1/player', '/youtubei/v1/get_watch', '/youtubei/v1/playlist/watch'];
  const TIMER = { needle: 'resolve(1)', delay: 5000, boostedDelay: 5, cooldownMs: 30000 };
  const AD = {
    classes: ['ad-showing', 'ad-interrupting'],
    rate: 16, // Chrome's maximum playbackRate
    skip: '.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button-slot button',
  };
  const STALL = { noFrameMs: 2500, afterMs: 4000, maxAttempts: 3, resetAfterMs: 60000 };
  const ENFORCEMENT = {
    message: 'ytd-enforcement-message-view-model',
    dialog: 'tp-yt-paper-dialog',
    backdrop: 'tp-yt-iron-overlay-backdrop',
  };

  const nativeSetTimeout = window.setTimeout;
  const nativeSetInterval = window.setInterval;
  const fnToString = Function.prototype.toString;

  const log = (...args) => console.info('[Focus & Fix]', ...args);
  const stat = (name) => document.dispatchEvent(new CustomEvent(EVENTS.stat, { detail: name }));
  const call = (obj, method, ...args) => (typeof obj?.[method] === 'function' ? (obj[method](...args), true) : false);
  const isAdShowing = (player) => AD.classes.some((c) => player.classList.contains(c));
  const videoId = (player) => (typeof player.getVideoData === 'function' && player.getVideoData()?.video_id) || null;

  // 1. Server-enforced ad backoff (the spinner that keeps restarting) ------------------------------------------
  // With ads blocked, YouTube's streaming server (SABR) is told to hold media back for ~80% of the skipped ad's
  // length, and the player spins, re-requesting, until that lapses. A player request carrying
  // playbackContext.contentPlaybackContext.isInlinePlaybackNoAd = true comes back with no ads, so no backoff.
  // In-app navigation sends that request from this page and is rewritten here. A watch page opened directly has
  // its player response baked into the HTML; the no-picture reload in section 4 re-requests it.

  const isNoAdTarget = (url) => {
    try {
      return NO_AD_PATHS.includes(new URL(url, location.href).pathname);
    } catch {
      return false;
    }
  };

  // Returns the body with the flag set on every contentPlaybackContext (get_watch nests the player request), or
  // null when there is nothing to change.
  const patchBody = (body) => {
    if (typeof body !== 'string') return null;
    let json;
    try {
      json = JSON.parse(body);
    } catch {
      return null;
    }
    let patched = false;
    const visit = (node, depth) => {
      if (!node || typeof node !== 'object' || depth > 6) return;
      const ctx = node.playbackContext?.contentPlaybackContext;
      if (ctx && typeof ctx === 'object' && ctx.isInlinePlaybackNoAd !== true) {
        ctx.isInlinePlaybackNoAd = true;
        patched = true;
      }
      for (const value of Object.values(node)) visit(value, depth + 1);
    };
    visit(json, 0);
    return patched ? JSON.stringify(json) : null;
  };

  const notePatched = (url) => {
    stat('requestsPatched');
    log('asked for the no-ad stream:', new URL(url, location.href).pathname);
  };

  // Proxies keep identity checks and native-looking toString() intact.
  window.fetch = new Proxy(window.fetch, {
    apply(target, thisArg, args) {
      const [input, init] = args;
      const url = input instanceof Request ? input.url : String(input);
      if (!settings.noAdRequests || !isNoAdTarget(url)) return Reflect.apply(target, thisArg, args);
      if (init?.body !== undefined) {
        const body = patchBody(init.body);
        if (body) {
          args[1] = { ...init, body };
          notePatched(url);
        }
        return Reflect.apply(target, thisArg, args);
      }
      if (input instanceof Request && !input.bodyUsed) {
        return input
          .clone()
          .text()
          .then((text) => {
            const body = patchBody(text);
            if (body) {
              args[0] = new Request(input, { body });
              notePatched(url);
            }
          })
          .catch(() => {})
          .then(() => Reflect.apply(target, thisArg, args));
      }
      return Reflect.apply(target, thisArg, args);
    },
  });

  const xhrUrls = new WeakMap();
  const XHR = XMLHttpRequest.prototype;
  XHR.open = new Proxy(XHR.open, {
    apply(target, xhr, args) {
      xhrUrls.set(xhr, String(args[1]));
      return Reflect.apply(target, xhr, args);
    },
  });
  XHR.send = new Proxy(XHR.send, {
    apply(target, xhr, args) {
      const url = xhrUrls.get(xhr);
      if (settings.noAdRequests && url && isNoAdTarget(url)) {
        const body = patchBody(args[0]);
        if (body) {
          args[0] = body;
          notePatched(url);
        }
      }
      return Reflect.apply(target, xhr, args);
    },
  });

  // 2. Startup gate timer --------------------------------------------------------------------------------------
  // The player has waited on `setTimeout(() => { …; p.resolve(1) }, 5e3)`, which only matters when the ad request
  // meant to resolve it first is blocked. Only that exact timer, and at most once per cooldown: a looser match
  // also hits the player's network retry timers, and shortening those turns a wait into a request storm.

  let lastBoost = -Infinity;

  const shouldBoost = (fn, delay) => {
    if (typeof fn !== 'function' || Number(delay) !== TIMER.delay) return false;
    if (performance.now() - lastBoost < TIMER.cooldownMs) return false;
    try {
      return fnToString.call(fn).includes(TIMER.needle);
    } catch {
      return false;
    }
  };

  window.setTimeout = new Proxy(nativeSetTimeout, {
    apply(target, thisArg, args) {
      if (settings.timerBoost && shouldBoost(args[0], args[1])) {
        lastBoost = performance.now();
        args[1] = TIMER.boostedDelay;
        stat('timersBoosted');
        log('shortened the 5 s startup gate');
      }
      return Reflect.apply(target, thisArg, args);
    },
  });

  // 3. Ad-slot dead time ---------------------------------------------------------------------------------------
  // With ads blocked, the player can still enter its ad state and sit on a black or frozen frame for the ad's
  // length. Run that slot muted at 16× and press Skip when it appears. No seeking to the end: with server-stitched
  // ads the "ad" is part of the video's own timeline and its end is the end of the video.

  const adState = new WeakMap(); // video -> { muted } saved when its ad slot began

  const handleAd = (player) => {
    const video = player.querySelector('video');
    if (!video) return;
    const saved = adState.get(video);
    if (settings.adFastForward && isAdShowing(player)) {
      if (!saved) {
        adState.set(video, { muted: video.muted });
        stat('adsFastForwarded');
        log('fast-forwarding an ad slot');
      }
      video.muted = true;
      if (video.playbackRate !== AD.rate) video.playbackRate = AD.rate;
      player.querySelector(AD.skip)?.click();
    } else if (saved) {
      adState.delete(video);
      video.muted = saved.muted;
      // The player's own rate is the one the viewer picked; the element's may still be ours.
      if (video.playbackRate === AD.rate) {
        const rate = typeof player.getPlaybackRate === 'function' ? Number(player.getPlaybackRate()) : NaN;
        video.playbackRate = rate > 0 && rate < AD.rate ? rate : 1;
      }
    }
  };

  // 4. Stalls --------------------------------------------------------------------------------------------------
  // Playback that should be running but whose clock hasn't moved gets a nudge, each heavier than the last:
  // re-seek in place, pause/play, reload at the same second. With no picture at all yet (the backoff above, on a
  // directly opened page) nudges can't help and a reload can, as it sends a fresh, patched player request: that
  // case reloads once, straight away. At most STALL.maxAttempts per video, refilled after a minute without one.

  const STEPS = ['seek', 'pausePlay', 'reload'];
  const stallState = new WeakMap(); // video -> { id, time, stuckSince, attempts, lastAttempt }

  const recover = (player, video, step) => {
    const t = video.currentTime;
    const id = videoId(player);
    if (step === 'reload' && id && call(player, 'loadVideoById', id, t)) return;
    if (step === 'pausePlay') {
      if (call(player, 'pauseVideo')) nativeSetTimeout(() => call(player, 'playVideo'), 50);
      else {
        video.pause();
        nativeSetTimeout(() => video.play().catch(() => {}), 50);
      }
      return;
    }
    if (!call(player, 'seekTo', t, true)) video.currentTime = t;
  };

  const handleStall = (player, video, now) => {
    const id = videoId(player) || video.currentSrc;
    let s = stallState.get(video);
    if (!s || s.id !== id) {
      s = { id, time: video.currentTime, stuckSince: now, attempts: 0, lastAttempt: 0 };
      stallState.set(video, s);
    }
    const shouldBePlaying = !video.paused && !video.ended && !isAdShowing(player) && navigator.onLine !== false;
    if (!shouldBePlaying || video.currentTime !== s.time) {
      s.time = video.currentTime;
      s.stuckSince = now;
      if (s.attempts && now - s.lastAttempt > STALL.resetAfterMs) s.attempts = 0;
      return;
    }
    const noFrame = video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA;
    if (now - s.stuckSince < (noFrame ? STALL.noFrameMs : STALL.afterMs) || s.attempts >= STALL.maxAttempts) return;
    const step = noFrame && s.attempts === 0 ? 'reload' : STEPS[s.attempts];
    s.attempts = step === 'reload' ? STALL.maxAttempts : s.attempts + 1;
    s.lastAttempt = now;
    s.stuckSince = now;
    recover(player, video, step);
    stat('stallsRecovered');
    log(`stalled ${noFrame ? 'with no picture' : 'mid-video'}, recovering: ${step}`);
  };

  // 5. Anti-adblock dialog -------------------------------------------------------------------------------------

  const dismissEnforcement = () => {
    const message = document.querySelector(ENFORCEMENT.message);
    // YouTube reuses dialogs, so a closed one can still hold the message; only an open one counts.
    if (!message || !message.checkVisibility()) return;
    const dialog = message.closest(ENFORCEMENT.dialog);
    if (!call(dialog, 'close')) {
      (dialog ?? message).remove();
      document.querySelectorAll(ENFORCEMENT.backdrop).forEach((b) => b.remove());
    }
    stat('dialogsDismissed');
    log('closed the anti-adblock dialog');
    // The dialog pauses the video when it opens.
    const video = document.querySelector(`${PLAYER} video`);
    if (video?.paused && !video.ended) video.play().catch(() => {});
  };

  // Loop -------------------------------------------------------------------------------------------------------

  const observed = new WeakSet();

  const tick = () => {
    const now = performance.now();
    for (const player of document.querySelectorAll(PLAYER)) {
      const video = player.querySelector('video');
      if (!video) continue;
      if (!observed.has(player)) {
        // Ad state flips by class; react to it at once instead of on the next tick.
        observed.add(player);
        new MutationObserver(() => handleAd(player)).observe(player, { attributes: true, attributeFilter: ['class'] });
      }
      handleAd(player);
      if (settings.stallRecovery) handleStall(player, video, now);
    }
    if (settings.dismissEnforcement) dismissEnforcement();
  };

  document.addEventListener(EVENTS.config, (event) => {
    let next;
    try {
      next = JSON.parse(event.detail);
    } catch {
      return;
    }
    for (const key of Object.keys(settings)) if (typeof next?.[key] === 'boolean') settings[key] = next[key];
  });
  document.dispatchEvent(new CustomEvent(EVENTS.ready));
  nativeSetInterval(tick, TICK_MS);
})();
