import AppKit
import CoreImage
import PDFKit
import QuartzCore
import SwiftUI
import BooksCore

/// What the split presenter learns about a PDF off the main thread before it can lay screens out: every page's
/// size and ink strips (pages of one size share strips, so a cover never clips the body), every page's text lines,
/// and — for documents that are not very long — how much ink each row of each page carries, so screens are cut
/// only where a blank band crosses the page, whether or not the page has extractable text. Kept beside the PDF, so
/// a book is analysed once.
struct SplitPreparation: Codable, Sendable {
    struct Line: Codable, Sendable {
        let minX: CGFloat, maxX: CGFloat, minY: CGFloat, maxY: CGFloat
        let text: String
        var height: CGFloat { maxY - minY }
    }

    /// One page's ink, from a small rendering.
    struct PageInk: Codable, Sendable {
        /// Ink pixels in each row of the page, across its whole width, top row first.
        let rows: [Int]
        /// The same within each strip, for pages with two text columns (their lines do not align).
        let stripRows: [[Int]]?
        /// The height of a row in page units.
        let rowHeight: CGFloat
        /// Pixels across the rendering — the scale of the row counts.
        let width: Int
        /// The page's ink in display space; nil for a blank page.
        let box: CGRect?
    }

    /// The ink pixels of a rendering, kept only while the analysis runs (not cached).
    struct Bitmap {
        let width: Int, height: Int
        let inked: [Bool]
        let rowHeight: CGFloat
        let columnWidth: CGFloat
    }

    static let currentVersion = 8

    /// A run of ink between two blank bands on a strip — a line of text, a heading, a picture band — and where the
    /// blank gaps between its words fall, so it can be rewrapped.
    struct Run: Codable, Sendable {
        var top: CGFloat, bottom: CGFloat
        /// The ink's extent across the strip.
        var minX: CGFloat, maxX: CGFloat
        /// The gaps between words, left to right, as pairs (start, end) flattened; empty for a picture or a single word.
        var gaps: [CGFloat]
        var height: CGFloat { top - bottom }
    }

    var version = SplitPreparation.currentVersion
    /// Per page, the displayed size (rotation applied).
    let pageSizes: [CGSize]
    /// Per page, the strips of ink the column reads through: one, or two for two-column pages.
    let strips: [[CGRect]]
    /// Per page, top to bottom.
    let lines: [[Line]]
    /// Per page; nil when the document was too long to render every page.
    let ink: [PageInk?]
    /// Per page, per strip: the runs of ink, top to bottom (from the rendering; from the text lines without one).
    let runs: [[[Run]]]
    let typicalLineHeight: CGFloat
    /// Per page: the lines of the running header (title, page number) at the top and of the footer at the bottom.
    let headers: [[Line]]
    let footers: [[Line]]
    /// The widest strip among pages of the commonest size: what 100% is measured against.
    let bodyStripWidth: CGFloat

    static func cacheURL(for pdf: URL) -> URL {
        pdf.deletingLastPathComponent().appendingPathComponent("split-v\(currentVersion).json")
    }
}

/// Zoom & Split: the reader's own presentation of a PDF as a book. Each page is cropped to its ink (running
/// headers, footers and page numbers cut away; two text columns read in order), the ink of all pages runs on as one
/// column at the text size, and that column is dealt out to screens block by block — a block being the ink between
/// two blank bands that cross the page — so nothing is ever cut through: a block that does not fit moves whole to
/// the next screen, a picture taller than a screen is shown fitted to one, and a picture-only page stands alone.
/// Past the width of a column, each line is cut into its words at the blank gaps between them and the words are laid
/// out again in shorter lines that fit — the page's own glyphs, rewrapped — so the text keeps growing while two pages
/// stay side by side. Screens turn with a slide. The drawing is the reader's own; selection, highlights, search,
/// links and Look Up come from PDFKit.
@MainActor
final class SplitPDFPresenter: PDFReading {
    /// A run of one page's ink shown on a screen: where it sits below the screen's top (view points), and whether
    /// it is drawn fitted to the screen (a picture) rather than at the text size.
    struct Piece {
        let page: Int
        let rect: CGRect
        let offset: CGFloat
        var fitted = false
        /// A rewrapped word: its left edge from the tile's left, in view points. Nil centres the piece.
        var x: CGFloat? = nil
    }

    struct Screen {
        var pieces: [Piece] = []
        /// View points used so far.
        var height: CGFloat = 0
        /// A picture-only page, shown alone and centred.
        var standalone = false
    }

    /// A run of ink between two blank bands, in display space, with the gaps between its words.
    private struct Block {
        let top: CGFloat
        let bottom: CGFloat
        var minX: CGFloat = 0
        var maxX: CGFloat = 0
        var gaps: [CGFloat] = []
        var height: CGFloat { top - bottom }
        /// The words, left to right, as display-space rectangles over the run's band: the ink between the gaps.
        var words: [CGRect] {
            var out: [CGRect] = []
            var start = minX
            var i = 0
            while i + 1 < gaps.count {
                out.append(CGRect(x: start, y: bottom, width: max(0.5, gaps[i] - start), height: height))
                start = gaps[i + 1]
                i += 2
            }
            out.append(CGRect(x: start, y: bottom, width: max(0.5, maxX - start), height: height))
            return out
        }
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
    private var blockCache: [Int: [Block]] = [:]

