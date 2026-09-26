import AppKit
import PDFKit
import BooksCore

/// Turns a PDF's text into a book, the way converters such as calibre do: PDFKit gives the lines with their places
/// and fonts; running headers and footers are dropped, lines become paragraphs by their spacing and indents,
/// hyphenated words are rejoined and larger type becomes headings. The result is an EPUB the reader opens like any
/// other, so fonts, sizes, themes and highlights all apply. Layout is lost on purpose; tables and figures come
/// through as text or not at all.
enum PDFReflow {
    struct Line {
        var text: String
        var rect: CGRect
        var size: CGFloat
        /// In the top or bottom 7% of the page: a candidate running header, footer or page number.
        var edge: Bool
        /// Where the line sits on the page as displayed (rotation applied), measured from its top-left corner.
        var shown: CGRect = .null
    }

    struct Block {
        var text: String
        var size: CGFloat
        var page: Int
        /// The block's extent on its page as displayed, from the page's top-left corner (y downwards).
        var shown: CGRect = .null
    }

    /// Where each paragraph of the converted book came from: its place in the text as the reader counts it — the
    /// spine item of its chapter and the characters (UTF-16 code units, as JavaScript counts them) before it there —
    /// and where it lies on its page, measured as `ReadingPosition.pdfTop` is. This is how a place goes between Text
    /// and the page views: both ways through the same paragraph, so a round trip comes back to the line it left.
    /// It copies EPUBWriter's chapter layout (see `convert`); the two must change together.
    struct PageMap: Codable, Sendable {
        struct Entry: Codable, Sendable {
            let spine: Int
            let offset: Int
            let length: Int
            let page: Int
            let top: Double
            let bottom: Double
            let left: Double
            let right: Double
        }

        var entries: [Entry] = []

        /// A text's length as the reader counts it once it is in the page: UTF-16 code units, line ends as XML reads them.
        static func textLength(_ text: String) -> Int {
            text.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\r", with: "\n").utf16.count
        }

        mutating func add(_ block: Block, spine: Int, offset: Int, length: Int) {
            let r = block.shown
            guard !r.isNull, r.minX.isFinite, r.minY.isFinite, r.maxX.isFinite, r.maxY.isFinite else { return }
            entries.append(Entry(spine: spine, offset: offset, length: length, page: block.page,
                                 top: Double(r.minY), bottom: Double(r.maxY), left: Double(r.minX), right: Double(r.maxX)))
        }

        /// How far in from a paragraph's edges its places lie: a point on the very edge of its box could as well be
        /// in the gap beside it, where a page view would find the line before. Both directions use the same inset, so
        /// a round trip is exact.
        private static func inset(_ extent: Double) -> Double { min(6, max(0, extent) / 2) }

        /// Where on the PDF's pages a place in the text came from: the paragraph holding it (before a chapter's first
        /// paragraph, that one), as far down it as the place is along its text.
        func place(of locator: Locator) -> (page: Int, top: Double, left: Double)? {
            guard let i = entries.lastIndex(where: { $0.spine == locator.spine && $0.offset <= locator.offset })
                ?? entries.firstIndex(where: { $0.spine >= locator.spine }) ?? entries.indices.last else { return nil }
            let e = entries[i]
            let along: Double
            if e.spine == locator.spine, e.length > 1 {
                along = min(1, max(0, Double(locator.offset - e.offset) / Double(e.length - 1)))
            } else {
                along = 0
            }
            let height = e.bottom - e.top
            let inset = PageMap.inset(height)
            return (page: e.page, top: e.top + inset + (height - 2 * inset) * along, left: e.left + PageMap.inset(e.right - e.left))
        }

        /// Where in the text a place on a page went: the paragraph of that page the point lies in (else the nearest, a
        /// line counting more than a column's width), as far along its text as the point is down it. A page without
        /// text goes to the text after it.
        func locator(page: Int, top: Double?, left: Double?) -> Locator? {
            let onPage = entries.filter { $0.page == page }
            guard let first = onPage.first else {
                guard let next = entries.first(where: { $0.page > page }) ?? entries.last else { return nil }
                return Locator(spine: next.spine, offset: next.offset)
            }
            guard let top else { return Locator(spine: first.spine, offset: first.offset) }
            var best = first
            var bestDistance = Double.infinity
            for e in onPage {
                let dy: Double = max(0, max(e.top - top, top - e.bottom))
                let dx: Double = left.map { x in max(0, max(e.left - x, x - e.right)) } ?? 0
                let distance = ((dx / 4) * (dx / 4) + dy * dy).squareRoot()
                if distance < bestDistance {
                    best = e
                    bestDistance = distance
                }
            }
            let height = best.bottom - best.top
            let inset = PageMap.inset(height)
            let span = height - 2 * inset
            let along: Double = span > 0 ? min(1, max(0, (top - best.top - inset) / span)) : 0
            return Locator(spine: best.spine, offset: best.offset + Int((along * Double(max(0, best.length - 1))).rounded()))
        }
    }

