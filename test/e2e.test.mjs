/* End-to-end tests: the unpacked extension in headless Chromium, real wheel
 * events through the Chrome DevTools Protocol, fixture videos whose frames
 * can be read back from pixels. */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  startServer,
  launchWithExtension,
  setSettings,
  resetSettings,
  centerOf,
  wheel,
  wheelBurst,
  wheelBurstFast,
  waitForVideos,
  near,
} from './harness.mjs';

let srv;
let ext;
let page;

const RATE = 0.5 / 100; // default: 0.5 s per 100 px (no velocity boost below 1500 px/s)

const time = (selector) => page.evaluate((s) => document.querySelector(s).currentTime, selector);
const isPaused = (selector) => page.evaluate((s) => document.querySelector(s).paused, selector);
const scroll = () => page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
/* Page scroll movement since `from`. */
const scrolled = async (from) => {
  const now = await scroll();
  return { x: now.x - from.x, y: now.y - from.y };
};
const pageWheel = () => page.evaluate(() => ({ ...window.__pageWheel }));
const settled = (selector = '#plain') =>
  page.waitForFunction((s) => !document.querySelector(s).seeking, selector, { timeout: 5000 });
const seekTo = async (selector, t) => {
  await page.evaluate(
    ([s, t]) =>
      new Promise((resolve) => {
        const v = document.querySelector(s);
        v.addEventListener('seeked', () => resolve(), { once: true });
        v.currentTime = t;
      }),
    [selector, t]
  );
};

async function openFixture() {
  await page.goto(srv.url + 'index.html');
  await waitForVideos(page);
  await seekTo('#plain', 10);
}

/* Move the pointer off every video (onto the heading), ending any session. */
async function leaveVideo() {
  const h = await page.locator('h1').boundingBox();
  await page.mouse.move(h.x + 10, h.y + 10);
}

before(async () => {
  srv = await startServer();
  ext = await launchWithExtension();
  page = await ext.context.newPage();
});

after(async () => {
  await ext?.close();
  await srv?.close();
});

beforeEach(async () => {
  await resetSettings(ext.worker, null);
  await openFixture();
});

/* ---- Core behaviour ------------------------------------------------ */

test('sideways wheel over a video seeks at a constant rate and never reaches the page', async () => {
  const p = await centerOf(page, '#plain');
  const s0 = await scroll();
  await wheel(page, p.x, p.y, 100, 0);
  await settled();
  assert.ok(near(await time('#plain'), 10 + 100 * RATE, 0.01));
  assert.deepEqual(await scrolled(s0), { x: 0, y: 0 });
  // Consumed events are stopped before they reach document- or element-level
  // handlers (where players listen). A page listener on window in the capture
  // phase can still observe them, since it may be registered before ours.
  const seen = await pageWheel();
  assert.equal(seen.document, 0);
  assert.equal(seen.video, 0);
});

test('every bit of movement counts: sub-pixel deltas accumulate without a dead zone', async () => {
  const p = await centerOf(page, '#plain');
  await wheelBurst(page, p.x, p.y, 0.5, 0, 40, 4);
  await settled();
  assert.ok(near(await time('#plain'), 10 + 20 * RATE, 0.01), 'forty 0.5 px events = 20 px');
  await wheelBurst(page, p.x, p.y, 0.1, 0, 50, 4);
  await settled();
  assert.ok(near(await time('#plain'), 10 + 25 * RATE, 0.01), 'fifty 0.1 px events = 5 px more');
});

test('scrolling left rewinds and clamps at the start; right clamps at the end', async () => {
  const p = await centerOf(page, '#plain');
  await wheel(page, p.x, p.y, -100, 0);
  await settled();
  assert.ok(near(await time('#plain'), 9.5, 0.01));
  await wheelBurst(page, p.x, p.y, -100, 0, 25, 8); // 12.5 s back: past the start
  await settled();
  assert.equal(await time('#plain'), 0);
  await wheelBurst(page, p.x, p.y, 100, 0, 130, 8); // 65 s forward: past the end
  await settled();
  const duration = await page.evaluate(() => document.querySelector('#plain').duration);
  assert.ok(near(await time('#plain'), duration, 0.05));
});

test('vertical wheel over a video scrolls the page and leaves the video alone', async () => {
  const p = await centerOf(page, '#plain');
  const s0 = await scroll();
  await wheel(page, p.x, p.y, 0, 120);
  await page.waitForTimeout(100);
  assert.equal(await time('#plain'), 10);
  assert.equal((await scrolled(s0)).y, 120);
  assert.equal((await pageWheel()).window, 1, 'the page saw the event');
});

test('sideways wheel away from any video scrolls the page sideways', async () => {
  const p = await centerOf(page, '#text');
  const s0 = await scroll();
  await wheel(page, p.x, p.y, 200, 0);
  await page.waitForTimeout(100);
  assert.equal(await time('#plain'), 10);
  assert.equal((await scrolled(s0)).x, 200);
});

test('a mostly sideways trackpad swipe scrubs; a mostly vertical one scrolls', async () => {
  const p = await centerOf(page, '#plain');
  const s0 = await scroll();
  await wheelBurst(page, p.x, p.y, 30, 5, 10, 8);
  await settled();
  assert.ok(near(await time('#plain'), 10 + 300 * RATE, 0.02));
  assert.deepEqual(await scrolled(s0), { x: 0, y: 0 }, 'cross-axis noise never moves the page');

  await page.waitForTimeout(300); // let the axis lock expire
  await wheelBurst(page, p.x, p.y, 3, 8, 10, 8);
  await page.waitForTimeout(100);
  assert.ok(near(await time('#plain'), 10 + 300 * RATE, 0.02), 'video untouched by the vertical swipe');
  assert.ok((await scrolled(s0)).y >= 60, 'page scrolled');
});

