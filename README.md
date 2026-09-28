# YouTube Hiccup Bypass

Chrome extension (Manifest V3) that cuts the client-side slowdowns YouTube applies when it sees an ad blocker or VPN.
Use it alongside your ad blocker, not instead of one.

## Install

1. `chrome://extensions` → turn on **Developer mode**
2. **Load unpacked** → pick `youtube-hiccup-bypass/extension`
3. Reload open YouTube tabs

## What it fixes

| Hiccup | How it's bypassed | Toggle |
| --- | --- | --- |
| Spinner that keeps restarting for seconds before playback (YouTube's server-enforced "SABR backoff": ~80% of the skipped ad's length) | Player requests (`/youtubei/v1/player`, `get_watch`, `playlist/watch`, via fetch or XHR) get `playbackContext.contentPlaybackContext.isInlinePlaybackNoAd = true`, so YouTube serves the video with no ads and no backoff. Covers in-app navigation; a page opened directly has its player response baked into the HTML and gets the no-picture reload below | Ad backoff |
| ~5 s black player before every video | Shortens the one `setTimeout(…resolve(1)…, 5000)` startup gate to 5 ms, at most once per 30 s: shortening network retry timers would turn a wait into a request storm | Startup gate |
| Black/frozen "ad" slot for the ad's full length | While the player has `ad-showing`/`ad-interrupting`: mute, 16× speed, press Skip; mute state and chosen speed come back after | Ad-slot dead time |
| No picture / frozen playback | No picture 2.5 s while playing → reload at the same second (a fresh, patched player request). Frozen 4 s mid-video → re-seek → pause/play → reload. Max 3 per video, refilled after 60 s | Stalls |
| "Ad blockers are not allowed" dialog | Closes it and resumes the video | Anti-adblock dialog |

Each action is logged to the DevTools console as `[YouTube Hiccup Bypass] …`.

Popup: the five toggles (saved in `chrome.storage.sync`, applied live) and per-tab counts.

## Not fixable client-side

- Server-side bandwidth throttling of VPN/datacenter IPs
- "Sign in to confirm you're not a bot"
- The hard player block that replaces the video with an error screen

## Layout

```
extension/
  manifest.json
  src/page.js       page world, document_start: request patch, timer wrap, ad slot, stalls, dialog; tunables at top
  src/bridge.js     isolated world: chrome.storage → page.js settings, page.js → per-tab counts
  src/defaults.js   default settings (bridge + popup)
  popup/            toggles + counts
test/e2e.mjs        headless Chromium + the extension against a stand-in watch page
```

YouTube renames endpoints, fields and classes; when a feature stops working, update the tunables at the top of `src/page.js`.

## Test

```
npm install && npm test
```
