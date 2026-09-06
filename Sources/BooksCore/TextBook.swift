import Foundation

/// Turns a plain-text or Markdown file into chapters: headings are recognised the way people actually write them
/// (CHAPTER I, Part Two, roman numerals, an all-capitals line on its own, `#` headings), paragraphs are joined,
/// and indented blocks are kept as verse.
public enum TextBook {
    public struct Guess: Hashable {
        public var title: String
        public var author: String
    }

    /// Title and author from the file name ("Author - Title.txt" or "Title.txt"), corrected by `Title:`/`Author:`
    /// lines in the text when present.
    public static func guessTitleAuthor(fileName: String, text: String) -> Guess {
        var title = fileName
        if let dot = title.lastIndex(of: "."), dot != title.startIndex { title = String(title[..<dot]) }
        title = title.replacingOccurrences(of: "_", with: " ").trimmingCharacters(in: .whitespaces)
        var author = ""
        for dash in [" - ", " – ", " — "] {
            if let range = title.range(of: dash) {
                // Calibre and most people write "Title - Author"; when only the first half reads like a person's
                // name ("Jane Austen - Pride and Prejudice") the order is the other way round.
                let first = String(title[..<range.lowerBound]).trimmingCharacters(in: .whitespaces)
                let second = String(title[range.upperBound...]).trimmingCharacters(in: .whitespaces)
                if looksLikeName(first), !looksLikeName(second) {
                    author = first
                    title = second
                } else {
                    title = first
                    author = second
                }
                break
            }
        }
        for line in text.split(separator: "\n", maxSplits: 200, omittingEmptySubsequences: true) {
            if line.hasPrefix("Title:") { title = line.dropFirst(6).trimmingCharacters(in: .whitespaces) }
            if line.hasPrefix("Author:") { author = line.dropFirst(7).trimmingCharacters(in: .whitespaces) }
        }
        return Guess(title: title.isEmpty ? "Untitled" : title, author: author.isEmpty ? "Unknown Author" : author)
    }

    private static let stopwords: Set<String> = ["a", "an", "the", "of", "and", "in", "on", "to", "for", "with", "from", "by", "at", "or", "de", "la", "le", "les", "der", "die", "das", "und", "et"]

    /// One to three capitalised words without digits or little words: "Charles Dickens", not "A Christmas Carol".
    static func looksLikeName(_ s: String) -> Bool {
        let words = s.split(separator: " ").map(String.init)
        guard (1...3).contains(words.count), s.count <= 40, !s.contains(where: \.isNumber) else { return false }
        return words.allSatisfy { word in
            guard let first = word.first, first.isUppercase || first == "É" else { return false }
            return !stopwords.contains(word.lowercased())
        }
    }

    public static func chapters(from raw: String) -> [EPUBChapter] {
        var text = raw.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\r", with: "\n")
        if text.hasPrefix("\u{FEFF}") { text.removeFirst() }
        text = stripGutenbergBoilerplate(text)
        let lines = text.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)

        struct Draft { var label: String?; var title: String?; var lines: [String] = []; var hasText: Bool { lines.contains { !$0.trimmingCharacters(in: .whitespaces).isEmpty } } }
        var drafts: [Draft] = []
        var current = Draft()
        for (i, line) in lines.enumerated() {
            if let heading = headingText(lines, i) {
                if current.hasText {
                    drafts.append(current)
                    current = Draft(title: heading)
                } else if let above = current.title {
                    // A heading right under a heading ("PART ONE" over "CHAPTER I") labels the chapter it opens.
                    current = Draft(label: [current.label, above].compactMap { $0 }.joined(separator: " · "), title: heading)
                } else {
                    current = Draft(title: heading)
                }
            } else {
                current.lines.append(line)
            }
        }
        if current.title != nil || current.hasText { drafts.append(current) }

