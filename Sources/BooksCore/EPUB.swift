import Foundation
#if canImport(FoundationXML)
import FoundationXML
#endif

/// What the library needs to know about a book: enough for the shelf, Get Info, and opening the right file.
public struct BookMetadata: Codable, Hashable {
    public var title: String
    public var authors: [String]
    public var language: String
    public var identifier: String
    public var description: String
    public var publisher: String
    public var published: String
    public var subjects: [String]

    public init(title: String = "", authors: [String] = [], language: String = "", identifier: String = "",
                description: String = "", publisher: String = "", published: String = "", subjects: [String] = []) {
        self.title = title
        self.authors = authors
        self.language = language
        self.identifier = identifier
        self.description = description
        self.publisher = publisher
        self.published = published
        self.subjects = subjects
    }

    public var author: String { authors.joined(separator: ", ") }
}

/// One entry of the table of contents, flattened with its nesting depth.
public struct TOCEntry: Codable, Hashable {
    public var label: String
    /// Archive path of the target document, with an optional `#fragment`.
    public var href: String
    public var level: Int

    public init(label: String, href: String, level: Int) {
        self.label = label
        self.href = href
        self.level = level
    }
}

public struct ManifestItem: Hashable {
    public let id: String
    /// Archive path.
    public let path: String
    public let mediaType: String
    public let properties: Set<String>
}

/// An EPUB 2 or 3 file: the package document, manifest, spine, table of contents and cover, read from the ZIP.
public final class EPUBBook {
    public enum Error: Swift.Error, CustomStringConvertible {
        case noContainer
        case noPackage(String)
        case malformed(String)

        public var description: String {
            switch self {
            case .noContainer: return "not an EPUB: META-INF/container.xml is missing"
            case .noPackage(let p): return "the package document \(p) is missing"
            case .malformed(let what): return "malformed EPUB: \(what)"
            }
        }
    }

    public let archive: ZipArchive
    public let packagePath: String
    public private(set) var metadata = BookMetadata()
    public private(set) var manifest: [String: ManifestItem] = [:]
    /// Reading order: archive paths of the content documents.
    public private(set) var spine: [String] = []
    public private(set) var toc: [TOCEntry] = []
    public private(set) var coverPath: String?
    public private(set) var navPath: String?
    public private(set) var ncxPath: String?

    public convenience init(data: Data) throws {
        try self.init(archive: try ZipArchive(data: data))
    }

    public convenience init(url: URL) throws {
        try self.init(archive: try ZipArchive(url: url))
    }

    public init(archive: ZipArchive) throws {
        self.archive = archive
        guard archive.contains("META-INF/container.xml"), let containerData = try? archive.data("META-INF/container.xml") else {
            throw Error.noContainer
        }
        var fullPath = XMLTree.parse(containerData)?.descendants(named: "rootfile").first?.attribute("full-path") ?? ""
        if fullPath.isEmpty {
            // Not parsable as XML; the attribute is plain enough to pick out of the text.
            let text = String(decoding: containerData, as: UTF8.self)
            if let range = text.range(of: "full-path=\"([^\"]+)\"", options: .regularExpression) {
                fullPath = String(text[range].dropFirst("full-path=\"".count).dropLast())
            }
        }
        guard !fullPath.isEmpty else { throw Error.malformed("no rootfile in container.xml") }
        packagePath = Paths.normalize(fullPath)
        guard archive.contains(packagePath) else { throw Error.noPackage(packagePath) }
        try readPackage()
        readTableOfContents()
    }

    /// Directory of the package document within the archive ("" or "OEBPS/").
    public var packageDirectory: String { Paths.directory(of: packagePath) }

    public var isFixedLayout: Bool { fixedLayout }
    private var fixedLayout = false

