import Foundation

/// Kindle (MOBI / KF8 / AZW3) → EPUB conversion.
///
/// A Kindle file is a PalmDB container: a list of records, the first of which carries the PalmDOC and MOBI headers
/// and an optional EXTH metadata block. The book text lives in the records after it, compressed with either
/// PalmDOC's LZ77 variant or a HUFF/CDIC Huffman dictionary, and the records after *that* hold images, fonts and
/// the INDX/TAGX/CNCX index tables that describe the book's structure.
///
/// Two generations share the container. MOBI 6/7 stores one HTML 3 document split by `<mbp:pagebreak>` and linked
/// by byte offsets (`filepos`); KF8 (AZW3) stores an XHTML skeleton per section plus fragments that get spliced
/// into it, with `kindle:` URIs for links, images and stylesheets. Hybrid files contain both halves, with EXTH
/// record 121 pointing at the KF8 half's header record — we use the KF8 half, but resources are still numbered
/// from the *first* header's resource start.
///
/// Everything here is a port of the browser converter in `js/mobi.js`, kept deliberately close to it so the two
/// stay comparable. Offsets in a Kindle file are byte offsets, so all splicing happens on `[UInt8]` and the bytes
/// are decoded to text only once a section is complete.
public enum KindleError: Error, LocalizedError, Equatable {
    /// The file is not a Kindle container at all.
    case notKindle
    /// The book is encrypted. There is nothing to do about this without the device key.
    case drm
    /// A compression scheme this decoder does not implement.
    case unsupportedCompression(Int)
    /// A `BOOKMOBI` file whose first record has no MOBI header.
    case missingMOBIHeader
    /// Structurally broken: a record that runs past the end of the file, an index that is not an index, and so on.
    case corrupt(String)

    public var errorDescription: String? {
        switch self {
        case .notKindle: return "Not a Kindle book."
        case .drm: return "This book is protected by DRM and can’t be opened. Only DRM-free Kindle files are supported."
        case .unsupportedCompression(let c): return "Unknown compression type \(c)"
        case .missingMOBIHeader: return "Missing MOBI header."
        case .corrupt(let what): return what
        }
    }
}

/// The result of a conversion: the EPUB itself plus the metadata a library needs before anyone opens the book.
public struct ConvertedBook {
    public let epub: Data
    public let title: String
    public let authors: [String]
    public let language: String
    /// The cover image's bytes, if the book named one, so a caller can show it without unzipping the EPUB again.
    public let cover: Data?
    public let coverMediaType: String?
    /// True when the book's KF8 (AZW3) half was used; false for MOBI 6/7 and for old PalmDOC books.
    public let isKF8: Bool

    public init(epub: Data, title: String, authors: [String], language: String, cover: Data?, coverMediaType: String?, isKF8: Bool) {
        self.epub = epub
        self.title = title
        self.authors = authors
        self.language = language
        self.cover = cover
        self.coverMediaType = coverMediaType
        self.isKF8 = isKF8
    }
}

/// The public face of the converter.
public enum KindleBook {
    /// True when the PalmDB type/creator pair at offset 60 says this is a Kindle book. Cheap enough to run on
    /// every file in a folder.
    public static func isKindle(_ data: Data) -> Bool {
        guard data.count >= 68 else { return false }
        let start = data.startIndex + 60
        var s = ""
        for i in start..<(start + 8) { s.unicodeScalars.append(UnicodeScalar(data[i])) }
        return s == "BOOKMOBI" || s == "TEXtREAd"
    }

    /// Converts a Kindle file to an EPUB 3 archive. Throws `KindleError` — notably `.drm` — rather than producing
    /// a half-built book.
    public static func convertToEPUB(_ data: Data) throws -> ConvertedBook {
        try MobiConverter(bytes: [UInt8](data)).run()
    }
}

// MARK: - Byte reading

/// Reads past the end of a record yield zero. That mirrors the JavaScript original, where `a[i]` is `undefined`
/// and becomes 0 the moment it meets an arithmetic operator; keeping the same rule keeps the two implementations
/// producing the same output on the slightly-out-of-spec files that exist in the wild. Structural mistakes — a
/// record that does not exist, an index pointing past the file — still throw.
@inline(__always) private func byteAt(_ a: [UInt8], _ i: Int) -> UInt8 {
    (i >= 0 && i < a.count) ? a[i] : 0
}

@inline(__always) private func rd16(_ a: [UInt8], _ o: Int) -> Int {
    (Int(byteAt(a, o)) << 8) | Int(byteAt(a, o + 1))
}

@inline(__always) private func rd32(_ a: [UInt8], _ o: Int) -> Int {
    (Int(byteAt(a, o)) << 24) | (Int(byteAt(a, o + 1)) << 16) | (Int(byteAt(a, o + 2)) << 8) | Int(byteAt(a, o + 3))
}

/// `l` bytes as one Latin-1 character each — the equivalent of JavaScript's `String.fromCharCode`, used for magic
/// numbers and index entry names.
private func latin1(_ a: [UInt8], _ o: Int, _ l: Int) -> String {
    guard l > 0 else { return "" }
    var scalars = String.UnicodeScalarView()
    scalars.reserveCapacity(min(l, max(0, a.count - max(0, o))))
    var i = max(0, o)
    while i < o + l && i < a.count {
        scalars.append(UnicodeScalar(a[i]))
        i += 1
    }
    return String(scalars)
}

/// The whole buffer as Latin-1. Every byte becomes exactly one UTF-16 code unit, so a regular expression run over
/// the result reports match positions that are still *byte* offsets into the original — which is what `filepos`
/// links and pagebreak positions are measured in.
private func latin1String(_ a: [UInt8]) -> String {
    if let s = String(data: Data(a), encoding: .isoLatin1) { return s }
    var scalars = String.UnicodeScalarView()
    scalars.reserveCapacity(a.count)
    for b in a { scalars.append(UnicodeScalar(b)) }
    return String(scalars)
}

/// Variable-length integers: seven bits per byte, high bit set on the last one, at most four bytes.
private struct VarLen {
    let value: Int
    let length: Int
}

private func varlen(_ a: [UInt8], _ i: Int) -> VarLen {
    var value = 0
    var length = 0
    var k = i
    while k < i + 4 && k < a.count {
        guard k >= 0 else { break }
        let b = a[k]
        value = ((value << 7) | Int(b & 0x7F)) & 0xFFFF_FFFF
        length += 1
        if b & 0x80 != 0 { break }
        k += 1
    }
    return VarLen(value: value, length: length)
}

/// The same encoding read backwards from `end`, which is how the trailing byte-count entries on a text record are
/// stored.
private func varlenFromEnd(_ a: [UInt8], _ end: Int) -> Int {
    var value = 0
    var k = max(0, end - 4)
    while k < end && k < a.count {
        let b = a[k]
        if b & 0x80 != 0 { value = 0 }
        value = ((value << 7) | Int(b & 0x7F)) & 0xFFFF_FFFF
        k += 1
    }
    return value
}

private func trailingZeros(_ x: Int) -> Int { x == 0 ? 0 : x.trailingZeroBitCount }

// MARK: - Text encodings

/// The two encodings Kindle files actually use. Anything else is treated as UTF-8, as the browser converter does.
private enum TextEncoding {
    case cp1252
    case utf8

    static func from(_ code: Int) -> TextEncoding { code == 1252 ? .cp1252 : .utf8 }

    func decode(_ a: [UInt8]) -> String {
        switch self {
        case .utf8:
            return String(decoding: a, as: UTF8.self)
        case .cp1252:
            if let s = String(data: Data(a), encoding: .windowsCP1252) { return s }
            // Platforms without the CP1252 table: Latin-1 plus the 0x80–0x9F block Windows fills in.
            var scalars = String.UnicodeScalarView()
            scalars.reserveCapacity(a.count)
            for b in a {
                if b >= 0x80 && b <= 0x9F {
                    scalars.append(TextEncoding.cp1252High[Int(b) - 0x80])
                } else {
                    scalars.append(UnicodeScalar(b))
                }
            }
            return String(scalars)
        }
    }

    /// A sub-range, without copying the whole buffer first.
    func decode(_ a: [UInt8], _ start: Int, _ count: Int) -> String {
        let lo = max(0, min(start, a.count))
        let hi = max(lo, min(start + max(0, count), a.count))
        return decode(Array(a[lo..<hi]))
    }

    func decode(_ a: ArraySlice<UInt8>) -> String { decode(Array(a)) }

    private static let cp1252High: [UnicodeScalar] = [
        "\u{20AC}", "\u{0081}", "\u{201A}", "\u{0192}", "\u{201E}", "\u{2026}", "\u{2020}", "\u{2021}",
        "\u{02C6}", "\u{2030}", "\u{0160}", "\u{2039}", "\u{0152}", "\u{008D}", "\u{017D}", "\u{008F}",
        "\u{0090}", "\u{2018}", "\u{2019}", "\u{201C}", "\u{201D}", "\u{2022}", "\u{2013}", "\u{2014}",
        "\u{02DC}", "\u{2122}", "\u{0161}", "\u{203A}", "\u{0153}", "\u{009D}", "\u{017E}", "\u{0178}",
    ]
}

// MARK: - Regular expressions

/// A thin wrapper over `NSRegularExpression`. Every pattern in this file is a literal, so a compile failure would
/// be a bug in this file rather than in a book; when one happens the wrapper degrades to "matches nothing" instead
/// of trapping in the middle of opening someone's library.
private struct Pattern {
    struct Match {
        let range: NSRange
        let text: String
        private let groups: [String?]

        init(range: NSRange, groups: [String?]) {
            self.range = range
            self.groups = groups
            self.text = groups.first.flatMap { $0 } ?? ""
        }

        func group(_ i: Int) -> String? { i >= 0 && i < groups.count ? groups[i] : nil }
        func int(_ i: Int) -> Int? { group(i).flatMap { Int($0) } }
    }

    private let re: NSRegularExpression?

    init(_ pattern: String, caseInsensitive: Bool = true) {
        var options: NSRegularExpression.Options = []
        if caseInsensitive { options.insert(.caseInsensitive) }
        re = try? NSRegularExpression(pattern: pattern, options: options)
    }

    func matches(in s: String) -> [Match] {
        guard let re else { return [] }
        let ns = s as NSString
        let results = re.matches(in: s, options: [], range: NSRange(location: 0, length: ns.length))
        return results.map { Pattern.match(from: $0, ns: ns) }
    }

