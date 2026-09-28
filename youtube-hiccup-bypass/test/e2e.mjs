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
  const gate = { resolve() { __timers.gate = performance.now() - t0; } };
  setTimeout(function () { gate.resolve(1); }, 5000);                        // the startup gate
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
    return route.fulfill({ contentType: 'text/html', body: WATCH_PAGE });
  });

  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.goto('https://www.youtube.com/watch?v=test');
  const log = () => page.evaluate(() => window.__log);

  await test('startup gate timer is shortened, ordinary timers are not', async () => {
    await page.waitForFunction(() => window.__timers.control !== undefined, null, { timeout: 4000 });
    const timers = await page.evaluate(() => window.__timers);
    assert.ok(timers.gate < 300, `gate fired after ${timers.gate} ms`);
    assert.ok(timers.control >= 1400, `control fired after ${timers.control} ms`);
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

  await test('a stalled stream gets re-seeked through the player API', async () => {
    await page.evaluate(() => {
      const video = document.querySelector('video');
      video.src = '/stall.mp4';
      video.play().catch(() => {});
    });
    assert.equal(await page.evaluate(() => document.querySelector('video').paused), false, 'video did not start');
    await page.waitForFunction(() => window.__log.includes('seekTo'), null, { timeout: 6000 });
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
    assert.ok(stats.timersBoosted >= 1, `timersBoosted ${stats.timersBoosted}`);
    assert.equal(stats.adsFastForwarded, 1);
    assert.equal(stats.dialogsDismissed, 2);
    assert.ok(stats.stallsRecovered >= 1, `stallsRecovered ${stats.stallsRecovered}`);
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