test('the first diagonal events are buffered, then applied in full once the axis is known', async () => {
  const p = await centerOf(page, '#plain');
  // 1 px right + 1 px down: not decisive. Then a clearly sideways swipe.
  const s0 = await scroll();
  await wheel(page, p.x, p.y, 1, 1);
  await wheelBurst(page, p.x, p.y, 30, 2, 5, 8);
  await settled();
  assert.ok(near(await time('#plain'), 10 + 151 * RATE, 0.02), 'the buffered pixel was not lost');
  assert.deepEqual(await scrolled(s0), { x: 0, y: 0 });
});

test('scrolling kept up for seconds in one direction speeds up; a reversal resets it', async () => {
  const p = await centerOf(page, '#plain');
  // Slow single-pixel events about every 90 ms: 1.8 s, then about 4 s more
  // (the ramp runs from 3 s to 6 s of continuous scrolling).
  await wheelBurst(page, p.x, p.y, 1, 0, 20, 60);
  await settled();
  const t1 = await time('#plain');
  const first = t1 - 10;
  assert.ok(near(first, 20 * RATE, 0.01), `no speed-up in the first two seconds: ${first}`);
  await wheelBurst(page, p.x, p.y, 1, 0, 45, 60);
  await settled();
  const second = (await time('#plain')) - t1;
  const baseline = first * (45 / 20);
  assert.ok(second > baseline * 1.5, `sustained scrolling sped up: ${first} then ${second} (plain rate would give ${baseline})`);
  // Reverse: back to the plain rate at once.
  const t2 = await time('#plain');
  await wheelBurst(page, p.x, p.y, -1, 0, 5, 60);
  await settled();
  assert.ok(near(t2 - (await time('#plain')), 5 * RATE, 0.01), 'reversal resets the speed-up');
});

test('one wheel event never jumps much more than a second; the boost above 1500 px/s is small', async () => {
  const p = await centerOf(page, '#plain');
  await wheel(page, p.x, p.y, 2000, 0); // 10 s raw in one event
  await settled();
  const t = await time('#plain');
  assert.ok(t > 11 && t < 12.2, `capped at about a second: ${t}`);
});

test('Ctrl + wheel (browser zoom) is left alone', async () => {
  const p = await centerOf(page, '#plain');
  await wheel(page, p.x, p.y, 100, 0, ['Control']);
  await page.waitForTimeout(100);
  assert.equal(await time('#plain'), 10);
});

test('a pointer parked over a video since page load still scrubs on the first wheel event', async () => {
  // Position the pointer, then load the page: no mouseover fires, so the
  // extension has not yet seen the pointer over the video.
  const p = await centerOf(page, '#plain');
  await page.mouse.move(p.x, p.y);
  await page.goto(srv.url + 'index.html');
  await waitForVideos(page);
  await seekTo('#plain', 10);
  await page.mouse.wheel(100, 0);
  await settled();
  assert.ok(near(await time('#plain'), 10.5, 0.01), 'first event scrubs');
  const s0 = await scroll();
  await page.mouse.wheel(100, 0);
  await settled();
  assert.ok(near(await time('#plain'), 11, 0.01));
  assert.deepEqual(await scrolled(s0), { x: 0, y: 0 }, 'from the second event on, the page never moves');
});

/* ---- Playback ------------------------------------------------------- */

test('playback pauses while scrubbing and resumes by itself shortly after the wheel stops', async () => {
  await page.evaluate(() => document.querySelector('#plain').play());
  await page.waitForFunction(() => !document.querySelector('#plain').paused);
  const p = await centerOf(page, '#plain');
  await wheelBurst(page, p.x, p.y, 5, 0, 20, 16);
  assert.equal(await isPaused('#plain'), true, 'paused during the gesture');
  await settled();
  const t = await time('#plain');
  await page.waitForTimeout(250);
  assert.equal(await isPaused('#plain'), true, 'still paused right after the wheel stops');
  assert.equal(await time('#plain'), t, 'on the frame it landed on');
  const t0 = Date.now();
  await page.waitForFunction(() => !document.querySelector('#plain').paused, null, { timeout: 3000 });
  assert.ok(Date.now() - t0 < 1500, 'resumed without the pointer moving');
});

test('moving the pointer off the video resumes at once', async () => {
  await page.evaluate(() => document.querySelector('#plain').play());
  await page.waitForFunction(() => !document.querySelector('#plain').paused);
  const p = await centerOf(page, '#plain');
  await wheelBurst(page, p.x, p.y, 5, 0, 5, 16);
  assert.equal(await isPaused('#plain'), true);
  await leaveVideo();
  await page.waitForFunction(() => !document.querySelector('#plain').paused, null, { timeout: 500 });
});

test('a slow, intermittent wheel keeps the video paused between events', async () => {
  await page.evaluate(() => document.querySelector('#plain').play());
  await page.waitForFunction(() => !document.querySelector('#plain').paused);
  const p = await centerOf(page, '#plain');
  for (let i = 0; i < 4; i++) {
    await wheel(page, p.x, p.y, 3, 0);
    await page.waitForTimeout(350);
    assert.equal(await isPaused('#plain'), true, `still paused after gap ${i}`);
  }
  await page.waitForFunction(() => !document.querySelector('#plain').paused, null, { timeout: 3000 });
});

test('a site that restarts playback after every seek is held until the gesture ends', async () => {
  await page.evaluate(() => {
    const v = document.querySelector('#plain');
    window.__replays = 0;
    v.addEventListener('seeked', () => {
      window.__replays++;
      v.play();
    });
    v.play();
  });
  await page.waitForFunction(() => !document.querySelector('#plain').paused);
  const p = await centerOf(page, '#plain');
  await wheelBurst(page, p.x, p.y, 5, 0, 20, 16);
  await settled();
  const held = () =>
    page.evaluate(() => {
      const v = document.querySelector('#plain');
      return { still: v.paused || v.playbackRate === 0, t: v.currentTime };
    });
  const h0 = await held();
  assert.ok(h0.still, 'held despite the site calling play()');
  assert.ok((await page.evaluate(() => window.__replays)) >= 1);
  await page.waitForTimeout(250);
  const h1 = await held();
  assert.ok(h1.still && near(h1.t, h0.t, 0.02), `still held on the same frame: ${JSON.stringify([h0, h1])}`);
  await page.waitForFunction(
    () => {
      const v = document.querySelector('#plain');
      return !v.paused && v.playbackRate === 1;
    },
    null,
    { timeout: 3000 }
  );
});