    /// The cover image's bytes and media type, when the book has one.
    public func coverImage() -> (data: Data, mediaType: String)? {
        guard let path = coverPath, let data = try? archive.data(path) else { return nil }
        return (data, MediaTypes.forPath(path, fallback: manifest.values.first { $0.path == path }?.mediaType ?? "image/jpeg"))
    }

    /// Plain text of one spine document, tags removed and entities decoded; used for word counts and search indexes.
    public func text(ofSpineItem index: Int) -> String {
        guard spine.indices.contains(index), let html = try? archive.string(spine[index]) else { return "" }
        return HTMLText.plainText(html)
    }

    /// Words in the whole book, counting the way the reading-time estimate does (whitespace-separated runs).
    public func wordCount() -> Int {
        var total = 0
        for i in spine.indices { total += HTMLText.wordCount(text(ofSpineItem: i)) }
        return total
    }

    // MARK: - Package document

    private func readPackage() throws {
        guard let data = try? archive.data(packagePath), let root = XMLTree.parse(data) else { throw Error.malformed("package document is not XML") }
        let dir = packageDirectory
        let meta = root.child(named: "metadata")

        if let meta {
            func texts(_ name: String) -> [String] {
                meta.children(named: name).map { HTMLText.collapse($0.textContent) }.filter { !$0.isEmpty }
            }
            var m = BookMetadata()
            m.title = texts("title").first ?? ""
            m.authors = texts("creator")
            m.language = texts("language").first ?? ""
            m.description = HTMLText.plainText(meta.child(named: "description")?.textContent ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            m.publisher = texts("publisher").first ?? ""
            m.published = texts("date").first ?? ""
            m.subjects = texts("subject")
            let uniqueId = root.attribute("unique-identifier")
            let identifiers = meta.children(named: "identifier")
            let identifier = identifiers.first { $0.attribute("id") == uniqueId } ?? identifiers.first
            m.identifier = HTMLText.collapse(identifier?.textContent ?? "")
            metadata = m
            for metaEl in meta.children(named: "meta") where metaEl.attribute("property") == "rendition:layout" {
                if metaEl.textContent.contains("pre-paginated") { fixedLayout = true }
            }
        }
        let coverId = meta?.children(named: "meta").first { $0.attribute("name") == "cover" }?.attribute("content")

        guard let manifestEl = root.child(named: "manifest") else { throw Error.malformed("no manifest") }
        var items: [String: ManifestItem] = [:]
        for item in manifestEl.children(named: "item") {
            guard let id = item.attribute("id"), let href = item.attribute("href") else { continue }
            let props = Set((item.attribute("properties") ?? "").split(separator: " ").map(String.init))
            let mediaType = item.attribute("media-type") ?? MediaTypes.forPath(href, fallback: "application/octet-stream")
            items[id] = ManifestItem(id: id, path: Paths.resolve(dir, href), mediaType: mediaType, properties: props)
        }
        manifest = items

        guard let spineEl = root.child(named: "spine") else { throw Error.malformed("no spine") }
        var order: [String] = []
        for ref in spineEl.children(named: "itemref") {
            guard let idref = ref.attribute("idref"), let item = items[idref] else { continue }
            if ref.attribute("linear") == "no" && !order.isEmpty { continue } // keep a leading cover page
            if archive.contains(item.path) { order.append(item.path) }
        }
        spine = order
        if let ncxId = spineEl.attribute("toc"), let ncx = items[ncxId] { ncxPath = ncx.path }
        if ncxPath == nil { ncxPath = items.values.first { $0.mediaType == "application/x-dtbncx+xml" }?.path }
        navPath = items.values.first { $0.properties.contains("nav") }?.path

        // Cover: EPUB 3 property, EPUB 2 meta, then a guess by name, then the guide's cover page.
        if let item = items.values.first(where: { $0.properties.contains("cover-image") }), archive.contains(item.path) {
            coverPath = item.path
        } else if let id = coverId, let item = items[id], archive.contains(item.path) {
            if item.mediaType.hasPrefix("image/") {
                coverPath = item.path
            } else if let img = firstImage(inDocument: item.path) {
                coverPath = img
            }
        }
        if coverPath == nil {
            coverPath = items.values.first { $0.mediaType.hasPrefix("image/") && ($0.id.lowercased().contains("cover") || $0.path.lowercased().contains("cover")) }?.path
        }
        if coverPath == nil, let guide = root.child(named: "guide") {
            for ref in guide.children(named: "reference") where ref.attribute("type")?.lowercased() == "cover" {
                if let href = ref.attribute("href"), let img = firstImage(inDocument: Paths.resolve(dir, Paths.stripFragment(href))) {
                    coverPath = img
                    break
                }
            }
        }
    }

    /// The first image referenced by an XHTML document (a cover page), as an archive path.
    private func firstImage(inDocument path: String) -> String? {
        guard let html = try? archive.string(path) else { return nil }
        let dir = Paths.directory(of: path)
        for pattern in ["<img[^>]+src=\"([^\"]+)\"", "<img[^>]+src='([^']+)'", "<image[^>]+href=\"([^\"]+)\"", "<image[^>]+href='([^']+)'"] {
            if let range = html.range(of: pattern, options: .regularExpression) {
                let tag = String(html[range])
                if let q = tag.range(of: "=\"") ?? tag.range(of: "='") {
                    let rest = tag[q.upperBound...]
                    let value = String(rest.prefix { $0 != "\"" && $0 != "'" })
                    let resolved = Paths.resolve(dir, value)
                    if archive.contains(resolved) { return resolved }
                }
            }
        }
        return nil
    }

    // MARK: - Table of contents

    private func readTableOfContents() {
        if let nav = navPath, let entries = readNav(nav), !entries.isEmpty { toc = entries; return }
        if let ncx = ncxPath, let entries = readNCX(ncx), !entries.isEmpty { toc = entries; return }
        // No table of contents: one entry per spine document, named by its first heading or its file.
        toc = spine.enumerated().map { index, path in
            let text = (try? archive.string(path)).flatMap(HTMLText.firstHeading) ?? Paths.name(of: path)
            return TOCEntry(label: text.isEmpty ? "Section \(index + 1)" : text, href: path, level: 0)
        }
    }

    private func readNav(_ path: String) -> [TOCEntry]? {
        guard let data = try? archive.data(path) else { return nil }
        var root = XMLTree.parse(data)
        if root == nil, let html = String(data: data, encoding: .utf8) ?? String(data: data, encoding: .isoLatin1) {
            // Not well-formed XHTML: tidy it as HTML first.
            root = XMLTree.parse(XHTML.document(fromHTML: html, options: XHTML.Options(title: "")))
        }
        guard let root else { return nil }
        let dir = Paths.directory(of: path)
        let navs = root.descendants(named: "nav")
        let tocNav = navs.first { nav in
            nav.attributes.contains { $0.key.hasSuffix("type") && $0.value.split(separator: " ").contains("toc") }
        } ?? navs.first
        guard let nav = tocNav, let list = nav.child(named: "ol") else { return nil }
        var out: [TOCEntry] = []
        func walk(_ ol: XMLTree.Element, level: Int) {
            for li in ol.children(named: "li") {
                if let a = li.child(named: "a") ?? li.child(named: "span") {
                    let label = HTMLText.collapse(a.textContent)
                    let href = a.attribute("href") ?? ""
                    out.append(TOCEntry(label: label, href: href.isEmpty ? "" : Paths.resolveKeepingFragment(dir, href), level: level))
                }
                if let nested = li.child(named: "ol") { walk(nested, level: level + 1) }
            }
        }
        walk(list, level: 0)
        return out.filter { !$0.label.isEmpty }
    }

    private func readNCX(_ path: String) -> [TOCEntry]? {
        guard let data = try? archive.data(path), let root = XMLTree.parse(data), let map = root.descendants(named: "navMap").first else { return nil }
        let dir = Paths.directory(of: path)
        var out: [TOCEntry] = []
        func walk(_ parent: XMLTree.Element, level: Int) {
            for point in parent.children(named: "navPoint") {
                let labelElement = point.child(named: "navLabel")?.descendants(named: "text").first ?? point.descendants(named: "text").first
                let src = point.child(named: "content")?.attribute("src") ?? ""
                out.append(TOCEntry(label: HTMLText.collapse(labelElement?.textContent ?? ""), href: src.isEmpty ? "" : Paths.resolveKeepingFragment(dir, src), level: level))
                walk(point, level: level + 1)
            }
        }
        walk(map, level: 0)
        return out.filter { !$0.label.isEmpty }
    }
}

// MARK: - Helpers shared by the format code

public enum Paths {
    /// Resolves `href` (possibly percent-encoded, possibly with `..`) against a directory inside the archive.
    public static func resolve(_ directory: String, _ href: String) -> String {
        let decoded = stripFragment(href).removingPercentEncoding ?? stripFragment(href)
        if decoded.hasPrefix("/") { return normalize(String(decoded.dropFirst())) }
        return normalize(directory + decoded)
    }

