import AppKit
import PDFKit
import BooksCore

extension SelfTest {
    /// A small book set the way the showcase's essays are (a title page under a letter-spaced author's name, and each
    /// essay a letter-spaced numeral over an italic title, one of them opening halfway down a page) goes through the
    /// conversion Text uses. The letter-spaced lines must read as their words, the title page must be the book's first
    /// section, each essay's heading must be shown once and name its chapter once, and the map from paragraphs to
    /// pages must follow the text exactly as the reader counts it.
    @MainActor
    static func checkReflowLetterSpacing() async throws {
        func note(_ message: String) {
            print("SELFTEST: " + message)
            fflush(stdout)
        }
        let file = FileManager.default.temporaryDirectory.appendingPathComponent("Books Reflow Self-Test \(UUID().uuidString).pdf")
        try reflowSamplePDF().write(to: file)
        defer { try? FileManager.default.removeItem(at: file) }
        // Off the main thread, as the reader converts.
        let made = try await Task.detached(priority: .userInitiated) {
            try PDFReflow.convert(from: file, title: "Essays, Civil and Moral", author: "Francis Bacon")
        }.value

        let archive = try ZipArchive(data: made.epub)
        var files: [String] = []
        while archive.contains(String(format: "OEBPS/ch%03d.xhtml", files.count + 1)) {
            files.append(try archive.string(String(format: "OEBPS/ch%03d.xhtml", files.count + 1)))
        }
        let texts: [String] = files.map(reflowChapterText)
        let whole = texts.joined(separator: "\n")
        func excerpt(_ text: String) -> String { String(text.prefix(240)).replacingOccurrences(of: "\n", with: " | ") }

        // Letter-spaced lines read as their words; lines set solid are as PDFKit reads them.
        guard whole.contains("FRANCIS BACON"), whole.contains("ESSAY I"), whole.contains("ESSAY II") else {
            // What stands before the second essay's title, where its numeral should be.
            var beforeDeath = "(no “Death”)"
            if let death = whole.range(of: "Death") {
                let start = whole.index(death.lowerBound, offsetBy: -120, limitedBy: whole.startIndex) ?? whole.startIndex
                beforeDeath = String(whole[start..<death.upperBound]).replacingOccurrences(of: "\n", with: " | ")
            }
            throw Failure("the letter-spaced lines did not come through as “FRANCIS BACON”, “ESSAY I” and “ESSAY II”: \(excerpt(whole)); \(files.count) chapters; before “Death”: \(beforeDeath); letter-spaced lines: \(PDFReflow.letterSpacingNotes.joined(separator: "; "))")
        }
        for broken in ["FRANCISBACON", "E S S", "F R A", "ESSAYI"] where whole.contains(broken) {
            throw Failure("the reflowed text has “\(broken)”, letter spacing misread: \(excerpt(whole))")
        }
        guard whole.contains("What is truth? said jesting Pilate") else {
            throw Failure("a line set solid did not come through as it reads: \(excerpt(whole))")
        }
        if let folio = whole.split(separator: "\n").first(where: { !$0.isEmpty && $0.allSatisfy(\.isNumber) }) {
            throw Failure("the folio “\(folio)” was kept as text")
        }

        // The title page first, as front matter; then one chapter to each essay.
        guard files.count == 3 else {
            throw Failure("the sample reflowed into \(files.count) chapters, expected the front matter and two essays: \(texts.map(excerpt))")
        }
        guard files[0].contains("epub:type=\"frontmatter\""), texts[0].contains("FRANCIS BACON"), texts[0].contains("or Counsels, Civil and Moral"),
              !texts[0].contains("Of Truth"), !texts[0].contains("ESSAY") else {
            throw Failure("the first chapter is not the title page as front matter: \(excerpt(texts[0]))")
        }
        guard texts[0].components(separatedBy: "Essays").count - 1 == 1 else {
            throw Failure("the title page's heading is not shown once: \(excerpt(texts[0]))")
        }
        let essays: [(title: String, kicker: String)] = [("Of Truth", "ESSAY I"), ("Of Death", "ESSAY II")]
        for (index, essay) in essays.enumerated() {
            let text = texts[index + 1]
            let headings = text.components(separatedBy: essay.title).count - 1
            guard headings == 1 else { throw Failure("“\(essay.title)” is in its chapter \(headings) times, expected once: \(excerpt(text))") }
            guard files[index + 1].contains("<h2>\(essay.title)</h2>"), text.hasPrefix(essay.kicker) else {
                throw Failure("“\(essay.kicker)” is not the kicker over “\(essay.title)”: \(excerpt(text))")
            }
            for other in texts.indices where other != index + 1 && texts[other].contains(essay.title) {
                throw Failure("“\(essay.title)” also heads chapter \(other + 1): \(excerpt(texts[other]))")
            }
        }
        // The first essay's last paragraph is on the page the second opens on, and stays with the first.
        guard texts[1].contains("Truth may perhaps come to the price of a pearl"), !texts[2].contains("Truth may perhaps") else {
            throw Failure("the first essay's end did not stay in its chapter: \(excerpt(texts[2]))")
        }
        guard texts[2].contains("It is worthy the observing") else { throw Failure("the second essay lost its last page: \(excerpt(texts[2]))") }

        // Each chapter goes by one name: no "Of Truth: Of Truth" in the contents.
        let nav = try archive.string("OEBPS/nav.xhtml")
        let link = try NSRegularExpression(pattern: "<a href=\"ch[0-9]+\\.xhtml\">([^<]*)</a>")
        let names: [String] = link.matches(in: nav, range: NSRange(nav.startIndex..., in: nav)).compactMap { match in
            Range(match.range(at: 1), in: nav).map { String(nav[$0]) }
        }
        guard names.count == files.count else { throw Failure("the contents list \(names.count) chapters of \(files.count): \(names)") }
        for name in names {
            let parts = name.components(separatedBy: ": ")
            if parts.count == 2, PDFReflow.sameWords(parts[0], parts[1]) { throw Failure("the contents name a chapter “\(name)”") }
        }
        guard names[1].hasSuffix("Of Truth"), names[2].hasSuffix("Of Death") else { throw Failure("the contents read \(names)") }

        // The map tiles each chapter's text: its paragraphs one after another, a line break between them and none lost.
        for (index, text) in texts.enumerated() {
            let spine = index + 1
            let units = Array(text.utf16)
            let entries = made.map.entries.filter { $0.spine == spine }.sorted { $0.offset < $1.offset }
            var cursor = 0
            for entry in entries {
                while cursor < units.count, units[cursor] == 10 { cursor += 1 }
                guard entry.offset == cursor, entry.length > 0 else {
                    throw Failure("chapter \(spine): a paragraph is mapped at \(entry.offset)+\(entry.length), expected at \(cursor), in “\(excerpt(text))”")
                }
                cursor = entry.offset + entry.length
            }
            while cursor < units.count, units[cursor] == 10 { cursor += 1 }
            guard cursor == units.count else {
                throw Failure("chapter \(spine): the map ends at \(cursor) of \(units.count) characters, in “\(excerpt(text))”")
            }
        }
        guard let deathHeading = made.map.entries.first(where: { $0.spine == 3 && $0.offset == PDFReflow.PageMap.textLength("ESSAY II") }), deathHeading.page == 1 else {
            throw Failure("the second essay's heading is not mapped to page 2")
        }
        note("Reflow: letter-spaced lines read “FRANCIS BACON” and “ESSAY I”; the title page is front matter; contents \(names.joined(separator: " / ")); each heading once; the map follows the text")
    }

