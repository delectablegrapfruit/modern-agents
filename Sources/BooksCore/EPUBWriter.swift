import Foundation

/// One chapter of a book assembled by the app itself (from plain text, or a Kindle file).
public struct EPUBChapter: Hashable {
    public var label: String?
    public var title: String?
    /// XHTML body content (already well formed).
    public var html: String
    public var isFrontMatter: Bool

    public init(label: String? = nil, title: String? = nil, html: String, isFrontMatter: Bool = false) {
        self.label = label
        self.title = title
        self.html = html
        self.isFrontMatter = isFrontMatter
    }

    var navTitle: String {
        [label, title].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: ": ")
    }
}

public struct EPUBSpec {
    public var title: String
    public var author: String
    public var language: String
    public var identifier: String?
    public var publisher: String?
    public var description: String?
    public var subjects: [String]
    public var chapters: [EPUBChapter]
    /// A generated SVG cover, when the source has none.
    public var coverSVG: String?
    public var sourceNote: String?

    public init(title: String, author: String, language: String = "en", identifier: String? = nil, publisher: String? = nil,
                description: String? = nil, subjects: [String] = [], chapters: [EPUBChapter], coverSVG: String? = nil, sourceNote: String? = nil) {
        self.title = title
        self.author = author
        self.language = language
        self.identifier = identifier
        self.publisher = publisher
        self.description = description
        self.subjects = subjects
        self.chapters = chapters
        self.coverSVG = coverSVG
        self.sourceNote = sourceNote
    }
}

/// Packages chapters as an EPUB 3 file with a title page, navigation document, NCX and a small stylesheet, so the
/// reader treats a text file exactly like any other book.
public enum EPUBWriter {
    public static let stylesheet = """
    html { font-size: 100%; }
    body { line-height: 1.5; margin: 0; }
    p { margin: 0 0 0 0; text-indent: 1.5em; }
    p.verse { text-indent: 0; margin: 0.6em 0 0.6em 1.5em; white-space: pre-wrap; }
    h1, h2, h3 { font-weight: 600; line-height: 1.25; margin: 1.6em 0 0.8em; text-align: left; }
    header.chapter-head { margin: 0 0 1.8em; }
    header.chapter-head p.chapter-label { margin: 0; text-indent: 0; font-size: 0.8em; letter-spacing: 0.1em; text-transform: uppercase; opacity: 0.65; }
    header.chapter-head h2 { margin: 0.2em 0 0; }
    header.chapter-head + p, h1 + p, h2 + p, h3 + p, p.verse + p, blockquote + p, hr + p { text-indent: 0; }
    .title-page { text-align: center; padding-top: 30vh; }
    .title-page h1 { font-size: 2em; margin: 0 0 0.6em; }
    .title-page .author { font-style: italic; font-size: 1.2em; opacity: 0.85; text-indent: 0; }
    .title-page .source { margin-top: 4em; font-size: 0.8em; opacity: 0.6; text-indent: 0; }
    .cover-page { text-align: center; margin: 0; padding: 0; }
    .cover-page img { max-width: 100%; max-height: 100vh; }
    blockquote { margin: 0.8em 1.5em; }
    """

