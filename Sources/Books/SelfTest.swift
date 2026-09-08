import AppKit
import CoreGraphics
import SwiftUI
import BooksCore

/// `BOOKS_SELFTEST=1 Books.app/Contents/MacOS/Books`: builds a book, adds it to a scratch library, opens it, turns
/// pages by call and with real scroll-wheel notches delivered to the web view, searches, scrubs, and exits 0 on
/// success. Used by CI on every push; prints one line per step.
enum SelfTest {
    @MainActor static var currentSession: ReaderSession?

    @MainActor
    static func start(model: LibraryModel) {
        log("starting Books")
        Task { @MainActor in
            do {
                try await run(model: model)
            } catch {
                fail("\(error)")
            }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 120) { fail("timed out") }
    }

    private static func log(_ message: String) {
        print("SELFTEST: " + message)
        fflush(stdout)
    }

    private static func fail(_ message: String) -> Never {
        FileHandle.standardError.write(Data(("SELFTEST FAIL: " + message + "\n").utf8))
        exit(1)
    }

    struct Failure: Error, CustomStringConvertible {
        let description: String
        init(_ d: String) { description = d }
    }

    @MainActor
    private static func run(model: LibraryModel) async throws {
        try await Task.sleep(nanoseconds: 1_500_000_000)
        guard NSApp.windows.contains(where: { $0.isVisible }) else { throw Failure("no window appeared") }
        log("window shown, library has \(model.books.count) books")

        // A six-chapter book long enough to paginate into dozens of pages.
        let paragraph = "<p>" + String(repeating: "The quick brown fox jumps over the lazy dog while the five boxing wizards jump quickly. ", count: 90) + "</p>"
        let chapters = (1...6).map { EPUBChapter(label: "Chapter \($0)", title: "Self-test chapter \($0)", html: String(repeating: paragraph, count: 3)) }
        let spec = EPUBSpec(title: "Books Self-Test", author: "Continuous Integration", chapters: chapters, coverSVG: CoverArt.svg(title: "Books Self-Test", author: "CI"))
        let file = FileManager.default.temporaryDirectory.appendingPathComponent("Books Self-Test \(UUID().uuidString).epub")
        try EPUBWriter.build(spec).write(to: file)

        let added: [Book] = await withCheckedContinuation { continuation in
            model.importFiles([file], quiet: true, allowDuplicates: true) { continuation.resume(returning: $0) }
        }
        guard let book = added.first else { throw Failure("the generated book could not be imported") }
        log("imported \(book.title): \(book.words) words, cover \(book.coverFile ?? "none")")
        defer { model.delete([book.id]) }

        model.open(book)
        let session = try await waitFor("the reader to lay the book out", timeout: 40) {
            if let s = currentSession, s.isOpen, s.layout.total > 3, s.position.locator != nil { return s }
            return nil
        }
        let layout = session.layout
        log("laid out: \(Int(layout.total)) pages, \(layout.columns) column(s), \(layout.chapters.count) chapters, page \(Int(session.position.page) + 1)")
        guard layout.mode == .paginated else { throw Failure("expected paginated layout") }

        let before = session.position.page
        session.next()
        try await sleep(0.7)
        guard session.position.page > before, !session.position.atEnd else { throw Failure("next() did not turn the page (\(before) → \(session.position.page))") }
        log("next(): page \(Int(before) + 1) → \(Int(session.position.page) + 1)")

        // Real wheel notches, as a mouse produces them, into the web view.
        var wheelReport: [String] = []
        for (name, dy, dx, shift, expectForward) in [("down", -1, 0, false, true), ("tilt", 0, -1, false, true), ("shift+down", -1, 0, true, true), ("up", 1, 0, false, false)] as [(String, Int32, Int32, Bool, Bool)] {
            let start = session.position.page
            try postWheel(dy: dy, dx: dx, shift: shift, to: session.webView)
            try await sleep(0.7)
            let moved = session.position.page - start
            wheelReport.append("\(name) \(moved > 0 ? "+" : "")\(Int(moved))")
            guard expectForward ? moved > 0 : moved < 0 else { throw Failure("wheel \(name) moved \(moved) pages; report so far: \(wheelReport.joined(separator: ", "))") }
        }
        log("wheel notches (pages moved): " + wheelReport.joined(separator: ", "))

        session.goToFraction(0.5)
        try await sleep(0.6)
        guard abs(session.position.percent - 50) < 12 else { throw Failure("goToFraction(0.5) landed at \(session.position.percent)%") }
        log("scrubbed to \(Int(session.position.percent))%")

        session.search("boxing wizards")
        let hits = try await waitFor("search results", timeout: 10) { session.searchDone && !session.searchResults.isEmpty ? session.searchResults.count : nil }
        log("search found \(hits) matches")

        session.toggleBookmark()
        try await sleep(0.3)
        guard session.isBookmarked, session.bookmarks.count == 1 else { throw Failure("bookmark was not added") }
        log("bookmark added; timeline shows \(session.layout.bookmarks.count)")

        var settings = model.settings
        settings.reader.theme = .focus
        settings.reader.autoNight = false
        model.settings = settings
        session.applySettings()
        try await sleep(0.5)
        guard session.effectiveTheme == .focus else { throw Failure("theme did not switch") }

        // The scrolling layout: a wheel notch scrolls the text.
        settings = model.settings
        settings.reader.layout = .scroll
        model.settings = settings
        session.applySettings()
        _ = try await waitFor("the scrolling layout", timeout: 10) { session.layout.mode == .scroll ? true : nil }
        try await sleep(0.4)
        let y0 = session.position.page
        try postWheel(dy: -1, dx: 0, shift: false, to: session.webView)
        try await sleep(0.7)
        guard session.position.page > y0 else { throw Failure("a wheel notch did not scroll the text in the scrolling layout (\(y0) → \(session.position.page))") }
        log("scrolling layout: a notch scrolled \(Int(session.position.page - y0)) px")
        settings = model.settings
        settings.reader.layout = .paginated
        model.settings = settings
        session.applySettings()
        try await sleep(0.5)

        session.close()
        try await sleep(0.4)
        guard model.reading == nil else { throw Failure("reader did not close") }
        let saved = model.book(book.id)?.position
        guard let saved, saved.percent > 0 else { throw Failure("position was not saved") }
        log("book closed, position saved at \(Int(saved.percent))%")

        try await runWrappedBook(model: model)
        try await runPDF(model: model)
        try await runShelf(model: model)
        try await runFolders(model: model)
        print("SELFTEST OK: \(Int(layout.total)) pages, \(layout.columns) column(s), wheel \(wheelReport.joined(separator: " · ")), position saved at \(Int(saved.percent))%; PDF checked; macOS \(ProcessInfo.processInfo.operatingSystemVersionString)")
        fflush(stdout)
        exit(0)
    }

