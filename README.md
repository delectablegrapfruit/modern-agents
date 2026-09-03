# Sift

Removes the hidden files macOS leaves on every disk, and makes Finder show folders the way you decided.

## What it does

**Cleans.** `.DS_Store`, `._` sidecar files and `.apdisk` are removed the moment they appear, everywhere
Finder browses: your home folder, `/Users/Shared`, `/Applications` and every connected disk, internal,
external or network. Disk-level folders (`.Spotlight-V100`, `.fseventsd`, `.Trashes`, `.TemporaryItems`)
belong to the system; the window shows how many are waiting and removes them with an administrator
password, switching Spotlight off on that disk and leaving the event journal in its quiet `no_log` form so
neither grows back. Finder's own switches for not writing `.DS_Store` on network and USB disks are turned
on. *Sweep* looks through everything on demand and shows what it found before removing it.

Never touched: system folders and `~/Library`, packages (app bundles are sealed by their signature),
hidden folders, `node_modules`, read-only disks, Time Machine disks, custom volume icons, document version
history, Time Machine markers, and `.metadata_never_index`.

**Governs views.** One default view for every folder on every disk: mode, sort, grouping, and every value
from Finder's View Options window for each mode, including the Desktop. Folders can have a view of their own,
which the folders beneath them share unless they have one too. Applying relaunches Finder once.

Finder keeps a folder's own view in the parent folder's `.DS_Store`; Sift writes that one record where Finder
reads it and keeps the file to exactly that, so a view changed in Finder never outlives the window. Finder also
keeps a window's view while you browse; Sift watches Finder's windows and gives each folder the view it should
have as soon as a window shows it. That needs Automation access (asked once) and is instant with Accessibility
access, otherwise it happens within a second.

## The window

One window, top to bottom: what is being watched and what needs you · the default view and its options ·
folders with their own view · what was removed. The menu bar item sweeps, pauses and opens the window.

## Install

A prebuilt app is committed at [`dist/Sift.app.zip`](dist/Sift.app.zip), rebuilt by CI on every push.
Unzip, move `Sift.app` to Applications, open it. It is ad-hoc signed, so the first launch needs
right-click → Open (or `xattr -d com.apple.quarantine Sift.app`). Sift adds itself to your login items;
turn that off in its menu.

Full Disk Access (System Settings → Privacy & Security) lets Sift reach Desktop, Documents and the Trash on
other disks without a prompt per folder. The window says so until it is granted.

## Build

Requires macOS 13 or later and Xcode 15 or later.

```sh
make app     # builds build/Sift.app
make test    # core tests (also run on Linux)
make cli     # command-line tool
```

```
sift scan [folder…]     list junk without removing anything
sift sweep [folder…]    remove junk (--dry-run to only list it)
sift dsstore <folder>   show the records in a folder's .DS_Store
```

The command line ships inside the app at `Sift.app/Contents/MacOS/sift` and shares its settings
(`~/Library/Application Support/Sift/settings.json`).

## Layout

| Path | Purpose |
|------|---------|
| `Sources/SiftCore` | Catalog, safety, scanner, remover, volumes, watcher, views, Finder preferences, `.DS_Store` codec, folder stores, window guard, engine. Foundation only; builds on Linux. |
| `Sources/Sift` | Menu bar app and its one window. |
| `Sources/sift` | Command line. |
| `Tests/SiftCoreTests` | Core tests. CI also checks `.DS_Store` files against the independent `ds_store` package. |

MIT licensed.