    // Geometry, recomputed when the view, the spread or the text size changes.
    private(set) var columns = 2
    private(set) var scale: CGFloat = 1
    private var tileSize: CGSize = .zero
    /// The height of a screen in view points.
    var screenPoints: CGFloat { tileSize.height }
    private(set) var screens: [Screen] = []
    /// The first screen showing each page, with the total at the end; and the last screen showing each page.
    private var pageStarts: [Int] = []
    private var pageEnds: [Int] = []
    private(set) var unit = 0
    /// The place to restore once screens exist (the view may not have been laid out when preparation finished).
    private var pendingRestore: (() -> Int)?
    private var tiles: [Int: CGImage] = [:]
    /// Pages rendered once at a pixel scale, for cutting rewrapped words out of.
    private var pageImages: [String: (image: CGImage, area: CGRect, pixelScale: CGFloat)] = [:]
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
        guard let prepared, prepared.pageSizes.count == pageCount else {
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
        guard let document = PDFDocument(url: url), document.pageCount > 0 else { return nil }
        let count = document.pageCount
        let sizes: [CGSize] = (0..<count).map { document.page(at: $0).map { PDFPresenter.displaySize(of: $0) } ?? CGSize(width: 612, height: 792) }
        // Pages of one size share strips (a text block sits in the same place on every body page); odd sizes —
        // covers, plates — use their own ink.
        var groups: [String: [Int]] = [:]
        for i in 0..<count { groups["\(Int(sizes[i].width.rounded()))x\(Int(sizes[i].height.rounded()))", default: []].append(i) }
        var strips = [[CGRect]](repeating: [], count: count)
        var bodyWidth: CGFloat = 0, bodyCount = 0
        for pages in groups.values where pages.count >= 3 {
            let boxes = PDFPresenter.contentBoxes(of: document, pages: pages)
            for p in pages { strips[p] = boxes }
            if pages.count > bodyCount {
                bodyCount = pages.count
                bodyWidth = boxes.map(\.width).max() ?? 0
            }
        }
        // Every page is rendered small to find its blank bands; the longer the book, the smaller the rendering.
        let scanWidth = count <= 300 ? 640 : count <= 700 ? 480 : count <= 1200 ? 360 : 0
        var lines: [[SplitPreparation.Line]] = []
        var ink: [SplitPreparation.PageInk?] = []
        var runs: [[[SplitPreparation.Run]]] = []
        lines.reserveCapacity(count)
        ink.reserveCapacity(count)
        runs.reserveCapacity(count)
        for i in 0..<count {
            guard let page = document.page(at: i) else {
                lines.append([])
                ink.append(nil)
                runs.append([])
                if strips[i].isEmpty { strips[i] = [CGRect(origin: .zero, size: sizes[i])] }
                continue
            }
            let pageLines = textLines(of: page)
            lines.append(pageLines)
            let scanned = scanWidth > 0 ? pageInk(of: page, strips: strips[i], width: scanWidth) : nil
            ink.append(scanned?.ink)
            if strips[i].isEmpty {
                let media = CGRect(origin: .zero, size: sizes[i])
                strips[i] = [scanned?.ink.box.map { $0.insetBy(dx: -sizes[i].width * 0.015, dy: -sizes[i].width * 0.015).intersection(media) } ?? media]
            }
            if let scanned {
                runs.append(strips[i].indices.map { runsOf(strip: $0, strips: strips[i], bitmap: scanned.bitmap, ink: scanned.ink, lines: pageLines, size: sizes[i]) })
            } else {
                // No rendering: lines of text are the runs; without text, the whole strip is one.
                runs.append(strips[i].map { strip in
                    let inStrip = pageLines.filter { $0.maxX > strip.minX && $0.minX < strip.maxX }
                    if inStrip.isEmpty { return [SplitPreparation.Run(top: strip.maxY, bottom: strip.minY, minX: strip.minX, maxX: strip.maxX, gaps: [])] }
                    return inStrip.map { SplitPreparation.Run(top: $0.maxY, bottom: $0.minY, minX: $0.minX, maxX: $0.maxX, gaps: []) }
                })
            }
        }
        if bodyWidth <= 0 { bodyWidth = strips.flatMap { $0 }.map(\.width).max() ?? 400 }
        let heights = lines.flatMap { $0.map(\.height) }.filter { $0 > 2 && $0 < 80 }.sorted()
        let typical = heights.isEmpty ? 12 : heights[heights.count / 2]
        let (headers, footers) = runningLines(lines, sizes: sizes, typical: typical)
        return SplitPreparation(pageSizes: sizes, strips: strips, lines: lines, ink: ink, runs: runs, typicalLineHeight: typical, headers: headers, footers: footers, bodyStripWidth: bodyWidth)
    }