    func firstMatch(in s: String) -> Match? {
        guard let re else { return nil }
        let ns = s as NSString
        guard let r = re.firstMatch(in: s, options: [], range: NSRange(location: 0, length: ns.length)) else { return nil }
        return Pattern.match(from: r, ns: ns)
    }

    func matched(_ s: String) -> Bool { firstMatch(in: s) != nil }

    /// Replaces every match with whatever `body` returns for it, the way JavaScript's `String.replace` with a
    /// function does.
    func replacingMatches(in s: String, using body: (Match) -> String) -> String {
        guard let re else { return s }
        let ns = s as NSString
        let results = re.matches(in: s, options: [], range: NSRange(location: 0, length: ns.length))
        guard !results.isEmpty else { return s }
        var out = ""
        out.reserveCapacity(ns.length)
        var last = 0
        for r in results {
            let range = r.range
            guard range.location >= last else { continue }
            out += ns.substring(with: NSRange(location: last, length: range.location - last))
            out += body(Pattern.match(from: r, ns: ns))
            last = range.location + range.length
        }
        if last < ns.length { out += ns.substring(from: last) }
        return out
    }

    func removingMatches(in s: String) -> String { replacingMatches(in: s) { _ in "" } }

    private static func match(from r: NSTextCheckingResult, ns: NSString) -> Match {
        var groups: [String?] = []
        groups.reserveCapacity(r.numberOfRanges)
        for i in 0..<r.numberOfRanges {
            let range = r.range(at: i)
            groups.append(range.location == NSNotFound ? nil : ns.substring(with: range))
        }
        return Match(range: r.range, groups: groups)
    }
}

/// Every pattern the converter uses, compiled once.
private enum RE {
    static let pageBreak = Pattern("<\\s*(?:mbp:)?pagebreak[^>]*>")
    static let fileposValue = Pattern("filepos=['\"]?([0-9]+)")
    static let mbpTag = Pattern("</?mbp:[^>]*>")
    static let guideBlock = Pattern("<guide>[\\s\\S]*?</guide>")
    static let metadataBlock = Pattern("<(metadata|dc-metadata|x-metadata)\\b[^>]*>[\\s\\S]*?</\\1>")
    static let metadataTag = Pattern("</?(metadata|dc-metadata|x-metadata)\\b[^>]*>")
    static let anchorFilepos = Pattern("<a([^>]*?)\\sfilepos=['\"]?([0-9]+)['\"]?")
    static let imgRecindex = Pattern("<img([^>]*?)\\srecindex=['\"]?([0-9]+)['\"]?")
    static let mediaRecindex = Pattern("<(video|audio)([^>]*?)\\smediarecindex=['\"]?([0-9]+)['\"]?")
    static let dataRecindex = Pattern("data-recindex=\"([0-9]+)\"", caseInsensitive: false)
    static let heading = Pattern("<h[1-4][^>]*>([\\s\\S]*?)</h[1-4]>")
    static let anyTag = Pattern("<[^>]+>")
    static let reference = Pattern("<reference\\s+([^>]*)>")
    static let refType = Pattern("type=['\"]?([^'\"\\s>]+)")
    static let refTitle = Pattern("title=['\"]([^'\"]*)['\"]")
    static let refFilepos = Pattern("filepos=['\"]?([0-9]+)")
    static let tocAnchor = Pattern("<a[^>]*href=\"([^\"]*filepos[0-9]+)\"[^>]*>([\\s\\S]*?)</a>")
    static let kindlePos = Pattern("kindle:pos:fid:([A-Za-z0-9_]+):off:([A-Za-z0-9_]+)", caseInsensitive: false)
    static let kindleEmbed = Pattern("kindle:embed:([A-Za-z0-9_]+)(?:\\?mime=([A-Za-z0-9_/+.-]+))?", caseInsensitive: false)
    static let kindleFlow = Pattern("kindle:flow:([A-Za-z0-9_]+)(?:\\?mime=([A-Za-z0-9_/+.-]+))?", caseInsensitive: false)
    static let coverEmbed = Pattern("kindle:embed:([A-Za-z0-9_]+)", caseInsensitive: false)
    static let openingTag = Pattern("^\\s*<[\\w:-]+([^>]*)>")
    static let idOrName = Pattern("\\s(?:id|name)\\s*=\\s*['\"]([^'\"]*)['\"]")
    static let aidAttr = Pattern("\\said\\s*=\\s*['\"]([^'\"]*)['\"]")
    static let aidAssignment = Pattern("\\said=(['\"])([^'\"]*)\\1")
    static let taggedDataAid = Pattern("<([\\w:-]+)([^>]*?)\\sdata-aid=\"([^\"]*)\"([^>]*)>", caseInsensitive: false)
    static let hasIdAttr = Pattern("\\sid=")
    static let bodyHasContent = Pattern("<body[^>]*>\\s*[^\\s<]|<img|<svg|<p|<div")
    static let looksLikeHTML = Pattern("^\\s*<(\\?xml|!doctype|html|head|body)")
    static let decimalEntity = Pattern("&#([0-9]+);", caseInsensitive: false)
    static let hexEntity = Pattern("&#x([0-9a-fA-F]+);")
    static let svgStart = Pattern("^\\s*<(\\?xml|svg)")
    static let nonWord = Pattern("[^0-9A-Za-z_]+", caseInsensitive: false)
}

/// `&amp;` and friends back to characters — Kindle index labels are stored escaped.
private func unescapeEntities(_ s: String) -> String {
    guard s.contains("&") else { return s }
    var out = RE.decimalEntity.replacingMatches(in: s) { m in
        guard let n = m.int(1), let scalar = UnicodeScalar(UInt32(truncatingIfNeeded: n)) else { return m.text }
        return String(Character(scalar))
    }
    out = RE.hexEntity.replacingMatches(in: out) { m in
        guard let g = m.group(1), let n = Int(g, radix: 16), let scalar = UnicodeScalar(UInt32(truncatingIfNeeded: n)) else { return m.text }
        return String(Character(scalar))
    }
    out = out.replacingOccurrences(of: "&amp;", with: "&")
    out = out.replacingOccurrences(of: "&lt;", with: "<")
    out = out.replacingOccurrences(of: "&gt;", with: ">")
    out = out.replacingOccurrences(of: "&quot;", with: "\"")
    out = out.replacingOccurrences(of: "&apos;", with: "'")
    out = out.replacingOccurrences(of: "&nbsp;", with: " ")
    return out
}

private func stripTags(_ s: String) -> String { RE.anyTag.removingMatches(in: s) }

/// JavaScript's `parseInt(s, 32)`: base-32 digits `0-9a-v`, stopping at the first character that is not one.
private func parseBase32(_ s: String) -> Int? {
    var value = 0
    var any = false
    for ch in s.lowercased() {
        let digit: Int
        switch ch {
        case "0"..."9": digit = Int(ch.asciiValue ?? 48) - 48
        case "a"..."v": digit = Int(ch.asciiValue ?? 97) - 97 + 10
        default: return any ? value : nil
        }
        value = value * 32 + digit
        any = true
        if value > 0x7FFF_FFFF { return value }
    }
    return any ? value : nil
}

private func pad(_ n: Int, _ width: Int) -> String {
    var s = String(n)
    while s.count < width { s = "0" + s }
    return s
}

// MARK: - PalmDB container

/// The outer container: a name, a type/creator pair, and a list of record offsets.
private struct PalmDB {
    let bytes: [UInt8]
    let name: String
    let type: String
    let creator: String
    let numRecords: Int
    private let starts: [Int]
    private let ends: [Int]

    init(_ bytes: [UInt8]) throws {
        guard bytes.count >= 78 else { throw KindleError.notKindle }
        self.bytes = bytes
        let rawName = latin1(bytes, 0, 32)
        name = rawName.firstIndex(of: "\0").map { String(rawName[rawName.startIndex..<$0]) } ?? rawName
        type = latin1(bytes, 60, 4)
        creator = latin1(bytes, 64, 4)
        let n = rd16(bytes, 76)
        numRecords = n
        var starts = [Int]()
        starts.reserveCapacity(n)
        for i in 0..<n { starts.append(rd32(bytes, 78 + i * 8)) }
        var ends = [Int]()
        ends.reserveCapacity(n)
        for i in 0..<n { ends.append(i + 1 < n ? starts[i + 1] : bytes.count) }
        self.starts = starts
        self.ends = ends
    }

    /// One record's bytes. Throws rather than returning a clamped slice, so a truncated file is reported instead
    /// of silently producing half a book.
    func record(_ i: Int) throws -> [UInt8] {
        guard i >= 0, i < numRecords else { throw KindleError.corrupt("Record \(i) out of bounds") }
        let start = starts[i], end = ends[i]
        guard start >= 0, start <= end, end <= bytes.count else { throw KindleError.corrupt("Record \(i) out of bounds") }
        return Array(bytes[start..<end])
    }
}

// MARK: - Headers

private let MOBI_MAX = 0xFFFF_FFFF

private let MOBI_LANGUAGES: [Int: String] = [
    1: "ar", 2: "bg", 3: "ca", 4: "zh", 5: "cs", 6: "da", 7: "de", 8: "el", 9: "en", 10: "es", 11: "fi", 12: "fr",
    13: "he", 14: "hu", 15: "is", 16: "it", 17: "ja", 18: "ko", 19: "nl", 20: "no", 21: "pl", 22: "pt", 23: "rm",
    24: "ro", 25: "ru", 26: "hr", 27: "sk", 28: "sq", 29: "sv", 30: "th", 31: "tr", 32: "ur", 33: "id", 34: "uk",
    35: "be", 36: "sl", 37: "et", 38: "lv", 39: "lt", 41: "fa", 42: "vi", 43: "hy", 44: "az", 45: "eu", 47: "mk",
    54: "af", 55: "ka", 56: "fo", 57: "hi", 58: "mt", 62: "ms", 63: "kk", 65: "sw", 69: "bn", 70: "pa", 71: "gu",
    72: "or", 73: "ta", 74: "te", 75: "kn", 76: "ml", 78: "mr", 82: "cy", 83: "gl", 97: "ne",
]

private struct PalmDocHeader {
    var compression = 0
    var textLength = 0
    var numTextRecords = 0
    var recordSize = 0
    var encryption = 0
}