    enum ReflowError: Error, CustomStringConvertible {
        case unreadable
        case noText

        var description: String {
            switch self {
            case .unreadable: return "The PDF could not be read."
            case .noText: return "This PDF has no text to reflow (its pages are pictures). Read it as Pages or Zoom & Split."
            }
        }
    }

    /// The converted book, and where it is cached next to the PDF. Version the name so a better converter redoes it.
    static func cacheURL(for pdf: URL) -> URL {
        pdf.deletingLastPathComponent().appendingPathComponent("reflow-v1.epub")
    }

    /// The map from the converted book's paragraphs to the pages they came from, cached beside it (same version).
    static func mapURL(for pdf: URL) -> URL {
        pdf.deletingLastPathComponent().appendingPathComponent("reflow-v1-pages.json")
    }

    static func epub(from url: URL, title: String, author: String) throws -> Data {
        try convert(from: url, title: title, author: author).epub
    }

    /// The converted book, and the map from its paragraphs back to the places on the pages they came from.
    static func convert(from url: URL, title: String, author: String) throws -> (epub: Data, map: PageMap) {
        guard let document = PDFDocument(url: url) else { throw ReflowError.unreadable }
        let count = document.pageCount
        var pages: [[Line]] = []
        for i in 0..<count { pages.append(lines(of: document.page(at: i))) }

        // Running headers and footers: edge lines that recur across pages, or that are only a number.
        var recurring: [String: Int] = [:]
        for page in pages {
            for line in page where line.edge { recurring[normalized(line.text), default: 0] += 1 }
        }
        let recurringThreshold = max(3, count / 12)
        for i in pages.indices {
            pages[i].removeAll { line in
                guard line.edge else { return false }
                let key = normalized(line.text)
                return recurring[key, default: 0] >= recurringThreshold || isPageNumber(line.text)
            }
        }

        // The body size: the type most of the text is set in.
        var weights: [CGFloat: Int] = [:]
        for page in pages { for line in page { weights[line.size, default: 0] += line.text.count } }
        let bodySize = weights.max { $0.value < $1.value }?.key ?? 12
        var blocks: [Block] = []
        for (index, page) in pages.enumerated() { blocks.append(contentsOf: paragraphs(page, bodySize: bodySize, pageIndex: index)) }
        let totalText = blocks.reduce(0) { $0 + $1.text.count }
        guard totalText >= 200 else { throw ReflowError.noText }

        // Chapters: the outline's top level; failing that, the large headings; failing that, groups of pages.
        var starts: [(label: String, page: Int)] = PDFPresenter.sections(of: document).filter { $0.level == 0 }.map { (label: $0.label, page: $0.page) }
        if starts.count < 2 {
            starts = blocks.filter { headingLevel(of: $0, bodySize: bodySize) == 2 }.map { (label: collapse($0.text), page: $0.page) }
        }
        if starts.count < 2 {
            starts = stride(from: 0, to: count, by: 15).map { (label: "Pages \($0 + 1)–\(min(count, $0 + 15))", page: $0) }
        }
        starts.sort { $0.page < $1.page }
        var chapters: [EPUBChapter] = []
        var map = PageMap()
        for (i, start) in starts.enumerated() {
            let end = i + 1 < starts.count ? starts[i + 1].page : count
            let chapterBlocks = blocks.filter { $0.page >= start.page && $0.page < end }
            guard !chapterBlocks.isEmpty else { continue }
            // EPUBWriter puts the title page first (and no cover here), so this chapter is spine item count + 1. Its
            // head shows the label twice, as label and as title, before the paragraphs, each followed by a line break.
            let spine = chapters.count + 1
            var offset = 2 * PageMap.textLength(start.label)
            var html = ""
            for block in chapterBlocks {
                let plain = collapse(block.text)
                let text = XHTML.escape(plain)
                switch headingLevel(of: block, bodySize: bodySize) {
                case 2: html += "<h2>\(text)</h2>\n"
                case 3: html += "<h3>\(text)</h3>\n"
                default: html += "<p>\(text)</p>\n"
                }
                let length = PageMap.textLength(plain)
                map.add(block, spine: spine, offset: offset, length: length)
                offset += length + 1
            }
            chapters.append(EPUBChapter(label: start.label, title: start.label, html: html))
        }
        if chapters.isEmpty {
            var offset = 2 * PageMap.textLength(title)
            for block in blocks {
                let length = PageMap.textLength(collapse(block.text))
                map.add(block, spine: 1, offset: offset, length: length)
                offset += length + 1
            }
            chapters.append(EPUBChapter(label: title, title: title, html: blocks.map { "<p>\(XHTML.escape(collapse($0.text)))</p>" }.joined(separator: "\n")))
        }
        let spec = EPUBSpec(title: title, author: author, chapters: chapters, sourceNote: "Reflowed from a PDF by Books; layout is not kept.")
        return (epub: EPUBWriter.build(spec), map: map)
    }

    // MARK: - Lines

