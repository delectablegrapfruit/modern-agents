import AppKit

/// Running heads, checked apart from the reader: a small A5 book set as the showcase's sample is (a letter-spaced
/// head in two parts over a hairline rule, justified text feathered to the foot of its block, a folio under it) is
/// analysed as Zoom & Split analyses any PDF. The head stands off from the text by little more than one of the text's
/// own lines, so it is found only when its recurrence is weighed; and no line of the text may be taken for furniture.
extension SelfTest {
    @MainActor
    static func checkRunningHeads() throws {
        let page = CGSize(width: 420, height: 595)
        let margin: CGFloat = 54
        let column = page.width - 2 * margin
        // Down from the top of the page, as the text system draws: the text block, the head, its rule and the folio.
        let top: CGFloat = 64, bottom: CGFloat = 533, firstTop: CGFloat = 236
        let headY: CGFloat = 30, ruleY: CGFloat = 44, folioY: CGFloat = 555
        let pageCount = 6
        let leftHead = "FRANCIS BACON", rightHead = "ESSAYS, CIVIL AND MORAL"
        let ink = NSColor(srgbRed: 0.114, green: 0.114, blue: 0.122, alpha: 1)
        let grey = NSColor(srgbRed: 0.431, green: 0.431, blue: 0.451, alpha: 1)
        func font(_ name: String, _ size: CGFloat) -> NSFont {
            NSFont(name: name, size: size) ?? NSFont(name: "Georgia", size: size) ?? NSFont.systemFont(ofSize: size)
        }
        let bodyFont = font("HoeflerText-Regular", 11)
        let headFont = font("HoeflerText-Regular", 7.5)

        // Prose that never repeats a line: words drawn in a fixed pseudo-random order, so that no line of the text
        // recurs at the head or the foot of the pages as a running head does. No word is made only of the letters of
        // Roman numerals, which a line of one word would be read as.
        let words: [String] = [
            "studies", "serve", "for", "delight", "ornament", "and", "ability", "their", "chief", "use", "is", "in",
            "privateness", "retiring", "discourse", "judgment", "business", "expert", "men", "execute", "perhaps",
            "particulars", "one", "by", "but", "general", "counsels", "plots", "marshalling", "of", "affairs", "come",
            "best", "from", "those", "that", "are", "learned", "to", "spend", "too", "much", "time", "sloth",
            "affectation", "make", "wholly", "rules", "humour", "scholar", "they", "perfect", "nature", "perfected",
            "experience", "natural", "abilities", "like", "plants", "need", "pruning", "study", "themselves", "give",
            "forth", "directions", "bounded", "crafty", "contemn", "simple", "admire", "wise", "teach", "own", "wisdom",
            "without", "above", "won", "observation", "read", "contradict", "confute", "believe", "take", "granted",
            "find", "talk", "weigh", "consider", "some", "books", "tasted", "others", "swallowed", "few", "chewed",
            "digested", "reading", "maketh", "full", "conference", "ready", "writing", "exact", "man",
        ]
        var seed: UInt64 = 0x2545_F491_4F6C_DD1D
        func pick(_ count: Int) -> Int {
            seed = seed &* 6_364_136_223_846_793_005 &+ 1_442_695_040_888_963_407
            return Int((seed >> 33) % UInt64(count))
        }
        let text = NSMutableAttributedString()
        for index in 0..<40 {
            var sentences: [String] = []
            for _ in 0..<(4 + pick(4)) {
                var picked: [String] = []
                for _ in 0..<(8 + pick(9)) { picked.append(words[pick(words.count)]) }
                let sentence = picked.joined(separator: " ")
                sentences.append(sentence.prefix(1).uppercased() + String(sentence.dropFirst()) + ".")
            }
            let style = NSMutableParagraphStyle()
            style.alignment = .justified
            style.lineHeightMultiple = 1.16
            style.firstLineHeadIndent = index == 0 ? 0 : 14
            let attributes: [NSAttributedString.Key: Any] = [.font: bodyFont, .foregroundColor: ink, .paragraphStyle: style]
            text.append(NSAttributedString(string: sentences.joined(separator: " ") + "\n", attributes: attributes))
        }

        // Laid out once in a column as long as it needs, then dealt out to pages a line at a time, as the sample is.
        let storage = NSTextStorage(attributedString: text)
        let layout = NSLayoutManager()
        storage.addLayoutManager(layout)
        let container = NSTextContainer(size: NSSize(width: column, height: 100_000))
        container.lineFragmentPadding = 0
        layout.addTextContainer(container)
        layout.ensureLayout(for: container)
        /// A line of the column: its glyphs, and the top and the foot of its letters.
        struct SetLine {
            let glyphs: NSRange
            let top: CGFloat
            let foot: CGFloat
        }
        var setLines: [SetLine] = []
        var nextGlyph = 0
        while nextGlyph < layout.numberOfGlyphs {
            var range = NSRange(location: 0, length: 0)
            let fragment = layout.lineFragmentRect(forGlyphAt: nextGlyph, effectiveRange: &range)
            guard range.length > 0 else { break }
            let baseline = fragment.minY + layout.location(forGlyphAt: range.location).y
            setLines.append(SetLine(glyphs: range, top: baseline - bodyFont.ascender, foot: baseline - bodyFont.descender))
            nextGlyph = NSMaxRange(range)
        }
        var pages: [Range<Int>] = []
        var first = 0
        while first < setLines.count && pages.count < pageCount {
            let room = pages.isEmpty ? bottom - firstTop : bottom - top
            var end = first + 1
            while end < setLines.count && setLines[end].foot - setLines[first].top <= room { end += 1 }
            pages.append(first..<end)
            first = end
        }
        guard pages.count == pageCount, first < setLines.count else { throw Failure("the running-head test book's text did not fill \(pageCount) pages") }

        let data = NSMutableData()
        var mediaBox = CGRect(origin: .zero, size: page)
        guard let consumer = CGDataConsumer(data: data as CFMutableData), let context = CGContext(consumer: consumer, mediaBox: &mediaBox, nil) else {
            throw Failure("could not create a PDF context for the running-head test")
        }
        func typeset(_ string: String, _ font: NSFont, _ color: NSColor, kern: CGFloat, alignment: NSTextAlignment, in rect: NSRect) {
            let style = NSMutableParagraphStyle()
            style.alignment = alignment
            style.lineBreakMode = .byWordWrapping
            let attributes: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: color, .kern: kern, .paragraphStyle: style]
            NSAttributedString(string: string, attributes: attributes).draw(in: rect)
        }
        for (index, range) in pages.enumerated() {
            context.beginPDFPage(nil)
            // The text system draws top down, so the page is turned to run that way.
            context.saveGState()
            context.translateBy(x: 0, y: page.height)
            context.scaleBy(x: 1, y: -1)
            NSGraphicsContext.saveGraphicsState()
            NSGraphicsContext.current = NSGraphicsContext(cgContext: context, flipped: true)
            let blockTop = index == 0 ? firstTop : top
            if index == 0 {
                // A title page, its title below the margin: no head, no folio.
                typeset("FRANCIS BACON", font("HoeflerText-Regular", 9), grey, kern: 2.5, alignment: .center, in: NSRect(x: margin, y: 84, width: column, height: 14))
                typeset("Essays", font("HoeflerText-Regular", 38), ink, kern: 0, alignment: .center, in: NSRect(x: margin, y: 100, width: column, height: 52))
            } else {
                // The head in two parts on one baseline, letter-spaced, over a hairline; the folio centred at the foot.
                typeset(leftHead, headFont, grey, kern: 1.6, alignment: .left, in: NSRect(x: margin, y: headY, width: column / 2, height: 12))
                typeset(rightHead, headFont, grey, kern: 1.6, alignment: .right, in: NSRect(x: margin + column / 2, y: headY, width: column / 2, height: 12))
                let rule = NSBezierPath()
                rule.move(to: NSPoint(x: margin, y: ruleY))
                rule.line(to: NSPoint(x: page.width - margin, y: ruleY))
                rule.lineWidth = 0.5
                grey.withAlphaComponent(0.5).setStroke()
                rule.stroke()
                typeset("\(index + 1)", font("HoeflerText-Regular", 8.5), grey, kern: 0, alignment: .center, in: NSRect(x: margin, y: folioY, width: column, height: 12))
            }
            // Each page's text starts at the head of its block and, feathered, ends at its foot.
            let span = setLines[range.upperBound - 1].foot - setLines[range.lowerBound].top
            let perLine: CGFloat = range.count > 1 ? max(0, (bottom - blockTop) - span) / CGFloat(range.count - 1) : 0
            let shift = blockTop - setLines[range.lowerBound].top
            for (k, lineIndex) in range.enumerated() {
                layout.drawGlyphs(forGlyphRange: setLines[lineIndex].glyphs, at: NSPoint(x: margin, y: shift + perLine * CGFloat(k)))
            }
            NSGraphicsContext.restoreGraphicsState()
            context.restoreGState()
            context.endPDFPage()
        }
        context.closePDF()

