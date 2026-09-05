import AppKit
import Observation
import WebKit
import BooksCore

/// One chapter or bookmark on the timeline.
struct TimelineMark: Hashable {
    let label: String
    let pos: Double
    let level: Int
}

struct ReaderLayoutInfo {
    var mode: Mode = .paginated
    var total: Double = 1
    var columns = 1
    var chapters: [TimelineMark] = []
    var bookmarks: [TimelineMark] = []

    enum Mode: String { case paginated, scroll }
}

struct ReaderPosition {
    var page: Double = 0
    var total: Double = 1
    var percent: Double = 0
    var chapter = ""
    var chapterIndex = 0
    var pagesLeftInChapter = 0
    var locator: Locator?
    var atEnd = false
    var bookmarkID: UUID?

    var fraction: Double { total > 0 ? min(1, max(0, page / total)) : 0 }
}

struct ReaderTOCItem: Hashable, Identifiable {
    let id = UUID()
    let label: String
    let href: String
    let level: Int
    let pos: Double
    let spine: Int
}

struct ReaderSelection {
    let text: String
    let locator: Locator
    let endOffset: Int
    let rect: CGRect
    let chapter: String
}

struct SearchHit: Hashable, Identifiable {
    let id = UUID()
    let locator: Locator
    let excerpt: String
    let chapter: String
    let pos: Double
}

/// The state of one book being read, and the bridge to the page that typesets it. Owns the web view, feeds it
/// settings, positions and annotations, and turns the page's messages into library records.
@MainActor
@Observable
final class ReaderSession {
    let book: Book
    unowned let model: LibraryModel

    let webView: ReaderWebView
    private let schemeHandler = BooksSchemeHandler()
    private let messages = ReaderMessageHandler()
    private let navigation = ReaderNavigationDelegate()
    /// PDFs: the PDFKit presenter, created by the PDF view when it appears.
    @ObservationIgnored var pdf: PDFPresenter?
    @ObservationIgnored private var pdfSections: [PDFSection] = []

    private(set) var isPageReady = false
    private(set) var isOpen = false
    private(set) var layout = ReaderLayoutInfo()
    private(set) var position = ReaderPosition()
    private(set) var toc: [ReaderTOCItem] = []
    private(set) var annotations: [Annotation]
    var selection: ReaderSelection?
    var tappedHighlight: (annotation: Annotation, rect: CGRect)?
    var editingNote: Annotation?
    var showContents = false
    var showSearch = false
    var showAppearance = false
    var showEndCard = false
    var searchQuery = ""
    private(set) var searchResults: [SearchHit] = []
    private(set) var searchDone = true
    var error: String?
    /// Native chrome (footer, timeline) is shown while the pointer is near the bottom or the app is not full screen.
    private(set) var timelineVisible = false
    private(set) var footerVisible = true
    var isFullScreen = false
    var timelineDragging = false { didSet { refreshChrome() } }
    var previewFraction: Double?

    private var pointerY: CGFloat = 0
    private var viewHeight: CGFloat = 800
    private var chromeTimer: Timer?
    private var saveTask: Task<Void, Never>?
    private var readingTimer: Timer?
    private var lastActivity = Date()
    private var pagesTurned = 0
    private var lastPage: Double?
    private var systemIsDark: Bool { NSApp.effectiveAppearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua }
    private var appearanceObserver: NSKeyValueObservation?

