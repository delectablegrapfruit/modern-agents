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
        if book.kind == .epub { webView.load(URLRequest(url: BooksSchemeHandler.pageURL)) }

        appearanceObserver = NSApp.observe(\.effectiveAppearance) { [weak self] _, _ in
            Task { @MainActor in self?.applySettings() }
        }
        startReadingTimer()
    }

    func teardown() {
        flushPosition()
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

    func applySettings() {
        guard isOpen else { return }
        call("applySettings", model.settings.reader.webSettings(systemIsDark: systemIsDark))
    }

    func next() { call("next"); activity() }
    func previous() { call("prev"); activity() }
    func nextChapter() { call("nextChapter"); activity() }
    func previousChapter() { call("prevChapter"); activity() }
    func goToFraction(_ f: Double) { call("goToFraction", min(1, max(0, f))); activity() }
    func goToPos(_ pos: Double) { call("goToPos", pos); activity() }
    func goToHref(_ href: String) { call("goToHref", href); activity() }
    func goToLocator(_ locator: Locator) { call("goToLocator", ["spine": locator.spine, "offset": locator.offset]); activity() }

    func changeFontSize(by delta: Int) {
        var settings = model.settings
        settings.reader.fontSize = min(300, max(50, settings.reader.fontSize + delta))
        model.settings = settings
        applySettings()
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
        call("setBookmarks", bookmarkPayload())
    }

    func removeAnnotation(_ id: UUID) {
        guard let a = annotations.first(where: { $0.id == id }) else { return }
        annotations.removeAll { $0.id == id }
        persistAnnotations()
        if a.kind == .highlight { call("removeHighlight", id.uuidString) } else { call("setBookmarks", bookmarkPayload()) }
        if tappedHighlight?.annotation.id == id { tappedHighlight = nil }
        if editingNote?.id == id { editingNote = nil }
    }

    /// Highlights the current selection; the page answers with `highlightAdded`, which stores it.
    func highlightSelection(color: HighlightColor, note: String = "") {
        guard selection != nil else { return }
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
        call("updateHighlight", ["id": id.uuidString, "color": color.rawValue, "note": annotations[i].note])
        if let tapped = tappedHighlight, tapped.annotation.id == id { tappedHighlight = (annotations[i], tapped.rect) }
    }

    func setNote(_ note: String, for id: UUID) {
        guard let i = annotations.firstIndex(where: { $0.id == id }) else { return }
        annotations[i].note = note
        annotations[i].updatedAt = Date()
        persistAnnotations()
        call("updateHighlight", ["id": id.uuidString, "color": annotations[i].color?.rawValue ?? "yellow", "note": note])
    }

    func clearSelection() {
        selection = nil
        call("clearSelection")
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
        call("search", query)
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
            if let last = lastPage, layout.mode == .paginated, p.page > last { pagesTurned += Int(p.page - last) }
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
            pointerY = CGFloat(m.double("y") ?? 0)
            refreshChrome()
            activity()
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
        guard isOpen, let locator = position.locator else { return }
        let finished: Bool? = position.atEnd && layout.total > 1 ? true : nil
        model.savePosition(ReadingPosition(locator: locator, percent: position.percent), for: book.id, finished: finished)
        if pagesTurned > 0 { model.recordReading(seconds: 0, pages: pagesTurned); pagesTurned = 0 }
    }

    /// PDFs: the PDF view reports pages directly.
    func pdfPageChanged(index: Int, count: Int) {
        guard count > 0 else { return }
        let percent = Double(index + 1) / Double(count) * 100
        position.percent = percent
        position.page = Double(index)
        position.total = Double(count)
        position.chapter = "Page \(index + 1) of \(count)"
        model.savePosition(ReadingPosition(pdfPage: index + 1, percent: percent), for: book.id, finished: index + 1 == count && count > 1 ? true : nil)
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
