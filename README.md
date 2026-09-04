# Scroll to Scrub

A Chrome extension that lets you **scrub through any video by scrolling sideways while your mouse hovers over it**. Tilt or thumb wheel, two-finger trackpad swipe, or <kbd>Shift</kbd> + wheel: the video seeks instead of the page scrolling. Every bit of wheel movement moves the video by a fixed amount, playback stays paused while you scrub, and frames update as fast as the decoder can show them. Works on every site, including players in iframes and web components.

## Install

1. Clone or download this repository.
2. Open `chrome://extensions`, turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `extension/` folder.

There is no build step. `npm run pack` zips `extension/` into `dist/` for the Chrome Web Store.

## Use

| Action | Result |
|---|---|
| Hover a video, scroll right / left | Seek forward / back: 4 s per 100 px of scrolling, no dead zone, no snapping |
| Hold <kbd>Alt</kbd> (Option) while scrolling | Fine control, 1/10 speed |
| <kbd>Shift</kbd> + mouse wheel | Counts as sideways scrolling |
| Vertical scroll over a video | Scrolls the page as usual |
| <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> | Toggle the extension on / off |

The video pauses when a gesture starts and stays on the frame you stopped on for as long as the pointer rests on it; move the mouse off the video and playback resumes (if it was playing). Clicking or pressing a key hands control back to the player without restarting playback. The position shows on the site's own player; the extension's own overlay is off by default. The toolbar popup toggles the extension globally or for the current site and adjusts the speed; the options page has everything else.

### Settings

| Setting | Default | Notes |
|---|---|---|
| Speed | 4 s per 100 px | A constant rate, whatever the video's length. 0.05 to 60 s per 100 px. |
| Axis | Horizontal | *Horizontal*: sideways input scrubs, vertical input scrolls. *Vertical*: the other way round. *Both*: any scrolling over a video scrubs. |
| Shift + wheel as horizontal | on | For mice without a tilt or thumb wheel. |
| Invert direction | off | |
| Only scrub while holding | nothing | Require Alt / Ctrl / Shift / Meta, e.g. to keep scrolling carousels that contain videos. |
| Fine control key | Alt | 1/10 speed while held. |
| Keep the video paused | on | Pauses at the start of a gesture. Sites that restart playback on their own are paused again. |
| Resume when the pointer leaves | on | Only if the video was playing before. |
| Show overlay | off | The extension's own time / progress pill. |
| Disabled sites | netflix.com | Hostnames incl. subdomains. Also honoured by players embedded from other origins (a YouTube iframe on a disabled site). Netflix is off by default because its player crashes when its video element is seeked directly. |

## How it works

