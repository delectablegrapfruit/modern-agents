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
| ~5 s black player before every video | Shortens `setTimeout` calls of 1–10 s whose callback contains `resolve(1)` (the player's startup gate) to ×0.001, as uBlock Origin's `nano-stb` scriptlet does | Startup delay |
| Black/frozen "ad" slot for the ad's full length | While the player has `ad-showing`/`ad-interrupting`: mute, 16× speed, press Skip; mute state and chosen speed come back after | Ad-slot dead time |
| Playback frozen mid-video / spinner forever | Clock stuck 4 s while playing → re-seek in place → pause/play → reload stream at the same second (max 3 per video, refilled after 60 s) | Stalls |
| "Ad blockers are not allowed" dialog | Closes it and resumes the video | Anti-adblock dialog |

Popup: the four toggles (saved in `chrome.storage.sync`, applied live) and per-tab counts.

## Not fixable client-side

- Server-side bandwidth throttling of VPN/datacenter IPs
- "Sign in to confirm you're not a bot"
- The hard player block that replaces the video with an error screen

## Layout

```
extension/
  manifest.json
  src/page.js       page world, document_start: timer wrap, ad slot, stalls, dialog; selectors/tunables at top
  src/bridge.js     isolated world: chrome.storage → page.js settings, page.js → per-tab counts
  src/defaults.js   default settings (bridge + popup)
  popup/            toggles + counts
test/e2e.mjs        headless Chromium + the extension against a stand-in watch page
```

YouTube renames classes; when a feature stops working, update the selectors at the top of `src/page.js`.

## Test

```
npm install && npm test
```
