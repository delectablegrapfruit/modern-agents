import Foundation
#if canImport(FoundationXML)
import FoundationXML
#endif

/// Turns loose HTML (as Kindle books and old converters produce) into a well-formed XHTML document that an EPUB
/// reader accepts, using the platform XML library's HTML tidying. The body content is kept as parsed; `<script>`,
/// `<style>` in the body, event handlers and `javascript:` URLs are dropped.
public enum XHTML {
    public struct Options {
        public var title: String
        public var language: String
        /// Stylesheet hrefs, relative to the document.
        public var stylesheets: [String]
        public var bodyClass: String?

        public init(title: String, language: String = "en", stylesheets: [String] = [], bodyClass: String? = nil) {
            self.title = title
            self.language = language
            self.stylesheets = stylesheets
            self.bodyClass = bodyClass
        }
    }

    /// Parses `html` (a whole document or a fragment) and returns an XHTML 1.1/EPUB 3 document string.
    public static func document(fromHTML html: String, options: Options) -> String {
        let parsed = parse(html)
        let head = parsed.map { headExtras(of: $0) } ?? []
        let body = parsed.flatMap { bodyContent(of: $0) } ?? escapedFallback(html)

        var s = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
        s += "<html xmlns=\"http://www.w3.org/1999/xhtml\" xmlns:epub=\"http://www.idpf.org/2007/ops\" xml:lang=\"\(escape(options.language))\" lang=\"\(escape(options.language))\">\n<head>\n"
        s += "<meta charset=\"utf-8\"/>\n<title>\(escape(options.title))</title>\n"
        for href in options.stylesheets { s += "<link rel=\"stylesheet\" type=\"text/css\" href=\"\(escape(href))\"/>\n" }
        for extra in head { s += extra + "\n" }
        s += "</head>\n<body"
        if let cls = options.bodyClass, !cls.isEmpty { s += " class=\"\(escape(cls))\"" }
        s += ">\n" + body + "\n</body>\n</html>\n"
        return s
    }

    public static func escape(_ text: String) -> String {
        var out = ""
        out.reserveCapacity(text.count)
        for ch in text {
            switch ch {
            case "&": out += "&amp;"
            case "<": out += "&lt;"
            case ">": out += "&gt;"
            case "\"": out += "&quot;"
            default: out.append(ch)
            }
        }
        return out
    }

    // MARK: - Parsing

    private static func parse(_ html: String) -> XMLDocument? {
        // Try strict XML first (KF8 books are usually XHTML), then HTML tidying.
        if let doc = try? XMLDocument(xmlString: html, options: [.nodePreserveWhitespace]), doc.rootElement() != nil {
            return doc
        }
        return try? XMLDocument(xmlString: html, options: [.documentTidyHTML, .nodePreserveWhitespace])
    }

    /// `<style>` elements and stylesheet links from the source head.
    private static func headExtras(of doc: XMLDocument) -> [String] {
        guard let root = doc.rootElement(), let head = firstElement(named: "head", in: root) else { return [] }
        var out: [String] = []
        for child in head.children ?? [] {
            guard let el = child as? XMLElement, let name = el.localName?.lowercased() ?? el.name?.lowercased() else { continue }
            if name == "style" {
                out.append(el.xmlString(options: []))
            } else if name == "link", let rel = el.attribute(forName: "rel")?.stringValue, rel.lowercased().contains("stylesheet") {
                out.append(el.xmlString(options: [.nodeCompactEmptyElement]))
            }
        }
        return out
    }

    private static func bodyContent(of doc: XMLDocument) -> String? {
        guard let root = doc.rootElement() else { return nil }
        let body = firstElement(named: "body", in: root) ?? root
        sanitize(body)
        var s = ""
        for child in body.children ?? [] {
            s += child.xmlString(options: [.nodeCompactEmptyElement])
        }
        return s
    }

    private static func firstElement(named name: String, in element: XMLElement) -> XMLElement? {
        if (element.localName ?? element.name ?? "").lowercased() == name { return element }
        for child in element.children ?? [] {
            if let el = child as? XMLElement, let found = firstElement(named: name, in: el) { return found }
        }
        return nil
    }

    private static let dropped: Set<String> = ["script", "iframe", "embed", "object", "applet", "form", "meta", "base", "guide", "reference", "mbp:pagebreak"]

    private static func sanitize(_ element: XMLElement) {
        for child in element.children ?? [] {
            guard let el = child as? XMLElement else { continue }
            let name = (el.name ?? "").lowercased()
            if dropped.contains(name) { el.detach(); continue }
            for attr in el.attributes ?? [] {
                let attrName = (attr.name ?? "").lowercased()
                let value = attr.stringValue?.trimmingCharacters(in: .whitespaces).lowercased() ?? ""
                if attrName.hasPrefix("on") || ((attrName == "href" || attrName == "src" || attrName == "xlink:href") && value.hasPrefix("javascript:")) {
                    el.removeAttribute(forName: attr.name ?? "")
                }
            }
            sanitize(el)
        }
    }

    private static func escapedFallback(_ html: String) -> String {
        "<pre>" + escape(html) + "</pre>"
    }
}