    public static func build(_ spec: EPUBSpec) -> Data {
        let id = spec.identifier ?? "urn:uuid:" + UUID().uuidString.lowercased()
        let modified = ISO8601DateFormatter().string(from: Date())
        let lang = XHTML.escape(spec.language.isEmpty ? "en" : spec.language)
        var zip = ZipWriter()
        zip.add("mimetype", "application/epub+zip")
        zip.add("META-INF/container.xml", """
        <?xml version="1.0" encoding="UTF-8"?>
        <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>
        """)
        struct Built { let chapter: EPUBChapter; let file: String; let id: String; let navTitle: String }
        let chapters = spec.chapters.enumerated().map { i, c in
            Built(chapter: c, file: String(format: "ch%03d.xhtml", i + 1), id: "ch\(i + 1)", navTitle: c.navTitle.isEmpty ? "Chapter \(i + 1)" : c.navTitle)
        }
        func page(_ title: String, _ body: String) -> String {
            """
            <?xml version="1.0" encoding="UTF-8"?>
            <!DOCTYPE html>
            <html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="\(lang)" lang="\(lang)">
            <head><meta charset="utf-8"/><title>\(XHTML.escape(title))</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
            <body>\(body)</body></html>
            """
        }
        let hasCover = spec.coverSVG != nil
        if let svg = spec.coverSVG {
            zip.add("OEBPS/cover.svg", svg)
            zip.add("OEBPS/cover.xhtml", page("Cover", "<div class=\"cover-page\" epub:type=\"cover\"><img src=\"cover.svg\" alt=\"Cover\"/></div>"))
        }
        let source = spec.sourceNote.map { "<p class=\"source\">\(XHTML.escape($0))</p>" } ?? ""
        zip.add("OEBPS/titlepage.xhtml", page(spec.title, "<section class=\"title-page\" epub:type=\"titlepage\"><h1>\(XHTML.escape(spec.title))</h1><p class=\"author\">\(XHTML.escape(spec.author))</p>\(source)</section>"))
        for c in chapters {
            var head = ""
            if c.chapter.label != nil || c.chapter.title != nil {
                head = "<header class=\"chapter-head\">"
                if let label = c.chapter.label, !label.isEmpty { head += "<p class=\"chapter-label\">\(XHTML.escape(label))</p>" }
                if let title = c.chapter.title, !title.isEmpty { head += "<h2>\(XHTML.escape(title))</h2>" }
                head += "</header>"
            }
            zip.add("OEBPS/" + c.file, page(c.navTitle, "<section class=\"chapter\" epub:type=\"\(c.chapter.isFrontMatter ? "frontmatter" : "chapter")\">\(head)\(c.chapter.html)</section>"))
        }
        zip.add("OEBPS/style.css", stylesheet)
        let navItems = chapters.map { "<li><a href=\"\($0.file)\">\(XHTML.escape($0.navTitle))</a></li>" }.joined()
        let landmarks = (hasCover ? "<li><a epub:type=\"cover\" href=\"cover.xhtml\">Cover</a></li>" : "")
            + "<li><a epub:type=\"titlepage\" href=\"titlepage.xhtml\">Title Page</a></li>"
            + "<li><a epub:type=\"bodymatter\" href=\"\(chapters.first?.file ?? "titlepage.xhtml")\">Start</a></li>"
        zip.add("OEBPS/nav.xhtml", """
        <?xml version="1.0" encoding="UTF-8"?>
        <!DOCTYPE html>
        <html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head>
        <body><nav epub:type="toc" id="toc"><h1>Contents</h1><ol>\(navItems)</ol></nav>
        <nav epub:type="landmarks" hidden=""><ol>\(landmarks)</ol></nav></body></html>
        """)
        let navPoints = chapters.enumerated().map { i, c in
            "<navPoint id=\"np\(i + 1)\" playOrder=\"\(i + 1)\"><navLabel><text>\(XHTML.escape(c.navTitle))</text></navLabel><content src=\"\(c.file)\"/></navPoint>"
        }.joined()
        zip.add("OEBPS/toc.ncx", """
        <?xml version="1.0" encoding="UTF-8"?>
        <ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="\(XHTML.escape(id))"/></head><docTitle><text>\(XHTML.escape(spec.title))</text></docTitle>
        <navMap>\(navPoints)</navMap></ncx>
        """)
        var manifest = [
            "<item id=\"nav\" href=\"nav.xhtml\" media-type=\"application/xhtml+xml\" properties=\"nav\"/>",
            "<item id=\"ncx\" href=\"toc.ncx\" media-type=\"application/x-dtbncx+xml\"/>",
            "<item id=\"css\" href=\"style.css\" media-type=\"text/css\"/>",
            "<item id=\"titlepage\" href=\"titlepage.xhtml\" media-type=\"application/xhtml+xml\"/>",
        ]
        var spine = ["<itemref idref=\"titlepage\"/>"]
        if hasCover {
            manifest.insert("<item id=\"cover-image\" href=\"cover.svg\" media-type=\"image/svg+xml\" properties=\"cover-image\"/><item id=\"cover\" href=\"cover.xhtml\" media-type=\"application/xhtml+xml\"/>", at: 0)
            spine.insert("<itemref idref=\"cover\" linear=\"yes\"/>", at: 0)
        }
        for c in chapters {
            manifest.append("<item id=\"\(c.id)\" href=\"\(c.file)\" media-type=\"application/xhtml+xml\"/>")
            spine.append("<itemref idref=\"\(c.id)\"/>")
        }
        var meta = "<dc:identifier id=\"pub-id\">\(XHTML.escape(id))</dc:identifier>\n<dc:title>\(XHTML.escape(spec.title))</dc:title>\n<dc:creator id=\"creator\">\(XHTML.escape(spec.author.isEmpty ? "Unknown Author" : spec.author))</dc:creator>\n<dc:language>\(lang)</dc:language>\n"
        if let p = spec.publisher, !p.isEmpty { meta += "<dc:publisher>\(XHTML.escape(p))</dc:publisher>\n" }
        if let d = spec.description, !d.isEmpty { meta += "<dc:description>\(XHTML.escape(d))</dc:description>\n" }
        for s in spec.subjects { meta += "<dc:subject>\(XHTML.escape(s))</dc:subject>\n" }
        meta += "<meta property=\"dcterms:modified\">\(modified)</meta>\n"
        if hasCover { meta += "<meta name=\"cover\" content=\"cover-image\"/>\n" }
        zip.add("OEBPS/content.opf", """
        <?xml version="1.0" encoding="UTF-8"?>
        <package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="\(lang)">
        <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
        \(meta)</metadata>
        <manifest>
        \(manifest.joined(separator: "\n"))
        </manifest>
        <spine toc="ncx">
        \(spine.joined(separator: "\n"))
        </spine>
        </package>
        """)
        return zip.finish()
    }
}