test('a site that replays on every pause is held still with playbackRate 0', async () => {
  await page.evaluate(() => {
    const v = document.querySelector('#plain');
    window.__replays = 0;
    v.addEventListener('pause', () => {
      window.__replays++;
      v.play();
    });
    v.play();
  });
  await page.waitForFunction(() => !document.querySelector('#plain').paused);
  const p = await centerOf(page, '#plain');
  await wheelBurst(page, p.x, p.y, 5, 0, 10, 16);
  await settled();
  const t0 = await time('#plain');
  await page.waitForTimeout(300);
  const state = await page.evaluate(() => {
    const v = document.querySelector('#plain');
    return { t: v.currentTime, rate: v.playbackRate, replays: window.__replays };
  });
  assert.ok(near(state.t, t0, 0.02), `video did not advance: ${t0} -> ${state.t}`);
  assert.equal(state.rate, 0, 'held at playbackRate 0');
  assert.ok(state.replays < 50, `no pause war: ${state.replays} replays`);
  await page.waitForFunction(() => document.querySelector('#plain').playbackRate === 1, null, { timeout: 3000 });
  await page.waitForTimeout(300);
  assert.ok((await time('#plain')) > state.t, 'playing again at normal rate');
});

test('scrolling the page away from a held video ends the session and resumes it', async () => {
  await page.evaluate(() => document.querySelector('#plain').play());
  await page.waitForFunction(() => !document.querySelector('#plain').paused);
  const p = await centerOf(page, '#plain');
  await wheelBurst(page, p.x, p.y, 5, 0, 5, 16);
  assert.equal(await isPaused('#plain'), true);
  await wheel(page, p.x, p.y, 0, 800); // a vertical notch scrolls the video off screen, pointer still
  await page.waitForFunction(() => !document.querySelector('#plain').paused, null, { timeout: 3000 });
});

test('turning the extension off mid-session restores playback', async () => {
  await page.evaluate(() => document.querySelector('#plain').play());
  await page.waitForFunction(() => !document.querySelector('#plain').paused);
  const p = await centerOf(page, '#plain');
  await wheelBurst(page, p.x, p.y, 5, 0, 5, 16);
  assert.equal(await isPaused('#plain'), true);
  await setSettings(ext.worker, page, { enabled: false });
  await page.waitForFunction(() => !document.querySelector('#plain').paused, null, { timeout: 3000 });
});

test('cross-axis noise during a scrub is not a turn to page scrolling', async () => {
  const p = await centerOf(page, '#plain');
  const s0 = await scroll();
  await wheelBurst(page, p.x, p.y, 30, 0.5, 4, 8);
  await wheel(page, p.x, p.y, 0, 1); // trackpad noise
  await wheelBurst(page, p.x, p.y, 3, 1, 3, 8); // small events inside the gesture
  await wheelBurst(page, p.x, p.y, 30, 0.5, 4, 8);
  await settled();
  assert.ok(near(await time('#plain'), 10 + 249 * RATE, 0.02), 'all sideways movement counted');
  assert.deepEqual(await scrolled(s0), { x: 0, y: 0 });
});

test('a click or a key during a session hands control back without restarting playback', async () => {
  await page.evaluate(() => document.querySelector('#plain').play());
  await page.waitForFunction(() => !document.querySelector('#plain').paused);
  const p = await centerOf(page, '#plain');
  await wheelBurst(page, p.x, p.y, 5, 0, 10, 16);
  assert.equal(await isPaused('#plain'), true);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(300);
  assert.equal(await isPaused('#plain'), true, 'a click does not restart it');
  await leaveVideo();
  await page.waitForTimeout(400);
  assert.equal(await isPaused('#plain'), true, 'nor does leaving afterwards: the user took over');

  await page.evaluate(() => document.querySelector('#plain').play());
  await page.waitForFunction(() => !document.querySelector('#plain').paused);
  await wheelBurst(page, p.x, p.y, 5, 0, 10, 16);
  assert.equal(await isPaused('#plain'), true);
  await page.keyboard.press('Alt'); // a modifier does not count as taking over
  await page.waitForFunction(() => !document.querySelector('#plain').paused, null, { timeout: 3000 });
});

test('with resume off the video stays paused after scrubbing', async () => {
  await setSettings(ext.worker, page, { resumeAfter: false });
  await page.evaluate(() => document.querySelector('#plain').play());
  await page.waitForFunction(() => !document.querySelector('#plain').paused);
  const p = await centerOf(page, '#plain');
  await wheelBurst(page, p.x, p.y, 5, 0, 10, 16);
  await leaveVideo();
  await page.waitForTimeout(900);
  assert.equal(await isPaused('#plain'), true);
});

test('vertical scrolling works right after (and during) a scrub', async () => {
  const p = await centerOf(page, '#plain');
  const s0 = await scroll();
  await wheelBurst(page, p.x, p.y, 2, 0, 10, 8);
  await wheel(page, p.x, p.y, 0, 100); // a mouse wheel notch, no pause in between
  await page.waitForTimeout(100);
  const t = await time('#plain');
  assert.ok(near(t, 10 + 20 * RATE, 0.02), `video at ${t}`);
  assert.equal((await scrolled(s0)).y, 100, 'the page scrolled');
});

test('a sideways swipe right after a vertical scroll still scrubs', async () => {
  const p = await centerOf(page, '#plain');
  const s0 = await scroll();
  await wheel(page, p.x, p.y, 0, 100);
  await wheelBurst(page, p.x, p.y, 30, 2, 5, 8); // no pause: a trackpad turning sideways
  await settled();
  assert.ok(near(await time('#plain'), 10 + 150 * RATE, 0.02), 'all sideways movement scrubbed');
  const sc = await scrolled(s0);
  assert.equal(sc.y, 100, 'only the vertical notch scrolled the page');
  assert.equal(sc.x, 0);
});

/* ---- Finding the video ---------------------------------------------- */

