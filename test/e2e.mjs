// Loads the unpacked extension into headless Chromium and serves a stand-in YouTube page for every www.youtube.com URL
// (routed, never fetched): feed, watch page, player, search shelf, guide. Then drives the page, the popup and the
// options page and checks each feature. Run: npm test
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const extensionDir = path.resolve(import.meta.dirname, '../extension');
// Chrome derives an unpacked extension's id from its absolute path.
const extensionId = createHash('sha256')
  .update(extensionDir)
  .digest('hex')
  .slice(0, 32)
  .replace(/./g, (c) => 'abcdefghijklmnop'[parseInt(c, 16)]);

const YOUTUBE_PAGE = `<!doctype html><html><head><title>stand-in</title></head><body>
<ytd-app>
  <div id="masthead-container"><ytd-masthead>
    <ytd-notification-topbar-button-renderer id="bell">bell</ytd-notification-topbar-button-renderer>
  </ytd-masthead></div>
  <tp-yt-app-drawer id="guide"><ytd-guide-renderer>
    <ytd-guide-section-renderer id="guide-main">
      <ytd-guide-entry-renderer id="guide-shorts"><a id="endpoint" title="Shorts">Shorts</a></ytd-guide-entry-renderer>
      <ytd-guide-entry-renderer id="guide-subs"><a href="/feed/subscriptions">Subscriptions</a></ytd-guide-entry-renderer>
    </ytd-guide-section-renderer>
    <ytd-guide-section-renderer id="guide-explore">
      <ytd-guide-entry-renderer><a href="/feed/trending">Trending</a></ytd-guide-entry-renderer>
    </ytd-guide-section-renderer>
  </ytd-guide-renderer></tp-yt-app-drawer>
  <ytd-page-manager>
    <ytd-browse page-subtype="home"><div id="primary"><ytd-rich-grid-renderer id="home-grid">
      <ytd-rich-item-renderer id="v-cats"><div id="content"><ytd-rich-grid-media>
        <ytd-thumbnail><ytd-thumbnail-overlay-time-status-renderer><span id="text">12:01</span></ytd-thumbnail-overlay-time-status-renderer></ytd-thumbnail>
        <a id="video-title-link" href="/watch?v=cats"><yt-formatted-string id="video-title">Funny cats compilation</yt-formatted-string></a>
        <ytd-channel-name><a href="/@catsdaily">Cats Daily</a></ytd-channel-name>
      </ytd-rich-grid-media></div></ytd-rich-item-renderer>
      <ytd-rich-item-renderer id="v-rust"><yt-lockup-view-model>
        <a class="yt-lockup-view-model__content-image" href="/watch?v=rust"><yt-thumbnail-view-model><badge-shape><div class="yt-badge-shape__text">45:00</div></badge-shape></yt-thumbnail-view-model></a>
        <a class="avatar" href="/@rustlang"></a>
        <h3 title="Rust ownership explained"><a class="yt-lockup-metadata-view-model__title" href="/watch?v=rust">Rust ownership explained</a></h3>
        <div class="yt-content-metadata-view-model__metadata-row"><span class="yt-content-metadata-view-model__metadata-text"><a href="/@rustlang">Rust</a></span></div>
        <div class="yt-content-metadata-view-model__metadata-row"><span id="rust-views">10K views</span><span>•</span><span id="rust-age">2 days ago</span></div>
      </yt-lockup-view-model></ytd-rich-item-renderer>
      <ytd-rich-item-renderer id="v-short"><a href="/shorts/abc">A short</a></ytd-rich-item-renderer>
      <ytd-rich-item-renderer id="v-mix"><a href="/watch?v=m&list=RDm">My Mix</a></ytd-rich-item-renderer>
      <ytd-rich-item-renderer id="v-watched"><ytd-thumbnail><ytd-thumbnail-overlay-resume-playback-renderer><div id="progress" style="width: 95%"></div></ytd-thumbnail-overlay-resume-playback-renderer></ytd-thumbnail><yt-formatted-string id="video-title">Seen it</yt-formatted-string></ytd-rich-item-renderer>
      <ytd-rich-item-renderer id="v-live"><ytd-thumbnail-overlay-time-status-renderer overlay-style="LIVE"><span>LIVE</span></ytd-thumbnail-overlay-time-status-renderer><yt-formatted-string id="video-title">Live now</yt-formatted-string></ytd-rich-item-renderer>
    </ytd-rich-grid-renderer></div></ytd-browse>
    <ytd-watch-flexy>
      <div id="primary">
        <div id="movie_player" class="html5-video-player">
          <video class="html5-main-video"></video>
          <div class="ytp-ad-skip-button-slot"><button class="ytp-skip-ad-button">Skip</button></div>
          <button class="ytp-autonav-toggle-button" aria-checked="true">Autoplay</button>
          <div class="ytp-ce-element" id="endscreen-card">card</div>
        </div>
        <div id="below">
          <ytd-watch-metadata><div id="owner">Channel</div><div id="actions">Like</div><div id="description">Description</div></ytd-watch-metadata>
          <ytd-merch-shelf-renderer id="merch">Merch</ytd-merch-shelf-renderer>
          <ytd-comments id="comments">Comments</ytd-comments>
        </div>
      </div>
      <div id="secondary"><div id="related"><ytd-watch-next-secondary-results-renderer>Related</ytd-watch-next-secondary-results-renderer></div></div>
    </ytd-watch-flexy>
    <ytd-search><ytd-shelf-renderer id="search-shelf">People also watched</ytd-shelf-renderer></ytd-search>
    <div id="custom-target">custom target</div>
    <div id="pick-me"><span>pick me</span></div>
  </ytd-page-manager>
</ytd-app>
<script>
  window.__log = [];
  window.__timers = {};
  window.__visible = (selector) => Boolean(document.querySelector(selector)?.checkVisibility());
  const player = document.getElementById('movie_player');
  player.getPlaybackRate = () => 1.5;
  player.getVideoData = () => ({ video_id: 'test' });
  for (const m of ['seekTo', 'pauseVideo', 'playVideo', 'loadVideoById']) player[m] = () => __log.push(m);
  document.querySelector('.ytp-skip-ad-button').addEventListener('click', () => __log.push('skip'));
  document.querySelector('.ytp-autonav-toggle-button').addEventListener('click', (e) => {
    e.currentTarget.setAttribute('aria-checked', 'false');
    __log.push('autoplay-off');
  });
  document.getElementById('pick-me').addEventListener('click', () => __log.push('page-click'));

  const t0 = performance.now();
  const done = (name) => ({ resolve() { __timers[name] = performance.now() - t0; } });
  const gate = done('gate'), retry = done('retry'), other = done('other');
  setTimeout(function () {                                                     // the startup gate
    gate.resolve(1);
    setTimeout(function () { retry.resolve(1); }, 5000);                       // same timer again right away
  }, 5000);
  setTimeout(function () { other.resolve(1); }, 4800);                         // a backoff-length timer
  setTimeout(function () { __timers.control = performance.now() - t0; }, 1500); // an ordinary timer
</script>
</body></html>`;

