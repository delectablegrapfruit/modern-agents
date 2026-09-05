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
        guard let pdfView = session.pdf?.view else { throw Failure("no PDF view") }
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
        session.close()
        try await sleep(0.4)
        let savedPage = model.book(book.id)?.position?.pdfPage ?? 0
        guard model.reading == nil, savedPage >= 7 else { throw Failure("PDF position was not saved (page \(savedPage))") }
    }

    /// Letter-size pages, each with a line of text the search looks for.
    private static func makePDF(pages: Int) throws -> Data {
        let data = NSMutableData()
        var mediaBox = CGRect(x: 0, y: 0, width: 612, height: 792)
        guard let consumer = CGDataConsumer(data: data as CFMutableData), let context = CGContext(consumer: consumer, mediaBox: &mediaBox, nil) else {
            throw Failure("could not create a PDF context")
        }
        let attributes: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: 18), .foregroundColor: NSColor.black]
        for i in 1...pages {
            context.beginPDFPage(nil)
            NSGraphicsContext.saveGraphicsState()
            NSGraphicsContext.current = NSGraphicsContext(cgContext: context, flipped: false)
            ("PDF self-test page \(i)" as NSString).draw(at: NSPoint(x: 72, y: 700), withAttributes: attributes)
            ("The quick brown fox jumps over the lazy dog." as NSString).draw(at: NSPoint(x: 72, y: 660), withAttributes: attributes)
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
