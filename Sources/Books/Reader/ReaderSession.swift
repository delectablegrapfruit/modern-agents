import AppKit
import Observation
import SwiftUI
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

/// A place on a PDF's page as the presenters report it: see `ReadingPosition.pdfTop`.
struct PDFPlace: Equatable {
    var page: Int
    var top: Double?
    var left: Double?
}

/// The state of one book being read, and the bridge to the page that typesets it. Owns the web view, feeds it
/// settings, positions and annotations, and turns the page's messages into library records.
@MainActor
@Observable
final class ReaderSession {
    private(set) var book: Book
    unowned let model: LibraryModel
    /// How this book is viewed: its own choices, kept with it, over the reader settings.
    private(set) var view: BookView

    let webView: ReaderWebView
    private let schemeHandler = BooksSchemeHandler()
    private let messages = ReaderMessageHandler()
    private let navigation = ReaderNavigationDelegate()
    /// PDFs: the PDFKit presenter, created by the PDF view when it appears.
    @ObservationIgnored var pdf: (any PDFReading)?
    @ObservationIgnored private var pdfSections: [PDFSection] = []
    /// PDFs shown by PDFKit (Pages, Zoom & Split); as reflowed Text they go through the page script like a book.
    let usesPDFView: Bool
    /// Zoom & Split counts screens, not pages: the first screen showing each page, and the total at the end.
    private(set) var pdfPageStarts: [Int] = []
    /// Zoom & Split's footer text ("Page 3 of 120 · 2/4"); nil means the ordinary page count.
    private(set) var pdfPageLabel: String?
    /// Reflowing a PDF into text takes a moment; the reader shows a spinner meanwhile.
    private(set) var preparing = false
    @ObservationIgnored private var reflowReady = false
    /// The reflowed text's paragraphs and the places on the PDF's pages they came from: how a place is carried between
    /// Text and the page views.
    @ObservationIgnored private var reflowMap: PDFReflow.PageMap?
    @ObservationIgnored private var pendingFraction: Double?

    private(set) var isPageReady = false
    private(set) var isOpen = false
    private(set) var layout = ReaderLayoutInfo()
    private(set) var position = ReaderPosition()
    private(set) var toc: [ReaderTOCItem] = []
    private(set) var annotations: [Annotation]
    var selection: ReaderSelection? { didSet { presentMenu() } }
    var tappedHighlight: (annotation: Annotation, rect: CGRect)? { didSet { presentMenu() } }
    /// The highlight under the pointer in the page (for the context menu).
    var hoveredHighlight: (annotation: Annotation, rect: CGRect)?
    @ObservationIgnored private var menuPopover: NSPopover?
    @ObservationIgnored private var menuCloser: PopoverCloser?
    var editingNote: Annotation?
    /// The toolbar's popovers. In full screen their anchor is the floating bar, which shows while one is open: a
    /// shortcut brings the bar down with it, and the bar goes once the popover closes and the pointer has left.
    var showContents = false { didSet { if showContents != oldValue { refreshChrome() } } }
    var showSearch = false { didSet { if showSearch != oldValue { refreshChrome() } } }
    var showAppearance = false { didSet { if showAppearance != oldValue { refreshChrome() } } }
    /// The Contents popover's tab: 0 Contents, 1 Bookmarks, 2 Notes. The popover opens at Contents each time; kept
    /// here so that another tab can be chosen before it opens (the showcase does, for the notes).
    var contentsTab = 0
    var showEndCard = false
    var searchQuery = ""
    private(set) var searchResults: [SearchHit] = []
    private(set) var searchDone = true
    var error: String?
    /// Native chrome (footer, timeline) is shown while the pointer is near the bottom or the app is not full screen.
    private(set) var timelineVisible = false
    private(set) var footerVisible = true
    /// Full screen: the reader's own bar floating over the top of the book, shown while the pointer is near the
    /// top, over the bar itself, or a popover is open; and for a moment on entering full screen.
    private(set) var topBarVisible = false
    private var topBarHovered = false
    private var topBarRevealUntil = Date.distantPast
    var isFullScreen = false {
        didSet { if isFullScreen != oldValue, isFullScreen { topBarRevealUntil = Date().addingTimeInterval(ReaderSession.fullScreenReveal); topBarVisible = true } }
    }
    var timelineDragging = false { didSet { refreshChrome() } }
    var previewFraction: Double?

    private var pointerY: CGFloat = 0
    private var viewHeight: CGFloat = 800
    private var chromeTimer: Timer?
    private var cursorTimer: Timer?
    private var cursorMonitor: Any?
    /// A menu is open (a context menu, the menu bar): the pointer stays while it is.
    @ObservationIgnored private var menuTracking = false
    @ObservationIgnored private var menuObservers: [NSObjectProtocol] = []
    private var saveTask: Task<Void, Never>?
    private var readingTimer: Timer?
    private var lastActivity = Date()
    private var pagesTurned = 0
    private var lastPage: Double?
    /// Chapters read to their end since the last flush: a page turn from a chapter's last page into the next, or
    /// reaching the book's end.
    private var chaptersFinished = 0
    private var lastChapter: (index: Int, pagesLeft: Int)?
    private var endReached = false
    /// Whether the system is in Dark Mode: stored (and updated when it changes), so views that draw with the
    /// effective theme follow the switch as the page does.
    private var systemIsDark: Bool
    private var appearanceObserver: NSKeyValueObservation?

