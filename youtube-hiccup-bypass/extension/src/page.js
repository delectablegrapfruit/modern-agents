// Page-world half. Runs at document_start in YouTube's own JS world, before any of its scripts, so it can wrap
// setTimeout before the player captures it and call the player's API (movie_player.seekTo() and friends are
// page-world expandos an isolated content script cannot see). It has no chrome.* access: settings arrive from
// bridge.js as JSON on a DOM event and stat counts go back the same way.
(() => {
  'use strict';

  const EVENTS = { config: 'ythb:config', ready: 'ythb:ready', stat: 'ythb:stat' };

  // All on until bridge.js has read chrome.storage (a few ms after document_start).
  const settings = { timerBoost: true, adFastForward: true, stallRecovery: true, dismissEnforcement: true };

  // Tunables. Selectors are YouTube's current class names and break when YouTube renames them.
  const PLAYER = '.html5-video-player';
  const TICK_MS = 300;
  const TIMER = {
    // YouTube's player waits on a promise resolved by `setTimeout(() => { …; p.resolve(1) }, 5e3)`; the ad request
    // that normally resolves it first never answers when it is blocked. Same match as uBlock Origin's
    // `nano-stb, resolve(1), *, 0.001` scriptlet, narrowed to delays in this range.
    needles: ['resolve(1)'],
    minDelay: 1000,
    maxDelay: 10000,
    factor: 0.001,
  };
  const AD = {
    classes: ['ad-showing', 'ad-interrupting'],
    rate: 16, // Chrome's maximum playbackRate
    skip: '.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button-slot button',
  };
  const STALL = { afterMs: 4000, maxAttempts: 3, resetAfterMs: 60000 };
  const ENFORCEMENT = {
    message: 'ytd-enforcement-message-view-model',
    dialog: 'tp-yt-paper-dialog',
    backdrop: 'tp-yt-iron-overlay-backdrop',
  };

  const nativeSetTimeout = window.setTimeout;
  const nativeSetInterval = window.setInterval;
  const fnToString = Function.prototype.toString;

  const stat = (name) => document.dispatchEvent(new CustomEvent(EVENTS.stat, { detail: name }));
  const call = (obj, method, ...args) => (typeof obj?.[method] === 'function' ? (obj[method](...args), true) : false);
  const isAdShowing = (player) => AD.classes.some((c) => player.classList.contains(c));

  // 1. Artificial startup delay --------------------------------------------------------------------------------

  const shouldBoost = (fn, delay) => {
    if (typeof fn !== 'function') return false;
    const ms = Number(delay);
    if (!(ms >= TIMER.minDelay && ms <= TIMER.maxDelay)) return false;
    let source;
    try {
      source = fnToString.call(fn);
    } catch {
      return false;
    }
    return TIMER.needles.some((needle) => source.includes(needle));
  };

  // A Proxy keeps setTimeout's identity checks and native-looking toString() intact.
  window.setTimeout = new Proxy(nativeSetTimeout, {
    apply(target, thisArg, args) {
      if (settings.timerBoost && shouldBoost(args[0], args[1])) {
        args[1] = Math.max(1, Math.round(Number(args[1]) * TIMER.factor));
        stat('timersBoosted');
      }
      return Reflect.apply(target, thisArg, args);
    },
  });

  // 2. Ad-slot dead time ---------------------------------------------------------------------------------------
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

  // 3. Stalls --------------------------------------------------------------------------------------------------
  // Playback that is supposed to be running but whose clock has not moved for STALL.afterMs gets a nudge, each
  // one heavier than the last: re-seek in place, pause/play, reload the stream at the same second. At most
  // STALL.maxAttempts per video, refilled after a minute without needing one.

  const stallState = new WeakMap(); // video -> { id, time, stuckSince, attempts, lastAttempt }

  const recover = (player, video, attempt) => {
    const t = video.currentTime;
    if (attempt === 1) {
      if (!call(player, 'seekTo', t, true)) video.currentTime = t;
    } else if (attempt === 2) {
      if (call(player, 'pauseVideo')) nativeSetTimeout(() => call(player, 'playVideo'), 50);
      else {
        video.pause();
        nativeSetTimeout(() => video.play().catch(() => {}), 50);
      }
    } else {
      const id = typeof player.getVideoData === 'function' ? player.getVideoData()?.video_id : null;
      if (id) call(player, 'loadVideoById', id, t);
    }
  };

  const handleStall = (player, video, now) => {
    const id = (typeof player.getVideoData === 'function' && player.getVideoData()?.video_id) || video.currentSrc;
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
    if (now - s.stuckSince < STALL.afterMs || s.attempts >= STALL.maxAttempts) return;
    s.attempts += 1;
    s.lastAttempt = now;
    s.stuckSince = now;
    recover(player, video, s.attempts);
    stat('stallsRecovered');
  };

  // 4. Anti-adblock dialog -------------------------------------------------------------------------------------

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
