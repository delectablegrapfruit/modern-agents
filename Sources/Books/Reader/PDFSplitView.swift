import AppKit
import CoreImage
import PDFKit
import QuartzCore
import SwiftUI
import BooksCore

/// Zoom & Split: each page is cropped to the document's ink (two columns of text become two strips), scaled so a
/// strip fills one screen's width at the chosen text size, and cut into screens shown one or two at a time and
/// turned like a book's pages — with a slide, if the book's page turn slides. The rendering is the reader's own, so
/// two screens share the view; selection, highlights, search and Look Up still come from PDFKit's text.
@MainActor
final class SplitPDFPresenter: PDFReading {
    let view = SplitPDFView()
    var hostView: NSView { view }
    unowned let session: ReaderSession
    private(set) var document: PDFDocument?
    private var sections: [PDFSection] = []
    private var hits: [UUID: PDFSelection] = [:]
    /// Ink strips of a page in display space: one, or two columns.
    private var strips: [CGRect] = []
    private var pageCount = 0
    private var opened = false
    /// Set once the first spread is up; before that, layout passes must not report or present.
    private var ready = false
    private var swipe = SwipeTurner()

    // Geometry, recomputed when the view, the spread or the text size changes.
    private(set) var columns = 2
    private var scale: CGFloat = 1
    private var tileSize: CGSize = .zero
    private var screenHeight: CGFloat = 0
    private var screensPerStrip = 1
    private(set) var unit = 0
    private var tiles: [Int: CGImage] = [:]
    private var spreadLayer: CALayer?
    private var selection: PDFSelection?
    private var selectionPage: Int?
    private var flash: PDFSelection?

    let sideMargin: CGFloat = 40
    let topMargin: CGFloat = 24
    let bottomMargin: CGFloat = 56
    let gutter: CGFloat = 32

    init(session: ReaderSession) {
        self.session = session
        view.presenter = self
    }

    private var settings: ReaderSettings { session.model.settings.reader }
    var screensPerPage: Int { max(1, strips.count * screensPerStrip) }
    var units: Int { pageCount * screensPerPage }

    // MARK: - Opening

    func open() {
        guard !opened else { return }
        opened = true
        let url = session.model.store.fileURL(for: session.book)
        guard let document = PDFDocument(url: url), document.pageCount > 0 else {
            session.error = "This PDF could not be opened."
            return
        }
        self.document = document
        pageCount = document.pageCount
        sections = PDFPresenter.sections(of: document)
        strips = PDFPresenter.contentBoxes(of: document)
        if strips.isEmpty, let first = document.page(at: 0) { strips = [CGRect(origin: .zero, size: PDFPresenter.displaySize(of: first))] }
        applyTheme()
        computeGeometry()
        reportLayout()
        let saved = session.book.position
        var start = 0
        if let pdfPage = saved?.pdfPage {
            start = (pdfPage - 1) * screensPerPage + min(screensPerPage - 1, saved?.locator?.offset ?? 0)
        } else if let percent = saved?.percent, percent > 0 {
            start = whole((percent / 100 * Double(units)).rounded(.down))
        }
        unit = aligned(start)
        ready = true
        present(direction: 0)
        report()
    }

    func close() {}

    private func reportLayout() {
        session.pdfOpened(units: units, unitsPerPage: screensPerPage, sections: sections, columns: columns)
    }

    private func report() {
        guard pageCount > 0 else { return }
        let per = screensPerPage
        let page = unit / per, screen = unit % per
        let label: String
        if columns == 2, unit + 1 < units {
            let page2 = (unit + 1) / per
            label = page2 == page ? "Page \(page + 1) of \(pageCount) · \(screen + 1)–\(screen + 2)/\(per)" : "Pages \(page + 1)–\(page2 + 1) of \(pageCount)"
        } else {
            label = per > 1 ? "Page \(page + 1) of \(pageCount) · \(screen + 1)/\(per)" : "Page \(page + 1) of \(pageCount)"
        }
        session.pdfPositionChanged(unit: unit, units: units, page: page, slice: screen, label: label)
    }