private struct MOBIHeader {
    var length = 0
    var type = 2
    var encoding = 65001
    var uid = 0
    var version = 6
    var titleOffset = 0
    var titleLength = 0
    var locale = 0
    var resourceStart = MOBI_MAX
    var huffcdic = MOBI_MAX
    var numHuffcdic = 0
    var exthFlag = 0
    var trailingFlags = 0
    var indx = MOBI_MAX
    var language = "en"
    var title = ""
}

private struct KF8Header {
    var fdst = MOBI_MAX
    var numFdst = 0
    var frag = MOBI_MAX
    var skel = MOBI_MAX
    var guide = MOBI_MAX
}

private struct Metadata {
    var title = ""
    var creators: [String] = []
    var publisher: String?
    var describe: String?
    var isbn: String?
    var subjects: [String] = []
    var date: String?
    var rights: String?
    var asin: String?
    var language = "en"
    var boundary: Int?
    var coverOffset: Int?
    var thumbOffset: Int?
    var coverURI: String?
    var fixedLayout: String?
    var cdeType: String?
}

private struct Headers {
    var palmdoc = PalmDocHeader()
    var mobi: MOBIHeader?
    var meta = Metadata()
    var kf8: KF8Header?
}

/// Parses record 0 (or, for a hybrid, the KF8 half's header record). Never throws: a header field that is not
/// there simply keeps its default, exactly as the JavaScript's `at(offset, fallback)` does.
private func parseHeaders(_ rec: [UInt8]) -> Headers {
    var headers = Headers()
    headers.palmdoc = PalmDocHeader(
        compression: rd16(rec, 0),
        textLength: rd32(rec, 4),
        numTextRecords: rd16(rec, 8),
        recordSize: rd16(rec, 10),
        encryption: rd16(rec, 12)
    )
    guard latin1(rec, 16, 4) == "MOBI" else { return headers }

    let length = rd32(rec, 20)
    // The MOBI header starts at offset 16 and runs for `length` bytes; the original compares `off + 4` against
    // `length` (not against `length + 16`), and we keep that so both implementations fall back on the same fields.
    func at(_ off: Int, _ fallback: Int) -> Int {
        (off + 4 <= length && off + 4 <= rec.count) ? rd32(rec, off) : fallback
    }

    var mobi = MOBIHeader()
    mobi.length = length
    mobi.type = at(24, 2)
    mobi.encoding = at(28, 65001)
    mobi.uid = at(32, 0)
    mobi.version = at(36, 6)
    mobi.titleOffset = at(84, 0)
    mobi.titleLength = at(88, 0)
    mobi.locale = at(92, 0)
    mobi.resourceStart = at(108, MOBI_MAX)
    mobi.huffcdic = at(112, MOBI_MAX)
    mobi.numHuffcdic = at(116, 0)
    mobi.exthFlag = at(128, 0)
    mobi.trailingFlags = length >= 0xE4 ? at(240, 0) : 0
    mobi.indx = length >= 0xE8 ? at(244, MOBI_MAX) : MOBI_MAX
    mobi.language = MOBI_LANGUAGES[mobi.locale & 0xFF] ?? "en"

    let encoding = TextEncoding.from(mobi.encoding)
    if mobi.titleLength > 0, mobi.titleOffset >= 0, mobi.titleOffset + mobi.titleLength <= rec.count {
        mobi.title = encoding.decode(rec, mobi.titleOffset, mobi.titleLength)
    }

    var kf8: KF8Header?
    if mobi.version >= 8 {
        kf8 = KF8Header(fdst: at(192, MOBI_MAX), numFdst: at(196, 0), frag: at(248, MOBI_MAX),
                        skel: at(252, MOBI_MAX), guide: at(260, MOBI_MAX))
    }

    // EXTH: a tagged list of metadata records that sits right after the MOBI header.
    var exth: [Int: [[UInt8]]] = [:]
    if mobi.exthFlag & 0x40 != 0 {
        let exthStart = 16 + length
        if exthStart >= 0, exthStart <= rec.count {
            let e = Array(rec[exthStart...])
            if latin1(e, 0, 4) == "EXTH" {
                let count = rd32(e, 8)
                var o = 12
                var i = 0
                while i < count && o + 8 <= e.count {
                    let type = rd32(e, o)
                    let len = rd32(e, o + 4)
                    if len < 8 { break }
                    let bodyStart = min(e.count, o + 8)
                    let bodyEnd = max(bodyStart, min(e.count, o + len))
                    exth[type, default: []].append(Array(e[bodyStart..<bodyEnd]))
                    o += len
                    i += 1
                }
            }
        }
    }

    func strings(_ type: Int) -> [String] {
        (exth[type] ?? []).map { body in
            var s = encoding.decode(body)
            while s.hasSuffix("\0") { s.removeLast() }
            return s
        }
    }
    func number(_ type: Int) -> Int? {
        guard let first = exth[type]?.first, first.count >= 4 else { return nil }
        return rd32(first, 0)
    }

    var meta = Metadata()
    meta.title = strings(503).first ?? mobi.title
    meta.creators = strings(100)
    meta.publisher = strings(101).first
    meta.describe = strings(103).first
    meta.isbn = strings(104).first
    meta.subjects = strings(105)
    meta.date = strings(106).first
    meta.rights = strings(109).first
    meta.asin = strings(113).first
    meta.language = strings(524).first ?? mobi.language
    meta.boundary = number(121)
    meta.coverOffset = number(201)
    meta.thumbOffset = number(202)
    meta.coverURI = strings(129).first
    meta.fixedLayout = strings(122).first
    meta.cdeType = strings(501).first

    headers.mobi = mobi
    headers.meta = meta
    headers.kf8 = kf8
    return headers
}

// MARK: - Decompression

/// PalmDOC's LZ77 variant: literals, short back-references, and a "space plus letter" shorthand.
private func decompressPalmDOC(_ a: [UInt8]) -> [UInt8] {
    guard !a.isEmpty else { return [] }
    // Eight bytes out per byte in is the format's ceiling; the 16-byte tail leaves room for one more token.
    var out = [UInt8](repeating: 0, count: a.count * 8 + 16)
    var n = 0
    var i = 0
    while i < a.count {
        let b = a[i]
        if b == 0 {
            out[n] = 0
            n += 1
        } else if b <= 8 {
            var k = 0
            while k < Int(b) && i + 1 + k < a.count {
                out[n] = a[i + 1 + k]
                n += 1
                k += 1
            }
            i += Int(b)
        } else if b <= 0x7F {
            out[n] = b
            n += 1
        } else if b <= 0xBF {
            i += 1
            let pair = (Int(b) << 8) | Int(byteAt(a, i))
            let distance = (pair & 0x3FFF) >> 3
            let length = (pair & 7) + 3
            var k = 0
            while k < length {
                let src = n - distance
                out[n] = src >= 0 ? out[src] : 0
                n += 1
                k += 1
            }
        } else {
            out[n] = 32
            n += 1
            out[n] = b ^ 0x80
            n += 1
        }
        if n > out.count - 16 { return Array(out[0..<n]) }
        i += 1
    }
    return Array(out[0..<n])
}

/// HUFF/CDIC: a Huffman table (HUFF) plus one or more dictionaries of byte strings (CDIC). Dictionary entries can
/// themselves be compressed, so they are expanded lazily and cached.
private final class HuffCdic {
    private var codeFound = [Bool](repeating: false, count: 256)
    private var codeLengths = [Int](repeating: 0, count: 256)
    private var codeValues = [Int](repeating: 0, count: 256)
    /// Indexed by code length 1...32; entry 0 is a placeholder so the indices line up with the format.
    private var minCode = [Int](repeating: 0, count: 33)
    private var maxCodeValue = [Int](repeating: 0, count: 33)
    private var dictionary: [[UInt8]] = []
    private var expanded: [Bool] = []

    init(pdb: PalmDB, base: Int, huffIndex: Int, numHuff: Int) throws {
        let huff = try pdb.record(base + huffIndex)
        guard latin1(huff, 0, 4) == "HUFF" else { throw KindleError.corrupt("Invalid HUFF record") }
        let off1 = rd32(huff, 8), off2 = rd32(huff, 12)
        for i in 0..<256 {
            let x = rd32(huff, off1 + i * 4)
            codeFound[i] = x & 0x80 != 0
            codeLengths[i] = x & 0x1F
            codeValues[i] = x >> 8
        }
        for i in 0..<32 {
            minCode[i + 1] = rd32(huff, off2 + i * 8)
            maxCodeValue[i + 1] = rd32(huff, off2 + i * 8 + 4)
        }

        var i = 1
        while i < numHuff {
            let rec = try pdb.record(base + huffIndex + i)
            guard latin1(rec, 0, 4) == "CDIC" else { throw KindleError.corrupt("Invalid CDIC record") }
            let hlen = rd32(rec, 4)
            let numEntries = rd32(rec, 8)
            let codeLength = rd32(rec, 12)
            guard codeLength >= 0, codeLength < 31 else { throw KindleError.corrupt("CDIC code length \(codeLength)") }
            guard hlen >= 0, hlen <= rec.count else { throw KindleError.corrupt("CDIC header length out of range") }
            let buf = Array(rec[hlen...])
            let n = min(1 << codeLength, numEntries - dictionary.count)
            var k = 0
            while k < n {
                let o = rd16(buf, k * 2)
                let x = rd16(buf, o)
                let length = x & 0x7FFF
                let start = min(buf.count, max(0, o + 2))
                let end = max(start, min(buf.count, start + length))
                dictionary.append(Array(buf[start..<end]))
                expanded.append(x & 0x8000 != 0)
                k += 1
            }
            i += 1
        }
    }

    func decompress(_ a: [UInt8]) throws -> [UInt8] { try decompress(a, depth: 0) }

    private func decompress(_ a: [UInt8], depth: Int) throws -> [UInt8] {
        guard depth < 16 else { throw KindleError.corrupt("HUFF dictionary nested too deeply") }
        var out = [UInt8]()
        out.reserveCapacity(a.count * 4)
        let bitLength = a.count * 8
        var i = 0
        while i < bitLength {
            let bits = HuffCdic.read32(a, i)
            let slot = Int(bits >> 24)
            var codeLength = codeLengths[slot]
            var value = codeValues[slot]
            if !codeFound[slot] {
                if codeLength < 1 { codeLength = 1 }
                while codeLength <= 32, Int(bits >> UInt32(32 - codeLength)) < minCode[codeLength] { codeLength += 1 }
                guard codeLength <= 32 else { throw KindleError.corrupt("HUFF code longer than 32 bits") }
                value = maxCodeValue[codeLength]
            }
            // A zero-length code would spin forever; the format never produces one, so treat it as the end.
            guard codeLength > 0 else { break }
            i += codeLength
            if i > bitLength { break }
            let code = value - Int(bits >> UInt32(32 - codeLength))
            guard code >= 0, code < dictionary.count else { break }
            if !expanded[code] {
                let piece = dictionary[code]
                let full = try decompress(piece, depth: depth + 1)
                dictionary[code] = full
                expanded[code] = true
            }
            out.append(contentsOf: dictionary[code])
        }
        return out
    }

