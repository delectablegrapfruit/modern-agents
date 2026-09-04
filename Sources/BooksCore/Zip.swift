import Foundation

/// Reads ZIP archives (EPUB files are ZIP archives): the central directory, ZIP64 sizes, stored and deflated
/// entries. Everything is kept in memory; books are small.
public final class ZipArchive {
    public struct Entry {
        public let name: String
        public let method: UInt16
        public let compressedSize: Int
        public let uncompressedSize: Int
        public let crc: UInt32
        let localHeaderOffset: Int
        public var isDirectory: Bool { name.hasSuffix("/") }
    }

    public enum Error: Swift.Error, CustomStringConvertible {
        case notAZip
        case truncated
        case unsupportedMethod(UInt16)
        case missingEntry(String)

        public var description: String {
            switch self {
            case .notAZip: return "not a ZIP archive"
            case .truncated: return "the archive is truncated"
            case .unsupportedMethod(let m): return "unsupported compression method \(m)"
            case .missingEntry(let name): return "no entry named \(name)"
            }
        }
    }

    public let data: Data
    public private(set) var entries: [Entry] = []
    private var byName: [String: Int] = [:]

    public init(data: Data) throws {
        self.data = data
        try readCentralDirectory()
    }

    public convenience init(url: URL) throws {
        try self.init(data: try Data(contentsOf: url, options: .mappedIfSafe))
    }

    public var names: [String] { entries.map(\.name) }

    public func entry(_ name: String) -> Entry? {
        if let i = byName[name] { return entries[i] }
        // Tolerate a leading "./" or a differently normalized path.
        let cleaned = name.hasPrefix("./") ? String(name.dropFirst(2)) : name
        return byName[cleaned].map { entries[$0] }
    }

    public func contains(_ name: String) -> Bool { entry(name) != nil }

    /// The entry's decompressed bytes.
    public func data(_ name: String) throws -> Data {
        guard let entry = entry(name) else { throw Error.missingEntry(name) }
        return try data(of: entry)
    }

    public func string(_ name: String) throws -> String {
        let bytes = try data(name)
        if let s = String(data: bytes, encoding: .utf8) { return s }
        return String(decoding: bytes, as: UTF8.self)
    }

    public func data(of entry: Entry) throws -> Data {
        let base = data.startIndex + entry.localHeaderOffset
        guard base + 30 <= data.endIndex, u32(base) == 0x0403_4B50 else { throw Error.truncated }
        let nameLength = Int(u16(base + 26)), extraLength = Int(u16(base + 28))
        let start = base + 30 + nameLength + extraLength
        guard start + entry.compressedSize <= data.endIndex else { throw Error.truncated }
        let raw = data[start..<start + entry.compressedSize]
        switch entry.method {
        case 0: return Data(raw)
        case 8: return try Inflate.raw(Data(raw), expectedSize: entry.uncompressedSize)
        default: throw Error.unsupportedMethod(entry.method)
        }
    }

    // MARK: - Parsing

    private func u16(_ i: Data.Index) -> UInt16 { UInt16(data[i]) | UInt16(data[i + 1]) << 8 }
    private func u32(_ i: Data.Index) -> UInt32 { UInt32(u16(i)) | UInt32(u16(i + 2)) << 16 }
    private func u64(_ i: Data.Index) -> UInt64 { UInt64(u32(i)) | UInt64(u32(i + 4)) << 32 }