    // MARK: - Geometry

    private func aligned(_ u: Int) -> Int {
        let clamped = min(max(0, u), max(0, units - 1))
        return columns == 2 ? clamped - clamped % 2 : clamped
    }

    /// Scale and screens follow the view: a strip fills one column's width at the text size; the column's height in
    /// page units is a screen. The place is kept as a fraction.
    private func computeGeometry() {
        let size = view.bounds.size
        guard size.width > 60, size.height > 60, let widest = strips.map(\.width).max(), widest > 0 else { return }
        let wantedColumns = settings.spread == .one ? 1 : 2
        let availableWidth = size.width - 2 * sideMargin - CGFloat(wantedColumns - 1) * gutter
        let tileWidth = max(40, availableWidth / CGFloat(wantedColumns))
        let tileHeight = max(40, size.height - topMargin - bottomMargin)
        let newScale = tileWidth / widest * CGFloat(min(100, max(50, settings.pdfZoom))) / 100
        let newScreenHeight = tileHeight / newScale
        let tallest = strips.map(\.height).max() ?? 1
        let newScreens = max(1, Int(ceil((tallest - 1) / newScreenHeight)))
        let fraction = units > 0 ? Double(unit) / Double(units) : 0
        let changed = newScreens != screensPerStrip || wantedColumns != columns || abs(newScale - scale) > 0.0001 || tileSize != CGSize(width: tileWidth, height: tileHeight)
        columns = wantedColumns
        scale = newScale
        tileSize = CGSize(width: tileWidth, height: tileHeight)
        screenHeight = newScreenHeight
        screensPerStrip = newScreens
        if changed {
            tiles.removeAll()
            unit = aligned(whole((fraction * Double(units)).rounded()))
            if ready { reportLayout() }
        }
    }

    /// The page and the display-space rectangle a unit shows.
    private func placement(of u: Int) -> (page: Int, rect: CGRect)? {
        guard units > 0, u >= 0, u < units else { return nil }
        let per = screensPerPage
        let page = u / per, within = u % per
        let strip = strips[min(strips.count - 1, within / max(1, screensPerStrip))]
        let screen = within % max(1, screensPerStrip)
        var top = strip.maxY - CGFloat(screen) * screenHeight
        var bottom = top - screenHeight
        if bottom < strip.minY {
            bottom = strip.minY
            top = bottom + screenHeight
        }
        return (page, CGRect(x: strip.minX, y: bottom, width: strip.width, height: top - bottom))
    }

    /// Where the tile of a column sits in the view (bottom-left origin).
    private func tileFrame(column: Int) -> CGRect {
        CGRect(x: sideMargin + CGFloat(column) * (tileSize.width + gutter), y: bottomMargin, width: tileSize.width, height: tileSize.height)
    }

    /// The tile under a view point, with its unit and placement.
    private func tile(at point: NSPoint) -> (column: Int, unit: Int, page: Int, rect: CGRect, frame: CGRect)? {
        for column in 0..<columns {
            let frame = tileFrame(column: column)
            let u = unit + column
            guard frame.contains(point), let p = placement(of: u) else { continue }
            return (column, u, p.page, p.rect, frame)
        }
        return nil
    }

    // MARK: - Drawing

    private func applyTheme() {
        let theme = PDFPresenter.themeFilters(for: session.effectiveTheme)
        view.layer?.filters = theme.filters.isEmpty ? nil : theme.filters
        view.layer?.backgroundColor = theme.background.cgColor
    }

