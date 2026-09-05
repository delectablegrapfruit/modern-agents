import AppKit
import CoreImage
import PDFKit
import SwiftUI
import BooksCore

/// Hosts whichever PDF presenter the layout needs: PDFKit's view for whole pages, the reader's own screens for
/// Zoom & Split. The presenter is kept by the session so commands, search and annotations reach it the same way
/// they reach the page script for a book.
struct PDFReaderView: NSViewRepresentable {
    let session: ReaderSession

    func makeNSView(context: Context) -> NSView {
        let presenter: any PDFReading
        if let existing = session.pdf {
            presenter = existing
        } else if session.model.settings.reader.pdfLayout == .fit {
            presenter = SplitPDFPresenter(session: session)
        } else {
            presenter = PDFPresenter(session: session)
        }
        session.pdf = presenter
        presenter.open()
        let host = presenter.hostView
        DispatchQueue.main.async { host.window?.makeFirstResponder(host) }
        return host
    }

    func updateNSView(_ view: NSView, context: Context) {}
}

/// An outline entry of a PDF: the page it starts on.
struct PDFSection: Hashable {
    let label: String
    let page: Int
    let level: Int
}

/// What the session asks of a PDF presenter; the page script answers the same questions for books.
@MainActor
protocol PDFReading: AnyObject {
    var hostView: NSView { get }
    func open()
    func close()
    func applySettings()
    func next()
    func previous()
    func nextSection()
    func previousSection()
    func go(toPage index: Int, slice: Int)
    func go(toUnit unit: Int)
    func go(toFraction fraction: Double)
    func zoom(_ direction: Int)
    func canScroll(dx: CGFloat, dy: CGFloat) -> Bool
    func search(_ query: String)
    func show(_ hit: SearchHit)
    func clearSelection()
    func highlightSelection(color: HighlightColor) -> Annotation?
    func removeHighlight(_ id: UUID)
    func recolor(_ id: UUID)
    func setNote(_ note: String, for id: UUID)
}

/// Two-finger swipes turn one page (or screen) per gesture, sideways or vertical; the inertial tail never turns
/// another. Notched wheels are the session's.
struct SwipeTurner {
    private var distance: CGFloat = 0
    private var turned = false

    /// nil: not this turner's event (a notched wheel, or a zoomed page that should scroll). Otherwise the turn to
    /// make: 1 forward, -1 back, 0 none; the event is consumed either way.
    mutating func handle(_ event: NSEvent, settings: ReaderSettings, canScroll: (CGFloat, CGFloat) -> Bool) -> Int? {
        guard event.hasPreciseScrollingDeltas else { return nil }
        if event.phase.contains(.began) || event.phase.contains(.mayBegin) {
            distance = 0
            turned = false
        }
        let dx = event.scrollingDeltaX, dy = event.scrollingDeltaY
        if canScroll(dx, dy) {
            distance = 0
            return nil
        }
        if event.momentumPhase != [] { return 0 }
        guard settings.wheelTurnsPages else { return 0 }
        let sideways = abs(dx) > abs(dy)
        if sideways && !settings.wheelHorizontal { return 0 }
        var delta = sideways ? dx : dy
        if settings.wheelInvert { delta = -delta }
        var turn = 0
        if !turned {
            distance += delta
            if abs(distance) >= 60 {
                turned = true
                turn = distance < 0 ? 1 : -1
            }
        }
        if event.phase.contains(.ended) || event.phase.contains(.cancelled) {
            distance = 0
            turned = false
        }
        return turn
    }
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
        if presenter?.handleTrackpad(event) == true { return }
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

/// Whole pages: PDFKit's view with the reader's behaviours around it — themes as filters, one or two pages to a
/// screen inside book-like margins, the outline as contents and timeline marks, search, bookmarks by page and
/// highlights kept as annotations.
@MainActor
final class PDFPresenter: PDFReading {
    let view = BooksPDFView()
    var hostView: NSView { view }
    unowned let session: ReaderSession
    private(set) var document: PDFDocument?
    private var observers: [NSObjectProtocol] = []
    private var sections: [PDFSection] = []
    private var hits: [UUID: PDFSelection] = [:]
    private var pendingSelection: PDFSelection?
    private var zoomFactor: CGFloat = 1
    private var lastSize: CGSize = .zero
    private var opened = false
    private var swipe = SwipeTurner()

