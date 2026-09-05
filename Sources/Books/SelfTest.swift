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
        // Larger text: more screens, and once two columns no longer fit the window, one.
        for _ in 0..<5 { fitSession.changeFontSize(by: 10) }
        try await sleep(0.8)
        let screensAt150 = fitSession.layout.total
        guard model.settings.reader.pdfZoom == 150, screensAt150 > screensAt100, fitSession.layout.columns == 1 else {
            throw Failure("150% did not enlarge the text into one column (\(model.settings.reader.pdfZoom)%, \(screensAt100) → \(screensAt150) screens, \(fitSession.layout.columns) column(s))")
        }
        try checkFlow(split, expectCuts: true)
        // Smaller text: pages run on into one another, fewer screens, two columns again.
        for _ in 0..<10 { fitSession.changeFontSize(by: -10) }
        try await sleep(0.8)
        guard model.settings.reader.pdfZoom == 50, fitSession.layout.total < screensAt100, fitSession.layout.columns == 2 else {
            throw Failure("50% did not reduce the screens into two columns (\(model.settings.reader.pdfZoom)%, \(fitSession.layout.total) screens, \(fitSession.layout.columns) column(s))")
        }
        try checkFlow(split, expectCuts: false)
        var fitSettings = model.settings
        fitSettings.reader.spread = .two
        fitSettings.reader.pdfZoom = 100
        model.settings = fitSettings
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
        log("Zoom & Split: \(Int(screensAt100)) screens at 100%, \(Int(screensAt150)) at 150% in one column; blocks never cut, no repeats; turns, \(fitHits) matches, bookmark; footer “\(fitSession.pdfPageLabel ?? "")”")

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
        if expectCuts, cuts == 0 { throw Failure("no screen was cut within a page; the flow did not split pages") }
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
                (text as NSString).draw(at: NSPoint(x: 72, y: y), withAttributes: body)
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
