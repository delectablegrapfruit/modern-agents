# Focus & Fix for YouTube

Chrome extension (Manifest V3) that hides YouTube's distractions, filters videos, and undoes the playback slowdowns
YouTube applies to ad-blocker and VPN users. Everything runs locally; nothing is sent anywhere.

## Install

1. `chrome://extensions` → turn on **Developer mode**
2. **Load unpacked** → pick the `extension/` folder
3. Reload open YouTube tabs

## Hiding

Every option applies instantly, without a reload. Popup: master switch, pause, presets, option search, the picker,
per-tab counts. **All settings** opens the full options page.

| Group | Options (★ = not in Unhook) |
| --- | --- |
| Home | Home feed (leaves a calm placeholder) · ★ When Home opens → Subscriptions / Watch later / You / History |
| Watch page | Recommended videos · Whole sidebar · Comments · Live chat · Playlist panel · Everything under the player · Channel & Subscribe · Like/share/save bar · Description · ★ Info & context panels |
| Player | End-screen video wall (★ + pause and countdown overlays) · End-screen & info cards · Annotations & watermark · Turn off Autoplay |
| Search | Irrelevant results · ★ Search suggestions |
| Everywhere | Shorts (shelves, items, menu, channel tab) · ★ Open Shorts in the normal player · Mixes · Merch, tickets, offers, fundraisers · Profile photos · ★ Hover previews · ★ Promos & in-feed ad slots · ★ View/like/subscriber counts |
| Header & menu | Top header · Notification bell · Explore & Trending (★ pages sent home) · More from YouTube · Subscriptions (hidden + feed sent home) · ★ Left menu |
| ★ Look | Grayscale · Blur thumbnails (sharp under the pointer) · No thumbnails |

Covers all of Unhook's options. Added on top:

| ★ Feature | What it does |
| --- | --- |
| Presets | Show all · Clean (default: Shorts, Mixes, merch, promos, junk search shelves, cards) · Focus · Minimal. Look options are left alone |
| Feed filters | Hide single videos by title keyword or `/regex/`, channel name or @handle, watched ≥ N %, shorter/longer than N min, live, upcoming, members-only. An **Always show** list beats every filter. Hide or **dim**, to check what matches. History, playlists and You are never filtered. The toolbar badge counts filtered videos |
| Element picker | Popup button, right-click → *Hide this element…*, or Alt+Shift+H. Hover, click, ↑/↓ to widen or narrow, Enter to save. Shows the match count live. Saved as a custom rule for this page type or every page |
| Custom rules | Edit, re-scope or delete picked rules, or type CSS selectors. Invalid selectors are refused |
| Schedule | Hide only on chosen days and hours (windows can cross midnight) |
| Pause & friction | Pause for 5 min, 15 min or 1 h. Optional N-second countdown before a pause or switch-off takes effect. **Lock** blocks switching off, pausing and *Show all* during scheduled hours |
| Shortcuts | Alt+Shift+U turns hiding on/off · Alt+Shift+H opens the picker · a "pause 15 min" command you can bind at `chrome://extensions/shortcuts`. With friction or lock on, shortcuts can't loosen |
| Backup | Export or import settings as JSON, or reset. Settings sync through Chrome sync |

## Playback fixes

These run whether hiding is on or off.

| Hiccup | Fix |
| --- | --- |
| Spinner that keeps restarting before playback: YouTube's server-enforced "SABR backoff", about 80% of the skipped ad's length | Player requests (`/youtubei/v1/player`, `get_watch`, `playlist/watch`, through fetch or XHR) get `playbackContext.contentPlaybackContext.isInlinePlaybackNoAd = true`, so the video comes with no ads and no backoff. A page opened directly gets the no-picture reload below |
| ~5 s black player | The single `setTimeout(…resolve(1)…, 5000)` startup gate is cut to 5 ms, at most once per 30 s |
| Black or frozen "ad" slot | Muted, 16× speed, Skip pressed. Mute state and chosen speed come back afterwards |
| No picture, or frozen playback | No picture for 2.5 s → reload at the same second. Frozen 4 s mid-video → re-seek → pause/play → reload. At most 3 per video |
| "Ad blockers are not allowed" dialog | Closed, and playback resumes |

Not fixable from the browser: server-side throttling of VPN IPs, "Sign in to confirm you're not a bot", and the hard
block that replaces the player with an error screen.

## Limits

- The selectors are written against YouTube's current element and class names, and tested against a stand-in page.
  When YouTube renames something, update it in `extension/src/schema.js`, or hide it with the picker meanwhile.
- The Shorts menu entry and channel tab are matched by their English title.

## Layout

```
extension/
  manifest.json
  background.js       context menu, shortcuts, badge
  src/schema.js       every option: label, group, selectors, presets, defaults, schedule logic
  src/store.js        chrome.storage access
  src/content.js      isolated world: hide tokens on <html>, filters, redirects, Autoplay, custom rules
  src/picker.js       element picker (closed shadow DOM)
  src/page.js         page world: playback fixes
  ui/                 controls and styles shared by the popup and the options page
  popup/  options/
test/e2e.mjs          headless Chromium + the extension against a stand-in YouTube page
```

## Test

```
npm install && npm test
```