    init(session: ReaderSession) {
        self.session = session
        view.presenter = self
        view.autoScales = false
        view.displaysPageBreaks = false
        view.pageShadowsEnabled = false
        view.enableDataDetectors = false
        view.interpolationQuality = .high
        view.wantsLayer = true
        view.layerUsesCoreImageFilters = true
    }

    private var settings: ReaderSettings { session.model.settings.reader }
    private var columns: Int { settings.spread == .one ? 1 : 2 }
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
        self.document = document
        sections = PDFPresenter.sections(of: document)
        applyTheme()
        view.document = document
        applyLayout()
        restoreHighlights()
        observe()
        session.pdfOpened(units: document.pageCount, unitsPerPage: 1, sections: sections, columns: columns)
        let saved = session.book.position
        var page = 0
        if let pdfPage = saved?.pdfPage {
            page = pdfPage - 1
        } else if let percent = saved?.percent, percent > 0 {
            page = whole((percent / 100 * Double(document.pageCount)).rounded(.down))
        }
        if page > 0 { go(toPage: page, slice: 0) } else { report() }
    }

    func close() {
        for observer in observers { NotificationCenter.default.removeObserver(observer) }
        observers = []
    }

    private func observe() {
        let center = NotificationCenter.default
        for name in [Notification.Name.PDFViewPageChanged, .PDFViewDisplayModeChanged] {
            observers.append(center.addObserver(forName: name, object: view, queue: .main) { [weak self] _ in
                Task { @MainActor in self?.report() }
            })
        }
    }

    private func report() {
        guard let document else { return }
        let page = currentIndex
        session.pdfPositionChanged(unit: page, units: document.pageCount, page: page, slice: 0, label: nil)
    }

    // MARK: - Shared helpers