    /// The text of a converted chapter as the reader counts it: its body's text, tags left out and entities read.
    private static func reflowChapterText(_ xhtml: String) -> String {
        guard let open = xhtml.range(of: "<body>"), let close = xhtml.range(of: "</body>", options: .backwards), open.upperBound <= close.lowerBound else { return "" }
        let body = String(xhtml[open.upperBound..<close.lowerBound])
        let bare = body.replacingOccurrences(of: "<[^>]*>", with: "", options: .regularExpression)
        return bare.replacingOccurrences(of: "&lt;", with: "<").replacingOccurrences(of: "&gt;", with: ">")
            .replacingOccurrences(of: "&quot;", with: "\"").replacingOccurrences(of: "&amp;", with: "&")
    }

    /// Three pages in the showcase's manner: a title page with the author's name letter-spaced over a large title, and
    /// the first essay under it; the second essay opening halfway down page 2 under the first essay's end; folios on
    /// pages 2 and 3.
    private static func reflowSamplePDF() throws -> Data {
        let size = CGSize(width: 420, height: 595)
        let margin: CGFloat = 54
        let column = size.width - 2 * margin
        func regular(_ points: CGFloat) -> NSFont {
            NSFont(name: "HoeflerText-Regular", size: points) ?? NSFont(name: "Georgia", size: points) ?? NSFont.systemFont(ofSize: points)
        }
        func italic(_ points: CGFloat) -> NSFont {
            NSFont(name: "HoeflerText-Italic", size: points) ?? NSFont(name: "Georgia-Italic", size: points) ?? NSFont.systemFont(ofSize: points)
        }
        func styled(_ text: String, _ font: NSFont, kern: CGFloat = 0, alignment: NSTextAlignment = .left) -> NSAttributedString {
            let style = NSMutableParagraphStyle()
            style.alignment = alignment
            style.lineBreakMode = .byWordWrapping
            var attributes: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: NSColor.black, .paragraphStyle: style]
            if kern != 0 { attributes[.kern] = kern }
            return NSAttributedString(string: text, attributes: attributes)
        }
        func kicker(_ text: String) -> NSAttributedString { styled(text, regular(8), kern: 1.8) }
        func heading(_ text: String) -> NSAttributedString { styled(text, italic(15)) }
        func paragraph(_ text: String) -> NSAttributedString { styled(text, regular(11), alignment: .justified) }