    /// The runs of ink on a strip between blank bands, top to bottom, each with the gaps between its words. Rows a
    /// text line crosses count as inked, so a tall heading's thin rows never split it. A gap is a word gap when it
    /// is at least three tenths of the run's height wide. Afterwards each run's band is squared up: rows holding only
    /// the tips of descenders or accents (too faint to count as ink) rejoin their line, a text line's own box gives
    /// lines of one paragraph one height, and a margin of a row is added on either side — never past the midpoint to
    /// the next run.
    nonisolated static func runsOf(strip index: Int, strips: [CGRect], bitmap: SplitPreparation.Bitmap, ink: SplitPreparation.PageInk, lines: [SplitPreparation.Line], size: CGSize) -> [SplitPreparation.Run] {
        let strip = strips[index]
        let w = bitmap.width, h = bitmap.height
        let rows = ink.stripRows.flatMap { index < $0.count ? $0[index] : nil } ?? ink.rows
        let width = ink.stripRows != nil ? max(1, w / max(1, strips.count)) : w
        let quiet = max(1, width / 100)
        var inked = rows.map { $0 > quiet }
        let inStrip = lines.filter { $0.maxX > strip.minX && $0.minX < strip.maxX && $0.height > 1 }
        for line in inStrip {
            let inset = line.height * 0.2
            let first = max(0, Int(((size.height - (line.maxY - inset)) / bitmap.rowHeight).rounded(.down)))
            let last = min(inked.count - 1, Int(((size.height - (line.minY + inset)) / bitmap.rowHeight).rounded(.down)))
            if first <= last { for r in first...last { inked[r] = true } }
        }
        // Words are measured across the whole page when the page has one column (a long line may run past the
        // strip the size group shares); within the strip when it has two.
        let scan = strips.count == 1 ? CGRect(x: 0, y: 0, width: size.width, height: size.height) : strip
        let x0 = max(0, min(w - 1, Int((scan.minX / bitmap.columnWidth).rounded(.down))))
        let x1 = max(x0, min(w - 1, Int((scan.maxX / bitmap.columnWidth).rounded(.up))))
        let pad = bitmap.columnWidth
        var out: [SplitPreparation.Run] = []
        var y = 0
        while y < h {
            guard inked[y] else {
                y += 1
                continue
            }
            let start = y
            while y < h, inked[y] { y += 1 }
            // Ink per column across the band, for the extent and the word gaps.
            var columns = [Int](repeating: 0, count: x1 - x0 + 1)
            for r in start..<y {
                let base = r * w
                for x in x0...x1 where bitmap.inked[base + x] { columns[x - x0] += 1 }
            }
            guard let firstInk = columns.firstIndex(where: { $0 > 0 }), let lastInk = columns.lastIndex(where: { $0 > 0 }) else { continue }
            let gapMin = max(2, Int((CGFloat(y - start) * 0.3).rounded()))
            var gaps: [CGFloat] = []
            var gapStart = -1
            for x in firstInk...lastInk {
                if columns[x] == 0 {
                    if gapStart < 0 { gapStart = x }
                } else if gapStart >= 0 {
                    if x - gapStart >= gapMin {
                        // Each word reaches a pixel into the gap, so its edge letters keep their anti-aliased rims.
                        gaps.append(CGFloat(x0 + gapStart) * bitmap.columnWidth + pad)
                        gaps.append(CGFloat(x0 + x) * bitmap.columnWidth - pad)
                    }
                    gapStart = -1
                }
            }
            out.append(SplitPreparation.Run(top: size.height - CGFloat(start) * bitmap.rowHeight, bottom: size.height - CGFloat(y) * bitmap.rowHeight,
                                            minX: CGFloat(x0 + firstInk) * bitmap.columnWidth - pad, maxX: CGFloat(x0 + lastInk + 1) * bitmap.columnWidth + pad, gaps: gaps))
        }
        guard !out.isEmpty else { return out }
        // The page's typical line: the median height of runs that are more than a couple of rows tall.
        let tall = out.map(\.height).filter { $0 > bitmap.rowHeight * 2.5 }.sorted()
        let typical = tall.isEmpty ? (out.map(\.height).max() ?? 10) : tall[tall.count / 2]
        // A text line's own box (ascent to descent) gives every line of a paragraph the same height.
        for i in out.indices {
            let band = out[i]
            // A line belongs to the run when at least half of its box lies within the band (boxes of neighbouring
            // lines overlap a little in tight setting).
            let crossing = inStrip.filter { min($0.maxY, band.top) - max($0.minY, band.bottom) >= $0.height * 0.5 && $0.height < typical * 2.5 }
            if let top = crossing.map(\.maxY).max(), let bottom = crossing.map(\.minY).min() {
                out[i].top = max(band.top, top)
                out[i].bottom = min(band.bottom, bottom)
            }
        }
        // Fragments — the tips of letters in rows too faint to count — rejoin the nearer line.
        var merged: [SplitPreparation.Run] = []
        for run in out {
            if run.height < typical * 0.35, let last = merged.last, last.bottom - run.top < typical * 0.6 {
                merged[merged.count - 1].top = max(last.top, run.top)
                merged[merged.count - 1].bottom = min(last.bottom, run.bottom)
                merged[merged.count - 1].minX = min(last.minX, run.minX)
                merged[merged.count - 1].maxX = max(last.maxX, run.maxX)
                continue
            }
            if let last = merged.last, last.height < typical * 0.35, last.bottom - run.top < typical * 0.6 {
                merged[merged.count - 1] = SplitPreparation.Run(top: max(last.top, run.top), bottom: min(last.bottom, run.bottom), minX: min(last.minX, run.minX), maxX: max(last.maxX, run.maxX), gaps: run.gaps)
                continue
            }
            merged.append(run)
        }
        // Specks that could not rejoin a line — a hair-thin, narrow run on its own — are dropped; a wide one (a rule) stays.
        merged = merged.filter { $0.height >= typical * 0.25 || $0.maxX - $0.minX > strip.width * 0.3 }
        // A margin of a row above and below, never past the midpoint to the neighbouring run (measured before any
        // adjustment, so two runs whose boxes overlapped meet exactly at that midpoint).
        let margin = bitmap.rowHeight
        let middles: [CGFloat] = (0..<max(0, merged.count - 1)).map { (merged[$0].bottom + merged[$0 + 1].top) / 2 }
        for i in merged.indices {
            let above = i > 0 ? middles[i - 1] : size.height
            let below = i < middles.count ? middles[i] : 0
            merged[i].top = min(merged[i].top + margin, above)
            merged[i].bottom = max(merged[i].bottom - margin, below)
        }
        return merged
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

    /// How much ink each row of the page carries (across the page, and within each strip when there are two), where
    /// the page's ink lies, and the ink pixels themselves (for the runs), from a small rendering `width` pixels across.
    nonisolated static func pageInk(of page: PDFPage, strips: [CGRect], width: Int) -> (ink: SplitPreparation.PageInk, bitmap: SplitPreparation.Bitmap)? {
        let size = PDFPresenter.displaySize(of: page)
        guard size.width > 0, size.height > 0, width > 0 else { return nil }
        let height = max(1, Int((CGFloat(width) * size.height / size.width).rounded()))
        let image = page.thumbnail(of: NSSize(width: width, height: height), for: .mediaBox)
        guard let tiff = image.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff), rep.bitsPerSample == 8, !rep.isPlanar, let data = rep.bitmapData else { return nil }
        let w = rep.pixelsWide, h = rep.pixelsHigh, spp = rep.samplesPerPixel, rowBytes = rep.bytesPerRow
        let alphaFirst = rep.bitmapFormat.contains(.alphaFirst)
        let colorOffset = alphaFirst && rep.hasAlpha ? 1 : 0
        let sx = CGFloat(w) / size.width
        let perStrip = strips.count == 2
        let ranges: [Range<Int>] = perStrip ? strips.map { strip in
            let a = max(0, min(w, Int((strip.minX * sx).rounded(.down)))), b = max(a, min(w, Int((strip.maxX * sx).rounded(.up))))
            return a..<b
        } : []
        var rows = [Int](repeating: 0, count: h)
        var stripRows = perStrip ? [[Int]](repeating: [Int](repeating: 0, count: h), count: strips.count) : []
        var inkedPixels = [Bool](repeating: false, count: w * h)
        var minX = w, maxX = -1, minY = h, maxY = -1, total = 0
        for y in 0..<h {
            let rowStart = data + y * rowBytes
            var count = 0
            for x in 0..<w {
                let p = rowStart + x * spp
                let luminance: Int
                if spp - colorOffset >= 3 {
                    luminance = (Int(p[colorOffset]) * 299 + Int(p[colorOffset + 1]) * 587 + Int(p[colorOffset + 2]) * 114) / 1000
                } else {
                    luminance = Int(p[colorOffset])
                }
                let alpha = rep.hasAlpha ? Int(p[alphaFirst ? 0 : spp - 1]) : 255
                // Darker than the grey speckle of a scan, so noise between lines does not join them.
                guard luminance < 160 && alpha > 40 else { continue }
                inkedPixels[y * w + x] = true
                count += 1
                if x < minX { minX = x }
                if x > maxX { maxX = x }
                if y < minY { minY = y }
                if y > maxY { maxY = y }
                if perStrip { for (s, range) in ranges.enumerated() where range.contains(x) { stripRows[s][y] += 1 } }
            }
            rows[y] = count
            total += count
        }
        let rowHeight = size.height / CGFloat(h)
        var box: CGRect?
        if total >= 20, maxX >= minX, maxY >= minY {
            let px = size.width / CGFloat(w)
            box = CGRect(x: CGFloat(minX) * px, y: size.height - CGFloat(maxY + 1) * rowHeight, width: CGFloat(maxX - minX + 1) * px, height: CGFloat(maxY - minY + 1) * rowHeight)
        }
        let ink = SplitPreparation.PageInk(rows: rows, stripRows: perStrip ? stripRows : nil, rowHeight: rowHeight, width: w, box: box)
        return (ink, SplitPreparation.Bitmap(width: w, height: h, inked: inkedPixels, rowHeight: rowHeight, columnWidth: size.width / CGFloat(w)))
    }