    /// One screen as an image at the window's scale: the paper, the page's drawing through the strip, and the
    /// highlights that fall on it.
    private func tileImage(for u: Int) -> CGImage? {
        if let cached = tiles[u] { return cached }
        guard let document, let p = placement(of: u), let page = document.page(at: p.page) else { return nil }
        let backing = view.window?.backingScaleFactor ?? 2
        let width = Int(tileSize.width * backing), height = Int(tileSize.height * backing)
        guard width > 0, height > 0, let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        context.setFillColor(CGColor(gray: 1, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        context.interpolationQuality = .high
        context.scaleBy(x: backing * scale, y: backing * scale)
        context.translateBy(x: -p.rect.minX, y: -p.rect.minY)
        context.saveGState()
        context.clip(to: p.rect)
        page.draw(with: .mediaBox, to: context)
        context.restoreGState()
        // Highlights, in the page's display space.
        let toDisplay = page.transform(for: .mediaBox)
        for record in session.annotations where record.kind == .highlight {
            guard let rects = record.pdfRects else { continue }
            let color = PDFPresenter.nsColor(for: record.color ?? .yellow).usingColorSpace(.sRGB)?.cgColor ?? CGColor(gray: 1, alpha: 1)
            for r in rects where r.page == p.page {
                let shown = CGRect(x: r.x, y: r.y, width: r.width, height: r.height).applying(toDisplay)
                guard shown.intersects(p.rect) else { continue }
                context.saveGState()
                if record.color == .underline {
                    context.setFillColor(color)
                    context.fill(CGRect(x: shown.minX, y: shown.minY, width: shown.width, height: max(1, shown.height * 0.08)))
                } else {
                    context.setBlendMode(.multiply)
                    context.setFillColor(color)
                    context.fill(shown)
                }
                context.restoreGState()
            }
        }
        guard let image = context.makeImage() else { return nil }
        if tiles.count > 24 { tiles.removeAll() }
        tiles[u] = image
        return image
    }

    private func makeSpreadLayer() -> CALayer {
        let spread = CALayer()
        spread.frame = view.bounds
        let backing = view.window?.backingScaleFactor ?? 2
        for column in 0..<columns {
            guard let image = tileImage(for: unit + column) else { continue }
            let tile = CALayer()
            tile.frame = tileFrame(column: column)
            tile.contents = image
            tile.contentsScale = backing
            tile.contentsGravity = .resize
            spread.addSublayer(tile)
        }
        return spread
    }

    /// Shows the current unit; a non-zero direction slides the old spread out that way, as a book's pages do.
    private func present(direction: Int) {
        guard let root = view.layer else { return }
        let old = spreadLayer
        let new = makeSpreadLayer()
        spreadLayer = new
        view.set(path: nil, on: view.selectionLayer)
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        root.insertSublayer(new, at: 0)
        let width = view.bounds.width
        let slides = direction != 0 && settings.pageTurn == .slide && old != nil && width > 0
        if slides { new.position.x += CGFloat(direction) * width }
        CATransaction.commit()
        guard let old else { return }
        if slides {
            CATransaction.begin()
            CATransaction.setAnimationDuration(0.3)
            CATransaction.setAnimationTimingFunction(CAMediaTimingFunction(name: .easeInEaseOut))
            CATransaction.setCompletionBlock { old.removeFromSuperlayer() }
            old.position.x -= CGFloat(direction) * width
            new.position.x -= CGFloat(direction) * width
            CATransaction.commit()
        } else {
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            old.removeFromSuperlayer()
            CATransaction.commit()
        }
        drawFlash()
    }

    func viewResized() {
        guard ready else { return }
        computeGeometry()
        present(direction: 0)
        report()
    }

    // MARK: - Settings

    func applySettings() {
        applyTheme()
        computeGeometry()
        tiles.removeAll()
        present(direction: 0)
        session.pdfLayoutChanged(columns: columns, mode: .paginated)
        report()
    }

    /// The text size: 100% fills a column with the strip; smaller sizes put more of the page on a screen.
    func zoom(_ direction: Int) {
        var all = session.model.settings
        all.reader.pdfZoom = min(100, max(50, all.reader.pdfZoom + (direction > 0 ? 10 : -10)))
        session.model.settings = all
        applySettings()
    }

    // MARK: - Navigation

    private func show(unit target: Int, direction: Int) {
        let next = aligned(target)
        guard next != unit || direction == 0 else { return }
        unit = next
        flash = nil
        present(direction: direction)
        report()
    }

    func next() {
        if unit + columns < units { show(unit: unit + columns, direction: 1) } else { session.showEndCard = true }
    }

    func previous() {
        if unit > 0 { show(unit: unit - columns, direction: -1) }
    }

    func nextSection() {
        let page = unit / screensPerPage
        if let next = sections.first(where: { $0.page > page }) { go(toPage: next.page, slice: 0) } else { go(toPage: pageCount - 1, slice: 0) }
    }

    func previousSection() {
        let page = unit / screensPerPage
        go(toPage: sections.last { $0.page < page }?.page ?? 0, slice: 0)
    }

    func go(toPage index: Int, slice: Int) {
        let target = min(max(0, index), max(0, pageCount - 1)) * screensPerPage + min(max(0, slice), screensPerPage - 1)
        show(unit: target, direction: target > unit ? 1 : (target < unit ? -1 : 0))
    }

    func go(toUnit u: Int) {
        show(unit: u, direction: u > unit ? 1 : (u < unit ? -1 : 0))
    }

    func go(toFraction fraction: Double) {
        go(toUnit: whole((fraction * Double(max(0, units - 1))).rounded()))
    }

    /// Screens turn like pages; nothing scrolls.
    func canScroll(dx: CGFloat, dy: CGFloat) -> Bool { false }

    func handleTrackpad(_ event: NSEvent) -> Bool {
        guard let turn = swipe.handle(event, settings: settings, canScroll: { _, _ in false }) else { return false }
        if turn > 0 { next() } else if turn < 0 { previous() }
        return true
    }

    func handleKey(_ event: NSEvent) -> Bool {
        guard let scalar = event.charactersIgnoringModifiers?.unicodeScalars.first else { return false }
        switch Int(scalar.value) {
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
            go(toUnit: 0)
            return true
        case NSEndFunctionKey:
            go(toUnit: units - 1)
            return true
        default:
            return false
        }
    }

    // MARK: - Coordinates

    /// A view point to a point in the page's own space, through the tile it lands on.
    private func pagePoint(at point: NSPoint, in tile: (column: Int, unit: Int, page: Int, rect: CGRect, frame: CGRect)) -> NSPoint? {
        guard let document, let page = document.page(at: tile.page) else { return nil }
        let display = NSPoint(x: tile.rect.minX + (point.x - tile.frame.minX) / scale, y: tile.rect.minY + (point.y - tile.frame.minY) / scale)
        return display.applying(page.transform(for: .mediaBox).inverted())
    }

    /// A page-space rectangle to view coordinates, when the page is showing.
    private func viewRect(_ rect: CGRect, onPage pageIndex: Int) -> CGRect? {
        guard let document, let page = document.page(at: pageIndex) else { return nil }
        let display = rect.applying(page.transform(for: .mediaBox))
        for column in 0..<columns {
            guard let p = placement(of: unit + column), p.page == pageIndex, display.intersects(p.rect) else { continue }
            let frame = tileFrame(column: column)
            let x = frame.minX + (display.minX - p.rect.minX) * scale
            let y = frame.minY + (display.minY - p.rect.minY) * scale
            return CGRect(x: x, y: y, width: display.width * scale, height: display.height * scale).intersection(frame)
        }
        return nil
    }

    /// View (bottom-left origin) to the top-left-origin coordinates the SwiftUI overlays use.
    private func topLeft(_ rect: CGRect) -> CGRect {
        CGRect(x: rect.minX, y: view.bounds.height - rect.maxY, width: rect.width, height: rect.height)
    }

    // MARK: - Selection

    private var dragStart: NSPoint?
    private var dragTile: (column: Int, unit: Int, page: Int, rect: CGRect, frame: CGRect)?

    func mouseDown(at point: NSPoint, clicks: Int) {
        dragStart = point
        dragTile = tile(at: point)
        selection = nil
        selectionPage = nil
        guard let tile = dragTile, let document, let page = document.page(at: tile.page), let pagePoint = pagePoint(at: point, in: tile) else {
            drawSelection()
            return
        }
        if clicks == 2 { selection = page.selectionForWord(at: pagePoint) } else if clicks >= 3 { selection = page.selectionForLine(at: pagePoint) }
        if selection != nil { selectionPage = tile.page }
        drawSelection()
    }

    func mouseDragged(to point: NSPoint) {
        guard let start = dragStart, let tile = dragTile, let document, let page = document.page(at: tile.page),
              let from = pagePoint(at: start, in: tile), let to = pagePoint(at: point, in: tile) else { return }
        selection = page.selection(from: from, to: to)
        selectionPage = tile.page
        drawSelection()
    }

    func mouseUp(at point: NSPoint) {
        defer { dragStart = nil }
        if let selection, let pageIndex = selectionPage, let text = selection.string, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, let document, let page = document.page(at: pageIndex) {
            let rect = viewRect(selection.bounds(for: page), onPage: pageIndex) ?? CGRect(x: point.x, y: point.y, width: 1, height: 1)
            session.pdfSelectionChanged(text: HTMLText.collapse(text), rect: topLeft(rect), page: pageIndex)
            return
        }
        // A click: on a highlight?
        if let start = dragStart, hypot(point.x - start.x, point.y - start.y) < 4, let tile = tile(at: point), let pagePoint = pagePoint(at: point, in: tile) {
            for record in session.annotations where record.kind == .highlight {
                guard let rects = record.pdfRects else { continue }
                for r in rects where r.page == tile.page {
                    let rect = CGRect(x: r.x, y: r.y, width: r.width, height: r.height)
                    if rect.insetBy(dx: -2, dy: -2).contains(pagePoint) {
                        let shown = viewRect(rect, onPage: tile.page) ?? CGRect(x: point.x, y: point.y, width: 1, height: 1)
                        session.pdfHighlightTapped(record.id, rect: topLeft(shown))
                        return
                    }
                }
            }
        }
        session.pdfSelectionChanged(text: nil, rect: .zero, page: 0)
    }

    private func drawSelection() {
        guard let selection, let pageIndex = selectionPage, let document, let page = document.page(at: pageIndex) else {
            view.set(path: nil, on: view.selectionLayer)
            return
        }
        let path = CGMutablePath()
        for line in selection.selectionsByLine() {
            if let rect = viewRect(line.bounds(for: page), onPage: pageIndex) { path.addRect(rect) }
        }
        view.set(path: path, on: view.selectionLayer)
    }

    private func drawFlash() {
        guard let flash, let document, let page = flash.pages.first else {
            view.set(path: nil, on: view.flashLayer)
            return
        }
        let pageIndex = document.index(for: page)
        let path = CGMutablePath()
        for line in flash.selectionsByLine() {
            if let rect = viewRect(line.bounds(for: page), onPage: pageIndex) { path.addRect(rect) }
        }
        view.set(path: path, on: view.flashLayer)
    }

    func clearSelection() {
        selection = nil
        selectionPage = nil
        drawSelection()
    }

    // MARK: - Highlights

    func highlightSelection(color: HighlightColor) -> Annotation? {
        guard let selection, let document else { return nil }
        guard let record = PDFPresenter.highlightRecord(for: selection, in: document, color: color, chapter: session.position.chapter) else { return nil }
        clearSelection()
        redrawAfterHighlightChange()
        return record
    }

    func removeHighlight(_ id: UUID) { redrawAfterHighlightChange() }
    func recolor(_ id: UUID) { redrawAfterHighlightChange() }
    func setNote(_ note: String, for id: UUID) {}

    private func redrawAfterHighlightChange() {
        // The session has already updated its records; tiles draw from them.
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.tiles.removeAll()
            self.present(direction: 0)
        }
    }

    // MARK: - Search

    func search(_ query: String) {
        guard let document else {
            session.pdfSearchResults([], for: query)
            return
        }
        let found = PDFPresenter.searchHits(for: query, in: document, sections: sections, unitsPerPage: screensPerPage)
        hits = found.selections
        session.pdfSearchResults(found.hits, for: query)
    }

    func show(_ hit: SearchHit) {
        guard let document, let selection = hits[hit.id], let page = selection.pages.first else {
            go(toPage: hit.locator.spine, slice: 0)
            return
        }
        let pageIndex = document.index(for: page)
        let display = selection.bounds(for: page).applying(page.transform(for: .mediaBox))
        var target = pageIndex * screensPerPage
        for within in 0..<screensPerPage {
            if let p = placement(of: pageIndex * screensPerPage + within), p.rect.intersects(display) {
                target = pageIndex * screensPerPage + within
                break
            }
        }
        show(unit: target, direction: target > unit ? 1 : (target < unit ? -1 : 0))
        flash = selection
        drawFlash()
    }

    // MARK: - Pointer

    func pointerMoved(to point: NSPoint) {
        session.pointerMoved(y: view.bounds.height - point.y)
    }
}

/// The screens' canvas: layers only, drawn by the presenter; mouse, keys and wheel go to it.
final class SplitPDFView: NSView {
    weak var presenter: SplitPDFPresenter?
    let selectionLayer = CAShapeLayer()
    let flashLayer = CAShapeLayer()
    private var trackingArea: NSTrackingArea?

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        layerUsesCoreImageFilters = true
        layer?.masksToBounds = true
        selectionLayer.fillColor = NSColor.controlAccentColor.withAlphaComponent(0.32).cgColor
        flashLayer.fillColor = NSColor.systemYellow.withAlphaComponent(0.4).cgColor
        layer?.addSublayer(flashLayer)
        layer?.addSublayer(selectionLayer)
    }

