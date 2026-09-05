import AppKit
import CoreImage
import PDFKit
import QuartzCore
import SwiftUI
import BooksCore

/// What the split presenter learns about a PDF off the main thread before it can lay screens out: the document's
/// ink strips and the column profile that found them, every page's text lines, and — for documents that are not
/// very long — how much ink each row of each page carries within each strip, so screens can be cut where a blank
/// band crosses the whole strip, whether or not the page has extractable text. Kept beside the PDF, so a book is
/// analysed once.
struct SplitPreparation: Codable, Sendable {
    struct Line: Codable, Sendable {
        let minX: CGFloat, maxX: CGFloat, minY: CGFloat, maxY: CGFloat
        let text: String
        var height: CGFloat { maxY - minY }
    }

    /// One page's ink, from a small rendering.
    struct PageInk: Codable, Sendable {
        /// Per strip: ink pixels in each row of the page, top row first.
        let rows: [[Int]]
        /// The height of a row in page units.
        let rowHeight: CGFloat
        /// Pixels across a strip, per strip — the scale of the row counts.
        let stripWidths: [Int]
        /// The page's ink, all strips together, in display space; nil for a blank page.
        let box: CGRect?
    }

    static let currentVersion = 3

    var version = SplitPreparation.currentVersion
    /// The displayed width of the first page, which the column profile's bins divide.
    let pageWidth: CGFloat
    let strips: [CGRect]
    /// Ink in each of 200 vertical bins across the page width, summed over the sampled pages.
    let columnProfile: [Int]
    /// Per page, top to bottom.
    let lines: [[Line]]
    /// Per page; nil when the document was too long to render every page.
    let ink: [PageInk?]
    let typicalLineHeight: CGFloat
    /// Per page: the running header / page number line at the top and the footer at the bottom, if any.
    let headers: [Line?]
    let footers: [Line?]

    static func cacheURL(for pdf: URL) -> URL {
        pdf.deletingLastPathComponent().appendingPathComponent("split-v\(currentVersion).json")
    }
}

/// Zoom & Split: the reader's own presentation of a PDF as a book. Each page is cropped to the document's ink
/// (running headers, footers and page numbers cut away; two text columns read in order), the ink of all pages runs
/// on as one column, and that column is scaled so it fills one screen's width at the text size and cut into
/// screens on blank bands that cross the whole column — so a screen ends after a whole line or figure and the next
/// screen begins with the next, across page boundaries too, as a book's pages do. Above 100% the column is cut
/// into two or three parts side by side, each filling a screen. Screens show one or two to a spread and turn with
/// a slide. The drawing is the reader's own; selection, highlights, search and Look Up come from PDFKit's text.
@MainActor
final class SplitPDFPresenter: PDFReading {
    /// A run of one page's ink shown on a screen, and where it sits below the screen's top (page units).
    struct Piece {
        let page: Int
        let rect: CGRect
        let offset: CGFloat
    }

    struct Screen {
        var pieces: [Piece] = []
        /// Ink and gaps so far, in page units.
        var height: CGFloat = 0
    }

    /// A strip of the page (or part of one, above 100%) that the column reads through, with the strip whose row
    /// profile describes it.
    private struct Column {
        let rect: CGRect
        let strip: Int
    }

    let view = SplitPDFView()
    var hostView: NSView { view }
    unowned let session: ReaderSession
    private(set) var document: PDFDocument?
    private var sections: [PDFSection] = []
    private var hits: [UUID: PDFSelection] = [:]
    private var preparation: SplitPreparation?
    private var pageCount = 0
    private var opened = false
    /// Set once the first spread is up; before that, layout passes must not report or present.
    private var ready = false
    private var swipe = SwipeTurner()

