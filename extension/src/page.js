// Page-world half. Runs at document_start in YouTube's own JS world, before any of its scripts, so it can wrap
// fetch, XHR and setTimeout before the player captures them and call the player's API (movie_player.seekTo() and
// friends are page-world expandos an isolated content script cannot see). It has no chrome.* access: settings
// arrive from content.js as JSON on a DOM event and stat counts go back the same way.
(() => {
  'use strict';

  const EVENTS = { config: 'yff:config', ready: 'yff:ready', stat: 'yff:stat' };

  const settings = {
    noAdRequests: true,
    attestationFallback: true,
    timerBoost: true,
    adFastForward: true,
    stallRecovery: true,
    instantRestart: true,
    preemptiveRestart: true,
    dismissEnforcement: true,
  };
  const adopt = (next) => {
    for (const key of Object.keys(settings)) if (typeof next?.[key] === 'boolean') settings[key] = next[key];
  };
  // chrome.storage answers only after YouTube's scripts have started, so content.js also keeps the last settings in
  // this origin's localStorage: read synchronously here, they decide which hooks get installed at all.
  try {
    adopt(JSON.parse(localStorage.getItem('yff:fix')));
  } catch {
    // No storage (sandboxed frame) or nothing saved yet: all on.
  }

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
  const WAA = {
    host: 'jnn-pa.googleapis.com',
    prefix: '/$rpc/google.internal.waa.v1.Waa/',
    alternative: 'https://www.youtube.com/api/jnn/v1/',
  };
  const STALL = { noFrameMs: 2500, afterMs: 4000, maxAttempts: 3, resetAfterMs: 60000 };
  const RESTART = {
    loopAnswers: 2, // stream answers with still no picture that make the loop…
    afterAnswerMs: 800, // …this long after the first of them
    hardMs: 2500, // or no picture at all this long
    earlyMs: 1500, // armed fresh page: at its first stream answer, or this long
    maxPerVideo: 2,
    windowMs: 5 * 60000,
    learnMs: 12 * 3600000,
  };
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

  // 1. Server-enforced ad backoff ------------------------------------------------------------------------------
  // With ads blocked, YouTube's streaming server (SABR) is told to hold media back for ~80% of the skipped ad's
  // length, and the player spins, re-requesting, until that lapses. A player request carrying
  // playbackContext.contentPlaybackContext.isInlinePlaybackNoAd = true comes back with no ads, so no backoff.
  // In-app navigation sends that request from this page and is rewritten here. A watch page opened directly has
  // its player response baked into the HTML; the restart or player reload in section 5 re-requests it.

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

  // 2. Blocked bot check ---------------------------------------------------------------------------------------
  // On IPs YouTube distrusts (VPNs, data centres) the video server sends nothing until the page passes a BotGuard
  // check whose requests go to jnn-pa.googleapis.com. Ad/tracker blockers — in extensions, DNS filters and VPN apps —
  // often block that host; the check fails and the player re-requests the stream forever, a spinner that keeps
  // restarting on a black frame. YouTube answers the same RPCs at www.youtube.com/api/jnn/v1/<method>, so a failed
  // request is retried there, and later ones go there directly.

  let waaRerouted = false;

  const waaAlternative = (url) => {
    try {
      const u = new URL(url, location.href);
      if (u.hostname === WAA.host && u.pathname.startsWith(WAA.prefix)) {
        return WAA.alternative + u.pathname.slice(WAA.prefix.length) + u.search;
      }
    } catch {
      // Not a URL.
    }
    return null;
  };

  const noteRerouted = () => {
    if (waaRerouted) return;
    waaRerouted = true;
    stat('attestationRerouted');
    log(`bot-check request to ${WAA.host} failed (blocked?); sending it through www.youtube.com/api/jnn instead`);
  };

  // The same request aimed at YouTube's copy of the endpoint. A Request's body is read before the first attempt
  // uses it up.
  const reroutedArgs = async ([input, init], alternative) => {
    if (!(input instanceof Request)) return [alternative, init];
    const body = input.method === 'GET' || input.method === 'HEAD' ? undefined : await input.clone().arrayBuffer();
    const request = new Request(alternative, {
      method: input.method,
      headers: input.headers,
      body,
      credentials: input.credentials,
      signal: input.signal,
    });
    return [request, init];
  };

  const fetchAttestation = async (target, thisArg, args, alternative) => {
    const retry = await reroutedArgs(args, alternative);
    if (waaRerouted) return Reflect.apply(target, thisArg, retry);
    try {
      return await Reflect.apply(target, thisArg, args);
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      noteRerouted();
      return Reflect.apply(target, thisArg, retry);
    }
  };

  // Proxies keep identity checks and native-looking toString() intact. With both network fixes off at page load
  // nothing is wrapped, so they can be ruled out completely.
  if (settings.noAdRequests || settings.attestationFallback) {
    window.fetch = new Proxy(window.fetch, {
      apply(target, thisArg, args) {
        const [input, init] = args;
        const url = input instanceof Request ? input.url : String(input);
        const alternative = settings.attestationFallback ? waaAlternative(url) : null;
        if (alternative) return fetchAttestation(target, thisArg, args, alternative);
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
        const alternative = settings.attestationFallback ? waaAlternative(String(args[1])) : null;
        // A failed XHR can't be replayed transparently; it flips later ones to the alternative instead.
        if (alternative && waaRerouted) args[1] = alternative;
        else if (alternative) xhr.addEventListener('error', noteRerouted, { once: true });
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
  }

  // 3. Startup gate timer --------------------------------------------------------------------------------------
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

  if (settings.timerBoost) {
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
  }

  // 4. Ad-slot dead time ---------------------------------------------------------------------------------------
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

  // 5. Stuck on a black frame ---------------------------------------------------------------------------------
  // The VPN case: the spinner keeps restarting on a black frame, nothing inside the page brings it back, and a page
  // reload does. So reload at once (instant restart): when the stream has answered twice with still no picture
  // RESTART.afterAnswerMs after the first answer, or after RESTART.hardMs without a picture. Once that has happened
  // (remembered for RESTART.learnMs), a freshly loaded watch page doesn't wait for it: its first video is restarted
  // at the first stream answer, behind a "Restarting" cover. At most RESTART.maxPerVideo reloads per video per
  // RESTART.windowMs, counted in sessionStorage; past that, or with instant restart off, the nudges take over:
  // re-seek in place, pause/play, reload the video through the player (straight to that with no picture). At most
  // STALL.maxAttempts per video, refilled after a minute without one. Each stuck episode is reported ('stuck' /
  // 'unstuck') for the playback check.

  const STEPS = ['seek', 'pausePlay', 'reload'];
  const stallState = new WeakMap(); // video -> per-video stall state, see handleStall
  let coldStart = true; // no video has been seen yet in this document

  // Answered stream requests (responseEnd), from resource timing: works whether or not fetch is wrapped.
  const streamAnswers = [];
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.name.includes('.googlevideo.com/videoplayback')) continue;
        streamAnswers.push(entry.responseEnd || performance.now());
        if (streamAnswers.length > 100) streamAnswers.shift();
      }
    }).observe({ type: 'resource', buffered: true });
  } catch {
    // No resource timing: only the RESTART.hardMs rule applies.
  }

  // The spinner on a black frame: the element may not have been told to play yet, so ask the player as well.
  const buffering = (player) =>
    (typeof player.getPlayerState === 'function' && player.getPlayerState() === 3) ||
    Boolean(player.querySelector('.ytp-spinner')?.checkVisibility());

  const mainPlayer = (player) =>
    (player.id === 'movie_player' || player.id === 'shorts-player') && /^\/(watch|shorts\/|embed\/)/.test(location.pathname);

  const restartsOf = (id) => {
    try {
      return JSON.parse(sessionStorage.getItem(`yff:restarts:${id}`) || '[]').filter((t) => Date.now() - t < RESTART.windowMs);
    } catch {
      return null; // no storage means no guard against a reload loop, so no restarts
    }
  };

  const loopSeenRecently = () => {
    try {
      return Date.now() - (Number(localStorage.getItem('yff:loop-seen')) || 0) < RESTART.learnMs;
    } catch {
      return false;
    }
  };

  const cover = (player) => {
    if (player.querySelector(':scope > .yff-restart')) return;
    const el = document.createElement('div');
    el.className = 'yff-restart';
    el.textContent = 'Restarting the player…';
    el.style.cssText =
      'position:absolute;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;' +
      'background:#000;color:#eee;font:500 15px/1.4 Roboto,Arial,sans-serif;pointer-events:none';
    player.append(el);
  };

  const restartPage = (player, s, reason) => {
    const times = restartsOf(s.id);
    if (!times || times.length >= RESTART.maxPerVideo || (reason === 'early' && times.length)) return false;
    try {
      sessionStorage.setItem(`yff:restarts:${s.id}`, JSON.stringify([...times, Date.now()]));
      if (reason !== 'early') localStorage.setItem('yff:loop-seen', String(Date.now()));
    } catch {
      return false;
    }
    s.restarting = true;
    cover(player);
    stat('pageReloads');
    log(`no picture (${reason}); reloading the page`);
    location.reload();
    return true;
  };

  // True while the page is being restarted: nothing else to do for this video.
  const instantRestart = (player, s, now) => {
    if (s.restarting) return true;
    if (s.early) cover(player);
    const answers = streamAnswers.filter((t) => t >= s.stuckSince);
    let reason = null;
    if (s.early && (answers.length || now - s.stuckSince >= RESTART.earlyMs)) reason = 'early';
    else if (answers.length >= RESTART.loopAnswers && now - answers[0] >= RESTART.afterAnswerMs) reason = 'loop';
    else if (now - s.stuckSince >= RESTART.hardMs) reason = 'no picture';
    if (!reason) return false;
    if (restartPage(player, s, reason)) return true;
    s.early = false; // guard said no: let the nudges have it
    player.querySelector(':scope > .yff-restart')?.remove();
    return false;
  };

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
    const id = videoId(player);
    let s = stallState.get(video);
    if (!s || s.id !== (id || video.currentSrc)) {
      const restartable = Boolean(id) && settings.instantRestart && mainPlayer(player);
      s = {
        id: id || video.currentSrc,
        time: video.currentTime,
        stuckSince: now,
        attempts: 0,
        lastAttempt: 0,
        reported: false,
        restartable,
        restarting: false,
        early: restartable && coldStart && settings.preemptiveRestart && loopSeenRecently() && restartsOf(id)?.length === 0,
      };
      if (id) coldStart = false;
      stallState.set(video, s);
    }
    const shouldBePlaying =
      !video.ended && !isAdShowing(player) && navigator.onLine !== false && (!video.paused || buffering(player));
    if (!shouldBePlaying || video.currentTime !== s.time) {
      s.time = video.currentTime;
      s.stuckSince = now;
      if (s.reported) {
        s.reported = false;
        stat('unstuck');
      }
      if (s.attempts && now - s.lastAttempt > STALL.resetAfterMs) s.attempts = 0;
      return;
    }
    const noFrame = video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA;
    if (noFrame && s.restartable && settings.instantRestart && instantRestart(player, s, now)) return;
    const stuckFor = now - s.stuckSince;
    if (stuckFor < (noFrame ? STALL.noFrameMs : STALL.afterMs)) return;
    if (!s.reported) {
      s.reported = true;
      stat('stuck');
    }
    if (!settings.stallRecovery || s.attempts >= STALL.maxAttempts) return;
    const step = noFrame && s.attempts === 0 ? 'reload' : STEPS[s.attempts];
    s.attempts = step === 'reload' ? STALL.maxAttempts : s.attempts + 1;
    s.lastAttempt = now;
    s.stuckSince = now;
    recover(player, video, step);
    stat('stallsRecovered');
    log(`stalled ${noFrame ? 'with no picture' : 'mid-video'}, recovering: ${step}`);
  };

  // 6. Anti-adblock dialog -------------------------------------------------------------------------------------

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
      if (settings.stallRecovery || settings.instantRestart) handleStall(player, video, now);
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
    adopt(next);
  });
  document.dispatchEvent(new CustomEvent(EVENTS.ready));
  nativeSetInterval(tick, TICK_MS);
})();