    /// Running headers and footers: the band of lines in a page's top or bottom margin (the outer 12% of the page)
    /// that stands off from the body by a clear gap and is a page number, words that recur on a quarter of the
    /// pages, or at most two short lines. Whole bands, so a running title and its page number go together.
    nonisolated static func runningLines(_ lines: [[SplitPreparation.Line]], sizes: [CGSize], typical: CGFloat) -> (headers: [[SplitPreparation.Line]], footers: [[SplitPreparation.Line]]) {
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
        /// The lines in the margin zone that a gap separates from the body, nearest the edge first. A row with a page
        /// number needs only a small gap: scans often set the running head close to the text.
        func band(_ zone: [SplitPreparation.Line], fromTop: Bool) -> [SplitPreparation.Line] {
            guard !zone.isEmpty else { return [] }
            // Group lines sharing a baseline row, then walk away from the edge until the gap to the next row is clear.
            var rows: [[SplitPreparation.Line]] = []
            for line in zone {
                if let last = rows.last, let ref = last.first, abs(ref.minY - line.minY) < typical * 0.6 { rows[rows.count - 1].append(line) } else { rows.append([line]) }
            }
            var out: [SplitPreparation.Line] = []
            for (i, row) in rows.enumerated() {
                out.append(contentsOf: row)
                let edge = fromTop ? row.map(\.minY).min()! : row.map(\.maxY).max()!
                if i + 1 < rows.count {
                    let nextRow = rows[i + 1]
                    let nextEdge = fromTop ? nextRow.map(\.maxY).max()! : nextRow.map(\.minY).min()!
                    let gap = fromTop ? edge - nextEdge : nextEdge - edge
                    if gap >= typical * 1.2 || (gap >= typical * 0.4 && out.contains(where: { isNumber($0.text) })) { return out }
                } else {
                    return []   // the zone ran into the body with no clear gap
                }
            }
            return []
        }
        var headerBands: [[SplitPreparation.Line]] = [], footerBands: [[SplitPreparation.Line]] = []
        var topCounts: [String: Int] = [:], bottomCounts: [String: Int] = [:]
        for (i, pageLines) in lines.enumerated() {
            let height = i < sizes.count ? sizes[i].height : 792
            let sorted = pageLines.sorted { $0.maxY > $1.maxY }
            let topZone = sorted.filter { $0.maxY >= height * 0.88 && $0.height < typical * 2.5 }
            let bottomZone = sorted.filter { $0.minY <= height * 0.12 && $0.height < typical * 2.5 }.reversed()
            let h = band(topZone, fromTop: true), f = band(Array(bottomZone), fromTop: false)
            headerBands.append(h)
            footerBands.append(f)
            for l in h { topCounts[key(l.text), default: 0] += 1 }
            for l in f { bottomCounts[key(l.text), default: 0] += 1 }
        }
        let threshold = max(3, lines.count / 4)
        func qualifies(_ band: [SplitPreparation.Line], _ counts: [String: Int]) -> Bool {
            guard !band.isEmpty, band.count <= 4 else { return false }
            if band.contains(where: { isNumber($0.text) }) { return true }
            if band.contains(where: { counts[key($0.text), default: 0] >= threshold }) { return true }
            return band.count <= 2 && band.reduce(0) { $0 + $1.text.count } <= 40
        }
        for i in 0..<lines.count {
            if !qualifies(headerBands[i], topCounts) { headerBands[i] = [] }
            if !qualifies(footerBands[i], bottomCounts) { footerBands[i] = [] }
        }
        return (headerBands, footerBands)
    }

    // MARK: - Ink

    private func pageSize(_ page: Int) -> CGSize {
        guard let p = preparation, page < p.pageSizes.count else { return CGSize(width: 612, height: 792) }
        return p.pageSizes[page]
    }

    /// The row counts that describe a strip of a page: the strip's own on a two-column page, else the whole page's.
    private func rows(page: Int, strip: Int) -> (rows: [Int], rowHeight: CGFloat, width: Int)? {
        guard let p = preparation, page < p.ink.count, let ink = p.ink[page], ink.rowHeight > 0 else { return nil }
        if let stripRows = ink.stripRows, strip < stripRows.count { return (stripRows[strip], ink.rowHeight, max(1, ink.width / max(1, stripRows.count))) }
        return (ink.rows, ink.rowHeight, ink.width)
    }

    /// Ink in the row at a display-space y, as a fraction of the width; nil without a scan.
    func inkFraction(page: Int, y: CGFloat) -> Double? {
        guard let r = rows(page: page, strip: 0) else { return nil }
        let row = Int(((pageSize(page).height - y) / r.rowHeight).rounded(.down))
        guard row >= 0, row < r.rows.count else { return 0 }
        return Double(r.rows[row]) / Double(max(1, r.width))
    }

    /// The runs of ink on a page's strip between blank bands, top to bottom, from the analysis.
    private func blocks(page: Int, strip: Int) -> [Block] {
        let key = page * 4 + strip
        if let cached = blockCache[key] { return cached }
        guard let p = preparation, page < p.runs.count, strip < p.runs[page].count else { return [] }
        let out = p.runs[page][strip].map { Block(top: $0.top, bottom: $0.bottom, minX: $0.minX, maxX: $0.maxX, gaps: $0.gaps) }
        blockCache[key] = out
        return out
    }

    /// Whether a block is a picture rather than text: no line of text crosses it.
    private func isPicture(_ block: Block, page: Int) -> Bool {
        guard let p = preparation else { return false }
        return !p.lines[page].contains { $0.minY < block.top && $0.maxY > block.bottom }
    }

    /// A page that is a picture and nothing else (a cover, a plate): ink over much of the page, and either no text
    /// or ink that is one solid block (a cover's title, read by OCR, does not make it text).
    private func isPicturePage(_ page: Int) -> Bool {
        guard let p = preparation, page < p.lines.count, page < p.ink.count, let box = p.ink[page]?.box else { return false }
        let size = pageSize(page)
        guard box.width * box.height >= size.width * size.height * 0.35 else { return false }
        if p.lines[page].isEmpty { return true }
        let runs = blocks(page: page, strip: 0)
        return runs.count <= 2 && (runs.map(\.height).max() ?? 0) >= size.height * 0.5
    }