        var built = drafts.filter { $0.title != nil || $0.hasText }
            .map { EPUBChapter(label: $0.label, title: $0.title, html: html(fromLines: $0.lines)) }
        if built.count > 1, built[0].title == nil {
            // An untitled preamble is title/author lines when short; otherwise it is front matter worth keeping.
            let words = HTMLText.wordCount(HTMLText.plainText(built[0].html))
            if words < 60 { built.removeFirst() } else { built[0].title = "Front Matter"; built[0].isFrontMatter = true }
        }
        return built.isEmpty ? [EPUBChapter(title: "Text", html: html(fromLines: lines))] : built
    }

    /// Builds the whole EPUB for a text file.
    public static func epub(fileName: String, text: String, language: String = "en") -> (data: Data, guess: Guess, coverSVG: String) {
        let guess = guessTitleAuthor(fileName: fileName, text: text)
        let cover = CoverArt.svg(title: guess.title, author: guess.author)
        let spec = EPUBSpec(title: guess.title, author: guess.author, language: language, chapters: chapters(from: text), coverSVG: cover)
        return (EPUBWriter.build(spec), guess, cover)
    }

    // MARK: - Recognising structure

    private static let headingWords = ["chapter", "part", "book", "stave", "letter", "act", "scene", "canto", "prologue", "epilogue", "preface", "introduction", "afterword", "appendix"]

    private static func headingText(_ lines: [String], _ i: Int) -> String? {
        let t = lines[i].trimmingCharacters(in: .whitespaces)
        if t.isEmpty || t.count > 80 { return nil }
        if t.hasPrefix("#") {
            let stripped = t.drop { $0 == "#" }.trimmingCharacters(in: .whitespaces)
            return stripped.isEmpty ? nil : stripped
        }
        let prevBlank = i == 0 || lines[i - 1].trimmingCharacters(in: .whitespaces).isEmpty
        let nextBlank = i + 1 >= lines.count || lines[i + 1].trimmingCharacters(in: .whitespaces).isEmpty
        guard prevBlank, nextBlank else { return nil }
        let lower = t.lowercased()
        if headingWords.contains(where: { lower.hasPrefix($0) && (lower.count == $0.count || !lower[lower.index(lower.startIndex, offsetBy: $0.count)].isLetter) }) { return t }
        if t.range(of: "^[IVXLC]+\\.?$", options: .regularExpression) != nil { return t }
        if t.count >= 5, t.range(of: "^[A-Z0-9][A-Z0-9 ,.'’:;\\-!?]{4,}$", options: .regularExpression) != nil, !t.contains(where: { $0.isLowercase }) { return t }
        return nil
    }

    private static func stripGutenbergBoilerplate(_ text: String) -> String {
        var result = text
        if let start = result.range(of: "^\\*\\*\\* ?START OF[^\\n]*\\*\\*\\*\\s*$", options: [.regularExpression, .anchored, .caseInsensitive]) ?? result.range(of: "\\*\\*\\* ?START OF[^\\n]*\\*\\*\\*", options: .regularExpression) {
            if let newline = result[start.upperBound...].firstIndex(of: "\n") { result = String(result[result.index(after: newline)...]) }
        }
        if let end = result.range(of: "\\*\\*\\* ?END OF[^\\n]*", options: .regularExpression) {
            result = String(result[..<end.lowerBound])
        }
        return result
    }

    static func html(fromLines lines: [String]) -> String {
        var out: [String] = []
        var block: [String] = []
        func flush() {
            guard !block.isEmpty else { return }
            let indented = block.filter { $0.range(of: "^\\s{2,}\\S", options: .regularExpression) != nil }.count
            if block.count >= 2, Double(indented) >= Double(block.count) * 0.6 {
                let verse = block.map { XHTML.escape($0.trimmingCharacters(in: .whitespaces)) }.joined(separator: "<br/>")
                out.append("<p class=\"verse\">\(verse)</p>")
            } else if block.allSatisfy({ $0.hasPrefix(">") }) {
                out.append("<blockquote><p>\(inline(block.map { String($0.dropFirst()).trimmingCharacters(in: .whitespaces) }.joined(separator: " ")))</p></blockquote>")
            } else {
                out.append("<p>\(inline(block.map { $0.trimmingCharacters(in: .whitespaces) }.joined(separator: " ")))</p>")
            }
            block = []
        }
        for line in lines {
            if line.trimmingCharacters(in: .whitespaces).isEmpty { flush() } else { block.append(line) }
        }
        flush()
        return out.joined(separator: "\n")
    }

    /// Escapes, then restores the light emphasis people use in plain text: `_word_`, `*word*` and `**word**`.
    static func inline(_ text: String) -> String {
        var s = XHTML.escape(text)
        s = s.replacingOccurrences(of: "\\*\\*([^*]{1,300}?)\\*\\*", with: "<strong>$1</strong>", options: .regularExpression)
        s = s.replacingOccurrences(of: "(?<![\\w*])\\*([^*\\n]{1,300}?)\\*(?![\\w*])", with: "<em>$1</em>", options: .regularExpression)
        s = s.replacingOccurrences(of: "(?<!\\w)_([^_\\n]{1,300}?)_(?!\\w)", with: "<em>$1</em>", options: .regularExpression)
        return s
    }
}
