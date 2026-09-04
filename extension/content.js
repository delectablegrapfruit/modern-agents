/* Scroll to Scrub — content script.
 *
 * Runs in every frame at document_start. While the pointer hovers over a
 * <video>, a sideways wheel / trackpad gesture seeks the video instead of
 * scrolling the page. Every bit of wheel movement moves the video, playback
 * is held paused for as long as the pointer stays on the video, and seeks
 * are handed to the media element as fast as it can show frames without
 * ever queueing up behind the wheel.
 */
(() => {
  'use strict';

  const api = globalThis.ScrollToScrub;
  if (!api || globalThis.__scrollToScrubInstalled) return;
  globalThis.__scrollToScrubInstalled = true;

  const { DEFAULTS, FINE_MODIFIER, FINE_FACTOR, normalizeSettings, hostMatches } = api;

  const MODIFIER_PROP = { alt: 'altKey', ctrl: 'ctrlKey', shift: 'shiftKey', meta: 'metaKey' };
  const MODIFIER_KEYS = new Set(['Alt', 'AltGraph', 'Control', 'Shift', 'Meta', 'Fn', 'CapsLock']);

  /* ---- Tunables ------------------------------------------------------ */

  /* Wheel movement is classified on a sliding window of recent events, not
   * on single events: trackpads and high-resolution wheels report a pixel or
   * two of cross-axis noise on every event, and the first event of a swipe
   * is the noisiest. A gap longer than the window starts a new gesture. */
  const WINDOW_MS = 150;
  /* An event is decisive for an axis when its movement along that axis is
   * this many times the other axis. A decisive event switches between
   * scrubbing and page scrolling when it is big enough (SWITCH_PX) or when
   * the previous event was decisive too; window totals settle the rest. */
  const RATIO = 2;
  const SWITCH_PX = 8;
  /* During a scrub, cross-axis movement below this is trackpad noise, never
   * a turn towards page scrolling (a mouse-wheel notch is >= 4 px even on
   * macOS at its slowest, 100-120 px on Windows and Linux). */
  const NOISE_PX = 3;
  /* A fresh gesture whose first event is this lopsided towards the page
   * axis is a page scroll straight away, without buffering. */
  const STRONG_RATIO = 4;
  /* Ambiguous input over a video is buffered (and cancelled, so the page
   * does not twitch) up to this much movement or this many events before
   * the gesture commits to an axis. Nothing is lost: buffered movement is
   * applied in full once the gesture turns out to be a scrub. */
  const DECIDE_PX = 6;
  const DECIDE_EVENTS = 4;
  /* Distance per movement.
   *
   * The set speed (seconds per 100 px) is the base: at the default, a small
   * slow nudge of a few pixels moves tenths of a second and a long quick
   * flick about a second. No single wheel event moves more than STEP_MAX_S
   * (beyond it only STEP_OVER of the excess counts), so a flick never jumps
   * much more than a second.
   *
   * Velocity adds a very minor percentage at high speeds only: nothing up
   * to V_BOOST_START px/s, BOOST_MAX (as a fraction) at V_BOOST_FULL px/s and
   * above, a smooth ramp between.
   *
   * Gross scrubbing comes from persistence: scrolling kept up in one
   * direction, in quick succession (gaps under STREAK_GAP_MS), for
   * SUSTAIN_START_MS ramps the rate (and the per-event cap) up to SUSTAIN_MAX
   * times by SUSTAIN_FULL_MS. A pause or a reversal (you reverse when you
   * overshoot, which is when you want fine control) resets it. */
  const STEP_MAX_S = 1;
  const STEP_OVER = 0.1;
  const V_BOOST_START = 1500;
  const V_BOOST_FULL = 8000;
  const BOOST_MAX = 0.2;
  const STREAK_GAP_MS = 350;
  const SUSTAIN_START_MS = 3000;
  const SUSTAIN_FULL_MS = 6000;
  const SUSTAIN_MAX = 4;
  const FRAME_MS = 16.7; // one frame: the time a single event is taken to span
  /* Seek scheduling. The first seek of a burst is issued immediately. While
   * a seek is in flight the newest target is held back until `seeked`, so
   * every seek the decoder finishes is a frame on screen (a superseded seek
   * never shows its frame), and intermediate targets are dropped rather
   * than queued. If `seeked` does not arrive within the stall cap (an
   * unbuffered range, a player swallowing events) the newest target is
   * issued anyway. Firing the cap on a seek that is merely slow throws its
   * decode work away, so it adapts to the seek latency actually observed:
   * three times the recent maximum (in-gesture latencies spread 5-6x from
   * median to max), within these bounds. */
  const SEEK_CAP_MIN_MS = 250;
  const SEEK_CAP_MAX_MS = 1500;
  const SEEK_CAP_FACTOR = 3;
  const SEEK_LATENCY_DECAY = 0.9; // per completed seek, for the recent maximum
  /* A session ends (and playback resumes, if it was playing) this long
   * after the wheel stops, or as soon as the pointer leaves the video. */
  const RESUME_IDLE_MS = 600;
  /* When a session ends, wait at most this long for the last seek to land
   * before resuming playback. */
  const FINAL_SEEK_WAIT_MS = 1500;
  /* After the gesture the timeline keeps following playback for HOLD, then
   * fades over FADE. */
  const TIMELINE_HOLD_MS = 1200;
  const TIMELINE_FADE_MS = 500;
  /* Playback must stay paused during a session; a site that restarts it is
   * paused again, at most this often. A site that keeps restarting it is
   * held with playbackRate 0 instead (a pause war leaks about half of real
   * time; rate 0 leaks nothing and still seeks). */
  const REPAUSE_INTERVAL_MS = 25;
  const RATE_HOLD_AFTER = 2; // re-plays before switching to the rate hold
  const RATE_REASSERT_LIMIT = 3; // give the hold up after this many fights over playbackRate
  /* Seeking exactly to the end of a media-source (blob:) or live seekable
   * range leaves the element stuck in `seeking`; stay this far away. */
  const EDGE_MARGIN_MSE_S = 0.5;
  const EDGE_MARGIN_LIVE_S = 1;
  /* In the 'look' state (sideways input with no video under the pointer)
   * re-run the hit test at most this often. */
  const LOOK_INTERVAL_MS = 40;
  /* Press and hold on a playing video to play it at HOLD_RATE until release
   * (YouTube's own feature; skipped on YouTube, which has it natively). A
   * press that moves more than HOLD_SLOP_PX before the delay is a drag. */
  const HOLD_MS = 500;
  const HOLD_RATE = 2;
  const HOLD_SLOP_PX = 8;
  const HOLD_EXCLUDED = ['youtube.com', 'youtube-nocookie.com', 'youtu.be'];
  const HUD_LINGER_MS = 600;
  const LINE_PX = 16; // deltaMode === DOM_DELTA_LINE
  const PAGE_PX = 800; // deltaMode === DOM_DELTA_PAGE
  const MAX_SHADOW_DEPTH = 8;
  const MAX_STACK = 200;

  let settings = normalizeSettings(DEFAULTS);
  let siteDisabled = false;
  let session = null; // active scrub, see beginSession()
  let undo = null; // where the video was before the last scrub, see performUndo()
  let hold = null; // press-and-hold in progress, see onHoldStart()
  let suppressClick = 0; // timer: the one click a hold's release generates is swallowed
  let armed = false; // the wheel listener is blocking (non-passive), see setArmed()
  let blocking = false; // the event being handled came through the blocking registration
  let lastX = NaN; // last known pointer position
  let lastY = NaN;

  /* Gesture classification state, see onWheel(). */
  const recent = []; // { t, s, o } (signed) for events within WINDOW_MS
  let mode = 'idle'; // 'idle' | 'scrub' | 'page' | 'look' | 'hold' | 'undecided'
  let modeVideo = null; // video for 'hold' / 'undecided'
  let bufS = 0; // movement buffered while 'undecided'
  let bufN = 0;
  let bufT0 = 0;
  let streakStart = 0; // continuous same-direction scrolling, see sustainGain()
  let streakLast = 0;
  let streakSign = 0;
  let lookAt = 0; // timestamp, position and modifier state of the last hit test in 'look'
  let lookX = NaN;
  let lookY = NaN;
  let lookMod = false;

  /* ---- Settings ------------------------------------------------------ */

  function frameHosts() {
    const hosts = [];
    try {
      if (location.hostname) hosts.push(location.hostname);
    } catch {
      /* opaque origin */
    }
    try {
      // A player embedded from another origin (youtube.com inside
      // example.com) honours the top-level site's opt-out too.
      const ancestors = location.ancestorOrigins || [];
      for (let i = 0; i < ancestors.length; i++) {
        try {
          hosts.push(new URL(ancestors[i]).hostname);
        } catch {
          /* "null" origin */
        }
      }
    } catch {
      /* not supported */
    }
    return hosts;
  }

  function active() {
    return settings.enabled && !siteDisabled;
  }

  /* After an extension update or reload the old content script keeps its
   * DOM listeners but loses its chrome.* context. Detect that and step aside
   * so the new instance (or nothing) takes over. */
  function alive() {
    try {
      return !!(chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  }

  function teardown() {
    cancelHold();
    if (session) endSession(session, true);
    window.removeEventListener('wheel', onWheel, true);
    window.removeEventListener('mouseover', onHover, true);
    window.removeEventListener('mouseout', onPointerLeftWindow, true);
    window.removeEventListener('mousemove', onHover, true);
    window.removeEventListener('pointerdown', onHoldStart, true);
    window.removeEventListener('pointermove', onHoldMove, true);
    window.removeEventListener('pointerup', onHoldEnd, true);
    window.removeEventListener('pointercancel', onHoldEnd, true);
    window.removeEventListener('click', onClickCapture, true);
    armed = false;
    timeline.hide();
  }

  function applySettings(next) {
    settings = normalizeSettings(next);
    const hosts = frameHosts();
    siteDisabled = settings.disabledSites.some((pattern) => hosts.some((h) => hostMatches(h, pattern)));
    if (!active()) {
      if (session) endSession(session, true);
      cancelHold();
      setArmed(false);
    } else if (Number.isFinite(lastX)) {
      setArmed(!!findVideoAt(lastX, lastY, true));
    }
  }

  function loadSettings() {
    try {
      chrome.storage.sync.get(DEFAULTS, (stored) => {
        applySettings(chrome.runtime.lastError ? {} : stored);
      });
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'sync') return;
        const next = { ...settings };
        for (const key of Object.keys(changes)) next[key] = changes[key].newValue;
        applySettings(next);
      });
    } catch {
      /* Extension context unavailable (e.g. invalidated after an update):
       * keep the defaults. */
    }
  }

  /* ---- Finding the video under the pointer --------------------------- */

  function isVideo(node) {
    return (
      !!node &&
      node.nodeType === 1 &&
      node.localName === 'video' &&
      node.namespaceURI === 'http://www.w3.org/1999/xhtml'
    );
  }

  function rectContains(rect, x, y) {
    return rect.width > 0 && rect.height > 0 && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function videoContains(video, x, y) {
    try {
      return rectContains(video.getBoundingClientRect(), x, y);
    } catch {
      return false;
    }
  }

  function isVisible(el) {
    try {
      if (typeof el.checkVisibility === 'function') {
        return el.checkVisibility({ visibilityProperty: true, contentVisibilityAuto: true });
      }
      return el.getClientRects().length > 0;
    } catch {
      return true;
    }
  }

  /* [start, end] of the seekable timeline, or null when the media cannot be
   * seeked (no metadata yet, live stream without a DVR window, ...). */
  function seekRange(video) {
    let start = 0;
    let end = NaN;
    try {
      const s = video.seekable;
      if (s && s.length) {
        start = s.start(0);
        end = s.end(s.length - 1);
      }
      if (!Number.isFinite(end)) {
        const d = video.duration;
        if (Number.isFinite(d) && d > 0) end = d;
      }
    } catch {
      return null;
    }
    if (!Number.isFinite(end) || !Number.isFinite(start) || end <= start) return null;
    return [start, end];
  }

  /* The range a scrub may target: the seekable range, minus a safety margin
   * at the live / buffered edge of streaming players. */
  function scrubRange(video) {
    const range = seekRange(video);
    if (!range) return null;
    let margin = 0;
    try {
      if (video.duration === Infinity) margin = EDGE_MARGIN_LIVE_S;
      else if (video.srcObject || /^blob:/i.test(video.currentSrc || '')) margin = EDGE_MARGIN_MSE_S;
    } catch {
      /* ignore */
    }
    if (margin && range[1] - margin > range[0]) range[1] -= margin;
    return range;
  }

  /* Open shadow root, or a closed one where the extension API allows it. */
  function shadowRootOf(el) {
    if (el.shadowRoot) return el.shadowRoot;
    try {
      if (chrome.dom && typeof chrome.dom.openOrClosedShadowRoot === 'function') {
        return chrome.dom.openOrClosedShadowRoot(el) || null;
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  /* All elements under (x, y), top-most first, descending into shadow roots
   * so players built from web components are found too. Also returns the
   * shadow roots met on the way. */
  function deepElementsFromPoint(x, y) {
    const stack = [];
    const roots = [];
    const seen = new Set();

    const collect = (root, depth) => {
      let list;
      try {
        list = root.elementsFromPoint(x, y);
      } catch {
        return;
      }
      for (const el of list) {
        if (seen.has(el)) continue;
        seen.add(el);
        // Shadow contents paint above their host, so list them first.
        const sr = depth < MAX_SHADOW_DEPTH ? shadowRootOf(el) : null;
        if (sr) {
          roots.push(sr);
          collect(sr, depth + 1);
        }
        stack.push(el);
        if (stack.length >= MAX_STACK) return;
      }
    };

    collect(document, 0);
    return { stack, roots };
  }

  /* The videos under (x, y): `ready` is the top-most seekable one, `any`
   * the top-most visible one (seekable or not). */
  function locateVideo(x, y) {
    const { stack, roots } = deepElementsFromPoint(x, y);
    const found = { ready: null, any: null };
    // Top-most visible video wins. If it cannot be seeked yet but does have
    // media (a pre-roll or the next clip loading), hold on it rather than
    // scrubbing whatever lies underneath.
    const take = (v) => {
      if (!found.any) found.any = v;
      if (seekRange(v)) {
        found.ready = v;
        return true;
      }
      return hasMedia(v);
    };

    // 1. A hit-testable video somewhere under the pointer, even beneath the
    //    player's control overlays.
    for (const el of stack) {
      if (isVideo(el) && isVisible(el) && take(el)) return found;
    }

    // 2. Players that set `pointer-events: none` on the video itself never
    //    appear in the hit-test stack: look for videos whose box contains
    //    the point, in the document and in the shadow roots met above. If
    //    several do (an ad stacked over the content), prefer the one whose
    //    ancestor is top-most in the stack.
    const candidates = [];
    roots.push(document);
    for (const root of roots) {
      let videos;
      try {
        videos = root.querySelectorAll('video');
      } catch {
        continue;
      }
      for (const v of videos) {
        if (videoContains(v, x, y) && isVisible(v) && !candidates.includes(v)) candidates.push(v);
      }
    }
    if (candidates.length > 1) {
      candidates.sort((a, b) => depthIn(stack, a) - depthIn(stack, b));
    }
    for (const v of candidates) {
      if (take(v)) break;
    }
    return found;
  }

  function hasMedia(v) {
    try {
      return !!(v.currentSrc || v.srcObject || v.getAttribute('src') || v.querySelector('source'));
    } catch {
      return false;
    }
  }

  /* Index of the first hit-test stack entry containing `v` (lower = nearer
   * the top). */
  function depthIn(stack, v) {
    for (let i = 0; i < stack.length; i++) {
      const el = stack[i];
      try {
        if (el.contains(v) || (el.shadowRoot && el.shadowRoot.contains(v))) return i;
      } catch {
        /* ignore */
      }
    }
    return stack.length;
  }

  function findVideoAt(x, y, loose = false) {
    const found = locateVideo(x, y);
    return loose ? found.any : found.ready;
  }

  /* ---- Wheel handling ------------------------------------------------ */

  /* Wheel movement in CSS pixels, split into the component that scrubs and
   * the component that would scroll the page. */
  function readDelta(e) {
    let dx = e.deltaX;
    let dy = e.deltaY;
    if (e.deltaMode === 1) {
      dx *= LINE_PX;
      dy *= LINE_PX;
    } else if (e.deltaMode === 2) {
      dx *= PAGE_PX;
      dy *= PAGE_PX;
    }
    if (!Number.isFinite(dx)) dx = 0;
    if (!Number.isFinite(dy)) dy = 0;

    // Mouse users scroll sideways with Shift + wheel. The DOM event keeps
    // deltaY (with shiftKey set); the browser only swaps the axis for the
    // scroll it would perform.
    if (e.shiftKey && dx === 0 && dy !== 0) return { s: dy, o: 0 };
    return { s: dx, o: dy };
  }

  function hasModifier(e, name) {
    const prop = MODIFIER_PROP[name];
    return !!prop && !!e[prop];
  }

  function consume(e) {
    // preventDefault from a passive listener is a no-op that logs a warning;
    // only an event delivered through the blocking registration may cancel.
    if (blocking && e.cancelable) e.preventDefault();
    e.stopImmediatePropagation();
  }

  /* The wheel listener is blocking (non-passive) only while the pointer is
   * over a video or a scrub is under way. A blocking wheel listener on
   * window forces every scroll on the page through the main thread; a
   * passive one lets Chromium keep scrolling on the compositor, so pages
   * without a video under the pointer scroll exactly as they would without
   * the extension. Hover is tracked with `mouseover` (boundary crossings),
   * which fires before the first wheel event of a gesture; the passive
   * registration is a safety net that still scrubs (and arms) if a wheel
   * event arrives over a video before any hover was seen. */
  function setArmed(on) {
    if (armed === on) return;
    armed = on;
    window.removeEventListener('wheel', onWheel, true);
    window.addEventListener('wheel', onWheel, { capture: true, passive: !on });
  }

  function onHover(e) {
    if (!e.isTrusted) return;
    if (!alive()) return teardown();
    lastX = e.clientX;
    lastY = e.clientY;
    if (!active()) return;
    if (session) {
      if (!session.video.isConnected || !videoContains(session.video, lastX, lastY)) endSession(session, true);
      return;
    }
    setArmed(!!findVideoAt(lastX, lastY, true));
  }

  function onPointerLeftWindow(e) {
    if (e.relatedTarget !== null) return;
    if (session) endSession(session, true);
    else setArmed(false);
  }

  /* Sliding-window totals of movement along the scrub axis and the other
   * axis. Returns false when the gap since the previous event ended the
   * gesture. */
  function updateWindow(now, s, o) {
    const last = recent.length ? recent[recent.length - 1].t : -Infinity;
    const continuous = now - last <= WINDOW_MS;
    while (recent.length && now - recent[0].t > WINDOW_MS) recent.shift();
    recent.push({ t: now, s, o });
    return continuous;
  }

  function windowTotals() {
    let ws = 0;
    let wo = 0;
    for (const r of recent) {
      ws += Math.abs(r.s);
      wo += Math.abs(r.o);
    }
    return { ws, wo };
  }

  const towardsScrub = (r) => r.s !== 0 && Math.abs(r.s) >= RATIO * Math.abs(r.o);
  const towardsPage = (r) => r.o !== 0 && Math.abs(r.o) >= RATIO * Math.abs(r.s);

  /* Does the current event (with the one before it) turn the gesture onto
   * the scrub axis / the page axis? Pure single-axis input is unambiguous
   * and switches at once (a thumb wheel after a mouse-wheel notch, a wheel
   * notch during a thumb-wheel scrub); mixed input needs to be big or
   * repeated, so trackpad noise never flips the gesture. */
  function turnsToScrub() {
    const cur = recent[recent.length - 1];
    const prev = recent.length > 1 ? recent[recent.length - 2] : null;
    if (cur.o === 0) return cur.s !== 0;
    return towardsScrub(cur) && (Math.abs(cur.s) >= SWITCH_PX || (prev && towardsScrub(prev)));
  }

  function turnsToPage() {
    const cur = recent[recent.length - 1];
    const prev = recent.length > 1 ? recent[recent.length - 2] : null;
    if (Math.abs(cur.o) < NOISE_PX) return false;
    if (cur.s === 0) return true;
    return towardsPage(cur) && (Math.abs(cur.o) >= SWITCH_PX || (prev && towardsPage(prev)));
  }

  function onWheel(e) {
    if (!e.isTrusted) return;
    if (!alive()) return teardown();
    if (!active()) return;
    blocking = armed;

    const now = e.timeStamp;
    const d = readDelta(e);
    const s = d.s;
    const o = d.o;
    if (s === 0 && o === 0) {
      // A trackpad sequence can begin with a zero-delta event. Cancelling it
      // while over a video (that is what `blocking` means) keeps the rest of
      // the sequence cancelable, and cancels nothing that could scroll.
      if (blocking && e.cancelable) e.preventDefault();
      return;
    }
    const x = e.clientX;
    const y = e.clientY;
    lastX = x;
    lastY = y;

    if (!updateWindow(now, s, o)) resetMode();
    const { ws, wo } = windowTotals();

    switch (mode) {
      case 'scrub': {
        // Consume everything, including the cross-axis noise of a trackpad
        // swipe, while the pointer stays on the video and the window keeps
        // pointing along the scrub axis. A clear turn to the other axis (a
        // vertical wheel notch during a thumb-wheel scrub) hands the events
        // back to the page; the session itself stays alive.
        if (!session || !session.video.isConnected || !videoContains(session.video, x, y)) {
          resetMode();
          break;
        }
        if (turnsToPage()) {
          mode = 'page';
          return;
        }
        consume(e);
        scrub(e, s, eventSpacing(now));
        return;
      }
      case 'page': {
        // The page is scrolling. If it carried the video away from under
        // the pointer, the session is over. Switch back to scrubbing as soon
        // as the input clearly turns along the scrub axis.
        if (session && (!session.video.isConnected || !videoContains(session.video, x, y))) endSession(session, true);
        if (!turnsToScrub()) return;
        resetMode();
        break;
      }
      case 'look': {
        // Sideways input with no video under the pointer (or without the
        // required modifier): keep looking, but for a pointer that has not
        // moved (and no new hover, no modifier change) not on every event.
        if (ws < wo) return;
        const modNow = settings.requireModifier === 'none' || hasModifier(e, settings.requireModifier);
        const unchanged = x === lookX && y === lookY && modNow === lookMod && !blocking;
        if (unchanged && now - lookAt < LOOK_INTERVAL_MS) return;
        resetMode();
        break;
      }
      case 'hold': {
        // Over a video that cannot be seeked yet (no metadata, live stream
        // without a DVR window): sideways input goes nowhere, so the page
        // must not scroll either. Start scrubbing the moment it can.
        if (!modeVideo.isConnected || !videoContains(modeVideo, x, y)) {
          resetMode();
          break;
        }
        if (turnsToPage()) {
          mode = 'page';
          return;
        }
        consume(e);
        if (seekRange(modeVideo)) {
          const video = modeVideo;
          mode = 'scrub';
          beginSession(video);
          scrub(e, s, eventSpacing(now));
        }
        return;
      }
      case 'undecided': {
        consume(e);
        bufS += s;
        bufN += 1;
        if (ws >= RATIO * wo || wo >= RATIO * ws || ws + wo >= DECIDE_PX || bufN >= DECIDE_EVENTS) {
          const video = modeVideo;
          const total = bufS;
          if (ws >= wo && video.isConnected) {
            mode = 'scrub';
            beginSession(video);
            scrub(e, total, bufN > 1 ? Math.max(now - bufT0, FRAME_MS) : NaN);
          } else {
            mode = 'page';
          }
        }
        return;
      }
      default:
        break;
    }

    // A fresh decision.
    if (s === 0 || Math.abs(o) >= STRONG_RATIO * Math.abs(s)) {
      // Purely (or overwhelmingly) along the page axis: a mouse wheel notch.
      mode = 'page';
      return;
    }
    if (settings.requireModifier !== 'none' && !hasModifier(e, settings.requireModifier)) {
      look(now, x, y, false);
      return;
    }
    if (e.ctrlKey && settings.requireModifier !== 'ctrl') {
      // Ctrl+wheel is browser zoom (and trackpad pinch); leave it alone.
      mode = 'page';
      return;
    }
    const found = locateVideo(x, y);
    const video = found.ready;
    if (!video) {
      if (found.any) {
        setArmed(true);
        modeVideo = found.any;
        mode = 'hold';
        consume(e);
        return;
      }
      look(now, x, y, true);
      return;
    }
    setArmed(true);
    if (o !== 0 && !towardsScrub(recent[recent.length - 1])) {
      // Diagonal input over a video: cancel it (so the page does not twitch)
      // and decide a few pixels later, applying everything buffered.
      modeVideo = video;
      bufS = s;
      bufN = 1;
      bufT0 = now;
      mode = 'undecided';
      consume(e);
      return;
    }
    mode = 'scrub';
    consume(e);
    beginSession(video);
    scrub(e, s, eventSpacing(now));
  }

  function look(now, x, y, mod) {
    mode = 'look';
    lookAt = now;
    lookX = x;
    lookY = y;
    lookMod = mod;
  }

  function resetMode() {
    mode = 'idle';
    modeVideo = null;
    bufS = 0;
    bufN = 0;
  }

  /* ---- Scrub sessions ------------------------------------------------ */

  /* A session lasts from the first scrub on a video until the pointer leaves
   * it, the user interacts some other way (click, key), or the page goes
   * away; not until some timer runs out. While it lasts the video stays
   * paused, so a frame the user stopped on stays on screen. */
  function beginSession(video) {
    if (session && session.video === video) {
      const cur = session;
      if (cur.ending) {
        // Caught it winding down (the idle timer just fired): revive.
        cur.ending = false;
        clearTimeout(cur.finalTimer);
        cur.finalTimer = 0;
      }
      return;
    }
    if (session) endSession(session, true);

    const pos = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    // Remember where the video was, so an accidental scrub can be undone.
    undo = { video, time: pos, wasPlaying: !video.paused && !video.ended, at: performance.now() };
    const s = {
      video,
      pos, // logical position, tracks the wheel exactly
      target: pos, // last position handed to the video
      resume: false,
      lastRepause: 0,
      repauseTimer: 0,
      replays: 0, // times the site restarted playback during the session
      heldRate: NaN, // playbackRate before we set it to 0 (NaN = not held)
      rateFights: 0, // times something set the rate back while held
      rateHoldFailed: false,
      onRateChange: null,
      finalTimer: 0,
      stallTimer: 0,
      idleTimer: 0,
      ending: false,
      done: false,
      inFlight: false, // a seek we issued has not fired `seeked` yet
      issuedAt: 0,
      latency: 0, // recent maximum of set -> seeked, ms, decaying (0 = unknown)
      pending: false, // a newer target is waiting for the in-flight seek
      onSeeked: null,
      onPlay: null,
      onEmptied: null,
    };

    s.onSeeked = () => {
      // `seeking` drops before `seeked` is dispatched; a wheel event in that
      // gap may already have issued the next seek. This `seeked` then belongs
      // to the previous one: leave the new seek's bookkeeping alone.
      if (video.seeking) return;
      if (s.inFlight) {
        const dt = performance.now() - s.issuedAt;
        s.latency = Math.max(dt, s.latency * SEEK_LATENCY_DECAY);
      }
      s.inFlight = false;
      if (s.stallTimer) {
        clearTimeout(s.stallTimer);
        s.stallTimer = 0;
      }
      if (s.pending) issueSeek(s);
      else if (s.ending) finishSession(s);
    };
    s.onPlay = () => {
      // The page restarted playback mid-session (autoplay loops, players
      // that play after a seek). Hold it; resume when we are done.
      if (s.ending) return;
      s.resume = settings.resumeAfter;
      s.replays += 1;
      if (!s.rateHoldFailed && (s.replays >= RATE_HOLD_AFTER || Number.isFinite(s.heldRate))) {
        // The site insists on playing: let it, at playbackRate 0.
        holdRate(s);
        return;
      }
      const wait = REPAUSE_INTERVAL_MS - (performance.now() - s.lastRepause);
      if (wait <= 0) {
        repause(s);
      } else if (!s.repauseTimer) {
        // Rate-limited: pause again shortly, so the video never stays playing.
        s.repauseTimer = setTimeout(() => {
          s.repauseTimer = 0;
          if (!s.done && !s.ending && !video.paused) repause(s);
        }, wait);
      }
    };
    s.onRateChange = () => {
      // Something set the rate back while we hold it: remember the new rate
      // (the user may have picked a speed) and assert 0 again, but not
      // forever: a page or extension that pins the rate would otherwise
      // fight us at task speed. Then fall back to pausing.
      if (s.ending || !Number.isFinite(s.heldRate) || video.playbackRate === 0) return;
      s.heldRate = video.playbackRate;
      if (++s.rateFights > RATE_REASSERT_LIMIT) {
        s.heldRate = NaN;
        s.rateHoldFailed = true;
        repause(s);
        return;
      }
      holdRate(s);
    };
    s.onEmptied = () => {
      // The media was replaced (new source, ad transition): nothing to
      // resume, nothing to seek.
      s.resume = false;
      finishSession(s);
    };
    video.addEventListener('seeked', s.onSeeked);
    video.addEventListener('play', s.onPlay);
    video.addEventListener('emptied', s.onEmptied);
    video.addEventListener('ratechange', s.onRateChange);
    watchPointer(true);

    if (!video.paused && !video.ended) {
      try {
        video.pause();
        s.resume = settings.resumeAfter;
      } catch {
        /* ignore */
      }
    }
    session = s;
    pushUndo();
  }

  function repause(s) {
    s.lastRepause = performance.now();
    try {
      s.video.pause();
    } catch {
      /* ignore */
    }
  }

  function holdRate(s) {
    try {
      if (!Number.isFinite(s.heldRate)) s.heldRate = s.video.playbackRate || 1;
      if (s.video.playbackRate !== 0) s.video.playbackRate = 0;
    } catch {
      /* a player that rejects rate 0: fall back to pausing */
      s.heldRate = NaN;
      repause(s);
    }
  }

  function releaseRate(s) {
    if (!Number.isFinite(s.heldRate)) return;
    const rate = s.heldRate;
    s.heldRate = NaN;
    try {
      if (s.video.playbackRate === 0) s.video.playbackRate = rate;
    } catch {
      /* ignore */
    }
  }

  /* Document-level listeners that only exist while a session is alive. */
  function watchPointer(on) {
    const opts = { capture: true, passive: true };
    const fn = on ? 'addEventListener' : 'removeEventListener';
    window[fn]('mousemove', onSessionMove, opts);
    window[fn]('pointerdown', onUserTakeover, opts);
    window[fn]('keydown', onUserTakeover, opts);
    window[fn]('blur', onPageAway, opts);
    window[fn]('scroll', onSessionScroll, opts);
    document[fn]('visibilitychange', onPageAway, opts);
  }

  function onSessionMove(e) {
    if (!session || !e.isTrusted) return;
    lastX = e.clientX;
    lastY = e.clientY;
    if (!session.video.isConnected || !videoContains(session.video, lastX, lastY)) endSession(session, true);
  }

  /* A click or a key: the user is operating the player (or the page)
   * themselves. Stop holding the video, but do not restart it either. */
  function onUserTakeover(e) {
    if (!session || !e.isTrusted) return;
    if (e.type === 'keydown') {
      if (MODIFIER_KEYS.has(e.key)) return;
      const t = e.composedPath ? e.composedPath()[0] : e.target;
      if (isEditable(t)) return; // typing in a chat or comment box is not player control
    }
    endSession(session, false);
  }

  function isEditable(el) {
    try {
      if (!el || el.nodeType !== 1) return false;
      const name = el.localName;
      return name === 'input' || name === 'textarea' || name === 'select' || el.isContentEditable;
    } catch {
      return false;
    }
  }

  /* The user switched tab or window: put back whatever we changed. */
  function onPageAway() {
    if (document.visibilityState === 'hidden' || !document.hasFocus()) {
      cancelHold();
      if (session) endSession(session, true);
    }
  }

  /* The page scrolled under a still pointer: is the video still there? */
  function onSessionScroll() {
    if (!session || !Number.isFinite(lastX)) return;
    if (!session.video.isConnected || !videoContains(session.video, lastX, lastY)) endSession(session, true);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function smoothstep(x) {
    x = clamp(x, 0, 1);
    return x * x * (3 - 2 * x);
  }

  /* Very minor rate boost for `px` of movement delivered over `dtMs`.
   * Chromium delivers wheel events once per frame with their deltas summed,
   * so per-event velocity is stable. */
  function velocityGain(px, dtMs) {
    if (!Number.isFinite(dtMs)) return 1; // a lone event has no measurable velocity
    const v = Math.abs(px) / (Math.max(dtMs, FRAME_MS / 2) / 1000);
    return 1 + BOOST_MAX * smoothstep((v - V_BOOST_START) / (V_BOOST_FULL - V_BOOST_START));
  }

  /* Limit what one wheel event may move: linear up to `cap` seconds, then
   * only STEP_OVER of the excess. */
  function capStep(seconds, cap) {
    const a = Math.abs(seconds);
    if (a <= cap) return seconds;
    return Math.sign(seconds) * (cap + (a - cap) * STEP_OVER);
  }

  /* Rate multiplier for persistence: how long scrolling has been kept up in
   * this direction without a pause. */
  function sustainGain(now, px) {
    const sign = Math.sign(px);
    if (!streakStart || now - streakLast > STREAK_GAP_MS || (sign && streakSign && sign !== streakSign)) {
      streakStart = now;
      streakSign = sign;
    } else if (sign) {
      streakSign = sign;
    }
    streakLast = now;
    const held = now - streakStart;
    return 1 + (SUSTAIN_MAX - 1) * smoothstep((held - SUSTAIN_START_MS) / (SUSTAIN_FULL_MS - SUSTAIN_START_MS));
  }

  /* Time since the previous event of this gesture, or NaN for a lone event. */
  function eventSpacing(now) {
    const prev = recent.length > 1 ? recent[recent.length - 2].t : NaN;
    return Number.isFinite(prev) && now - prev <= WINDOW_MS ? now - prev : NaN;
  }

  function scrub(e, px, dtMs = NaN) {
    const s = session;
    if (!s) return;
    const range = scrubRange(s.video);
    if (!range) return;

    const fine = settings.requireModifier !== FINE_MODIFIER && hasModifier(e, FINE_MODIFIER);
    const sustain = sustainGain(e.timeStamp, px);

    let dt = capStep(px * (settings.secondsPer100px / 100) * velocityGain(px, dtMs) * sustain, STEP_MAX_S * sustain);
    if (settings.invert) dt = -dt;
    if (fine) dt *= FINE_FACTOR;

    if (!s.pending && !s.inFlight && !s.video.seeking && Math.abs(s.video.currentTime - s.target) > 0.5) {
      // The site moved playback while the session was idle (an ad break, a
      // chapter jump): carry on from where the video actually is.
      s.pos = s.video.currentTime;
    }
    s.pos = clamp(s.pos + dt, range[0], range[1]);
    requestSeek(s, s.pos);
    const factor = (fine ? FINE_FACTOR : 1) * sustain;
    if (settings.showTimeline) {
      timeline.show(s.video, s.pos, range, factor, undo && undo.video === s.video ? undo.time : NaN);
    }

    // The wheel stopped: the gesture is over shortly after.
    clearTimeout(s.idleTimer);
    s.idleTimer = setTimeout(() => endSession(s, true), RESUME_IDLE_MS);
  }

  /* Hand the newest target to the video: right away unless a seek we issued
   * is still in flight, in which case it waits for `seeked` (or the stall
   * cap) so the decoder gets to finish a frame. Intermediate targets are
   * dropped, never queued: the video always heads for where the wheel is
   * now. */
  function requestSeek(s, target) {
    s.target = target;
    if (s.inFlight && s.video.seeking) {
      s.pending = true;
      if (!s.stallTimer) {
        // A seek into an unbuffered range is waiting for the network, not
        // stuck: give it the full cap.
        const cap = isBuffered(s.video, s.target)
          ? clamp(s.latency * SEEK_CAP_FACTOR, SEEK_CAP_MIN_MS, SEEK_CAP_MAX_MS)
          : SEEK_CAP_MAX_MS;
        const wait = Math.max(0, cap - (performance.now() - s.issuedAt));
        s.stallTimer = setTimeout(() => {
          s.stallTimer = 0;
          if (s.pending) issueSeek(s);
        }, wait);
      }
      return;
    }
    issueSeek(s);
  }

  function isBuffered(video, t) {
    try {
      const b = video.buffered;
      for (let i = 0; i < b.length; i++) if (t >= b.start(i) && t <= b.end(i)) return true;
      return b.length === 0; // nothing reported: assume the best
    } catch {
      return true;
    }
  }

  function issueSeek(s) {
    s.pending = false;
    const v = s.video;
    if (s.inFlight && v.seeking) {
      // Aborting a seek that was merely slow: learn from it so the cap grows.
      s.latency = Math.max(s.latency, performance.now() - s.issuedAt);
    }
    try {
      if (Math.abs(v.currentTime - s.target) > 1e-4) {
        v.currentTime = s.target;
        s.inFlight = v.seeking;
        s.issuedAt = performance.now();
      }
    } catch {
      /* media element gone or not seekable */
    }
  }

  /* The session is over: flush the last target, then (once that seek has
   * landed) resume playback if we paused it and `resume` allows. */
  function endSession(s, resume) {
    if (s.done) return;
    if (!resume) s.resume = false;
    if (mode === 'scrub' || mode === 'undecided') resetMode();
    clearTimeout(s.idleTimer);
    s.ending = true;
    if (s.pending && !s.stallTimer) issueSeek(s);
    if (s.inFlight && s.video.seeking && s.video.isConnected) {
      if (!s.finalTimer) s.finalTimer = setTimeout(() => finishSession(s), FINAL_SEEK_WAIT_MS);
      return;
    }
    finishSession(s);
  }

  function finishSession(s) {
    if (s.done) return;
    s.done = true;
    if (session === s) {
      session = null;
      watchPointer(false);
    }
    clearTimeout(s.finalTimer);
    clearTimeout(s.stallTimer);
    clearTimeout(s.repauseTimer);
    clearTimeout(s.idleTimer);
    timeline.release();
    const v = s.video;
    v.removeEventListener('seeked', s.onSeeked);
    v.removeEventListener('play', s.onPlay);
    v.removeEventListener('emptied', s.onEmptied);
    v.removeEventListener('ratechange', s.onRateChange);
    const held = Number.isFinite(s.heldRate);
    if (held && !s.resume && v.isConnected && !v.paused) {
      // Held at rate 0 by a site that kept playing; the user did not want
      // playback back, so pause before restoring the rate.
      try {
        v.pause();
      } catch {
        /* ignore */
      }
    }
    releaseRate(s);
    if (s.resume && v.isConnected && v.paused && !v.ended) {
      try {
        const p = v.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch {
        /* ignore */
      }
    }
    // Stay blocking only if the pointer is still over a video.
    if (!session && Number.isFinite(lastX)) setArmed(active() && !!findVideoAt(lastX, lastY, true));
  }

  /* ---- Undo ----------------------------------------------------------- */

  /* Put the video back where it was before the last scrub session began,
   * playing if it was playing. The position it is leaving becomes the new
   * undo point, so pressing undo again redoes. Triggered from the keyboard
   * shortcut or the popup, through the service worker. */
  function performUndo() {
    const u = undo;
    if (!u || !u.video.isConnected) return false;
    const v = u.video;
    if (session) endSession(session, false);
    const now = Number.isFinite(v.currentTime) ? v.currentTime : u.time;
    undo = { video: v, time: now, wasPlaying: !v.paused && !v.ended, at: performance.now() };
    try {
      const range = seekRange(v);
      v.currentTime = range ? clamp(u.time, range[0], range[1]) : u.time;
      if (u.wasPlaying) {
        const p = v.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } else if (!v.paused) {
        v.pause();
      }
    } catch {
      return false;
    }
    pushUndo();
    return true;
  }

  function undoInfo() {
    if (!undo || !undo.video.isConnected) return null;
    let duration = NaN;
    try {
      duration = undo.video.duration;
    } catch {
      /* ignore */
    }
    return { time: undo.time, wasPlaying: undo.wasPlaying, duration: Number.isFinite(duration) ? duration : null };
  }

  /* Tell the service worker where this frame's undo point is, so the popup
   * can show it and the shortcut can reach this frame. */
  function pushUndo() {
    try {
      chrome.runtime.sendMessage({ type: 'undo-state', info: undoInfo() }, () => void chrome.runtime.lastError);
    } catch {
      /* Extension context unavailable. */
    }
  }

  function listenForMessages() {
    try {
      chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg && msg.type === 'undo') sendResponse({ ok: performUndo() });
      });
    } catch {
      /* Extension context unavailable. */
    }
  }

  /* ---- Press and hold to speed up --------------------------------------- */

  let holdAllowed = null; // computed once per frame

  function holdSupported() {
    if (holdAllowed === null) holdAllowed = !frameHosts().some((h) => HOLD_EXCLUDED.some((p) => hostMatches(h, p)));
    return holdAllowed;
  }

  /* Buttons, links, sliders and fields inside the player are for clicking,
   * not holding. */
  function isInteractive(el) {
    try {
      const name = el.localName;
      if (name === 'button' || name === 'a' || name === 'input' || name === 'select' || name === 'textarea') return true;
      if (el.isContentEditable) return true;
      const role = el.getAttribute && el.getAttribute('role');
      return /^(button|link|slider|menuitem|checkbox|switch|tab|option)$/.test(role || '');
    } catch {
      return false;
    }
  }

  function onHoldStart(e) {
    if (!active() || !e.isTrusted || e.button !== 0 || !holdSupported()) return;
    cancelHold();
    const path = e.composedPath ? e.composedPath() : [];
    for (const el of path) {
      if (el === document || el === window) break;
      if (el.nodeType === 1 && !isVideo(el) && isInteractive(el)) return;
    }
    const found = locateVideo(e.clientX, e.clientY);
    const video = found.ready || found.any;
    if (!video) return;
    hold = {
      video,
      x: e.clientX,
      y: e.clientY,
      pointerId: e.pointerId,
      active: false,
      rate: 1,
      timer: setTimeout(beginHold, HOLD_MS),
    };
  }

  function beginHold() {
    const h = hold;
    if (!h) return;
    h.timer = 0;
    const v = h.video;
    if (!v.isConnected || v.paused || v.ended) return cancelHold();
    try {
      h.rate = v.playbackRate || 1;
      v.playbackRate = HOLD_RATE;
    } catch {
      return cancelHold();
    }
    h.active = true;
    if (settings.showTimeline) timeline.pin(v, HOLD_RATE + '×');
  }

  function onHoldMove(e) {
    if (!hold || hold.active || e.pointerId !== hold.pointerId) return;
    if (Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > HOLD_SLOP_PX) cancelHold();
  }

  function onHoldEnd(e) {
    if (!hold || (e && e.pointerId !== undefined && e.pointerId !== hold.pointerId)) return;
    if (hold.active) {
      // The press was a hold, not a click: swallow the click this release
      // generates (it follows within the same input sequence), and only that.
      clearTimeout(suppressClick);
      suppressClick = setTimeout(() => (suppressClick = 0), 150);
    }
    cancelHold();
  }

  function cancelHold() {
    const h = hold;
    if (!h) return;
    hold = null;
    clearTimeout(h.timer);
    if (h.active) {
      try {
        if (h.video.playbackRate === HOLD_RATE) h.video.playbackRate = h.rate;
      } catch {
        /* ignore */
      }
      timeline.unpin();
    }
  }

  function onClickCapture(e) {
    if (!suppressClick) return;
    clearTimeout(suppressClick);
    suppressClick = 0;
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  /* ---- Timeline ------------------------------------------------------- */

  /* A thin timeline drawn over the top of the video while scrubbing. It
   * follows the logical position, which leads the video's own timeline by
   * however long the current seek takes, so it is the responsive view of
   * where the wheel is. A faint tick marks where the video was before the
   * scrub began (what undo returns to). While it is visible it re-measures
   * the video every frame, so it follows resizes and fullscreen; after the
   * gesture it keeps following playback for a moment, then fades out. */
  const timeline = (() => {
    let host = null;
    let mark = null;
    let fill = null;
    let origin = null;
    let label = null;
    let durEl = null;
    let fineEl = null;
    let state = null; // { video, pos, range, fine, originTime, live, releasedAt }
    let frame = 0;
    let open = false;
    let fading = false;
    let lastFullscreen = null;

    const HOST_STYLE = [
      'position:fixed',
      'inset:auto',
      'margin:0',
      'padding:0',
      'border:0',
      'width:auto',
      'height:auto',
      'max-width:none',
      'max-height:none',
      'overflow:visible',
      'background:transparent',
      'color:inherit',
      'pointer-events:none',
      'z-index:2147483647',
      'opacity:1',
      `transition:opacity ${TIMELINE_FADE_MS}ms ease-out`,
    ]
      .map((d) => d + ' !important')
      .join(';');

    // No `:host { display }` rule: it would beat the browser's `display: none`
    // for a closed popover and keep the bar rendered after it is hidden.
    const SHEET = `
      .track {
        position: relative;
        height: 4px;
        background: rgba(255, 255, 255, 0.45);
        box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35), 0 1px 4px rgba(0, 0, 0, 0.6);
      }
      .fill {
        position: absolute;
        top: 0;
        left: 0;
        height: 100%;
        background: #fff;
      }
      .origin {
        position: absolute;
        top: -4px;
        width: 2px;
        height: 12px;
        margin-left: -1px;
        background: rgba(255, 255, 255, 0.85);
        box-shadow: 0 0 2px rgba(0, 0, 0, 0.7);
      }
      .mark {
        position: absolute;
        top: -6px;
        width: 4px;
        height: 16px;
        margin-left: -2px;
        background: #fff;
        box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4), 0 1px 4px rgba(0, 0, 0, 0.8);
      }
      .label {
        position: absolute;
        top: 16px;
        white-space: nowrap;
        font: 600 14px/1 system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-variant-numeric: tabular-nums;
        color: #fff;
        text-shadow: 0 0 3px rgba(0, 0, 0, 1), 0 1px 3px rgba(0, 0, 0, 0.9), 0 0 8px rgba(0, 0, 0, 0.6);
      }
      .dur { opacity: 0.7; }
      .fine { margin-left: 6px; opacity: 0.7; }
      .fine:empty { display: none; }
    `;

    function build() {
      const el = document.createElement('scroll-to-scrub-hud');
      const root = el.attachShadow({ mode: 'closed' });
      const style = document.createElement('style');
      style.textContent = SHEET;
      const track = document.createElement('div');
      track.className = 'track';
      fill = document.createElement('div');
      fill.className = 'fill';
      origin = document.createElement('div');
      origin.className = 'origin';
      mark = document.createElement('div');
      mark.className = 'mark';
      label = document.createElement('div');
      label.className = 'label';
      durEl = document.createElement('span');
      durEl.className = 'dur';
      fineEl = document.createElement('span');
      fineEl.className = 'fine';
      label.append(document.createTextNode(''), durEl, fineEl);
      track.append(fill, origin, mark, label);
      root.append(style, track);
      if (typeof el.showPopover === 'function') el.setAttribute('popover', 'manual');
      el.style.cssText = HOST_STYLE;
      return el;
    }

    function ensure() {
      if (host && host.isConnected) return true;
      const parent = document.documentElement;
      if (!parent) return false;
      try {
        if (!host) host = build();
        parent.appendChild(host);
        open = false;
        return true;
      } catch {
        host = null;
        return false;
      }
    }

    /* Keep the timeline in the top layer, above fullscreen players. A
     * popover only stacks above a fullscreen element if it was shown after
     * it, so re-open it whenever the fullscreen element changes. */
    function raise() {
      const fs = document.fullscreenElement || null;
      if (host.hasAttribute('popover')) {
        try {
          if (open && fs !== lastFullscreen) host.hidePopover();
          if (!open || fs !== lastFullscreen) host.showPopover();
        } catch {
          /* ignore */
        }
      } else {
        // No Popover API: live inside the fullscreen element instead.
        const wanted = fs && !isVideo(fs) ? fs : document.documentElement;
        if (host.parentNode !== wanted) {
          try {
            wanted.appendChild(host);
          } catch {
            /* ignore */
          }
        }
        host.style.setProperty('display', 'block', 'important');
      }
      lastFullscreen = fs;
      open = true;
    }

    function formatTime(seconds, tenths) {
      const total = Math.max(0, seconds);
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const sec = total % 60;
      const ss = tenths ? sec.toFixed(1).padStart(4, '0') : String(Math.floor(sec)).padStart(2, '0');
      return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + ss;
    }

    /* Called on every wheel event: record the logical position; the frame
     * loop draws it. */
    function show(video, pos, range, factor, originTime) {
      state = { video, pos, range, factor, originTime, live: false, releasedAt: 0 };
      if (fading) unfade();
      if (!frame) frame = requestAnimationFrame(tick);
    }

    /* The gesture is over: keep following playback, then fade out. */
    function release() {
      if (!state || state.pinned) return;
      state.live = true;
      state.releasedAt = performance.now();
    }

    /* Keep the timeline up, following playback, with a label, until unpin(). */
    function pin(video, label) {
      const range = seekRange(video);
      if (!range) return;
      state = { video, pos: video.currentTime, range, factor: 1, originTime: NaN, live: true, releasedAt: 0, pinned: label };
      if (fading) unfade();
      if (!frame) frame = requestAnimationFrame(tick);
    }

    function unpin() {
      if (!state || !state.pinned) return;
      state.pinned = null;
      state.releasedAt = performance.now();
    }

    function unfade() {
      fading = false;
      if (host) host.style.setProperty('opacity', '1', 'important');
    }

    function tick() {
      frame = 0;
      const n = state;
      if (!n || !n.video.isConnected || !ensure()) return hide();

      if (n.live) {
        const range = seekRange(n.video) || n.range;
        n.range = range;
        if (Number.isFinite(n.video.currentTime)) n.pos = n.video.currentTime;
        if (!n.pinned) {
          const since = performance.now() - n.releasedAt;
          if (since >= TIMELINE_HOLD_MS + TIMELINE_FADE_MS) return hide();
          if (since >= TIMELINE_HOLD_MS && !fading) {
            fading = true;
            host.style.setProperty('opacity', '0', 'important');
          }
        }
      }

      // Reads.
      const r = n.video.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const left = Math.max(0, r.left) + 16;
      const right = Math.min(vw, r.right) - 16;
      const width = right - left;
      const top = clamp(Math.max(0, r.top) + 16, 8, vh - 40);
      const span = n.range[1] - n.range[0];
      const frac = span > 0 ? clamp((n.pos - n.range[0]) / span, 0, 1) : 0;
      const originFrac =
        Number.isFinite(n.originTime) && span > 0 ? clamp((n.originTime - n.range[0]) / span, 0, 1) : NaN;

      // Writes. (Never set `display` on the host: the browser hides a closed
      // popover with `display: none`, and an inline value would override it.)
      host.style.setProperty('visibility', width < 40 ? 'hidden' : 'visible', 'important');
      if (width >= 40) {
        host.style.setProperty('left', left + 'px', 'important');
        host.style.setProperty('top', top + 'px', 'important');
        host.style.setProperty('width', width + 'px', 'important');
        mark.style.left = (frac * 100).toFixed(3) + '%';
        fill.style.width = (frac * 100).toFixed(3) + '%';
        const showOrigin = Number.isFinite(originFrac) && Math.abs(originFrac - frac) * width > 3;
        origin.style.display = showOrigin ? '' : 'none';
        if (showOrigin) origin.style.left = (originFrac * 100).toFixed(3) + '%';
        label.firstChild.nodeValue = formatTime(n.pos - n.range[0], true);
        durEl.textContent = ' / ' + formatTime(span, false);
        const f = n.factor;
        fineEl.textContent = n.pinned
          ? n.pinned
          : !n.live && Math.abs(f - 1) > 0.05
            ? '×' + (f < 10 ? f.toFixed(1) : f.toFixed(0))
            : '';
        // Keep the label inside the track: right-align it near the end.
        const atEnd = frac > 0.75;
        label.style.left = atEnd ? 'auto' : (frac * 100).toFixed(3) + '%';
        label.style.right = atEnd ? (100 - frac * 100).toFixed(3) + '%' : 'auto';
        host.dataset.pos = frac.toFixed(4); // for tests and debugging
      }
      raise();
      frame = requestAnimationFrame(tick);
    }

    function hide() {
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      state = null;
      if (!host) return;
      open = false;
      try {
        if (host.hasAttribute('popover')) {
          if (host.matches(':popover-open')) host.hidePopover();
        } else {
          host.style.setProperty('display', 'none', 'important');
        }
      } catch {
        /* ignore */
      }
      unfade(); // reset for the next appearance, once it is no longer rendered
    }

    return { show, release, pin, unpin, hide };
  })();

  /* ---- Boot ----------------------------------------------------------- */

  loadSettings();
  listenForMessages();
  if (window === window.top) pushUndo(); // a fresh top document has nothing to undo
  // Capture on the window, registered at document_start, so page scripts
  // cannot swallow the event first. Passive until the pointer is over a
  // video, blocking from then on (see setArmed).
  window.addEventListener('wheel', onWheel, { capture: true, passive: true });
  window.addEventListener('mouseover', onHover, { capture: true, passive: true });
  window.addEventListener('mouseout', onPointerLeftWindow, { capture: true, passive: true });
  // The pointer may already rest on a video when the page loads; the first
  // movement tells us where it is.
  window.addEventListener('mousemove', onHover, { capture: true, passive: true, once: true });
  // Press and hold to speed up.
  window.addEventListener('pointerdown', onHoldStart, { capture: true, passive: true });
  window.addEventListener('pointermove', onHoldMove, { capture: true, passive: true });
  window.addEventListener('pointerup', onHoldEnd, { capture: true, passive: true });
  window.addEventListener('pointercancel', onHoldEnd, { capture: true, passive: true });
  window.addEventListener('click', onClickCapture, { capture: true });
  window.addEventListener('blur', onPageAway, { capture: true, passive: true });
  document.addEventListener('visibilitychange', onPageAway, { capture: true, passive: true });
})();