    init(book: Book, model: LibraryModel) {
        self.book = book
        self.model = model
        annotations = model.store.annotations(for: book.id)
        schemeHandler.bookURL = model.store.fileURL(for: book)

        let configuration = WKWebViewConfiguration()
        configuration.setURLSchemeHandler(schemeHandler, forURLScheme: BooksSchemeHandler.scheme)
        configuration.userContentController.add(messages, name: "reader")
        configuration.preferences.isElementFullscreenEnabled = false
        configuration.suppressesIncrementalRendering = true
        webView = ReaderWebView(frame: .zero, configuration: configuration)
        webView.allowsBackForwardNavigationGestures = false
        webView.allowsMagnification = false
        messages.onMessage = { [weak self] body in Task { @MainActor in self?.receive(JSON(body)) } }
        navigation.onFailure = { [weak self] message in Task { @MainActor in self?.error = message } }
        webView.navigationDelegate = navigation
        webView.session = self
        if book.kind == .epub {
            if BooksSchemeHandler.readerDirectory == nil {
                error = "This copy of Books is missing its reader page (Contents/Resources/Reader). Reinstall the app."
            } else {
                webView.load(URLRequest(url: BooksSchemeHandler.pageURL))
            }
        }

        appearanceObserver = NSApp.observe(\.effectiveAppearance) { [weak self] _, _ in
            Task { @MainActor in self?.applySettings() }
        }
        startReadingTimer()
    }