    /// The outline, flattened, in page order. Also used off the main actor by the reflow converter.
    nonisolated static func sections(of document: PDFDocument) -> [PDFSection] {
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

    /// The displayed size of a page (rotation applied); display space has its origin at the page's lower left.
    nonisolated static func displaySize(of page: PDFPage) -> CGSize {
        let bounds = page.bounds(for: .mediaBox)
        return page.rotation % 180 != 0 ? CGSize(width: bounds.height, height: bounds.width) : bounds.size
    }

    /// Where a sample of pages actually draws, in display space, as one box for the document — or two, when the
    /// pages carry two columns of text with clear space between them. Paper margins are cut away so the text can
    /// fill the width. Median edges resist the odd full-bleed page; blank pages are skipped.
    static func contentBoxes(of document: PDFDocument) -> [CGRect] {
        let count = document.pageCount
        guard count > 0, let first = document.page(at: 0) else { return [] }
        let size = displaySize(of: first)
        let media = CGRect(origin: .zero, size: size)
        let samples = min(count, 12)
        var boxes: [CGRect] = []
        var profile = [Int](repeating: 0, count: 200)
        for i in 0..<samples {
            let index = count <= samples ? i : Int((Double(i) * Double(count - 1) / Double(max(1, samples - 1))).rounded())
            guard let page = document.page(at: index), let scan = inkScan(of: page) else { continue }
            boxes.append(scan.box)
            for (bin, value) in scan.profile.enumerated() where bin < profile.count { profile[bin] += value }
        }
        guard !boxes.isEmpty else { return [media] }
        func median(_ values: [CGFloat]) -> CGFloat { values.sorted()[values.count / 2] }
        let minX = median(boxes.map(\.minX)), maxX = median(boxes.map(\.maxX))
        let minY = median(boxes.map(\.minY)), maxY = median(boxes.map(\.maxY))
        guard maxX > minX, maxY > minY else { return [media] }
        let pad = size.width * 0.015
        let box = CGRect(x: minX, y: minY, width: maxX - minX, height: maxY - minY).insetBy(dx: -pad, dy: -pad).intersection(media)

        // Two columns: the widest quiet run of the ink profile in the middle 30% of the box, at least 2.5% of the
        // page wide.
        let binWidth = size.width / CGFloat(profile.count)
        let peak = profile.max() ?? 0
        let quiet = max(1, peak / 50)
        let lowBin = Int((box.minX + box.width * 0.35) / binWidth), highBin = Int((box.minX + box.width * 0.65) / binWidth)
        var bestStart = -1, bestLength = 0, runStart = -1
        let lower = max(0, lowBin), upper = min(profile.count - 1, highBin)
        if lower <= upper {
            for bin in lower...upper {
                if profile[bin] <= quiet {
                    if runStart < 0 { runStart = bin }
                    let length = bin - runStart + 1
                    if length > bestLength {
                        bestLength = length
                        bestStart = runStart
                    }
                } else {
                    runStart = -1
                }
            }
        }
        if bestStart >= 0, CGFloat(bestLength) * binWidth >= size.width * 0.025, peak > 0 {
            let gapStart = CGFloat(bestStart) * binWidth, gapEnd = CGFloat(bestStart + bestLength) * binWidth
            let left = CGRect(x: box.minX, y: box.minY, width: max(1, gapStart - box.minX + pad), height: box.height)
            let right = CGRect(x: gapEnd - pad, y: box.minY, width: max(1, box.maxX - gapEnd + pad), height: box.height)
            if left.width > size.width * 0.2, right.width > size.width * 0.2 { return [left, right] }
        }
        return [box]
    }

    /// The box of non-white pixels in a small rendering of the page (display space), and how much ink each of 200
    /// vertical strips of the page carries.
    private static func inkScan(of page: PDFPage) -> (box: CGRect, profile: [Int])? {
        let size = displaySize(of: page)
        guard size.width > 0, size.height > 0 else { return nil }
        let width = 200
        let height = max(1, Int(CGFloat(width) * size.height / size.width))
        let image = page.thumbnail(of: NSSize(width: width, height: height), for: .mediaBox)
        guard let tiff = image.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff), rep.bitsPerSample == 8, !rep.isPlanar, let data = rep.bitmapData else { return nil }
        let w = rep.pixelsWide, h = rep.pixelsHigh, spp = rep.samplesPerPixel, row = rep.bytesPerRow
        let alphaFirst = rep.bitmapFormat.contains(.alphaFirst)
        let colorOffset = alphaFirst && rep.hasAlpha ? 1 : 0
        var minX = w, maxX = -1, minY = h, maxY = -1, ink = 0
        var profile = [Int](repeating: 0, count: 200)
        for y in 0..<h {
            for x in 0..<w {
                let p = data + y * row + x * spp
                let luminance: Int
                if spp - colorOffset >= 3 {
                    luminance = (Int(p[colorOffset]) * 299 + Int(p[colorOffset + 1]) * 587 + Int(p[colorOffset + 2]) * 114) / 1000
                } else {
                    luminance = Int(p[colorOffset])
                }
                let alpha = rep.hasAlpha ? Int(p[alphaFirst ? 0 : spp - 1]) : 255
                if luminance < 225 && alpha > 40 {
                    ink += 1
                    profile[min(199, x * 200 / max(1, w))] += 1
                    if x < minX { minX = x }
                    if x > maxX { maxX = x }
                    if y < minY { minY = y }
                    if y > maxY { maxY = y }
                }
            }
        }
        guard ink >= 20, maxX >= minX, maxY >= minY else { return nil }
        let sx = size.width / CGFloat(w), sy = size.height / CGFloat(h)
        let box = CGRect(x: CGFloat(minX) * sx, y: size.height - CGFloat(maxY + 1) * sy, width: CGFloat(maxX - minX + 1) * sx, height: CGFloat(maxY - minY + 1) * sy)
        return (box, profile)
    }

    static func nsColor(for color: HighlightColor) -> NSColor {
        color == .underline ? NSColor.systemRed : NSColor(HighlightSwatch.color(color))
    }