    /// Like `resolve`, but keeps the `#fragment` a table of contents points at.
    public static func resolveKeepingFragment(_ directory: String, _ href: String) -> String {
        let path = resolve(directory, href)
        if let fragment = fragment(of: href), !fragment.isEmpty { return path + "#" + fragment }
        return path
    }

    public static func normalize(_ path: String) -> String {
        var parts: [Substring] = []
        for part in path.split(separator: "/", omittingEmptySubsequences: true) {
            if part == "." { continue }
            if part == ".." { if !parts.isEmpty { parts.removeLast() }; continue }
            parts.append(part)
        }
        return parts.joined(separator: "/")
    }

    public static func directory(of path: String) -> String {
        guard let slash = path.lastIndex(of: "/") else { return "" }
        return String(path[...slash])
    }

    public static func name(of path: String) -> String {
        String(path.split(separator: "/").last ?? Substring(path))
    }

    public static func stripFragment(_ href: String) -> String {
        if let hash = href.firstIndex(of: "#") { return String(href[..<hash]) }
        return href
    }

    public static func fragment(of href: String) -> String? {
        guard let hash = href.firstIndex(of: "#") else { return nil }
        return String(href[href.index(after: hash)...])
    }

    public static func fileExtension(_ path: String) -> String {
        let n = name(of: path)
        guard let dot = n.lastIndex(of: "."), dot != n.startIndex else { return "" }
        return n[n.index(after: dot)...].lowercased()
    }
}

public enum MediaTypes {
    public static let byExtension: [String: String] = [
        "xhtml": "application/xhtml+xml", "html": "text/html", "htm": "text/html", "css": "text/css",
        "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "gif": "image/gif", "svg": "image/svg+xml", "webp": "image/webp", "bmp": "image/bmp",
        "ttf": "font/ttf", "otf": "font/otf", "woff": "font/woff", "woff2": "font/woff2",
        "mp3": "audio/mpeg", "m4a": "audio/mp4", "mp4": "video/mp4", "js": "text/javascript", "ncx": "application/x-dtbncx+xml",
        "epub": "application/epub+zip", "pdf": "application/pdf", "txt": "text/plain", "md": "text/markdown",
    ]

