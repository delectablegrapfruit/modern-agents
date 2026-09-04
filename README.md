# Sift

Removes the hidden files macOS leaves on every disk, and makes Finder show folders the way you decided.

## What it does

**Cleans.** `.DS_Store`, `._` sidecar files and `.apdisk` are removed the moment they appear, everywhere
Finder browses: your home folder, `/Users/Shared`, `/Applications` and every connected disk, internal,
external or network. Disk-level folders (`.Spotlight-V100`, `.fseventsd`, `.Trashes`, `.TemporaryItems`)
are removed too, switching Spotlight off on that disk and leaving the event journal in its quiet `no_log`
form so neither grows back. On disks that enforce ownership those folders belong to root: the window says
so and offers *Allow…*, which installs Sift's helper once (one administrator password, a launchd daemon at
`/Library/PrivilegedHelperTools/dev.sift.helper` answering only your user, removing only catalog junk in
catalog places). From then on such items go the same way as everything else, in the background. What is
left after that is protected by macOS privacy controls (the Trash on other disks): add the helper under
System Settings → Privacy & Security → Full Disk Access.

To remove the helper, unload `dev.sift.helper.<your uid>` with `launchctl bootout system/…` and delete its
plist in `/Library/LaunchDaemons` and the binary in `/Library/PrivilegedHelperTools`. Finder's own switches for not writing `.DS_Store` on network and USB disks are turned
on. *Sweep* looks through everything on demand and shows what it found before removing it.

Between sweeps Sift never walks a disk on its own: it only reacts to what the system reports, one wake-up
a second per disk at most, so idle cost is nothing, external disks can sleep, and nothing is read that was
not just written. Sweeps run in the kernel's lowest disk priority and yield to everything else. Junk that
was already on a disk before Sift ran waits for a sweep.

Never touched: system folders and `~/Library`, packages (app bundles are sealed by their signature),
hidden folders, `node_modules`, read-only disks, Time Machine disks, custom volume icons, document version
history, Time Machine markers, and `.metadata_never_index`.

**Governs views.** One default view for every folder on every disk: mode, sort, grouping, and every value
from Finder's View Options window for each mode, including the Desktop. Folders can have a view of their own,
which the folders beneath them share unless they have one too. Applying quits Finder, writes its
preferences and the folder records, and starts it again.

Finder reads a folder's own view from the parent folder's `.DS_Store`, under the folder's name; Sift writes
that one record and keeps the file to exactly that, so a view changed in Finder never outlives the window.
Finder also keeps a window's view while you browse; Sift watches Finder's windows and gives each folder the
view it should have as soon as a window shows it, the default included: a window leaving a custom folder for
an ordinary one is put back to the default in that same step. That needs Automation access (asked once).
Sift looks at Finder's windows once a second while Finder is the frontmost app, and with Accessibility
access new and focused windows are handled at once. Finder is spoken to from a separate process with a
short timeout, so a busy Finder never holds Sift's window. Every view it sets is listed under Activity.

## The window

Sift has no Dock icon: it lives in the menu bar as a sieve glyph (three shortening lines). The window
opens by itself the first time Sift runs; after that, open it from the menu bar item or by opening the app
again. One window, top to bottom: what is being watched and what needs you · the default view and its
options · folders with their own view · what was removed. The menu bar item also sweeps and pauses.

## Install

A prebuilt app is committed at [`dist/Sift.app.zip`](dist/Sift.app.zip), rebuilt by CI on every push.
Unzip, move `Sift.app` to Applications, open it. It is ad-hoc signed, so macOS blocks the first launch
of the downloaded copy: on macOS 15 and later go to System Settings → Privacy & Security and choose
*Open Anyway*; on earlier versions right-click → Open. Or clear the quarantine first:
`xattr -d com.apple.quarantine /Applications/Sift.app`. Sift adds itself to your login items; turn that
off in its menu.

Full Disk Access (System Settings → Privacy & Security) lets Sift reach Desktop, Documents and the Trash on
other disks without a prompt per folder. The window says so until it is granted.

## Build

Requires macOS 13 or later and Xcode 15 or later.

```sh
make app     # builds build/Sift.app
make test    # core tests (also run on Linux)
make cli     # command-line tool, sift-cli
```

```
sift-cli scan [folder…]     list junk without removing anything
sift-cli sweep [folder…]    remove junk (--dry-run to only list it)
sift-cli dsstore <folder>   show the records in a folder's .DS_Store
```

The command line ships inside the app at `Sift.app/Contents/MacOS/sift-cli` and shares its settings
(`~/Library/Application Support/Sift/settings.json`).

## Layout

| Path | Purpose |
|------|---------|
| `Sources/SiftCore` | Catalog, safety, scanner, remover, volumes, watcher, views, Finder preferences, `.DS_Store` codec, folder stores, window guard, engine. Foundation only; builds on Linux. |
| `Sources/Sift` | Menu bar app and its one window. |
| `Sources/SiftCLI` | Command line (`sift-cli`). |
| `Sources/SiftHelper` | Root helper (`sift-helper`), installed once as a launchd daemon. |
| `Tests/SiftCoreTests` | Core tests. CI also checks `.DS_Store` files against the independent `ds_store` package. |

MIT licensed.