    private static var appIsDark: Bool { NSApp.effectiveAppearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua }

    init(book: Book, model: LibraryModel) {
        self.book = book
        self.model = model
        systemIsDark = ReaderSession.appIsDark
        view = book.view ?? BookView()
        usesPDFView = book.kind == .pdf && ReaderSession.pdfLayout(of: book, in: model.settings.reader) != .text
        // Records made before highlights were joined along their lines may hold a rectangle a word: joined now.
        let loaded = model.store.annotations(for: book.id)
        let joined = loaded.map(PDFPresenter.joinedRecord)
        annotations = joined
        if joined != loaded { model.store.saveAnnotations(joined, for: book.id) }
        schemeHandler.bookURL = model.store.fileURL(for: book)

        let configuration = WKWebViewConfiguration()
        configuration.setURLSchemeHandler(schemeHandler, forURLScheme: BooksSchemeHandler.scheme)
        configuration.userContentController.add(messages, name: "reader")
        configuration.preferences.isElementFullscreenEnabled = false
        configuration.suppressesIncrementalRendering = true
        // The page paints the book's theme from its first frame, instead of white until open() arrives.
        let initial = model.settings.reader.applying(book.view).webSettings(systemIsDark: ReaderSession.appIsDark)
        configuration.userContentController.addUserScript(WKUserScript(source: "window.__initialSettings = " + JSON.literal(initial) + ";", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        webView = ReaderWebView(frame: .zero, configuration: configuration)
        webView.underPageBackgroundColor = NSColor(Color(hex: model.settings.reader.effectiveTheme(systemIsDark: ReaderSession.appIsDark).colors.background))
        webView.allowsBackForwardNavigationGestures = false
        webView.allowsMagnification = false
        messages.onMessage = { [weak self] body in Task { @MainActor in self?.receive(JSON(body)) } }
        navigation.onFailure = { [weak self] message in Task { @MainActor in self?.error = message } }
        webView.navigationDelegate = navigation
        webView.session = self
        if !usesPDFView {
            if BooksSchemeHandler.readerDirectory == nil {
                error = "This copy of Books is missing its reader page (Contents/Resources/Reader). Reinstall the app."
            } else {
                webView.load(URLRequest(url: BooksSchemeHandler.pageURL))
            }
        }

        appearanceObserver = NSApp.observe(\.effectiveAppearance) { [weak self] _, _ in
            Task { @MainActor in self?.systemAppearanceChanged() }
        }
        startReadingTimer()
        if book.kind == .pdf, !usesPDFView { prepareReflow() }
        // Every mouse event in the app (over the page, the toolbar, a popover) restarts the pointer's countdown; a key
        // that moves through the book hides it at once.
        cursorMonitor = NSEvent.addLocalMonitorForEvents(matching: [.mouseMoved, .leftMouseDragged, .leftMouseDown, .rightMouseDown, .scrollWheel, .keyDown]) { [weak self] event in
            MainActor.assumeIsolated {
                if event.type == .keyDown { self?.keyPressed(event) } else { self?.armCursorHiding() }
            }
            return event
        }
        for (name, tracking) in [(NSMenu.didBeginTrackingNotification, true), (NSMenu.didEndTrackingNotification, false)] {
            menuObservers.append(NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated { self?.menuTrackingChanged(tracking) }
            })
        }
    }

    private func systemAppearanceChanged() {
        systemIsDark = ReaderSession.appIsDark
        applySettings()
    }

    // MARK: - PDFs as text

    /// Converts the PDF to a book once (cached next to it, with the map from its paragraphs to the pages) and opens
    /// that when the page is ready.
    private func prepareReflow() {
        let pdfURL = model.store.fileURL(for: book)
        var cache = PDFReflow.cacheURL(for: pdfURL)
        var mapURL = PDFReflow.mapURL(for: pdfURL)
        // Highlights, notes and bookmarks made in Text point into the converted text by chapter and offset. A PDF that
        // has them and was converted by an earlier converter keeps that conversion, so they stay on their words; the
        // newer converter is used for it only once the PDF itself changes.
        let legacy = PDFReflow.legacyURLs(for: pdfURL)
        let keepsLegacy = annotations.contains { $0.pdfText == true }
            && !FileManager.default.fileExists(atPath: cache.path)
            && FileManager.default.fileExists(atPath: legacy.epub.path)
        if keepsLegacy {
            cache = legacy.epub
            mapURL = legacy.map
        }
        let title = book.title, author = book.author
        preparing = true
        Task.detached(priority: .userInitiated) { [weak self, cache, mapURL] in
            var failure: String?
            let cachedDate = try? cache.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate
            let sourceDate = try? pdfURL.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate
            var converted = false
            if let cachedDate, let sourceDate, cachedDate >= sourceDate { converted = true }
            // A kept earlier conversion is never given a map made by the newer converter, whose chapters differ.
            let needsMap = !FileManager.default.fileExists(atPath: mapURL.path) && !(keepsLegacy && converted)
            if !converted || needsMap {
                do {
                    let made = try PDFReflow.convert(from: pdfURL, title: title, author: author)
                    if let data = try? JSONEncoder().encode(made.map) { try? data.write(to: mapURL, options: .atomic) }
                    // A book converted before keeps its file (highlights made in it point into its text) and only
                    // gains the map.
                    if !converted { try made.epub.write(to: cache, options: .atomic) }
                } catch {
                    if !converted { failure = "\(error)" }
                }
            }
            let map = (try? Data(contentsOf: mapURL)).flatMap { try? JSONDecoder().decode(PDFReflow.PageMap.self, from: $0) }
            let outcome = failure
            await MainActor.run { [weak self] in self?.reflowPrepared(cache: cache, map: map, failure: outcome) }
        }
    }

    private func reflowPrepared(cache: URL, map: PDFReflow.PageMap?, failure: String?) {
        preparing = false
        if let failure {
            // Back to whole pages, with the reason; the library's alert outlives this reader.
            setView { $0.pdfLayout = .pages }
            model.error = failure
            model.reopen(book)
            return
        }
        schemeHandler.bookURL = cache
        reflowMap = map
        reflowReady = true
        if isPageReady { openBook() }
    }

    /// Pages, Zoom & Split or Text: the book reopens the chosen way.
    func setPDFLayout(_ layout: PDFLayout) {
        // The place goes with the book into the other view: saved now, not when this reader is torn down, which may
        // come after the book has already opened again.
        flushPosition()
        setView { $0.pdfLayout = layout }
        model.reopen(book)
    }

    /// The reader settings with this book's own choices over them.
    var reader: ReaderSettings { model.settings.reader.applying(view) }

    /// The way a PDF is shown: the book's own choice, else the reader setting.
    static func pdfLayout(of book: Book, in settings: ReaderSettings) -> PDFLayout { book.view?.pdfLayout ?? settings.pdfLayout }

    var pdfLayout: PDFLayout { ReaderSession.pdfLayout(of: book, in: model.settings.reader) }

    /// Changes how this book is viewed and keeps the choice with the book (over the record as the store has it, so
    /// a place saved meanwhile is not lost).
    func setView(_ change: (inout BookView) -> Void) {
        change(&view)
        var updated = model.book(book.id) ?? book
        updated.view = view.isEmpty ? nil : view
        book.view = updated.view
        model.update(updated)
    }

    /// A PDF's annotations belong to the way it was read: page places for the PDF view, text places for the reflow.
    private var modeAnnotations: [Annotation] {
        guard book.kind == .pdf else { return annotations }
        return annotations.filter { ($0.pdfText ?? false) == !usesPDFView }
    }

    func teardown() {
        flushPosition()
        pdf?.close()
        pdf = nil
        readingTimer?.invalidate()
        chromeTimer?.invalidate()
        cursorTimer?.invalidate()
        if let cursorMonitor { NSEvent.removeMonitor(cursorMonitor) }
        cursorMonitor = nil
        for observer in menuObservers { NotificationCenter.default.removeObserver(observer) }
        menuObservers = []
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
        for a in modeAnnotations where a.kind == .highlight {
            highlights.append(["id": a.id.uuidString, "locator": ["spine": a.locator.spine, "start": a.locator.offset, "end": a.endOffset ?? a.locator.offset], "color": a.color?.rawValue ?? "yellow", "note": a.note])
        }
        var arguments: [String: Any] = [
            "url": BooksSchemeHandler.bookURLString,
            "settings": reader.webSettings(systemIsDark: systemIsDark),
            "bookmarks": bookmarkPayload(),
            "highlights": highlights,
        ]
        arguments["locator"] = NSNull()
        if let saved = book.position, !(book.isFinished && saved.percent >= 100) {
            if book.kind == .pdf, let pdfPage = saved.pdfPage, saved.pdfLayout != .text {
                // A place on the PDF's pages (it was read as Pages or Zoom & Split last), not a place in this text: the
                // paragraph that came from it, as far along as the place was down it. Without the map, the share of the
                // pages before it; the saved share counts to the end of the spread shown, a page or two on.
                if let locator = reflowMap?.locator(page: pdfPage - 1, top: saved.pdfTop, left: saved.pdfLeft) {
                    arguments["locator"] = ["spine": locator.spine, "offset": locator.offset]
                } else if let pages = book.pageCount, pages > 1 {
                    pendingFraction = min(1, Double(max(0, pdfPage - 1)) / Double(pages - 1))
                } else {
                    pendingFraction = saved.percent / 100
                }
            } else if let locator = saved.locator {
                arguments["locator"] = ["spine": locator.spine, "offset": locator.offset]
            }
        }
        call("open", arguments)
    }

    private func bookmarkPayload() -> [[String: Any]] {
        modeAnnotations.filter { $0.kind == .bookmark }.map { ["id": $0.id.uuidString, "locator": ["spine": $0.locator.spine, "offset": $0.locator.offset]] }
    }

    func applySettings() {
        if usesPDFView { pdf?.applySettings(); return }
        guard isOpen else { return }
        call("applySettings", reader.webSettings(systemIsDark: systemIsDark))
    }

    func next() { if usesPDFView { pdf?.next() } else { call("next") }; activity() }
    func previous() { if usesPDFView { pdf?.previous() } else { call("prev") }; activity() }
    func nextChapter() { if usesPDFView { pdf?.nextSection() } else { call("nextChapter") }; activity() }
    func previousChapter() { if usesPDFView { pdf?.previousSection() } else { call("prevChapter") }; activity() }
    func goToFraction(_ fraction: Double) {
        let f = min(1, max(0, fraction))
        if usesPDFView { pdf?.go(toFraction: f) } else { call("goToFraction", f) }
        activity()
    }
    func goToPos(_ pos: Double) { if usesPDFView { pdf?.go(toUnit: whole(pos)) } else { call("goToPos", pos) }; activity() }
    func goToHref(_ href: String) {
        if usesPDFView { if let page = Int(href) { pdf?.go(toPage: page, slice: 0) } } else { call("goToHref", href) }
        activity()
    }
    func goToLocator(_ locator: Locator) {
        if usesPDFView { pdf?.go(toPage: locator.spine, slice: locator.offset) } else { call("goToLocator", ["spine": locator.spine, "offset": locator.offset]) }
        activity()
    }
    /// A contents entry: a document and fragment in a book, a page in a PDF.
    func open(_ item: ReaderTOCItem) { if usesPDFView { pdf?.go(toPage: item.spine, slice: 0) } else { goToHref(item.href) } }
    /// A search result: the page script scrolls to the locator; the PDF view selects the match.
    func open(_ hit: SearchHit) { if usesPDFView { pdf?.show(hit) } else { goToLocator(hit.locator) } }

    /// ⌘+ and ⌘−: text size for books, zoom for PDFs.
    func changeFontSize(by delta: Int) {
        if usesPDFView { pdf?.zoom(delta > 0 ? 1 : -1); return }
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
        let settings = reader
        // AppKit reports scrolling down and to the right as negative deltas, in lines for notched wheels.
        let vertical = event.scrollingDeltaY != 0 ? event.scrollingDeltaY : event.deltaY
        let horizontal = event.scrollingDeltaX != 0 ? event.scrollingDeltaX : event.deltaX
        let sideways = abs(horizontal) > abs(vertical) || (event.modifierFlags.contains(.shift) && horizontal == 0)
        if layout.mode == .scroll {
            if sideways {
                // A tilt of the wheel or ⇧ + wheel moves a screen (a page, in a PDF) at a time, as it does in pages.
                guard settings.wheelTurnsPages, settings.wheelHorizontal else { return true }
                var delta = horizontal != 0 ? horizontal : vertical
                if settings.wheelInvert { delta = -delta }
                if delta < 0 { next() } else if delta > 0 { previous() }
                return true
            }
            if usesPDFView { return false }   // PDFKit scrolls its own pages
            if vertical != 0 { call("scrollBy", -vertical * 40) }   // 40 points a line, as WebKit scrolls
            return true
        }
        guard settings.wheelTurnsPages else { return true }
        if usesPDFView, pdf?.canScroll(dx: horizontal, dy: vertical) == true { return false }   // a zoomed page scrolls before it turns
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
        let host: NSView
        if usesPDFView, let pdfView = pdf?.hostView { host = pdfView } else { host = webView }
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
            annotations.append(Annotation(kind: .bookmark, locator: locator, text: "", chapter: position.chapter, pdfText: textFlag))
        } else {
            return
        }
        persistAnnotations()
        syncBookmarks()
    }