test('a video underneath a control overlay is scrubbed', async () => {
  const p = await centerOf(page, '#overlayControls');
  await wheel(page, p.x, p.y, 50, 0);
  await settled('#overlay');
  assert.ok(near(await time('#overlay'), 50 * RATE, 0.01));
});

test('a video with pointer-events: none is scrubbed through its container', async () => {
  const p = await centerOf(page, '#noeventsWrap');
  await wheel(page, p.x, p.y, 50, 0);
  await settled('#noeventsVideo');
  assert.ok(near(await time('#noeventsVideo'), 50 * RATE, 0.01));
});

test('a video inside an open shadow root is scrubbed', async () => {
  const p = await centerOf(page, '#shadowHost video'); // locators pierce open shadow roots
  await wheel(page, p.x, p.y, 50, 0);
  await page.waitForFunction(() => !document.querySelector('#shadowHost').shadowRoot.querySelector('video').seeking);
  const t = await page.evaluate(() => document.querySelector('#shadowHost').shadowRoot.querySelector('video').currentTime);
  assert.ok(near(t, 50 * RATE, 0.01));
});

test('a video inside a closed shadow root is scrubbed', async () => {
  const box = await page.evaluate(() => {
    const v = window.__closedVideo();
    v.scrollIntoView({ block: 'center' });
    const r = v.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await wheel(page, box.x, box.y, 50, 0);
  await page.waitForFunction(() => !window.__closedVideo().seeking);
  assert.ok(near(await page.evaluate(() => window.__closedVideo().currentTime), 50 * RATE, 0.01));
});

test('a video that has no metadata yet swallows sideways input, then scrubs once it can', async () => {
  const p = await centerOf(page, '#lazy');
  const s0 = await scroll();
  await wheel(page, p.x, p.y, 100, 0);
  await page.waitForTimeout(100);
  assert.deepEqual(await scrolled(s0), { x: 0, y: 0 }, 'the page did not scroll sideways');
  assert.equal(await page.evaluate(() => document.querySelector('#lazy').readyState), 0);
  await page.evaluate(
    () =>
      new Promise((r) => {
        const v = document.querySelector('#lazy');
        v.addEventListener('loadedmetadata', r, { once: true });
        v.load();
      })
  );
  await page.waitForFunction(() => document.querySelector('#lazy').seekable.length > 0);
  await page.waitForTimeout(200); // a new gesture, not a continuation of the one above
  await wheel(page, p.x, p.y, 100, 0);
  await settled('#lazy');
  assert.ok(near(await time('#lazy'), 0.5, 0.01));
});

test('a video replaced mid-gesture ends the session cleanly and the new media scrubs', async () => {
  await page.evaluate(() => document.querySelector('#plain').play());
  await page.waitForFunction(() => !document.querySelector('#plain').paused);
  const p = await centerOf(page, '#plain');
  await wheelBurst(page, p.x, p.y, 5, 0, 5, 16);
  await page.evaluate(() => {
    const v = document.querySelector('#plain');
    v.src = 'clip-long-gop.webm'; // fires `emptied`
  });
  await page.waitForFunction(() => document.querySelector('#plain').readyState >= 1);
  await wheelBurst(page, p.x, p.y, 4, 0, 5, 16);
  await settled();
  assert.ok(near(await time('#plain'), 20 * RATE, 0.02), 'scrubbed the new media from its start');
  assert.equal(await isPaused('#plain'), true);
  await leaveVideo();
  await page.waitForTimeout(400);
  assert.equal(await isPaused('#plain'), true, 'nothing to resume: the old media is gone');
});

test('a video inside an iframe is scrubbed and the parent page does not scroll', async () => {
  const frame = page.frame({ url: /frame\.html/ });
  const p = await centerOf(page, '#frameVideo', frame);
  const s0 = await scroll();
  await wheel(page, p.x, p.y, 50, 0);
  await frame.waitForFunction(() => !document.querySelector('#frameVideo').seeking);
  const t = await frame.evaluate(() => document.querySelector('#frameVideo').currentTime);
  assert.ok(near(t, 50 * RATE, 0.01));
  assert.deepEqual(await scrolled(s0), { x: 0, y: 0 });
});

/* ---- Settings ------------------------------------------------------- */

test('speed setting changes the rate', async () => {
  await setSettings(ext.worker, page, { secondsPer100px: 2 });
  const p = await centerOf(page, '#plain');
  await wheel(page, p.x, p.y, 40, 0);
  await settled();
  assert.ok(near(await time('#plain'), 10.8, 0.01));
});

test('invert swaps the direction', async () => {
  await setSettings(ext.worker, page, { invert: true });
  const p = await centerOf(page, '#plain');
  await wheel(page, p.x, p.y, 100, 0);
  await settled();
  assert.ok(near(await time('#plain'), 9.5, 0.01));
});

test('the fine-control modifier scrubs at a tenth of the speed', async () => {
  const p = await centerOf(page, '#plain');
  await wheel(page, p.x, p.y, 100, 0, ['Alt']);
  await settled();
  assert.ok(near(await time('#plain'), 10 + 10 * RATE, 0.005));
});

test('a required modifier gates scrubbing', async () => {
  await setSettings(ext.worker, page, { requireModifier: 'shift' });
  const p = await centerOf(page, '#plain');
  const s0 = await scroll();
  await wheel(page, p.x, p.y, 100, 0);
  await page.waitForTimeout(100);
  assert.equal(await time('#plain'), 10);
  assert.equal((await scrolled(s0)).x, 100, 'without the modifier the page scrolls');
  await page.waitForTimeout(300);
  await wheel(page, p.x, p.y, 100, 0, ['Shift']);
  await settled();
  assert.ok(near(await time('#plain'), 10.5, 0.01));
});

test('Shift + vertical wheel scrubs like a sideways wheel', async () => {
  const p = await centerOf(page, '#plain');
  const s0 = await scroll();
  await wheel(page, p.x, p.y, 0, 100, ['Shift']);
  await settled();
  assert.ok(near(await time('#plain'), 10.5, 0.01));
  assert.deepEqual(await scrolled(s0), { x: 0, y: 0 });
});

test('the master switch and disabled sites turn scrubbing off', async () => {
  const p = await centerOf(page, '#plain');
  await setSettings(ext.worker, page, { enabled: false });
  let s0 = await scroll();
  await wheel(page, p.x, p.y, 100, 0);
  await page.waitForTimeout(100);
  assert.equal(await time('#plain'), 10);
  assert.equal((await scrolled(s0)).x, 100);

  await setSettings(ext.worker, page, { enabled: true, disabledSites: ['127.0.0.1'] });
  await page.waitForTimeout(300);
  s0 = await scroll();
  await wheel(page, p.x, p.y, 100, 0);
  await page.waitForTimeout(100);
  assert.equal(await time('#plain'), 10);
  assert.equal((await scrolled(s0)).x, 100);
});

test('a disabled top-level site also disables players embedded in its iframes', async () => {
  await setSettings(ext.worker, page, { disabledSites: ['127.0.0.1'] });
  const frame = page.frame({ url: /frame\.html/ });
  const p = await centerOf(page, '#frameVideo', frame);
  await wheel(page, p.x, p.y, 100, 0);
  await page.waitForTimeout(100);
  assert.equal(await frame.evaluate(() => document.querySelector('#frameVideo').currentTime), 0);
});

/* ---- Frames and responsiveness ------------------------------------- */

test('the frame on screen matches the scrub position', async () => {
  const p = await centerOf(page, '#plain');
  await wheel(page, p.x, p.y, 61, 0); // 0.305 s -> t = 10.305 s, inside frame 309
  await settled();
  const t = await time('#plain');
  assert.ok(near(t, 10.305, 0.01));
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const frame = await page.evaluate(() => window.readVideoFrame(document.querySelector('#plain')));
  assert.ok(frame.ok && near(frame.frameIndex, 309, 1), `frame on screen is ${JSON.stringify(frame)}`);
});

test('a fast burst on an expensive (long-GOP) clip shows frames progressively and lands exactly', async () => {
  const p = await centerOf(page, '#longgop');
  await page.evaluate(() => {
    const v = document.querySelector('#longgop');
    window.__frames = [];
    const tick = (now, meta) => {
      const last = window.__frames[window.__frames.length - 1];
      if (!last || last.t !== meta.mediaTime) window.__frames.push({ t: meta.mediaTime, at: now });
      v.requestVideoFrameCallback(tick);
    };
    v.requestVideoFrameCallback(tick);
  });
  await seekTo('#longgop', 12);
  // 60 events of 15 px at 60 Hz (under the boost threshold): 900 px = 4.5 s of media in 1 s.
  const started = Date.now();
  await wheelBurstFast(page, p.x, p.y, 15, 0, 60, 16);
  const inputDone = Date.now();
  await settled('#longgop');
  const landed = Date.now();
  const t = await time('#longgop');
  assert.ok(near(t, 12 + 900 * RATE, 0.01), `landed at ${t}`);
  const frames = await page.evaluate(() => window.__frames);
  const during = frames.filter((f) => f.t > 12 && f.t < 12 + 900 * RATE);
  assert.ok(during.length >= 6, `only ${during.length} intermediate frames were shown`);
  assert.ok(inputDone - started < 1600, `input took ${inputDone - started} ms (should be about 1 s)`);
  assert.ok(landed - inputDone < 1000, `took ${landed - inputDone} ms to settle after input stopped`);
});

/* ---- Press and hold ---------------------------------------------------- */

test('press and hold on a playing video plays it at 2x until release, and the release is not a click', async () => {
  await page.evaluate(() => document.querySelector('#plain').play());
  await page.waitForFunction(() => !document.querySelector('#plain').paused);
  const p = await centerOf(page, '#plain');
  const rate = () => page.evaluate(() => document.querySelector('#plain').playbackRate);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.waitForTimeout(200);
  assert.equal(await rate(), 1, 'not yet: a short press is a click');
  await page.waitForTimeout(500);
  assert.equal(await rate(), 2, 'held: 2x');
  const badge = () =>
    page.evaluate(() => {
      const el = document.querySelector('scroll-to-scrub-speed');
      if (!el || !el.matches(':popover-open')) return null;
      const r = el.getBoundingClientRect();
      return { rate: Number(el.dataset.rate), x: r.left + r.width / 2, y: r.top };
    });
  const box = await page.locator('#plain').boundingBox();
  let b = await badge();
  assert.ok(b && b.rate === 2, `the speed badge shows: ${JSON.stringify(b)}`);
  assert.ok(near(b.x, box.x + box.width / 2, 3) && b.y > box.y && b.y < box.y + 40, 'at the top centre of the video');
  assert.equal(
    await page.evaluate(() => {
      const el = document.querySelector('scroll-to-scrub-hud');
      return !!el && el.matches(':popover-open');
    }),
    false,
    'the timeline is not shown while holding'
  );

  // Sideways scrolling while holding steps the speed by quarters, trackball
  // like: the further the wheel rolls, the more steps, paced 120 ms apart.
  await wheelBurst(page, p.x, p.y, 20, 0, 12, 8); // 240 px over ~0.4 s
  await page.waitForTimeout(60);
  let r = await rate();
  assert.ok(r >= 2.5 && r <= 3.25, `a flick right: several steps up: ${r}`);
  assert.equal((await badge()).rate, r);
  await page.waitForTimeout(250);
  await page.mouse.wheel(40, 0); // a short nudge after the wheel stopped
  await page.waitForTimeout(60);
  assert.equal(await rate(), r + 0.25, 'a nudge: one step');
  await wheelBurst(page, p.x, p.y, -20, 0, 12, 8); // straight back the other way
  await page.waitForTimeout(60);
  const back = await rate();
  assert.ok(back <= r - 0.25 && back >= r - 1, `a flick left steps down: ${r + 0.25} -> ${back}`);
  await page.waitForTimeout(250);
  await page.mouse.wheel(10, 0); // too small on its own
  await page.waitForTimeout(60);
  assert.equal(await rate(), back, 'a nudge below the threshold does nothing');
  const played = await time('#plain');
  assert.ok(played > 10.5 && played < 10 + 3 * 4, `the video kept playing at speed, no scrub: ${played}`);
  await page.mouse.up();
  await page.waitForTimeout(50);
  assert.equal(await rate(), 1, 'released: back to normal');
  assert.equal(await page.evaluate(() => window.__clicks), 0, 'the hold did not register as a click');

  await page.waitForTimeout(100);
  await page.mouse.click(p.x, p.y);
  assert.equal(await page.evaluate(() => window.__clicks), 1, 'a normal click still reaches the page');
  assert.equal(await rate(), 1);

  // A new hold starts at 2x again, whatever the last one was set to.
  await page.mouse.down();
  await page.waitForTimeout(700);
  assert.equal(await rate(), 2, 'reset to 2x');
  await page.mouse.up();
  await page.waitForTimeout(50);
  assert.equal(await rate(), 1);
});

test('press and hold does nothing on a paused video or when the press moves (a drag)', async () => {
  const p = await centerOf(page, '#plain');
  const rate = () => page.evaluate(() => document.querySelector('#plain').playbackRate);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.waitForTimeout(700);
  assert.equal(await rate(), 1, 'paused video: nothing');
  await page.mouse.up();

  await page.evaluate(() => document.querySelector('#plain').play());
  await page.waitForFunction(() => !document.querySelector('#plain').paused);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 40, p.y + 10, { steps: 4 });
  await page.waitForTimeout(700);
  assert.equal(await rate(), 1, 'a drag is not a hold');
  await page.mouse.up();
});

/* ---- Trackball mode ------------------------------------------------------ */

test('holding the space bar over a playing video speeds it up; a tap toggles playback; typing and empty pages are left alone', async () => {
  await page.evaluate(() => document.querySelector('#plain').play());
  await page.waitForFunction(() => !document.querySelector('#plain').paused);
  const p = await centerOf(page, '#plain');
  const rate = () => page.evaluate(() => document.querySelector('#plain').playbackRate);
  const badge = () =>
    page.evaluate(() => {
      const el = document.querySelector('scroll-to-scrub-speed');
      return el && el.matches(':popover-open') ? Number(el.dataset.rate) : null;
    });
  await page.mouse.move(p.x, p.y);
  await page.keyboard.down('Space');
  await page.waitForTimeout(200);
  assert.equal(await rate(), 1, 'not yet');
  await page.waitForTimeout(500);
  assert.equal(await rate(), 2, 'held: 2x');
  assert.equal(await badge(), 2, 'the speed badge shows');
  await wheelBurst(page, p.x, p.y, 20, 0, 12, 8); // sideways scrolling steps the speed, as with a press
  await page.waitForTimeout(60);
  const r = await rate();
  assert.ok(r >= 2.5 && r <= 3.25, `a flick right while holding the key: several steps up: ${r}`);
  assert.equal(await badge(), r);
  await page.keyboard.up('Space');
  await page.waitForTimeout(50);
  assert.equal(await rate(), 1, 'released: back to normal');
  assert.equal(await badge(), null, 'badge gone');
  assert.equal(await isPaused('#plain'), false, 'a hold does not toggle playback');

  // A tap (released before the delay) toggles playback, as the player would.
  await page.keyboard.down('Space');
  await page.waitForTimeout(80);
  await page.keyboard.up('Space');
  await page.waitForTimeout(50);
  assert.equal(await isPaused('#plain'), true, 'tap: paused');
  assert.equal(await rate(), 1);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => !document.querySelector('#plain').paused);
  assert.equal(await isPaused('#plain'), false, 'tap again: playing');

  // Holding on a paused video just plays it.
  await page.evaluate(() => document.querySelector('#plain').pause());
  await page.keyboard.down('Space');
  await page.waitForTimeout(700);
  assert.equal(await isPaused('#plain'), false, 'a hold on a paused video plays it');
  assert.equal(await rate(), 1, 'at normal speed');
  await page.keyboard.up('Space');
  await page.waitForTimeout(50);
  assert.equal(await isPaused('#plain'), false, 'and the release does not pause it again');

  // Typing a space into a field while hovering the video is typing.
  await page.focus('#field');
  await page.keyboard.press('Space');
  await page.waitForTimeout(50);
  assert.equal(await page.evaluate(() => document.querySelector('#field').value), ' ', 'the field got the space');
  assert.equal(await rate(), 1);
  assert.equal(await isPaused('#plain'), false);
  await page.evaluate(() => document.querySelector('#field').blur());

  // Nothing under the pointer and nothing focused: the space bar scrolls the page.
  const t = await centerOf(page, '#text');
  await page.mouse.move(t.x, t.y);
  const s0 = await scroll();
  await page.keyboard.down('Space');
  await page.waitForTimeout(700);
  await page.keyboard.up('Space');
  await page.waitForTimeout(100);
  assert.ok((await scrolled(s0)).y > 50, 'the page scrolled');
  assert.equal(await rate(), 1, 'the video was left alone');
  assert.equal(await isPaused('#plain'), false);
});

