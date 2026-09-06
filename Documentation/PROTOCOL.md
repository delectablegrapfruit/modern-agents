# Reader web core ↔ Swift protocol

The book is typeset by WebKit in a `WKWebView` that loads `reader.html` from the app bundle through the custom
scheme `books-reader://`. The page has **no chrome**: no toolbar, footer, popovers, panels or settings UI. It lays
out the book, keeps the reading position, renders highlights, searches, and reports everything to the native app,
which owns every control and all persistence.

URLs served by the app's `WKURLSchemeHandler`:

| URL | Content |
|---|---|
| `books-reader://app/reader.html`, `books-reader://app/<file>` | files of `Sources/Books/Resources/Reader` |
| `books-reader://book/<anything>.epub` | the EPUB file of the book being read (bytes; `fetch()` returns a Blob) |

In tests the same page is served over `http://127.0.0.1:<port>/…` with the book under `/book/…`; the core never
assumes a scheme.

## Messages from the page

`window.webkit.messageHandlers.reader.postMessage(object)` when available, else `window.__readerBridge(object)`
(tests install this). Every message carries `type`.

| type | fields | when |
|---|---|---|
| `ready` | — | scripts loaded, `window.reader` exists |
| `opened` | `title`, `spineCount`, `words`, `toc: [{label, href, level, pos, spine}]`, plus all `layout` fields | `reader.open()` finished |
| `layout` | `mode` (`paginated`/`scroll`), `total` (pages, or scroll length in px for `scroll`), `cols` (1/2), `chapters: [{label, pos, level}]` (`pos` = page index or scroll offset), `bookmarks: [{id, pos}]` | after every relayout/measure |
| `position` | `page` (0-based; scroll offset in scroll mode), `total`, `percent` (0–100), `chapter`, `chapterIndex`, `pagesLeftInChapter`, `locator: {spine, offset}`, `atEnd`, `bookmark: id|null` | after any navigation or scroll (throttled ~100 ms) |
| `end` | — | the reader tried to go past the last page |
| `selection` | `text`, `locator: {spine, start, end}`, `rect: {x, y, width, height}` in CSS px of the web view, `chapter` | after a non-empty selection is made (mouseup) |
| `selectionCleared` | — | the selection collapsed |
| `highlightTapped` | `id`, `rect` | click on an existing highlight |
| `highlightAdded` | `id`, `locator`, `text`, `chapter`, `color`, `note` | reply to `reader.addHighlight` |
| `link` | `href` | external link clicked (internal links are followed by the page) |
| `pointer` | `x`, `y` | pointer moved over the book (throttled ~80 ms) — the app decides chrome visibility |
| `activity` | — | any wheel/key/click (reading-time idle detection) |
| `searchResults` | `query`, `results: [{spine, offset, excerpt, chapter, pos}]`, `done` | during/after `reader.search` (batches) |
| `error` | `message` | anything failed |

## Calls into the page (`window.reader.*`)

| call | effect |
|---|---|
| `open({url, settings, locator, bookmarks, highlights})` | fetch and lay out the EPUB, restore `locator` (or start), apply `highlights: [{id, locator:{spine,start,end}, color, note}]`, `bookmarks: [{id, locator}]`; async, ends with `opened` |
| `applySettings(settings)` | see Settings below; relayouts keeping the position |
| `next()`, `prev()`, `nextChapter()`, `prevChapter()` | navigation |
| `goToPage(n)`, `goToFraction(f)`, `goToHref(href)`, `goToLocator({spine, offset})`, `goToPos(pos)` | navigation (`pos` = page index or scroll offset as reported in `layout.chapters`) |
| `addHighlight({id, color, note})` | wrap the current selection, then `highlightAdded` |
| `updateHighlight({id, color, note})`, `removeHighlight(id)` | change/remove |
| `setBookmarks([{id, locator}])` | timeline dots and `position.bookmark` |
| `search(query)` | start a search; `searchResults` messages follow; empty query cancels |
| `clearSelection()` | collapse selection |
| `state()` | returns a JSON string with the current `position`/`layout` fields (self-test) |
| `setFullscreen(bool)` | page may adjust margins; optional |

## Settings

```
{ theme: 'original'|'quiet'|'paper'|'bold'|'calm'|'focus',
  font: 'original'|'athelas'|'charter'|'georgia'|'iowan'|'palatino'|'sanfrancisco'|'seravek'|'times'|'newyork',
  fontSize: 100 (percent), lineHeight: 'tight'|'normal'|'relaxed'|'loose', textWidth: 'narrow'|'medium'|'wide'|'full',
  justify: bool, hyphenate: bool, layout: 'paginated'|'scroll', spread: 'auto'|'one'|'two', pageTurn: 'slide'|'none',
  wheelTurnsPages: bool, wheelSensitivity: 'low'|'medium'|'high', wheelInvert: bool, wheelHorizontal: bool }
```

Highlight colors: `yellow`, `green`, `blue`, `pink`, `purple`, `underline`.

Locators are `{spine, offset}` (character offset into the section's text) and ranges `{spine, start, end}`; they
survive font, size and window changes.

Wheel handling lives in the page (a notch of a mouse wheel or tilt is exactly one page; trackpad gestures one page
per swipe); keys handled in the page: arrows, space, page up/down, home/end. Everything with ⌘ is the app's.
