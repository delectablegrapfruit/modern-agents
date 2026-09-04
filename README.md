# Books (offline)

[![Build Books.app](https://github.com/delectablegrapfruit/modern-agents/actions/workflows/macos-app.yml/badge.svg?branch=book-reader)](https://github.com/delectablegrapfruit/modern-agents/actions/workflows/macos-app.yml)

A self-contained reader that reproduces the presentation and features of **Books for macOS** without any of its
online parts: no Book Store, no Audiobook Store, no account, no sync, no “For You” recommendations. Everything —
the library, reading positions, bookmarks, highlights, notes, collections and reading goals — lives in the browser’s
local database on the device.

It is plain HTML/CSS/JS with **zero dependencies** and runs straight from `index.html` (double-click it) or as an
installable PWA when served over HTTP.

## Running

**macOS app:** download [`dist/Books.app.zip`](dist/Books.app.zip) (or [`dist/Books.dmg`](dist/Books.dmg)),
unzip and drag `Books.app` to Applications. The packages are built by GitHub Actions on a macOS runner from every
push (workflow *Build Books.app*, `.github/workflows/macos-app.yml`) and committed to `dist/`; the same files are
attached to each run as artifacts and to releases. The app is a universal (Apple silicon + Intel) Cocoa shell
(see `macos/`) that hosts the web app in a WKWebView with a unified title bar, the standard menu bar, Finder “Open
With” for EPUB/PDF/TXT, native open/save panels and drag & drop. It needs macOS 11 or later (13.3+ for EPUBs) and
is ad-hoc signed but not notarised: if macOS refuses to open it, right-click ▸ Open, or allow it under System
Settings ▸ Privacy & Security, or run `xattr -dr com.apple.quarantine Books.app`.

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
chapter detection). The library starts empty — nothing is bundled.

## What’s here

| Area | Features |
|---|---|
| Presentation | Liquid Glass chrome: floating translucent sidebar and toolbar over the content, capsule controls, opaque menus, popovers and sheets; light and dark |
| Sidebar | Home · Library (All, Finished, Books, PDFs) · My Collections (create, rename, delete, drag books onto them) |
| Home | **Continue** carousel with progress and time left · **Reading Goals** (daily minutes ring + streak, books per year) · library statistics. Each section can be hidden with **Customize** (also in the ••• menu). |
| Library | Grid / list view · sort by Recent, Title, Author · search · NEW badge · finished check · multi-select (⌘/⇧-click) · keyboard navigation · right-click menu (Read, Get Info, Mark as Finished, Add to Collection, Reset Position, Delete) · Get Info sheet with editable title/author |
| Formats | EPUB 2/3 · **Kindle MOBI / AZW / AZW3 (KF8)** — DRM-free files are converted to EPUB on import, keeping images, fonts, styles and the table of contents · PDF (native viewer, themeable) · plain text / Markdown (typeset into a book) |
| Reader | Paginated single or **two-page spread** (automatic on wide windows) or **vertical scrolling** · page counter and “pages left in this chapter” · **timeline** with chapter markers, bookmark dots and a page/chapter readout that follows the pointer (drag to scrub, stays put while dragging) · page-turn buttons that appear only when the pointer nears the left or right edge · slide page turns · full screen with chrome that hides and returns when the pointer nears the top or bottom · resumes exactly where you left off |
| Themes & Settings | Six themes (Original, Quiet, Paper, Bold, Calm, Focus) · Auto-Night follows the system (Original in Light Mode, **Focus** in Dark Mode) · PDFs take the same themes · themed scrollbar in vertical scrolling · ten fonts · text size · line spacing · **text width** (Narrow / Medium / Wide / Full, applies to both layouts) · justification · hyphenation · page layout options · display toggles |
| Annotations | Five highlight colours + underline · notes · bookmarks (⌘D) · Contents / Bookmarks / Notes panel · click a highlight to change, annotate or remove it · export as Markdown |
| Search | Full-text search in the book, grouped by chapter, Enter/⇧Enter to step through results |
| Goals & stats | Reading time is tracked while a book is open (pauses after 2 min idle) · daily goal and streak · yearly books goal · books are marked Finished when you reach the end |

### Mouse wheel & trackpad controls

In paginated mode the scroll wheel turns pages: scroll **down or right** for the next page, **up or left** for the
previous one. Each click of a notched mouse wheel is one page, however many pixels the system maps it to; a
two-finger swipe turns exactly one page — the inertial tail of a trackpad flick is ignored, while steady input keeps
turning pages. A horizontal or tilt wheel and **⇧ + wheel** turn pages too. **⌘ + wheel** (or pinch) changes the text size. Configurable in *Themes & Settings → Scroll Wheel &
Trackpad*:

- Scroll Wheel Turns Pages (on/off)
- Sensitivity: Low / Medium / High
- Invert Direction
- Horizontal Scrolling (horizontal/tilt wheel, ⇧ + wheel, two-finger swipes)

With **Vertical Scrolling** enabled the wheel scrolls the text continuously instead, exactly like a web page, and
horizontal gestures move a screen at a time.

### Keyboard

`→ ↓ Space PgDn` next page · `← ↑ ⇧Space PgUp` previous · `⌥→ / ⌥←` or `⌘] / ⌘[` chapters · `Home / End` ·
`⌘F` search · `⌘D` bookmark · `⌘+ / ⌘−` text size · `Esc` back to library. In the library: `⌘O` add,
`⌘F` search, `Return` open, `Space` info, `⌫` delete, `⌘A` select all, `⌃⌘S` sidebar. `⌘/` shows the full list.

## Layout of the code

```
dist/                 packaged Books.app.zip / Books.dmg / SHA256SUMS.txt, committed by CI
.github/workflows/    macos-app.yml — builds, signs, launch-tests and packages the app on a macOS runner
macos/BooksShell.c    the native shell: NSWindow + WKWebView via the Objective-C runtime (no SDK needed)
macos/package.sh      assembles Books.app from a compiled shell binary (used by CI and build.sh)
macos/build.sh        local cross-build with `zig cc` (arm64 + x86_64) → dist/Books.app(.zip)
index.html            app shell (sidebar, toolbar, library view, reader overlay)
css/app.css           macOS-style chrome, light & dark
css/reader.css        reader chrome, panels, popovers
js/util.js            helpers, generated cover art
js/icons.js           SF-Symbols-style inline SVG icons
js/zip.js             ZIP reader (DecompressionStream) and STORE writer
js/db.js              IndexedDB layer, settings, reading statistics
js/epub.js            EPUB 2/3 parser, resource + CSS scoping, EPUB builder, TXT → chapters
- `js/mobi.js` — Kindle (MOBI/KF8) → EPUB converter
js/ui.js              menus (with submenus), popovers, sheets, toasts, controls
js/library.js         library data, views, import pipeline, collections, Get Info
js/reader.js          pagination engine, locators, wheel/keys, themes, annotations, search, stats
js/app.js             bootstrap, toolbar, drag & drop, shortcuts, PWA plumbing
sw.js                 offline cache when served over http(s)
```

### How rendering works

The whole book is written into one `<iframe>` after sanitizing (scripts, inline handlers, `javascript:` URLs, forms and
embeds are removed; the frame's sandbox still blocks forms, popups and top-level navigation — it keeps `allow-scripts`
because WebKit will not run event listeners, even parent-registered ones, in a script-disabled frame). Each spine document becomes a
`<section>`; book stylesheets are rewritten so `html`/`body` rules target those sections and all images, fonts and
CSS `url()`s are resolved to blob URLs. Pagination is CSS multi-column layout with a fixed column height; a page
turn scrolls by one (or two) column widths. Positions are stored as `{spine, character offset}` locators, which is
what lets highlights, bookmarks and the reading position survive font, size, margin and window changes.

### How Books.app is built

`.github/workflows/macos-app.yml` runs on `macos-14` for every push (and on `workflow_dispatch` / releases):

1. `clang -arch arm64 -arch x86_64 -mmacosx-version-min=11.0` compiles `macos/BooksShell.c` into a universal binary.
2. `macos/package.sh` assembles `dist/Books.app` (Info.plist, icon, the web app in `Contents/Resources/app`).
3. `codesign --sign -` ad-hoc signs the bundle and `codesign --verify --deep --strict` checks it.
4. **Launch test**: the app is started with `BOOKS_SELFTEST=1`. The shell loads `index.html`, waits for the page's
   `ready` message, then the page imports a generated EPUB, opens it, turns a page (checking that the page really
   scrolled) and reports back; the shell prints the result and exits non-zero on any failure (navigation error,
   crashed web process, 120 s timeout).
5. `ditto` and `hdiutil` produce `Books.app.zip` and `Books.dmg`; checksums go to `SHA256SUMS.txt`.
6. The packages are uploaded as the `Books.app` artifact, committed to `dist/` (push events) and attached to
   releases.

To build locally without a Mac: `pip install ziglang && ZIG="python3 -m ziglang" ./macos/build.sh` cross-compiles
the same source with Zig (which ad-hoc signs the arm64 slice) and writes `dist/Books.app` + `dist/Books.app.zip`.

The shell is one C file talking to AppKit/WebKit through the Objective-C runtime (`dlopen`/`objc_msgSend`), so it
needs no SDK. It implements `WKUIDelegate` so `<input type=file>` opens a real `NSOpenPanel`, handles
`application:openFiles:` for Finder, and exchanges messages with the page through
`window.webkit.messageHandlers.books` (window drag/zoom from the HTML chrome, save panel for exports, files handed
over as base64, self-test results).
- **WebKit smoke test**: the same runner installs Playwright WebKit (the engine Books.app embeds) and drives the web app end to end — imports a Kindle sample from libmobi’s test suite, opens it, turns pages with the wheel, checks the timeline, vertical-scroll progress and dark theme (`tests/webkit-smoke.cjs`; run it locally with `PW_BROWSER=chromium`).


## Requirements and limitations

- A current browser: EPUB decompression uses `DecompressionStream('deflate-raw')` (Safari 16.4+, Chrome 103+,
  Firefox 113+). Constructable stylesheets and `color-mix()` are used for CSS. Books.app uses the system WebKit,
  so it needs the macOS version that ships Safari 16.4 or newer (macOS 13.3+) for EPUBs.
- PDFs use the browser’s native viewer, so their reading position and page count are not tracked like EPUBs; themes
  are applied as colour filters over the viewer.
- Kindle files must be DRM-free (files bought from the Kindle store are encrypted and are refused with a clear
  message). Old MOBI 7 books keep their HTML-3 formatting; KF8/AZW3 books keep their CSS, fonts and images.
- There are no audiobooks — Books only ever offered those through the store.
- Storage is per browser profile; clearing site data removes the library. *Storage & Data…* in the ••• menu shows
  usage and offers a Markdown export of highlights and notes.