    func teardown() {
        flushPosition()
        pdf?.close()
        pdf = nil
        readingTimer?.invalidate()
        chromeTimer?.invalidate()
        appearanceObserver = nil
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "reader")
        webView.stopLoading()
    }

    var effectiveTheme: Theme { model.settings.reader.effectiveTheme(systemIsDark: systemIsDark) }

    // MARK: - Calls into the page

    private func call(_ function: String, _ arguments: Any...) {
        let args = arguments.map { JSON.literal($0) }.joined(separator: ", ")
        webView.evaluateJavaScript("void (window.reader && window.reader.\(function)(\(args)));") { _, error in
            if let error { NSLog("reader.%@: %@", function, error.localizedDescription) }
        }
    }

    private func openBook() {
        var highlights: [[String: Any]] = []
        for a in annotations where a.kind == .highlight {
            highlights.append(["id": a.id.uuidString, "locator": ["spine": a.locator.spine, "start": a.locator.offset, "end": a.endOffset ?? a.locator.offset], "color": a.color?.rawValue ?? "yellow", "note": a.note])
        }
        var arguments: [String: Any] = [
            "url": BooksSchemeHandler.bookURLString,
            "settings": model.settings.reader.webSettings(systemIsDark: systemIsDark),
            "bookmarks": bookmarkPayload(),
            "highlights": highlights,
        ]
        if let locator = book.position?.locator, !(book.isFinished && (book.position?.percent ?? 0) >= 100) {
            arguments["locator"] = ["spine": locator.spine, "offset": locator.offset]
        } else {
            arguments["locator"] = NSNull()
        }
        call("open", arguments)
    }

    private func bookmarkPayload() -> [[String: Any]] {
        annotations.filter { $0.kind == .bookmark }.map { ["id": $0.id.uuidString, "locator": ["spine": $0.locator.spine, "offset": $0.locator.offset]] }
    }

    private var isPDF: Bool { book.kind == .pdf }

    func applySettings() {
        if isPDF { pdf?.applySettings(); return }
        guard isOpen else { return }
        call("applySettings", model.settings.reader.webSettings(systemIsDark: systemIsDark))
    }

    func next() { if isPDF { pdf?.next() } else { call("next") }; activity() }
    func previous() { if isPDF { pdf?.previous() } else { call("prev") }; activity() }
    func nextChapter() { if isPDF { pdf?.nextSection() } else { call("nextChapter") }; activity() }
    func previousChapter() { if isPDF { pdf?.previousSection() } else { call("prevChapter") }; activity() }
    func goToFraction(_ fraction: Double) {
        let f = min(1, max(0, fraction))
        if isPDF { pdf?.go(toFraction: f) } else { call("goToFraction", f) }
        activity()
    }
    func goToPos(_ pos: Double) { if isPDF { pdf?.go(toPage: whole(pos)) } else { call("goToPos", pos) }; activity() }
    func goToHref(_ href: String) {
        if isPDF { if let page = Int(href) { pdf?.go(toPage: page) } } else { call("goToHref", href) }
        activity()
    }
    func goToLocator(_ locator: Locator) {
        if isPDF { pdf?.go(toPage: locator.spine) } else { call("goToLocator", ["spine": locator.spine, "offset": locator.offset]) }
        activity()
    }
    /// A contents entry: a document and fragment in a book, a page in a PDF.
    func open(_ item: ReaderTOCItem) { if isPDF { pdf?.go(toPage: item.spine) } else { goToHref(item.href) } }
    /// A search result: the page script scrolls to the locator; the PDF view selects the match.
    func open(_ hit: SearchHit) { if isPDF { pdf?.show(hit) } else { goToLocator(hit.locator) } }

    /// ⌘+ and ⌘−: text size for books, zoom for PDFs.
    func changeFontSize(by delta: Int) {
        if isPDF { pdf?.zoom(delta > 0 ? 1 : -1); return }
        var settings = model.settings
        settings.reader.fontSize = min(300, max(50, settings.reader.fontSize + delta))
        model.settings = settings
        applySettings()
    }

    /// A notched mouse wheel: one notch turns one page in the paginated layout, or scrolls the text by the
    /// system's scroll distance in the scrolling layout. Trackpads (precise deltas, gesture phases) are left to the
    /// view, which accumulates them. Returns true when the event was consumed.
    func handleWheel(_ event: NSEvent) -> Bool {
        guard isOpen, !event.hasPreciseScrollingDeltas, event.phase == [], event.momentumPhase == [] else { return false }
        activity()
        let settings = model.settings.reader
        // AppKit reports scrolling down and to the right as negative deltas, in lines for notched wheels.
        let vertical = event.scrollingDeltaY, horizontal = event.scrollingDeltaX
        let sideways = abs(horizontal) > abs(vertical) || (event.modifierFlags.contains(.shift) && horizontal == 0)
        if layout.mode == .scroll {
            if isPDF { return false }   // PDFKit scrolls its own pages
            if !sideways, vertical != 0 { call("scrollBy", -vertical * 40) }   // 40 points a line, as WebKit scrolls
            return true
        }
        guard settings.wheelTurnsPages else { return true }
        if sideways && !settings.wheelHorizontal { return true }
        var delta = sideways ? (horizontal != 0 ? horizontal : vertical) : vertical
        if settings.wheelInvert { delta = -delta }
        guard delta != 0 else { return true }
        if delta < 0 { next() } else { previous() }
        return true
    }

    /// The system's definition popover, the one Look Up in a context menu shows, over the selected words.
    func lookUpSelection() {
        guard let sel = selection else { return }
        let host: NSView = isPDF ? (pdf?.view ?? webView) : webView
        let origin = host.isFlipped ? NSPoint(x: sel.rect.minX, y: sel.rect.maxY) : NSPoint(x: sel.rect.minX, y: host.bounds.height - sel.rect.maxY)
        host.showDefinition(for: NSAttributedString(string: sel.text), at: origin)
        clearSelection()
    }

    // MARK: - Annotations

    var isBookmarked: Bool { position.bookmarkID != nil }

    func toggleBookmark() {
        if let id = position.bookmarkID, let i = annotations.firstIndex(where: { $0.id == id }) {
            annotations.remove(at: i)
        } else if let locator = position.locator {
            annotations.append(Annotation(kind: .bookmark, locator: locator, text: "", chapter: position.chapter))
        } else {
            return
        }
        persistAnnotations()
        syncBookmarks()
    }

    private func syncBookmarks() {
        if isPDF { refreshPDFMarks() } else { call("setBookmarks", bookmarkPayload()) }
    }

    func removeAnnotation(_ id: UUID) {
        guard let a = annotations.first(where: { $0.id == id }) else { return }
        annotations.removeAll { $0.id == id }
        persistAnnotations()
        if a.kind == .highlight {
            if isPDF { pdf?.removeHighlight(id) } else { call("removeHighlight", id.uuidString) }
        } else {
            syncBookmarks()
        }
        if tappedHighlight?.annotation.id == id { tappedHighlight = nil }
        if editingNote?.id == id { editingNote = nil }
    }

    /// Highlights the current selection; the page answers with `highlightAdded`, which stores it.
    func highlightSelection(color: HighlightColor, note: String = "") {
        guard selection != nil else { return }
        if isPDF {
            guard var annotation = pdf?.highlightSelection(color: color) else { selection = nil; return }
            annotation.note = note
            annotations.append(annotation)
            persistAnnotations()
            selection = nil
            if !note.isEmpty || pendingNoteAfterHighlight { pendingNoteAfterHighlight = false; editingNote = annotation }
            return
        }
        let id = UUID()
        pendingHighlight[id] = note
        call("addHighlight", ["id": id.uuidString, "color": color.rawValue, "note": note])
        selection = nil
    }

    private var pendingHighlight: [UUID: String] = [:]

    func recolor(_ id: UUID, _ color: HighlightColor) {
        guard let i = annotations.firstIndex(where: { $0.id == id }) else { return }
        annotations[i].color = color
        annotations[i].updatedAt = Date()
        persistAnnotations()
        if isPDF { pdf?.recolor(id) } else { call("updateHighlight", ["id": id.uuidString, "color": color.rawValue, "note": annotations[i].note]) }
        if let tapped = tappedHighlight, tapped.annotation.id == id { tappedHighlight = (annotations[i], tapped.rect) }
    }

    func setNote(_ note: String, for id: UUID) {
        guard let i = annotations.firstIndex(where: { $0.id == id }) else { return }
        annotations[i].note = note
        annotations[i].updatedAt = Date()
        persistAnnotations()
        if isPDF { pdf?.setNote(note, for: id) } else { call("updateHighlight", ["id": id.uuidString, "color": annotations[i].color?.rawValue ?? "yellow", "note": note]) }
    }

    func clearSelection() {
        selection = nil
        if isPDF { pdf?.clearSelection() } else { call("clearSelection") }
    }

    private func persistAnnotations() {
        model.store.saveAnnotations(annotations, for: book.id)
    }

    var highlights: [Annotation] { annotations.filter { $0.kind == .highlight }.sorted { ($0.locator.spine, $0.locator.offset) < ($1.locator.spine, $1.locator.offset) } }
    var bookmarks: [Annotation] { annotations.filter { $0.kind == .bookmark }.sorted { ($0.locator.spine, $0.locator.offset) < ($1.locator.spine, $1.locator.offset) } }

    // MARK: - Search

    func search(_ query: String) {
        searchQuery = query
        searchResults = []
        searchDone = query.trimmingCharacters(in: .whitespaces).isEmpty
        if isPDF { pdf?.search(query) } else { call("search", query) }
    }

    // MARK: - Messages from the page

    private func receive(_ m: JSON) {
        switch m.string("type") ?? "" {
        case "ready":
            isPageReady = true
            openBook()
        case "opened":
            isOpen = true
            toc = m.array("toc").map { ReaderTOCItem(label: $0.string("label") ?? "", href: $0.string("href") ?? "", level: $0.int("level") ?? 0, pos: $0.double("pos") ?? 0, spine: $0.int("spine") ?? 0) }
            updateLayout(m)
        case "layout":
            updateLayout(m)
        case "position":
            var p = ReaderPosition()
            p.page = m.double("page") ?? 0
            p.total = m.double("total") ?? 1
            p.percent = m.double("percent") ?? 0
            p.chapter = m.string("chapter") ?? ""
            p.chapterIndex = m.int("chapterIndex") ?? 0
            p.pagesLeftInChapter = m.int("pagesLeftInChapter") ?? 0
            p.locator = m.locator("locator")
            p.atEnd = m.bool("atEnd") ?? false
            p.bookmarkID = m.string("bookmark").flatMap(UUID.init(uuidString:))
            if let last = lastPage, layout.mode == .paginated, p.page > last { pagesTurned += whole(p.page - last) }
            lastPage = p.page
            position = p
            schedulePositionSave()
        case "end":
            showEndCard = true
            model.savePosition(ReadingPosition(locator: position.locator, percent: 100), for: book.id, finished: true)
        case "selection":
            guard let text = m.string("text"), let o = m.object("locator"), let spine = o.int("spine"), let rect = m.rect("rect") else { return }
            selection = ReaderSelection(text: text, locator: Locator(spine: spine, offset: o.int("start") ?? 0), endOffset: o.int("end") ?? 0, rect: rect, chapter: m.string("chapter") ?? position.chapter)
            tappedHighlight = nil
        case "selectionCleared":
            selection = nil
        case "highlightTapped":
            guard let id = m.string("id").flatMap(UUID.init(uuidString:)), let a = annotations.first(where: { $0.id == id }), let rect = m.rect("rect") else { return }
            selection = nil
            tappedHighlight = (a, rect)
        case "highlightAdded":
            guard let id = m.string("id").flatMap(UUID.init(uuidString:)), let o = m.object("locator"), let spine = o.int("spine") else { return }
            let color = HighlightColor(rawValue: m.string("color") ?? "yellow") ?? .yellow
            let annotation = Annotation(id: id, kind: .highlight, locator: Locator(spine: spine, offset: o.int("start") ?? 0), endOffset: o.int("end"), color: color, text: m.string("text") ?? "", note: pendingHighlight.removeValue(forKey: id) ?? m.string("note") ?? "", chapter: m.string("chapter") ?? position.chapter)
            annotations.append(annotation)
            persistAnnotations()
            if !annotation.note.isEmpty || pendingNoteAfterHighlight { pendingNoteAfterHighlight = false; editingNote = annotation }
        case "link":
            if let href = m.string("href"), let url = URL(string: href), let scheme = url.scheme, ["http", "https", "mailto"].contains(scheme.lowercased()) { NSWorkspace.shared.open(url) }
        case "pointer":
            pointerMoved(y: CGFloat(m.double("y") ?? 0))
        case "activity":
            activity()
        case "searchResults":
            guard m.string("query") == searchQuery else { return }
            let hits = m.array("results").compactMap { r -> SearchHit? in
                guard let spine = r.int("spine") else { return nil }
                return SearchHit(locator: Locator(spine: spine, offset: r.int("offset") ?? 0), excerpt: r.string("excerpt") ?? "", chapter: r.string("chapter") ?? "", pos: r.double("pos") ?? 0)
            }
            searchResults.append(contentsOf: hits)
            searchDone = m.bool("done") ?? false
        case "error":
            error = m.string("message") ?? "The book could not be shown."
        default:
            break
        }
    }

    /// Set when Add Note is chosen from the selection menu: the note editor opens once the highlight exists.
    var pendingNoteAfterHighlight = false

    private func updateLayout(_ m: JSON) {
        var l = ReaderLayoutInfo()
        l.mode = ReaderLayoutInfo.Mode(rawValue: m.string("mode") ?? "paginated") ?? .paginated
        l.total = m.double("total") ?? 1
        l.columns = m.int("cols") ?? 1
        l.chapters = m.array("chapters").map { TimelineMark(label: $0.string("label") ?? "", pos: $0.double("pos") ?? 0, level: $0.int("level") ?? 0) }
        l.bookmarks = m.array("bookmarks").map { TimelineMark(label: $0.string("id") ?? "", pos: $0.double("pos") ?? 0, level: 0) }
        layout = l
    }

    // MARK: - Position, statistics

    private func schedulePositionSave() {
        saveTask?.cancel()
        saveTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 800_000_000)
            guard !Task.isCancelled else { return }
            self?.flushPosition()
        }
    }

    func flushPosition() {
        if pagesTurned > 0 { model.recordReading(seconds: 0, pages: pagesTurned); pagesTurned = 0 }
        guard !isPDF, isOpen, let locator = position.locator else { return }   // PDFs save as their page changes
        let finished: Bool? = position.atEnd && layout.total > 1 ? true : nil
        model.savePosition(ReadingPosition(locator: locator, percent: position.percent), for: book.id, finished: finished)
    }

    // MARK: - PDFs (the presenter reports what the page script reports for books)

    func pdfOpened(pageCount: Int, sections: [PDFSection], columns: Int, mode: ReaderLayoutInfo.Mode) {
        pdfSections = sections
        toc = sections.map { ReaderTOCItem(label: $0.label, href: String($0.page), level: $0.level, pos: Double($0.page), spine: $0.page) }
        var l = ReaderLayoutInfo()
        l.mode = mode
        l.total = Double(max(1, pageCount))
        l.columns = columns
        l.chapters = sections.map { TimelineMark(label: $0.label, pos: Double($0.page), level: $0.level) }
        layout = l
        isOpen = true
        refreshPDFMarks()
    }

    func pdfLayoutChanged(columns: Int, mode: ReaderLayoutInfo.Mode) {
        layout.mode = mode
        layout.columns = columns
    }

    func pdfPageChanged(index: Int, count: Int) {
        guard count > 0 else { return }
        let shown = min(index + max(1, layout.columns), count)
        let percent = Double(shown) / Double(count) * 100
        var p = position
        p.page = Double(index)
        p.total = Double(count)
        p.percent = percent
        p.locator = Locator(spine: index, offset: 0)
        let section = pdfSections.last { $0.page <= index }
        p.chapter = section?.label ?? ""
        p.chapterIndex = section.flatMap { pdfSections.firstIndex(of: $0) } ?? 0
        let nextStart = pdfSections.first { $0.page > index }?.page ?? count
        p.pagesLeftInChapter = max(0, nextStart - shown)
        p.atEnd = shown >= count
        p.bookmarkID = bookmarks.first { $0.locator.spine == index }?.id
        if let last = lastPage, Double(index) > last { pagesTurned += index - whole(last) }
        lastPage = Double(index)
        position = p
        model.savePosition(ReadingPosition(pdfPage: index + 1, percent: percent), for: book.id, finished: p.atEnd && count > 1 ? true : nil)
        activity()
    }

    private func refreshPDFMarks() {
        layout.bookmarks = bookmarks.map { TimelineMark(label: $0.id.uuidString, pos: Double($0.locator.spine), level: 0) }
        position.bookmarkID = bookmarks.first { $0.locator.spine == whole(position.page) }?.id
    }

    func pdfSelectionChanged(text: String?, rect: CGRect, page: Int) {
        guard let text, !text.isEmpty else { selection = nil; return }
        selection = ReaderSelection(text: text, locator: Locator(spine: page, offset: 0), endOffset: 0, rect: rect, chapter: position.chapter)
        tappedHighlight = nil
    }

    func pdfHighlightTapped(_ id: UUID, rect: CGRect) {
        guard let a = annotations.first(where: { $0.id == id }) else { return }
        selection = nil
        tappedHighlight = (a, rect)
    }

    func pdfSearchResults(_ hits: [SearchHit], for query: String) {
        guard query == searchQuery else { return }
        searchResults = hits
        searchDone = true
    }

    func pointerMoved(y: CGFloat) {
        pointerY = y
        refreshChrome()
        activity()
    }

    private func startReadingTimer() {
        readingTimer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self, NSApp.isActive, Date().timeIntervalSince(self.lastActivity) < 120 else { return }
                self.model.recordReading(seconds: 30)
            }
        }
    }

    func activity() { lastActivity = Date() }

    // MARK: - Chrome

    func viewResized(height: CGFloat) { viewHeight = height; refreshChrome() }

    func refreshChrome() {
        let nearBottom = pointerY > viewHeight - 120
        timelineVisible = nearBottom || timelineDragging
        chromeTimer?.invalidate()
        if isFullScreen {
            footerVisible = nearBottom || timelineDragging || showContents || showSearch || showAppearance
            if !footerVisible { return }
            chromeTimer = Timer.scheduledTimer(withTimeInterval: 1.5, repeats: false) { [weak self] _ in
                Task { @MainActor in
                    guard let self, !self.timelineDragging else { return }
                    if !(self.pointerY > self.viewHeight - 120) { self.footerVisible = false; self.timelineVisible = false }
                }
            }
        } else {
            footerVisible = true
        }
    }

    func close() {
        flushPosition()
        model.closeReader()
    }
}
