import AppKit
import CoreImage
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

/// PDFKit's view with the reader's input: notched wheels go to the session (one notch, one page), the pointer
/// position drives the chrome, keys turn screens in Zoom & Split, and the end of a click opens the reader's menus
/// over a selection or a highlight.
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

    override func keyDown(with event: NSEvent) {
        if presenter?.handleKey(event) == true { return }
        super.keyDown(with: event)
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

/// Everything the reader needs from a PDF: PDFKit's view with the reader's behaviours around it — themes, whole
/// pages or Zoom & Split (pages cropped to their ink, scaled to the text size and cut into screens that turn like
/// pages), the outline as contents and timeline marks, search, bookmarks by page and highlights kept as
/// annotations. Reports to the session in "units": pages, or screens in Zoom & Split.
@MainActor
final class PDFPresenter {
    let view = BooksPDFView()
    unowned let session: ReaderSession
    private(set) var document: PDFDocument?
    private var observers: [NSObjectProtocol] = []
    private var sections: [PDFSection] = []
    private var hits: [UUID: PDFSelection] = [:]
    private var pendingSelection: PDFSelection?
    private var zoomFactor: CGFloat = 1
    private var lastSize: CGSize = .zero
    private var opened = false
    private var swipeDistance: CGFloat = 0
    private var swipeTurned = false

    /// Zoom & Split, fixed for the presenter's life: switching layouts reopens the book.
    let fit: Bool
    private var fitBox: CGRect = .zero
    /// Height of one screen in page units.
    private var sliceHeight: CGFloat = 0
    private(set) var slicesPerPage = 1
    private(set) var slice = 0
    private let fitSide: CGFloat = 40
    private let fitTop: CGFloat = 24
    private let fitBottom: CGFloat = 56

    init(session: ReaderSession) {
        self.session = session
        fit = session.model.settings.reader.pdfLayout == .fit
        view.presenter = self
        view.autoScales = false
        view.displaysPageBreaks = false
        view.pageShadowsEnabled = false
        view.enableDataDetectors = false
        view.interpolationQuality = .high
        // Themes are Core Image filters on the view's layer: they colour everything PDFKit composites, including the
        // white page placeholder it shows before a page has rendered, so nothing flashes when pages change.
        view.wantsLayer = true
        view.layerUsesCoreImageFilters = true
    }

    private var settings: ReaderSettings { session.model.settings.reader }
    /// PDFs read like books: pages, one or two at a time; Zoom & Split shows one screen at a time.
    private var columns: Int { fit ? 1 : (settings.spread == .one ? 1 : 2) }
    private var unitsPerPage: Int { fit ? max(1, slicesPerPage) : 1 }
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
        if fit { fitBox = PDFPresenter.contentBox(of: document) }
        applyTheme()
        view.document = document
        applyLayout()
        restoreHighlights()
        observe()
        reportLayout()
        let saved = session.book.position
        var page = 0, savedSlice = 0
        if let pdfPage = saved?.pdfPage {
            page = pdfPage - 1
            savedSlice = saved?.locator?.offset ?? 0
        } else if let percent = saved?.percent, percent > 0 {
            page = whole((percent / 100 * Double(document.pageCount)).rounded(.down))
        }
        if page > 0 || savedSlice > 0 { go(toPage: page, slice: savedSlice) } else { report() }
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

    private func reportLayout() {
        session.pdfOpened(units: pageCount * unitsPerPage, unitsPerPage: unitsPerPage, sections: sections, columns: columns)
    }

    private func report() {
        guard let document else { return }
        let page = currentIndex
        let per = unitsPerPage
        let label = fit && per > 1 ? "Page \(page + 1) of \(document.pageCount) · \(slice + 1)/\(per)" : nil
        session.pdfPositionChanged(unit: page * per + (fit ? slice : 0), units: document.pageCount * per, page: page, slice: fit ? slice : 0, label: label)
    }

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

    // MARK: - Zoom & Split geometry

    /// Where a sample of pages actually draws, as one box for the document: paper margins are cut away so the
    /// text can fill the width. Median edges resist the odd full-bleed page; blank pages are skipped.
    static func contentBox(of document: PDFDocument) -> CGRect {
        let count = document.pageCount
        guard count > 0, let first = document.page(at: 0) else { return .zero }
        let media = first.bounds(for: .mediaBox)
        let samples = min(count, 12)
        var boxes: [CGRect] = []
        for i in 0..<samples {
            let index = count <= samples ? i : Int((Double(i) * Double(count - 1) / Double(max(1, samples - 1))).rounded())
            if let page = document.page(at: index), let box = inkBox(of: page) { boxes.append(box) }
        }
        guard !boxes.isEmpty else { return media }
        func median(_ values: [CGFloat]) -> CGFloat { values.sorted()[values.count / 2] }
        let minX = median(boxes.map(\.minX)), maxX = median(boxes.map(\.maxX))
        let minY = median(boxes.map(\.minY)), maxY = median(boxes.map(\.maxY))
        guard maxX > minX, maxY > minY else { return media }
        let pad = media.width * 0.015
        return CGRect(x: minX, y: minY, width: maxX - minX, height: maxY - minY).insetBy(dx: -pad, dy: -pad).intersection(media)
    }

    /// The box of non-white pixels in a small rendering of the page, in page space.
    private static func inkBox(of page: PDFPage) -> CGRect? {
        let media = page.bounds(for: .mediaBox)
        guard media.width > 0, media.height > 0 else { return nil }
        let width = 120
        let height = max(1, Int(CGFloat(width) * media.height / media.width))
        let image = page.thumbnail(of: NSSize(width: width, height: height), for: .mediaBox)
        guard let tiff = image.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff), rep.bitsPerSample == 8, !rep.isPlanar, let data = rep.bitmapData else { return nil }
        let w = rep.pixelsWide, h = rep.pixelsHigh, spp = rep.samplesPerPixel, row = rep.bytesPerRow
        let alphaFirst = rep.bitmapFormat.contains(.alphaFirst)
        var minX = w, maxX = -1, minY = h, maxY = -1, ink = 0
        for y in 0..<h {
            for x in 0..<w {
                let p = data + y * row + x * spp
                let colorOffset = alphaFirst && rep.hasAlpha ? 1 : 0
                let luminance: Int
                if spp - colorOffset >= 3 {
                    luminance = (Int(p[colorOffset]) * 299 + Int(p[colorOffset + 1]) * 587 + Int(p[colorOffset + 2]) * 114) / 1000
                } else {
                    luminance = Int(p[colorOffset])
                }
                let alpha = rep.hasAlpha ? Int(p[alphaFirst ? 0 : spp - 1]) : 255
                if luminance < 225 && alpha > 40 {
                    ink += 1
                    if x < minX { minX = x }
                    if x > maxX { maxX = x }
                    if y < minY { minY = y }
                    if y > maxY { maxY = y }
                }
            }
        }
        guard ink >= 20, maxX >= minX, maxY >= minY else { return nil }
        let sx = media.width / CGFloat(w), sy = media.height / CGFloat(h)
        return CGRect(x: media.minX + CGFloat(minX) * sx, y: media.maxY - CGFloat(maxY + 1) * sy,
                      width: CGFloat(maxX - minX + 1) * sx, height: CGFloat(maxY - minY + 1) * sy)
    }

    // MARK: - Appearance and layout

    func applySettings() {
        applyTheme()
        applyLayout()
        report()
    }

    /// Light themes tint the white of the paper; dark themes invert luminance while keeping hues (so pictures and
    /// highlights keep their colours) and lift black to the theme's page colour.
    private func applyTheme() {
        let theme = session.effectiveTheme
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
        view.layer?.filters = filters.isEmpty ? nil : filters
        // The surround must end up the theme's page colour: for the filtered themes white is what the filters turn
        // into exactly that colour (and what PDFKit's page placeholder is), so a page never flashes against it.
        view.backgroundColor = filters.isEmpty ? page : NSColor(srgbRed: 1, green: 1, blue: 1, alpha: 1)
    }

    private func applyLayout() {
        let current = view.currentPage
        view.displayMode = columns == 2 ? .twoUp : .singlePage
        view.displaysAsBook = false
        view.displaysPageBreaks = false
        fitPages()
        if let current { view.go(to: current) }
        if fit { showSlice() }
        session.pdfLayoutChanged(columns: columns, mode: .paginated)
    }

    /// Pages: the page (or spread) fits the view inside book-like margins, times the zoom. Zoom & Split: the ink box
    /// fills the width times the text size, and the page is cut into as many screens as that needs.
    private func fitPages() {
        guard let document, document.pageCount > 0, let page = view.currentPage ?? document.page(at: 0) else { return }
        let bounds = page.bounds(for: view.displayBox)
        if fit {
            let box = fitBox.isEmpty ? bounds : fitBox
            let scale = max(0.05, (view.bounds.width - 2 * fitSide) / max(1, box.width) * CGFloat(settings.pdfZoom) / 100)
            view.autoScales = false
            view.minScaleFactor = 0.05
            view.maxScaleFactor = 20
            view.scaleFactor = scale
            view.minScaleFactor = scale
            view.maxScaleFactor = scale
            sliceHeight = max(10, (view.bounds.height - fitTop - fitBottom) / scale)
            let count = max(1, Int(ceil((box.height - 1) / sliceHeight)))
            if count != slicesPerPage {
                let fraction = Double(slice) / Double(max(1, slicesPerPage))
                slicesPerPage = count
                slice = min(count - 1, whole((fraction * Double(count)).rounded()))
                if opened { reportLayout() }
            }
            return
        }
        let rotated = page.rotation % 180 != 0
        let pageWidth = max(1, rotated ? bounds.height : bounds.width), pageHeight = max(1, rotated ? bounds.width : bounds.height)
        let availableWidth = max(100, view.bounds.width - 96), availableHeight = max(100, view.bounds.height - 80)
        let neededWidth = columns == 2 ? pageWidth * 2 + 24 : pageWidth
        let scale = min(availableWidth / neededWidth, availableHeight / pageHeight) * zoomFactor
        view.autoScales = false
        view.minScaleFactor = scale * 0.25
        view.maxScaleFactor = max(scale * 8, 4)
        view.scaleFactor = scale
    }

    /// Scrolls the zoomed page so the current screen sits under the top margin; the last screen ends at the ink's
    /// bottom edge.
    private func showSlice() {
        guard fit, let page = view.currentPage, let documentView = view.documentView, let scrollView = documentView.enclosingScrollView else { return }
        let box = fitBox.isEmpty ? page.bounds(for: view.displayBox) : fitBox
        var top = box.maxY - CGFloat(slice) * sliceHeight
        var bottom = top - sliceHeight
        if bottom < box.minY {
            bottom = box.minY
            top = bottom + sliceHeight
        }
        let onPage = CGRect(x: box.minX, y: bottom, width: box.width, height: top - bottom)
        let inDocument = documentView.convert(view.convert(onPage, from: page), from: view)
        let clip = scrollView.contentView
        var origin = inDocument.origin
        origin.x -= fitSide
        origin.y -= documentView.isFlipped ? fitTop : (clip.bounds.height - inDocument.height - fitTop)
        let doc = documentView.bounds
        origin.x = min(max(doc.minX, origin.x), max(doc.minX, doc.maxX - clip.bounds.width))
        origin.y = min(max(doc.minY, origin.y), max(doc.minY, doc.maxY - clip.bounds.height))
        clip.scroll(to: origin)
        scrollView.reflectScrolledClipView(clip)
    }

    func viewResized() {
        let size = view.bounds.size
        guard size != lastSize, size.width > 0 else { return }
        lastSize = size
        fitPages()
        if fit { showSlice() }
    }

    /// ⌘+ and ⌘−: the text size in Zoom & Split (kept in the settings), a plain zoom for whole pages.
    func zoom(_ direction: Int) {
        if fit {
            var all = session.model.settings
            all.reader.pdfZoom = min(300, max(50, all.reader.pdfZoom + (direction > 0 ? 10 : -10)))
            session.model.settings = all
            fitPages()
            showSlice()
            report()
            return
        }
        zoomFactor = min(4, max(0.5, zoomFactor * (direction > 0 ? 1.15 : 1 / 1.15)))
        fitPages()
    }

    // MARK: - Navigation

    func next() {
        if fit {
            if slice + 1 < slicesPerPage {
                slice += 1
                showSlice()
                report()
            } else if view.canGoToNextPage {
                slice = 0
                view.goToNextPage(nil)
                showSlice()
                report()
            } else {
                session.showEndCard = true
            }
            return
        }
        if view.canGoToNextPage { view.goToNextPage(nil) } else { session.showEndCard = true }
    }

    func previous() {
        if fit {
            if slice > 0 {
                slice -= 1
                showSlice()
                report()
            } else if view.canGoToPreviousPage {
                view.goToPreviousPage(nil)
                slice = max(0, slicesPerPage - 1)
                showSlice()
                report()
            }
            return
        }
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

    func go(toPage index: Int, slice target: Int = 0) {
        guard let document, document.pageCount > 0, let page = document.page(at: min(max(0, index), document.pageCount - 1)) else { return }
        slice = fit ? min(max(0, target), max(0, slicesPerPage - 1)) : 0
        view.go(to: page)
        if fit { showSlice() }
        report()
    }

    func go(toUnit unit: Int) {
        let per = unitsPerPage
        go(toPage: max(0, unit) / per, slice: max(0, unit) % per)
    }

    func go(toFraction fraction: Double) {
        let units = pageCount * unitsPerPage
        go(toUnit: whole((fraction * Double(max(0, units - 1))).rounded()))
    }

    /// Zoom & Split: arrows, space and the paging keys turn screens; PDFKit would scroll instead.
    func handleKey(_ event: NSEvent) -> Bool {
        guard fit, let scalar = event.charactersIgnoringModifiers?.unicodeScalars.first else { return false }
        let code = Int(scalar.value)
        switch code {
        case NSRightArrowFunctionKey, NSDownArrowFunctionKey, NSPageDownFunctionKey:
            next()
            return true
        case 32:
            if event.modifierFlags.contains(.shift) { previous() } else { next() }
            return true
        case NSLeftArrowFunctionKey, NSUpArrowFunctionKey, NSPageUpFunctionKey:
            previous()
            return true
        case NSHomeFunctionKey:
            go(toPage: 0)
            return true
        case NSEndFunctionKey:
            go(toPage: pageCount - 1, slice: slicesPerPage - 1)
            return true
        default:
            return false
        }
    }

    /// Whether a zoomed page can still scroll in the direction of a wheel or swipe (AppKit's negative deltas are down
    /// and to the right). While it can, PDFKit scrolls; the page turns only from its edge. Never in Zoom & Split,
    /// where screens turn like pages.
    func canScroll(dx: CGFloat, dy: CGFloat) -> Bool {
        guard !fit, let documentView = view.documentView, let scrollView = documentView.enclosingScrollView else { return false }
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

    /// Two-finger swipes turn one page (or screen) per gesture, sideways or vertical; PDFKit would otherwise scroll
    /// a page that already fits. The inertial tail never turns another page.
    func handleTrackpad(_ event: NSEvent) -> Bool {
        guard event.hasPreciseScrollingDeltas else { return false }
        if event.phase.contains(.began) || event.phase.contains(.mayBegin) {
            swipeDistance = 0
            swipeTurned = false
        }
        let dx = event.scrollingDeltaX, dy = event.scrollingDeltaY
        if canScroll(dx: dx, dy: dy) {
            swipeDistance = 0
            return false
        }
        if event.momentumPhase != [] { return true }
        let settings = self.settings
        guard settings.wheelTurnsPages else { return true }
        let sideways = abs(dx) > abs(dy)
        if sideways && !settings.wheelHorizontal { return true }
        var delta = sideways ? dx : dy
        if settings.wheelInvert { delta = -delta }
        if !swipeTurned {
            swipeDistance += delta
            if abs(swipeDistance) >= 60 {
                swipeTurned = true
                if swipeDistance < 0 { next() } else { previous() }
            }
        }
        if event.phase.contains(.ended) || event.phase.contains(.cancelled) {
            swipeDistance = 0
            swipeTurned = false
        }
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

    static func nsColor(for color: HighlightColor) -> NSColor {
        color == .underline ? NSColor.systemRed : NSColor(HighlightSwatch.color(color))
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
            let hit = SearchHit(locator: Locator(spine: index, offset: results.count), excerpt: excerpt, chapter: section?.label ?? "Page \(index + 1)", pos: Double(index * unitsPerPage))
            hits[hit.id] = selection
            results.append(hit)
        }
        session.pdfSearchResults(results, for: query)
    }

    func show(_ hit: SearchHit) {
        guard let selection = hits[hit.id], let page = selection.pages.first else {
            go(toPage: hit.locator.spine)
            return
        }
        view.go(to: selection)
        if fit {
            let box = fitBox.isEmpty ? page.bounds(for: view.displayBox) : fitBox
            let bounds = selection.bounds(for: page)
            slice = min(max(0, whole(Double((box.maxY - bounds.maxY) / max(1, sliceHeight)).rounded(.down))), max(0, slicesPerPage - 1))
            showSlice()
            report()
        }
        view.setCurrentSelection(selection, animate: true)
    }
}