    /// The 32 bits starting at bit `from`, read big-endian across byte boundaries.
    private static func read32(_ a: [UInt8], _ from: Int) -> UInt32 {
        let startByte = from >> 3
        let end = from + 32
        let endByte = end >> 3
        var v: UInt64 = 0
        var i = startByte
        while i <= endByte {
            v = (v << 8) | UInt64(byteAt(a, i))
            i += 1
        }
        return UInt32(truncatingIfNeeded: v >> UInt64(8 - (end & 7)))
    }
}

// MARK: - INDX / TAGX / CNCX indexes

/// One row of an index: its name (the key, an ASCII string) and its decoded tag values.
private struct IndexEntry {
    let name: String
    let tags: [Int: [Int]]

    func tag(_ n: Int) -> [Int]? { tags[n] }
    func first(_ n: Int) -> Int? { tags[n]?.first }
}

private struct IndexTable {
    let entries: [IndexEntry]
    /// Concatenated string blocks the entries point into, keyed by their offset.
    let cncx: [Int: String]
}

/// Reads an INDX chain: a header record with a TAGX description of the tag layout, `numRecords` data records, and
/// `numCncx` string records after them.
private func readIndex(_ pdb: PalmDB, base: Int, indxIndex: Int) throws -> IndexTable {
    let first = try pdb.record(base + indxIndex)
    guard latin1(first, 0, 4) == "INDX" else { throw KindleError.corrupt("Invalid INDX record") }
    let hlen = rd32(first, 4)
    let numRecords = rd32(first, 24)
    let encoding = rd32(first, 28)
    let numCncx = rd32(first, 52)
    let dec = TextEncoding.from(encoding)
    guard hlen >= 0, hlen <= first.count else { throw KindleError.corrupt("INDX header length out of range") }
    let tagx = Array(first[hlen...])
    guard latin1(tagx, 0, 4) == "TAGX" else { throw KindleError.corrupt("Invalid TAGX section") }
    let tagxLength = min(rd32(tagx, 4), tagx.count)
    let numControlBytes = rd32(tagx, 8)

    var tagTable: [(tag: Int, numValues: Int, mask: Int, end: Int)] = []
    var t = 12
    while t + 4 <= tagxLength {
        tagTable.append((Int(byteAt(tagx, t)), Int(byteAt(tagx, t + 1)), Int(byteAt(tagx, t + 2)), Int(byteAt(tagx, t + 3))))
        t += 4
    }

    var cncx: [Int: String] = [:]
    var cncxBase = 0
    var c = 0
    while c < numCncx {
        let rec = try pdb.record(base + indxIndex + numRecords + 1 + c)
        var pos = 0
        while pos < rec.count {
            let key = pos
            let v = varlen(rec, pos)
            guard v.length > 0 else { break }
            pos += v.length
            cncx[cncxBase + key] = dec.decode(rec, pos, v.value)
            pos += v.value
        }
        cncxBase += 0x10000
        c += 1
    }

    var entries: [IndexEntry] = []
    var r = 0
    while r < numRecords {
        let rec = try pdb.record(base + indxIndex + 1 + r)
        guard latin1(rec, 0, 4) == "INDX" else { throw KindleError.corrupt("Invalid INDX record") }
        let idxt = rd32(rec, 20)
        let count = rd32(rec, 24)
        guard idxt >= 0, count >= 0, idxt + 4 + 2 * count <= rec.count else {
            throw KindleError.corrupt("INDX entry table runs past the end of its record")
        }
        var j = 0
        while j < count {
            let off = rd16(rec, idxt + 4 + 2 * j)
            guard off >= 0, off < rec.count else { throw KindleError.corrupt("INDX entry offset out of range") }
            let nameLength = Int(rec[off])
            let name = latin1(rec, off + 1, nameLength)
            let startPos = off + 1 + nameLength
            var controlIndex = 0
            var pos = startPos + numControlBytes

            // Control bytes say, per tag, whether the tag is present and how many values it has.
            var pending: [(tag: Int, valueCount: Int?, valueBytes: Int?, numValues: Int)] = []
            for entry in tagTable {
                if entry.end & 1 != 0 {
                    controlIndex += 1
                    continue
                }
                let value = Int(byteAt(rec, startPos + controlIndex)) & entry.mask
                if value == entry.mask {
                    if entry.mask.nonzeroBitCount > 1 {
                        let v = varlen(rec, pos)
                        pending.append((entry.tag, nil, v.value, entry.numValues))
                        pos += v.length
                    } else {
                        pending.append((entry.tag, 1, nil, entry.numValues))
                    }
                } else {
                    pending.append((entry.tag, value >> trailingZeros(entry.mask), nil, entry.numValues))
                }
            }

            var tags: [Int: [Int]] = [:]
            for p in pending {
                var values: [Int] = []
                if let count = p.valueCount {
                    let total = count * p.numValues
                    var k = 0
                    while k < total {
                        let v = varlen(rec, pos)
                        guard v.length > 0 else { break }
                        values.append(v.value)
                        pos += v.length
                        k += 1
                    }
                } else {
                    let bytes = p.valueBytes ?? 0
                    var consumed = 0
                    while consumed < bytes {
                        let v = varlen(rec, pos)
                        guard v.length > 0 else { break }
                        values.append(v.value)
                        pos += v.length
                        consumed += v.length
                    }
                }
                tags[p.tag] = values
            }
            entries.append(IndexEntry(name: name, tags: tags))
            j += 1
        }
        r += 1
    }
    return IndexTable(entries: entries, cncx: cncx)
}

/// A table of contents entry. MOBI 7 books address targets by byte offset; KF8 books by (fragment, offset) pair.
private struct NCXItem {
    let offset: Int?
    let label: String
    let position: [Int]?
    var children: [NCXItem]
}

private func readNCX(_ pdb: PalmDB, base: Int, indxIndex: Int) throws -> [NCXItem] {
    let index = try readIndex(pdb, base: base, indxIndex: indxIndex)
    struct Row {
        let offset: Int?
        let label: String
        let position: [Int]?
        let parent: Int?
    }
    var rows: [Row] = []
    rows.reserveCapacity(index.entries.count)
    for entry in index.entries {
        let labelKey = entry.first(3)
        let label = unescapeEntities(labelKey.flatMap { index.cncx[$0] } ?? "")
        rows.append(Row(offset: entry.first(1), label: label, position: entry.tag(6), parent: entry.first(21)))
    }

    var childrenOf = [[Int]](repeating: [], count: rows.count)
    for (i, row) in rows.enumerated() {
        guard let parent = row.parent, parent >= 0, parent < rows.count, parent != i else { continue }
        childrenOf[parent].append(i)
    }

    // A malformed index can point items at each other in a loop; `visiting` stops the walk from recursing forever.
    var visiting = Set<Int>()
    func build(_ i: Int) -> NCXItem {
        var children: [NCXItem] = []
        if visiting.insert(i).inserted {
            for child in childrenOf[i] { children.append(build(child)) }
            visiting.remove(i)
        }
        let row = rows[i]
        return NCXItem(offset: row.offset, label: row.label, position: row.position, children: children)
    }

    var roots: [NCXItem] = []
    for (i, row) in rows.enumerated() {
        let isRoot: Bool
        if let parent = row.parent { isRoot = !(parent >= 0 && parent < rows.count) } else { isRoot = true }
        if isRoot { roots.append(build(i)) }
    }
    return roots
}

// MARK: - Resources

private struct Resource {
    enum Kind { case image, font, media }
    let kind: Kind
    let mime: String
    let ext: String
    let bytes: [UInt8]
    let name: String
}

private struct ExtraFile {
    let name: String
    let mime: String
    let bytes: [UInt8]
}

private func sniffImage(_ a: [UInt8]) -> (String, String)? {
    if byteAt(a, 0) == 0xFF && byteAt(a, 1) == 0xD8 { return ("image/jpeg", "jpg") }
    if byteAt(a, 0) == 0x89 && byteAt(a, 1) == 0x50 { return ("image/png", "png") }
    if latin1(a, 0, 3) == "GIF" { return ("image/gif", "gif") }
    if latin1(a, 0, 2) == "BM" { return ("image/bmp", "bmp") }
    if latin1(a, 8, 4) == "WEBP" { return ("image/webp", "webp") }
    if RE.svgStart.matched(latin1(a, 0, 40)) { return ("image/svg+xml", "svg") }
    return nil
}

private func sniffFont(_ a: [UInt8]) -> (String, String)? {
    let magic = latin1(a, 0, 4)
    if magic == "OTTO" { return ("font/otf", "otf") }
    if magic == "wOFF" { return ("font/woff", "woff") }
    if magic == "true" { return ("font/ttf", "ttf") }
    if byteAt(a, 0) == 0 && byteAt(a, 1) == 1 && byteAt(a, 2) == 0 && byteAt(a, 3) == 0 { return ("font/ttf", "ttf") }
    return nil
}

/// FONT records are optionally XOR-scrambled with a key stored in the record itself, then zlib-compressed.
private func decodeFont(_ rec: [UInt8]) -> [UInt8] {
    let flags = rd32(rec, 8)
    let dataStart = rd32(rec, 12)
    let keyLength = rd32(rec, 16)
    let keyStart = rd32(rec, 20)
    let start = min(rec.count, max(0, dataStart))
    var a = Array(rec[start...])
    if flags & 2 != 0, keyLength > 0 {
        let keyLo = min(rec.count, max(0, keyStart))
        let keyHi = max(keyLo, min(rec.count, keyLo + keyLength))
        let key = Array(rec[keyLo..<keyHi])
        if !key.isEmpty {
            let n = min(keyLength == 16 ? 1024 : 1040, a.count)
            for i in 0..<n { a[i] ^= key[i % key.count] }
        }
    }
    if flags & 1 != 0 {
        // A font that will not inflate is still better embedded raw than dropped: some readers cope.
        if let inflated = try? Inflate.zlib(Data(a)) { a = [UInt8](inflated) }
    }
    return a
}

