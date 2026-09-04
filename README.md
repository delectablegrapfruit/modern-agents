# Scroll to Scrub

A Chrome extension that lets you **scrub through any video by scrolling sideways while your mouse hovers over it**. Tilt or thumb wheel, two-finger trackpad swipe, or <kbd>Shift</kbd> + wheel: the video seeks instead of the page scrolling. Every bit of wheel movement moves the video by a fixed amount, playback pauses while you scrub and resumes when you stop, a thin timeline over the video tracks the wheel instantly, and frames update as fast as the decoder can show them. Works on every site, including players in iframes and web components.

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
| Stop scrolling | Playback resumes about half a second later (if it was playing); moving off the video resumes at once |
| <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd>, or **Undo scrub** in the popup | Back to where the video was before the last scrub, playing if it was playing. Again to redo. |
| <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> | Toggle the extension on / off |

While you scrub, a thin timeline along the top of the video follows the wheel instantly (the site's own timeline only catches up when each seek completes); a faint tick marks where you started, which is where undo returns to. The popup has the on/off switch, a switch for the current site, the speed, and the undo button; the options page has the rest.

### Settings

| Setting | Default | Notes |
|---|---|---|
| Speed | 4 s per 100 px | A constant rate, whatever the video's length. 0.05 to 60 s per 100 px. |
| Invert direction | off | Scroll right to rewind. |
| Resume playback after scrubbing | on | Only if the video was playing before. |
| Show timeline | on | The overlay along the top of the video. |
| Only scrub while holding | nothing | Alt / Ctrl / Shift / Meta, for sites whose carousels scroll sideways. |
| Off on these sites | netflix.com | Hostnames incl. subdomains. Also honoured by players embedded from other origins (a YouTube iframe on a disabled site). Netflix is off by default because its player crashes when its video element is seeked directly. |

Everything else is fixed: the video is always paused while scrubbing, Shift + wheel always counts as sideways, Alt is always the fine-control key.

## How it works

- A `wheel` listener is registered in the capture phase on `window` at `document_start`, in every frame. It is passive until the pointer is over a video (tracked with `mouseover`), then re-registered as blocking so it can cancel the event, and made passive again when the pointer leaves. A blocking wheel listener forces every scroll on the page through the main thread, so this keeps pages without a video under the pointer scrolling exactly as they would without the extension. Consumed events are also stopped from reaching the page's own handlers (volume-on-wheel players, carousels).
- Chromium latches a wheel sequence: if the first event is not cancelled, the following events (for up to 500 ms of continuous wheeling) cannot be cancelled by anyone. The extension therefore decides and cancels on the very first event over a video, never later.
- On the first event of a gesture the pointer position is hit-tested with `elementsFromPoint`, descending into shadow roots (closed ones too, through `chrome.dom.openOrClosedShadowRoot`). A `<video>` anywhere in that stack counts, so control overlays on top of the player are fine. Players that set `pointer-events: none` on the video are found by their box; when several videos overlap, the one under the top-most element wins.
- Wheel movement is converted to seconds at a constant rate and added to a logical position that tracks the wheel exactly, whatever the video is doing. Fractional pixels count; nothing is rounded or thresholded.
- Movement is classified on a sliding 150 ms window of events rather than event by event, because trackpads and high-resolution wheels report a pixel or two of cross-axis noise on every event. Purely sideways input (tilt wheel, thumb wheel, Shift+wheel) scrubs at once; a mouse-wheel notch scrolls the page at once, even in the middle of a scrub; ambiguous diagonal input over a video is buffered for a few pixels before the axis is chosen, and the buffered movement is applied in full once it is. Nothing is ever locked for longer than the window, so a sideways swipe that begins right after a vertical scroll scrubs.
- Seeks are issued immediately. While one is still in flight the newest target waits for `seeked`, so every seek the decoder finishes becomes a frame on screen (Chromium never shows the frame of a seek that was superseded before it finished decoding), and intermediate targets are dropped rather than queued: the video always heads for where the wheel is now, never a backlog. A stall cap of three times the recent maximum seek latency (250 ms to 1.5 s) guards against unbuffered ranges and players that swallow events without ever firing on a seek that is merely slow.
- The video is paused at the start of a gesture. If the site restarts playback mid-session (autoplay loops, players that play after a seek) it is paused again; a site that keeps restarting it is left "playing" at `playbackRate = 0` instead, which holds the frame without a pause/play war (measured: a pause war leaks about half of real time, rate 0 leaks nothing and still seeks). The session ends 600 ms after the last wheel event, or at once when the pointer leaves the video (or the page scrolls it away, or the extension is switched off, or the tab is left); the last seek is allowed to land and playback resumes if it was playing before. A click or a key aimed at the page ends the session without restarting playback; typing in a text field does not count.
- Targets are clamped to the media's `seekable` range, minus a safety margin (0.5 s for media-source players, 1 s for live streams): seeking exactly to the buffered or live edge leaves Chromium stuck in `seeking`.
- A video under the pointer that cannot be seeked yet (no metadata, `preload="none"`, a live stream without a DVR window) still captures sideways input, so the page or a carousel does not scroll instead; scrubbing starts the moment the media becomes seekable.
- The timeline lives in a closed shadow root and uses the Popover API, so it renders in the top layer even above fullscreen players. It draws the logical position (where the wheel is), not the video's `currentTime`, so it never lags a seek; it updates once per animation frame however many wheel events arrive, reading layout before writing.
- Undo: when a scrub session starts, the content script remembers the position and play state and reports them to the service worker (keyed by tab and frame, in session storage). The popup asks the worker, so the button shows the right state whichever frame holds the video, and the shortcut or button is delivered to exactly that frame. Undo puts the video back and, if it was playing, plays it; the position being left becomes the new undo point, so undo twice is a redo.
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

The tests serve a fixture page (plain video, video under an overlay, `pointer-events: none` video, open and closed shadow DOM players, iframe player, a `preload="none"` video, a clip with 10 s keyframe spacing to make seeks expensive), dispatch real wheel events through the Chrome DevTools Protocol, and check `currentTime`, page scroll position, the pixels of the frame on screen, how progressively frames appear during a fast burst, the timeline, undo, and the popup and options pages. The fixture clips encode the time in every frame (hue = second, bar width = frame within the second) so tests can verify what is actually on screen.

Layout:

```
extension/              the unpacked extension
  manifest.json
  content.js            wheel handling, hit-testing, seek scheduling, timeline, undo
  background.js         badge, keyboard shortcuts, per-tab undo state
  shared/defaults.js    settings schema shared by all contexts
  popup/, options/      UI
  icons/
scripts/gen-icons.mjs   icon generator (no dependencies)
scripts/gen-fixture-video.mjs  test clip generator (Playwright's Chromium + ffmpeg)
test/                   Playwright e2e suite, harness and fixtures
```