    public static func forPath(_ path: String, fallback: String) -> String {
        byExtension[Paths.fileExtension(path)] ?? fallback
    }

    public static func fileExtension(forMediaType type: String) -> String {
        switch type.lowercased() {
        case "image/jpeg", "image/jpg": return "jpg"
        case "image/png": return "png"
        case "image/gif": return "gif"
        case "image/svg+xml": return "svg"
        case "image/webp": return "webp"
        case "image/bmp": return "bmp"
        default: return "bin"
        }
    }
}

/// Text out of markup without a DOM: good enough for word counts, excerpts and headings.
public enum HTMLText {
    public static func plainText(_ html: String) -> String {
        var out = ""
        out.reserveCapacity(html.count / 2)
        var inTag = false, inScriptOrStyle = false, tagName = "", readingName = false
        let breaks: Set<String> = ["/p", "/div", "br", "br/", "/li", "/h1", "/h2", "/h3", "/h4", "/h5", "/h6", "/tr", "/blockquote", "/section", "hr", "hr/", "/td", "/th", "/dd", "/dt"]
        for ch in html {
            if inTag {
                if ch == ">" {
                    inTag = false
                    let lower = tagName.lowercased()
                    if lower == "script" || lower == "style" { inScriptOrStyle = true }
                    if lower == "/script" || lower == "/style" { inScriptOrStyle = false }
                    if breaks.contains(lower) { out.append("\n") }
                } else if readingName {
                    if ch.isWhitespace || ch == "/" && !tagName.isEmpty { readingName = false } else if tagName.count < 16 { tagName.append(ch) }
                }
            } else if ch == "<" {
                inTag = true
                readingName = true
                tagName = ""
            } else if !inScriptOrStyle {
                out.append(ch)
            }
        }
        return decodeEntities(out)
    }