/// Records whose magic marks them as bookkeeping rather than content.
private let SKIP_MAGIC: Set<String> = [
    "FLIS", "FCIS", "FDST", "DATP", "SRCS", "CMET", "PAGE", "RESC", "BOUN", "CRES", "CONT", "kind",
    "INDX", "HUFF", "CDIC", "TAGX", "\u{00E9}\u{008E}\r\n",
]

// MARK: - The converter

private final class MobiConverter {
    private let bytes: [UInt8]
    private let pdb: PalmDB

    private var base = 0
    private var headers = Headers()
    private var meta = Metadata()
    private var resourceBase = 0
    private var encoding = TextEncoding.utf8
    private var isKF8 = false

    private enum Decompressor {
        case none
        case palmDOC
        case huff(HuffCdic)
    }
    private var decompressor = Decompressor.none
    private var multibyteTrailing = false
    private var numTrailingEntries = 0
    /// Set for old PalmDOC books, whose text is decompressed before the MOBI 7 path ever runs.
    private var textOverride: [UInt8]?

    private var resourceCache: [Int: Resource] = [:]
    private var resourceMisses: Set<Int> = []

    init(bytes: [UInt8]) throws {
        self.bytes = bytes
        self.pdb = try PalmDB(bytes)
    }

    // MARK: Entry point

    func run() throws -> ConvertedBook {
        if pdb.type + pdb.creator == "TEXtREAd" { return try convertTEXtREAd() }
        guard pdb.type + pdb.creator == "BOOKMOBI" else { throw KindleError.notKindle }

        base = 0
        let firstRecord = try pdb.record(0)
        headers = parseHeaders(firstRecord)
        guard let mobi = headers.mobi else { throw KindleError.missingMOBIHeader }
        // Resource records are numbered from the *first* header's resource start even in a hybrid file, where the
        // rest of the book is read from the KF8 half.
        resourceBase = mobi.resourceStart < MOBI_MAX ? mobi.resourceStart : pdb.numRecords
        let firstMeta = headers.meta
        if headers.palmdoc.encryption != 0 { throw KindleError.drm }

        // A hybrid MOBI7+KF8 file: EXTH 121 points at the KF8 half's header record.
        if mobi.version < 8, let boundary = firstMeta.boundary, boundary < MOBI_MAX, boundary < pdb.numRecords {
            if let record = try? pdb.record(boundary) {
                let kf8Headers = parseHeaders(record)
                if kf8Headers.mobi != nil, kf8Headers.kf8 != nil {
                    headers = kf8Headers
                    base = boundary
                }
            }
        }

        meta = headers.meta
        if meta.title.isEmpty { meta.title = firstMeta.title }
        if meta.creators.isEmpty { meta.creators = firstMeta.creators }
        if headers.palmdoc.encryption != 0 { throw KindleError.drm }
        guard let active = headers.mobi else { throw KindleError.missingMOBIHeader }
        encoding = TextEncoding.from(active.encoding)
        try setUpText()
        isKF8 = headers.kf8.map { $0.skel < MOBI_MAX && $0.frag < MOBI_MAX } ?? false
        if isKF8 { return try convertKF8() }
        return try convertMOBI7()
    }

    // MARK: Text records

    private func setUpText() throws {
        guard let mobi = headers.mobi else { throw KindleError.missingMOBIHeader }
        switch headers.palmdoc.compression {
        case 1: decompressor = .none
        case 2: decompressor = .palmDOC
        case 17480:
            let huff = try HuffCdic(pdb: pdb, base: base, huffIndex: mobi.huffcdic, numHuff: mobi.numHuffcdic)
            decompressor = .huff(huff)
        default: throw KindleError.unsupportedCompression(headers.palmdoc.compression)
        }
        // The low bit says a record may end mid-character; the rest count extra entries appended to each record.
        multibyteTrailing = mobi.trailingFlags & 1 != 0
        numTrailingEntries = (mobi.trailingFlags >> 1).nonzeroBitCount
    }

    private func decompress(_ a: [UInt8]) throws -> [UInt8] {
        switch decompressor {
        case .none: return a
        case .palmDOC: return decompressPalmDOC(a)
        case .huff(let huff): return try huff.decompress(a)
        }
    }

    /// Drops the trailing index/multibyte entries a text record carries after its compressed payload.
    private func stripTrailing(_ a: [UInt8]) -> [UInt8] {
        var end = a.count
        var i = 0
        while i < numTrailingEntries {
            let n = varlenFromEnd(a, end)
            end = max(0, end - n)
            i += 1
        }
        if multibyteTrailing && end > 0 {
            let n = Int(a[end - 1] & 3) + 1
            end = max(0, end - n)
        }
        return end == a.count ? a : Array(a[0..<end])
    }

    private func textRecord(_ i: Int) throws -> [UInt8] {
        let record = try pdb.record(base + 1 + i)
        return try decompress(stripTrailing(record))
    }

    /// The whole book text, stopping at the first record that will not read — some files overstate their record
    /// count, and half a book beats no book.
    private func fullText() -> [UInt8] {
        if let override = textOverride { return override }
        var parts: [[UInt8]] = []
        var total = 0
        let n = headers.palmdoc.numTextRecords
        var i = 0
        while i < n {
            guard let part = try? textRecord(i) else { break }
            total += part.count
            parts.append(part)
            i += 1
        }
        var out = [UInt8]()
        out.reserveCapacity(total)
        for part in parts { out.append(contentsOf: part) }
        return out
    }

    // MARK: Resources

    /// The resource at `index` counting from the start of the resource area, or nil when that record holds
    /// something that is not content.
    private func resource(_ index: Int) -> Resource? {
        let absolute = resourceBase + index
        if let cached = resourceCache[absolute] { return cached }
        if resourceMisses.contains(absolute) { return nil }
        guard index >= 0, let rec = try? pdb.record(absolute) else {
            resourceMisses.insert(absolute)
            return nil
        }
        let magic = latin1(rec, 0, 4)
        var kind: Resource.Kind?
        var mime = ""
        var ext = ""
        var payload: [UInt8] = []
        if magic == "FONT" {
            let decoded = decodeFont(rec)
            let sniffed = sniffFont(decoded) ?? ("application/octet-stream", "bin")
            kind = .font
            mime = sniffed.0
            ext = sniffed.1
            payload = decoded
        } else if magic == "VIDE" || magic == "AUDI" {
            kind = .media
            mime = magic == "VIDE" ? "video/mp4" : "audio/mpeg"
            ext = magic == "VIDE" ? "mp4" : "mp3"
            payload = rec.count > 12 ? Array(rec[12...]) : []
        } else if !SKIP_MAGIC.contains(magic), let image = sniffImage(rec) {
            kind = .image
            mime = image.0
            ext = image.1
            payload = rec
        }
        guard let kind else {
            resourceMisses.insert(absolute)
            return nil
        }
        let folder = kind == .font ? "fonts" : "images"
        let entry = Resource(kind: kind, mime: mime, ext: ext, bytes: payload,
                             name: "\(folder)/res\(pad(index + 1, 4)).\(ext)")
        resourceCache[absolute] = entry
        return entry
    }

    /// The book's cover: the `kindle:embed:` URI first, then EXTH's cover and thumbnail record numbers.
    private func coverResource() -> Resource? {
        var candidates: [Int] = []
        if let uri = meta.coverURI, let m = RE.coverEmbed.firstMatch(in: uri), let g = m.group(1), let n = parseBase32(g) {
            candidates.append(n - 1)
        }
        if let offset = meta.coverOffset, offset < MOBI_MAX { candidates.append(offset) }
        if let thumb = meta.thumbOffset, thumb < MOBI_MAX { candidates.append(thumb) }
        for index in candidates {
            if let r = resource(index), r.kind == .image { return r }
        }
        return nil
    }

    // MARK: Packaging

    private struct Section {
        let file: String
        let xhtml: String
        let title: String
    }

    private struct TOCItem {
        let label: String
        let href: String
        var children: [TOCItem] = []
    }

    private struct Landmark {
        let type: String
        let label: String
        let href: String
    }

    private func bookTitle() -> String {
        let candidate = meta.title.isEmpty ? pdb.name : meta.title
        let trimmed = candidate.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? "Untitled" : trimmed
    }