test('on YouTube the native hold to speed up is replaced: its handlers never see the press or the key', async () => {
  // The fixture is served as www.youtube.com through request interception;
  // it has its own press-and-hold and space bar speed-up, like the site.
  const { context } = ext;
  const nativeUrl = 'https://www.youtube.com/native.html';
  await context.route('https://www.youtube.com/**', (route) => {
    const name = new URL(route.request().url()).pathname.slice(1);
    return route.fulfill({ path: new URL(`./fixtures/${name}`, import.meta.url).pathname });
  });
  try {
    await page.goto(nativeUrl);
    await page.waitForFunction(() => {
      const v = document.querySelector('#main');
      return v.readyState >= 2 && !v.paused && v.currentTime > 0;
    });
    const rate = () => page.evaluate(() => document.querySelector('#main').playbackRate);
    const native = () => page.evaluate(() => ({ ...window.__native }));
    const nativeHeld = () => page.evaluate(() => !!document.querySelector('#main').dataset.nativeHold);
    const p = await centerOf(page, '#main');

    // A press.
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.waitForTimeout(700);
    assert.equal(await rate(), 2, 'our hold: 2x');
    assert.equal(await nativeHeld(), false, 'the native hold never started');
    await page.mouse.up();
    await page.waitForTimeout(50);
    assert.equal(await rate(), 1, 'released');
    let n = await native();
    assert.equal(n.pointerdown + n.mousedown + n.mouseup, 0, `the page saw no press or release: ${JSON.stringify(n)}`);
    assert.equal(n.clicks, 0, 'and no click from the hold');

    // A short press is still a click for the page.
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(50);
    n = await native();
    assert.equal(n.clicks, 1, 'a click reaches the page');
    assert.equal(n.mousedown, 0, 'without the mousedown the native hold would start from');
    assert.equal(await rate(), 1);

    // The space bar, pointer over the player.
    await page.keyboard.down('Space');
    await page.waitForTimeout(700);
    assert.equal(await rate(), 2, 'our key hold: 2x');
    assert.equal(await nativeHeld(), false);
    await page.keyboard.up('Space');
    await page.waitForTimeout(50);
    assert.equal(await rate(), 1);
    n = await native();
    assert.equal(n.keydown + n.keyup, 0, `the page saw no key: ${JSON.stringify(n)}`);

    // The space bar from anywhere on the page (the site aims it at its main
    // player from the body too).
    const t = await centerOf(page, '#text');
    await page.mouse.move(t.x, t.y);
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.keyboard.down('Space');
    await page.waitForTimeout(700);
    assert.equal(await rate(), 2, 'main player sped up from the body');
    await page.keyboard.up('Space');
    await page.waitForTimeout(50);
    assert.equal(await rate(), 1);
    assert.equal((await native()).keydown, 0);
  } finally {
    await context.unroute('https://www.youtube.com/**');
  }
});