    // MARK: - Geometry

    private func aligned(_ u: Int) -> Int {
        let clamped = min(max(0, u), max(0, units - 1))
        return columns == 2 ? clamped - clamped % 2 : clamped
    }

    /// The text size is the page's own scale: 100% shows ink at its printed size. The pages stay as chosen, side by
    /// side; when a line no longer fits its column, the lines are rewrapped into shorter ones (see `buildScreens`).
    private func computeGeometry() {
        let size = view.bounds.size
        guard preparation != nil, size.width > 60, size.height > 60 else { return }
        columns = settings.spread == .one ? 1 : 2
        scale = CGFloat(min(400, max(50, settings.pdfZoom))) / 100
        let availableWidth = size.width - 2 * sideMargin - CGFloat(columns - 1) * gutter
        tileSize = CGSize(width: max(40, availableWidth / CGFloat(columns)), height: max(40, size.height - topMargin - bottomMargin))
    }

    /// For the self-test: whether any screen shows rewrapped words.
    var rewrapped: Bool { screens.contains { $0.pieces.contains { $0.x != nil } } }

    /// One page's run of a strip for the column: the strip's columns, over the page's own ink from top to bottom
    /// (the group's strip is a median; a full page runs past it), cut below the page's header band and above its
    /// footer band.
    private func segment(page: Int, strip: Int) -> CGRect? {
        guard let p = preparation, page < p.strips.count, strip < p.strips[page].count else { return nil }
        let rect = p.strips[page][strip]
        let size = pageSize(page)
        let lines = page < p.lines.count ? p.lines[page] : []
        let header = page < p.headers.count ? p.headers[page] : []
        let footer = page < p.footers.count ? p.footers[page] : []
        let pad = p.typicalLineHeight * 0.35
        var top = rect.maxY, bottom = rect.minY
        if page < p.ink.count, let box = p.ink[page]?.box {
            top = max(top, min(size.height, box.maxY + pad))
            bottom = min(bottom, max(0, box.minY - pad))
        } else if let first = lines.first, let last = lines.last {
            top = max(top, min(size.height, first.maxY + pad))
            bottom = min(bottom, max(0, last.minY - pad))
        }
        func isBand(_ l: SplitPreparation.Line, _ band: [SplitPreparation.Line]) -> Bool { band.contains { $0.minY == l.minY && $0.maxY == l.maxY && $0.minX == l.minX } }
        let body = lines.filter { !isBand($0, header) && !isBand($0, footer) }
        if let bandBottom = header.map(\.minY).min() {
            if let next = body.first(where: { $0.maxY <= bandBottom }) { top = min(top, (bandBottom + next.maxY) / 2) } else { top = min(top, bandBottom - 1) }
        }
        if let bandTop = footer.map(\.maxY).max() {
            if let previous = body.last(where: { $0.minY >= bandTop }) { bottom = max(bottom, (bandTop + previous.minY) / 2) } else { bottom = max(bottom, bandTop + 1) }
        }
        guard top - bottom > 1 else { return nil }
        var minX = rect.minX, maxX = rect.maxX
        // A page inked wider than its group's strip (a table, a figure, a wide line) keeps all of it; a piece wider
        // than the tile is drawn smaller to fit.
        if p.strips[page].count == 1, page < p.ink.count, let box = p.ink[page]?.box {
            minX = max(0, min(minX, box.minX - pad))
            maxX = min(size.width, max(maxX, box.maxX + pad))
        }
        return CGRect(x: minX, y: bottom, width: maxX - minX, height: top - bottom)
    }