    private func packageEPUB(sections: [Section], toc: [TOCItem], landmarks: [Landmark],
                             extraFiles: [ExtraFile], cover: Resource?) -> Data {
        var zip = ZipWriter()
        let language = meta.language.isEmpty ? "en" : meta.language
        let title = bookTitle()
        let identifier: String
        if let isbn = meta.isbn, !isbn.isEmpty {
            identifier = "urn:isbn:" + isbn
        } else if let asin = meta.asin, !asin.isEmpty {
            identifier = "urn:asin:" + asin
        } else {
            let uid = headers.mobi?.uid ?? 0
            identifier = "urn:mobi:\(uid):" + RE.nonWord.removingMatches(in: pdb.name)
        }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        let modified = formatter.string(from: Date())

        // The mimetype entry must come first and be stored, which is exactly what ZipWriter does.
        zip.add("mimetype", "application/epub+zip")
        zip.add("META-INF/container.xml", """
            <?xml version="1.0" encoding="UTF-8"?>
            <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>
            """)

        var manifest: [String] = []
        var spine: [String] = []
        if let cover {
            zip.add("OEBPS/images/cover.\(cover.ext)", Data(cover.bytes))
            manifest.append("<item id=\"cover-image\" href=\"images/cover.\(cover.ext)\" media-type=\"\(cover.mime)\" properties=\"cover-image\"/>")
            zip.add("OEBPS/text/cover.xhtml", """
                <?xml version="1.0" encoding="UTF-8"?>
                <html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Cover</title><style>body{margin:0;text-align:center}img{max-width:100%;max-height:100vh}</style></head><body><div epub:type="cover"><img src="../images/cover.\(cover.ext)" alt="Cover"/></div></body></html>
                """)
            manifest.append("<item id=\"cover\" href=\"text/cover.xhtml\" media-type=\"application/xhtml+xml\"/>")
            spine.append("<itemref idref=\"cover\" linear=\"yes\"/>")
        }
        for (i, section) in sections.enumerated() {
            zip.add("OEBPS/" + section.file, section.xhtml)
            manifest.append("<item id=\"s\(i)\" href=\"\(section.file)\" media-type=\"application/xhtml+xml\"/>")
            spine.append("<itemref idref=\"s\(i)\"/>")
        }
        for (i, file) in extraFiles.enumerated() {
            zip.add("OEBPS/" + file.name, Data(file.bytes))
            manifest.append("<item id=\"r\(i)\" href=\"\(file.name)\" media-type=\"\(file.mime)\"/>")
        }

        var items = toc
        if items.isEmpty {
            items = sections.enumerated().map { i, s in
                TOCItem(label: s.title.isEmpty ? "Section \(i + 1)" : s.title, href: s.file)
            }
            // A book with no table of contents at all can have thousands of sections; a reader only needs a map.
            if items.count > 200 {
                let step = Int((Double(items.count) / 200.0).rounded(.up))
                if step > 1 {
                    items = items.enumerated().filter { $0.offset % step == 0 }.map { $0.element }
                }
            }
        }

        zip.add("OEBPS/nav.xhtml", """
            <?xml version="1.0" encoding="UTF-8"?>
            <html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc" id="toc"><h1>Contents</h1>\(MobiConverter.navList(items, depth: 0))</nav>\(MobiConverter.landmarkNav(landmarks))</body></html>
            """)

        var order = 0
        let navMap = MobiConverter.ncxList(items, order: &order)
        zip.add("OEBPS/toc.ncx", """
            <?xml version="1.0" encoding="UTF-8"?>
            <ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="\(XHTML.escape(identifier))"/></head><docTitle><text>\(XHTML.escape(title))</text></docTitle><navMap>\(navMap)</navMap></ncx>
            """)

        let creators = meta.creators.isEmpty ? ["Unknown Author"] : meta.creators
        var opf = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
        opf += "<package xmlns=\"http://www.idpf.org/2007/opf\" version=\"3.0\" unique-identifier=\"pub-id\" xml:lang=\"\(XHTML.escape(language))\">\n"
        opf += "<metadata xmlns:dc=\"http://purl.org/dc/elements/1.1/\">\n"
        opf += "<dc:identifier id=\"pub-id\">\(XHTML.escape(identifier))</dc:identifier>\n"
        opf += "<dc:title>\(XHTML.escape(title))</dc:title>\n"
        for (i, creator) in creators.enumerated() {
            opf += "<dc:creator id=\"creator\(i)\">\(XHTML.escape(creator))</dc:creator>\n"
        }
        opf += "<dc:language>\(XHTML.escape(language))</dc:language>\n"
        if let publisher = meta.publisher, !publisher.isEmpty { opf += "<dc:publisher>\(XHTML.escape(publisher))</dc:publisher>\n" }
        if let date = meta.date, !date.isEmpty { opf += "<dc:date>\(XHTML.escape(date))</dc:date>\n" }
        if let description = meta.describe, !description.isEmpty {
            opf += "<dc:description>\(XHTML.escape(stripTags(description)))</dc:description>\n"
        }
        if let rights = meta.rights, !rights.isEmpty { opf += "<dc:rights>\(XHTML.escape(rights))</dc:rights>\n" }
        for subject in meta.subjects { opf += "<dc:subject>\(XHTML.escape(subject))</dc:subject>" }
        opf += "\n<dc:source>Converted from Kindle \(isKF8 ? "KF8" : "MOBI")</dc:source>\n"
        opf += "<meta property=\"dcterms:modified\">\(modified)</meta>\n"
        if cover != nil { opf += "<meta name=\"cover\" content=\"cover-image\"/>\n" }
        opf += "</metadata>\n<manifest>\n"
        opf += "<item id=\"nav\" href=\"nav.xhtml\" media-type=\"application/xhtml+xml\" properties=\"nav\"/>\n"
        opf += "<item id=\"ncx\" href=\"toc.ncx\" media-type=\"application/x-dtbncx+xml\"/>\n"
        opf += manifest.joined(separator: "\n")
        opf += "\n</manifest>\n<spine toc=\"ncx\">\n"
        opf += spine.joined(separator: "\n")
        opf += "\n</spine>\n"
        if !landmarks.isEmpty {
            opf += "<guide>"
            for l in landmarks {
                let label = l.label.isEmpty ? l.type : l.label
                opf += "<reference type=\"\(XHTML.escape(l.type))\" title=\"\(XHTML.escape(label))\" href=\"\(XHTML.escape(l.href))\"/>"
            }
            opf += "</guide>\n"
        }
        opf += "</package>"
        zip.add("OEBPS/content.opf", opf)
        return zip.finish()
    }

    private static func navList(_ items: [TOCItem], depth: Int) -> String {
        guard !items.isEmpty else { return "" }
        var s = "<ol>"
        for item in items {
            let label = item.label.isEmpty ? "Untitled" : item.label
            s += "<li><a href=\"\(XHTML.escape(item.href))\">\(XHTML.escape(label))</a>"
            if !item.children.isEmpty && depth < 6 { s += navList(item.children, depth: depth + 1) }
            s += "</li>"
        }
        return s + "</ol>"
    }

    private static func landmarkNav(_ landmarks: [Landmark]) -> String {
        guard !landmarks.isEmpty else { return "" }
        var s = "<nav epub:type=\"landmarks\" hidden=\"\"><ol>"
        for l in landmarks {
            let label = l.label.isEmpty ? l.type : l.label
            s += "<li><a epub:type=\"\(XHTML.escape(l.type))\" href=\"\(XHTML.escape(l.href))\">\(XHTML.escape(label))</a></li>"
        }
        return s + "</ol></nav>"
    }

    private static func ncxList(_ items: [TOCItem], order: inout Int) -> String {
        var s = ""
        for item in items {
            order += 1
            let id = order
            let label = item.label.isEmpty ? "Untitled" : item.label
            s += "<navPoint id=\"np\(id)\" playOrder=\"\(id)\"><navLabel><text>\(XHTML.escape(label))</text></navLabel>"
            s += "<content src=\"\(XHTML.escape(item.href))\"/>"
            if !item.children.isEmpty { s += ncxList(item.children, order: &order) }
            s += "</navPoint>"
        }
        return s
    }

    private func finish(sections: [Section], toc: [TOCItem], landmarks: [Landmark],
                        extraFiles: [ExtraFile], cover: Resource?) -> ConvertedBook {
        let epub = packageEPUB(sections: sections, toc: toc, landmarks: landmarks, extraFiles: extraFiles, cover: cover)
        return ConvertedBook(
            epub: epub,
            title: bookTitle(),
            authors: meta.creators,
            language: meta.language.isEmpty ? "en" : meta.language,
            cover: cover.map { Data($0.bytes) },
            coverMediaType: cover?.mime,
            isKF8: isKF8
        )
    }

    private func xhtml(_ html: String, stylesheets: [String]) -> String {
        let options = XHTML.Options(title: meta.title, language: meta.language.isEmpty ? "en" : meta.language,
                                    stylesheets: stylesheets)
        return XHTML.document(fromHTML: html, options: options)
    }