/// A typographic cover for books that come without one: title and author on a coloured field chosen from the title.
public enum CoverArt {
    public static let palettes: [(String, String, String)] = [
        ("#1f3a5f", "#2f5d8a", "#f5f0e6"), ("#5a1e2e", "#8c2f45", "#f8ecec"), ("#1e4d3a", "#2f7a5b", "#eef7f1"),
        ("#3b2a5a", "#5b448a", "#f3effa"), ("#6b3d10", "#a8631d", "#fbf3e8"), ("#233b4a", "#3f6577", "#eef4f7"),
        ("#4a3a2a", "#7a6248", "#f7f2ec"), ("#5a2f5a", "#8a4c8a", "#f8eef8"),
    ]

    public static func svg(title: String, author: String, badge: String? = nil) -> String {
        var hash: UInt32 = 5381
        for byte in title.utf8 { hash = hash &* 33 &+ UInt32(byte) }
        let (bg, bg2, fg) = palettes[Int(hash % UInt32(palettes.count))]
        let lines = wrap(title, width: 16, maxLines: 5)
        let longest = lines.map(\.count).max() ?? 8
        let fontSize = min(100, max(44, 900 / max(longest, 7)))
        let lineHeight = Double(fontSize) * 1.15
        let startY = 520.0 - lineHeight * Double(lines.count - 1) / 2
        var titleSVG = ""
        for (i, line) in lines.enumerated() {
            titleSVG += "<text x=\"300\" y=\"\(Int(startY + Double(i) * lineHeight))\" text-anchor=\"middle\" font-size=\"\(fontSize)\" font-weight=\"600\" fill=\"\(fg)\">\(XHTML.escape(line))</text>"
        }
        let authorLines = wrap(author, width: 26, maxLines: 2)
        var authorSVG = ""
        for (i, line) in authorLines.enumerated() {
            authorSVG += "<text x=\"300\" y=\"\(760 + i * 44)\" text-anchor=\"middle\" font-size=\"36\" fill=\"\(fg)\" opacity=\"0.85\">\(XHTML.escape(line))</text>"
        }
        let badgeSVG = badge.map { "<text x=\"300\" y=\"120\" text-anchor=\"middle\" font-size=\"28\" letter-spacing=\"6\" fill=\"\(fg)\" opacity=\"0.7\">\(XHTML.escape($0))</text>" } ?? ""
        return """
        <svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
        <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="\(bg2)"/><stop offset="1" stop-color="\(bg)"/></linearGradient></defs>
        <rect width="600" height="900" fill="url(#g)"/>
        <rect x="36" y="36" width="528" height="828" fill="none" stroke="\(fg)" stroke-opacity="0.35" stroke-width="2"/>
        <g font-family="Georgia, 'Iowan Old Style', 'Times New Roman', serif">\(badgeSVG)\(titleSVG)\(authorSVG)</g>
        </svg>
        """
    }

    static func wrap(_ text: String, width: Int, maxLines: Int) -> [String] {
        var lines: [String] = []
        var current = ""
        for word in text.split(separator: " ") {
            if current.isEmpty { current = String(word) } else if current.count + 1 + word.count <= width { current += " " + word } else { lines.append(current); current = String(word) }
        }
        if !current.isEmpty { lines.append(current) }
        if lines.count > maxLines {
            lines = Array(lines.prefix(maxLines))
            lines[maxLines - 1] += "…"
        }
        return lines.isEmpty ? [text] : lines
    }
}