    /// Deals the column of ink out to screens block by block. A block that does not fit the room left moves whole
    /// to the next screen; a block of text taller than a screen is cut between its lines; a picture taller than a
    /// screen is fitted to one; a picture-only page stands alone. Pieces keep the page's own spacing between the
    /// blocks they span; a small gap separates pieces of different pages on one screen.
    private func buildScreens() {
        guard let p = preparation, tileSize.height > 0, scale > 0 else { return }
        let typical = p.typicalLineHeight
        let pageGap = typical * 0.6 * scale
        var out: [Screen] = []
        var current = Screen()
        var starts = [Int](repeating: -1, count: pageCount), ends = [Int](repeating: -1, count: pageCount)
        func touch(_ page: Int, _ index: Int) {
            if starts[page] < 0 { starts[page] = index }
            ends[page] = index
        }
        func push() {
            if !current.pieces.isEmpty { out.append(current) }
            current = Screen()
        }
        // The piece being extended on the current screen, if any.
        var open: (page: Int, strip: Int, rect: CGRect, offset: CGFloat)?
        func closeOpen() {
            if let o = open { current.pieces.append(Piece(page: o.page, rect: o.rect, offset: o.offset)) }
            open = nil
        }
        // Rewrapped text: the line being filled, carried from page to page so a sentence runs on across a page break.
        var lineWords: [(page: Int, rect: CGRect, x: CGFloat)] = []
        var lineX: CGFloat = 0
        var lineHeight: CGFloat = 0
        var lineGapPoints = typical * 0.3 * scale
        var lastWord: (page: Int, rect: CGRect)?
        var previousEndedShort = false
        func flushLine() {
            guard !lineWords.isEmpty else { return }
            let h = lineHeight * scale
            let lead = current.pieces.isEmpty ? 0 : lineGapPoints
            if current.height + lead + h > tileSize.height, !current.pieces.isEmpty { push() }
            if !current.pieces.isEmpty { current.height += lineGapPoints }
            for word in lineWords {
                current.pieces.append(Piece(page: word.page, rect: word.rect, offset: current.height, x: word.x))
                touch(word.page, out.count)
            }
            current.height += h
            lineWords = []
            lineX = 0
            lineHeight = 0
            lastWord = nil
        }
        /// Lines wider than the tile at this size are cut into their words at the blank gaps between them and laid
        /// out again in shorter lines that fit, keeping the page's own spacing between words, its line gap between
        /// lines and its indents at paragraph starts. A screen ends before a line that would not fit whole.
        func flowWords(page: Int, strip: Int, seg: CGRect) {
            closeOpen()
            let maxWidth = tileSize.width
            let runs = blocks(page: page, strip: strip).filter { $0.bottom < seg.maxY && $0.top > seg.minY }
            var gaps: [CGFloat] = []
            for i in 1..<max(1, runs.count) { gaps.append(max(0, runs[i - 1].bottom - runs[i].top)) }
            if !gaps.isEmpty { lineGapPoints = gaps.sorted()[gaps.count / 2] * scale }
            let space = typical * 0.3
            // The text's own edges on this page: an indent is measured from the left one, a paragraph's short last
            // line against the right one (a ragged setting falls short by a little on every line; the end of a
            // paragraph by much more).
            let bodyRuns = runs.filter { $0.height > typical * 0.5 }
            let leftEdge = bodyRuns.map(\.minX).min() ?? seg.minX
            let rightEdge = bodyRuns.map(\.maxX).max() ?? seg.maxX
            let indentMin = max(5, typical * 0.8)
            let shortMin = max(typical * 3, (rightEdge - leftEdge) * 0.12)
            for run in runs {
                if isPicture(run, page: page), run.height > typical * 2.5 {
                    flushLine()
                    let h = run.height * scale
                    if current.height + h > tileSize.height, !current.pieces.isEmpty { push() }
                    let rect = CGRect(x: seg.minX, y: run.bottom, width: seg.width, height: run.height)
                    let fitted = h > tileSize.height || seg.width * scale > tileSize.width
                    current.pieces.append(Piece(page: page, rect: rect, offset: current.height, fitted: fitted))
                    current.height = fitted ? tileSize.height : current.height + h
                    touch(page, out.count)
                    if fitted { push() }
                    previousEndedShort = true
                    continue
                }
                let indented = run.height >= typical * 0.5 && run.minX > leftEdge + indentMin
                if indented || previousEndedShort, !lineWords.isEmpty { flushLine() }
                if lineWords.isEmpty, indented { lineX = min(maxWidth * 0.3, (run.minX - leftEdge) * scale) }
                for word in run.words {
                    let gap: CGFloat = lastWord.map { last in
                        last.page == page && abs(last.rect.midY - word.midY) < 0.5 * max(last.rect.height, word.height) ? max(0, word.minX - last.rect.maxX) : space
                    } ?? 0
                    let width = word.width * scale
                    if !lineWords.isEmpty, lineX + gap * scale + width > maxWidth { flushLine() }
                    let x = lineWords.isEmpty ? lineX : lineX + gap * scale
                    lineWords.append((page, word, x))
                    lineX = x + width
                    lineHeight = max(lineHeight, run.height)
                    lastWord = (page, word)
                }
                previousEndedShort = run.maxX < rightEdge - shortMin
            }
            // The line runs on into the next page, unless a paragraph ends here.
        }
        for page in 0..<pageCount {
            if isPicturePage(page), let box = p.ink[page]?.box {
                flushLine()
                closeOpen()
                push()
                let stripRect = p.strips[page].first ?? box
                let rect = box.union(stripRect.intersection(box)).insetBy(dx: -typical * 0.35, dy: -typical * 0.35)
                current.pieces.append(Piece(page: page, rect: rect, offset: 0, fitted: true))
                current.height = tileSize.height
                current.standalone = true
                touch(page, out.count)
                push()
                continue
            }
            for strip in 0..<max(1, p.strips[page].count) {
                guard let seg = segment(page: page, strip: strip) else { continue }
                if seg.width * scale > tileSize.width + 0.5 {
                    flowWords(page: page, strip: strip, seg: seg)
                    continue
                }
                flushLine()
                var pending = blocks(page: page, strip: strip).filter { $0.bottom < seg.maxY && $0.top > seg.minY }
                    .map { Block(top: min($0.top, seg.maxY), bottom: max($0.bottom, seg.minY)) }
                var guardCount = 0
                while !pending.isEmpty, guardCount < 5000 {
                    guardCount += 1
                    let block = pending[0]
                    if let o = open, !(o.page == page && o.strip == strip) { closeOpen() }
                    let room = tileSize.height - current.height
                    if let o = open {
                        // Extend the open piece down to this block, keeping the page's spacing.
                        let extended = (o.rect.maxY - block.bottom) * scale
                        let added = extended - o.rect.height * scale
                        if added <= room {
                            open = (page, strip, CGRect(x: seg.minX, y: block.bottom, width: seg.width, height: o.rect.maxY - block.bottom), o.offset)
                            current.height += added
                            pending.removeFirst()
                            continue
                        }
                        // Part of the block may still fit, if a blank gap between its lines allows.
                        let usable = room - (o.rect.minY - block.top) * scale
                        if !isPicture(block, page: page), usable > typical * scale * 2 {
                            let split = cut(block: block, page: page, strip: strip, maxHeight: usable / scale)
                            if split.blank, split.y < block.top - typical * 0.9, split.y > block.bottom + typical * 0.9 {
                                pending[0] = Block(top: split.y, bottom: block.bottom)
                                pending.insert(Block(top: block.top, bottom: split.y), at: 0)
                                continue
                            }
                        }
                        closeOpen()
                        push()
                        continue
                    }
                    let lead = current.pieces.isEmpty ? 0 : pageGap
                    let needed = block.height * scale + lead
                    if needed <= room {
                        current.height += lead
                        open = (page, strip, CGRect(x: seg.minX, y: block.bottom, width: seg.width, height: block.height), current.height)
                        current.height += block.height * scale
                        touch(page, out.count)
                        pending.removeFirst()
                        continue
                    }
                    if !current.pieces.isEmpty {
                        // Fill the room with the lines of the block that fit, if a blank gap between its lines allows;
                        // otherwise the whole block moves to a fresh screen.
                        let usable = room - lead
                        if !isPicture(block, page: page), usable > typical * scale * 2 {
                            let split = cut(block: block, page: page, strip: strip, maxHeight: usable / scale)
                            if split.blank, split.y < block.top - typical * 0.9, split.y > block.bottom + typical * 0.9 {
                                pending[0] = Block(top: split.y, bottom: block.bottom)
                                pending.insert(Block(top: block.top, bottom: split.y), at: 0)
                                continue
                            }
                        }
                        push()
                        continue
                    }
                    // Alone on an empty screen and still too tall.
                    if isPicture(block, page: page) {
                        current.pieces.append(Piece(page: page, rect: CGRect(x: seg.minX, y: block.bottom, width: seg.width, height: block.height), offset: 0, fitted: true))
                        current.height = tileSize.height
                        touch(page, out.count)
                        push()
                        pending.removeFirst()
                        continue
                    }
                    // Text taller than a screen (its lines' gaps too fine for the rendering): cut between lines.
                    let cutAt = cut(block: block, page: page, strip: strip, maxHeight: tileSize.height / scale).y
                    pending[0] = Block(top: cutAt, bottom: block.bottom)
                    pending.insert(Block(top: block.top, bottom: cutAt), at: 0)
                }
            }
            closeOpen()
        }
        flushLine()
        closeOpen()
        push()
        if out.isEmpty {
            // Nothing found to show (a document with no ink at all): whole pages, one a screen.
            for page in 0..<pageCount {
                let size = pageSize(page)
                out.append(Screen(pieces: [Piece(page: page, rect: CGRect(origin: .zero, size: size), offset: 0, fitted: true)], height: tileSize.height, standalone: true))
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
        pageImages.removeAll()
        if unit >= units { unit = max(0, units - 1) }
    }

    /// Where to cut a block of text so that its top part is at most `maxHeight` tall: the lowest midpoint between two
    /// of its lines that the rendering confirms is blank; else the row with the least ink there, which is not blank.
    private func cut(block: Block, page: Int, strip: Int, maxHeight: CGFloat) -> (y: CGFloat, blank: Bool) {
        guard let p = preparation else { return (block.top - maxHeight, false) }
        let typical = p.typicalLineHeight
        let nominal = block.top - maxHeight
        let highest = block.top - typical * 0.9
        let lines = p.lines[page].sorted { $0.maxY > $1.maxY }
        var midpoints: [CGFloat] = []
        for i in 1..<max(1, lines.count) {
            let above = lines[i - 1], below = lines[i]
            guard below.maxY < above.minY + 0.5 else { continue }
            let m = (below.maxY + above.minY) / 2
            if m >= nominal && m <= highest { midpoints.append(m) }
        }
        midpoints.sort()
        guard let r = rows(page: page, strip: strip) else { return midpoints.first.map { ($0, true) } ?? (max(nominal, block.bottom + 1), false) }
        let height = pageSize(page).height
        func rowIndex(_ y: CGFloat) -> Int { min(r.rows.count - 1, max(0, Int(((height - y) / r.rowHeight).rounded(.down)))) }
        for m in midpoints where r.rows[rowIndex(m)] <= r.width / 10 { return (m, true) }
        let lowRow = rowIndex(max(nominal, block.bottom)), highRow = rowIndex(highest)
        guard highRow <= lowRow else { return (max(nominal, block.bottom + 1), false) }
        var best = lowRow
        for row in highRow...lowRow where r.rows[row] < r.rows[best] { best = row }
        let y = min(block.top - 1, max(block.bottom + 1, height - (CGFloat(best) + 0.5) * r.rowHeight))
        return (y, r.rows[best] <= r.width / 10)
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

    /// The scale a piece is drawn at: the text size, unless the piece is wider than the tile, or fitted to it.
    private func pieceScale(_ piece: Piece, in frame: CGRect) -> CGFloat {
        var s = scale
        if piece.rect.width > 0 { s = min(s, frame.width / piece.rect.width) }
        if piece.fitted, piece.rect.height > 0 { s = min(s, frame.height / piece.rect.height) }
        return s
    }

    /// Where a piece sits inside its tile (bottom-left origin, view points): centred across, below the pieces above;
    /// a picture-only page is centred both ways.
    private func pieceFrame(_ piece: Piece, in frame: CGRect, standalone: Bool = false) -> CGRect {
        let s = pieceScale(piece, in: frame)
        let width = piece.rect.width * s, height = piece.rect.height * s
        let x = piece.x.map { frame.minX + $0 } ?? frame.midX - width / 2
        let top = standalone ? frame.maxY - (frame.height - height) / 2 : frame.maxY - piece.offset
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
                let pf = pieceFrame(piece, in: frame, standalone: screens[u].standalone)
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

    /// A page's inked area rendered once at a pixel scale, so rewrapped words can be cut out of it cheaply.
    private func pageImage(page: Int, pixelScale: CGFloat) -> (image: CGImage, area: CGRect, pixelScale: CGFloat)? {
        let key = "\(page)-\(Int((pixelScale * 100).rounded()))"
        if let cached = pageImages[key] { return cached }
        guard let document, let pdfPage = document.page(at: page), let p = preparation, page < p.strips.count else { return nil }
        var area = p.strips[page].reduce(CGRect.null) { $0.union($1) }
        if page < p.ink.count, let box = p.ink[page]?.box { area = area.union(box) }
        if area.isNull { area = CGRect(origin: .zero, size: pageSize(page)) }
        area = area.insetBy(dx: -2, dy: -2)
        let w = Int((area.width * pixelScale).rounded(.up)), h = Int((area.height * pixelScale).rounded(.up))
        guard w > 0, h > 0, w * h <= 30_000_000, let context = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        context.setFillColor(CGColor(gray: 1, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: w, height: h))
        context.interpolationQuality = .high
        context.scaleBy(x: pixelScale, y: pixelScale)
        context.translateBy(x: -area.minX, y: -area.minY)
        pdfPage.draw(with: .mediaBox, to: context)
        guard let image = context.makeImage() else { return nil }
        if pageImages.count >= 2 { pageImages.removeAll() }
        let entry = (image, area, pixelScale)
        pageImages[key] = entry
        return entry
    }

    /// One screen as an image at the window's scale: the paper, each piece's page drawn through its rectangle (a
    /// rewrapped word cut from the page's rendering), and the highlights that fall on it.
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
        let highlights = session.annotations.filter { $0.kind == .highlight && $0.pdfRects != nil }
        for piece in screens[u].pieces {
            guard let page = document.page(at: piece.page) else { continue }
            let dest = pieceFrame(piece, in: tile, standalone: screens[u].standalone)
            let s = pieceScale(piece, in: tile)
            let destPixels = CGRect(x: dest.minX * backing, y: dest.minY * backing, width: dest.width * backing, height: dest.height * backing)
            var drawn = false
            if piece.x != nil, let source = pageImage(page: piece.page, pixelScale: backing * s) {
                let crop = CGRect(x: (piece.rect.minX - source.area.minX) * source.pixelScale, y: (source.area.maxY - piece.rect.maxY) * source.pixelScale,
                                  width: piece.rect.width * source.pixelScale, height: piece.rect.height * source.pixelScale)
                if let cut = source.image.cropping(to: crop.integral) {
                    context.draw(cut, in: destPixels)
                    drawn = true
                }
            }
            if !drawn {
                context.saveGState()
                context.translateBy(x: destPixels.minX, y: destPixels.minY)
                context.scaleBy(x: backing * s, y: backing * s)
                context.translateBy(x: -piece.rect.minX, y: -piece.rect.minY)
                context.clip(to: piece.rect)
                page.draw(with: .mediaBox, to: context)
                context.restoreGState()
            }
            // Highlights on this piece, in the tile's pixels.
            guard !highlights.isEmpty else { continue }
            let toDisplay = page.transform(for: .mediaBox)
            for record in highlights {
                let color = PDFPresenter.nsColor(for: record.color ?? .yellow).usingColorSpace(.sRGB)?.cgColor ?? CGColor(gray: 1, alpha: 1)
                for r in record.pdfRects ?? [] where r.page == piece.page {
                    let shown = CGRect(x: r.x, y: r.y, width: r.width, height: r.height).applying(toDisplay).intersection(piece.rect)
                    guard !shown.isNull, shown.width > 0, shown.height > 0 else { continue }
                    let box = CGRect(x: destPixels.minX + (shown.minX - piece.rect.minX) * s * backing, y: destPixels.minY + (shown.minY - piece.rect.minY) * s * backing,
                                     width: shown.width * s * backing, height: shown.height * s * backing)
                    context.saveGState()
                    context.setFillColor(color)
                    if record.color == .underline {
                        context.fill(CGRect(x: box.minX, y: box.minY, width: box.width, height: max(1, box.height * 0.08)))
                    } else {
                        context.setBlendMode(.multiply)
                        context.fill(box)
                    }
                    context.restoreGState()
                }
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
        let before = (tileSize, scale, columns)
        computeGeometry()
        if before == (tileSize, scale, columns) && !screens.isEmpty { return }
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

    /// The text size steps by 10%, from 50% to 400%; past the width of a column the lines are rewrapped.
    func zoom(_ direction: Int) {
        var all = session.model.settings
        let current = min(400, max(50, all.reader.pdfZoom))
        let next = direction > 0 ? min(400, current + 10) : max(50, current - 10)
        all.reader.pdfZoom = next
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
        guard let document, let page = document.page(at: hit.piece.page), hit.frame.width > 0, hit.piece.rect.width > 0 else { return nil }
        let s = hit.frame.width / hit.piece.rect.width
        let display = NSPoint(x: hit.piece.rect.minX + (point.x - hit.frame.minX) / s, y: hit.piece.rect.minY + (point.y - hit.frame.minY) / s)
        return display.applying(page.transform(for: .mediaBox).inverted())
    }

    /// A page-space rectangle to view coordinates, piece by piece, where the page is showing.
    private func viewRects(_ rect: CGRect, onPage pageIndex: Int) -> [CGRect] {
        guard let document, let page = document.page(at: pageIndex) else { return [] }
        let display = rect.applying(page.transform(for: .mediaBox))
        var out: [CGRect] = []
        for column in 0..<columns {
            let u = unit + column
            guard u < units else { continue }
            let frame = tileFrame(column: column)
            for piece in screens[u].pieces where piece.page == pageIndex {
                let part = display.intersection(piece.rect)
                guard !part.isNull, part.width > 0, part.height > 0 else { continue }
                let pf = pieceFrame(piece, in: frame, standalone: screens[u].standalone)
                let s = pieceScale(piece, in: frame)
                out.append(CGRect(x: pf.minX + (part.minX - piece.rect.minX) * s, y: pf.minY + (part.minY - piece.rect.minY) * s, width: part.width * s, height: part.height * s))
            }
        }
        return out
    }

    /// The union of `viewRects`, for anchoring a menu.
    private func viewRect(_ rect: CGRect, onPage pageIndex: Int) -> CGRect? {
        var union: CGRect?
        for shown in viewRects(rect, onPage: pageIndex) { union = union.map { $0.union(shown) } ?? shown }
        return union
    }

    /// View (bottom-left origin) to the top-left-origin coordinates the SwiftUI overlays use.
    private func topLeft(_ rect: CGRect) -> CGRect {
        CGRect(x: rect.minX, y: view.bounds.height - rect.maxY, width: rect.width, height: rect.height)
    }

    // MARK: - Links

    /// The link annotation under a page-space point, if any.
    private func link(at pagePoint: NSPoint, on page: PDFPage) -> PDFAnnotation? {
        guard let annotation = page.annotation(at: pagePoint) else { return nil }
        let isLink = annotation.type == "Link" || annotation.url != nil || annotation.destination != nil || annotation.action is PDFActionURL || annotation.action is PDFActionGoTo
        return isLink ? annotation : nil
    }

    /// Follows a link: a web or mail address opens outside; a place in the book turns to it.
    private func follow(_ link: PDFAnnotation) -> Bool {
        if let url = link.url ?? (link.action as? PDFActionURL)?.url {
            if let scheme = url.scheme?.lowercased(), ["http", "https", "mailto"].contains(scheme) { NSWorkspace.shared.open(url) }
            return true
        }
        if let destination = link.destination ?? (link.action as? PDFActionGoTo)?.destination, let page = destination.page, let document {
            let index = document.index(for: page)
            let point = destination.point
            let y = point.y.isFinite && point.y < 1_000_000 ? point.applying(page.transform(for: .mediaBox)).y : pageSize(index).height
            let target = unitContaining(page: index, y: y)
            show(unit: target, direction: target > unit ? 1 : (target < unit ? -1 : 0))
            return true
        }
        return false
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
        guard let start = dragStart, let hit = dragHit, let document, let page = document.page(at: hit.piece.page), let from = pagePoint(at: start, in: hit) else { return }
        // Over rewrapped words the piece under the pointer maps the point; between them, the piece the drag began in.
        let under = pieceHit(at: point).flatMap { $0.piece.page == hit.piece.page ? $0 : nil } ?? hit
        guard let to = pagePoint(at: point, in: under) else { return }
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
        // A click: on a link, or a highlight?
        if let start = dragStart, hypot(point.x - start.x, point.y - start.y) < 4, let hit = pieceHit(at: point), let pagePoint = pagePoint(at: point, in: hit) {
            if let document, let page = document.page(at: hit.piece.page), let link = link(at: pagePoint, on: page), follow(link) {
                session.pdfSelectionChanged(text: nil, rect: .zero, page: 0)
                return
            }
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
            for rect in viewRects(line.bounds(for: page), onPage: pageIndex) { path.addRect(rect) }
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
            for rect in viewRects(line.bounds(for: page), onPage: pageIndex) { path.addRect(rect) }
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
        // A pointing hand over a link, the text cursor elsewhere.
        var overLink = false
        if let hit = pieceHit(at: point), let document, let page = document.page(at: hit.piece.page), let pagePoint = pagePoint(at: point, in: hit) {
            overLink = link(at: pagePoint, on: page) != nil
        }
        if overLink { NSCursor.pointingHand.set() } else { NSCursor.iBeam.set() }
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
