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
        guard archive.contains("META-INF/container.xml"), let container = try? XMLDocument(data: try archive.data("META-INF/container.xml"), options: []) else {
            throw Error.noContainer
        }
        guard let rootfile = XML.descendants(of: container.rootElement(), named: "rootfile").first,
              let fullPath = rootfile.attribute(forName: "full-path")?.stringValue, !fullPath.isEmpty else {
            throw Error.malformed("no rootfile in container.xml")
        }
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
        let doc: XMLDocument
        do { doc = try XMLDocument(data: try archive.data(packagePath), options: []) } catch { throw Error.malformed("package document is not XML") }
        guard let root = doc.rootElement() else { throw Error.malformed("empty package document") }
        let dir = packageDirectory

        if let meta = XML.child(of: root, named: "metadata") {
            var m = BookMetadata()
            m.title = XML.children(of: meta, named: "title").compactMap { $0.stringValue?.trimmingCharacters(in: .whitespacesAndNewlines) }.first { !$0.isEmpty } ?? ""
            m.authors = XML.children(of: meta, named: "creator").compactMap { $0.stringValue?.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
            m.language = XML.children(of: meta, named: "language").first?.stringValue?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            m.description = HTMLText.plainText(XML.children(of: meta, named: "description").first?.stringValue ?? "")
            m.publisher = XML.children(of: meta, named: "publisher").first?.stringValue?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            m.published = XML.children(of: meta, named: "date").first?.stringValue?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            m.subjects = XML.children(of: meta, named: "subject").compactMap { $0.stringValue?.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
            let uniqueId = root.attribute(forName: "unique-identifier")?.stringValue
            let identifiers = XML.children(of: meta, named: "identifier")
            m.identifier = (identifiers.first { $0.attribute(forName: "id")?.stringValue == uniqueId } ?? identifiers.first)?.stringValue?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            metadata = m
            for metaEl in XML.children(of: meta, named: "meta") {
                if metaEl.attribute(forName: "property")?.stringValue == "rendition:layout", metaEl.stringValue?.contains("pre-paginated") == true { fixedLayout = true }
            }
        }

        var coverId: String?
        if let meta = XML.child(of: root, named: "metadata") {
            coverId = XML.children(of: meta, named: "meta").first { $0.attribute(forName: "name")?.stringValue == "cover" }?.attribute(forName: "content")?.stringValue
        }

        guard let manifestEl = XML.child(of: root, named: "manifest") else { throw Error.malformed("no manifest") }
        var items: [String: ManifestItem] = [:]
        for item in XML.children(of: manifestEl, named: "item") {
            guard let id = item.attribute(forName: "id")?.stringValue, let href = item.attribute(forName: "href")?.stringValue else { continue }
            let props = Set((item.attribute(forName: "properties")?.stringValue ?? "").split(separator: " ").map(String.init))
            items[id] = ManifestItem(id: id, path: Paths.resolve(dir, href), mediaType: item.attribute(forName: "media-type")?.stringValue ?? MediaTypes.forPath(href, fallback: "application/octet-stream"), properties: props)
        }
        manifest = items

        guard let spineEl = XML.child(of: root, named: "spine") else { throw Error.malformed("no spine") }
        var order: [String] = []
        for ref in XML.children(of: spineEl, named: "itemref") {
            guard let idref = ref.attribute(forName: "idref")?.stringValue, let item = items[idref] else { continue }
            if ref.attribute(forName: "linear")?.stringValue == "no" && !order.isEmpty { continue } // keep a leading cover page
            if archive.contains(item.path) { order.append(item.path) }
        }
        spine = order
        if let ncxId = spineEl.attribute(forName: "toc")?.stringValue, let ncx = items[ncxId] { ncxPath = ncx.path }
        if ncxPath == nil { ncxPath = items.values.first { $0.mediaType == "application/x-dtbncx+xml" }?.path }
        navPath = items.values.first { $0.properties.contains("nav") }?.path

        // Cover: EPUB 3 property, EPUB 2 meta, then a guess by name.
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
        if coverPath == nil, let guide = XML.child(of: root, named: "guide") {
            for ref in XML.children(of: guide, named: "reference") where ref.attribute(forName: "type")?.stringValue?.lowercased() == "cover" {
                if let href = ref.attribute(forName: "href")?.stringValue, let img = firstImage(inDocument: Paths.resolve(dir, Paths.stripFragment(href))) { coverPath = img; break }
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
        guard let data = try? archive.data(path), let doc = (try? XMLDocument(data: data, options: [])) ?? (try? XMLDocument(data: data, options: [.documentTidyHTML])) else { return nil }
        let dir = Paths.directory(of: path)
        let navs = XML.descendants(of: doc.rootElement(), named: "nav")
        let tocNav = navs.first { nav in
            nav.attributes?.contains { ($0.name ?? "").hasSuffix("type") && ($0.stringValue ?? "").split(separator: " ").contains("toc") } == true
        } ?? navs.first
        guard let nav = tocNav, let list = XML.child(of: nav, named: "ol") else { return nil }
        var out: [TOCEntry] = []
        func walk(_ ol: XMLElement, level: Int) {
            for li in XML.children(of: ol, named: "li") {
                if let a = XML.child(of: li, named: "a") ?? XML.child(of: li, named: "span") {
                    let label = HTMLText.collapse(a.stringValue ?? "")
                    let href = a.attribute(forName: "href")?.stringValue ?? ""
                    out.append(TOCEntry(label: label, href: href.isEmpty ? "" : Paths.resolveKeepingFragment(dir, href), level: level))
                }
                if let nested = XML.child(of: li, named: "ol") { walk(nested, level: level + 1) }
            }
        }
        walk(list, level: 0)
        return out.filter { !$0.label.isEmpty }
    }

    private func readNCX(_ path: String) -> [TOCEntry]? {
        guard let data = try? archive.data(path), let doc = try? XMLDocument(data: data, options: []), let map = XML.descendants(of: doc.rootElement(), named: "navMap").first else { return nil }
        let dir = Paths.directory(of: path)
        var out: [TOCEntry] = []
        func walk(_ parent: XMLElement, level: Int) {
            for point in XML.children(of: parent, named: "navPoint") {
                let label = XML.descendants(of: point, named: "text").first?.stringValue ?? ""
                let src = XML.child(of: point, named: "content")?.attribute(forName: "src")?.stringValue ?? ""
                out.append(TOCEntry(label: HTMLText.collapse(label), href: src.isEmpty ? "" : Paths.resolveKeepingFragment(dir, src), level: level))
                walk(point, level: level + 1)
            }
        }
        walk(map, level: 0)
        return out.filter { !$0.label.isEmpty }
    }
}

// MARK: - Helpers shared by the format code

enum XML {
    static func localName(_ node: XMLNode) -> String {
        if let local = node.localName { return local }
        let name = node.name ?? ""
        if let colon = name.lastIndex(of: ":") { return String(name[name.index(after: colon)...]) }
        return name
    }

    static func children(of element: XMLElement?, named name: String) -> [XMLElement] {
        (element?.children ?? []).compactMap { $0 as? XMLElement }.filter { localName($0) == name }
    }

    static func child(of element: XMLElement?, named name: String) -> XMLElement? {
        children(of: element, named: name).first
    }

    static func descendants(of element: XMLElement?, named name: String) -> [XMLElement] {
        guard let element else { return [] }
        var out: [XMLElement] = []
        func walk(_ el: XMLElement) {
            for child in el.children ?? [] {
                guard let c = child as? XMLElement else { continue }
                if localName(c) == name { out.append(c) }
                walk(c)
            }
        }
        walk(element)
        return out
    }
}

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
