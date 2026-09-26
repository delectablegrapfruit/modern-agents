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
        /// Set in letter-spaced type, whose text was read again from where its glyphs stand (see `letterSpacedText`).
        var tracked: Bool = false
    }

    struct Block {
        var text: String
        var size: CGFloat
        var page: Int
        /// The block's extent on its page as displayed, from the page's top-left corner (y downwards).
        var shown: CGRect = .null
        /// Every line of it is letter-spaced: the mark of a kicker such as "ESSAY I" over a chapter's heading.
        var tracked: Bool = false
    }

    /// One chapter of the converted book, as the blocks it is made of: where it begins, the blocks over its heading
    /// that label it (a kicker such as "ESSAY I", or a heading stacked over another), the heading itself, and the
    /// title it goes by. The label and the heading become the chapter's head in the EPUB, so they are not repeated
    /// among its paragraphs.
    struct ChapterPlan {
        var first: Int
        var label: [Int] = []
        var heading: Int?
        var title: String
        var isFrontMatter = false
    }

    /// Where each paragraph of the converted book came from: its place in the text as the reader counts it — the
    /// spine item of its chapter and the characters (UTF-16 code units, as JavaScript counts them) before it there —
    /// and where it lies on its page, measured as `ReadingPosition.pdfTop` is. This is how a place goes between Text
    /// and the page views: both ways through the same paragraph, so a round trip comes back to the line it left.
    /// It copies EPUBWriter's chapter layout (see `chapters(of:title:)`); the two must change together.
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
    /// Version 2 reads letter-spaced lines from their glyphs, keeps the text before the first chapter as front matter,
    /// and shows each chapter's heading once, in its head.
    static func cacheURL(for pdf: URL) -> URL {
        pdf.deletingLastPathComponent().appendingPathComponent("reflow-v2.epub")
    }

    /// The map from the converted book's paragraphs to the pages they came from, cached beside it (same version).
    static func mapURL(for pdf: URL) -> URL {
        pdf.deletingLastPathComponent().appendingPathComponent("reflow-v2-pages.json")
    }

    /// The files of the converter before version 2. A PDF with highlights or bookmarks made in its Text keeps using
    /// them, since those point into that text by chapter and offset.
    static func legacyURLs(for pdf: URL) -> (epub: URL, map: URL) {
        let folder = pdf.deletingLastPathComponent()
        return (folder.appendingPathComponent("reflow-v1.epub"), folder.appendingPathComponent("reflow-v1-pages.json"))
    }

    static func epub(from url: URL, title: String, author: String) throws -> Data {
        try convert(from: url, title: title, author: author).epub
    }

    /// The converted book, and the map from its paragraphs back to the places on the pages they came from.
    static func convert(from url: URL, title: String, author: String) throws -> (epub: Data, map: PageMap) {
        guard let document = PDFDocument(url: url) else { throw ReflowError.unreadable }
        let book = try chapters(of: document, title: title)
        let spec = EPUBSpec(title: title, author: author, chapters: book.chapters, sourceNote: "Reflowed from a PDF by Books; layout is not kept.")
        return (epub: EPUBWriter.build(spec), map: book.map)
    }

    /// The chapters the PDF's text makes, as EPUBWriter will package them, and the map from their paragraphs to the
    /// pages. `title` is the book's, for the front matter when that has no heading of its own.
    static func chapters(of document: PDFDocument, title: String) throws -> (chapters: [EPUBChapter], map: PageMap) {
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

        // Chapters: the outline's top level; failing that, the large headings; failing that, groups of pages. Each
        // begins at a block rather than a page, as a chapter may open halfway down one; the text before the first is
        // the front matter.
        let outline: [PDFSection] = PDFPresenter.sections(of: document).filter { $0.level == 0 }
        let plans = plan(blocks, outline: outline, pageCount: count, bodySize: bodySize, title: title)
        var chapters: [EPUBChapter] = []
        var map = PageMap()
        for (n, planned) in plans.enumerated() {
            let end = n + 1 < plans.count ? plans[n + 1].first : blocks.count
            // EPUBWriter puts the title page first (and no cover here), so this chapter is spine item count + 1. Its
            // head is the label and then the title, with nothing between or after them; the paragraphs follow, each
            // followed by a line break. The offsets count the text the reader finds, in that order.
            let spine = chapters.count + 1
            var offset = 0
            let labelParts: [String] = planned.label.map { collapse(blocks[$0].text) }
            let labelText = labelParts.joined(separator: labelSeparator)
            // A label that only repeats the title is left out, since the reader names a chapter "label: title".
            let label: String? = labelText.isEmpty || repeats(labelText, in: planned.title) ? nil : labelText
            if label != nil {
                for (part, index) in zip(labelParts, planned.label) {
                    let length = PageMap.textLength(part)
                    map.add(blocks[index], spine: spine, offset: offset, length: length)
                    offset += length + PageMap.textLength(labelSeparator)
                }
                offset = PageMap.textLength(labelText)
            }
            if let heading = planned.heading {
                map.add(blocks[heading], spine: spine, offset: offset, length: PageMap.textLength(planned.title))
            }
            offset += PageMap.textLength(planned.title)
            // The heading is the chapter's title, shown in its head; the paragraphs begin after it.
            let bodyStart = min(end, planned.heading.map { $0 + 1 } ?? planned.first)
            var html = ""
            for block in blocks[bodyStart..<end] {
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
            chapters.append(EPUBChapter(label: label, title: planned.title, html: html, isFrontMatter: planned.isFrontMatter))
        }
        return (chapters: chapters, map: map)
    }

    // MARK: - Chapters

    /// Between the parts of a label made of several blocks, as TextBook joins a heading stacked over another.
    static let labelSeparator = " · "

    /// Where the chapters begin, as blocks: at the outline's top-level entries (at the heading an entry names, when
    /// its page shows one), else at the large headings, else every fifteen pages. A heading takes the kicker over it,
    /// and a heading stacked right over another labels the chapter the lower one opens. What comes before the first
    /// chapter is the front matter, named by its own heading when it opens with one, and else by the book's title.
    static func plan(_ blocks: [Block], outline: [PDFSection], pageCount: Int, bodySize: CGFloat, title: String) -> [ChapterPlan] {
        guard !blocks.isEmpty else { return [] }
        var starts: [ChapterPlan] = []
        if outline.count >= 2 {
            for entry in outline {
                guard let first = blocks.firstIndex(where: { $0.page >= entry.page }) else { continue }
                let page = blocks[first].page
                let onPage: ArraySlice<Block> = blocks[first...].prefix(while: { $0.page == page })
                var named: Int? = onPage.firstIndex { sameWords($0.text, entry.label) }
                if named == nil {
                    // A heading near the top of the page that says part of what the entry does, or the entry and more:
                    // "Loomings" for "Chapter 1: Loomings".
                    named = onPage.prefix(4).firstIndex { block in
                        headingLevel(of: block, bodySize: bodySize) > 0 && (repeats(block.text, in: entry.label) || repeats(entry.label, in: block.text))
                    }
                }
                // The chapter goes by the fuller of the entry's name and its heading's words.
                var chapterTitle = entry.label
                if let named, words(blocks[named].text).count > words(chapterTitle).count { chapterTitle = collapse(blocks[named].text) }
                starts.append(ChapterPlan(first: named ?? first, heading: named, title: chapterTitle))
            }
            starts = ordered(starts)
        }
        if starts.count < 2 {
            // A title set larger than the chapter headings, on the first page of text, is the book's own title page
            // and stays in the front matter; the chapter headings are the size most headings are set in.
            let headings: [Int] = blocks.indices.filter { headingLevel(of: blocks[$0], bodySize: bodySize) == 2 }
            var sizes: [CGFloat: Int] = [:]
            for i in headings { sizes[blocks[i].size, default: 0] += 1 }
            let common: CGFloat = sizes.max { a, b in a.value != b.value ? a.value < b.value : a.key > b.key }?.key ?? bodySize
            let firstPage = blocks[0].page
            let chapterHeadings: [Int] = headings.filter { blocks[$0].page != firstPage || blocks[$0].size <= common * 1.15 }
            let chosen: [Int] = chapterHeadings.count >= 2 ? chapterHeadings : headings
            starts = chosen.map { ChapterPlan(first: $0, heading: $0, title: collapse(blocks[$0].text)) }
        }
        if starts.count < 2 {
            let groups: [Int] = blocks.indices.filter { $0 == 0 || blocks[$0].page / 15 != blocks[$0 - 1].page / 15 }
            starts = groups.map { i in
                let from = blocks[i].page / 15 * 15
                return ChapterPlan(first: i, title: "Pages \(from + 1)–\(min(pageCount, from + 15))")
            }
        }

        var j = 0
        while j < starts.count {
            guard let h = starts[j].heading, h > 0 else {
                j += 1
                continue
            }
            let k = h - 1
            if j > 0, starts[j - 1].heading == k, isKicker(blocks[k], over: blocks[h], stacked: true) {
                // A heading right over a heading ("PART ONE" over "The Road"): the upper labels the chapter the lower
                // opens, rather than being a chapter with nothing in it.
                starts[j].label = starts[j - 1].label + [k]
                starts[j].first = starts[j - 1].first
                starts.remove(at: j - 1)
                continue
            }
            // A kicker is taken from the end of the chapter before (or the front matter), never from its head.
            let lowest = j > 0 ? (starts[j - 1].heading ?? starts[j - 1].first) + 1 : 0
            if k >= lowest, isKicker(blocks[k], over: blocks[h], stacked: false) {
                starts[j].label = [k]
                starts[j].first = k
            }
            j += 1
        }

        guard let bodyStart = starts.first?.first, bodyStart > 0 else { return starts }
        let bookTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        var front = ChapterPlan(first: 0, title: bookTitle.isEmpty ? "Front Matter" : bookTitle, isFrontMatter: true)
        let opensWithHeading = headingLevel(of: blocks[0], bodySize: bodySize) == 2
        if bodyStart > 1, headingLevel(of: blocks[1], bodySize: bodySize) == 2, isKicker(blocks[0], over: blocks[1], stacked: opensWithHeading) {
            front.label = [0]
            front.heading = 1
            front.title = collapse(blocks[1].text)
        } else if opensWithHeading {
            front.heading = 0
            front.title = collapse(blocks[0].text)
        }
        return [front] + starts
    }

    /// Chapter starts in the order of their blocks, one to a block. Of two that begin at the same block (outline
    /// entries for one page), the later is kept, as the more particular, unless only the earlier names a heading.
    static func ordered(_ plans: [ChapterPlan]) -> [ChapterPlan] {
        let sorted = plans.enumerated().sorted { a, b in (a.element.first, a.offset) < (b.element.first, b.offset) }
        var out: [ChapterPlan] = []
        for item in sorted {
            if let last = out.last, last.first == item.element.first {
                if last.heading == nil || item.element.heading != nil { out[out.count - 1] = item.element }
            } else {
                out.append(item.element)
            }
        }
        return out
    }

    /// Words that open a kicker: "Chapter 3", "Part Two", "Essay I".
    static let kickerWords: Set<String> = [
        "chapter", "part", "book", "volume", "essay", "section", "letter", "lecture", "lesson", "act", "scene", "canto",
        "stave", "prologue", "epilogue", "appendix", "chapitre", "partie", "kapitel", "teil", "capítulo", "capitolo", "parte",
    ]

    /// Whether a short block right over a heading, on its page and across the same stretch of it, is the heading's
    /// kicker: in smaller or equal type, and letter-spaced, in capitals, a chapter word or a numeral. A heading stacked
    /// over another (`stacked`) needs only to be short and close.
    static func isKicker(_ block: Block, over heading: Block, stacked: Bool) -> Bool {
        let text = collapse(block.text)
        let tokens = text.split(separator: " ")
        guard block.page == heading.page, !text.isEmpty, text.count <= 60, tokens.count <= 8 else { return false }
        guard block.size <= heading.size * 1.05, !block.shown.isNull, !heading.shown.isNull else { return false }
        // Boxes of large type reach above its letters, so the heading's may overlap the line over it a little.
        let gap = heading.shown.minY - block.shown.maxY
        let reach = max(block.size, heading.size)
        guard gap > -reach * 0.5, gap < reach * 2.5, block.shown.midY < heading.shown.midY else { return false }
        guard block.shown.minX < heading.shown.maxX, heading.shown.minX < block.shown.maxX else { return false }
        if stacked || block.tracked { return true }
        if text.rangeOfCharacter(from: .letters) != nil, text == text.uppercased() { return true }
        if let first = tokens.first, kickerWords.contains(first.lowercased()) { return true }
        return text.range(of: "^[0-9IVXLCDMivxlcdm]+[.:]?$", options: .regularExpression) != nil
    }

    /// Two texts that read the same, whatever their case, spacing or punctuation: "Of Truth" and "OF  TRUTH.".
    static func sameWords(_ a: String, _ b: String) -> Bool {
        let x = lettersAndDigits(a)
        return !x.isEmpty && x == lettersAndDigits(b)
    }

    /// Whether a label says nothing its title does not: it reads the same ("OF TRUTH" over "Of Truth"), or its words
    /// run on in the title ("CHAPTER 1" over "Chapter 1: Loomings"). Whole words, so "I" is not found in "Of Time".
    static func repeats(_ label: String, in title: String) -> Bool {
        if sameWords(label, title) { return true }
        let l = words(label), t = words(title)
        guard !l.isEmpty, l.count <= t.count else { return false }
        for start in 0...(t.count - l.count) where t[start..<(start + l.count)].elementsEqual(l) { return true }
        return false
    }

    static func words(_ text: String) -> [String] {
        text.lowercased().components(separatedBy: CharacterSet.alphanumerics.inverted).filter { !$0.isEmpty }
    }

    static func lettersAndDigits(_ text: String) -> String {
        var out = String.UnicodeScalarView()
        for scalar in text.lowercased().unicodeScalars where CharacterSet.alphanumerics.contains(scalar) { out.append(scalar) }
        return String(out)
    }

    // MARK: - Lines

    static func lines(of page: PDFPage?) -> [Line] {
        guard let page else { return [] }
        let media = page.bounds(for: .mediaBox)
        guard media.width > 0, media.height > 0, let all = page.selection(for: media) else { return [] }
        // Where each line sits on the page as displayed, from its top-left corner: how the text finds its way back.
        let toDisplay = page.transform(for: .mediaBox)
        let displayHeight = PDFPresenter.displaySize(of: page).height
        // The page's text, which the character indices of its lines count into: read once, and only for a page with a
        // line that may be letter-spaced.
        var pageText: NSString?
        var out: [Line] = []
        for selection in all.selectionsByLine() {
            guard let raw = selection.string else { continue }
            var text = raw.replacingOccurrences(of: "\n", with: " ").trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty else { continue }
            let rect = selection.bounds(for: page)
            guard rect.width > 0, rect.height > 0 else { continue }
            let size = dominantFontSize(selection.attributedString) ?? max(6, rect.height * 0.8)
            // The type size as the glyphs' gaps are measured against: no less than the line's height suggests, should a
            // PDF report its fonts at a nominal size and scale them in drawing.
            let typeSize = max(size, rect.height * 0.6)
            var tracked = false
            if mayBeLetterSpaced(text, width: rect.width, size: typeSize) {
                let known: NSString
                if let pageText {
                    known = pageText
                } else {
                    known = (page.string ?? "") as NSString
                    pageText = known
                }
                if let spaced = letterSpacedText(of: selection, on: page, pageText: known, size: typeSize, read: text) {
                    text = spaced
                    tracked = true
                }
            }
            let edge = rect.midY < media.minY + media.height * 0.07 || rect.midY > media.maxY - media.height * 0.07
            let d = rect.applying(toDisplay)
            let shown = CGRect(x: d.minX, y: displayHeight - d.maxY, width: d.width, height: d.height)
            out.append(Line(text: text, rect: rect, size: size, edge: edge, shown: shown, tracked: tracked))
        }
        return out
    }

    // MARK: - Letter spacing

    /// Letter-spaced type (running heads, small capitals, the numeral over a chapter's title) is where PDFKit's
    /// spacing goes wrong: the tracking between letters reads as word spaces ("E S S AY I"), or the word space is lost
    /// in it ("FRANCISBACON"). A line is looked at again only when its text has single letters in a row, or when it
    /// is wider for its letters than type set solid ever is; most lines never are, and cost nothing more.
    static func mayBeLetterSpaced(_ text: String, width: CGFloat, size: CGFloat) -> Bool {
        let letters = text.reduce(0) { $1.isWhitespace ? $0 : $0 + 1 }
        guard letters >= 3, size > 0 else { return false }
        if width / CGFloat(letters) > size * 0.75 { return true }
        var run = 0
        for token in text.split(whereSeparator: { $0.isWhitespace }) {
            if token.count == 1, let c = token.first, c.isLetter || c.isNumber {
                run += 1
                if run >= 3 { return true }
            } else {
                run = 0
            }
        }
        return false
    }

    /// Whether PDFKit read three or more single letters or figures in a row, spaced apart: its reading of tracked type.
    static func hasSpacedLetters(_ text: String) -> Bool {
        var run = 0
        for token in text.split(whereSeparator: { $0.isWhitespace }) {
            if token.count == 1, let c = token.first, c.isLetter || c.isNumber {
                run += 1
                if run >= 3 { return true }
            } else {
                run = 0
            }
        }
        return false
    }

    /// A letter-spaced line's text, read again from where its glyphs stand: the gap between letters is the line's
    /// median gap between glyphs, and a word space is a gap clearly wider than that (by a fifth of the type size,
    /// where a word space in tracked type adds the space's own width and one more step of tracking). Nil — the line
    /// keeps PDFKit's text — unless the line is tracked (its letters evenly apart, by a twelfth to three fifths of
    /// the type size), reads left to right in a script that spaces its words, and comes out with the same letters
    /// PDFKit read.
    static func letterSpacedText(of selection: PDFSelection, on page: PDFPage, pageText: NSString, size: CGFloat, read: String) -> String? {
        struct Glyph {
            var text: String
            var box: CGRect
        }
        var glyphs: [Glyph] = []
        let length = pageText.length
        for r in 0..<selection.numberOfTextRanges(on: page) {
            let range = selection.range(at: r, on: page)
            guard range.location != NSNotFound, range.length > 0 else { continue }
            var i = range.location
            let end = min(NSMaxRange(range), length)
            while i < end {
                let composed = pageText.rangeOfComposedCharacterSequence(at: i)
                let piece = pageText.substring(with: composed)
                let index = i
                i = max(i + 1, NSMaxRange(composed))
                if piece.allSatisfy({ $0.isWhitespace }) { continue }
                guard piece.unicodeScalars.allSatisfy(spacesWords) else { return rejected(read, "a script without word spaces") }
                let box = page.characterBounds(at: index)
                guard !box.isNull, box.minX.isFinite, box.maxX.isFinite else { return rejected(read, "no box for character \(index)") }
                if let last = glyphs.last, box.width < 0.01 || abs(box.minX - last.box.minX) < 0.01 {
                    // A mark, or a ligature's later letter, drawn in its glyph's box.
                    glyphs[glyphs.count - 1].text += piece
                    continue
                }
                if let last = glyphs.last, box.midX < last.box.midX { return rejected(read, "“\(piece)” stands left of “\(last.text)”") }
                glyphs.append(Glyph(text: piece, box: box))
            }
        }
        guard glyphs.count >= 3 else { return rejected(read, "\(glyphs.count) glyphs from \(selection.numberOfTextRanges(on: page)) ranges") }
        var gaps: [CGFloat] = []
        for k in 1..<glyphs.count { gaps.append(glyphs[k].box.minX - glyphs[k - 1].box.maxX) }
        let letterGap = gaps.sorted()[(gaps.count - 1) / 2]
        // The tracking shows in the gaps between the glyphs' boxes; or, where PDFKit's boxes take the tracking in and
        // the letters seem to touch, in PDFKit's own reading, which spaced single letters apart. A word space is then
        // the space's own box, still a clear gap.
        let trackedByGaps = letterGap >= size * 0.08 && letterGap <= size * 0.6
        let trackedInBoxes = !trackedByGaps && hasSpacedLetters(read) && letterGap > -size * 0.1 && letterGap < size * 0.08
        guard trackedByGaps || trackedInBoxes else { return rejected(read, "letter gap \(measure(letterGap)) at \(measure(size)) pt; gaps \(gaps.map(measure))") }
        // Tracking spaces every pair of letters alike; a line where many pairs sit solid (a title run out to its page
        // number in leader dots) only looks wide, and is left alone.
        if trackedByGaps {
            let solid = gaps.filter { $0 < letterGap * 0.4 }.count
            guard solid * 4 <= gaps.count else { return rejected(read, "\(solid) of \(gaps.count) pairs solid; gaps \(gaps.map(measure))") }
        }
        let wordGap = max(letterGap, 0) + size * 0.2
        var out = glyphs[0].text
        for k in 1..<glyphs.count {
            if gaps[k - 1] > wordGap { out += " " }
            out += glyphs[k].text
        }
        func unspaced(_ s: String) -> String { s.filter { !$0.isWhitespace } }
        guard unspaced(out) == unspaced(read) else { return rejected(read, "read again as “\(out)”") }
        return out
    }

    /// Why the latest lines that looked letter-spaced kept PDFKit's text, a line and a reason each: what the self-test
    /// reports when tracked type does not come through.
    static var letterSpacingNotes: [String] {
        notesLock.lock()
        defer { notesLock.unlock() }
        return notes
    }
    private static let notesLock = NSLock()
    private static var notes: [String] = []

    private static func rejected(_ line: String, _ reason: String) -> String? {
        notesLock.lock()
        notes.append("“\(line)”: \(reason)")
        if notes.count > 16 { notes.removeFirst(notes.count - 16) }
        notesLock.unlock()
        return nil
    }

    private static func measure(_ value: CGFloat) -> String { String(format: "%.2f", Double(value)) }

    /// Scripts that put spaces between words and run left to right: what the glyph gaps can be read for. Chinese,
    /// Japanese, Hebrew and Arabic lines keep PDFKit's text.
    static func spacesWords(_ scalar: Unicode.Scalar) -> Bool {
        let v = scalar.value
        return v < 0x0590 || (0x1E00...0x1FFF).contains(v) || (0x2000...0x206F).contains(v) || (0x20A0...0x20CF).contains(v) || (0xFB00...0xFB06).contains(v)
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
    /// size, a change between letter-spaced and solid type, or a first-line indent after a sentence ends. Consecutive
    /// lines join with a space, or without one when the first ends in a hyphen and the next starts in lower case.
    static func paragraphs(_ lines: [Line], bodySize: CGFloat, pageIndex: Int) -> [Block] {
        guard !lines.isEmpty else { return [] }
        let longLines = lines.filter { $0.text.count > 20 }
        let columnLeft = (longLines.isEmpty ? lines : longLines).map(\.rect.minX).sorted()[max(0, (longLines.isEmpty ? lines : longLines).count / 10)]
        var out: [Block] = []
        var current = ""
        var currentSize: CGFloat = 0
        var currentShown = CGRect.null
        var currentTracked = false
        var previous: Line?
        func flush() {
            if !current.isEmpty { out.append(Block(text: current, size: currentSize, page: pageIndex, shown: currentShown, tracked: currentTracked)) }
            current = ""
            currentSize = 0
            currentShown = .null
            currentTracked = false
        }
        for line in lines {
            var startsBlock = previous == nil
            if let p = previous {
                let gap = p.rect.minY - line.rect.maxY
                let lineHeight = max(p.rect.height, line.rect.height, 1)
                if gap > lineHeight * 0.7 || gap < -lineHeight * 1.5 { startsBlock = true }
                if abs(line.size - p.size) > max(line.size, p.size) * 0.15 { startsBlock = true }
                if line.tracked != p.tracked { startsBlock = true }
                if line.rect.minX > columnLeft + line.size * 1.2, p.rect.minX <= columnLeft + line.size * 0.5, endsSentence(p.text) { startsBlock = true }
                if endsSentence(p.text), p.rect.maxX < line.rect.maxX - line.size * 6 { startsBlock = true }   // a short last line
            }
            if startsBlock {
                flush()
                current = line.text
                currentSize = line.size
                currentTracked = line.tracked
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
