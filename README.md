# Winnow

Keeps Mac-specific metadata off the disks you share with other systems.

macOS scatters `.DS_Store`, `._*` resource forks, `.Spotlight-V100`, `.Trashes`,
`.fseventsd` and similar files across every volume it touches. Winnow watches
your external, network and chosen folders and removes those files the moment
they appear, and sweeps whole disks on demand.

## What it does

- **Watches** every eligible volume and every folder you add, deleting junk as it is written (FSEvents locally, polling on network shares).
- **Sweeps** on demand: everything at once, a single dropped folder, or via *Clean with Winnow* in Finder's Services menu.
- **Cleans on connect and before eject**, so a USB stick leaves clean.
- **Rules** you can switch individually, plus your own name patterns.
- **Disk policy**: external, network, internal, per-volume overrides, skip Mac-formatted disks.
- **Prevention**: Finder's own `.DS_Store` switches for network and USB volumes; a Spotlight no-index marker on cleaned disks.
- **Safety**: never the startup disk, never system folders, never outside the area being cleaned, never a mount point itself. Volume-level folders are matched only at the top of a volume.
- **Activity log** of everything removed.

Runs from the menu bar. One window configures everything.

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
```

The CLI shares its settings with the app (`~/Library/Application Support/Winnow/settings.json`).

## Layout

| Path | Purpose |
|------|---------|
| `Sources/WinnowCore` | Rules, scanner, sweeper, safety policy, settings, watchers, engine. Foundation only; also builds on Linux. |
| `Sources/Winnow` | SwiftUI menu bar app and configuration window. |
| `Sources/winnow-cli` | Command-line front end. |
| `Tests/WinnowCoreTests` | Engine tests. |
| `Packaging`, `scripts` | Info.plist, app bundling, icon rendering. |

MIT licensed.