    // Geometry, recomputed when the view, the spread or the text size changes.
    private(set) var columns = 2
    private var parts = 1
    private var activeColumns: [Column] = []
    private var scale: CGFloat = 1
    private var tileSize: CGSize = .zero
    private(set) var screenHeight: CGFloat = 0
    private(set) var screens: [Screen] = []
    /// The first screen showing each page, with the total at the end; and the last screen showing each page.
    private var pageStarts: [Int] = []
    private var pageEnds: [Int] = []
    private(set) var unit = 0
    /// The place to restore once screens exist (the view may not have been laid out when preparation finished).
    private var pendingRestore: (() -> Int)?
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
    var units: Int { screens.count }

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
        applyTheme()
        session.pdfPreparing(true)
        Task.detached(priority: .userInitiated) { [weak self] in
            let prepared = SplitPDFPresenter.prepare(url: url)
            await MainActor.run { [weak self] in self?.prepared(prepared) }
        }
    }

    private func prepared(_ prepared: SplitPreparation?) {
        session.pdfPreparing(false)
        guard document != nil else { return }
        guard let prepared else {
            session.error = "This PDF could not be opened."
            return
        }
        preparation = prepared
        computeGeometry()
        buildScreens()
        reportLayout()
        let saved = session.book.position
        let restore: () -> Int
        if let pdfPage = saved?.pdfPage {
            let slice = saved?.locator?.offset ?? 0
            restore = { [unowned self] in self.unitFor(page: pdfPage - 1, slice: slice) }
        } else if let percent = saved?.percent, percent > 0 {
            restore = { [unowned self] in whole((percent / 100 * Double(self.units)).rounded(.down)) }
        } else {
            restore = { 0 }
        }
        if units > 0 { unit = aligned(restore()) } else { pendingRestore = restore }
        ready = true
        present(direction: 0)
        report()
    }

    func close() {}

    private func reportLayout() {
        session.pdfOpened(units: units, pageStarts: pageStarts, sections: sections, columns: columns)
    }

    private func report() {
        guard units > 0, let first = screens[unit].pieces.first else { return }
        let page = first.page
        let slice = unit - pageStarts[page]
        let per = pageEnds[page] - pageStarts[page] + 1
        let label: String
        let rightPage = columns == 2 && unit + 1 < units ? screens[unit + 1].pieces.first?.page : nil
        if let rightPage, rightPage != page {
            label = "Pages \(page + 1)–\(rightPage + 1) of \(pageCount)"
        } else if per > 1 {
            label = rightPage != nil ? "Page \(page + 1) of \(pageCount) · \(slice + 1)–\(min(per, slice + 2))/\(per)" : "Page \(page + 1) of \(pageCount) · \(slice + 1)/\(per)"
        } else {
            label = "Page \(page + 1) of \(pageCount)"
        }
        session.pdfPositionChanged(unit: unit, units: units, page: page, slice: slice, label: label)
    }

    // MARK: - Preparation (off the main thread)

    /// The analysis of a PDF, from the cache beside it when that is newer than the PDF, else made and cached.
    nonisolated static func prepare(url: URL) -> SplitPreparation? {
        let cache = SplitPreparation.cacheURL(for: url)
        let cachedDate = try? cache.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate
        let sourceDate = try? url.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate
        if let cachedDate, let sourceDate, cachedDate >= sourceDate, let data = try? Data(contentsOf: cache),
           let stored = try? JSONDecoder().decode(SplitPreparation.self, from: data), stored.version == SplitPreparation.currentVersion {
            return stored
        }
        guard let made = analyse(url: url) else { return nil }
        if let data = try? JSONEncoder().encode(made) { try? data.write(to: cache, options: .atomic) }
        return made
    }

    /// Reads the document on its own thread and gathers what the layout needs.
    nonisolated static func analyse(url: URL) -> SplitPreparation? {
        guard let document = PDFDocument(url: url), document.pageCount > 0, let first = document.page(at: 0) else { return nil }
        let count = document.pageCount
        let pageSize = PDFPresenter.displaySize(of: first)
        let found = PDFPresenter.contentBoxes(of: document)
        var strips = found.boxes
        if strips.isEmpty { strips = [CGRect(origin: .zero, size: pageSize)] }
        // Every page is rendered small to find its blank bands; the longer the book, the smaller the rendering.
        let scanWidth = count <= 120 ? 480 : count <= 400 ? 320 : count <= 900 ? 220 : 0
        var lines: [[SplitPreparation.Line]] = []
        var ink: [SplitPreparation.PageInk?] = []
        lines.reserveCapacity(count)
        ink.reserveCapacity(count)
        for i in 0..<count {
            guard let page = document.page(at: i) else {
                lines.append([])
                ink.append(nil)
                continue
            }
            lines.append(textLines(of: page))
            ink.append(scanWidth > 0 ? pageInk(of: page, strips: strips, width: scanWidth) : nil)
        }
        let heights = lines.flatMap { $0.map(\.height) }.filter { $0 > 2 && $0 < 80 }.sorted()
        let typical = heights.isEmpty ? 12 : heights[heights.count / 2]
        let (headers, footers) = runningLines(lines, strips: strips, typical: typical)
        return SplitPreparation(pageWidth: pageSize.width, strips: strips, columnProfile: found.profile, lines: lines, ink: ink, typicalLineHeight: typical, headers: headers, footers: footers)
    }

    /// The page's text lines in display space, top to bottom.
    nonisolated static func textLines(of page: PDFPage) -> [SplitPreparation.Line] {
        guard let all = page.selection(for: page.bounds(for: .mediaBox)) else { return [] }
        let toDisplay = page.transform(for: .mediaBox)
        var out: [SplitPreparation.Line] = []
        for line in all.selectionsByLine() {
            let b = line.bounds(for: page).applying(toDisplay)
            guard b.width > 0.5, b.height > 0.5 else { continue }
            out.append(SplitPreparation.Line(minX: b.minX, maxX: b.maxX, minY: b.minY, maxY: b.maxY, text: line.string ?? ""))
        }
        return out.sorted { $0.maxY > $1.maxY }
    }

    /// How much ink each row of the page carries within each strip, and where the page's ink lies, from a small
    /// rendering `width` pixels across.
    nonisolated static func pageInk(of page: PDFPage, strips: [CGRect], width: Int) -> SplitPreparation.PageInk? {
        let size = PDFPresenter.displaySize(of: page)
        guard size.width > 0, size.height > 0, width > 0 else { return nil }
        let height = max(1, Int((CGFloat(width) * size.height / size.width).rounded()))
        let image = page.thumbnail(of: NSSize(width: width, height: height), for: .mediaBox)
        guard let tiff = image.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff), rep.bitsPerSample == 8, !rep.isPlanar, let data = rep.bitmapData else { return nil }
        let w = rep.pixelsWide, h = rep.pixelsHigh, spp = rep.samplesPerPixel, rowBytes = rep.bytesPerRow
        let alphaFirst = rep.bitmapFormat.contains(.alphaFirst)
        let colorOffset = alphaFirst && rep.hasAlpha ? 1 : 0
        let sx = CGFloat(w) / size.width
        // Strip x-ranges in pixels.
        let ranges: [Range<Int>] = strips.map { strip in
            let a = max(0, min(w, Int((strip.minX * sx).rounded(.down)))), b = max(a, min(w, Int((strip.maxX * sx).rounded(.up))))
            return a..<b
        }
        var rows = [[Int]](repeating: [Int](repeating: 0, count: h), count: strips.count)
        var minX = w, maxX = -1, minY = h, maxY = -1, total = 0
        for y in 0..<h {
            let rowStart = data + y * rowBytes
            for x in 0..<w {
                let p = rowStart + x * spp
                let luminance: Int
                if spp - colorOffset >= 3 {
                    luminance = (Int(p[colorOffset]) * 299 + Int(p[colorOffset + 1]) * 587 + Int(p[colorOffset + 2]) * 114) / 1000
                } else {
                    luminance = Int(p[colorOffset])
                }
                let alpha = rep.hasAlpha ? Int(p[alphaFirst ? 0 : spp - 1]) : 255
                guard luminance < 225 && alpha > 40 else { continue }
                total += 1
                if x < minX { minX = x }
                if x > maxX { maxX = x }
                if y < minY { minY = y }
                if y > maxY { maxY = y }
                for (s, range) in ranges.enumerated() where range.contains(x) { rows[s][y] += 1 }
            }
        }
        let rowHeight = size.height / CGFloat(h)
        var box: CGRect?
        if total >= 20, maxX >= minX, maxY >= minY {
            let px = size.width / CGFloat(w)
            box = CGRect(x: CGFloat(minX) * px, y: size.height - CGFloat(maxY + 1) * rowHeight, width: CGFloat(maxX - minX + 1) * px, height: CGFloat(maxY - minY + 1) * rowHeight)
        }
        return SplitPreparation.PageInk(rows: rows, rowHeight: rowHeight, stripWidths: ranges.map { max(1, $0.count) }, box: box)
    }

    /// Running headers and footers: the topmost or bottommost line of a page, when the same words (numbers aside)
    /// top or tail a quarter of the pages, or when the line is nothing but a page number.
    nonisolated static func runningLines(_ lines: [[SplitPreparation.Line]], strips: [CGRect], typical: CGFloat) -> ([SplitPreparation.Line?], [SplitPreparation.Line?]) {
        let top = strips.map(\.maxY).max() ?? 0, bottom = strips.map(\.minY).min() ?? 0
        let zone = typical * 2.5
        func key(_ text: String) -> String {
            var s = text.lowercased().replacingOccurrences(of: "[0-9]+", with: "#", options: .regularExpression)
            s = s.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression).trimmingCharacters(in: .whitespacesAndNewlines)
            return s
        }
        func isNumber(_ text: String) -> Bool {
            let t = text.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            guard !t.isEmpty, t.count <= 12 else { return false }
            return t.range(of: "^[-–—•·.\\s]*([0-9]+|[ivxlcdm]+)[-–—•·.\\s]*$", options: .regularExpression) != nil
        }
        var topCounts: [String: Int] = [:], bottomCounts: [String: Int] = [:]
        var tops: [SplitPreparation.Line?] = [], bottoms: [SplitPreparation.Line?] = []
        for pageLines in lines {
            // Headers and footers are short; a body line that happens to end a page is not.
            let t = pageLines.first.flatMap { $0.minY > top - zone && $0.height < typical * 2.5 && $0.text.count <= 60 ? $0 : nil }
            let b = pageLines.last.flatMap { $0.maxY < bottom + zone && $0.height < typical * 2.5 && $0.text.count <= 60 && pageLines.count > 1 ? $0 : nil }
            tops.append(t)
            bottoms.append(b)
            if let t { topCounts[key(t.text), default: 0] += 1 }
            if let b { bottomCounts[key(b.text), default: 0] += 1 }
        }
        let threshold = max(3, lines.count / 4)
        var headers: [SplitPreparation.Line?] = [], footers: [SplitPreparation.Line?] = []
        for i in 0..<lines.count {
            let t = tops[i], b = bottoms[i]
            headers.append(t.flatMap { (topCounts[key($0.text), default: 0] >= threshold || isNumber($0.text)) ? $0 : nil })
            footers.append(b.flatMap { (bottomCounts[key($0.text), default: 0] >= threshold || isNumber($0.text)) ? $0 : nil })
        }
        return (headers, footers)
    }

    // MARK: - Ink profile helpers

    /// Ink in the row of a strip at a display-space y, as a fraction of the strip's width; nil without a scan.
    private func inkFraction(page: Int, strip: Int, y: CGFloat) -> Double? {
        guard let p = preparation, page < p.ink.count, let ink = p.ink[page], strip < ink.rows.count, ink.rowHeight > 0, let pageSize = pageSize(page) else { return nil }
        let row = Int(((pageSize.height - y) / ink.rowHeight).rounded(.down))
        guard row >= 0, row < ink.rows[strip].count else { return 0 }
        return Double(ink.rows[strip][row]) / Double(max(1, ink.stripWidths[strip]))
    }

    /// For the self-test: how inked the band is where a screen was cut.
    func inkFraction(page: Int, y: CGFloat) -> Double? {
        guard let column = activeColumns.first else { return nil }
        return inkFraction(page: page, strip: column.strip, y: y)
    }

    private var pageSizes: [Int: CGSize] = [:]
    private func pageSize(_ page: Int) -> CGSize? {
        if let cached = pageSizes[page] { return cached }
        guard let document, let p = document.page(at: page) else { return nil }
        let size = PDFPresenter.displaySize(of: p)
        pageSizes[page] = size
        return size
    }

    // MARK: - Geometry

    private func aligned(_ u: Int) -> Int {
        let clamped = min(max(0, u), max(0, units - 1))
        return columns == 2 ? clamped - clamped % 2 : clamped
    }

    /// Text sizes: 50–100% fill a column with the whole strip; 200% and 300% cut the strip into two or three parts
    /// side by side, each filling a column.
    static func zoomSteps() -> [Int] { [50, 60, 70, 80, 90, 100, 200, 300] }

    /// Scale and screen height follow the view: the widest column fills one tile's width at the text size; the
    /// tile's height in page units is a screen.
    private func computeGeometry() {
        let size = view.bounds.size
        guard let preparation, size.width > 60, size.height > 60 else { return }
        columns = settings.spread == .one ? 1 : 2
        let zoom = min(300, max(50, settings.pdfZoom))
        parts = zoom > 100 ? max(2, min(3, zoom / 100)) : 1
        activeColumns = SplitPDFPresenter.columns(of: preparation, parts: parts)
        guard let widest = activeColumns.map(\.rect.width).max(), widest > 0 else { return }
        let availableWidth = size.width - 2 * sideMargin - CGFloat(columns - 1) * gutter
        let tileWidth = max(40, availableWidth / CGFloat(columns))
        let tileHeight = max(40, size.height - topMargin - bottomMargin)
        scale = tileWidth / widest * (parts > 1 ? 1 : CGFloat(zoom) / 100)
        tileSize = CGSize(width: tileWidth, height: tileHeight)
        screenHeight = tileHeight / scale
    }

    /// The strips as read: whole, or each cut into parts at the quietest vertical bands near the even divisions.
    private static func columns(of p: SplitPreparation, parts: Int) -> [Column] {
        var out: [Column] = []
        for (index, strip) in p.strips.enumerated() {
            guard parts > 1, strip.width > 0 else {
                out.append(Column(rect: strip, strip: index))
                continue
            }
            var cuts: [CGFloat] = [strip.minX]
            let bins = p.columnProfile.count
            let binWidth = bins > 0 && p.pageWidth > 0 ? p.pageWidth / CGFloat(bins) : 0
            for k in 1..<parts {
                let target = strip.minX + strip.width * CGFloat(k) / CGFloat(parts)
                var cut = target
                if binWidth > 0 {
                    let window = strip.width * 0.15
                    let lo = max(0, Int((target - window) / binWidth)), hi = min(bins - 1, Int((target + window) / binWidth))
                    if lo <= hi {
                        var best = lo, bestInk = Int.max
                        for bin in lo...hi {
                            let ink = p.columnProfile[bin]
                            let distance = abs(CGFloat(bin) * binWidth + binWidth / 2 - target)
                            // Quietest wins; among equals, the one nearest the even division.
                            if ink < bestInk || (ink == bestInk && distance < abs(CGFloat(best) * binWidth + binWidth / 2 - target)) {
                                best = bin
                                bestInk = ink
                            }
                        }
                        cut = CGFloat(best) * binWidth + binWidth / 2
                    }
                }
                cuts.append(cut)
            }
            cuts.append(strip.maxX)
            for k in 0..<parts {
                let overlap = strip.width * 0.01
                let x0 = max(strip.minX, cuts[k] - (k > 0 ? overlap : 0)), x1 = min(strip.maxX, cuts[k + 1] + (k + 1 < parts ? overlap : 0))
                out.append(Column(rect: CGRect(x: x0, y: strip.minY, width: max(1, x1 - x0), height: strip.height), strip: index))
            }
        }
        return out
    }

    /// One page's runs of ink for a column: the column's rectangle, cut below the page's header and above its
    /// footer, and ending where the strip's ink ends on that page (by its row profile; by its text lines where there
    /// is no profile). Nil for a page with no ink there.
    private func segment(page: Int, column: Column) -> CGRect? {
        guard let p = preparation else { return nil }
        let typical = p.typicalLineHeight
        let lines = page < p.lines.count ? p.lines[page] : []
        let header = page < p.headers.count ? p.headers[page] : nil
        let footer = page < p.footers.count ? p.footers[page] : nil
        let body = lines.filter { l in !(header.map { $0.minY == l.minY && $0.maxY == l.maxY } ?? false) && !(footer.map { $0.minY == l.minY && $0.maxY == l.maxY } ?? false) }
        var top = column.rect.maxY
        var bottom = column.rect.minY
        if let header {
            if let next = body.first(where: { $0.maxY <= header.minY }) { top = min(top, (header.minY + next.maxY) / 2) } else { top = min(top, header.minY - 1) }
        }
        if let footer {
            if let previous = body.last(where: { $0.minY >= footer.maxY }) { bottom = max(bottom, (footer.maxY + previous.minY) / 2) } else { bottom = max(bottom, footer.maxY + 1) }
        }
        if page < p.ink.count, let ink = p.ink[page], let pageSize = pageSize(page) {
            // The strip's own ink on this page: its first and last inked rows.
            guard column.strip < ink.rows.count else { return nil }
            let rows = ink.rows[column.strip]
            let quiet = max(1, ink.stripWidths[column.strip] / 200)
            let topRow = max(0, Int(((pageSize.height - top) / ink.rowHeight).rounded(.down)))
            let bottomRow = min(rows.count - 1, Int(((pageSize.height - bottom) / ink.rowHeight).rounded(.up)))
            guard topRow <= bottomRow, let first = (topRow...bottomRow).first(where: { rows[$0] > quiet }), let last = (topRow...bottomRow).last(where: { rows[$0] > quiet }) else { return nil }
            let pad = ink.rowHeight
            var inkTop = min(top, pageSize.height - CGFloat(first) * ink.rowHeight + pad)
            var inkBottom = max(bottom, pageSize.height - CGFloat(last + 1) * ink.rowHeight - pad)
            // Never cut into a line of text the rendering might have thinned away.
            if let l = body.first(where: { $0.minY < inkTop && $0.maxY > inkTop && $0.maxX > column.rect.minX && $0.minX < column.rect.maxX }) { inkTop = max(inkTop, l.maxY + 0.5) }
            if let l = body.first(where: { $0.minY < inkBottom && $0.maxY > inkBottom && $0.maxX > column.rect.minX && $0.minX < column.rect.maxX }) { inkBottom = min(inkBottom, l.minY - 0.5) }
            top = min(top, inkTop)
            bottom = max(bottom, inkBottom)
        } else if !lines.isEmpty {
            // No rendering: trust the text.
            let inColumn = body.filter { $0.maxX > column.rect.minX && $0.minX < column.rect.maxX }
            if let first = inColumn.first, let last = inColumn.last {
                top = min(top, first.maxY + typical * 0.35)
                bottom = max(bottom, last.minY - typical * 0.35)
            }
        }
        guard top - bottom >= max(2, typical * 0.5) else { return nil }
        var rect = CGRect(x: column.rect.minX, y: bottom, width: column.rect.width, height: top - bottom)
        // A page whose ink runs wider than the document's strip (a table, a figure) keeps all of it; the piece is
        // drawn smaller to fit the column.
        if parts == 1, preparation?.strips.count == 1, page < p.ink.count, let box = p.ink[page]?.box {
            let pad = typical * 0.35
            let minX = min(rect.minX, box.minX - pad), maxX = max(rect.maxX, box.maxX + pad)
            rect = CGRect(x: minX, y: rect.minY, width: maxX - minX, height: rect.height)
        }
        return rect
    }

    /// Where to end a screen whose nominal bottom is `nominal`, within a column of a page: the lowest blank band
    /// in the reach above it, so the screen stays as full as it can while nothing is cut through. Blank means the
    /// row profile shows next to no ink across the column; a midpoint between two lines of text counts when the
    /// profile does not disagree. With neither, the row with the least ink.
    private func cut(nominal: CGFloat, top: CGFloat, page: Int, column: Column, reach: CGFloat) -> CGFloat {
        guard let p = preparation else { return nominal }
        let typical = p.typicalLineHeight
        let highest = min(top - typical * 0.9, nominal + reach)
        guard highest > nominal else { return nominal }
        let lines = (page < p.lines.count ? p.lines[page] : []).filter { $0.maxX > column.rect.minX && $0.minX < column.rect.maxX }
        // Midpoints between consecutive lines, lowest first.
        var midpoints: [CGFloat] = []
        for i in 1..<max(1, lines.count) {
            let above = lines[i - 1], below = lines[i]
            guard below.maxY < above.minY + 0.5 else { continue }
            let m = (below.maxY + above.minY) / 2
            if m >= nominal && m <= highest { midpoints.append(m) }
        }
        midpoints.sort()
        let ink = page < p.ink.count ? p.ink[page] : nil
        guard let ink, column.strip < ink.rows.count, let pageSize = pageSize(page), ink.rowHeight > 0 else {
            return midpoints.first ?? nominal
        }
        let rows = ink.rows[column.strip]
        let width = max(1, ink.stripWidths[column.strip])
        let quiet = max(1, width / 100)
        func rowIndex(_ y: CGFloat) -> Int { min(rows.count - 1, max(0, Int(((pageSize.height - y) / ink.rowHeight).rounded(.down)))) }
        // A text midpoint whose row is quiet is exact: take the lowest.
        for m in midpoints where rows[rowIndex(m)] <= max(quiet, width / 12) { return m }
        // Else the lowest blank band: rows from the nominal upward, the first run of quiet rows, cut at its centre.
        let lowRow = rowIndex(nominal), highRow = rowIndex(highest)
        guard highRow <= lowRow else { return midpoints.first ?? nominal }
        var r = lowRow
        while r >= highRow {
            if rows[r] <= quiet {
                var start = r
                while start - 1 >= highRow, rows[start - 1] <= quiet { start -= 1 }
                let centre = CGFloat(start + r + 1) / 2
                return pageSize.height - centre * ink.rowHeight
            }
            r -= 1
        }
        if let m = midpoints.first { return m }
        // Nothing blank: the least ink.
        var best = lowRow
        for r in highRow...lowRow where rows[r] < rows[best] { best = r }
        return pageSize.height - (CGFloat(best) + 0.5) * ink.rowHeight
    }

    /// Cuts the column of ink into screens: a screen takes as much as fits, ends on a blank band so nothing is cut
    /// through, and runs on into the next page (after a small gap) when a page ends with room to spare.
    private func buildScreens() {
        guard let preparation, screenHeight > 0, !activeColumns.isEmpty else { return }
        let typical = preparation.typicalLineHeight
        let gap = typical * 0.6
        let minimum = typical * 1.5
        let reach = max(typical * 1.5, screenHeight * 0.08)
        var out: [Screen] = []
        var current = Screen()
        var starts = [Int](repeating: -1, count: pageCount), ends = [Int](repeating: -1, count: pageCount)
        func touch(_ page: Int, _ index: Int) {
            if starts[page] < 0 { starts[page] = index }
            ends[page] = index
        }
        for page in 0..<pageCount {
            for column in activeColumns {
                guard let segment = segment(page: page, column: column) else { continue }
                var top = segment.maxY
                var guardCount = 0
                while top - segment.minY > 0.5, guardCount < 400 {
                    guardCount += 1
                    if !current.pieces.isEmpty { current.height += gap }
                    let room = screenHeight - current.height
                    if room < minimum && !current.pieces.isEmpty {
                        current.height -= gap
                        out.append(current)
                        current = Screen()
                        continue
                    }
                    var bottom = top - max(room, minimum)
                    var full = true
                    if bottom <= segment.minY + 0.5 {
                        bottom = segment.minY
                        full = false
                    } else {
                        bottom = max(bottom, min(top - 0.5, cut(nominal: bottom, top: top, page: page, column: column, reach: reach)))
                    }
                    let index = out.count
                    current.pieces.append(Piece(page: page, rect: CGRect(x: segment.minX, y: bottom, width: segment.width, height: top - bottom), offset: current.height))
                    current.height += top - bottom
                    touch(page, index)
                    top = bottom
                    if full || screenHeight - current.height < minimum {
                        out.append(current)
                        current = Screen()
                    }
                }
            }
        }
        if !current.pieces.isEmpty { out.append(current) }
        if out.isEmpty {
            // Nothing found to show (a document with no ink at all): whole pages, one a screen.
            for page in 0..<pageCount {
                let size = pageSize(page) ?? CGSize(width: 612, height: 792)
                out.append(Screen(pieces: [Piece(page: page, rect: CGRect(origin: .zero, size: size), offset: 0)], height: size.height))
                touch(page, page)
            }
        }
        // Pages without ink share the screen where the flow was at the time.
        var lastEnd = 0
        for page in 0..<pageCount {
            if starts[page] < 0 {
                starts[page] = min(lastEnd, out.count - 1)
                ends[page] = starts[page]
            } else {
                lastEnd = ends[page]
            }
        }
        screens = out
        pageStarts = starts + [out.count]
        pageEnds = ends
        tiles.removeAll()
        if unit >= units { unit = max(0, units - 1) }
    }

    /// The screen that shows a place on a page (its first, when the place is not on any).
    private func unitContaining(page: Int, y: CGFloat) -> Int {
        guard pageCount > 0, !pageStarts.isEmpty else { return 0 }
        let p = min(max(0, page), pageCount - 1)
        for u in pageStarts[p]...max(pageStarts[p], pageEnds[p]) where u < units {
            if screens[u].pieces.contains(where: { $0.page == p && $0.rect.minY - 0.5 <= y && y <= $0.rect.maxY + 0.5 }) { return u }
        }
        return min(pageStarts[p], max(0, units - 1))
    }

    private func unitFor(page: Int, slice: Int) -> Int {
        guard pageCount > 0, !pageStarts.isEmpty else { return 0 }
        let p = min(max(0, page), pageCount - 1)
        return min(pageStarts[p] + max(0, slice), max(pageStarts[p], pageEnds[p]), max(0, units - 1))
    }

    /// Where the tile of a column sits in the view (bottom-left origin).
    private func tileFrame(column: Int) -> CGRect {
        CGRect(x: sideMargin + CGFloat(column) * (tileSize.width + gutter), y: bottomMargin, width: tileSize.width, height: tileSize.height)
    }

    /// The scale a piece is drawn at: the layout's, unless the piece is wider than the tile.
    private func pieceScale(_ piece: Piece, in frame: CGRect) -> CGFloat {
        piece.rect.width > 0 ? min(scale, frame.width / piece.rect.width) : scale
    }

    /// Where a piece of a screen sits inside its tile (bottom-left origin, view points): centred, below the pieces above.
    private func pieceFrame(_ piece: Piece, in frame: CGRect) -> CGRect {
        let s = pieceScale(piece, in: frame)
        let width = piece.rect.width * s, height = piece.rect.height * s
        let x = frame.midX - width / 2
        let top = frame.maxY - piece.offset * scale
        return CGRect(x: x, y: top - height, width: width, height: height)
    }

    struct PieceHit {
        let column: Int
        let unit: Int
        let piece: Piece
        let frame: CGRect
    }

    /// The piece under a view point.
    private func pieceHit(at point: NSPoint) -> PieceHit? {
        for column in 0..<columns {
            let frame = tileFrame(column: column)
            let u = unit + column
            guard frame.contains(point), u < units else { continue }
            for piece in screens[u].pieces {
                let pf = pieceFrame(piece, in: frame)
                if pf.insetBy(dx: -4, dy: -2).contains(point) { return PieceHit(column: column, unit: u, piece: piece, frame: pf) }
            }
        }
        return nil
    }

    // MARK: - Drawing

    private func applyTheme() {
        let theme = PDFPresenter.themeFilters(for: session.effectiveTheme)
        view.layer?.filters = theme.filters.isEmpty ? nil : theme.filters
        view.layer?.backgroundColor = theme.background.cgColor
    }

    /// One screen as an image at the window's scale: the paper, each piece's page drawn through its rectangle, and
    /// the highlights that fall on it.
    private func tileImage(for u: Int) -> CGImage? {
        if let cached = tiles[u] { return cached }
        guard let document, u >= 0, u < units else { return nil }
        let backing = view.window?.backingScaleFactor ?? 2
        let width = Int(tileSize.width * backing), height = Int(tileSize.height * backing)
        guard width > 0, height > 0, let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        context.setFillColor(CGColor(gray: 1, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        context.interpolationQuality = .high
        let tile = CGRect(origin: .zero, size: tileSize)
        for piece in screens[u].pieces {
            guard let page = document.page(at: piece.page) else { continue }
            let dest = pieceFrame(piece, in: tile)
            let s = pieceScale(piece, in: tile)
            context.saveGState()
            context.translateBy(x: dest.minX * backing, y: dest.minY * backing)
            context.scaleBy(x: backing * s, y: backing * s)
            context.translateBy(x: -piece.rect.minX, y: -piece.rect.minY)
            context.clip(to: piece.rect)
            page.draw(with: .mediaBox, to: context)
            // Highlights, in the page's display space.
            let toDisplay = page.transform(for: .mediaBox)
            for record in session.annotations where record.kind == .highlight {
                guard let rects = record.pdfRects else { continue }
                let color = PDFPresenter.nsColor(for: record.color ?? .yellow).usingColorSpace(.sRGB)?.cgColor ?? CGColor(gray: 1, alpha: 1)
                for r in rects where r.page == piece.page {
                    let shown = CGRect(x: r.x, y: r.y, width: r.width, height: r.height).applying(toDisplay)
                    guard shown.intersects(piece.rect) else { continue }
                    context.saveGState()
                    context.setFillColor(color)
                    if record.color == .underline {
                        context.fill(CGRect(x: shown.minX, y: shown.minY, width: shown.width, height: max(0.8, shown.height * 0.08)))
                    } else {
                        context.setBlendMode(.multiply)
                        context.fill(shown)
                    }
                    context.restoreGState()
                }
            }
            context.restoreGState()
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
        drawFlash()
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
    }

    /// Re-lays the screens out for a new size, spread or text size, keeping the place: the top of the first piece.
    private func relayout() {
        let anchor = units > 0 ? screens[unit].pieces.first : nil
        let before = (tileSize, screenHeight, columns, parts)
        computeGeometry()
        if before == (tileSize, screenHeight, columns, parts) && !screens.isEmpty { return }
        buildScreens()
        if let pendingRestore, units > 0 {
            unit = aligned(pendingRestore())
            self.pendingRestore = nil
        } else if let anchor {
            unit = aligned(unitContaining(page: anchor.page, y: anchor.rect.maxY - 0.5))
        }
        reportLayout()
    }

    func viewResized() {
        guard ready else { return }
        relayout()
        present(direction: 0)
        report()
    }

    // MARK: - Settings

    func applySettings() {
        applyTheme()
        guard ready else { return }
        relayout()
        tiles.removeAll()
        present(direction: 0)
        session.pdfLayoutChanged(columns: columns, mode: .paginated)
        report()
    }

    /// The text size steps: 50–100% fill a column with the strip; 200% and 300% cut it into parts.
    func zoom(_ direction: Int) {
        var all = session.model.settings
        let steps = SplitPDFPresenter.zoomSteps()
        let current = all.reader.pdfZoom
        let index = steps.lastIndex(where: { $0 <= current }) ?? 0
        let next = direction > 0 ? min(steps.count - 1, index + 1) : max(0, steps[index] < current ? index : index - 1)
        all.reader.pdfZoom = steps[next]
        session.model.settings = all
        applySettings()
    }

    // MARK: - Navigation

    private func show(unit target: Int, direction: Int) {
        guard units > 0 else { return }
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

    private var currentPage: Int { units > 0 ? (screens[unit].pieces.first?.page ?? 0) : 0 }

    func nextSection() {
        let page = currentPage
        if let next = sections.first(where: { $0.page > page }) { go(toPage: next.page, slice: 0) } else { go(toPage: pageCount - 1, slice: 0) }
    }

    func previousSection() {
        let page = currentPage
        go(toPage: sections.last { $0.page < page }?.page ?? 0, slice: 0)
    }

    func go(toPage index: Int, slice: Int) {
        let target = unitFor(page: index, slice: slice)
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

    /// A view point to a point in the page's own space, through the piece it lands on (or the piece a drag began in).
    private func pagePoint(at point: NSPoint, in hit: PieceHit) -> NSPoint? {
        guard let document, let page = document.page(at: hit.piece.page), hit.frame.width > 0 else { return nil }
        let s = hit.frame.width / hit.piece.rect.width
        let display = NSPoint(x: hit.piece.rect.minX + (point.x - hit.frame.minX) / s, y: hit.piece.rect.minY + (point.y - hit.frame.minY) / s)
        return display.applying(page.transform(for: .mediaBox).inverted())
    }

    /// A page-space rectangle to view coordinates, when the page is showing (the union over the pieces it crosses).
    private func viewRect(_ rect: CGRect, onPage pageIndex: Int) -> CGRect? {
        guard let document, let page = document.page(at: pageIndex) else { return nil }
        let display = rect.applying(page.transform(for: .mediaBox))
        var union: CGRect?
        for column in 0..<columns {
            let u = unit + column
            guard u < units else { continue }
            let frame = tileFrame(column: column)
            for piece in screens[u].pieces where piece.page == pageIndex {
                let part = display.intersection(piece.rect)
                guard !part.isNull, part.width > 0, part.height > 0 else { continue }
                let pf = pieceFrame(piece, in: frame)
                let s = pieceScale(piece, in: frame)
                let shown = CGRect(x: pf.minX + (part.minX - piece.rect.minX) * s, y: pf.minY + (part.minY - piece.rect.minY) * s, width: part.width * s, height: part.height * s)
                union = union.map { $0.union(shown) } ?? shown
            }
        }
        return union
    }

    /// View (bottom-left origin) to the top-left-origin coordinates the SwiftUI overlays use.
    private func topLeft(_ rect: CGRect) -> CGRect {
        CGRect(x: rect.minX, y: view.bounds.height - rect.maxY, width: rect.width, height: rect.height)
    }

    // MARK: - Selection

    private var dragStart: NSPoint?
    private var dragHit: PieceHit?

    func mouseDown(at point: NSPoint, clicks: Int) {
        dragStart = point
        dragHit = pieceHit(at: point)
        selection = nil
        selectionPage = nil
        guard let hit = dragHit, let document, let page = document.page(at: hit.piece.page), let pagePoint = pagePoint(at: point, in: hit) else {
            drawSelection()
            return
        }
        if clicks == 2 { selection = page.selectionForWord(at: pagePoint) } else if clicks >= 3 { selection = page.selectionForLine(at: pagePoint) }
        if selection != nil { selectionPage = hit.piece.page }
        drawSelection()
    }

    func mouseDragged(to point: NSPoint) {
        guard let start = dragStart, let hit = dragHit, let document, let page = document.page(at: hit.piece.page),
              let from = pagePoint(at: start, in: hit), let to = pagePoint(at: point, in: hit) else { return }
        selection = page.selection(from: from, to: to)
        selectionPage = hit.piece.page
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
        if let start = dragStart, hypot(point.x - start.x, point.y - start.y) < 4, let hit = pieceHit(at: point), let pagePoint = pagePoint(at: point, in: hit) {
            for record in session.annotations where record.kind == .highlight {
                guard let rects = record.pdfRects else { continue }
                for r in rects where r.page == hit.piece.page {
                    let rect = CGRect(x: r.x, y: r.y, width: r.width, height: r.height)
                    if rect.insetBy(dx: -2, dy: -2).contains(pagePoint) {
                        let shown = viewRect(rect, onPage: hit.piece.page) ?? CGRect(x: point.x, y: point.y, width: 1, height: 1)
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
        // The session updates its records right after asking; tiles draw from them.
        DispatchQueue.main.async { [weak self] in
            guard let self, self.ready else { return }
            self.tiles.removeAll()
            self.present(direction: 0)
        }
    }

    // MARK: - Search

    func search(_ query: String) {
        guard let document, ready else {
            session.pdfSearchResults([], for: query)
            return
        }
        let found = PDFPresenter.searchHits(for: query, in: document, sections: sections, unitOfPage: { [self] page in pageStarts.isEmpty ? page : pageStarts[min(page, pageCount - 1)] })
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
        let target = unitContaining(page: pageIndex, y: display.midY)
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
