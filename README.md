# Books

An offline reader for the Mac, made the way Apple makes its own apps: a native AppKit/SwiftUI application with the
system's sidebar, toolbar, menus, popovers and sheets — Liquid Glass on macOS 26 — that keeps every book on this
Mac and never talks to a store or a server.

[![CI](https://github.com/delectablegrapfruit/modern-agents/actions/workflows/ci.yml/badge.svg?branch=book-reader)](https://github.com/delectablegrapfruit/modern-agents/actions/workflows/ci.yml)

## What it does

**Library.** Home shows what you were reading, your reading goals and the library in numbers; the sidebar has a Library
section (All, Finished, Books, PDFs) and a My Collections section, each in the order you drag its rows into — any row
but All can be hidden from its context menu and brought back from its section's menu. Drag books onto Finished or a collection. Grid or
list, sort by recent, title or author, search by title, author and subject. Get Info edits title and author. Files come in through File ▸ Add to
Library (⌘O), by dropping them on the window, or by opening them from the Finder: **EPUB**, **Kindle** (MOBI, AZW,
AZW3; DRM-free — converted to EPUB once, at import), **PDF**, **comics** (CBZ, CBR, CB7, CBT — the page images
become a PDF once, at import; RAR and 7-Zip archives are unpacked by the system's `tar`, or by `unrar` or 7-Zip when
installed), and **plain text or Markdown** (typeset into a book with chapters and a generated cover).

**Reading.** The book takes over the window: paginated with one or two pages, or vertical scrolling. Six themes
(Original, Quiet, Paper, Bold, Calm, Focus) with Auto-Night following the system, ten fonts, text size, line spacing,
text width, justification and hyphenation. A footer shows the chapter, the page numbers and how many pages are left
in the chapter; bringing the pointer to the bottom shows the timeline — chapter ticks, bookmark dots, the page under
the pointer — which you can scrub. Highlights in five colours or underline, notes, bookmarks (⌘D), a Contents ·
Bookmarks · Notes popover, search within the book, an end-of-book card, and your place kept to the character. Look Up
shows the system's definition popover, and the text's context menu is the system's (Look Up, Copy, Translate,
Search). PDFs read like books, four ways. **Pages**: whole pages on the theme colour with no frame or shadow, one or two to a
screen, turned the same way. **Zoom & Split**: the ink of every page — running headers, footers and page numbers cut away, two text columns
read in order — runs on as one column at the text size and is dealt out to screens block by block, a block being
the ink between two blank bands that cross the page (found in a small rendering of every page, so figures, tables
and scans count as well as text). Nothing is cut through: a block that does not fit moves whole to the next
screen, a picture taller than a screen is fitted to one, and a picture-only page such as a cover stands alone.
Text size is the page's own scale, 50–400%. Past the width of a column, each line is cut into its words at the
blank gaps between them and the words are laid out again in shorter lines that fit — the page's own type,
rewrapped, with its word spacing, line gaps and paragraph indents — so dense small print can be read large with
two pages still side by side. Screens turn with the book's slide;
selection, search, highlights, bookmarks and the PDF's links work as in books. The analysis is kept beside the
PDF, so a book is prepared once. While reading, the pointer hides after a couple of seconds still over the page
and returns the moment it moves. **Text**: the text is reflowed into a book the way converters like calibre do it (running
headers dropped, lines joined into paragraphs, larger type as headings) and read with every book setting; the layout
is not kept, so tables and figures suffer. **Comics**: one panel a screen, fitted and centred, in the page's own
colours, turned like pages. The panels are found from the gutters in a small rendering of each page: whatever the
gutter colour reaches from the page's edge without crossing ink is gutter; the rest is cut along the blank bands that
cross it, rows then columns then rows again, and what no straight band separates is split into the dense closed
shapes a slanted or curved gutter divides — so panels of any shape are found, each shown in its own outline. A
balloon or figure that spills across a gutter goes whole to the panel it comes from (the one it reaches farther
into) and is cut out of the neighbour, so overlapping panels are shown apart. Captions and lettering beside a frame
stay with it; page numbers are left out; a page without gutters is one panel. Panels within a row read left to
right, or right to left for manga (Appearance ▸ Reading). Comics added as archives open this way by default; any
PDF can be read this way, and so can any other book (Appearance ▸ Read as ▸ Comics): its page images, in reading
order, become a PDF once beside the book, with the book's contents as its outline — so an EPUB or Kindle comic reads
panel by panel too (only the images are shown, not text laid over them). How a book is viewed is kept with the book:
the layout (Pages, Zoom & Split, Text, Comics; paginated or scrolling), one or two pages, the text size of Zoom &
Split and the reading direction of Comics are the book's own choices, and the reader settings stand for books that
have not made one. Themes are colour filters (paper tints in the light themes; in the dark
ones luminance is inverted with hues kept, so pictures and highlights keep their colours). Contents and timeline
marks come from the outline; search, bookmarks and highlights with notes work in every mode. In full screen the toolbar leaves with the menu bar and both come back when the pointer reaches the top
edge. The reading position, statistics (minutes per day, streaks, books per year) and every annotation are files in
`~/Library/Application Support/Books`.

**Wheel and keys.** A notch of a mouse wheel — or a tilt of the wheel, or ⇧ + wheel — is exactly one page in
paginated mode, handled by the app before WebKit sees it; a two-finger swipe is one page, its inertial tail ignored.
Arrow keys, space, Page Up/Down, Home and End move too; ⌘] and ⌘[ jump chapters, ⌘+ and ⌘− change the text size (zoom,
for PDFs). In vertical scrolling a notch scrolls the text by the system's line distance.

## Install

A prebuilt app is committed in [`dist/`](dist/) — [`Books.app.zip`](dist/Books.app.zip) and
[`Books.dmg`](dist/Books.dmg), with [checksums](dist/SHA256SUMS.txt) — rebuilt by CI on every push. Unzip (or open
the disk image), drag Books to Applications, open it. It is ad-hoc signed, so macOS blocks the first launch of a
downloaded copy: right-click ▸ Open, or System Settings ▸ Privacy & Security ▸ Open Anyway, or
`xattr -dr com.apple.quarantine /Applications/Books.app`. Requires macOS 14; Liquid Glass appears on macOS 26.

## Build

Requires macOS 14 or later and Xcode 26 (the app is linked against the macOS 26 SDK; older Xcodes build it with the
classic appearance).

```sh
make app     # builds build/Books.app
make test    # core tests (also run on Linux)

# CI builds on GitHub's macOS 26 runners, which bill at ten times the Linux rate. To build on your own Mac instead,
# add it as a self-hosted runner (Settings ▸ Actions ▸ Runners) and set the repository variable
# BOOKS_MACOS_RUNNER to its label, e.g. self-hosted.
make cli     # command-line tool, books-cli
```

```
books-cli info <file>                 metadata, spine and table of contents of an EPUB, Kindle or text file
books-cli convert <file> <out.epub>   convert a Kindle (MOBI/AZW3) or text file to EPUB
books-cli text <file>                 print the plain text of a book
books-cli library [list|stats]        the app's library
books-cli add <file…>                 add files to the app's library
```

The command line ships inside the app at `Books.app/Contents/MacOS/books-cli`.

## Layout

| Path | Purpose |
|------|---------|
| `Sources/BooksCore` | Formats and the library, Foundation only: RFC 1951 inflate, ZIP, EPUB 2/3 (package, spine, table of contents, cover), EPUB writer, plain text → chapters, Kindle MOBI/KF8 → EPUB, the catalog (books, collections, annotations, positions, statistics, settings) and the import pipeline. Builds and is tested on Linux. |
| `Sources/Books` | The app: SwiftUI window with the system sidebar and toolbar, Home, shelves, Get Info, Settings, menus; the reader (toolbar, timeline, Contents/Appearance/Search popovers, highlight menu, notes, end card, PDF view) around one `WKWebView`. |
| `Sources/Books/Resources/Reader` | The typesetting page the web view loads (`reader.html`, `reader-core.js`, `epub.js`, `zip.js`): CSS multi-column pagination, locators, highlights, search, wheel handling. No chrome; `Documentation/PROTOCOL.md` lists the messages exchanged with the app, `scripts/reader-core-harness.cjs` exercises it in a browser. |
| `Sources/BooksCLI` | `books-cli`. |
| `Tests/BooksCoreTests` | Core tests; the Kindle tests run against libmobi's sample files when present (`BOOKS_FIXTURES` or `Tests/Fixtures/mobi`). |
| `Packaging/Info.plist`, `scripts/` | Bundle assembly (`make-app.sh`), icon rendering, ad-hoc signing. |
| `.github/workflows/ci.yml` | macOS 26 runner: build, tests, bundle, launch self-test of the packaged zip, unzipped elsewhere with the build directory hidden (imports a generated book, turns pages with real scroll-wheel notches through WebKit, searches, scrubs, saves the position), zip + dmg, commit to `dist/`. Linux runner: core build and tests, Kindle fixtures converted with the command line. |

## How reading works

Apple Books typesets EPUB with WebKit, and so does this app: one `WKWebView`, loading a page from the bundle over a
custom `books-reader://` scheme, lays the book out as CSS multi-column pages (or one long column for scrolling) and
reports positions, selections and search hits to the app. Everything you see around the text — sidebar, toolbar,
popovers, the timeline, the highlight menu, sheets — is AppKit/SwiftUI, which is what makes the chrome real Liquid
Glass on macOS 26 rather than an imitation: `NSGlassEffectView`-backed materials sample what lies behind the window,
something a web view cannot do. Positions are `{spine, character offset}` locators, so highlights, bookmarks and the
reading position survive font, size and window changes. Book content is sanitized before it is written into the page
(no scripts, handlers or `javascript:` URLs).

## Limitations

- Kindle files must be DRM-free; files bought from the Kindle store are encrypted and are refused with a clear
  message. Old MOBI 7 books keep their HTML-3 formatting; KF8/AZW3 books keep CSS, fonts and images.
- PDFs are shown by PDFKit. Themes are colour filters, so pictures in the dark themes are darkened rather than shown
  as the author lit them; fonts, text size, spacing and width are fixed by the file.
- No audiobooks, no store, no sync — everything stays in `~/Library/Application Support/Books`.

MIT licensed.
