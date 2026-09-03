# Winnow

Keeps Mac-specific metadata off the disks you share with other systems.

macOS scatters `.DS_Store`, `._*` resource forks, `.Spotlight-V100`, `.Trashes`,
`.fseventsd` and similar files across every volume it touches. Winnow watches
your external, network and chosen folders and removes those files the moment
they appear, and sweeps whole disks on demand.

## What it does

- **Watches** every eligible volume and every folder you add, deleting junk within about half a second of it being written (FSEvents; network shares also poll, since remote writes produce no local events).
- **Sweeps** on demand: everything at once, a single dropped folder, or via *Clean with Winnow* in Finder's Services menu.
- **Cleans on connect and before eject**, so a USB stick leaves clean.
- **Rules** you can switch individually, plus your own name patterns.
- **Disk policy**: external, network, internal, per-volume overrides, skip Mac-formatted disks.
- **Prevention**: Finder's own `.DS_Store` switches for network and USB volumes; a Spotlight no-index marker on cleaned disks.
- **Finder defaults**: default view mode, sort key and direction, group-by, folders-first, and per-mode view options (icon size, grid spacing, text size, label position, list columns, relative dates, column-view icons and preview, gallery thumbnail size). Written to Finder's own preferences, verified, then Finder is relaunched. *Reset existing folder settings* removes `.DS_Store` across your home folder and Applications so every folder actually adopts them.
- **Folders with their own view**: give any folder its own mode and options (Pictures → 128 px icons and Movies → gallery are preconfigured). Winnow writes the folder's `.DS_Store` itself — no Automation permission, no Finder window flashing — and every sweep leaves that file alone.
- **Startup disk** (off by default, warning on enable): removes `.DS_Store` from your home folder and Applications continuously, with an optional time limit (1 h … 1 week) or indefinitely. System folders and `~/Library` are never touched.
- **Safety**: never the startup disk, never system folders, never outside the area being cleaned, never a mount point itself. Volume-level folders are matched only at the top of a volume.
- **Activity log** of everything removed.

Runs from the menu bar. One window, six panes: Clean · Rules · Locations · Finder · Options · Activity.

## Install

A prebuilt app is committed at [`dist/Winnow.app.zip`](dist/Winnow.app.zip) (rebuilt by CI on every push).
Unzip, move `Winnow.app` to Applications, open it. It is ad-hoc signed, so the first launch needs
right-click → Open (or `xattr -d com.apple.quarantine Winnow.app`).

## Permissions

Some of what macOS leaves behind is owned by root or gated by privacy controls, so a normal
user process cannot delete it:

| Item | Why it fails | Fix |
|------|--------------|-----|
| `.Spotlight-V100`, `.fseventsd` | created by root daemons, mode 700 | *Remove as Administrator…* in the sweep result (asks for your password), or `sudo winnow-cli sweep /Volumes/Disk` |
| `.TemporaryItems`, `.Trashes` subfolders | sticky-bit folders holding other users' entries | same as above |
| `.Trashes` | protected by privacy controls on every disk | System Settings → Privacy & Security → Full Disk Access → add Winnow |
| anything on APFS/HFS+ externals | ownership is enforced | Finder → Get Info on the disk → *Ignore ownership on this volume* (`diskutil disableOwnership /Volumes/Disk`) makes root-owned items deletable |

Background cleaning never prompts for a password; it removes what it can and reports the rest in Activity once.
Turn on *Spotlight: don't index cleaned disks* so `.Spotlight-V100` is not rebuilt after removal.

## Build

Requires macOS 13 or later and Xcode 15 or later.

```sh
make app          # builds build/Winnow.app
make run          # builds and opens it
make test         # unit tests for the engine
make cli          # command-line tool
```

`swift build` and `swift test` also work directly. Launch-at-login and notifications need the `.app` bundle.

## Command line

```
winnow-cli scan <folder>...        list junk without deleting
winnow-cli sweep <folder>...       remove junk beneath the given folders   (--dry-run, --shallow)
winnow-cli full-sweep              clean every configured location and eligible volume
winnow-cli watch [<folder>...]     watch and clean continuously
winnow-cli rules                   list rules
winnow-cli volumes                 list mounted volumes and whether they would be cleaned
winnow-cli dsstore <folder>        show the records in a folder's .DS_Store
winnow-cli set-view <folder> <mode>  give a folder its own view (icons|list|columns|gallery; --sort=…, --icon-size=N)
```

The CLI shares its settings with the app (`~/Library/Application Support/Winnow/settings.json`).

## Layout

| Path | Purpose |
|------|---------|
| `Sources/WinnowCore` | Rules, scanner, sweeper, safety policy, settings, watchers, engine, Finder defaults, `.DS_Store` reader/writer. Foundation only; also builds on Linux. |
| `Sources/Winnow` | SwiftUI menu bar app and configuration window. |
| `Sources/winnow-cli` | Command-line front end. |
| `Tests/WinnowCoreTests` | Engine tests. |
| `Packaging`, `scripts` | Info.plist, app bundling, icon rendering. |

MIT licensed.
