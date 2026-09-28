// Loads the unpacked extension into headless Chromium and serves a stand-in watch page at www.youtube.com (routed,
// never fetched), then checks each feature against it. Run: npm test
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
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

const WATCH_PAGE = `<!doctype html><html><body>
<div id="movie_player" class="html5-video-player">
  <video class="html5-main-video"></video>
  <div class="ytp-ad-skip-button-slot"><button class="ytp-skip-ad-button">Skip</button></div>
</div>
<script>
  window.__log = [];
  window.__timers = {};
  const player = document.getElementById('movie_player');
  player.getPlaybackRate = () => 1.5;
  player.getVideoData = () => ({ video_id: 'test' });
  for (const m of ['seekTo', 'pauseVideo', 'playVideo', 'loadVideoById']) player[m] = () => __log.push(m);
  document.querySelector('.ytp-skip-ad-button').addEventListener('click', () => __log.push('skip'));

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
    return route.fulfill({ contentType: 'text/html', body: WATCH_PAGE });
  });

  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.goto('https://www.youtube.com/watch?v=test');
  const log = () => page.evaluate(() => window.__log);

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

  const popup = await context.newPage();
  popup.on('pageerror', (e) => pageErrors.push(`popup: ${e.message}`));
  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);

  await test('popup opens and loads settings', async () => {
    await popup.waitForFunction(() => document.querySelector('[name=timerBoost]').checked, null, { timeout: 2000 });
  });

  await test('content script reports this tab’s counts', async () => {
    const stats = await popup.evaluate(async () => {
      for (const tab of await chrome.tabs.query({})) {
        try {
          return await chrome.tabs.sendMessage(tab.id, { type: 'ythb:stats' }, { frameId: 0 });
        } catch {}
      }
    });
    assert.ok(stats, 'no tab answered');
    assert.equal(stats.requestsPatched, 4);
    assert.equal(stats.timersBoosted, 1);
    assert.equal(stats.adsFastForwarded, 1);
    assert.equal(stats.dialogsDismissed, 2);
    assert.ok(stats.stallsRecovered >= 2, `stallsRecovered ${stats.stallsRecovered}`);
  });

  await test('turning a feature off in the popup reaches the page', async () => {
    await popup.click('[name=adFastForward]');
    await page.waitForTimeout(200);
    await page.evaluate(() => document.getElementById('movie_player').classList.add('ad-showing'));
    await page.waitForTimeout(400);
    const rate = await page.evaluate(() => document.querySelector('video').playbackRate);
    assert.notEqual(rate, 16);
  });

  await test('no uncaught errors', async () => {
    assert.deepEqual(pageErrors, []);
  });
} finally {
  await context.close();
  rmSync(userDataDir, { recursive: true, force: true });
  console.log(results.join('\n'));
}