    /// A book whose chapters sit inside wrappers that cannot fragment (a scroll container around an atomic inline
    /// around an absolutely positioned box) must still paginate; such books used to measure one page and finish at
    /// once.
    @MainActor
    private static func runWrappedBook(model: LibraryModel) async throws {
        let paragraph = "<p>" + String(repeating: "Wrapped text keeps flowing from column to column. ", count: 60) + "</p>"
        let chapters = (1...3).map { i in
            EPUBChapter(label: "Part \(i)", title: "Wrapped part \(i)",
                        html: "<div style=\"overflow:hidden;height:100%\"><span style=\"display:inline-block\"><div style=\"position:absolute;top:0\">" + String(repeating: paragraph, count: 4) + "</div></span></div>")
        }
        let spec = EPUBSpec(title: "Books Wrapped Self-Test", author: "Continuous Integration", chapters: chapters)
        let file = FileManager.default.temporaryDirectory.appendingPathComponent("Books Wrapped \(UUID().uuidString).epub")
        try EPUBWriter.build(spec).write(to: file)
        let added: [Book] = await withCheckedContinuation { continuation in
            model.importFiles([file], quiet: true, allowDuplicates: true) { continuation.resume(returning: $0) }
        }
        guard let book = added.first else { throw Failure("the wrapped book could not be imported") }
        defer { model.delete([book.id]) }
        model.open(book)
        let session = try await waitFor("the wrapped book to lay out", timeout: 30) {
            if let s = currentSession, s.book.id == book.id, s.isOpen, s.position.locator != nil { return s }
            return nil
        }
        try await sleep(0.8)
        guard session.layout.total > 6 else { throw Failure("the wrapped book measured \(Int(session.layout.total)) page(s); its wrappers were not unwrapped") }
        log("wrapped book: \(Int(session.layout.total)) pages despite scroll-container, inline-block and absolute wrappers")
        session.close()
        try await sleep(0.4)
    }

