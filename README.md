# Audio Limiter

A menu bar app for the Mac that lowers the maximum volume of an output device, so that the system volume slider
spreads over less loudness: studio headphones that are already loud at half volume get the whole slider for the
range they are actually listened at, and every step of the slider or the volume keys changes the loudness by less.

[![CI](https://github.com/delectablegrapfruit/modern-agents/actions/workflows/ci.yml/badge.svg?branch=claude/adoring-newton-ylz2vn)](https://github.com/delectablegrapfruit/modern-agents/actions/workflows/ci.yml)

## What it does

**One slider per device.** The menu bar item lists every output device — the current one first — each with a
*maximum volume*, from 5% to 100% (off). A maximum of 50% means the device at full volume now plays as loud as it
did at 50%, and at every other position as loud as it did at half that position: the system slider, the volume keys
and Control Center keep working as before, but their whole range now covers what the lower half of it used to. Below
each slider the menu shows what the current volume amounts to ("Volume 62% plays like 31% · top −18 dB").

**Per device, remembered.** Ceilings are kept per device (by Core Audio UID, or by name for a USB device that comes
back under a new UID in another port) in `~/Library/Application Support/Audio Limiter/Settings.json`. A device
without a volume control of its own — many audio interfaces — gets a fixed level from its slider instead.

**No loudness jumps.** Switching the app on divides the system volume by the ceiling (up to 100%), and switching it
off or quitting multiplies it back, so the sound stays exactly as loud at that moment; only what the slider means
changes. Moving a ceiling slider changes the loudness at once, so you hear where you are setting it.

The switch at the top turns all limits off and on; Open at Login starts the app with the Mac.

## Install

A prebuilt app is committed in [`dist/`](dist/) — [`AudioLimiter.app.zip`](dist/AudioLimiter.app.zip) and
[`AudioLimiter.dmg`](dist/AudioLimiter.dmg), with [checksums](dist/SHA256SUMS.txt) — rebuilt by CI on every push.
Unzip (or open the disk image), drag Audio Limiter to Applications, open it. It is ad-hoc signed, so macOS blocks
the first launch of a downloaded copy: right-click ▸ Open, or System Settings ▸ Privacy & Security ▸ Open Anyway, or
`xattr -dr com.apple.quarantine "/Applications/Audio Limiter.app"`. Requires macOS 14.2.

The first time a ceiling is set below 100%, macOS asks to allow the app to capture system audio (System Settings ▸
Privacy & Security ▸ Screen & System Audio Recording). That is the permission a Core Audio tap needs; the sound passes
through the app on its way to the device and is not recorded or kept. A rebuilt copy has a new signature and asks
again.

## How it works

A Mac cannot relabel its own volume slider: the slider *is* the device's volume control. So the app leaves the
slider alone and lowers the sound before it reaches the device, by the amount that makes the two together come out
right.

1. **The curve.** Core Audio converts any volume position of a device to decibels
   (`kAudioDevicePropertyVolumeScalarToDecibels`), so the app samples each device's own curve — 65 points from 0 to
   1. Devices without one get a generic cubic taper.
2. **The gain.** With the system volume at position *v* and a ceiling *c*, the device should sound as it would at
   *v × c*. The device itself plays at `dB(v)`, so the app applies `dB(v × c) − dB(v)` — recomputed whenever the
   volume moves (it listens to `kAudioHardwareServiceDeviceProperty_VirtualMainVolume`) and glided in over ~30 ms so
   that there are no clicks. On a cubic taper this is a fixed gain; on a device that is linear in decibels it grows
   with the volume, which is what makes each slider step smaller.
3. **The path.** A Core Audio process tap (`CATapDescription`, macOS 14.2) takes the sound every other process sends
   to the device and mutes it there. A private aggregate device made of the device and the tap plays that sound back
   into the device through the gain, in a real-time callback that allocates nothing. The system volume then acts on
   the device as always.
4. **Only while something plays.** Core Audio's process list (macOS 14) tells which processes are playing to which
   device. The aggregate device runs only while some other app plays to the device and stops 20 seconds after the
   last one does, so an idle limiter costs nothing and never keeps the Mac awake. The tap mutes from the moment it
   exists, so if starting ever lags the first sound by a few milliseconds, that sound begins silent rather than
   loud. Should a limiter fail, it is taken down and the system volume lowered by its ceiling.

Sample-rate and stream changes rebuild the device's limiter (the new one is ready before the old one lets go);
sleep and a Core Audio restart rebuild all of them.

## Build

Requires macOS 14.2 or later and Xcode 15.1 or later.

```sh
make app     # builds "build/Audio Limiter.app"
make run     # builds and opens it
make test    # core tests (also run on Linux)
```

CI builds on GitHub's macOS runners, which bill at ten times the Linux rate. To build on your own Mac instead, add it
as a self-hosted runner (Settings ▸ Actions ▸ Runners) and set the repository variable `LIMITER_MACOS_RUNNER` to its
label, e.g. `self-hosted`.

## Layout

| Path | Purpose |
|------|---------|
| `Sources/LimiterCore` | Foundation only: the volume curve and the gain that maps the slider under a ceiling (`VolumeCurve`), the real-time gain smoother and channel-by-channel copy (`Mixer`), the settings and their file. Builds and is tested on Linux. |
| `Sources/AudioLimiter` | The app: Core Audio access (`AudioObject`, `OutputDevice`), the tap and aggregate device per device (`DeviceLimiter`), which devices are playing (`ActivityMonitor`), the audio-capture permission (`Permission`), the state (`LimiterModel`), the menu (`MenuView`), and the launch self-test CI runs (`SelfTest`). |
| `Tests/LimiterCoreTests` | Core tests: the mapping on real and generic curves, settings, the mixer and smoother. |
| `Packaging/Info.plist`, `scripts/` | Bundle assembly (`make-app.sh`), icon rendering, ad-hoc signing. |
| `.github/workflows/ci.yml` | macOS runner: tests, bundle, launch self-test of the packaged zip (unzipped elsewhere, build directory hidden), an informational tap test, zip + dmg, commit to `dist/`. Linux runner: core build and tests. |

## Limitations

- Only sound played through Core Audio's process mix is limited: an app that takes the device exclusively (hog mode)
  bypasses the tap. Apps playing through their own aggregate device are not seen as playing to the device.
- The tap covers the device's first output stream; audio interfaces with further output streams keep those as they
  are.
- The sound passes through the app, which adds one Core Audio buffer of latency (a few milliseconds).
- There is no public way to check the audio-capture permission ahead of using a tap, so the app asks the TCC framework
  directly; if that ever goes away, macOS asks on its own when the first tap starts.

MIT licensed.
