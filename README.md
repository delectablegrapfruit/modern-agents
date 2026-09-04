# Books (offline)

A self-contained reader that reproduces the presentation and features of **Books for macOS** without any of its
online parts: no Book Store, no Audiobook Store, no account, no sync, no “For You” recommendations. Everything —
the library, reading positions, bookmarks, highlights, notes, collections and reading goals — lives in the browser’s
local database on the device.

It is plain HTML/CSS/JS with **zero dependencies** and runs straight from `index.html` (double-click it) or as an
installable PWA when served over HTTP.

## Running

**macOS app (prebuilt):** `Books.app` in the repository root is a native, universal (Apple silicon + Intel) app —
double-click it. It is a tiny Cocoa shell (see `macos/`) that hosts the web app in a WKWebView with a unified
title bar, the standard menu bar, Finder “Open With” for EPUB/PDF/TXT, native open/save panels and drag & drop.
It needs macOS 11 or later and is not notarised: if you downloaded the repository as a ZIP (rather than cloning
it), macOS quarantines the app — right-click ▸ Open, or on macOS 15+ allow it under System Settings ▸ Privacy &
Security, or run `xattr -dr com.apple.quarantine Books.app`.

**Any browser:**

```sh
# Option A — just open the file
open index.html            # macOS

# Option B — serve it (enables the service worker + “Add to Dock” / install as an app)
python3 -m http.server 8000
# then visit http://localhost:8000
```

Add books with the **+** button, **⌘O**, or by dragging files onto the window. Supported: **EPUB** (2 and 3),
**PDF** (rendered by the browser’s built-in viewer) and **plain text** (converted to an EPUB on import, with
chapter detection). Seven public-domain sample books (Project Gutenberg) are installed on first launch and can be
removed or re-added at any time.

## What’s here

| Area | Features |
|---|---|
| Sidebar | Home · Library (All, Want to Read, Finished, Books, PDFs, My Samples) · My Collections (create, rename, delete, drag books onto them) |
| Home | **Continue** carousel with progress and time left · **Reading Goals** (daily minutes ring + streak, books per year) · library statistics. No store sections and nothing that duplicates the Library lists. |
| Library | Grid / list view · sort by Recent, Title, Author · search · NEW / SAMPLE badges · finished check · multi-select (⌘/⇧-click) · keyboard navigation · right-click menu (Read, Get Info, Mark as Finished, Want to Read, Add to Collection, Reset Position, Delete) · Get Info sheet with editable title/author |
| Reader | Paginated single or **two-page spread** (automatic on wide windows) or **vertical scrolling** · page counter and “pages left in this chapter” · scrubber · hover page-turn buttons · slide page turns · full screen with auto-hiding chrome · resumes exactly where you left off |
| Themes & Settings | Six themes (Original, Quiet, Paper, Bold, Calm, Focus) · Auto-Night · ten fonts · text size · line spacing · margins · justification · hyphenation · page layout options · display toggles |
| Annotations | Five highlight colours + underline · notes · bookmarks (⌘D) · Contents / Bookmarks / Notes panel · click a highlight to change, annotate or remove it · export as Markdown |
| Search | Full-text search in the book, grouped by chapter, Enter/⇧Enter to step through results |
| Goals & stats | Reading time is tracked while a book is open (pauses after 2 min idle) · daily goal and streak · yearly books goal · books are marked Finished when you reach the end |

### Mouse wheel & trackpad controls

In paginated mode the scroll wheel turns pages: scroll **down or right** for the next page, **up or left** for the
previous one. A single wheel notch or a two-finger swipe turns exactly one page — the inertial tail of a trackpad
flick is ignored, while a steadily spinning wheel keeps turning pages. **⌘ + wheel** (or pinch) changes the text size.
The behaviour is configurable in *Themes & Settings → Scroll Wheel & Trackpad*:

- Scroll Wheel Turns Pages (on/off)
- Sensitivity: Low / Medium / High
- Invert Direction
- Horizontal Scrolling (two-finger swipes turn pages)