    private func syncBookmarks() {
        if usesPDFView { refreshPDFMarks() } else { call("setBookmarks", bookmarkPayload()) }
    }

    func removeAnnotation(_ id: UUID) {
        guard let a = annotations.first(where: { $0.id == id }) else { return }
        annotations.removeAll { $0.id == id }
        persistAnnotations()
        if a.kind == .highlight {
            if usesPDFView { pdf?.removeHighlight(id) } else { call("removeHighlight", id.uuidString) }
        } else {
            syncBookmarks()
        }
        if tappedHighlight?.annotation.id == id { tappedHighlight = nil }
        if editingNote?.id == id { editingNote = nil }
    }

    /// Highlights the current selection; the page answers with `highlightAdded`, which stores it.
    func highlightSelection(color: HighlightColor, note: String = "") {
        guard selection != nil else { return }
        if usesPDFView {
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
        if usesPDFView { pdf?.recolor(id) } else { call("updateHighlight", ["id": id.uuidString, "color": color.rawValue, "note": annotations[i].note]) }
        if let tapped = tappedHighlight, tapped.annotation.id == id { tappedHighlight = (annotations[i], tapped.rect) }
    }

    /// A context menu's items for a highlight: its note, and its removal.
    func menuItems(forHighlight record: Annotation) -> [NSMenuItem] {
        var items: [NSMenuItem] = []
        items.append(ClosureMenuItem(record.note.isEmpty ? "Add Note…" : "Edit Note…") { [weak self] in
            self?.tappedHighlight = nil
            self?.editingNote = self?.annotations.first { $0.id == record.id }
        })
        if !record.note.isEmpty {
            items.append(ClosureMenuItem("Remove Note") { [weak self] in self?.setNote("", for: record.id) })
        }
        items.append(ClosureMenuItem(record.color == .underline ? "Remove Underline" : "Remove Highlight") { [weak self] in self?.removeAnnotation(record.id) })
        return items
    }

    /// A context menu's items for selected text in a PDF: what the highlight menu offers, as menu items.
    func menuItemsForSelection() -> [NSMenuItem] {
        guard let sel = selection else { return [] }
        var items: [NSMenuItem] = []
        items.append(ClosureMenuItem("Highlight") { [weak self] in self?.highlightSelection(color: .yellow) })
        items.append(ClosureMenuItem("Underline") { [weak self] in self?.highlightSelection(color: .underline) })
        items.append(ClosureMenuItem("Add Note…") { [weak self] in self?.pendingNoteAfterHighlight = true; self?.highlightSelection(color: .yellow) })
        items.append(.separator())
        items.append(ClosureMenuItem("Copy") { NSPasteboard.general.clearContents(); NSPasteboard.general.setString(sel.text, forType: .string) })
        items.append(ClosureMenuItem("Look Up") { [weak self] in self?.lookUpSelection() })
        return items
    }

    func setNote(_ note: String, for id: UUID) {
        guard let i = annotations.firstIndex(where: { $0.id == id }) else { return }
        annotations[i].note = note
        annotations[i].updatedAt = Date()
        persistAnnotations()
        if usesPDFView { pdf?.setNote(note, for: id) } else { call("updateHighlight", ["id": id.uuidString, "color": annotations[i].color?.rawValue ?? "yellow", "note": note]) }
    }

    func clearSelection() {
        selection = nil
        if usesPDFView { pdf?.clearSelection() } else { call("clearSelection") }
    }

    /// The highlight menu beside the words it concerns — above them, or below when there is no room above — and
    /// gone when the selection or the tapped highlight is.
    private func presentMenu() {
        let target: (rect: CGRect, existing: Annotation?)? = tappedHighlight.map { ($0.rect, $0.annotation) } ?? selection.map { ($0.rect, nil) }
        guard let target else {
            if let open = menuPopover { menuPopover = nil; open.performClose(nil) }
            return
        }
        let host: NSView = usesPDFView ? (pdf?.hostView ?? webView) : webView
        guard host.window != nil, host.bounds.width > 0, host.bounds.height > 0 else { return }
        // The rects arrive with the origin at the top left; the host may count from the bottom.
        let y = host.isFlipped ? target.rect.minY : host.bounds.height - target.rect.maxY
        var anchor = NSRect(x: target.rect.minX, y: y, width: max(target.rect.width, 2), height: max(target.rect.height, 2)).intersection(host.bounds)
        if anchor.isNull || anchor.isEmpty {
            anchor = NSRect(x: min(max(0, target.rect.minX), host.bounds.width - 2), y: min(max(0, y), host.bounds.height - 2), width: 2, height: 2)
        }
        let popover = NSPopover()
        popover.behavior = .transient
        popover.animates = false
        let closer = PopoverCloser { [weak self, weak popover] in
            guard let self, self.menuPopover === popover else { return }
            self.menuPopover = nil
            if self.tappedHighlight != nil { self.tappedHighlight = nil } else if self.selection != nil { self.clearSelection() }
        }
        popover.delegate = closer
        // The menu is laid out at its own size: a hosting view given a narrow width had wrapped the words letter by letter.
        let hosting = NSHostingController(rootView: HighlightMenu(session: self, existing: target.existing))
        hosting.sizingOptions = [.preferredContentSize]
        popover.contentViewController = hosting
        let size = hosting.view.fittingSize
        if size.width > 0, size.height > 0 { popover.contentSize = size }
        let previous = menuPopover
        menuPopover = popover
        menuCloser = closer
        previous?.performClose(nil)
        popover.show(relativeTo: anchor, of: host, preferredEdge: host.isFlipped ? .minY : .maxY)
    }

    private func persistAnnotations() {
        model.store.saveAnnotations(annotations, for: book.id)
    }

    var highlights: [Annotation] { modeAnnotations.filter { $0.kind == .highlight }.sorted { ($0.locator.spine, $0.locator.offset) < ($1.locator.spine, $1.locator.offset) } }
    var bookmarks: [Annotation] { modeAnnotations.filter { $0.kind == .bookmark }.sorted { ($0.locator.spine, $0.locator.offset) < ($1.locator.spine, $1.locator.offset) } }
    /// Text places in a reflowed PDF are marked so the PDF view does not mistake them for pages.
    private var textFlag: Bool? { book.kind == .pdf && !usesPDFView ? true : nil }

    // MARK: - Search

    func search(_ query: String) {
        searchQuery = query
        searchResults = []
        searchDone = query.trimmingCharacters(in: .whitespaces).isEmpty
        if usesPDFView { pdf?.search(query) } else { call("search", query) }
    }

    // MARK: - Messages from the page

    private func receive(_ m: JSON) {
        switch m.string("type") ?? "" {
        case "ready":
            isPageReady = true
            if book.kind != .pdf || reflowReady { openBook() }
        case "opened":
            isOpen = true
            toc = m.array("toc").map { ReaderTOCItem(label: $0.string("label") ?? "", href: $0.string("href") ?? "", level: $0.int("level") ?? 0, pos: $0.double("pos") ?? 0, spine: $0.int("spine") ?? 0) }
            updateLayout(m)
            if let fraction = pendingFraction {
                pendingFraction = nil
                goToFraction(fraction)
            }
        case "layout":
            updateLayout(m)
            // A relayout (text size, width, spread, window…) renumbers the pages: the jump in `page` that the position
            // report after it carries is not pages read.
            lastPage = nil
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
            countChapter(p)
            position = p
            schedulePositionSave()
        case "end":
            guard layout.total > 1 else { return }   // a book that measured one page has a layout problem, not an ending
            showEndCard = true
            model.savePosition(textPosition(position.locator, percent: 100), for: book.id, finished: true)
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
        case "highlightHover":
            if let id = m.string("id").flatMap(UUID.init(uuidString:)), let a = annotations.first(where: { $0.id == id }) {
                hoveredHighlight = (a, m.rect("rect") ?? .zero)
            } else {
                hoveredHighlight = nil
            }
        case "highlightAdded":
            guard let id = m.string("id").flatMap(UUID.init(uuidString:)), let o = m.object("locator"), let spine = o.int("spine") else { return }
            let color = HighlightColor(rawValue: m.string("color") ?? "yellow") ?? .yellow
            let annotation = Annotation(id: id, kind: .highlight, locator: Locator(spine: spine, offset: o.int("start") ?? 0), endOffset: o.int("end"), color: color, text: m.string("text") ?? "", note: pendingHighlight.removeValue(forKey: id) ?? m.string("note") ?? "", chapter: m.string("chapter") ?? position.chapter, pdfText: textFlag)
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

    /// A chapter counts as read when the reader moves from its last page into the next chapter, and the last one
    /// when the book's end is reached.
    private func countChapter(_ p: ReaderPosition) {
        if let last = lastChapter, p.chapterIndex == last.index + 1, last.pagesLeft <= 1 { chaptersFinished += 1 }
        if p.atEnd, !endReached, lastPage != nil { chaptersFinished += 1; endReached = true }
        lastChapter = (p.chapterIndex, p.pagesLeftInChapter)
    }

    func flushPosition() {
        // PDF views save as their place changes; this catches what does not report on its own (a zoomed page scrolled).
        if usesPDFView, isOpen { pdf?.savePlace() }
        if pagesTurned > 0 || chaptersFinished > 0 {
            model.recordReading(seconds: 0, pages: pagesTurned, chapters: chaptersFinished, in: book.id)
            pagesTurned = 0
            chaptersFinished = 0
        }
        guard !usesPDFView, isOpen, let locator = position.locator else { return }
        let finished: Bool? = position.atEnd && layout.total > 1 ? true : nil
        model.savePosition(textPosition(locator, percent: position.percent), for: book.id, finished: finished)
    }

    /// A place in the text as the library keeps it; for a PDF read as text, with the page and the point on it that its
    /// paragraph came from, so Pages and Zoom & Split open where the text was left.
    private func textPosition(_ locator: Locator?, percent: Double) -> ReadingPosition {
        var saved = ReadingPosition(locator: locator, percent: percent)
        guard book.kind == .pdf else { return saved }
        saved.pdfLayout = .text
        if let locator, let place = reflowMap?.place(of: locator) {
            saved.pdfPage = place.page + 1
            saved.pdfTop = place.top
            saved.pdfLeft = place.left
        }
        return saved
    }

    // MARK: - PDFs (the presenter reports what the page script reports for books)

    /// The screen (unit) where a place on a page is: its first screen, plus the offset within the page.
    func pdfUnit(page: Int, offset: Int) -> Int {
        guard pdfPageStarts.count >= 2 else { return max(0, page + offset) }
        let p = min(max(0, page), pdfPageStarts.count - 2)
        let next = p + 1 < pdfPageStarts.count - 1 ? pdfPageStarts[p + 1] : pdfPageStarts[pdfPageStarts.count - 1]
        return min(pdfPageStarts[p] + max(0, offset), max(pdfPageStarts[p], next - 1))
    }

    /// The first page a screen shows.
    func pdfPage(forUnit unit: Int) -> Int {
        guard pdfPageStarts.count >= 2 else { return max(0, unit) }
        var lo = 0, hi = pdfPageStarts.count - 2
        while lo < hi {
            let mid = (lo + hi) / 2
            if pdfPageStarts[mid + 1] > unit { hi = mid } else { lo = mid + 1 }
        }
        return lo
    }

    /// Zoom & Split prepares its screens off the main thread; the reader shows a spinner meanwhile.
    func pdfPreparing(_ flag: Bool) { preparing = flag }

    func pdfOpened(units: Int, pageStarts: [Int], sections: [PDFSection], columns: Int) {
        // Screens are counted afresh (a relayout deals them out again): the next report is no turn of pages.
        lastPage = nil
        pdfSections = sections
        pdfPageStarts = pageStarts.count >= 2 ? pageStarts : Array(0...max(1, units))
        toc = sections.map { ReaderTOCItem(label: $0.label, href: String($0.page), level: $0.level, pos: Double(pdfUnit(page: $0.page, offset: 0)), spine: $0.page) }
        var l = ReaderLayoutInfo()
        l.mode = .paginated
        l.total = Double(max(1, units))
        l.columns = columns
        l.chapters = sections.map { TimelineMark(label: $0.label, pos: Double(pdfUnit(page: $0.page, offset: 0)), level: $0.level) }
        layout = l
        isOpen = true
        refreshPDFMarks()
    }

    func pdfLayoutChanged(columns: Int, mode: ReaderLayoutInfo.Mode) {
        layout.mode = mode
        layout.columns = columns
        // A new spread moves the unit shown to the left page of the reader's spread: that is no page read.
        lastPage = nil
    }

    /// The presenter's place: a unit is a page, or a screen of a page in Zoom & Split. `place` is where on which page
    /// the reader is, whatever the layout (after a relayout it may lie past the left screen): what reopening, at any
    /// size or in another way of showing the PDF, goes back to.
    func pdfPositionChanged(unit: Int, units: Int, page: Int, slice: Int, label: String?, place: PDFPlace? = nil) {
        guard units > 0 else { return }
        let shown = min(unit + max(1, layout.columns), units)
        let percent = Double(shown) / Double(units) * 100
        var p = position
        p.page = Double(unit)
        p.total = Double(units)
        p.percent = percent
        p.locator = Locator(spine: page, offset: slice)
        let section = pdfSections.last { $0.page <= page }
        p.chapter = section?.label ?? ""
        p.chapterIndex = section.flatMap { pdfSections.firstIndex(of: $0) } ?? 0
        let nextStart = (pdfSections.first { $0.page > page }?.page).map { pdfUnit(page: $0, offset: 0) } ?? units
        p.pagesLeftInChapter = max(0, nextStart - shown)
        p.atEnd = shown >= units
        p.bookmarkID = bookmarks.first { $0.locator.spine == page && $0.locator.offset == slice }?.id
        if let last = lastPage, Double(unit) > last { pagesTurned += unit - whole(last) }
        lastPage = Double(unit)
        countChapter(p)
        position = p
        pdfPageLabel = label
        var at = place ?? PDFPlace(page: page, top: nil, left: nil)
        // JSONEncoder refuses a non-finite number, and with it every later save of the catalog: such a point is the top.
        if !(at.top?.isFinite ?? true) || !(at.left?.isFinite ?? true) { at.top = nil; at.left = nil }
        // Which view saved the place: the presenter's own kind, not the book's setting, which a switch changes before
        // the old view is torn down.
        let shownAs: PDFLayout
        if let presenter = pdf, presenter is SplitPDFPresenter { shownAs = .fit } else { shownAs = .pages }
        let saved = ReadingPosition(locator: Locator(spine: page, offset: slice), pdfPage: at.page + 1, pdfTop: at.top, pdfLeft: at.left,
                                    pdfLayout: shownAs, percent: percent)
        model.savePosition(saved, for: book.id, finished: p.atEnd && units > 1 ? true : nil)
        activity()
    }

    private func refreshPDFMarks() {
        layout.bookmarks = bookmarks.map { TimelineMark(label: $0.id.uuidString, pos: Double(pdfUnit(page: $0.locator.spine, offset: $0.locator.offset)), level: 0) }
        if let locator = position.locator {
            position.bookmarkID = bookmarks.first { $0.locator.spine == locator.spine && $0.locator.offset == locator.offset }?.id
        }
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

    // MARK: - Pointer

    /// How far up from the bottom of the book the footer and the timeline reach, and down from the top the floating
    /// bar in full screen: the pointer there brings them up, and is not hidden over them.
    private static let bottomChromeReach: CGFloat = 120
    private static let topChromeReach: CGFloat = 96
    /// On entering full screen the floating bar stays a little longer than the idle time, so it is noticed.
    private static let fullScreenReveal: TimeInterval = 2.5

    /// The pointer hides after `Design.Motion.idle` still over the book (the time full screen's chrome takes to go)
    /// and comes back the moment it moves, like a film's, so nothing sits on the text while reading. Each mouse event
    /// moves the countdown on rather than making a new timer.
    private func armCursorHiding() {
        if let timer = cursorTimer, timer.isValid {
            timer.fireDate = Date().addingTimeInterval(Design.Motion.idle)
            return
        }
        cursorTimer = Timer.scheduledTimer(withTimeInterval: Design.Motion.idle, repeats: false) { [weak self] _ in
            Task { @MainActor in self?.hideCursorNow() }
        }
    }

    /// Hides the pointer until it moves, unless something needs it: when the countdown ends, and at once when a key
    /// turns the page, as macOS hides it while typing.
    func hideCursorNow() {
        guard pointerMayHide else { return }
        NSCursor.setHiddenUntilMouseMoves(true)
    }

    /// Whether the pointer may go: the book is up and nothing is open over it (a popover, the highlight menu, a
    /// selection, a note, a menu), the window is key and the app active, and the pointer rests on the book itself,
    /// not on the toolbar, the floating bar, the footer and timeline, or another window such as a popover.
    private var pointerMayHide: Bool {
        guard isOpen, !showContents, !showSearch, !showAppearance, !showEndCard, !timelineDragging, !preparing, !menuTracking, !topBarHovered,
              selection == nil, tappedHighlight == nil, editingNote == nil, menuPopover == nil else { return false }
        let host: NSView = usesPDFView ? (pdf?.hostView ?? webView) : webView
        guard let window = host.window, window.isKeyWindow, NSApp.isActive else { return false }
        guard NSWindow.windowNumber(at: NSEvent.mouseLocation, belowWindowWithWindowNumber: 0) == window.windowNumber else { return false }
        // Below the title bar and toolbar, whether or not the book's view reaches up under them.
        let inWindow = window.mouseLocationOutsideOfEventStream
        guard window.contentLayoutRect.contains(inWindow) else { return false }
        let location = host.convert(inWindow, from: nil)
        guard host.bounds.contains(location) else { return false }
        let fromTop = host.isFlipped ? location.y : host.bounds.height - location.y
        if fromTop > host.bounds.height - ReaderSession.bottomChromeReach { return false }
        if isFullScreen, topBarVisible, fromTop < ReaderSession.topChromeReach { return false }
        return true
    }

    /// A key that moves through the book (an arrow, Space, Page Up or Down, Home or End, without ⌘ or ⌃) is reading,
    /// not pointing: the pointer goes at once. Keys typed into a field leave it be.
    private func keyPressed(_ event: NSEvent) {
        guard event.modifierFlags.intersection([.command, .control]).isEmpty, (NSApp.keyWindow?.firstResponder as? NSText) == nil,
              let scalar = event.charactersIgnoringModifiers?.unicodeScalars.first else { return }
        switch Int(scalar.value) {
        case NSRightArrowFunctionKey, NSLeftArrowFunctionKey, NSDownArrowFunctionKey, NSUpArrowFunctionKey,
             NSPageDownFunctionKey, NSPageUpFunctionKey, NSHomeFunctionKey, NSEndFunctionKey, 32:
            hideCursorNow()
        default:
            break
        }
    }

    /// While a menu is open the pointer stays; once it closes, the countdown starts afresh.
    private func menuTrackingChanged(_ tracking: Bool) {
        menuTracking = tracking
        if !tracking { armCursorHiding() }
    }

    func pointerMoved(y: CGFloat) {
        pointerY = y
        armCursorHiding()
        refreshChrome()
        activity()
    }

    private func startReadingTimer() {
        readingTimer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self, NSApp.isActive, Date().timeIntervalSince(self.lastActivity) < 120 else { return }
                self.model.recordReading(seconds: 30, in: self.book.id)
            }
        }
    }

    func activity() { lastActivity = Date() }

    // MARK: - Chrome

    func viewResized(height: CGFloat) { viewHeight = height; refreshChrome() }

    func refreshChrome() {
        let nearBottom = pointerY > viewHeight - ReaderSession.bottomChromeReach
        let nearTop = pointerY < ReaderSession.topChromeReach || topBarHovered || Date() < topBarRevealUntil
        let popoverOpen = showContents || showSearch || showAppearance
        timelineVisible = nearBottom || timelineDragging
        chromeTimer?.invalidate()
        if isFullScreen {
            footerVisible = nearBottom || timelineDragging || popoverOpen
            topBarVisible = nearTop || popoverOpen
            if !footerVisible && !topBarVisible { return }
            // The chrome goes after the pointer's idle time; the bar shown on entering full screen stays its whole reveal.
            let delay = max(Design.Motion.idle, topBarRevealUntil.timeIntervalSinceNow)
            chromeTimer = Timer.scheduledTimer(withTimeInterval: delay, repeats: false) { [weak self] _ in
                Task { @MainActor in self?.chromeIdle() }
            }
        } else {
            footerVisible = true
            topBarVisible = false
        }
    }

    /// Full screen's chrome goes when the idle time is up, where the pointer has left it and nothing holds it open.
    private func chromeIdle() {
        guard !timelineDragging else { return }
        let open = showContents || showSearch || showAppearance
        if !(pointerY > viewHeight - ReaderSession.bottomChromeReach), !open {
            footerVisible = false
            timelineVisible = false
        }
        if !(pointerY < ReaderSession.topChromeReach), !topBarHovered, !open, Date() >= topBarRevealUntil { topBarVisible = false }
    }

    /// The pointer over the floating bar keeps it: the book beneath sees no movement then.
    func topBarHover(_ inside: Bool) {
        topBarHovered = inside
        if inside { topBarVisible = true; chromeTimer?.invalidate() } else { refreshChrome() }
    }

    func close() {
        flushPosition()
        model.closeReader()
    }
}

/// Tells the session when a popover it showed has closed.
final class PopoverCloser: NSObject, NSPopoverDelegate {
    private let onClose: () -> Void
    init(onClose: @escaping () -> Void) { self.onClose = onClose }
    func popoverDidClose(_ notification: Notification) { onClose() }
}