    /// A generated eight-page PDF goes through the same motions: open, turn, wheel notch, scrub, search, bookmark,
    /// theme, layout, close.
    @MainActor
    private static func runPDF(model: LibraryModel) async throws {
        let file = FileManager.default.temporaryDirectory.appendingPathComponent("Books Self-Test \(UUID().uuidString).pdf")
        try makePDF(pages: 8).write(to: file)
        let added: [Book] = await withCheckedContinuation { continuation in
            model.importFiles([file], quiet: true, allowDuplicates: true) { continuation.resume(returning: $0) }
        }
        guard let book = added.first else { throw Failure("the generated PDF could not be imported") }
        log("imported \(book.title): \(book.pageCount ?? 0) pages, cover \(book.coverFile ?? "none")")
        defer { model.delete([book.id]) }

        model.open(book)
        let session = try await waitFor("the PDF to open", timeout: 20) {
            if let s = currentSession, s.book.id == book.id, s.isOpen, s.layout.total == 8 { return s }
            return nil
        }
        log("PDF open: \(Int(session.layout.total)) pages, \(session.layout.columns) column(s), page \(Int(session.position.page) + 1)")
        session.next()
        try await sleep(0.5)
        guard session.position.page >= 1 else { throw Failure("PDF next() did not turn the page") }
        guard let pdfView = session.pdf?.hostView else { throw Failure("no PDF view") }
        let before = session.position.page
        try postWheel(dy: -1, dx: 0, shift: false, to: pdfView)
        try await sleep(0.5)
        guard session.position.page > before else { throw Failure("a wheel notch did not turn the PDF page (\(before) → \(session.position.page))") }
        session.goToFraction(1)
        try await sleep(0.5)
        guard session.position.page >= 6 else { throw Failure("PDF goToFraction(1) landed on page \(Int(session.position.page) + 1)") }
        session.search("lazy dog")
        let hits = try await waitFor("PDF search results", timeout: 10) { session.searchDone && !session.searchResults.isEmpty ? session.searchResults.count : nil }
        guard hits == 8 else { throw Failure("PDF search found \(hits) matches, expected 8") }
        session.toggleBookmark()
        try await sleep(0.3)
        guard session.isBookmarked, session.layout.bookmarks.count == 1 else { throw Failure("PDF bookmark was not added") }
        var settings = model.settings
        settings.reader.theme = .paper
        settings.reader.autoNight = false
        model.settings = settings
        session.applySettings()
        try await sleep(0.4)
        settings = model.settings
        settings.reader.spread = .one
        model.settings = settings
        session.applySettings()
        try await sleep(0.5)
        guard session.layout.mode == .paginated, session.layout.columns == 1 else { throw Failure("PDF did not switch to one page (\(session.layout.mode), \(session.layout.columns) columns)") }
        settings = model.settings
        settings.reader.spread = .two
        model.settings = settings
        session.applySettings()
        log("PDF: next, wheel notch, scrub to the end, \(hits) matches, bookmark, paper theme, one page then two")

        // Zoom & Split: pages cropped to their text and cut into screens shown two at a time; one at a time enlarges
        // the text (more screens), a smaller text size reduces them; turns, search and bookmarks work as in a book.
        session.setPDFLayout(.fit)
        let fitSession = try await waitFor("the PDF in Zoom & Split", timeout: 30) {
            if let s = currentSession, s !== session, s.book.id == book.id, s.isOpen, s.usesPDFView { return s }
            return nil
        }
        try await sleep(0.8)
        // 100% is the page's own size: the test PDF's letter pages fit two abreast, one to a screen.
        let screensAt100 = fitSession.layout.total
        guard screensAt100 >= 8, fitSession.layout.columns == 2 else { throw Failure("Zoom & Split made \(Int(screensAt100)) screens of 8 pages in \(fitSession.layout.columns) column(s); expected two columns") }
        guard let split = fitSession.pdf as? SplitPDFPresenter else { throw Failure("Zoom & Split is not using the split presenter") }
        try checkFlow(split, expectCuts: false)
        // Larger text keeps two pages side by side: lines wider than a column are rewrapped into shorter ones.
        for _ in 0..<5 { fitSession.changeFontSize(by: 10) }
        try await sleep(0.8)
        let screensTwoUpLarge = fitSession.layout.total
        guard fitSession.reader.pdfZoom == 150, screensTwoUpLarge > screensAt100, fitSession.layout.columns == 2, split.rewrapped else {
            throw Failure("150% did not rewrap into two pages (\(fitSession.reader.pdfZoom)%, \(screensAt100) → \(screensTwoUpLarge) screens, \(fitSession.layout.columns) column(s), rewrapped \(split.rewrapped))")
        }
        // The text size is this book's: kept with it, not in the reader settings.
        guard model.settings.reader.pdfZoom == 100, model.book(book.id)?.view?.pdfZoom == 150, model.book(book.id)?.view?.pdfLayout == .fit else {
            throw Failure("the view was not kept with the book (settings \(model.settings.reader.pdfZoom)%, book \(String(describing: model.book(book.id)?.view)))")
        }
        // Every fifth line of the test pages begins an indented paragraph; rewrapped, those paragraphs still begin indented.
        guard split.indentedLineStarts >= 20 else { throw Failure("rewrapped at 150%, only \(split.indentedLineStarts) lines begin with an indent; the paragraphs' indents were lost") }
        try checkFlow(split, expectCuts: true)
        // One page: the same size shows fewer, wider screens.
        var fitSettings = model.settings
        fitSettings.reader.spread = .one
        model.settings = fitSettings
        fitSession.applySettings()
        try await sleep(0.8)
        let screensOneUpLarge = fitSession.layout.total
        guard fitSession.layout.columns == 1, screensOneUpLarge > screensAt100, screensOneUpLarge < screensTwoUpLarge else {
            throw Failure("one page at 150% did not lay out as expected (\(screensOneUpLarge) screens vs \(screensTwoUpLarge) two-up, \(fitSession.layout.columns) column(s))")
        }
        try checkFlow(split, expectCuts: true)
        // Smaller text: pages run on into one another, fewer screens.
        for _ in 0..<10 { fitSession.changeFontSize(by: -10) }
        try await sleep(0.8)
        guard fitSession.reader.pdfZoom == 50, fitSession.layout.total < screensAt100 else {
            throw Failure("50% did not reduce the screens (\(fitSession.reader.pdfZoom)%, \(fitSession.layout.total) screens)")
        }
        try checkFlow(split, expectCuts: false)
        fitSettings = model.settings
        fitSettings.reader.spread = .two
        model.settings = fitSettings
        fitSession.setView { $0.pdfZoom = 100 }
        fitSession.applySettings()
        try await sleep(0.6)
        fitSession.goToFraction(0)   // the pages-mode part of the test ended on the last page, with a bookmark there
        try await sleep(0.4)
        let unitBefore = fitSession.position.page
        guard unitBefore == 0 else { throw Failure("Zoom & Split did not return to the start (unit \(Int(unitBefore)))") }
        fitSession.next()
        try await sleep(0.5)
        guard fitSession.position.page > unitBefore else { throw Failure("Zoom & Split next() did not move (\(unitBefore) → \(fitSession.position.page))") }
        let fitView = try XCTUnwrapView(fitSession.pdf?.hostView)
        try postWheel(dy: -1, dx: 0, shift: false, to: fitView)
        try await sleep(0.5)
        guard fitSession.position.page > unitBefore + 1 else { throw Failure("a wheel notch did not turn a screen") }
        fitSession.search("lazy dog")
        let fitHits = try await waitFor("Zoom & Split search results", timeout: 10) { fitSession.searchDone && !fitSession.searchResults.isEmpty ? fitSession.searchResults.count : nil }
        guard fitHits == 8 else { throw Failure("Zoom & Split search found \(fitHits) matches, expected 8") }
        fitSession.toggleBookmark()
        try await sleep(0.3)
        guard fitSession.isBookmarked else { throw Failure("Zoom & Split bookmark was not added") }
        log("Zoom & Split: \(Int(screensAt100)) screens at 100%, \(Int(screensTwoUpLarge)) at 150% two-up rewrapped, \(Int(screensOneUpLarge)) one-up; blocks never cut, no repeats; turns, \(fitHits) matches, bookmark; footer “\(fitSession.pdfPageLabel ?? "")”")

        // Text: the PDF reflowed into a book, read by the page script like any other.
        fitSession.setPDFLayout(.text)
        let textSession = try await waitFor("the reflowed PDF to open", timeout: 60) {
            if let s = currentSession, s !== fitSession, s.book.id == book.id, s.isOpen, !s.usesPDFView, s.layout.total > 0 { return s }
            return nil
        }
        textSession.search("lazy dog")
        let textHits = try await waitFor("search in the reflowed text", timeout: 15) { textSession.searchDone && !textSession.searchResults.isEmpty ? textSession.searchResults.count : nil }
        guard textHits == 8 else { throw Failure("the reflowed text has \(textHits) matches, expected 8") }
        log("Text: reflowed into \(textSession.toc.count) chapters and \(Int(textSession.layout.total)) pages, \(textHits) matches")
        var reset = model.settings
        reset.reader.pdfLayout = .pages
        reset.reader.pdfZoom = 100
        model.settings = reset
        textSession.close()
        try await sleep(0.4)
        let savedPercent = model.book(book.id)?.position?.percent ?? 0
        guard model.reading == nil, savedPercent > 0 else { throw Failure("PDF position was not saved (\(savedPercent)%)") }
    }