    private func readCentralDirectory() throws {
        guard data.count >= 22 else { throw Error.notAZip }
        // End of central directory record: scan back over a possible comment.
        var eocd = data.endIndex - 22
        let stop = max(data.startIndex, data.endIndex - 22 - 65_535)
        while eocd >= stop, u32(eocd) != 0x0605_4B50 { eocd -= 1 }
        guard eocd >= stop else { throw Error.notAZip }
        var count = Int(u16(eocd + 10))
        var directoryOffset = Int(u32(eocd + 16))
        if count == 0xFFFF || directoryOffset == 0xFFFF_FFFF {
            // ZIP64: the locator sits just before the EOCD record.
            let locator = eocd - 20
            if locator >= data.startIndex, u32(locator) == 0x0706_4B50 {
                let record = data.startIndex + Int(u64(locator + 8))
                if record + 56 <= data.endIndex, u32(record) == 0x0606_4B50 {
                    count = Int(u64(record + 32))
                    directoryOffset = Int(u64(record + 48))
                }
            }
        }
        var p = data.startIndex + directoryOffset
        var list: [Entry] = []
        list.reserveCapacity(count)
        for _ in 0..<count {
            guard p + 46 <= data.endIndex, u32(p) == 0x0201_4B50 else { throw Error.truncated }
            let method = u16(p + 10)
            let crc = u32(p + 16)
            var compressed = Int(u32(p + 20)), uncompressed = Int(u32(p + 24))
            let nameLength = Int(u16(p + 28)), extraLength = Int(u16(p + 30)), commentLength = Int(u16(p + 32))
            var offset = Int(u32(p + 42))
            let nameStart = p + 46
            guard nameStart + nameLength + extraLength + commentLength <= data.endIndex else { throw Error.truncated }
            let flags = u16(p + 8)
            let nameData = data[nameStart..<nameStart + nameLength]
            let name = (flags & 0x800 != 0 ? String(data: nameData, encoding: .utf8) : nil)
                ?? String(data: nameData, encoding: .utf8) ?? String(decoding: nameData, as: UTF8.self)
            // ZIP64 extra field carries the sizes that did not fit.
            var e = nameStart + nameLength
            let extraEnd = e + extraLength
            while e + 4 <= extraEnd {
                let id = u16(e), size = Int(u16(e + 2))
                if id == 0x0001 {
                    var f = e + 4
                    if uncompressed == 0xFFFF_FFFF, f + 8 <= extraEnd { uncompressed = Int(u64(f)); f += 8 }
                    if compressed == 0xFFFF_FFFF, f + 8 <= extraEnd { compressed = Int(u64(f)); f += 8 }
                    if offset == 0xFFFF_FFFF, f + 8 <= extraEnd { offset = Int(u64(f)); f += 8 }
                }
                e += 4 + size
            }
            list.append(Entry(name: name, method: method, compressedSize: compressed, uncompressedSize: uncompressed, crc: crc, localHeaderOffset: offset))
            p = extraEnd + commentLength
        }
        entries = list
        for (i, entry) in list.enumerated() { byName[entry.name] = i }
    }
}

/// Writes ZIP archives with stored (uncompressed) entries, which is what EPUB needs for `mimetype` and is good
/// enough for converted books.
public struct ZipWriter {
    private struct File { let name: Data; let bytes: Data; let crc: UInt32; let utf8: Bool }
    private var files: [File] = []

    public init() {}

    public mutating func add(_ name: String, _ bytes: Data) {
        files.append(File(name: Data(name.utf8), bytes: bytes, crc: CRC32.checksum(bytes), utf8: name.unicodeScalars.contains { $0.value > 0x7E }))
    }

    public mutating func add(_ name: String, _ text: String) {
        add(name, Data(text.utf8))
    }

    public func finish() -> Data {
        var out = Data()
        var central = Data()
        let (time, date) = ZipWriter.dosDateTime(Date())
        for f in files {
            let flags: UInt16 = f.utf8 ? 0x800 : 0
            let offset = UInt32(out.count)
            out.append(le32(0x0403_4B50)); out.append(le16(20)); out.append(le16(flags)); out.append(le16(0))
            out.append(le16(time)); out.append(le16(date)); out.append(le32(f.crc))
            out.append(le32(UInt32(f.bytes.count))); out.append(le32(UInt32(f.bytes.count)))
            out.append(le16(UInt16(f.name.count))); out.append(le16(0))
            out.append(f.name); out.append(f.bytes)
            central.append(le32(0x0201_4B50)); central.append(le16(20)); central.append(le16(20)); central.append(le16(flags)); central.append(le16(0))
            central.append(le16(time)); central.append(le16(date)); central.append(le32(f.crc))
            central.append(le32(UInt32(f.bytes.count))); central.append(le32(UInt32(f.bytes.count)))
            central.append(le16(UInt16(f.name.count))); central.append(le16(0)); central.append(le16(0))
            central.append(le16(0)); central.append(le16(0)); central.append(le32(0)); central.append(le32(offset))
            central.append(f.name)
        }
        let directoryOffset = UInt32(out.count)
        out.append(central)
        out.append(le32(0x0605_4B50)); out.append(le16(0)); out.append(le16(0))
        out.append(le16(UInt16(files.count))); out.append(le16(UInt16(files.count)))
        out.append(le32(UInt32(central.count))); out.append(le32(directoryOffset)); out.append(le16(0))
        return out
    }

    private func le16(_ v: UInt16) -> Data { Data([UInt8(v & 0xFF), UInt8(v >> 8)]) }
    private func le32(_ v: UInt32) -> Data { Data([UInt8(v & 0xFF), UInt8((v >> 8) & 0xFF), UInt8((v >> 16) & 0xFF), UInt8(v >> 24)]) }

    private static func dosDateTime(_ date: Date) -> (UInt16, UInt16) {
        let c = Calendar(identifier: .gregorian).dateComponents(in: TimeZone.current, from: date)
        let year = max(1980, c.year ?? 1980)
        let time = UInt16(((c.hour ?? 0) << 11) | ((c.minute ?? 0) << 5) | ((c.second ?? 0) / 2))
        let day = UInt16(((year - 1980) << 9) | ((c.month ?? 1) << 5) | (c.day ?? 1))
        return (time, day)
    }
}