    static func lines(of page: PDFPage?) -> [Line] {
        guard let page else { return [] }
        let media = page.bounds(for: .mediaBox)
        guard media.width > 0, media.height > 0, let all = page.selection(for: media) else { return [] }
        // Where each line sits on the page as displayed, from its top-left corner: how the text finds its way back.
        let toDisplay = page.transform(for: .mediaBox)
        let displayHeight = PDFPresenter.displaySize(of: page).height
        var out: [Line] = []
        for selection in all.selectionsByLine() {
            guard let raw = selection.string else { continue }
            let text = raw.replacingOccurrences(of: "\n", with: " ").trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty else { continue }
            let rect = selection.bounds(for: page)
            guard rect.width > 0, rect.height > 0 else { continue }
            let size = dominantFontSize(selection.attributedString) ?? max(6, rect.height * 0.8)
            let edge = rect.midY < media.minY + media.height * 0.07 || rect.midY > media.maxY - media.height * 0.07
            let d = rect.applying(toDisplay)
            out.append(Line(text: text, rect: rect, size: size, edge: edge, shown: CGRect(x: d.minX, y: displayHeight - d.maxY, width: d.width, height: d.height)))
        }
        return out
    }

    static func dominantFontSize(_ string: NSAttributedString?) -> CGFloat? {
        guard let string, string.length > 0 else { return nil }
        var weights: [CGFloat: Int] = [:]
        string.enumerateAttribute(.font, in: NSRange(location: 0, length: string.length)) { value, range, _ in
            if let font = value as? NSFont { weights[(font.pointSize * 2).rounded() / 2, default: 0] += range.length }
        }
        return weights.max { $0.value < $1.value }?.key
    }

    // MARK: - Paragraphs

    /// Lines in PDFKit's reading order become blocks: a new one starts at a gap, a column change, a change of type
    /// size or a first-line indent after a sentence ends. Consecutive lines join with a space, or without one when
    /// the first ends in a hyphen and the next starts in lower case.
    static func paragraphs(_ lines: [Line], bodySize: CGFloat, pageIndex: Int) -> [Block] {
        guard !lines.isEmpty else { return [] }
        let longLines = lines.filter { $0.text.count > 20 }
        let columnLeft = (longLines.isEmpty ? lines : longLines).map(\.rect.minX).sorted()[max(0, (longLines.isEmpty ? lines : longLines).count / 10)]
        var out: [Block] = []
        var current = ""
        var currentSize: CGFloat = 0
        var currentShown = CGRect.null
        var previous: Line?
        func flush() {
            if !current.isEmpty { out.append(Block(text: current, size: currentSize, page: pageIndex, shown: currentShown)) }
            current = ""
            currentSize = 0
            currentShown = .null
        }
        for line in lines {
            var startsBlock = previous == nil
            if let p = previous {
                let gap = p.rect.minY - line.rect.maxY
                let lineHeight = max(p.rect.height, line.rect.height, 1)
                if gap > lineHeight * 0.7 || gap < -lineHeight * 1.5 { startsBlock = true }
                if abs(line.size - p.size) > max(line.size, p.size) * 0.15 { startsBlock = true }
                if line.rect.minX > columnLeft + line.size * 1.2, p.rect.minX <= columnLeft + line.size * 0.5, endsSentence(p.text) { startsBlock = true }
                if endsSentence(p.text), p.rect.maxX < line.rect.maxX - line.size * 6 { startsBlock = true }   // a short last line
            }
            if startsBlock {
                flush()
                current = line.text
                currentSize = line.size
            } else if current.hasSuffix("-"), let first = line.text.first, first.isLowercase {
                current.removeLast()
                current += line.text
            } else {
                current += " " + line.text
            }
            currentShown = currentShown.union(line.shown)
            previous = line
        }
        flush()
        return out
    }

    static func headingLevel(of block: Block, bodySize: CGFloat) -> Int {
        let short = block.text.count < 90
        if block.size >= bodySize * 1.35, short { return 2 }
        if block.size >= bodySize * 1.15, short { return 3 }
        if short, block.text.count > 3, block.text == block.text.uppercased(), block.text.rangeOfCharacter(from: .letters) != nil, block.size >= bodySize { return 3 }
        return 0
    }

    // MARK: - Helpers

    static func endsSentence(_ text: String) -> Bool {
        guard let last = text.trimmingCharacters(in: .whitespaces).last else { return false }
        return ".!?:”\"'’)".contains(last)
    }

    static func isPageNumber(_ text: String) -> Bool {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !t.isEmpty, t.count <= 12 else { return false }
        if t.allSatisfy(\.isNumber) { return true }
        if t.allSatisfy({ "ivxlcdm".contains($0) }) { return true }
        if t.hasPrefix("page "), t.dropFirst(5).allSatisfy({ $0.isNumber || $0 == " " }) { return true }
        return false
    }

    /// Digits collapse so "Chapter 3 · 17" and "Chapter 3 · 18" count as the same running header.
    static func normalized(_ text: String) -> String {
        String(text.lowercased().map { $0.isNumber ? "#" : $0 }).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func collapse(_ text: String) -> String {
        text.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
    }
}