    /// Folders: a library folder scanned and synced — its files come in from every depth, its subfolders name
    /// collections (an existing one of the same name in another case is used), a second scan adds nothing, a file
    /// moved to another subfolder moves collection — and a folder added by hand with collections from its
    /// subfolders.
    @MainActor
    private static func runFolders(model: LibraryModel) async throws {
        try await runFoldersBody(model: model)
    }

    /// Shelves and covers: reading time and pages are counted on the book and the shelf sorts by them, by length
    /// and in either direction; All Books groups by collection; a picture of one's own becomes a cover, is laid
    /// out fitted and filling, keeps its style and gives way to the original again; the grid scale is clamped.
    @MainActor
    private static func runShelf(model: LibraryModel) async throws {
        func epub(_ title: String, paragraphs: Int, subjects: [String]) throws -> URL {
            let chapter = EPUBChapter(label: "One", title: "One", html: String(repeating: "<p>\(title): " + String(repeating: "words and more words. ", count: 40) + "</p>", count: paragraphs))
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("Books Self-Test \(title) \(UUID().uuidString).epub")
            try EPUBWriter.build(EPUBSpec(title: title, author: "Shelf Test", subjects: subjects, chapters: [chapter], coverSVG: CoverArt.svg(title: title, author: "Shelf Test"))).write(to: url)
            return url
        }
        let longURL = try epub("Shelf Long", paragraphs: 30, subjects: ["Science Fiction"]), shortURL = try epub("Shelf Short", paragraphs: 2, subjects: ["FICTION / Mystery & Detective / Traditional"])
        let added: [Book] = await withCheckedContinuation { continuation in
            model.importFiles([longURL, shortURL], quiet: true, allowDuplicates: true) { continuation.resume(returning: $0) }
        }
        guard let long = added.first(where: { $0.title == "Shelf Long" }), let short = added.first(where: { $0.title == "Shelf Short" }) else { throw Failure("the shelf books could not be imported (\(added.count) added)") }
        let saved = model.settings
        defer {
            model.delete(added.map(\.id))
            var s = model.settings
            s.sort = saved.sort
            s.sortAscending = saved.sortAscending
            s.shelfGrouping = saved.shelfGrouping
            s.gridScale = saved.gridScale
            s.libraryView = saved.libraryView
            s.shelves = saved.shelves
            s.home = saved.home
            model.settings = s
            model.sidebarSelection = .home
            try? FileManager.default.removeItem(at: longURL)
            try? FileManager.default.removeItem(at: shortURL)
        }

        // Reading counts land on the book and in the day.
        let chaptersBefore = model.stats.totals(in: .week).chapters
        model.recordReading(seconds: 120, pages: 3, chapters: 1, in: short.id)
        model.recordReading(seconds: 30, in: short.id)
        guard model.book(short.id)?.secondsRead == 150, model.book(short.id)?.pagesRead == 3, model.book(short.id)?.chaptersRead == 1 else {
            throw Failure("reading counts were not kept on the book: \(model.book(short.id)?.secondsRead ?? -1) s, \(model.book(short.id)?.pagesRead ?? -1) pages, \(model.book(short.id)?.chaptersRead ?? -1) chapters")
        }
        guard model.stats.totals(in: .week).chapters == chaptersBefore + 1, model.stats.totals(in: .year).pages >= 3 else { throw Failure("the week's chapters or the year's pages did not grow") }

        // Sorts, chosen for the All shelf and judged between the two books: the read one first by time and pages
        // read, after by the same sorts ascending; the long one first by length. Another shelf keeps its own sort.
        func index(_ id: UUID) -> Int { model.books(for: .all).firstIndex { $0.id == id } ?? Int.max }
        model.setShelfSort(.timeRead, for: .all)
        guard !model.shelfSortAscending(for: .all), index(short.id) < index(long.id) else { throw Failure("Time Read did not put the read book first") }
        model.setShelfSortAscending(true, for: .all)
        guard index(short.id) > index(long.id) else { throw Failure("ascending Time Read did not put the read book after the unread") }
        model.setShelfSort(.pagesRead, for: .all)
        guard !model.shelfSortAscending(for: .all), index(short.id) < index(long.id) else { throw Failure("Pages Read did not put the read book first, or kept the direction") }
        model.setShelfSort(.length, for: .all)
        guard index(long.id) < index(short.id) else { throw Failure("Length did not put the longer book first") }
        model.setShelfSort(.title, for: .all)
        guard model.shelfSortAscending(for: .all), index(long.id) < index(short.id) else { throw Failure("Title did not sort A to Z") }
        guard model.shelfSort(for: .books) == saved.sort, model.shelfView(for: .books) == saved.libraryView else { throw Failure("the Books shelf took the All shelf's choices") }
        model.setShelfView(.list, for: .books)
        guard model.shelfView(for: .books) == .list, model.shelfView(for: .all) == saved.libraryView else { throw Failure("a shelf's view was not its own") }
        log("sorts: time read, pages read, length and title order the shelf, in both directions; each shelf keeps its own view and sort")

        // Genres from subjects, and the details a book came with.
        guard model.book(long.id)?.genres == ["Science Fiction"], model.book(short.id)?.genres == ["Mystery & Crime"] else {
            throw Failure("genres were not read off the subjects: \(model.book(long.id)?.genres ?? []), \(model.book(short.id)?.genres ?? [])")
        }
        var renamed = model.book(long.id)!
        renamed.title = "Renamed"
        renamed.author = "Somebody"
        model.update(renamed)
        let original = model.originalDetails(for: model.book(long.id)!)
        guard original.title == "Shelf Long", original.author == "Shelf Test" else { throw Failure("the original details were not found: \(original)") }
        renamed.title = original.title
        renamed.author = original.author
        model.update(renamed)
        log("genres: Science Fiction and Mystery & Crime from the subjects; original title and author found again")

        // A Genres.csv beside the library names a genre the subjects did not; its line comes first.
        let tableURL = model.store.directory.appendingPathComponent("Genres.csv")
        let hadTable = FileManager.default.fileExists(atPath: tableURL.path)
        let earlier = hadTable ? try? Data(contentsOf: tableURL) : nil
        defer {
            if let earlier { try? earlier.write(to: tableURL) } else { try? FileManager.default.removeItem(at: tableURL) }
            model.reloadGenreDatabase()
        }
        try "Shelf Long|Shelf Test,Classics; Adventure stories\n".write(to: tableURL, atomically: true, encoding: .utf8)
        model.reloadGenreDatabase()
        guard !model.genreDatabase.isEmpty, let longNow = model.book(long.id), model.genres(of: longNow) == ["Classics", "Adventure", "Science Fiction"] else {
            throw Failure("the genre table was not read: \(model.book(long.id).map { model.genres(of: $0) } ?? [])")
        }
        log("genre table: Classics and Adventure from Genres.csv, then the book's own Science Fiction")

        // The shelves grouped: a collection holding one of the two, the other among the rest; Books (EPUBs) groups the
        // same way; a collection's own shelf never groups by collection; grouping by genre works on any shelf; a
        // shelf can choose not to group.
        model.setShelfGrouping(.collection, for: .all)
        model.addCollection(named: "Shelf Test Collection")
        guard let collection = model.collections.first(where: { $0.name == "Shelf Test Collection" }) else { throw Failure("the shelf collection was not made") }
        defer { model.deleteCollection(collection.id) }
        model.add([short.id], to: collection.id)
        guard let groups = model.groupedShelf(.all, books: model.books(for: .all)),
              let mine = groups.first(where: { $0.name == "Shelf Test Collection" }), mine.books.map(\.id) == [short.id],
              let rest = groups.first(where: { $0.name == "Not in a Collection" }), rest.books.contains(where: { $0.id == long.id }), !rest.books.contains(where: { $0.id == short.id }) else {
            throw Failure("All Books did not group by collection: \(model.shelfGroups(for: model.books(for: .all)).map { "\($0.name): \($0.books.count)" })")
        }
        model.setShelfGrouping(.collection, for: .books)
        guard let epubGroups = model.groupedShelf(.books, books: model.books(for: .books)), epubGroups.contains(where: { $0.name == "Shelf Test Collection" }) else { throw Failure("the Books shelf did not group by collection") }
        model.setShelfGrouping(.collection, for: .collection(collection.id))
        guard model.groupedShelf(.collection(collection.id), books: model.books(for: .collection(collection.id))) == nil else { throw Failure("a collection's own shelf grouped by collection") }
        model.addCollection(named: "Shelf Test Two")
        guard let two = model.collections.first(where: { $0.name == "Shelf Test Two" }) else { throw Failure("the second shelf collection was not made") }
        defer { model.deleteCollection(two.id) }
        model.add([long.id, short.id], to: two.id)
        model.setShelfGrouping(.genre, for: .collection(two.id))
        guard let genreGroups = model.groupedShelf(.collection(two.id), books: model.books(for: .collection(two.id))),
              genreGroups.map(\.name) == ["Mystery & Crime", "Science Fiction"] else {
            throw Failure("the collection did not group by genre: \(model.groupedShelf(.collection(two.id), books: model.books(for: .collection(two.id)))?.map(\.name) ?? [])")
        }
        model.setShelfGrouping(.none, for: .all)
        guard model.groupedShelf(.all, books: model.books(for: .all)) == nil else { throw Failure("grouping stayed on when turned off") }
        model.setShelfGrouping(.collection, for: .all)
        log("shelves grouped: \(groups.map { "\($0.name) (\($0.books.count))" }.joined(separator: ", ")); a collection by genre: \(genreGroups.map(\.name).joined(separator: ", "))")

        // The list view is walked across the shelves and collections, as the table that crashed was.
        for stop in [SidebarItem.all, .collection(collection.id), .collection(two.id), .books, .finished, .pdfs, .collection(collection.id), .all, .collection(two.id)] {
            model.setShelfView(.list, for: stop)
            model.sidebarSelection = stop
            model.selectedBookIDs = [long.id]
            try await sleep(0.15)
        }
        model.setFinished([short.id], true)
        model.sidebarSelection = .finished
        try await sleep(0.2)
        let now = Date()
        let month = Calendar.current.component(.month, from: now), year = Calendar.current.component(.year, from: now)
        guard model.store.booksFinished(inMonth: month, year: year) >= 1 else { throw Failure("a book finished now did not count for this month") }
        guard model.recentlyFinished.first?.id == short.id else { throw Failure("the finished book did not lead Recently Finished") }
        model.setFinished([short.id], false)
        model.sidebarSelection = .all
        try await sleep(0.15)
        log("list view walked across 9 shelves and collections; a finished book counts for the month")

        // Home: a book begun three weeks ago waits under Pick Up Again; the unopened one by the same author is
        // put forward For You; pieces can be hidden, moved and put back.
        var begun = model.book(long.id)!
        begun.position = ReadingPosition(percent: 30)
        begun.lastOpenedAt = Date().addingTimeInterval(-21 * 86400)
        model.update(begun)
        guard model.pickUpAgain.contains(where: { $0.id == long.id }), !model.continueReading.isEmpty else { throw Failure("a book begun three weeks ago is not under Pick Up Again") }
        guard let suggestion = model.forYou.first(where: { $0.book.id == short.id }), suggestion.reason.contains("Shelf Test") else { throw Failure("the unopened book by a read author was not put forward: \(model.forYou.map(\.reason))") }
        guard model.recentlyAdded.contains(where: { $0.id == short.id }), !model.recentlyAdded.contains(where: { $0.id == long.id }) else { throw Failure("Recently Added did not hold the unopened book alone") }
        begun.position = nil
        begun.lastOpenedAt = nil
        model.update(begun)
        model.setHomeElement(.activity, shown: false)
        guard !model.settings.home.visible.contains(.activity), model.settings.home.visible.count == HomeElement.allCases.count - 1 else { throw Failure("a Home piece could not be hidden") }
        model.moveHomeElements(fromOffsets: IndexSet(integer: 0), toOffset: 3)
        guard model.settings.home.elements.first != .continueReading, model.settings.home.elements.count == HomeElement.allCases.count else { throw Failure("Home pieces could not be moved") }
        model.resetHome()
        guard model.settings.home.elements == HomeElement.allCases, model.settings.home.hidden.isEmpty else { throw Failure("Home did not reset") }
        model.sidebarSelection = .home
        try await sleep(0.3)
        model.sidebarSelection = .all
        log("Home: Pick Up Again, For You (\(suggestion.reason)), Recently Added; pieces hidden, moved and reset")

        // A picture of one's own as the cover, laid out, styled, and the original back.
        let picture = NSImage(size: NSSize(width: 300, height: 200), flipped: false) { rect in
            NSColor.systemRed.setFill()
            rect.fill()
            return true
        }
        let before = model.book(long.id)?.coverFile
        model.setCover(picture, for: long.id)
        guard let swapped = model.book(long.id), swapped.coverReplaced, swapped.originalCoverFile == before,
              let url = model.store.coverURL(for: swapped), FileManager.default.fileExists(atPath: url.path),
              let loaded = model.cover(for: swapped), loaded.size.height > 0 else { throw Failure("the chosen picture did not become the cover: \(model.error ?? "no error")") }
        guard abs(loaded.size.width / loaded.size.height - 1.5) < 0.01 else { throw Failure("the cover picture lost its shape: \(loaded.size)") }
        let box = CGSize(width: 200, height: 300)
        let fit = CoverLayout.rect(image: loaded.size, box: box, style: CoverStyle(fit: .fit))
        guard abs(fit.midY - 150) < 0.01, abs(fit.width - 200) < 0.01 else { throw Failure("fitted layout wrong: \(fit)") }
        let fill = CoverLayout.rect(image: loaded.size, box: box, style: CoverStyle(fit: .fill))
        guard abs(fill.height - 300) < 0.01, fill.minX < 0 else { throw Failure("filling layout wrong: \(fill)") }
        var styled = swapped
        styled.coverStyle = CoverStyle(fit: .custom, frame: CoverFrame(x: -0.2, y: 0, width: 1.4, height: 1))
        model.update(styled)
        guard model.book(long.id)?.coverStyle?.fit == .custom, model.book(long.id)?.coverStyle?.frame?.width == 1.4 else { throw Failure("the cover style was not kept") }
        model.restoreCover(for: long.id)
        guard let restored = model.book(long.id), !restored.coverReplaced, restored.coverFile == before, !FileManager.default.fileExists(atPath: url.path) else { throw Failure("the original cover did not come back") }
        log("cover: picture set (\(Int(loaded.size.width))×\(Int(loaded.size.height))), fitted (centred) and filling layouts, style kept, original restored")

        model.zoomGrid(50)
        guard model.settings.gridScale == Settings.gridScaleRange.upperBound else { throw Failure("grid scale not clamped: \(model.settings.gridScale)") }
        model.zoomGrid(-50)
        guard model.settings.gridScale == Settings.gridScaleRange.lowerBound else { throw Failure("grid scale not clamped below: \(model.settings.gridScale)") }
        log("shelf: reading counts, sorts, grouping, cover swap and cover size checked")
    }