    public static func wordCount(_ text: String) -> Int {
        var count = 0, inWord = false
        for scalar in text.unicodeScalars {
            let space = scalar.properties.isWhitespace
            if !space && !inWord { count += 1 }
            inWord = !space
        }
        return count
    }

    public static func collapse(_ text: String) -> String {
        text.split(whereSeparator: { $0.isWhitespace || $0.isNewline }).joined(separator: " ")
    }

    public static func firstHeading(_ html: String) -> String? {
        guard let range = html.range(of: "<h[1-4][^>]*>[\\s\\S]*?</h[1-4]>", options: [.regularExpression, .caseInsensitive]) else { return nil }
        let heading = collapse(plainText(String(html[range])))
        return heading.isEmpty ? nil : heading
    }

    static let namedEntities: [String: String] = ["amp": "&", "lt": "<", "gt": ">", "quot": "\"", "apos": "'", "nbsp": "\u{00A0}", "mdash": "—", "ndash": "–", "hellip": "…", "lsquo": "‘", "rsquo": "’", "ldquo": "“", "rdquo": "”", "copy": "©", "reg": "®", "trade": "™", "shy": "\u{00AD}", "eacute": "é", "egrave": "è", "agrave": "à", "ccedil": "ç", "ouml": "ö", "uuml": "ü", "auml": "ä", "szlig": "ß", "ntilde": "ñ", "iacute": "í", "oacute": "ó", "uacute": "ú", "aacute": "á", "middot": "·", "bull": "•", "laquo": "«", "raquo": "»"]

    public static func decodeEntities(_ text: String) -> String {
        guard text.contains("&") else { return text }
        var out = ""
        out.reserveCapacity(text.count)
        var i = text.startIndex
        while i < text.endIndex {
            let ch = text[i]
            if ch == "&", let semi = text[i...].prefix(12).firstIndex(of: ";") {
                let name = String(text[text.index(after: i)..<semi])
                var replacement: String?
                if name.hasPrefix("#x") || name.hasPrefix("#X") {
                    if let v = UInt32(name.dropFirst(2), radix: 16), let s = Unicode.Scalar(v) { replacement = String(Character(s)) }
                } else if name.hasPrefix("#") {
                    if let v = UInt32(name.dropFirst()), let s = Unicode.Scalar(v) { replacement = String(Character(s)) }
                } else {
                    replacement = namedEntities[name]
                }
                if let r = replacement {
                    out += r
                    i = text.index(after: semi)
                    continue
                }
            }
            out.append(ch)
            i = text.index(after: i)
        }
        return out
    }
}
