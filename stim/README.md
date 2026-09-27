# stim

Every hook a phone has, with nothing inside. stim is a toy phone OS (lock screen, home screen, notification center) whose twenty apps each do one engagement hook, fast. There is no content: shapes, numbers, blank bars and red dots. A global combo multiplier ties the apps together, so acting faster pays more.

| App | Hook |
| --- | --- |
| Rocket | Crash betting. You always cash out before it crashes, then it flies on to show what you missed |
| Flip | Double or nothing. It always lands heads; let it ride up to ×256 |
| Predict | Prediction markets about the phone itself. Every market resolves your way |
| Trade | Crypto with live charts. Anything you hold goes up, and it rises again after you sell |
| Tap | Clicker: crits, upgrades, auto-tapper, offline earnings |
| Scroll | Infinite scroll where every card reveals a reward; pull to refresh is a slot machine |
| Inbox | Unread dots that arrive every second; read, swipe or clear all, inbox zero for a moment |
| Slots | Lever, near misses, spins that refill on a timer |
| Swipe | Swipe cards, random matches, a paywalled "people who liked you" |
| Loop | Autoplay clips that advance by themselves |
| Loot | Blind boxes with rarity tiers, a 24-piece set and a pity timer |
| Scratch | Scratch-off cards with frequent near misses |
| Streak | Daily login calendar, streak freezes, and a 45-second pulse that dies if you miss it |
| Quests | Endowed progress, a rapid 90-second quest, a quest treadmill and a chest |
| Rank | Leagues with a three-minute week, promotion and demotion, rivals who pass you |
| Blob | A pet whose needs drop every second and who tells you so |
| Shop | Flash sales that always end soon, "only 2 left", fake savings |
| Hold | Press, fill, release in the gold band; golden holds pay double for 10 s |
| Rings | Things that vanish if you don't tap them, and a count of the ones you missed |
| You | Screen time, unlocks, achievements, settings |

Around the apps: badges that jiggle on every icon, the logo's tittle counting everything unread, banners that arrive every few seconds (1 s on Chaos), a notification center, a lock screen where notifications pile up, a welcome bonus, level-ups, a rate-us prompt that wants five stars, a break reminder that talks you out of the break, and a battery that drains.

Sound is synthesized with Web Audio. Haptics use `navigator.vibrate` on Android and the switch-control tick in Safari on iOS 18 and later. Progress is saved in `localStorage`; nothing leaves the device.

## Run

No build step. Serve the folder, or open `index.html` directly:

```sh
python3 -m http.server -d stim 8000   # then open http://localhost:8000
```

On a phone it fills the screen; on anything wider it runs inside an iPhone frame. On iPhone, open the page in Safari, then Share → Add to Home Screen for the full-screen app.

Desktop keys: `Space` does the app's main action (tap, pull, flip, hold, launch, buy), `←` `→` swipe, `↑` `↓` scroll and skip, `Enter` cashes out or sells, `N` summons a notification, `H` or `Esc` goes home, `⇧L` locks the phone.
