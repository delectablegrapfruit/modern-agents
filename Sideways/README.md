# Sideways

A pocket drift game for the Mac that floats in a corner of the screen, above your work, for the minute between two
tasks: a night road seen from above, neon walls, a car that slides. Click it (or press ⌃⌥D anywhere), drive a lap or
two, click back into your work — the game pauses the moment it loses the keyboard and waits, exactly where you left
it, for as long as you like.

## How it plays

**One lap is half a minute.** Each track is a closed road of about 25 seconds a lap. The timer starts when you cross
the line; a lap counts when you come round to it again. Your best lap on each track is kept with its **ghost**, a
translucent car you race from then on, and the gap to it (−0.31 in green, +0.42 in red) runs under the lap time.

**Drift for points.** A flick of the handbrake into a bend — or a hard turn on full throttle at speed — lets the
rear go; the car keeps rotating while it travels on, and holding the throttle holds the slide. Steering sets the
angle; past about 50° the car countersteers for you, so a held key makes a big angle rather than a spin. While the
car is sideways, points flow at speed × angle, half again as fast within a car's width of a wall (**CLOSE**). Slides
linked within a second and a half make a chain whose multiplier climbs to ×8 with time spent sideways; the chain is
banked when you straighten up for good. A proper knock against a wall, or a spin, drops the unbanked chain — that is
the only thing the game ever takes from you. Scrapes are free.

**Low stakes, all the way down.** No lives, no fuel, no timer running while you are away, no notifications, no
sound. Every banked point goes to a career total that climbs through seven ranks — Rookie, Street, Tuner, Pro, Ace,
Legend, Drift King — each of which unlocks a paint for the car.

**Tracks.** Eight circuits, from the flowing Harbor Loop to the tight Chrome Canyon, and a **daily road** — a new track
every day, the same for everyone. Every road is generated from a seed (a ring of control points threaded with a
centripetal Catmull-Rom spline, then checked: every bend drivable, no stretch of road overlapping another, enough
twists to be worth driving), so the whole catalogue is a few numbers.

## Keys

| Key | |
|---|---|
| ← → or A D | steer |
| ↑ or W | throttle |
| ↓ or S | brake, then reverse |
| space | handbrake |
| R | back to the line |
| [ ] | previous / next track |
| G | ghost on or off |
| esc or P | pause |
| H | how to play |
| ⌘W | tuck the window away (⌃⌥D brings it back) |
| ⌘Q | quit |

Anywhere: **⌃⌥D** shows the window with the keyboard, tucks it away, or takes the keyboard if it is showing.

## Staying out of the way

- **No Dock icon, no menu bar.** A steering wheel in the menu bar has the menu: show or hide, track (with your best
  laps), paint, window size, ghost, fading, your rank, how to play, reset, quit. The same menu is on a right click.
- **It never takes the foreground.** The window is a non-activating panel: clicking it gives it the keyboard without
  bringing the app forward, so the app you were in keeps its menu bar and a click back into it hands the keyboard
  straight back — and pauses the game.
- **Small.** 256 × 160, 336 × 210 or 448 × 280 points, borderless with rounded corners. Drag it anywhere; a size
  change keeps it tucked into its corner. It floats on every Space and over full-screen apps.
- **Quiet.** Parked, it fades to 60% (less when the pointer is over it) and draws nothing at all: the display link
  stops, so a paused game uses no CPU. It never makes a sound and never sends a notification.
- **Your records** are one small file, `~/Library/Application Support/Sideways/records.json`; ghosts are packed
  floats, about 13 KB a lap. Dailies older than a week are forgotten.

## Install

CI commits a prebuilt app on every push: [`dist/Sideways.app.zip`](dist/Sideways.app.zip) with its
[checksum](dist/SHA256SUMS.txt). Unzip, drag Sideways to Applications, open it. It is ad-hoc signed, so macOS blocks
the first launch of a downloaded copy: right-click ▸ Open, or System Settings ▸ Privacy & Security ▸ Open Anyway, or
`xattr -dr com.apple.quarantine /Applications/Sideways.app`. Requires macOS 14. To start it with the Mac, add it in
System Settings ▸ General ▸ Login Items.

## Build

```sh
make app     # build/Sideways.app (macOS, Xcode 15 or later)
make run     # build and open it
make test    # core tests (also run on Linux)
make sim     # autopilot laps on every track, headless
```

```
sideways-sim [laps] [track-id…]   lap times, drift points and wall hits of the autopilot on each track
sideways-sim --svg <track-id>     the road as an SVG
sideways-sim --scan <count>       seeds 1…count with how much they twist, to pick circuits from
```

## Layout

| Path | Purpose |
|------|---------|
| `Sources/SidewaysCore` | The game, Foundation only: track generation and projection, car physics, drift scoring, laps and sectors, ghosts, records and ranks, the camera and effects state, the fixed-step game loop, and an autopilot. Builds and is tested on Linux. |
| `Sources/Sideways` | The app: the floating panel, the view (keys in, frames out, a display link that runs only while something moves), the Core Graphics renderer, the menu bar item and menus, the ⌃⌥D hot key, and the CI hooks (`SIDEWAYS_SNAPSHOT` renders frames offscreen, `SIDEWAYS_SELFTEST` drives the real window through its key handling and checks a lap was done). |
| `Sources/SidewaysSim` | `sideways-sim`. |
| `Tests/SidewaysCoreTests` | Every track valid and deterministic, the handling (grip, handbrake drift, recovery, power slides), scoring, laps on every track with on/off keys as a person drives, records, the game loop. |
| `Packaging/Info.plist`, `scripts/` | Bundle assembly (`make-app.sh`, `LSUIElement`), icon rendering, ad-hoc signing. |
| `../.github/workflows/sideways.yml` | macOS runner: tests, bundle, offscreen snapshots, a windowed self-test of the packaged app unzipped elsewhere, zip, commit to `dist/`. Linux runner: core build and tests, autopilot laps. |

MIT licensed.