    @MainActor
    private static func runFoldersBody(model: LibraryModel) async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("Books Self-Test Folder \(UUID().uuidString)", isDirectory: true)
        let fiction = root.appendingPathComponent("Fiction", isDirectory: true), science = root.appendingPathComponent("Science", isDirectory: true)
        try FileManager.default.createDirectory(at: fiction.appendingPathComponent("Deeper", isDirectory: true), withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: science, withIntermediateDirectories: true)
        func epub(_ title: String) throws -> Data {
            let chapter = EPUBChapter(label: "One", title: "One", html: "<p>\(title): " + String(repeating: "words and words. ", count: 40) + "</p>")
            return try EPUBWriter.build(EPUBSpec(title: title, author: "Folder Test", chapters: [chapter], coverSVG: CoverArt.svg(title: title, author: "Folder Test")))
        }
        try epub("Folder Novel").write(to: fiction.appendingPathComponent("Deeper/novel.epub"))
        try makePDF(pages: 2).write(to: science.appendingPathComponent("paper.pdf"))
        try epub("Folder Loose").write(to: root.appendingPathComponent("loose.epub"))
        var created: [UUID] = []
        var madeCollections: [UUID] = []
        defer {
            model.delete(created)
            for id in madeCollections { model.deleteCollection(id) }
            var s = model.settings
            s.library.folder = nil
            model.settings = s
            try? FileManager.default.removeItem(at: root)
        }
        // A collection of the same name in another case is used, not doubled.
        model.addCollection(named: "fiction")
        guard let fictionCollection = model.collections.first(where: { $0.name == "fiction" }) else { throw Failure("the fiction collection was not made") }
        madeCollections.append(fictionCollection.id)
        let collectionsBefore = model.collections.count
        var s = model.settings
        s.library.folder = root.path
        s.library.sync = false
        s.library.syncCollections = true
        model.settings = s
        var scan = await withCheckedContinuation { continuation in model.scanLibraryFolder(manual: true) { continuation.resume(returning: ($0, $1)) } }
        guard scan.1 == 3, scan.0 == 3 else { throw Failure("the library folder scan saw \(scan.1) files and added \(scan.0); expected 3 and 3") }
        let novel = model.books.first { $0.title == "Folder Novel" }, loose = model.books.first { $0.title == "Folder Loose" }, paper = model.books.first { $0.title.lowercased().hasPrefix("paper") }
        guard let novel, let loose, let paper else { throw Failure("the folder's books were not all added: \(model.books.map(\.title))") }
        created += [novel.id, loose.id, paper.id]
        guard model.collections.count == collectionsBefore + 1, let scienceCollection = model.collections.first(where: { $0.name == "Science" }) else {
            throw Failure("collections after the scan: \(model.collections.map(\.name)); expected fiction (kept) and Science (made)")
        }
        madeCollections.append(scienceCollection.id)
        guard model.collections.first(where: { $0.id == fictionCollection.id })?.bookIDs == [novel.id], scienceCollection.bookIDs == [paper.id] else {
            throw Failure("the folder's books were not put in their subfolders' collections")
        }
        scan = await withCheckedContinuation { continuation in model.scanLibraryFolder(manual: true) { continuation.resume(returning: ($0, $1)) } }
        guard scan.0 == 0, scan.1 == 3 else { throw Failure("a second scan added \(scan.0) books") }
        // The loose book moves into Fiction.
        try FileManager.default.moveItem(at: root.appendingPathComponent("loose.epub"), to: fiction.appendingPathComponent("loose.epub"))
        scan = await withCheckedContinuation { continuation in model.scanLibraryFolder(manual: true) { continuation.resume(returning: ($0, $1)) } }
        guard scan.0 == 0, model.collections.first(where: { $0.id == fictionCollection.id })?.bookIDs.contains(loose.id) == true, model.book(loose.id)?.source == fiction.appendingPathComponent("loose.epub").path else {
            throw Failure("a moved file did not move its book into the subfolder's collection")
        }
        log("library folder: 3 files from 3 levels, collections fiction (kept, case aside) and Science, nothing doubled on a rescan, a moved file followed")