        // What each page sets in its text block, and the room left before each piece.
        struct Piece {
            let text: NSAttributedString
            let before: CGFloat
        }
        let flows: [[Piece]] = [
            [
                Piece(text: kicker("ESSAY I"), before: 0),
                Piece(text: heading("Of Truth"), before: 4),
                Piece(text: paragraph("What is truth? said jesting Pilate, and would not stay for an answer. Certainly there be, that delight in giddiness, and count it a bondage to fix a belief; affecting free will in thinking, as well as in acting. And though the sects of philosophers of that kind be gone, yet there remain certain discoursing wits, which are of the same veins, though there be not so much blood in them, as was in those of the ancients."), before: 6),
            ],
            [
                Piece(text: paragraph("Truth may perhaps come to the price of a pearl, that showeth best by day; but it will not rise to the price of a diamond, or carbuncle, that showeth best in varied lights. A mixture of a lie doth ever add pleasure."), before: 0),
                Piece(text: kicker("ESSAY II"), before: 24),
                Piece(text: heading("Of Death"), before: 4),
                Piece(text: paragraph("Men fear death, as children fear to go in the dark; and as that natural fear in children, is increased with tales, so is the other. Certainly, the contemplation of death, as the wages of sin, and passage to another world, is holy and religious."), before: 6),
            ],
            [
                Piece(text: paragraph("It is worthy the observing, that there is no passion in the mind of man, so weak, but it mates, and masters, the fear of death; and therefore, death is no such terrible enemy, when a man hath so many attendants about him, that can win the combat of him."), before: 0),
            ],
        ]

        let data = NSMutableData()
        var mediaBox = CGRect(origin: .zero, size: size)
        guard let consumer = CGDataConsumer(data: data as CFMutableData), let context = CGContext(consumer: consumer, mediaBox: &mediaBox, nil) else {
            throw Failure("could not create a PDF context")
        }
        for (index, flow) in flows.enumerated() {
            context.beginPDFPage(nil)
            // The text system draws top down, so the page is turned to run that way.
            context.saveGState()
            context.translateBy(x: 0, y: size.height)
            context.scaleBy(x: 1, y: -1)
            NSGraphicsContext.saveGraphicsState()
            NSGraphicsContext.current = NSGraphicsContext(cgContext: context, flipped: true)
            var y: CGFloat = 64
            if index == 0 {
                styled("FRANCIS BACON", regular(9), kern: 2.5, alignment: .center).draw(in: NSRect(x: margin, y: 84, width: column, height: 16))
                styled("Essays", regular(38), alignment: .center).draw(in: NSRect(x: margin, y: 100, width: column, height: 60))
                styled("or Counsels, Civil and Moral", italic(12.5), alignment: .center).draw(in: NSRect(x: margin, y: 152, width: column, height: 24))
                styled("Two essays, set to try how a title page reflows.", italic(8.5), alignment: .center)
                    .draw(in: NSRect(x: margin + 30, y: 194, width: column - 60, height: 16))
                y = 240
            } else {
                styled("\(index + 1)", regular(8.5), alignment: .center).draw(in: NSRect(x: margin, y: 555, width: column, height: 14))
            }
            for piece in flow {
                y += piece.before
                let bounds = piece.text.boundingRect(with: NSSize(width: column, height: 10_000), options: [.usesLineFragmentOrigin, .usesFontLeading], context: nil)
                let height = ceil(bounds.height)
                piece.text.draw(in: NSRect(x: margin, y: y, width: column, height: height + 6))
                y += height
            }
            NSGraphicsContext.restoreGraphicsState()
            context.restoreGState()
            context.endPDFPage()
        }
        context.closePDF()
        return data as Data
    }
}
