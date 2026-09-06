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
    }

    struct Block {
        var text: String
        var size: CGFloat
        var page: Int
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

    static func epub(from url: URL, title: String, author: String) throws -> Data {
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
        for (i, start) in starts.enumerated() {
            let end = i + 1 < starts.count ? starts[i + 1].page : count
            let chapterBlocks = blocks.filter { $0.page >= start.page && $0.page < end }
            guard !chapterBlocks.isEmpty else { continue }
            var html = ""
            for block in chapterBlocks {
                let text = XHTML.escape(collapse(block.text))
                switch headingLevel(of: block, bodySize: bodySize) {
                case 2: html += "<h2>\(text)</h2>\n"
                case 3: html += "<h3>\(text)</h3>\n"
                default: html += "<p>\(text)</p>\n"
                }
            }
            chapters.append(EPUBChapter(label: start.label, title: start.label, html: html))
        }
        if chapters.isEmpty {
            chapters.append(EPUBChapter(label: title, title: title, html: blocks.map { "<p>\(XHTML.escape(collapse($0.text)))</p>" }.joined(separator: "\n")))
        }
        let spec = EPUBSpec(title: title, author: author, chapters: chapters, sourceNote: "Reflowed from a PDF by Books; layout is not kept.")
        return EPUBWriter.build(spec)
    }

    // MARK: - Lines

    static func lines(of page: PDFPage?) -> [Line] {
        guard let page else { return [] }
        let media = page.bounds(for: .mediaBox)
        guard media.width > 0, media.height > 0, let all = page.selection(for: media) else { return [] }
        var out: [Line] = []
        for selection in all.selectionsByLine() {
            guard let raw = selection.string else { continue }
            let text = raw.replacingOccurrences(of: "\n", with: " ").trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty else { continue }
            let rect = selection.bounds(for: page)
            guard rect.width > 0, rect.height > 0 else { continue }
            let size = dominantFontSize(selection.attributedString) ?? max(6, rect.height * 0.8)
            let edge = rect.midY < media.minY + media.height * 0.07 || rect.midY > media.maxY - media.height * 0.07
            out.append(Line(text: text, rect: rect, size: size, edge: edge))
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
        var previous: Line?
        func flush() {
            if !current.isEmpty { out.append(Block(text: current, size: currentSize, page: pageIndex)) }
            current = ""
            currentSize = 0
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