        // A folder added by hand, its subfolders as collections when asked.
        let other = FileManager.default.temporaryDirectory.appendingPathComponent("Books Self-Test Import \(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: other.appendingPathComponent("History", isDirectory: true), withIntermediateDirectories: true)
        try epub("Folder History").write(to: other.appendingPathComponent("History/history.epub"))
        try epub("Folder Top").write(to: other.appendingPathComponent("top.epub"))
        defer { try? FileManager.default.removeItem(at: other) }
        let imported: [Book] = await withCheckedContinuation { continuation in
            model.importFiles([other], quiet: true, allowDuplicates: true, collections: true) { continuation.resume(returning: $0) }
        }
        created += imported.map(\.id)
        guard imported.count == 2, let history = model.collections.first(where: { $0.name == "History" }), history.bookIDs.count == 1 else {
            throw Failure("adding a folder gave \(imported.count) books and collections \(model.collections.map(\.name))")
        }
        madeCollections.append(history.id)
        log("folder added by hand: 2 books, collection History from its subfolder")
    }

    /// The screens of Zoom & Split read on like a book: no screen repeats ink an earlier one showed, every screen
    /// but the last is filled, and each holds at most a screen's worth.
    @MainActor
    private static func checkFlow(_ split: SplitPDFPresenter, expectCuts: Bool) throws {
        let screens = split.screens
        guard screens.count > 1, split.screenPoints > 0 else { throw Failure("Zoom & Split has no screens to check") }
        for u in 1..<screens.count {
            for a in screens[u - 1].pieces {
                for b in screens[u].pieces where a.page == b.page && b.rect.maxY > a.rect.minY + 0.5
                    && min(a.rect.maxX, b.rect.maxX) - max(a.rect.minX, b.rect.minX) > min(a.rect.width, b.rect.width) * 0.5 {
                    throw Failure("screen \(u + 1) repeats page \(a.page + 1) from \(Int(b.rect.maxY)) down; the screen before ended at \(Int(a.rect.minY))")
                }
            }
        }
        // Where one piece of a page ends and the next begins, the page shows a blank band: no line was cut through.
        var cuts = 0
        for u in 1..<screens.count {
            guard let a = screens[u - 1].pieces.last, let b = screens[u].pieces.first, a.page == b.page, b.rect.maxY <= a.rect.minY + 0.01 else { continue }
            cuts += 1
            let band = (a.rect.minY + b.rect.maxY) / 2
            if let ink = split.inkFraction(page: a.page, y: band), ink > 0.1 {
                throw Failure("screen \(u) was cut through ink on page \(a.page + 1) at \(Int(band)) (\(Int(ink * 100))% of the row)")
            }
        }
        // Rewrapped words are never cut through by construction, and a screen boundary usually falls inside a line's words.
        if expectCuts, cuts == 0, !split.rewrapped { throw Failure("no screen was cut within a page; the flow did not split pages") }
        for (i, screen) in screens.enumerated() {
            guard screen.height <= split.screenPoints + 0.5 else { throw Failure("screen \(i + 1) holds \(Int(screen.height)) of \(Int(split.screenPoints)) points") }
            if i < screens.count - 1, !screens[i + 1].standalone, screen.height < split.screenPoints * 0.5 { throw Failure("screen \(i + 1) is only \(Int(screen.height / split.screenPoints * 100))% full") }
        }
        var lastPage = -1
        for screen in screens { for piece in screen.pieces { guard piece.page >= lastPage else { throw Failure("screens run out of page order") }; lastPage = piece.page } }
    }