    required init?(coder: NSCoder) { return nil }

    override var acceptsFirstResponder: Bool { true }
    override var isOpaque: Bool { true }

    override func layout() {
        super.layout()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        selectionLayer.frame = bounds
        flashLayer.frame = bounds
        CATransaction.commit()
        presenter?.viewResized()
    }

    override func viewDidChangeBackingProperties() {
        super.viewDidChangeBackingProperties()
        presenter?.viewResized()
    }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let trackingArea { removeTrackingArea(trackingArea) }
        let area = NSTrackingArea(rect: .zero, options: [.mouseMoved, .activeInKeyWindow, .inVisibleRect], owner: self, userInfo: nil)
        addTrackingArea(area)
        trackingArea = area
    }

    override func resetCursorRects() {
        addCursorRect(bounds, cursor: .iBeam)
    }

    /// Shape layers animate path changes by default; selections and search flashes must just appear.
    func set(path: CGPath?, on layer: CAShapeLayer) {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        layer.path = path
        CATransaction.commit()
    }

    override func mouseMoved(with event: NSEvent) {
        presenter?.pointerMoved(to: convert(event.locationInWindow, from: nil))
    }

    override func mouseDown(with event: NSEvent) {
        window?.makeFirstResponder(self)
        presenter?.mouseDown(at: convert(event.locationInWindow, from: nil), clicks: event.clickCount)
    }

    override func mouseDragged(with event: NSEvent) {
        presenter?.mouseDragged(to: convert(event.locationInWindow, from: nil))
    }

    override func mouseUp(with event: NSEvent) {
        presenter?.mouseUp(at: convert(event.locationInWindow, from: nil))
    }

    override func scrollWheel(with event: NSEvent) {
        if presenter?.session.handleWheel(event) == true { return }
        if presenter?.handleTrackpad(event) == true { return }
    }

    override func keyDown(with event: NSEvent) {
        if presenter?.handleKey(event) == true { return }
        super.keyDown(with: event)
    }
}