- A `wheel` listener is registered in the capture phase on `window` at `document_start`, in every frame. It is passive until the pointer is over a video (tracked with `mouseover`), then re-registered as blocking so it can cancel the event, and made passive again when the pointer leaves. A blocking wheel listener forces every scroll on the page through the main thread, so this keeps pages without a video under the pointer scrolling exactly as they would without the extension. Consumed events are also stopped from reaching the page's own handlers (volume-on-wheel players, carousels).
- Chromium latches a wheel sequence: if the first event is not cancelled, the following events (for up to 500 ms of continuous wheeling) cannot be cancelled by anyone. The extension therefore decides and cancels on the very first event over a video, never later.
- On the first event of a gesture the pointer position is hit-tested with `elementsFromPoint`, descending into shadow roots (closed ones too, through `chrome.dom.openOrClosedShadowRoot`). A `<video>` anywhere in that stack counts, so control overlays on top of the player are fine. Players that set `pointer-events: none` on the video are found by their box; when several videos overlap, the one under the top-most element wins.
- Wheel movement is converted to seconds at a constant rate and added to a logical position that tracks the wheel exactly, whatever the video is doing. Fractional pixels count; nothing is rounded or thresholded.
- Movement is classified on a sliding 150 ms window of events rather than event by event, because trackpads and high-resolution wheels report a pixel or two of cross-axis noise on every event. Purely sideways input (tilt wheel, thumb wheel, Shift+wheel) scrubs at once; a mouse-wheel notch scrolls the page at once, even in the middle of a scrub; ambiguous diagonal input over a video is buffered for a few pixels before the axis is chosen, and the buffered movement is applied in full once it is. Nothing is ever locked for longer than the window, so a sideways swipe that begins right after a vertical scroll scrubs.
- Seeks are issued immediately. While one is still in flight the newest target waits for `seeked`, so every seek the decoder finishes becomes a frame on screen (Chromium never shows the frame of a seek that was superseded before it finished decoding), and intermediate targets are dropped rather than queued: the video always heads for where the wheel is now, never a backlog. A stall cap of three times the recent maximum seek latency (250 ms to 1.5 s) guards against unbuffered ranges and players that swallow events without ever firing on a seek that is merely slow.
- The video is paused at the start of a gesture. If the site restarts playback mid-session (autoplay loops, players that play after a seek) it is paused again; a site that keeps restarting it is left "playing" at `playbackRate = 0` instead, which holds the frame without a pause/play war (measured: a pause war leaks about half of real time, rate 0 leaks nothing and still seeks). The session lasts while the pointer rests on the video; when it leaves (or the page scrolls the video away, or the extension is switched off, or the tab is left), the last seek is allowed to land and playback resumes if it was playing before. A click or a key aimed at the page ends the session without restarting playback; typing in a text field does not count.
- Targets are clamped to the media's `seekable` range, minus a safety margin (0.5 s for media-source players, 1 s for live streams): seeking exactly to the buffered or live edge leaves Chromium stuck in `seeking`.
- A video under the pointer that cannot be seeked yet (no metadata, `preload="none"`, a live stream without a DVR window) still captures sideways input, so the page or a carousel does not scroll instead; scrubbing starts the moment the media becomes seekable.
- The optional overlay lives in a closed shadow root and uses the Popover API, so it renders in the top layer even above fullscreen players. It updates once per animation frame however many wheel events arrive.
- After an extension update or reload, the orphaned copy of the content script notices its lost extension context on the next event and steps aside instead of scrubbing with stale settings.

## Limitations

- Players that ignore or override `currentTime` (Twitch VODs, Plex, some DRM players) will not respond; Netflix crashes on it and is disabled by default. Driving those players through their own APIs would need a main-world script and is not done yet.
- Chrome 114 or newer.

## Development

```sh
npm install          # Playwright, for the tests
npm test             # end-to-end tests in headless Chromium with the extension loaded
npm run fixture      # regenerate test/fixtures/clip-*.webm
npm run icons        # regenerate extension/icons/*.png
npm run pack         # dist/scroll-to-scrub.zip
```

The tests serve a fixture page (plain video, video under an overlay, `pointer-events: none` video, open and closed shadow DOM players, iframe player, a `preload="none"` video, a clip with 10 s keyframe spacing to make seeks expensive), dispatch real wheel events through the Chrome DevTools Protocol, and check `currentTime`, page scroll position, the pixels of the frame on screen, how progressively frames appear during a fast burst, the overlay, and the popup and options pages. The fixture clips encode the time in every frame (hue = second, bar width = frame within the second) so tests can verify what is actually on screen.

Layout:

```
extension/              the unpacked extension
  manifest.json
  content.js            wheel handling, hit-testing, seek scheduling, overlay
  background.js         badge + keyboard shortcut
  shared/defaults.js    settings schema shared by all contexts
  popup/, options/      UI
  icons/
scripts/gen-icons.mjs   icon generator (no dependencies)
scripts/gen-fixture-video.mjs  test clip generator (Playwright's Chromium + ffmpeg)
test/                   Playwright e2e suite, harness and fixtures
```
