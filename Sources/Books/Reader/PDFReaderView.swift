import AppKit
import PDFKit
import SwiftUI
import BooksCore

/// Hosts the PDF presenter's view. The presenter is kept by the session so commands, search and annotations reach
/// it the same way they reach the page script for a book.
struct PDFReaderView: NSViewRepresentable {
    let session: ReaderSession

    func makeNSView(context: Context) -> BooksPDFView {
        let presenter = session.pdf ?? PDFPresenter(session: session)
        session.pdf = presenter
        presenter.open()
        DispatchQueue.main.async { presenter.view.window?.makeFirstResponder(presenter.view) }
        return presenter.view
    }

    func updateNSView(_ view: BooksPDFView, context: Context) {}
}

/// An outline entry of a PDF: the page it starts on.
struct PDFSection: Hashable {
    let label: String
    let page: Int
    let level: Int
}

/// Draws pages with the reader theme laid over them: light themes tint the paper, dark themes invert the page and
/// lift the black to the theme's page colour. Pictures come out inverted in the dark themes, which is what reading
/// a PDF at night usually wants.
final class ThemedPDFPage: PDFPage {
    static var theme: Theme = .original

    override func draw(with box: PDFDisplayBox, to context: CGContext) {
        super.draw(with: box, to: context)
        let theme = ThemedPDFPage.theme
        guard theme != .original, theme != .bold else { return }
        let page = bounds(for: box)
        let cover = page.insetBy(dx: -page.width, dy: -page.height)
        context.saveGState()
        if theme.isDark {
            context.setBlendMode(.difference)
            context.setFillColor(CGColor(gray: 1, alpha: 1))
            context.fill(cover)
            context.setBlendMode(.screen)
            context.setFillColor(ThemedPDFPage.cgColor(theme.colors.background))
            context.fill(cover)
        } else {
            context.setBlendMode(.multiply)
            context.setFillColor(ThemedPDFPage.cgColor(theme.colors.background))
            context.fill(cover)
        }
        context.restoreGState()
    }

    static func cgColor(_ hex: String) -> CGColor {
        NSColor(Color(hex: hex)).usingColorSpace(.sRGB)?.cgColor ?? CGColor(gray: 1, alpha: 1)
    }
}

/// Tells the document to make its pages themed.
final class ThemedPageProvider: NSObject, PDFDocumentDelegate {
    func classForPage() -> AnyClass { ThemedPDFPage.self }
}

/// PDFKit's view with the reader's input: notched wheels go to the session (one notch, one page), the pointer
/// position drives the chrome, and the end of a click opens the reader's menus over a selection or a highlight.
final class BooksPDFView: PDFView {
    weak var presenter: PDFPresenter?
    private var trackingArea: NSTrackingArea?

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let trackingArea { removeTrackingArea(trackingArea) }
        let area = NSTrackingArea(rect: .zero, options: [.mouseMoved, .activeInKeyWindow, .inVisibleRect], owner: self, userInfo: nil)
        addTrackingArea(area)
        trackingArea = area
    }

    override func mouseMoved(with event: NSEvent) {
        super.mouseMoved(with: event)
        presenter?.pointerMoved(to: convert(event.locationInWindow, from: nil))
    }

    override func scrollWheel(with event: NSEvent) {
        if presenter?.session.handleWheel(event) == true { return }
        super.scrollWheel(with: event)
    }

    override func mouseUp(with event: NSEvent) {
        super.mouseUp(with: event)
        presenter?.mouseUp(at: convert(event.locationInWindow, from: nil))
    }

    override func layout() {
        super.layout()
        presenter?.viewResized()
    }
}

/// Everything the reader needs from a PDF: PDFKit's view with the reader's behaviours around it — themes, the
/// paginated and scrolling layouts, the outline as contents and timeline marks, search, bookmarks by page and
/// highlights kept as annotations. Reports to the session the way the page script does for books.
@MainActor
final class PDFPresenter {
    let view = BooksPDFView()
    unowned let session: ReaderSession
    private(set) var document: PDFDocument?
    private let pageProvider = ThemedPageProvider()
    private var observers: [NSObjectProtocol] = []
    private var sections: [PDFSection] = []
    private var hits: [UUID: PDFSelection] = [:]
    private var pendingSelection: PDFSelection?
    private var zoomFactor: CGFloat = 1
    private var lastSize: CGSize = .zero
    private var opened = false

