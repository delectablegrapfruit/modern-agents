import Foundation
#if canImport(FoundationXML)
import FoundationXML
#endif

/// A small immutable XML tree read with `XMLParser`, the streaming parser that Foundation implements the same way on
/// macOS and Linux. Element names are compared without their namespace prefix, which is what EPUB package, NCX and
/// navigation documents need, and attributes can be looked up by local name too.
public final class XMLTree {
    public final class Element {
        public enum Node {
            case text(String)
            case element(Element)
        }

        /// The name without its prefix: "title" for `dc:title`.
        public let name: String
        public let qualifiedName: String
        public let attributes: [String: String]
        public fileprivate(set) var nodes: [Node] = []

        init(qualifiedName: String, attributes: [String: String]) {
            self.qualifiedName = qualifiedName
            self.name = XMLTree.localName(qualifiedName)
            self.attributes = attributes
        }

        public var children: [Element] {
            nodes.compactMap { node -> Element? in
                if case .element(let element) = node { return element }
                return nil
            }
        }

        /// Character data directly inside this element.
        public var text: String {
            var out = ""
            for node in nodes {
                if case .text(let t) = node { out += t }
            }
            return out
        }

        /// All character data inside this element, in document order.
        public var textContent: String {
            var out = ""
            for node in nodes {
                switch node {
                case .text(let t): out += t
                case .element(let e): out += e.textContent
                }
            }
            return out
        }

        /// An attribute by local name: `attribute("type")` finds `epub:type` when there is no plain `type`.
        public func attribute(_ name: String) -> String? {
            if let exact = attributes[name] { return exact }
            let suffix = ":" + name
            return attributes.first { $0.key.hasSuffix(suffix) }?.value
        }

        public func children(named name: String) -> [Element] {
            children.filter { $0.name == name }
        }

        public func child(named name: String) -> Element? {
            children.first { $0.name == name }
        }

        /// Every element below this one with that local name, in document order.
        public func descendants(named name: String) -> [Element] {
            var out: [Element] = []
            func walk(_ element: Element) {
                for child in element.children {
                    if child.name == name { out.append(child) }
                    walk(child)
                }
            }
            walk(self)
            return out
        }
    }

    /// The document element, or nil when nothing parsable was found. Documents that are not UTF-8 are transcoded
    /// first; HTML named entities such as `&nbsp;` are accepted, and a stray `&` is not fatal.
    public static func parse(_ data: Data) -> Element? {
        parse(decode(data))
    }

    public static func parse(_ text: String) -> Element? {
        let builder = Builder()
        let parser = XMLParser(data: Data(prepare(text).utf8))
        parser.delegate = builder
        parser.shouldProcessNamespaces = false
        parser.shouldReportNamespacePrefixes = false
        parser.shouldResolveExternalEntities = false
        _ = parser.parse()
        return builder.root
    }

    static func localName(_ qualified: String) -> String {
        if let colon = qualified.lastIndex(of: ":") { return String(qualified[qualified.index(after: colon)...]) }
        return qualified
    }

    // MARK: - Preparation

    private static func decode(_ data: Data) -> String {
        if let s = String(data: data, encoding: .utf8) { return s }
        let head = [UInt8](data.prefix(2))
        if head == [0xFF, 0xFE] || head == [0xFE, 0xFF], let s = String(data: data, encoding: .utf16) { return s }
        return String(data: data, encoding: .isoLatin1) ?? ""
    }

    private static let xmlEntities: Set<String> = ["amp", "lt", "gt", "quot", "apos"]

    /// The text is UTF-8 by now, so the declaration must say so; entity references the XML parser would reject are
    /// rewritten to character references (known HTML names) or escaped (anything else).
    static func prepare(_ text: String) -> String {
        var s = text
        if s.hasPrefix("\u{FEFF}") { s.removeFirst() }
        if s.hasPrefix("<?xml"), let end = s.range(of: "?>") {
            var declaration = String(s[..<end.upperBound])
            if let enc = declaration.range(of: "encoding=\"[^\"]*\"|encoding='[^']*'", options: .regularExpression) {
                declaration.replaceSubrange(enc, with: "encoding=\"UTF-8\"")
            }
            s = declaration + s[end.upperBound...]
        }
        guard s.contains("&") else { return s }

        var out = ""
        out.reserveCapacity(s.utf8.count)
        var i = s.startIndex
        while i < s.endIndex {
            let ch = s[i]
            guard ch == "&" else {
                out.append(ch)
                i = s.index(after: i)
                continue
            }
            let next = s.index(after: i)
            if let semi = s[next...].prefix(12).firstIndex(of: ";") {
                let name = String(s[next..<semi])
                let isNumeric = name.hasPrefix("#") && name.count > 1 && name.dropFirst().allSatisfy { $0.isHexDigit || $0 == "x" || $0 == "X" }
                if isNumeric || xmlEntities.contains(name) {
                    out += "&" + name + ";"
                    i = s.index(after: semi)
                    continue
                }
                if let value = HTMLText.namedEntities[name] {
                    for scalar in value.unicodeScalars { out += "&#\(scalar.value);" }
                    i = s.index(after: semi)
                    continue
                }
            }
            out += "&amp;"
            i = next
        }
        return out
    }

    // MARK: - Building

    private final class Builder: NSObject, XMLParserDelegate {
        var root: Element?
        private var stack: [Element] = []

        func parser(_ parser: XMLParser, didStartElement elementName: String, namespaceURI: String?, qualifiedName qName: String?, attributes attributeDict: [String: String] = [:]) {
            let element = Element(qualifiedName: qName ?? elementName, attributes: attributeDict)
            if let parent = stack.last {
                parent.nodes.append(.element(element))
            } else if root == nil {
                root = element
            }
            stack.append(element)
        }

        func parser(_ parser: XMLParser, didEndElement elementName: String, namespaceURI: String?, qualifiedName qName: String?) {
            if !stack.isEmpty { stack.removeLast() }
        }

        func parser(_ parser: XMLParser, foundCharacters string: String) {
            append(string)
        }

        func parser(_ parser: XMLParser, foundCDATA CDATABlock: Data) {
            append(String(decoding: CDATABlock, as: UTF8.self))
        }

        private func append(_ text: String) {
            guard let current = stack.last else { return }
            if case .text(let existing)? = current.nodes.last {
                current.nodes[current.nodes.count - 1] = .text(existing + text)
            } else {
                current.nodes.append(.text(text))
            }
        }
    }
}