const userDataDir = mkdtempSync(path.join(tmpdir(), 'ythb-'));
const context = await chromium.launchPersistentContext(userDataDir, {
  channel: 'chromium',
  headless: true,
  args: [
    `--disable-extensions-except=${extensionDir}`,
    `--load-extension=${extensionDir}`,
    '--autoplay-policy=no-user-gesture-required',
  ],
});

const results = [];
const test = async (name, fn) => {
  try {
    await fn();
    results.push(`ok    ${name}`);
  } catch (error) {
    results.push(`FAIL  ${name}\n      ${error.message.split('\n').join('\n      ')}`);
    process.exitCode = 1;
  }
};

try {
  await context.route('https://www.youtube.com/**', (route) => {
    const url = route.request().url();
    if (url.endsWith('/stall.mp4')) return; // never answered: a stream that stops delivering
    if (url.includes('/youtubei/v1/')) return route.fulfill({ contentType: 'application/json', body: route.request().postData() }); // echo
    return route.fulfill({ contentType: 'text/html', body: YOUTUBE_PAGE });
  });

  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.goto('https://www.youtube.com/watch?v=test');
  const log = () => page.evaluate(() => window.__log);
  const visible = (selector) => page.evaluate((s) => window.__visible(s), selector);
  const waitVisible = (selector, want, timeout = 2000) =>
    page.waitForFunction(([s, w]) => window.__visible(s) === w, [selector, want], { timeout });
  const expectHidden = async (selectors, timeout) => {
    for (const s of selectors) await waitVisible(s, false, timeout).catch(() => assert.fail(`${s} still visible`));
  };
  const expectVisible = async (selectors, timeout) => {
    for (const s of selectors) await waitVisible(s, true, timeout).catch(() => assert.fail(`${s} still hidden`));
  };
  const filtered = (id) => page.evaluate((i) => document.getElementById(i).dataset.yffFiltered ?? null, id);

  await test('startup gate timer is shortened once; repeats, other lengths and ordinary timers are not', async () => {
    await page.waitForFunction(() => window.__timers.control !== undefined, null, { timeout: 4000 });
    const timers = await page.evaluate(() => window.__timers);
    assert.ok(timers.gate < 300, `gate fired after ${timers.gate} ms`);
    assert.equal(timers.retry, undefined, `repeat fired after ${timers.retry} ms`);
    assert.equal(timers.other, undefined, `4.8 s timer fired after ${timers.other} ms`);
    assert.ok(timers.control >= 1400, `control fired after ${timers.control} ms`);
  });

  const playerRequest = (videoId) => ({
    context: { client: { clientName: 'WEB' } },
    videoId,
    playbackContext: { contentPlaybackContext: { html5Preference: 'HTML5_PREF_WANTS' } },
  });
  const noAdFlags = (echo) => JSON.stringify(echo).match(/"isInlinePlaybackNoAd":true/g)?.length ?? 0;

  await test('player requests ask for the no-ad stream: fetch(url, init), fetch(Request), XHR', async () => {
    const echoes = await page.evaluate(async (body) => {
      const url = '/youtubei/v1/player?prettyPrint=false';
      const init = { method: 'POST', body, headers: { 'Content-Type': 'application/json' } };
      const viaInit = await (await fetch(url, init)).json();
      const viaRequest = await (await fetch(new Request(url, init))).json();
      const viaXhr = await new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url);
        xhr.onload = () => resolve(JSON.parse(xhr.responseText));
        xhr.send(body);
      });
      return [viaInit, viaRequest, viaXhr];
    }, JSON.stringify(playerRequest('a')));
    for (const echo of echoes) {
      assert.equal(echo.playbackContext.contentPlaybackContext.isInlinePlaybackNoAd, true);
      assert.equal(echo.playbackContext.contentPlaybackContext.html5Preference, 'HTML5_PREF_WANTS');
    }
  });

  await test('get_watch’s nested player request is patched; other endpoints are not', async () => {
    const [watch, next] = await page.evaluate(async ([watchBody, nextBody]) => {
      const post = async (url, body) => (await fetch(url, { method: 'POST', body })).json();
      return [await post('/youtubei/v1/get_watch', watchBody), await post('/youtubei/v1/next', nextBody)];
    }, [JSON.stringify({ playerRequest: playerRequest('b'), watchNextRequest: { videoId: 'b' } }), JSON.stringify(playerRequest('c'))]);
    assert.equal(watch.playerRequest.playbackContext.contentPlaybackContext.isInlinePlaybackNoAd, true);
    assert.equal(noAdFlags(next), 0);
  });

  await test('ad slot runs muted at 16x and Skip is pressed', async () => {
    await page.evaluate(() => document.getElementById('movie_player').classList.add('ad-showing'));
    await page.waitForTimeout(100);
    const v = await page.evaluate(() => ({ muted: document.querySelector('video').muted, rate: document.querySelector('video').playbackRate }));
    assert.deepEqual(v, { muted: true, rate: 16 });
    assert.ok((await log()).includes('skip'), 'skip button not clicked');
  });

  await test('after the ad slot, mute state and the player’s own rate come back', async () => {
    await page.evaluate(() => document.getElementById('movie_player').classList.remove('ad-showing'));
    await page.waitForTimeout(100);
    const v = await page.evaluate(() => ({ muted: document.querySelector('video').muted, rate: document.querySelector('video').playbackRate }));
    assert.deepEqual(v, { muted: false, rate: 1.5 });
  });

  await test('anti-adblock dialog is removed', async () => {
    await page.evaluate(() => {
      const dialog = document.createElement('tp-yt-paper-dialog');
      dialog.appendChild(document.createElement('ytd-enforcement-message-view-model'));
      document.body.appendChild(dialog);
    });
    await page.waitForFunction(() => !document.querySelector('ytd-enforcement-message-view-model'), null, { timeout: 1000 });
  });

  await test('a dialog with close() is closed once and left alone while hidden', async () => {
    await page.evaluate(() => {
      const dialog = document.createElement('tp-yt-paper-dialog');
      dialog.close = () => {
        __log.push('close');
        dialog.style.display = 'none'; // YouTube keeps closed dialogs, message and all
      };
      dialog.appendChild(document.createElement('ytd-enforcement-message-view-model'));
      document.body.appendChild(dialog);
    });
    await page.waitForTimeout(1000);
    assert.equal((await log()).filter((entry) => entry === 'close').length, 1);
  });

  await test('a stream with no picture yet is reloaded through the player API', async () => {
    await page.evaluate(() => {
      const video = document.querySelector('video');
      video.src = '/stall.mp4';
      video.play().catch(() => {});
    });
    assert.equal(await page.evaluate(() => document.querySelector('video').paused), false, 'video did not start');
    await page.waitForFunction(() => window.__log.includes('loadVideoById'), null, { timeout: 4000 });
    assert.ok(!(await log()).includes('seekTo'), 'nudged instead of reloading');
  });

  await test('a stream frozen mid-video is re-seeked first', async () => {
    // One second of real video in a MediaSource that never gets more: plays, then waits at the buffer's end.
    const readyState = await page.evaluate(async () => {
      document.getElementById('movie_player').getVideoData = () => ({ video_id: 'mid' });
      const canvas = Object.assign(document.createElement('canvas'), { width: 64, height: 64 });
      const g = canvas.getContext('2d');
      let hue = 0;
      const paint = setInterval(() => ((g.fillStyle = `hsl(${(hue += 20)},80%,50%)`), g.fillRect(0, 0, 64, 64)), 30);
      const recorder = new MediaRecorder(canvas.captureStream(30), { mimeType: 'video/webm;codecs=vp8' });
      const chunks = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.start();
      await new Promise((r) => setTimeout(r, 1000));
      recorder.stop();
      await new Promise((r) => (recorder.onstop = r));
      clearInterval(paint);

      const video = document.querySelector('video');
      const source = new MediaSource();
      video.src = URL.createObjectURL(source);
      await new Promise((r) => source.addEventListener('sourceopen', r, { once: true }));
      const buffer = source.addSourceBuffer('video/webm;codecs=vp8');
      buffer.appendBuffer(await new Blob(chunks).arrayBuffer());
      await new Promise((r) => buffer.addEventListener('updateend', r, { once: true }));
      await video.play();
      await new Promise((r) => video.addEventListener('waiting', r, { once: true }));
      return video.readyState;
    });
    assert.ok(readyState >= 2, `readyState ${readyState}: has no picture, so this isn't the mid-video case`);
    const before = (await log()).length;
    await page.waitForFunction((n) => window.__log.slice(n).includes('seekTo'), before, { timeout: 6000 });
  });

  // Extension pages -----------------------------------------------------------------------------------------------

  const popup = await context.newPage();
  popup.on('pageerror', (e) => pageErrors.push(`popup: ${e.message}`));
  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  // Storage writes go through the popup page's chrome.* (any extension page would do).
  const store = (partial) => popup.evaluate((p) => chrome.storage.sync.set(p), partial);
  const read = () => popup.evaluate(() => chrome.storage.sync.get(null));
  // Without the tabs permission URLs aren't visible, so find the tab whose content script answers.
  const ytTabId = await popup.evaluate(async () => {
    for (const tab of await chrome.tabs.query({})) {
      if (await chrome.tabs.sendMessage(tab.id, { type: 'yff:stats' }, { frameId: 0 }).catch(() => null)) return tab.id;
    }
  });
  const tabMessage = (message) => popup.evaluate(([id, m]) => chrome.tabs.sendMessage(id, m, { frameId: 0 }), [ytTabId, message]);

  await test('popup opens with hiding on and the Clean preset selected', async () => {
    await popup.waitForFunction(() => document.querySelector('#enabled').checked, null, { timeout: 2000 });
    assert.equal(await popup.evaluate(() => document.querySelector('[data-preset="clean"]').classList.contains('on')), true);
    assert.match(await popup.textContent('#status'), /on/i);
  });

  await test('Clean (default) hides Shorts, Mixes, merch and end-screen cards, keeps the feed', async () => {
    await expectHidden(['#v-short', '#v-mix', '#merch', '#guide-shorts', '#endscreen-card', '#search-shelf']);
    await expectVisible(['#home-grid', '#v-cats', '#comments', '#related', '#bell']);
  });

  await test('Focus preset from the popup hides feeds, recommendations, comments, bell, Explore', async () => {
    await popup.click('[data-preset="focus"]');
    await expectHidden(['#home-grid', '#related', '#comments', '#bell', '#guide-explore']);
    await expectVisible(['#guide-subs', '#owner']);
    assert.equal(await popup.evaluate(() => document.querySelector('[data-preset="focus"]').classList.contains('on')), true);
  });

  await test('Turn off Autoplay flips the player’s switch once', async () => {
    await page.waitForFunction(() => window.__log.includes('autoplay-off'), null, { timeout: 2000 });
    assert.equal(await page.getAttribute('.ytp-autonav-toggle-button', 'aria-checked'), 'false');
  });

  await test('popup search finds an option; unticking it shows the element again', async () => {
    await popup.fill('#search', 'comments');
    assert.equal(await popup.isVisible('[data-key="hide.comments"]'), true);
    assert.equal(await popup.isVisible('[data-key="hide.homeFeed"]'), false);
    await popup.click('[data-key="hide.comments"]');
    await expectVisible(['#comments']);
    assert.equal(await popup.evaluate(() => document.querySelector('[data-preset="focus"]').classList.contains('on')), false);
    await popup.fill('#search', '');
  });

  await test('master switch off shows everything; on hides again', async () => {
    await popup.click('#enabled');
    await expectVisible(['#home-grid', '#related', '#v-short']);
    assert.match(await popup.textContent('#status'), /off/i);
    await popup.click('#enabled');
    await expectHidden(['#home-grid', '#related']);
  });

  await test('pause shows everything until resumed', async () => {
    await popup.click('[data-pause="5"]');
    await expectVisible(['#home-grid']);
    assert.match(await popup.textContent('#status'), /paused until/i);
    await popup.click('#resume');
    await expectHidden(['#home-grid']);
  });

  const hhmm = (minutes) => {
    const m = ((minutes % 1440) + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  };
  const nowMinutes = await page.evaluate(() => new Date().getHours() * 60 + new Date().getMinutes());
  const allDays = [0, 1, 2, 3, 4, 5, 6];

  await test('schedule: outside the window YouTube is untouched, inside it hiding is on', async () => {
    await store({ schedule: { enabled: true, days: allDays, start: hhmm(nowMinutes + 60), end: hhmm(nowMinutes + 120) } });
    await expectVisible(['#home-grid', '#v-short']);
    await store({ schedule: { enabled: true, days: allDays, start: hhmm(nowMinutes - 60), end: hhmm(nowMinutes + 60) } });
    await expectHidden(['#home-grid', '#v-short']);
  });

  await test('lock during scheduled hours disables switch-off, pause and Show all', async () => {
    await store({ friction: { pauseDelaySec: 0, lockDuringSchedule: true } });
    await popup.waitForFunction(() => document.querySelector('#enabled').disabled, null, { timeout: 2000 });
    assert.equal(await popup.isDisabled('[data-pause="15"]'), true);
    assert.equal(await popup.isDisabled('[data-preset="off"]'), true);
    await store({ friction: { pauseDelaySec: 0, lockDuringSchedule: false }, schedule: { enabled: false, days: allDays, start: '09:00', end: '17:00' } });
    await popup.waitForFunction(() => !document.querySelector('#enabled').disabled, null, { timeout: 2000 });
  });

  await test('friction delays a pause and shows a countdown', async () => {
    await store({ friction: { pauseDelaySec: 2, lockDuringSchedule: false } });
    await popup.waitForTimeout(200);
    await popup.click('[data-pause="5"]');
    assert.match(await popup.textContent('#status'), /pausing in \d s/i);
    assert.equal(await visible('#home-grid'), false, 'paused before the countdown ended');
    await expectVisible(['#home-grid'], 4000);
    await popup.click('#resume');
  });
  await popup.evaluate(() => chrome.storage.local.set({ pausedUntil: 0 }));
  await store({ friction: { pauseDelaySec: 0, lockDuringSchedule: false } });

  await test('after the countdown test, hiding is back on', async () => {
    await expectHidden(['#home-grid']);
  });

  // Filters work on the feed, so show it (Clean preset) while testing them.
  const options = await context.newPage();
  options.on('pageerror', (e) => pageErrors.push(`options: ${e.message}`));
  await options.goto(`chrome-extension://${extensionId}/options/options.html`);

  await test('options page: keyword typed into Filters hides the matching video', async () => {
    await popup.click('[data-preset="clean"]');
    await expectVisible(['#home-grid']);
    await options.fill('[data-key="filters.keywords"]', 'cats\n/^never$/');
    await options.locator('[data-key="filters.keywords"]').blur();
    await page.waitForFunction(() => document.getElementById('v-cats').dataset.yffFiltered === 'keyword', null, { timeout: 2000 });
    await expectHidden(['#v-cats']);
    assert.deepEqual((await read()).filters.keywords, ['cats', '/^never$/']);
  });

  const baseFilters = (await popup.evaluate(() => YFF.DEFAULTS.filters));
  const setFilters = (patch) => store({ filters: { ...baseFilters, ...patch } });

  await test('channel filter matches @handle and name, on old and new item layouts', async () => {
    await setFilters({ channels: ['@rustlang', 'cats daily'] });
    await page.waitForFunction(() => document.getElementById('v-rust').dataset.yffFiltered === 'channel', null, { timeout: 2000 });
    assert.equal(await filtered('v-cats'), 'channel');
  });

  await test('Always show beats every other filter', async () => {
    await setFilters({ keywords: ['cats'], allowChannels: ['@catsdaily'] });
    await page.waitForFunction(() => !document.getElementById('v-cats').dataset.yffFiltered, null, { timeout: 2000 });
    await expectVisible(['#v-cats']);
  });

  await test('watched, duration and live filters', async () => {
    await setFilters({ hideWatched: true, watchedPercent: 90, minMinutes: 20, hideLive: true });
    await page.waitForFunction(() => document.getElementById('v-watched').dataset.yffFiltered === 'watched', null, { timeout: 2000 });
    assert.equal(await filtered('v-cats'), 'too short'); // 12:01
    assert.equal(await filtered('v-rust'), null); // 45:00
    assert.equal(await filtered('v-live'), 'live');
  });

  await test('dim mode keeps filtered videos in place, faded', async () => {
    await setFilters({ hideLive: true, mode: 'dim' });
    await page.waitForFunction(() => document.documentElement.dataset.yffFilterMode === 'dim', null, { timeout: 2000 });
    await expectVisible(['#v-live']);
    assert.ok(Number(await page.evaluate(() => getComputedStyle(document.getElementById('v-live')).opacity)) < 0.5);
  });

  await test('toolbar badge counts filtered videos on the tab', async () => {
    await page.waitForTimeout(400);
    const badge = await popup.evaluate((tabId) => chrome.action.getBadgeText({ tabId }), ytTabId);
    assert.equal(badge, '1');
    await setFilters({});
    await popup.waitForFunction((tabId) => chrome.action.getBadgeText({ tabId }).then((t) => t === ''), ytTabId, { timeout: 2000 });
  });

  await test('custom rule added on the options page hides its element; a rule for another page doesn’t', async () => {
    await options.fill('#add-rule [name=selector]', '#custom-target');
    await options.click('#add-rule button');
    await expectHidden(['#custom-target']);
    await options.fill('#add-rule [name=selector]', '#pick-me');
    await options.selectOption('#add-rule [name=page]', 'search');
    await options.click('#add-rule button');
    await page.waitForTimeout(300);
    assert.equal(await visible('#pick-me'), true, 'search-only rule applied on a watch page');
    await options.click('#rules tr:last-child .remove');
    await options.waitForFunction(() => document.querySelectorAll('#rules tr').length === 1, null, { timeout: 2000 });
  });

  await test('invalid selector is refused', async () => {
    await options.fill('#add-rule [name=selector]', 'div[');
    await options.click('#add-rule button');
    assert.equal(await options.isVisible('#rule-error'), true);
    assert.equal((await read()).custom.length, 1);
  });

  await test('picker: click an element, Enter hides it; the click never reaches the page', async () => {
    await tabMessage({ type: 'yff:pick' });
    await page.bringToFront();
    await page.click('#pick-me span');
    await page.keyboard.press('Enter');
    await expectHidden(['#pick-me span']);
    const rule = (await read()).custom.at(-1);
    assert.deepEqual([rule.selector, rule.page], ['#pick-me span', 'watch']);
    assert.ok(!(await log()).includes('page-click'), 'click reached the page');
  });

  await test('content script reports this tab’s counts', async () => {
    const stats = await tabMessage({ type: 'yff:stats' });
    assert.equal(stats.requestsPatched, 4);
    assert.equal(stats.timersBoosted, 1);
    assert.equal(stats.adsFastForwarded, 1);
    assert.equal(stats.dialogsDismissed, 2);
    assert.ok(stats.stallsRecovered >= 2, `stallsRecovered ${stats.stallsRecovered}`);
    assert.equal(stats.page, 'watch');
  });

  await test('turning a playback fix off in the popup reaches the page', async () => {
    await popup.fill('#search', 'ad-slot');
    await popup.click('[data-key="fix.adFastForward"]');
    await popup.fill('#search', '');
    await page.waitForTimeout(200);
    await page.evaluate(() => document.getElementById('movie_player').classList.add('ad-showing'));
    await page.waitForTimeout(400);
    assert.notEqual(await page.evaluate(() => document.querySelector('video').playbackRate), 16);
    await page.evaluate(() => document.getElementById('movie_player').classList.remove('ad-showing'));
  });

  await test('backup: export, import, reset', async () => {
    const [download] = await Promise.all([options.waitForEvent('download'), options.click('#export')]);
    const exported = JSON.parse(readFileSync(await download.path(), 'utf8'));
    assert.equal(exported.settings.custom.at(-1).selector, '#pick-me span');
    exported.settings.hide.comments = true;
    exported.settings.custom = [];
    const file = path.join(userDataDir, 'import.json');
    writeFileSync(file, JSON.stringify(exported));
    await options.setInputFiles('#import', file);
    await options.waitForFunction(() => /Imported/.test(document.querySelector('#backup-note').textContent), null, { timeout: 2000 });
    const imported = await read();
    assert.equal(imported.hide.comments, true);
    assert.deepEqual(imported.custom, []);
    options.once('dialog', (dialog) => dialog.accept());
    await options.click('#reset');
    await options.waitForFunction(() => /Reset/.test(document.querySelector('#backup-note').textContent), null, { timeout: 2000 });
    assert.deepEqual(await read(), {});
    await expectVisible(['#comments', '#pick-me span']);
  });

  // Redirects reload the page, so they come last.
  await test('Shorts open in the normal player', async () => {
    await store({ hide: { ...(await popup.evaluate(() => YFF.DEFAULTS.hide)), shortsRedirect: true } });
    await page.goto('https://www.youtube.com/shorts/abc');
    await page.waitForURL('https://www.youtube.com/watch?v=abc', { timeout: 3000 });
  });

  await test('Home redirect; hidden Subscriptions sends its feed home without looping', async () => {
    const hide = await popup.evaluate(() => YFF.DEFAULTS.hide);
    await store({ homeRedirect: 'subscriptions', hide });
    await page.goto('https://www.youtube.com/');
    await page.waitForURL('https://www.youtube.com/feed/subscriptions', { timeout: 3000 });
    await store({ hide: { ...hide, subscriptions: true } });
    await page.waitForURL('https://www.youtube.com/', { timeout: 3000 });
    await page.waitForTimeout(600);
    assert.equal(page.url(), 'https://www.youtube.com/');
  });

  await test('hidden Explore sends Trending home', async () => {
    await store({ homeRedirect: 'off', hide: { ...(await popup.evaluate(() => YFF.DEFAULTS.hide)), explore: true } });
    await page.goto('https://www.youtube.com/feed/trending');
    await page.waitForURL('https://www.youtube.com/', { timeout: 3000 });
  });

  await test('no uncaught errors', async () => {
    assert.deepEqual(pageErrors, []);
  });
} finally {
  await context.close();
  rmSync(userDataDir, { recursive: true, force: true });
  console.log(results.join('\n'));
}