    init(session: ReaderSession) {
        self.session = session
        view.presenter = self
        view.autoScales = true
        view.pageBreakMargins = NSEdgeInsets(top: 10, left: 0, bottom: 10, right: 0)
        view.pageShadowsEnabled = true
        view.enableDataDetectors = false
        view.interpolationQuality = .high
    }

    private var settings: ReaderSettings { session.model.settings.reader }
    private var mode: ReaderLayoutInfo.Mode { settings.layout == .scroll ? .scroll : .paginated }
    private var columns: Int {
        guard mode == .paginated else { return 1 }
        switch settings.spread {
        case .two: return 2
        case .one: return 1
        case .auto: return view.bounds.width >= 1000 ? 2 : 1
        }
    }
    var pageCount: Int { document?.pageCount ?? 0 }
    var currentIndex: Int {
        guard let document, let page = view.currentPage else { return 0 }
        return document.index(for: page)
    }

    // MARK: - Opening

    func open() {
        guard !opened else { return }
        opened = true
        let url = session.model.store.fileURL(for: session.book)
        guard let document = PDFDocument(url: url) else {
            session.error = "This PDF could not be opened."
            return
        }
        document.delegate = pageProvider
        self.document = document
        sections = PDFPresenter.sections(of: document)
        applyTheme()
        view.document = document
        applyLayout()
        restoreHighlights()
        observe()
        session.pdfOpened(pageCount: document.pageCount, sections: sections, columns: columns, mode: mode)
        if let saved = session.book.position?.pdfPage, saved > 1, let page = document.page(at: saved - 1) {
            view.go(to: page)
        }
        pageChanged()
    }

    func close() {
        for observer in observers { NotificationCenter.default.removeObserver(observer) }
        observers = []
    }