    private static func XCTUnwrapView(_ view: NSView?) throws -> NSView {
        guard let view else { throw Failure("no PDF view") }
        return view
    }

    /// Letter-size pages: a heading and 26 lines each, one of them the line the search looks for.
    private static func makePDF(pages: Int) throws -> Data {
        let data = NSMutableData()
        var mediaBox = CGRect(x: 0, y: 0, width: 612, height: 792)
        guard let consumer = CGDataConsumer(data: data as CFMutableData), let context = CGContext(consumer: consumer, mediaBox: &mediaBox, nil) else {
            throw Failure("could not create a PDF context")
        }
        let heading: [NSAttributedString.Key: Any] = [.font: NSFont.boldSystemFont(ofSize: 22), .foregroundColor: NSColor.black]
        let body: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: 12), .foregroundColor: NSColor.black]
        for i in 1...pages {
            context.beginPDFPage(nil)
            NSGraphicsContext.saveGraphicsState()
            NSGraphicsContext.current = NSGraphicsContext(cgContext: context, flipped: false)
            ("PDF self-test page \(i)" as NSString).draw(at: NSPoint(x: 72, y: 720), withAttributes: heading)
            var y: CGFloat = 680
            for line in 1...26 {
                let text = line == 3 ? "The quick brown fox jumps over the lazy dog." : "Line \(line) of page \(i): the vixen jumped quickly over the fence."
                // Every fifth line begins a paragraph, indented as a book's are.
                (text as NSString).draw(at: NSPoint(x: line % 5 == 1 ? 92 : 72, y: y), withAttributes: body)
                y -= 22
            }
            NSGraphicsContext.restoreGraphicsState()
            context.endPDFPage()
        }
        context.closePDF()
        return data as Data
    }

    private static func sleep(_ seconds: Double) async throws {
        try await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
    }

    @MainActor
    private static func waitFor<T>(_ what: String, timeout: Double, _ probe: @MainActor () -> T?) async throws -> T {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if let value = probe() { return value }
            try await sleep(0.2)
        }
        throw Failure("timed out waiting for \(what)")
    }

    /// A scroll-wheel event with mouse-notch semantics (line units, no precise deltas), aimed at the middle of the
    /// web view. AppKit reports a windowless event's location in screen coordinates and WebKit reads them as view
    /// coordinates, so the event is placed at the screen point equal to the wanted view point.
    @MainActor
    private static func postWheel(dy: Int32, dx: Int32, shift: Bool, to view: NSView) throws {
        guard let window = view.window else { throw Failure("web view has no window") }
        let inView = CGPoint(x: view.bounds.midX, y: view.bounds.midY)
        let inWindow = view.convert(inView, to: nil)
        let screenHeight = CGDisplayBounds(CGMainDisplayID()).height
        guard let event = CGEvent(scrollWheelEvent2Source: nil, units: .line, wheelCount: 2, wheel1: dy, wheel2: dx, wheel3: 0) else { throw Failure("could not create a wheel event") }
        event.location = CGPoint(x: inWindow.x, y: screenHeight - inWindow.y)
        event.flags = shift ? .maskShift : []
        guard let nsEvent = NSEvent(cgEvent: event) else { throw Failure("could not wrap the wheel event") }
        _ = window
        view.scrollWheel(with: nsEvent)
    }
}