    /// Light themes tint the white of the paper; dark themes invert luminance while keeping hues (so pictures and
    /// highlights keep their colours) and lift black to the theme's page colour.
    static func themeFilters(for theme: Theme) -> (filters: [CIFilter], background: NSColor) {
        let page = NSColor(Color(hex: theme.colors.background)).usingColorSpace(.sRGB) ?? NSColor(srgbRed: 1, green: 1, blue: 1, alpha: 1)
        var filters: [CIFilter] = []
        switch theme {
        case .original, .bold:
            break
        case .paper:
            if let tint = CIFilter(name: "CIColorMatrix") {
                tint.setValue(CIVector(x: page.redComponent, y: 0, z: 0, w: 0), forKey: "inputRVector")
                tint.setValue(CIVector(x: 0, y: page.greenComponent, z: 0, w: 0), forKey: "inputGVector")
                tint.setValue(CIVector(x: 0, y: 0, z: page.blueComponent, w: 0), forKey: "inputBVector")
                filters.append(tint)
            }
        case .quiet, .calm, .focus:
            if let invert = CIFilter(name: "CIColorInvert") { filters.append(invert) }
            if let hue = CIFilter(name: "CIHueAdjust") {
                hue.setValue(Double.pi, forKey: kCIInputAngleKey)
                filters.append(hue)
            }
            if let lift = CIFilter(name: "CIColorMatrix") {
                lift.setValue(CIVector(x: page.redComponent, y: page.greenComponent, z: page.blueComponent, w: 0), forKey: "inputBiasVector")
                filters.append(lift)
            }
        }
        // The surround must end up the theme's page colour: for the filtered themes white is what the filters turn
        // into exactly that colour (and what the paper is), so nothing flashes against it.
        return (filters, filters.isEmpty ? page : NSColor(srgbRed: 1, green: 1, blue: 1, alpha: 1))
    }

    // MARK: - Appearance and layout

    func applySettings() {
        applyTheme()
        applyLayout()
        report()
    }

    private func applyTheme() {
        let theme = PDFPresenter.themeFilters(for: session.effectiveTheme)
        view.layer?.filters = theme.filters.isEmpty ? nil : theme.filters
        view.backgroundColor = theme.background
    }

    private func applyLayout() {
        let current = view.currentPage
        view.displayMode = columns == 2 ? .twoUp : .singlePage
        view.displaysAsBook = false
        view.displaysPageBreaks = false
        fitPages()
        if let current { view.go(to: current) }
        session.pdfLayoutChanged(columns: columns, mode: .paginated)
    }

    /// The page (or spread) fits the view inside book-like margins, times the zoom.
    private func fitPages() {
        guard let document, document.pageCount > 0, let page = view.currentPage ?? document.page(at: 0) else { return }
        let size = PDFPresenter.displaySize(of: page)
        let availableWidth = max(100, view.bounds.width - 96), availableHeight = max(100, view.bounds.height - 80)
        let neededWidth = columns == 2 ? size.width * 2 + 24 : size.width
        let scale = min(availableWidth / max(1, neededWidth), availableHeight / max(1, size.height)) * zoomFactor
        view.autoScales = false
        view.minScaleFactor = scale * 0.25
        view.maxScaleFactor = max(scale * 8, 4)
        view.scaleFactor = scale
    }

    func viewResized() {
        let size = view.bounds.size
        guard size != lastSize, size.width > 0 else { return }
        lastSize = size
        fitPages()
    }

    func zoom(_ direction: Int) {
        zoomFactor = min(4, max(0.5, zoomFactor * (direction > 0 ? 1.15 : 1 / 1.15)))
        fitPages()
    }

    // MARK: - Navigation

    func next() {
        if view.canGoToNextPage { view.goToNextPage(nil) } else { session.showEndCard = true }
    }

    func previous() {
        if view.canGoToPreviousPage { view.goToPreviousPage(nil) }
    }

    func nextSection() {
        let current = currentIndex
        if let next = sections.first(where: { $0.page > current }) { go(toPage: next.page, slice: 0) } else { go(toPage: pageCount - 1, slice: 0) }
    }

    func previousSection() {
        let current = currentIndex
        go(toPage: sections.last { $0.page < current }?.page ?? 0, slice: 0)
    }

    func go(toPage index: Int, slice: Int) {
        guard let document, document.pageCount > 0, let page = document.page(at: min(max(0, index), document.pageCount - 1)) else { return }
        view.go(to: page)
        report()
    }

    func go(toUnit unit: Int) { go(toPage: unit, slice: 0) }

    func go(toFraction fraction: Double) {
        go(toPage: whole((fraction * Double(max(0, pageCount - 1))).rounded()), slice: 0)
    }

