# Books: feature showcase

Screenshots of each part of Books, taken by the app itself on the CI's macOS 26 runner in a window of 1440 × 900
points, or as much of that as the screen has (the runner's screen is 1024 × 768). Before each picture the app makes
itself the active app and the window key, so the windows look as they do in use, and while the pictures are taken it
hides the Dock, so that the Dock lies over none of them; the Settings window is moved wholly onto the screen for each
of its tabs and taken from the app's own windows alone. The library in them is a sample the app lays out for the
purpose: the opening chapters of fourteen public-domain classics, each with a cover drawn for it, and Francis Bacon's
essays typeset as a small book in PDF, with a running head and a page number on every page after the first. There are
four collections (Classics, Science Fiction, Gothic & Horror, Summer Reading), books part read and finished, five
months of reading history, reading goals, and highlights, notes and a bookmark in *Pride and Prejudice*.

To take them again, push a commit whose message contains `[showcase]`, or run the CI workflow by hand
(Actions ▸ CI ▸ Run workflow). The pictures are committed here with the packages and are also attached to the run
in the Books.app artifact. On a Mac, after `scripts/make-app.sh release`:

```sh
BOOKS_SHOWCASE=1 BOOKS_SHOWCASE_DIR=docs/showcase build/Books.app/Contents/MacOS/Books
```

| Screenshot | What it shows |
| --- | --- |
| [01-home.png](01-home.png) | Home as it starts: Continue Reading, Reading Goals, Activity and Recently Added. |
| [02-home-dark.png](02-home-dark.png) | Home in Dark Mode with more widgets: Pick Up Again, Pages & Chapters, Reading Calendar, For You and Recently Finished. |
| [03-home-edit.png](03-home-edit.png) | Home being edited: remove badges on the widgets and the widget gallery along the bottom, with the one Done, in the gallery, as on the Mac desktop; the toolbar keeps none of its own. |
| [04-all-books.png](04-all-books.png) | All books as a grid of covers, grouped by collection. |
| [05-collection-list.png](05-collection-list.png) | The Classics collection as a list, with its columns. |
| [06-shelf-by-genre.png](06-shelf-by-genre.png) | All books grouped by genre, read from the books' subjects, the covers smaller so that whole groups show: Adventure and Classics first. |
| [07-covers-monochrome.png](07-covers-monochrome.png) | Covers in monochrome: the artwork in shades of grey. |
| [08-covers-text-only.png](08-covers-text-only.png) | Text-only covers on the same shelf: plain covers with the title and author. |
| [09-get-info.png](09-get-info.png) | Get Info for a book, with the cover editor for placing the picture by hand. |
| [10-reading-goals.png](10-reading-goals.png) | The Reading Goals sheet: daily minutes, books a month and a year, pages and chapters. |
| [11-reader.png](11-reader.png) | *Pride and Prejudice* in two pages, in the middle of its first chapter, with highlights in three colours. |
| [12-reader-appearance.png](12-reader-appearance.png) | The reader's Appearance popover: themes, font, text size, spacing and layout. |
| [13-reader-contents-dark.png](13-reader-contents-dark.png) | The Contents popover over the book in the dark Calm theme. |
| [14-reader-full-screen.png](14-reader-full-screen.png) | Full screen in the Paper theme, with the reader's floating bar. |
| [15-pdf-pages.png](15-pdf-pages.png) | The typeset PDF shown as whole pages, two at a time: its title page, and a page with its running head and page number. |
| [16-pdf-zoom-and-split.png](16-pdf-zoom-and-split.png) | The same PDF in Zoom & Split: each page cropped to its block of text, the running head with the rule under it and the page number at the foot cut away, and cut into screens that turn like a book's. |
| [17-settings.png](17-settings.png) | The Settings window's General tab: the three looks for covers, shown on the book last opened, and the sidebar's scrolling. |
| [18-reader-search.png](18-reader-search.png) | The reader's Search popover: every “Bingley” in *Pride and Prejudice*, grouped by chapter, the word set in bold. |
| [19-reader-highlight-menu.png](19-reader-highlight-menu.png) | The menu a click on a highlight opens: the colours with its own ringed, Underline and Remove, and for a highlight with a note Edit Note, Copy and Remove Note. |
| [20-reader-notes.png](20-reader-notes.png) | The Contents popover's Notes tab: each highlight in its colour, with its note and its chapter. |
| [21-pdf-text.png](21-pdf-text.png) | The PDF read as Text: its title page as an opening section of its own, then the essays, each a chapter, their words reflowed into the reader's own pages and type; letter-spaced lines such as FRANCIS BACON read as words, and the running heads and page numbers left out. |
| [22-settings-library.png](22-settings-library.png) | Settings ▸ Library: where the library lives, collections from subfolders, a library folder to keep in sync, and the genre table. |
| [23-settings-reading.png](23-settings-reading.png) | Settings ▸ Reading: what books open with: theme, font, text size, spacing, width, layout and page turns. |
| [24-home-large-widgets.png](24-home-large-widgets.png) | Home with the Reading Calendar and Statistics at their large size: the month day by day, the library and the reading in numbers, and the last 30 days, over the goals and the activity. |

A shot the app could not take is named in the CI log (lines starting `SHOWCASE:`), which also says how each picture
was captured; an earlier picture of the same name, if there is one, stays in place.