test('trackball mode: a flick keeps the playhead rolling and slowing after the wheel stops', async () => {
  const p = await centerOf(page, '#plain');
  // Off by default: the position stays where the last event put it.
  await wheelBurstFast(page, p.x, p.y, 40, 0, 12, 16); // a flick: 480 px in 0.2 s
  await page.waitForTimeout(150);
  await settled();
  const stopped = await time('#plain');
  await page.waitForTimeout(300);
  assert.equal(await time('#plain'), stopped, 'no momentum by default');
  await page.waitForFunction(() => !document.querySelector('scroll-to-scrub-hud').matches(':popover-open'), null, {
    timeout: 3000,
  });

  await setSettings(ext.worker, page, { trackball: true });
  await seekTo('#plain', 10);
  await page.waitForTimeout(300);
  await wheelBurstFast(page, p.x, p.y, 40, 0, 12, 16);
  await page.waitForTimeout(150);
  const t1 = await time('#plain');
  await page.waitForTimeout(250);
  const t2 = await time('#plain');
  assert.ok(t2 > t1 + 0.1, `kept rolling after the wheel stopped: ${t1} -> ${t2}`);
  await page.waitForTimeout(1500);
  const t3 = await time('#plain');
  await page.waitForTimeout(300);
  assert.equal(await time('#plain'), t3, 'came to rest');
  assert.ok(t3 > t2 && t3 < t1 + 10, `slowed down rather than running away: ${t3}`);

  // Scrolling again takes over at once: a small counter-nudge stops the roll.
  await wheelBurstFast(page, p.x, p.y, 40, 0, 12, 16);
  await page.waitForTimeout(50);
  await wheel(page, p.x, p.y, -2, 0);
  await page.waitForTimeout(100);
  const t4 = await time('#plain');
  await page.waitForTimeout(300);
  assert.ok(near(await time('#plain'), t4, 0.02), 'a nudge the other way stopped the roll');
});

