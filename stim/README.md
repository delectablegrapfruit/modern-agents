# stim

Every hook a phone has, with nothing inside. stim is a toy phone OS (lock screen, home screen, notification center) with twenty engagement hooks, bundled by type into eight apps. There is no content: shapes, numbers, blank bars and red dots. A global combo multiplier ties the hooks together, so acting faster pays more.

| App | Tabs | Hooks |
| --- | --- | --- |
| Feed | Scroll, Loop, Swipe | Infinite scroll where every card reveals a reward and pull to refresh is a slot machine; autoplay clips that advance by themselves; swipe cards, random matches, a paywalled "people who liked you" |
| Casino | Slots, Rocket, Flip, Scratch, Loot | Lever and near misses; crash betting where you always cash out first; double or nothing that always lands heads; scratch cards; blind boxes with rarity tiers and a pity timer |
| Markets | Trade, Predict | Crypto that rises while you hold it and again after you sell; prediction markets about the phone itself that always resolve your way |
| Play | Tap, Hold, Rings, Blob | Clicker with crits and upgrades; press and release in the gold band; things that vanish if you don't tap them; a pet whose needs keep dropping |
| Inbox | Inbox | Unread dots; read, swipe or clear all, inbox zero for a moment |
| Goals | Streak, Quests, Rank | Daily login calendar and a one-minute pulse; endowed-progress quests, a rapid quest, a chest; leagues with a five-minute week and rivals who pass you |
| Shop | Shop | Flash sales that always end soon, "only 2 left", fake savings |
| You | You | Screen time, achievements, notification and app settings |

The home screen has a Waiting for you widget listing what wants you right now (deadlines first, with countdowns), so you pick what to do next. Notifications come one at a time with a quiet gap between banners, at most one banner per hook every 30 seconds, and stay silent while you're inside an app; you get one summary when you leave. In You, set the pace (Calm, Normal, Busy), turn off quiet-in-apps, or switch notifications off per app. Around the apps: badges that jiggle on every icon and tab, the logo's tittle counting everything unread, a lock screen where notifications pile up, level-ups, a rate-us prompt, a break reminder that talks you out of the break, and a battery that drains.

Sound is synthesized with Web Audio. Haptics use `navigator.vibrate` on Android and the switch-control tick in Safari on iOS 18 and later. Progress is saved in `localStorage`; nothing leaves the device.

## Run

No build step. Serve the folder, or open `index.html` directly:

```sh
python3 -m http.server -d stim 8000   # then open http://localhost:8000
```

On a phone it fills the screen; on anything wider it runs inside an iPhone frame. On iPhone, open the page in Safari, then Share → Add to Home Screen for the full-screen app.

Desktop keys: `Space` does the app's main action (tap, pull, flip, hold, launch, buy), `←` `→` swipe, `↑` `↓` scroll and skip, `Enter` cashes out or sells, `1`–`5` switch tabs inside an app, `N` summons a notification, `H` or `Esc` goes home, `⇧L` locks the phone.