    /// Whether a zoomed page can still scroll in the direction of a wheel or swipe (AppKit's negative deltas are down
    /// and to the right). While it can, PDFKit scrolls; the page turns only from its edge.
    func canScroll(dx: CGFloat, dy: CGFloat) -> Bool {
        guard let documentView = view.documentView, let scrollView = documentView.enclosingScrollView else { return false }
        let visible = scrollView.contentView.documentVisibleRect
        let bounds = documentView.bounds
        let slack: CGFloat = 1
        if dy != 0 {
            let downFree = documentView.isFlipped ? bounds.maxY - visible.maxY : visible.minY - bounds.minY
            let upFree = documentView.isFlipped ? visible.minY - bounds.minY : bounds.maxY - visible.maxY
            if dy < 0 && downFree > slack { return true }
            if dy > 0 && upFree > slack { return true }
        }
        if dx != 0 {
            if dx < 0 && bounds.maxX - visible.maxX > slack { return true }
            if dx > 0 && visible.minX - bounds.minX > slack { return true }
        }
        return false
    }

    func handleTrackpad(_ event: NSEvent) -> Bool {
        guard let turn = swipe.handle(event, settings: settings, canScroll: { [self] dx, dy in canScroll(dx: dx, dy: dy) }) else { return false }
        if turn > 0 { next() } else if turn < 0 { previous() }
        return true
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

    private func restoreHighlights() {
        for annotation in session.annotations where annotation.kind == .highlight && annotation.pdfRects != nil { addPDFAnnotations(for: annotation) }
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
        guard let record = PDFPresenter.highlightRecord(for: selection, in: document, color: color, chapter: session.position.chapter) else { return nil }
        addPDFAnnotations(for: record)
        for r in Set((record.pdfRects ?? []).map(\.page)) { if let page = document.page(at: r) { view.annotationsChanged(on: page) } }
        clearSelection()
        return record
    }

    /// A highlight record for a selection: its line rectangles in page space, with the first line's place as locator.
    static func highlightRecord(for selection: PDFSelection, in document: PDFDocument, color: HighlightColor, chapter: String) -> Annotation? {
        guard let text = selection.string, !text.isEmpty else { return nil }
        var rects: [PDFRect] = []
        for line in selection.selectionsByLine() {
            for page in line.pages {
                let b = line.bounds(for: page)
                guard b.width > 0, b.height > 0 else { continue }
                rects.append(PDFRect(page: document.index(for: page), x: b.minX, y: b.minY, width: b.width, height: b.height))
            }
        }
        guard let first = rects.first else { return nil }
        let pageHeight = document.page(at: first.page)?.bounds(for: .mediaBox).height ?? 0
        return Annotation(kind: .highlight, locator: Locator(spine: first.page, offset: whole(max(0, pageHeight - first.y - first.height))),
                          color: color, text: HTMLText.collapse(text), chapter: chapter, pdfRects: rects)
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

    /// Every match of a query, with a little context, and the selections they came from, for `show`.
    static func searchHits(for query: String, in document: PDFDocument, sections: [PDFSection], unitsPerPage: Int) -> (hits: [SearchHit], selections: [UUID: PDFSelection]) {
        var results: [SearchHit] = []
        var selections: [UUID: PDFSelection] = [:]
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return ([], [:]) }
        for selection in document.findString(trimmed, withOptions: [.caseInsensitive, .diacriticInsensitive]).prefix(500) {
            guard let page = selection.pages.first else { continue }
            let index = document.index(for: page)
            let context = selection.copy() as? PDFSelection
            context?.extend(atStart: 40)
            context?.extend(atEnd: 60)
            let excerpt = HTMLText.collapse(context?.string ?? selection.string ?? "")
            let section = sections.last { $0.page <= index }
            let hit = SearchHit(locator: Locator(spine: index, offset: results.count), excerpt: excerpt, chapter: section?.label ?? "Page \(index + 1)", pos: Double(index * unitsPerPage))
            selections[hit.id] = selection
            results.append(hit)
        }
        return (results, selections)
    }

    func search(_ query: String) {
        guard let document else {
            session.pdfSearchResults([], for: query)
            return
        }
        let found = PDFPresenter.searchHits(for: query, in: document, sections: sections, unitsPerPage: 1)
        hits = found.selections
        session.pdfSearchResults(found.hits, for: query)
    }

    func show(_ hit: SearchHit) {
        guard let selection = hits[hit.id] else {
            go(toPage: hit.locator.spine, slice: 0)
            return
        }
        view.go(to: selection)
        view.setCurrentSelection(selection, animate: true)
    }
}