/* ---- Undo ------------------------------------------------------------- */

/* The undo point the content script reported to the service worker (what
 * the popup shows), and the undo the shortcut performs. */
const undoState = () =>
  ext.worker.evaluate(
    () =>
      new Promise((resolve) =>
        chrome.storage.session.get(null, (all) => {
          const key = Object.keys(all).find((k) => k.startsWith('undo:'));
          resolve(key ? { tabId: Number(key.slice(5)), ...all[key] } : null);
        })
      )
  );
const undoViaShortcut = async () => {
  const u = await undoState();
  assert.ok(u, 'an undo point is known to the worker');
  return ext.worker.evaluate(
    (u) =>
      new Promise((resolve) =>
        chrome.tabs.sendMessage(u.tabId, { type: 'undo' }, { frameId: u.frameId }, (r) =>
          resolve(chrome.runtime.lastError ? { error: chrome.runtime.lastError.message } : r)
        )
      ),
    u
  );
};

test('undo puts the video back where it was and resumes it if it was playing; undo again redoes', async () => {
  await page.waitForTimeout(100);
  assert.equal(await undoState(), null, 'nothing to undo yet');
  await page.evaluate(() => document.querySelector('#plain').play());
  await page.waitForFunction(() => !document.querySelector('#plain').paused);
  const p = await centerOf(page, '#plain');
  await wheelBurst(page, p.x, p.y, 100, 0, 6, 16);
  await settled();
  const scrubbed = await time('#plain');
  assert.ok(scrubbed > 12, `scrubbed to ${scrubbed}`);
  await page.waitForTimeout(100);
  const info = await undoState();
  assert.ok(info && near(info.time, 10, 0.3), `undo point ${JSON.stringify(info)}`);
  assert.equal(info.wasPlaying, true);
  assert.equal(info.duration, 60);

  assert.deepEqual(await undoViaShortcut(), { ok: true });
  await settled();
  assert.ok(near(await time('#plain'), info.time, 0.3), 'back where it was');
  await page.waitForFunction(() => !document.querySelector('#plain').paused, null, { timeout: 3000 });

  await page.evaluate(() => document.querySelector('#plain').pause());
  await page.waitForTimeout(100);
  assert.deepEqual(await undoViaShortcut(), { ok: true });
  await settled();
  assert.ok(near(await time('#plain'), scrubbed, 0.3), 'redo returns to the scrubbed position');
  assert.equal(await isPaused('#plain'), true, 'and keeps the paused state it had when undone');
});

