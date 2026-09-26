# Books: feature showcase

Screenshots of each part of Books, taken by the app itself on the CI's macOS 26 runner in a window of 1440 × 900
points. The library in them is a sample the app lays out for the purpose: the opening chapters of fourteen
public-domain classics, each with a cover drawn for it, and Francis Bacon's essays typeset as a PDF. There are four
collections (Classics, Science Fiction, Gothic & Horror, Summer Reading), books part read and finished, five months
of reading history, reading goals, and highlights, notes and a bookmark in *Pride and Prejudice*.

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
| [03-home-edit.png](03-home-edit.png) | Home being edited: remove badges on the widgets and the widget gallery along the bottom. |
| [04-all-books.png](04-all-books.png) | All books as a grid of covers, grouped by collection. |
| [05-collection-list.png](05-collection-list.png) | The Classics collection as a list, with its columns. |
| [06-shelf-by-genre.png](06-shelf-by-genre.png) | The Books shelf grouped by genre, read from the books' subjects. |
| [07-covers-monochrome.png](07-covers-monochrome.png) | Covers in monochrome: the artwork in shades of grey. |
| [08-covers-text-only.png](08-covers-text-only.png) | Text-only covers: plain covers with the title and author. |
| [09-get-info.png](09-get-info.png) | Get Info for a book, with the cover editor for placing the picture by hand. |
| [10-reading-goals.png](10-reading-goals.png) | The Reading Goals sheet: daily minutes, books a month and a year, pages and chapters. |
| [11-reader.png](11-reader.png) | *Pride and Prejudice* in two pages, with highlights in four colours. |
| [12-reader-appearance.png](12-reader-appearance.png) | The reader's Appearance popover: themes, font, text size, spacing and layout. |
| [13-reader-contents-dark.png](13-reader-contents-dark.png) | The Contents popover over the book in the dark Calm theme. |
| [14-reader-full-screen.png](14-reader-full-screen.png) | Full screen in the Paper theme, with the reader's floating bar. |
| [15-pdf-pages.png](15-pdf-pages.png) | The typeset PDF shown as whole pages, two at a time. |
| [16-pdf-zoom-and-split.png](16-pdf-zoom-and-split.png) | The same PDF in Zoom & Split: pages cropped to their text and cut into screens that turn like a book's. |
| [17-settings.png](17-settings.png) | The Settings window. |

A shot the app could not take is named in the CI log (lines starting `SHOWCASE:`), which also says how each picture
was captured; an earlier picture of the same name, if there is one, stays in place.