With **Vertical Scrolling** enabled the wheel scrolls the text continuously instead, exactly like a web page.

### Keyboard

`→ ↓ Space PgDn` next page · `← ↑ ⇧Space PgUp` previous · `⌥→ / ⌥←` or `⌘] / ⌘[` chapters · `Home / End` ·
`⌘F` search · `⌘D` bookmark · `⌘+ / ⌘−` text size · `Esc` back to library. In the library: `⌘O` add,
`⌘F` search, `Return` open, `Space` info, `⌫` delete, `⌘A` select all, `⌃⌘S` sidebar. `⌘/` shows the full list.

## Layout of the code

```
Books.app/            prebuilt macOS app (universal binary + copy of the web app in Contents/Resources/app)
macos/BooksShell.c    the native shell: NSWindow + WKWebView via the Objective-C runtime (no SDK needed)
macos/build.sh        rebuilds Books.app with `zig cc` (arm64 + x86_64), packs the icon, copies the web app
index.html            app shell (sidebar, toolbar, library view, reader overlay)
css/app.css           macOS-style chrome, light & dark
css/reader.css        reader chrome, panels, popovers
js/util.js            helpers, generated cover art
js/icons.js           SF-Symbols-style inline SVG icons
js/zip.js             ZIP reader (DecompressionStream) and STORE writer
js/db.js              IndexedDB layer, settings, reading statistics
js/epub.js            EPUB 2/3 parser, resource + CSS scoping, EPUB builder, TXT → chapters
js/ui.js              menus (with submenus), popovers, sheets, toasts, controls
js/library.js         library data, views, import pipeline, collections, Get Info, samples
js/reader.js          pagination engine, locators, wheel/keys, themes, annotations, search, stats
js/app.js             bootstrap, toolbar, drag & drop, shortcuts, PWA plumbing
js/samples.js         generated sample library (public-domain texts)
sw.js                 offline cache when served over http(s)
tools/build-samples.mjs  regenerates js/samples.js from Project Gutenberg mirrors
```

### How rendering works

The whole book is written into one sandboxed `<iframe>` (scripts disabled). Each spine document becomes a
`<section>`; book stylesheets are rewritten so `html`/`body` rules target those sections and all images, fonts and
CSS `url()`s are resolved to blob URLs. Pagination is CSS multi-column layout with a fixed column height; a page
turn scrolls by one (or two) column widths. Positions are stored as `{spine, character offset}` locators, which is
what lets highlights, bookmarks and the reading position survive font, size, margin and window changes.

### Rebuilding Books.app

The bundle is committed prebuilt. To rebuild after changing the web app or the shell:

```sh
pip install ziglang            # or install Zig from ziglang.org
ZIG="python3 -m ziglang" ./macos/build.sh
```

`build.sh` cross-compiles `macos/BooksShell.c` for arm64 and x86_64 (Zig ad-hoc signs the arm64 slice), joins
them into a universal binary, renders `icon.svg` into `AppIcon.icns` (Playwright, optional) and copies the web
app into `Contents/Resources/app`. The shell talks to the page through `window.webkit.messageHandlers.books`
(window drag/zoom from the HTML chrome, save panel for exports, files handed over as base64) and implements
`WKUIDelegate` so `<input type=file>` opens a real `NSOpenPanel`.

## Requirements and limitations

- A current browser: EPUB decompression uses `DecompressionStream('deflate-raw')` (Safari 16.4+, Chrome 103+,
  Firefox 113+). Constructable stylesheets and `color-mix()` are used for CSS. Books.app uses the system WebKit,
  so it needs the macOS version that ships Safari 16.4 or newer (macOS 13.3+) for EPUBs.
- PDFs use the browser’s native viewer, so their reading position and page count are not tracked like EPUBs.
- There are no audiobooks — Books only ever offered those through the store.
- Storage is per browser profile; clearing site data removes the library. *Storage & Data…* in the ••• menu shows
  usage and offers a Markdown export of highlights and notes.