        let url = FileManager.default.temporaryDirectory.appendingPathComponent("Books Running Heads \(UUID().uuidString).pdf")
        try (data as Data).write(to: url)
        defer { try? FileManager.default.removeItem(at: url) }
        guard let prepared = SplitPDFPresenter.analyse(url: url) else { throw Failure("the running-head test book could not be analysed") }
        guard prepared.headers.count == pageCount, prepared.footers.count == pageCount, prepared.lines.count == pageCount else {
            throw Failure("the running-head test book was analysed as \(prepared.lines.count) pages, not \(pageCount)")
        }

        // Letters only, left to right: PDFKit may read letter-spaced capitals with a space between every letter.
        func letters(_ text: String) -> String {
            text.lowercased().filter { $0.isLetter }
        }
        func leftToRight(_ lines: [SplitPreparation.Line]) -> String {
            lines.sorted { $0.minX < $1.minX }.map(\.text).joined()
        }
        func digits(_ text: String) -> String {
            text.filter { $0.isASCII && $0.isNumber }
        }
        func quoted(_ lines: [SplitPreparation.Line]) -> String {
            "“" + lines.map(\.text).joined(separator: " | ") + "”"
        }
        let headLetters = letters(leftHead + rightHead)
        let leftLetters = letters(leftHead), rightLetters = letters(rightHead)
        // The same places in display space, up from the foot of the page, where the analysis reports them.
        let blockFoot = page.height - bottom
        let ruleLine = page.height - ruleY
        var clearance: CGFloat = 0, ruleMargin: CGFloat = .infinity
        for i in 0..<pageCount {
            let header = prepared.headers[i], footer = prepared.footers[i]
            let blockHead = page.height - (i == 0 ? firstTop : top)
            // No line of the text is in either band: by its place (its middle within the text block) or by its words.
            for line in header + footer {
                let middle = (line.minY + line.maxY) / 2
                if middle > blockFoot && middle < blockHead {
                    throw Failure("page \(i + 1): the text line “\(line.text)” was taken for a running head or foot")
                }
            }
            for line in header {
                let found = letters(line.text)
                guard !found.isEmpty, headLetters.contains(found) else { throw Failure("page \(i + 1): the head band holds “\(line.text)”, which is not the running head") }
            }
            for line in footer {
                guard letters(line.text).isEmpty, digits(line.text) == "\(i + 1)" else { throw Failure("page \(i + 1): the foot band holds “\(line.text)”, which is not its folio") }
            }
            if i == 0 {
                guard header.isEmpty else { throw Failure("page 1 has no running head, but \(quoted(header)) was cut from its top") }
                continue
            }
            let found = letters(leftToRight(header))
            guard !header.isEmpty, found.contains(leftLetters), found.contains(rightLetters) else {
                let opening = prepared.lines[i].prefix(3).map { "“\($0.text)” \(Int($0.minY))–\(Int($0.maxY))" }.joined(separator: ", ")
                throw Failure("page \(i + 1): the running head was not cut (band \(quoted(header)); top lines \(opening); typical line \(Int(prepared.typicalLineHeight)) pt)")
            }
            guard digits(leftToRight(footer)) == "\(i + 1)" else {
                throw Failure("page \(i + 1): the folio was not cut (band \(quoted(footer)))")
            }
            // The rule under the head is ink, not text: it goes with the head only if it lies above the cut, which
            // segment(page:strip:) makes midway between the band and the first line of the text below it.
            guard let bandBottom = header.map(\.minY).min() else { continue }
            let body = prepared.lines[i].filter { (line: SplitPreparation.Line) -> Bool in
                !header.contains(where: { $0.minX == line.minX && $0.minY == line.minY && $0.maxY == line.maxY })
            }
            guard let next = body.first(where: { $0.maxY <= bandBottom }) else { throw Failure("page \(i + 1): no text was found below the running head") }
            let cut = (bandBottom + next.maxY) / 2
            guard ruleLine - 0.25 > cut else {
                throw Failure("page \(i + 1): the rule under the head (at \(Int(ruleLine))) lies below the cut at \(Int(cut)) and would be shown")
            }
            if i == 1 { clearance = bandBottom - next.maxY }
            ruleMargin = min(ruleMargin, ruleLine - 0.25 - cut)
        }
        let head = quoted(prepared.headers[1])
        let clear = String(format: "%.1f", Double(clearance))
        let typical = String(format: "%.1f", Double(prepared.typicalLineHeight))
        let above = String(format: "%.1f", Double(ruleMargin))
        print("SELFTEST: running heads: \(head) and folios 2–\(pageCount) cut on pages 2–\(pageCount), nothing on page 1; the head stands \(clear) pt clear of the text (typical line \(typical) pt); the rule lies \(above) pt above the cut")
        fflush(stdout)
    }
}
