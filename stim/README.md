# stim

A toy phone OS (lock screen, home screen, notification center) built from every engagement tactic a phone uses, done as well as possible, with nothing of substance inside. Twenty-odd apps are bundled by type into eight home-screen apps. All in-app copy is straight-faced; the design carries the joke.

| App | Inside | Tactics |
| --- | --- | --- |
| Feed | Home, Clips, Discover, Activity, Profile | A social network of generated people and art: stories with unseen rings, a feed with live-ticking likes, double-tap hearts, comments that keep arriving, sponsored posts, "all caught up" then endless suggestions; full-screen autoplay clips; swipe to follow with a paid "who wants to follow you"; grouped activity; posting that makes likes and followers pour in |
| Casino | Slots, Rocket, Flip, Scratch, Loot | Heavily weighted to win (about 85–90%): near misses, crash betting with Auto Cash-Out, double or nothing, scratch cards, mystery boxes with rarity tiers and a pity timer |
| Markets | Trade, Predict | Crypto that mostly climbs while you hold it and again after you sell; prediction markets that mostly resolve your way |
| Play | Games home + Tap Tycoon, Sweet Spot, Ring Rush, Pocket Blob, Gate Army, Power Tower | A games app where each game opens like its own app. Gate Army and Power Tower are "just like the ads": shoot gates to multiply your army against an onslaught, and a hero who absorbs weaker enemies up a tower |
| Inbox | Inbox | Unread dots; read, swipe or clear all |
| Goals | Streak, Quests, Leaderboard | Daily rewards and a one-minute pulse; endowed-progress quests, a rapid quest, a chest; a leaderboard placeholder for real players later |
| Shop | Deals, Cart, Orders | Marketplace tactics: lightning deals, spin-to-win coupons, 90%-off prices, "only 3 left", a free gift stuck at 98%, free-shipping thresholds, price drops in the cart, full checkout with swipe to pay, and orders tracked over a few minutes |
| You | You | Screen time, achievements, notification and app settings |

The home screen has a Waiting for you widget listing what wants you right now (deadlines first, with countdowns), so you pick what to do next. Banners come one at a time: at most one ordinary banner every 25 seconds on Normal (60 on Calm, 10 on Busy), one per hook every 30 seconds, and none while you're inside an app, where you get one summary when you leave. Anything with a deadline shows the time left when it appears, and it's withdrawn once it's too late to act on. Everything else waits quietly in the notification center. In You, set the pace (Calm, Normal, Busy), turn off quiet-in-apps, or switch notifications off per app; a muted app also stops showing its badge on the home screen. Around the apps: badges that jiggle on every icon and tab, the logo's tittle counting everything unread, a lock screen where notifications pile up, level-ups, a rate-us prompt, a break reminder that talks you out of the break, and a battery that drains.

Sound is synthesized with Web Audio. Haptics use `navigator.vibrate` on Android and the switch-control tick in Safari on iOS 18 and later. Progress is saved in `localStorage`; nothing leaves the device.

Code layout and the module contract are in [MODULES.md](MODULES.md).

## Run

No build step. Serve the folder, or open `index.html` directly:

```sh
python3 -m http.server -d stim 8000   # then open http://localhost:8000
```

On a phone it fills the screen; on anything wider it runs inside an iPhone frame. On iPhone, open the page in Safari, then Share → Add to Home Screen for the full-screen app.

Desktop keys: `Space` does the app's main action (tap, pull, flip, hold, launch, buy), `←` `→` swipe, `↑` `↓` scroll and skip, `Enter` cashes out, sells or goes, `1`–`5` switch tabs inside an app, drag with the mouse to scroll and swipe, `N` summons a notification, `H` or `Esc` goes home, `⇧L` locks the phone.
