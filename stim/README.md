# stim

A contentless feed built only from the hooks. Every surface is a blank placeholder: no users, posts, captions or messages. Only the engagement mechanics have color and behavior.

| Hook | Where |
| --- | --- |
| Infinite scroll with shimmer loading, "You're all caught up", then more | Feed |
| Pull to refresh with a rubber band, 8-tick spinner and variable results (nothing, a few, a jackpot) | Feed, Notifications |
| Likes: tap, double-tap heart, particle burst, combo pitch that rises, live-ticking counts | Everywhere |
| Red badges, count in the logo's tittle, tab title and app icon badge | Header, tabs |
| Notification banners at variable intervals, bursts, "while you were away" batches | Global |
| Unread dots to clear, swipe to clear, cascading "Mark all read" | Notifications |
| Story rings, segmented progress, autoplay into the next story | Feed |
| Autoplay panels that advance on their own, live viewer counts, floating hearts | Autoplay tab |
| Typing indicators, Delivered/Seen receipts, sometimes left on read | Messages |
| Streaks, slot machine with near misses, energy that refills on a timer | Rewards |
| Points, levels, achievements, screen-time stats | You |
| "Take a break?" nudge with confirmshaming | Every 10 minutes |

Sound is synthesized with Web Audio. Haptics use `navigator.vibrate` on Android and the switch-control tick in Safari on iOS 18 and later. Progress is saved in `localStorage`.

## Run

No build step. Serve the folder, or open `index.html` directly:

```sh
python3 -m http.server -d stim 8000   # then open http://localhost:8000
```

On a phone the app fills the screen; on anything wider it runs inside an iPhone frame. On iPhone, open the page in Safari, then Share → Add to Home Screen for the full-screen app.

Desktop keys: `1`–`5` tabs, `J`/`K` next/previous, `L` like, `R` refresh, `N` summon a notification, `Space` pull the lever.