/* ---- HUD, popup, options -------------------------------------------- */

test('the timeline spans the video, follows playback after the gesture, tracks resizes, then fades out', async () => {
  await page.evaluate(() => document.querySelector('#plain').play());
  await page.waitForFunction(() => !document.querySelector('#plain').paused);
  const p = await centerOf(page, '#plain');
  const box = await page.locator('#plain').boundingBox();
  await wheel(page, p.x, p.y, 50, 0);
  await page.waitForTimeout(60);
  const tl = () =>
    page.evaluate(() => {
      const el = document.querySelector('scroll-to-scrub-hud');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { open: el.matches(':popover-open'), x: r.left, y: r.top, w: r.width, pos: Number(el.dataset.pos), opacity: getComputedStyle(el).opacity };
    });
  let t = await tl();
  assert.ok(t && t.open, 'shown by default');
  assert.ok(near(t.x, box.x + 16, 2) && near(t.w, box.width - 32, 2), `spans the video: ${JSON.stringify(t)}`);
  assert.ok(t.y > box.y && t.y < box.y + 40, 'sits along the top edge of the video');

  // The video resizes while the timeline is up: it follows within a frame.
  await page.evaluate(() => (document.querySelector('#plain').style.width = '480px'));
  await page.waitForTimeout(80);
  t = await tl();
  assert.ok(near(t.w, 480 - 32, 2), `resized with the video: ${JSON.stringify(t)}`);

  // Playback resumes after the gesture; the mark keeps moving.
  await page.waitForFunction(() => !document.querySelector('#plain').paused, null, { timeout: 3000 });
  const a = await tl();
  await page.waitForTimeout(300);
  const b = await tl();
  assert.ok(a.open && b.open && b.pos > a.pos, `follows playback: ${a.pos} -> ${b.pos}`);

  // Then fades and goes away.
  await page.waitForFunction(() => getComputedStyle(document.querySelector('scroll-to-scrub-hud')).opacity !== '1', null, {
    timeout: 3000,
  });
  await page.waitForFunction(() => !document.querySelector('scroll-to-scrub-hud').matches(':popover-open'), null, {
    timeout: 3000,
  });
  const gone = () =>
    page.evaluate(() => {
      const el = document.querySelector('scroll-to-scrub-hud');
      return getComputedStyle(el).display === 'none' && el.getBoundingClientRect().width === 0;
    });
  assert.equal(await gone(), true, 'not rendered at all once hidden');
  await page.waitForTimeout(700); // still playing: it must not come back on its own
  assert.equal(await gone(), true, 'stays hidden while the video plays');

  await setSettings(ext.worker, page, { showTimeline: false });
  await page.waitForTimeout(300);
  await wheel(page, p.x, p.y, 50, 0);
  await page.waitForTimeout(60);
  assert.equal(await page.evaluate(() => document.querySelector('scroll-to-scrub-hud').matches(':popover-open')), false);
});

test('the popup toggles the extension and the current site', async () => {
  const popup = await ext.context.newPage();
  await popup.goto(`chrome-extension://${ext.extensionId}/popup/popup.html`);
  await popup.waitForFunction(() => document.getElementById('enabled').checked === true);
  assert.equal(await popup.locator('#undo').isDisabled(), true, 'undo is visible but disabled without an undo point');
  assert.equal(await popup.locator('#undoInfo').textContent(), 'Nothing to undo');
  const toggle = popup.locator('label:has(#enabled) .track'); // the input itself is visually hidden
  await toggle.click();
  await popup.waitForTimeout(100);
  let stored = await ext.worker.evaluate(() => new Promise((r) => chrome.storage.sync.get(null, r)));
  assert.equal(stored.enabled, false);
  await toggle.click();
  await popup.waitForTimeout(100);
  stored = await ext.worker.evaluate(() => new Promise((r) => chrome.storage.sync.get(null, r)));
  assert.equal(stored.enabled, true);
  await popup.close();
});

test('the popup shows the undo point the worker holds for its tab', async () => {
  const popup = await ext.context.newPage();
  await popup.goto(`chrome-extension://${ext.extensionId}/popup/popup.html`);
  await popup.waitForFunction(() => document.getElementById('undoInfo').textContent === 'Nothing to undo');
  const popupTabId = await ext.worker.evaluate(
    () => new Promise((r) => chrome.tabs.query({ active: true, currentWindow: true }, (t) => r(t[0].id)))
  );
  await ext.worker.evaluate(
    (id) => chrome.storage.session.set({ ['undo:' + id]: { time: 83.4, wasPlaying: true, duration: 600, frameId: 0 } }),
    popupTabId
  );
  await popup.reload();
  await popup.waitForFunction(() => !document.getElementById('undo').disabled);
  assert.equal(await popup.locator('#undoInfo').textContent(), 'Back to 1:23, playing');
  await popup.close();
});

test('the options page saves settings', async () => {
  const options = await ext.context.newPage();
  await options.goto(`chrome-extension://${ext.extensionId}/options/options.html`);
  await options.waitForFunction(() => document.getElementById('speedNumber').value === '0.5');
  await options.fill('#speedNumber', '2.5');
  await options.dispatchEvent('#speedNumber', 'change');
  await options.check('#invert');
  await options.fill('#disabledSites', 'https://www.Example.com/watch\nvimeo.com');
  await options.dispatchEvent('#disabledSites', 'change');
  await options.waitForTimeout(150);
  const stored = await ext.worker.evaluate(() => new Promise((r) => chrome.storage.sync.get(null, r)));
  assert.equal(stored.secondsPer100px, 2.5);
  assert.equal(stored.invert, true);
  await options.check('#trackball');
  await options.waitForTimeout(150);
  assert.equal((await ext.worker.evaluate(() => new Promise((r) => chrome.storage.sync.get(null, r)))).trackball, true);
  assert.deepEqual(stored.disabledSites, ['example.com', 'vimeo.com']);
  await options.close();
});