    private func headingTitle(in html: String) -> String {
        guard let m = RE.heading.firstMatch(in: html), let inner = m.group(1) else { return "" }
        return unescapeEntities(stripTags(inner)).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    // MARK: MOBI 6/7 — one HTML document, split at pagebreaks, linked by byte offset

    private func convertMOBI7() throws -> ConvertedBook {
        let raw = fullText()
        // Latin-1 keeps one character per byte, so regex match positions stay byte offsets — which is the unit
        // `filepos` links and section boundaries are expressed in.
        let scan = latin1String(raw)

        var starts = [0]
        for m in RE.pageBreak.matches(in: scan) where m.range.location > 0 { starts.append(m.range.location) }
        var bounds: [(start: Int, end: Int)] = []
        for (i, s) in starts.enumerated() {
            let e = i + 1 < starts.count ? starts[i + 1] : raw.count
            if e > s { bounds.append((s, e)) }
        }
        if bounds.isEmpty { bounds = [(0, raw.count)] }

        var fileposSet = Set<Int>()
        for m in RE.fileposValue.matches(in: scan) { if let v = m.int(1) { fileposSet.insert(v) } }

        // Some MOBI 7 files carry an NCX index; its targets need anchors too.
        var ncx: [NCXItem]?
        if let mobi = headers.mobi, mobi.indx < MOBI_MAX, let items = try? readNCX(pdb, base: base, indxIndex: mobi.indx) {
            ncx = items
            func walk(_ list: [NCXItem]) {
                for item in list {
                    if let offset = item.offset { fileposSet.insert(offset) }
                    walk(item.children)
                }
            }
            walk(items)
        }
        let filepos = fileposSet.sorted()

        func sectionOf(_ pos: Int) -> Int {
            // The bounds are ascending and do not overlap, so a binary search finds the section a byte offset
            // falls in; a dictionary can have tens of thousands of them.
            var lo = 0, hi = bounds.count - 1
            while lo <= hi {
                let mid = (lo + hi) / 2
                if pos < bounds[mid].start { hi = mid - 1 } else if pos >= bounds[mid].end { lo = mid + 1 } else { return mid }
            }
            return pos >= raw.count ? max(0, bounds.count - 1) : 0
        }
        func fileFor(_ i: Int) -> String { "text/sec\(pad(i + 1, 3)).xhtml" }
        func hrefFor(_ pos: Int) -> String { "\(fileFor(sectionOf(pos)))#filepos\(pos)" }

        struct Draft {
            let file: String
            var html: String
            var title: String
        }
        var drafts: [Draft] = []
        var imageRefs: [Int] = []
        var seenRefs = Set<Int>()

        var fileposCursor = 0
        for (i, bound) in bounds.enumerated() {
            // Splice an anchor in front of every byte offset something links to, before decoding.
            var spliced = [UInt8]()
            spliced.reserveCapacity(bound.end - bound.start + 64)
            var cursor = bound.start
            while fileposCursor < filepos.count && filepos[fileposCursor] < bound.start { fileposCursor += 1 }
            var next = fileposCursor
            while next < filepos.count, filepos[next] < bound.end {
                let fp = filepos[next]
                spliced.append(contentsOf: raw[cursor..<fp])
                spliced.append(contentsOf: Array("<a id=\"filepos\(fp)\"></a>".utf8))
                cursor = fp
                next += 1
            }
            fileposCursor = next
            if cursor < bound.end { spliced.append(contentsOf: raw[cursor..<bound.end]) }

            var html = encoding.decode(spliced)
            html = RE.pageBreak.removingMatches(in: html)
            html = RE.mbpTag.removingMatches(in: html)
            html = RE.guideBlock.removingMatches(in: html)
            html = RE.metadataBlock.removingMatches(in: html)
            html = RE.metadataTag.removingMatches(in: html)
            html = RE.anchorFilepos.replacingMatches(in: html) { m in
                let pre = m.group(1) ?? ""
                guard let n = m.int(2) else { return m.text }
                let href = (n >= bound.start && n < bound.end) ? "#filepos\(n)" : "../" + hrefFor(n)
                return "<a\(pre) href=\"\(href)\""
            }
            html = RE.imgRecindex.replacingMatches(in: html) { m in
                let pre = m.group(1) ?? ""
                guard let n = m.int(2) else { return m.text }
                if seenRefs.insert(n).inserted { imageRefs.append(n) }
                return "<img\(pre) data-recindex=\"\(n)\""
            }
            html = RE.mediaRecindex.replacingMatches(in: html) { m in
                let tag = m.group(1) ?? "video"
                let pre = m.group(2) ?? ""
                guard let n = m.int(3) else { return m.text }
                if seenRefs.insert(n).inserted { imageRefs.append(n) }
                return "<\(tag)\(pre) data-recindex=\"\(n)\""
            }
            drafts.append(Draft(file: fileFor(i), html: html, title: ""))
        }

        var extraFiles: [ExtraFile] = []
        var resourceHrefs: [Int: String] = [:]
        for recindex in imageRefs {
            guard let r = resource(recindex - 1) else { continue }
            resourceHrefs[recindex] = "../" + r.name
            if !extraFiles.contains(where: { $0.name == r.name }) {
                extraFiles.append(ExtraFile(name: r.name, mime: r.mime, bytes: r.bytes))
            }
        }
        let cover = coverResource()
        let styleSheet = """
            blockquote { margin: 0 0 0 1em; }
            img { max-width: 100%; }
            p { margin: 0; text-indent: 1.5em; }

            """
        extraFiles.append(ExtraFile(name: "styles/mobi.css", mime: "text/css", bytes: Array(styleSheet.utf8)))

        var sections: [Section] = []
        for i in drafts.indices {
            let resolved = RE.dataRecindex.replacingMatches(in: drafts[i].html) { m in
                guard let n = m.int(1), let href = resourceHrefs[n] else { return "data-missing=\"1\"" }
                return "src=\"\(href)\""
            }
            drafts[i].html = resolved
            drafts[i].title = headingTitle(in: resolved)
            sections.append(Section(file: drafts[i].file,
                                    xhtml: xhtml(resolved, stylesheets: ["../styles/mobi.css"]),
                                    title: drafts[i].title))
        }

        // Landmarks come from the `<guide>` block Mobipocket puts at the top of the document.
        var landmarks: [Landmark] = []
        let firstBound = bounds[0]
        let head = encoding.decode(raw, firstBound.start, min(firstBound.end, firstBound.start + 16384) - firstBound.start)
        for m in RE.reference.matches(in: head) {
            let attrs = m.group(1) ?? ""
            guard let type = RE.refType.firstMatch(in: attrs)?.group(1),
                  let fp = RE.refFilepos.firstMatch(in: attrs)?.int(1) else { continue }
            let title = RE.refTitle.firstMatch(in: attrs)?.group(1)
            let lowered = type.lowercased()
            landmarks.append(Landmark(type: lowered == "text" ? "bodymatter" : lowered,
                                      label: title ?? type, href: hrefFor(fp)))
        }

        var toc: [TOCItem] = []
        if let ncx, !ncx.isEmpty {
            func map(_ item: NCXItem) -> TOCItem {
                TOCItem(label: item.label, href: item.offset.map { hrefFor($0) } ?? fileFor(0),
                        children: item.children.map(map))
            }
            toc = ncx.map(map)
        }
        if toc.isEmpty, let tocLandmark = landmarks.first(where: { $0.type == "toc" }) {
            // No index, but the book has a hand-written contents page: scrape its links.
            let file = String(tocLandmark.href.split(separator: "#", maxSplits: 1, omittingEmptySubsequences: false)[0])
            if let draft = drafts.first(where: { $0.file == file }) {
                var items: [TOCItem] = []
                for m in RE.tocAnchor.matches(in: draft.html) {
                    guard let href = m.group(1), let inner = m.group(2) else { continue }
                    let label = unescapeEntities(stripTags(inner)).trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !label.isEmpty else { continue }
                    let target = href.hasPrefix("#") ? file + href
                        : (href.hasPrefix("../") ? String(href.dropFirst(3)) : href)
                    items.append(TOCItem(label: label, href: target))
                }
                toc = items
            }
        }
        if toc.isEmpty {
            toc = sections.filter { !$0.title.isEmpty }.map { TOCItem(label: $0.title, href: $0.file) }
        }

        return finish(sections: sections, toc: toc, landmarks: landmarks, extraFiles: extraFiles, cover: cover)
    }

    // MARK: KF8 (AZW3) — skeletons with fragments spliced in, `kindle:` URIs for everything else

    private struct Skeleton {
        let index: Int
        let name: String
        let numFragments: Int
        let offset: Int
        let length: Int
    }

    private struct Fragment {
        let insertOffset: Int
        let index: Int
        let offset: Int
        let length: Int
    }

    private struct KF8Section {
        let skeleton: Skeleton
        let fragments: [Fragment]
        let file: String
    }

    private func convertKF8() throws -> ConvertedBook {
        guard let kf8 = headers.kf8 else { throw KindleError.corrupt("Missing KF8 header") }
        let raw = fullText()

        // Flows: the main text plus stylesheets and SVG, laid end to end in one buffer.
        var flows: [(start: Int, end: Int)] = [(0, raw.count)]
        if kf8.fdst < MOBI_MAX, kf8.numFdst > 1, let f = try? pdb.record(base + kf8.fdst), latin1(f, 0, 4) == "FDST" {
            let n = rd32(f, 8)
            var list: [(Int, Int)] = []
            var i = 0
            while i < n {
                list.append((rd32(f, 12 + i * 8), rd32(f, 16 + i * 8)))
                i += 1
            }
            if !list.isEmpty { flows = list }
        }

        let skelTable = try readIndex(pdb, base: base, indxIndex: kf8.skel)
        var skeletons: [Skeleton] = []
        for (i, entry) in skelTable.entries.enumerated() {
            guard let numFragments = entry.first(1), let position = entry.tag(6), position.count >= 2 else {
                throw KindleError.corrupt("Incomplete SKEL index entry")
            }
            skeletons.append(Skeleton(index: i, name: entry.name, numFragments: numFragments,
                                      offset: position[0], length: position[1]))
        }

        let fragTable = try readIndex(pdb, base: base, indxIndex: kf8.frag)
        var fragments: [Fragment] = []
        for entry in fragTable.entries {
            guard let insertOffset = Int(entry.name), let index = entry.first(4),
                  let position = entry.tag(6), position.count >= 2 else {
                throw KindleError.corrupt("Incomplete FRAG index entry")
            }
            fragments.append(Fragment(insertOffset: insertOffset, index: index, offset: position[0], length: position[1]))
        }

        var sections: [KF8Section] = []
        var cursor = 0
        for skeleton in skeletons {
            let lo = min(cursor, fragments.count)
            let hi = min(lo + max(0, skeleton.numFragments), fragments.count)
            cursor = lo + max(0, skeleton.numFragments)
            sections.append(KF8Section(skeleton: skeleton, fragments: Array(fragments[lo..<hi]),
                                       file: "text/part\(pad(skeleton.index + 1, 4)).xhtml"))
        }
        var sectionByFragment: [Int: Int] = [:]
        for (i, section) in sections.enumerated() {
            for fragment in section.fragments { sectionByFragment[fragment.index] = i }
        }

        // Work out which (fragment, offset) pairs are link targets before assembling, so anchors can be added on
        // the way past.
        var anchorRequests: [Int: Set<Int>] = [:]
        func wantAnchor(_ fid: Int, _ off: Int) { anchorRequests[fid, default: []].insert(off) }

        var ncx: [NCXItem]?
        if let mobi = headers.mobi, mobi.indx < MOBI_MAX, let items = try? readNCX(pdb, base: base, indxIndex: mobi.indx) {
            ncx = items
            func walk(_ list: [NCXItem]) {
                for item in list {
                    if let position = item.position, let fid = position.first {
                        wantAnchor(fid, position.count > 1 ? position[1] : 0)
                    }
                    walk(item.children)
                }
            }
            walk(items)
        }

        struct GuideEntry {
            let type: String
            let label: String
            let fid: Int
            let off: Int
        }
        var guide: [GuideEntry] = []
        if kf8.guide < MOBI_MAX, let table = try? readIndex(pdb, base: base, indxIndex: kf8.guide) {
            for entry in table.entries {
                let position = entry.tag(6)
                let fid = position?.first ?? entry.first(3)
                guard let fid else { continue }
                let label = entry.first(1).flatMap { table.cncx[$0] } ?? ""
                let off = (position?.count ?? 0) > 1 ? (position?[1] ?? 0) : 0
                guide.append(GuideEntry(type: entry.name, label: label, fid: fid, off: off))
            }
            for entry in guide { wantAnchor(entry.fid, entry.off) }
        }

        let flowStart = flows[0].start, flowEnd = flows[0].end
        let mainFlow = encoding.decode(raw, flowStart, max(0, flowEnd - flowStart))
        for m in RE.kindlePos.matches(in: mainFlow) {
            guard let fidText = m.group(1), let offText = m.group(2),
                  let fid = parseBase32(fidText), let off = parseBase32(offText) else { continue }
            wantAnchor(fid, off)
        }

        // Assemble each section: the skeleton with its fragments spliced back in at their recorded offsets.
        var anchorIDs: [String: String] = [:]
        func anchorKey(_ fid: Int, _ off: Int) -> String { "\(fid):\(off)" }
        var assembled: [String] = []

        for section in sections {
            let skelLo = min(max(0, section.skeleton.offset), raw.count)
            let skelHi = max(skelLo, min(raw.count, section.skeleton.offset + max(0, section.skeleton.length)))
            var skeleton = Array(raw[skelLo..<skelHi])
            let fragBase = section.skeleton.offset + section.skeleton.length
            var inserted = 0

            for fragment in section.fragments {
                let lo = min(max(0, fragBase + fragment.offset), raw.count)
                let hi = max(lo, min(raw.count, fragBase + fragment.offset + max(0, fragment.length)))
                var fragRaw = Array(raw[lo..<hi])

                if let requested = anchorRequests[fragment.index], !requested.isEmpty {
                    var inserts: [(offset: Int, id: String)] = []
                    for off in requested.sorted() {
                        let windowStart = min(max(0, off), fragRaw.count)
                        let windowEnd = min(windowStart + 400, fragRaw.count)
                        let head = encoding.decode(fragRaw, windowStart, windowEnd - windowStart)
                        let attrs = RE.openingTag.firstMatch(in: head)?.group(1) ?? ""
                        if let id = RE.idOrName.firstMatch(in: attrs)?.group(1) {
                            anchorIDs[anchorKey(fragment.index, off)] = id
                        } else if let aid = RE.aidAttr.firstMatch(in: attrs)?.group(1) {
                            anchorIDs[anchorKey(fragment.index, off)] = "aid-" + aid
                        } else {
                            let id = "kpos-\(fragment.index)-\(off)"
                            anchorIDs[anchorKey(fragment.index, off)] = id
                            inserts.append((windowStart, id))
                        }
                    }
                    if !inserts.isEmpty {
                        var rebuilt = [UInt8]()
                        rebuilt.reserveCapacity(fragRaw.count + inserts.count * 24)
                        var c = 0
                        for insert in inserts {
                            let at = min(max(c, insert.offset), fragRaw.count)
                            rebuilt.append(contentsOf: fragRaw[c..<at])
                            rebuilt.append(contentsOf: Array("<a id=\"\(insert.id)\"></a>".utf8))
                            c = at
                        }
                        rebuilt.append(contentsOf: fragRaw[c...])
                        fragRaw = rebuilt
                    }
                }

                // Fragment insert offsets are measured in the assembled document, so only the growth from the
                // anchors we added has to be compensated for.
                let at = min(max(0, fragment.insertOffset - section.skeleton.offset + inserted), skeleton.count)
                var merged = [UInt8]()
                merged.reserveCapacity(skeleton.count + fragRaw.count)
                merged.append(contentsOf: skeleton[0..<at])
                merged.append(contentsOf: fragRaw)
                merged.append(contentsOf: skeleton[at...])
                skeleton = merged
                inserted += fragRaw.count - fragment.length
            }
            assembled.append(encoding.decode(skeleton))
        }

        // Resources referenced through kindle:embed and kindle:flow URIs.
        var extraFiles: [ExtraFile] = []
        var embedNames: [Int: String] = [:]
        var embedMisses: Set<Int> = []
        var flowNames: [Int: String] = [:]
        var flowMisses: Set<Int> = []

        func embedName(_ idText: String) -> String? {
            guard let parsed = parseBase32(idText) else { return nil }
            let index = parsed - 1
            if let cached = embedNames[index] { return cached }
            if embedMisses.contains(index) { return nil }
            guard let r = resource(index) else {
                embedMisses.insert(index)
                return nil
            }
            embedNames[index] = r.name
            if !extraFiles.contains(where: { $0.name == r.name }) {
                extraFiles.append(ExtraFile(name: r.name, mime: r.mime, bytes: r.bytes))
            }
            return r.name
        }

        func rewriteEmbeds(_ s: String, prefix: String) -> String {
            RE.kindleEmbed.replacingMatches(in: s) { m in
                guard let id = m.group(1), let name = embedName(id) else { return "about:blank#missing-resource" }
                return prefix + name
            }
        }

        func flowFileName(_ idText: String, mime: String?) -> String? {
            guard let index = parseBase32(idText) else { return nil }
            if let cached = flowNames[index] { return cached }
            if flowMisses.contains(index) { return nil }
            guard index >= 0, index < flows.count else {
                flowMisses.insert(index)
                return nil
            }
            let flow = flows[index]
            let isCSS = (mime ?? "").lowercased().contains("css")
            let isSVG = (mime ?? "").lowercased().contains("svg")
            var text = encoding.decode(raw, flow.start, max(0, flow.end - flow.start))
            text = rewriteEmbeds(text, prefix: "../")
            let name = isCSS ? "styles/flow\(pad(index, 4)).css"
                : "images/flow\(pad(index, 4)).\(isSVG ? "svg" : "txt")"
            let mimeType = isCSS ? "text/css" : (isSVG ? "image/svg+xml" : "text/plain")
            extraFiles.append(ExtraFile(name: name, mime: mimeType, bytes: Array(text.utf8)))
            flowNames[index] = name
            return name
        }

        var built: [Section] = []
        for (i, section) in sections.enumerated() {
            var s = assembled[i]
            // Flow URIs are rewritten by literal substitution so the same URI written twice resolves once.
            var seenFlows = Set<String>()
            for m in RE.kindleFlow.matches(in: s) {
                guard seenFlows.insert(m.text).inserted, let id = m.group(1) else { continue }
                let name = flowFileName(id, mime: m.group(2))
                s = s.replacingOccurrences(of: m.text, with: name.map { "../" + $0 } ?? "")
            }
            s = rewriteEmbeds(s, prefix: "../")
            s = RE.kindlePos.replacingMatches(in: s) { m in
                guard let fidText = m.group(1), let offText = m.group(2),
                      let fid = parseBase32(fidText), let off = parseBase32(offText) else { return "#" }
                guard let target = sectionByFragment[fid] else { return "#" }
                let id = anchorIDs[anchorKey(fid, off)]
                let file = target == i ? "" : "../" + sections[target].file
                return file + (id.map { "#" + $0 } ?? "")
            }
            s = RE.aidAssignment.replacingMatches(in: s) { m in " data-aid=\"\(m.group(2) ?? "")\"" }
            // Elements addressed only by their Kindle `aid` get a real id so the anchors above resolve.
            s = RE.taggedDataAid.replacingMatches(in: s) { m in
                let tag = m.group(1) ?? ""
                let pre = m.group(2) ?? ""
                let value = m.group(3) ?? ""
                let post = m.group(4) ?? ""
                if RE.hasIdAttr.matched(pre + post) { return m.text }
                return "<\(tag)\(pre) id=\"aid-\(value)\"\(post)>"
            }
            built.append(Section(file: section.file, xhtml: xhtml(s, stylesheets: []), title: headingTitle(in: s)))
        }

        func hrefFor(_ fid: Int, _ off: Int) -> String {
            guard let target = sectionByFragment[fid], target < built.count else {
                return built.first?.file ?? "text/part0001.xhtml"
            }
            let id = anchorIDs[anchorKey(fid, off)]
            return built[target].file + (id.map { "#" + $0 } ?? "")
        }

        var toc: [TOCItem] = []
        if let ncx, !ncx.isEmpty {
            func map(_ item: NCXItem) -> TOCItem {
                let href: String
                if let position = item.position, let fid = position.first {
                    href = hrefFor(fid, position.count > 1 ? position[1] : 0)
                } else {
                    href = built.first?.file ?? "text/part0001.xhtml"
                }
                return TOCItem(label: item.label, href: href, children: item.children.map(map))
            }
            toc = ncx.map(map)
        }

        var landmarks: [Landmark] = []
        for entry in guide {
            let lowered = entry.type.lowercased()
            // The cover page we generate already covers this landmark when EXTH named a cover record.
            if lowered == "cover", meta.coverOffset != nil { continue }
            landmarks.append(Landmark(type: lowered == "text" ? "bodymatter" : lowered,
                                      label: unescapeEntities(entry.label), href: hrefFor(entry.fid, entry.off)))
        }

        let cover = coverResource()
        // Skeletons with no fragments and no visible markup are Kindle's own padding sections.
        var nonEmpty: [Section] = []
        for (i, section) in built.enumerated() {
            if !sections[i].fragments.isEmpty || RE.bodyHasContent.matched(section.xhtml) { nonEmpty.append(section) }
        }
        let chosen = nonEmpty.isEmpty ? built : nonEmpty
        return finish(sections: chosen, toc: toc, landmarks: landmarks, extraFiles: extraFiles, cover: cover)
    }

    // MARK: TEXtREAd — pre-Kindle PalmDOC books

    private func convertTEXtREAd() throws -> ConvertedBook {
        let rec0 = try pdb.record(0)
        var palmdoc = PalmDocHeader()
        palmdoc.compression = rd16(rec0, 0)
        palmdoc.numTextRecords = rd16(rec0, 8)
        palmdoc.encryption = rd16(rec0, 12)
        if palmdoc.encryption != 0 { throw KindleError.drm }

        var parts: [[UInt8]] = []
        var total = 0
        var i = 1
        while i <= palmdoc.numTextRecords && i < pdb.numRecords {
            guard let rec = try? pdb.record(i) else { break }
            let part = palmdoc.compression == 2 ? decompressPalmDOC(rec) : rec
            total += part.count
            parts.append(part)
            i += 1
        }
        var raw = [UInt8]()
        raw.reserveCapacity(total)
        for part in parts { raw.append(contentsOf: part) }
        raw.removeAll(where: { $0 == 0 })

        let text = TextEncoding.cp1252.decode(raw)
        if RE.looksLikeHTML.matched(String(text.prefix(64))) {
            // Some old PalmDOC readers stored Mobipocket HTML: reuse the MOBI 7 path with a synthetic header.
            base = 0
            isKF8 = false
            resourceBase = palmdoc.numTextRecords + 1
            var mobi = MOBIHeader()
            mobi.encoding = 1252
            mobi.version = 0
            headers = Headers(palmdoc: palmdoc, mobi: mobi, meta: Metadata(), kf8: nil)
            meta = Metadata()
            meta.title = pdb.name.isEmpty ? "Untitled" : pdb.name
            encoding = .cp1252
            decompressor = .none
            multibyteTrailing = false
            numTrailingEntries = 0
            textOverride = raw
            return try convertMOBI7()
        }

        // Plain text: the same chapter splitting a dropped-in .txt file gets, packaged by the shared EPUB writer.
        let title = pdb.name.isEmpty ? "Untitled" : pdb.name
        meta = Metadata()
        meta.title = title
        meta.language = "en"
        encoding = .cp1252
        isKF8 = false
        var mobi = MOBIHeader()
        mobi.encoding = 1252
        headers = Headers(palmdoc: palmdoc, mobi: mobi, meta: meta, kf8: nil)
        let spec = EPUBSpec(title: title, author: "", language: "en", chapters: TextBook.chapters(from: text))
        return ConvertedBook(epub: EPUBWriter.build(spec), title: title, authors: [], language: "en",
                             cover: nil, coverMediaType: nil, isKF8: false)
    }
}