    private func observe() {
        let center = NotificationCenter.default
        observers.append(center.addObserver(forName: .PDFViewPageChanged, object: view, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.pageChanged() }
        })
        observers.append(center.addObserver(forName: .PDFViewDisplayModeChanged, object: view, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.pageChanged() }
        })
    }

    private func pageChanged() {
        guard let document else { return }
        session.pdfPageChanged(index: currentIndex, count: document.pageCount)
    }

    /// The outline, flattened, in page order.
    private static func sections(of document: PDFDocument) -> [PDFSection] {
        var out: [(section: PDFSection, order: Int)] = []
        func walk(_ node: PDFOutline, level: Int) {
            for i in 0..<node.numberOfChildren {
                guard let child = node.child(at: i) else { continue }
                var destination = child.destination
                if destination == nil, let goTo = child.action as? PDFActionGoTo { destination = goTo.destination }
                let label = (child.label ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                if let page = destination?.page, !label.isEmpty {
                    out.append((PDFSection(label: label, page: document.index(for: page), level: level), out.count))
                }
                walk(child, level: level + 1)
            }
        }
        if let root = document.outlineRoot { walk(root, level: 0) }
        return out.sorted { ($0.section.page, $0.order) < ($1.section.page, $1.order) }.map(\.section)
    }

    // MARK: - Appearance and layout

    func applySettings() {
        let themeBefore = ThemedPDFPage.theme
        applyTheme()
        applyLayout()
        if themeBefore != ThemedPDFPage.theme { redrawPages() }
        pageChanged()
    }

    private func applyTheme() {
        let theme = session.effectiveTheme
        ThemedPDFPage.theme = theme
        view.backgroundColor = NSColor(Color(hex: theme.colors.background))
    }

    /// PDFKit keeps rendered pages; telling it their annotations changed makes it draw them again with the theme.
    private func redrawPages() {
        for page in view.visiblePages { view.annotationsChanged(on: page) }
        view.layoutDocumentView()
        view.needsDisplay = true
    }

    private func applyLayout() {
        let current = view.currentPage
        switch mode {
        case .scroll:
            view.displayMode = .singlePageContinuous
            view.displayDirection = .vertical
            view.displaysPageBreaks = true
        case .paginated:
            view.displayMode = columns == 2 ? .twoUp : .singlePage
            view.displayDirection = .horizontal
            view.displaysPageBreaks = false
            view.displaysAsBook = false
        }
        fitPages()
        if let current { view.go(to: current) }
        session.pdfLayoutChanged(columns: columns, mode: mode)
    }

    /// Paginated: the whole page (or spread) fits the view, times the zoom. Scrolling: fit to width, times the zoom.
    private func fitPages() {
        guard let document, document.pageCount > 0 else { return }
        if mode == .scroll {
            if abs(zoomFactor - 1) < 0.01 {
                view.autoScales = true
            } else {
                view.autoScales = false
                view.scaleFactor = view.scaleFactorForSizeToFit * zoomFactor
            }
            return
        }
        guard let page = view.currentPage ?? document.page(at: 0) else { return }
        let bounds = page.bounds(for: view.displayBox)
        let rotated = page.rotation % 180 != 0
        let pageWidth = max(1, rotated ? bounds.height : bounds.width), pageHeight = max(1, rotated ? bounds.width : bounds.height)
        let availableWidth = max(100, view.bounds.width - 24), availableHeight = max(100, view.bounds.height - 24)
        let neededWidth = columns == 2 ? pageWidth * 2 + 8 : pageWidth
        let scale = min(availableWidth / neededWidth, availableHeight / pageHeight) * zoomFactor
        view.autoScales = false
        view.minScaleFactor = scale * 0.25
        view.maxScaleFactor = max(scale * 8, 4)
        view.scaleFactor = scale
    }

    func viewResized() {
        let size = view.bounds.size
        guard size != lastSize, size.width > 0 else { return }
        let spreadBefore = columns
        lastSize = size
        fitPages()
        if spreadBefore != columns, settings.spread == .auto { applyLayout() }
    }

    func zoom(_ direction: Int) {
        zoomFactor = min(4, max(0.5, zoomFactor * (direction > 0 ? 1.15 : 1 / 1.15)))
        fitPages()
    }

    // MARK: - Navigation

    func next() {
        if view.canGoToNextPage { view.goToNextPage(nil) } else if mode == .paginated { session.showEndCard = true }
    }

    func previous() {
        if view.canGoToPreviousPage { view.goToPreviousPage(nil) }
    }

    func nextSection() {
        let current = currentIndex
        if let next = sections.first(where: { $0.page > current }) { go(toPage: next.page) } else { go(toPage: pageCount - 1) }
    }

    func previousSection() {
        let current = currentIndex
        go(toPage: sections.last { $0.page < current }?.page ?? 0)
    }

    func go(toPage index: Int) {
        guard let document, document.pageCount > 0, let page = document.page(at: min(max(0, index), document.pageCount - 1)) else { return }
        view.go(to: page)
    }

    func go(toFraction fraction: Double) {
        go(toPage: whole((fraction * Double(max(0, pageCount - 1))).rounded()))
    }

    // MARK: - Pointer, selection, highlights

    func pointerMoved(to point: NSPoint) {
        session.pointerMoved(y: view.isFlipped ? point.y : view.bounds.height - point.y)
    }

    /// PDFView coordinates to the top-left-origin coordinates the SwiftUI overlays use.
    private func topLeft(_ rect: NSRect) -> CGRect {
        view.isFlipped ? rect : NSRect(x: rect.minX, y: view.bounds.height - rect.maxY, width: rect.width, height: rect.height)
    }

    func mouseUp(at point: NSPoint) {
        if let selection = view.currentSelection, let text = selection.string, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, let page = selection.pages.first {
            pendingSelection = selection
            let rect = topLeft(view.convert(selection.bounds(for: page), from: page))
            session.pdfSelectionChanged(text: HTMLText.collapse(text), rect: rect, page: document?.index(for: page) ?? 0)
            return
        }
        pendingSelection = nil
        if let page = view.page(for: point, nearest: false) {
            let pagePoint = view.convert(point, to: page)
            if let hit = page.annotation(at: pagePoint), let name = hit.userName, let id = UUID(uuidString: name) {
                session.pdfHighlightTapped(id, rect: topLeft(view.convert(hit.bounds, from: page)))
                return
            }
        }
        session.pdfSelectionChanged(text: nil, rect: .zero, page: 0)
    }

    func clearSelection() {
        view.clearSelection()
        pendingSelection = nil
    }

    static func nsColor(for color: HighlightColor) -> NSColor {
        color == .underline ? NSColor.systemRed : NSColor(HighlightSwatch.color(color))
    }

    private func restoreHighlights() {
        for annotation in session.annotations where annotation.kind == .highlight { addPDFAnnotations(for: annotation) }
    }

    /// One PDF annotation per highlighted line, tagged with the reader's id so a click finds the record.
    private func addPDFAnnotations(for record: Annotation) {
        guard let document, let rects = record.pdfRects else { return }
        for r in rects {
            guard let page = document.page(at: r.page) else { continue }
            let bounds = NSRect(x: r.x, y: r.y, width: r.width, height: r.height)
            let kind: PDFAnnotationSubtype = record.color == .underline ? .underline : .highlight
            let annotation = PDFAnnotation(bounds: bounds, forType: kind, withProperties: nil)
            annotation.color = PDFPresenter.nsColor(for: record.color ?? .yellow)
            annotation.quadrilateralPoints = [
                NSValue(point: NSPoint(x: 0, y: bounds.height)), NSValue(point: NSPoint(x: bounds.width, y: bounds.height)),
                NSValue(point: NSPoint(x: 0, y: 0)), NSValue(point: NSPoint(x: bounds.width, y: 0)),
            ]
            annotation.userName = record.id.uuidString
            annotation.contents = record.note.isEmpty ? nil : record.note
            page.addAnnotation(annotation)
        }
    }

    private func pdfAnnotations(for id: UUID) -> [(page: PDFPage, annotation: PDFAnnotation)] {
        guard let document else { return [] }
        let key = id.uuidString
        let pages: [Int] = session.annotations.first { $0.id == id }?.pdfRects.map { Set($0.map(\.page)).sorted() } ?? Array(0..<document.pageCount)
        var out: [(page: PDFPage, annotation: PDFAnnotation)] = []
        for index in pages {
            guard let page = document.page(at: index) else { continue }
            for annotation in page.annotations where annotation.userName == key { out.append((page, annotation)) }
        }
        return out
    }

    /// Turns the current selection into highlight annotations, one per line, and returns the reader's record.
    func highlightSelection(color: HighlightColor) -> Annotation? {
        guard let document, let selection = view.currentSelection ?? pendingSelection, let text = selection.string, !text.isEmpty else { return nil }
        var rects: [PDFRect] = []
        for line in selection.selectionsByLine() {
            for page in line.pages {
                let b = line.bounds(for: page)
                guard b.width > 0, b.height > 0 else { continue }
                rects.append(PDFRect(page: document.index(for: page), x: b.minX, y: b.minY, width: b.width, height: b.height))
            }
        }
        guard let first = rects.first else { return nil }
        let pageHeight = document.page(at: first.page)?.bounds(for: view.displayBox).height ?? 0
        let record = Annotation(kind: .highlight, locator: Locator(spine: first.page, offset: whole(max(0, pageHeight - first.y - first.height))),
                                color: color, text: HTMLText.collapse(text), chapter: session.position.chapter, pdfRects: rects)
        addPDFAnnotations(for: record)
        for r in Set(rects.map(\.page)) { if let page = document.page(at: r) { view.annotationsChanged(on: page) } }
        clearSelection()
        return record
    }

    func removeHighlight(_ id: UUID) {
        for (page, annotation) in pdfAnnotations(for: id) {
            page.removeAnnotation(annotation)
            view.annotationsChanged(on: page)
        }
    }

    /// The record already carries the new colour; underline and highlight are different annotation types, so rebuild.
    func recolor(_ id: UUID) {
        let existing = pdfAnnotations(for: id)
        for (page, annotation) in existing { page.removeAnnotation(annotation) }
        if let record = session.annotations.first(where: { $0.id == id }) { addPDFAnnotations(for: record) }
        for (page, _) in existing { view.annotationsChanged(on: page) }
    }

    func setNote(_ note: String, for id: UUID) {
        for (page, annotation) in pdfAnnotations(for: id) {
            annotation.contents = note.isEmpty ? nil : note
            view.annotationsChanged(on: page)
        }
    }

    // MARK: - Search

    func search(_ query: String) {
        hits = [:]
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        guard let document, !trimmed.isEmpty else {
            session.pdfSearchResults([], for: query)
            return
        }
        var results: [SearchHit] = []
        for selection in document.findString(trimmed, withOptions: [.caseInsensitive, .diacriticInsensitive]).prefix(500) {
            guard let page = selection.pages.first else { continue }
            let index = document.index(for: page)
            let context = selection.copy() as? PDFSelection
            context?.extend(atStart: 40)
            context?.extend(atEnd: 60)
            let excerpt = HTMLText.collapse(context?.string ?? selection.string ?? "")
            let section = sections.last { $0.page <= index }
            let hit = SearchHit(locator: Locator(spine: index, offset: results.count), excerpt: excerpt, chapter: section?.label ?? "Page \(index + 1)", pos: Double(index))
            hits[hit.id] = selection
            results.append(hit)
        }
        session.pdfSearchResults(results, for: query)
    }

    func show(_ hit: SearchHit) {
        guard let selection = hits[hit.id] else {
            go(toPage: hit.locator.spine)
            return
        }
        view.go(to: selection)
        view.setCurrentSelection(selection, animate: true)
    }
}
