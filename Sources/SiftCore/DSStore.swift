import Foundation

// `.DS_Store`: a "Bud1" buddy-allocated file holding one B-tree of
// (filename, structure id, value) records, as documented by Wim Lewis and
// implemented by the `ds_store` Python package, which CI checks this against.

public enum DSStoreError: Error, LocalizedError, Equatable {
    case notAStore
    case corrupt(String)
    case tooLarge

    public var errorDescription: String? {
        switch self {
        case .notAStore: return "Not a .DS_Store file"
        case .corrupt(let what): return ".DS_Store is damaged (\(what))"
        case .tooLarge: return "Too many records for one .DS_Store"
        }
    }
}

public struct DSRecord: Hashable {
    public enum Value: Hashable {
        case long(UInt32)
        case shor(UInt16)
        case bool(Bool)
        case blob(Data)
        case type(String)
        case ustr(String)
        case comp(UInt64)
        case dutc(UInt64)

        var code: String {
            switch self {
            case .long: return "long"
            case .shor: return "shor"
            case .bool: return "bool"
            case .blob: return "blob"
            case .type: return "type"
            case .ustr: return "ustr"
            case .comp: return "comp"
            case .dutc: return "dutc"
            }
        }
    }

    public var filename: String
    public var structID: String
    public var value: Value

    public init(filename: String, structID: String, value: Value) {
        precondition(structID.utf8.count == 4, "structure ids are four ASCII bytes")
        self.filename = filename
        self.structID = structID
        self.value = value
    }

    /// Finder orders records by case-insensitive filename, then structure id.
    static func ordered(_ a: DSRecord, _ b: DSRecord) -> Bool {
        let fa = a.filename.lowercased(), fb = b.filename.lowercased()
        return fa != fb ? fa < fb : a.structID < b.structID
    }

    /// Two record sets meaning the same thing, whatever their order or blob encoding.
    public static func equivalent(_ a: [DSRecord], _ b: [DSRecord]) -> Bool {
        guard a.count == b.count else { return false }
        for (x, y) in zip(a.sorted(by: ordered), b.sorted(by: ordered)) {
            guard x.filename == y.filename, x.structID == y.structID else { return false }
            if x.value == y.value { continue }
            guard case .blob(let dx) = x.value, case .blob(let dy) = y.value,
                  let px = try? PropertyListSerialization.propertyList(from: dx, options: [], format: nil),
                  let py = try? PropertyListSerialization.propertyList(from: dy, options: [], format: nil),
                  Plist.canonical(px) == Plist.canonical(py) else { return false }
        }
        return true
    }
}

public enum Plist {
    public static func data(_ dictionary: [String: Any]) throws -> Data {
        do {
            return try PropertyListSerialization.data(fromPropertyList: dictionary, format: .binary, options: 0)
        } catch {
            return try PropertyListSerialization.data(fromPropertyList: dictionary, format: .xml, options: 0)
        }
    }

    /// Order- and number-type-independent rendering, so decoded copies compare equal on every platform.
    static func canonical(_ value: Any) -> String {
        if let b = value as? Bool { return "n:\(b ? 1.0 : 0.0)" }
        if let d = plistDouble(value) { return "n:\(d)" }
        if let s = value as? String { return "s:" + s }
        if let data = value as? Data { return "d:" + data.map { String(format: "%02x", $0) }.joined() }
        if let dict = value as? [String: Any] {
            return "{" + dict.keys.sorted().map { "\($0)=" + canonical(dict[$0]!) }.joined(separator: ",") + "}"
        }
        if let array = value as? [Any] { return "[" + array.map(canonical).joined(separator: ",") + "]" }
        return "?:" + String(describing: value)
    }
}

public struct DSStore: Hashable {
    public var records: [DSRecord]

    public init(records: [DSRecord] = []) { self.records = records }

    static let pageSize = 4096

    // MARK: Reading

    public static func read(_ data: Data) throws -> DSStore {
        var r = Reader(data)
        guard data.count >= 36, try r.u32() == 1, try r.bytes(4) == Data("Bud1".utf8) else { throw DSStoreError.notAStore }
        let rootOffset = Int(try r.u32())
        let rootSize = Int(try r.u32())
        guard rootOffset + 4 + rootSize <= data.count else { throw DSStoreError.corrupt("root block") }

        var root = Reader(data, at: rootOffset + 4)
        let blockCount = Int(try root.u32())
        _ = try root.u32()
        var addresses: [UInt32] = []
        for _ in 0..<blockCount { addresses.append(try root.u32()) }
        root.position += ((blockCount + 255) / 256 * 256 - blockCount) * 4
        var toc: [String: Int] = [:]
        for _ in 0..<Int(try root.u32()) {
            let name = String(decoding: try root.bytes(Int(try root.u8())), as: UTF8.self)
            toc[name] = Int(try root.u32())
        }
        guard let dsdb = toc["DSDB"] else { throw DSStoreError.corrupt("no DSDB") }

        func block(_ id: Int) throws -> Reader {
            guard id < addresses.count else { throw DSStoreError.corrupt("block \(id)") }
            let entry = Int(addresses[id])
            let offset = (entry & ~0x1F) + 4
            let size = 1 << (entry & 0x1F)
            guard offset + size <= data.count else { throw DSStoreError.corrupt("block \(id) bounds") }
            return Reader(data, at: offset, limit: offset + size)
        }

        var info = try block(dsdb)
        var records: [DSRecord] = []
        var visited = Set<Int>()
        func walk(_ node: Int) throws {
            guard visited.insert(node).inserted else { throw DSStoreError.corrupt("cycle") }
            var n = try block(node)
            let rightmost = Int(try n.u32())
            let count = Int(try n.u32())
            for _ in 0..<count {
                if rightmost != 0 { try walk(Int(try n.u32())) }
                records.append(try record(&n))
            }
            if rightmost != 0 { try walk(rightmost) }
        }
        try walk(Int(try info.u32()))
        return DSStore(records: records)
    }

    private static func record(_ r: inout Reader) throws -> DSRecord {
        let filename = String(utf16BigEndian: try r.bytes(Int(try r.u32()) * 2))
        let structID = String(decoding: try r.bytes(4), as: UTF8.self)
        let value: DSRecord.Value
        switch String(decoding: try r.bytes(4), as: UTF8.self) {
        case "long": value = .long(try r.u32())
        case "shor": _ = try r.u16(); value = .shor(try r.u16())
        case "bool": value = .bool(try r.u8() != 0)
        case "blob": value = .blob(try r.bytes(Int(try r.u32())))
        case "type": value = .type(String(decoding: try r.bytes(4), as: UTF8.self))
        case "ustr": value = .ustr(String(utf16BigEndian: try r.bytes(Int(try r.u32()) * 2)))
        case "comp": value = .comp(try r.u64())
        case "dutc": value = .dutc(try r.u64())
        case let other: throw DSStoreError.corrupt("record type \(other)")
        }
        return DSRecord(filename: filename, structID: structID, value: value)
    }

    // MARK: Writing

    /// Deterministic: the same records always give the same bytes.
    public func encoded() throws -> Data {
        let sorted = records.sorted(by: DSRecord.ordered)
        let encoded = sorted.map(DSStore.encode)
        let capacity = DSStore.pageSize - 8

        // Leaves in order; the record between two leaves moves up into the root node.
        var leaves: [[Data]] = []
        var separators: [Data] = []
        var current: [Data] = []
        var size = 0
        for record in encoded {
            guard record.count <= capacity else { throw DSStoreError.tooLarge }
            if !current.isEmpty && size + record.count > capacity {
                leaves.append(current)
                separators.append(record)
                current = []
                size = 0
                continue
            }
            current.append(record)
            size += record.count
        }
        if current.isEmpty, let last = separators.popLast() { current = [last] }
        leaves.append(current)

        var buddy = Buddy()
        _ = buddy.allocate(32)                                        // 0: the header
        let nodeCount = leaves.count + (leaves.count > 1 ? 1 : 0)
        let blockTotal = 3 + nodeCount
        let rootSize = DSStore.rootBlockSize(blocks: blockTotal)
        let rootBlock = buddy.allocate(rootSize)                      // 1: block table, TOC, free lists
        _ = buddy.allocate(32)                                        // 2: DSDB info
        var nodeBlocks: [Int] = []
        for _ in 0..<nodeCount { nodeBlocks.append(buddy.allocate(DSStore.pageSize)) }

        var nodes: [Data] = []
        for leaf in leaves {
            var d = Data()
            d.u32(0)
            d.u32(UInt32(leaf.count))
            leaf.forEach { d.append($0) }
            nodes.append(d)
        }
        var rootNode = 3
        if leaves.count > 1 {
            var d = Data()
            d.u32(UInt32(3 + leaves.count - 1))
            d.u32(UInt32(separators.count))
            for (index, separator) in separators.enumerated() {
                d.u32(UInt32(3 + index))
                d.append(separator)
            }
            guard d.count <= DSStore.pageSize else { throw DSStoreError.tooLarge }
            nodes.append(d)
            rootNode = 3 + leaves.count
        }

        var out = Data(count: buddy.highWaterMark + 4)
        func put(_ offset: Int, _ d: Data) { out.replaceSubrange((offset + 4)..<(offset + 4 + d.count), with: d) }

        var header = Data()
        header.u32(1)
        header.append(Data("Bud1".utf8))
        header.u32(UInt32(buddy.offsets[rootBlock]))
        header.u32(UInt32(rootSize))
        header.u32(UInt32(buddy.offsets[rootBlock]))
        out.replaceSubrange(0..<header.count, with: header)

        var root = Data()
        root.u32(UInt32(blockTotal))
        root.u32(0)
        for id in 0..<blockTotal { root.u32(buddy.address(of: id)) }
        for _ in blockTotal..<((blockTotal + 255) / 256 * 256) { root.u32(0) }
        root.u32(1)
        root.append(4)
        root.append(Data("DSDB".utf8))
        root.u32(2)
        for k in 0..<32 {
            let list = buddy.free[k] ?? []
            root.u32(UInt32(list.count))
            list.forEach { root.u32(UInt32($0)) }
        }
        guard root.count <= rootSize else { throw DSStoreError.tooLarge }
        put(buddy.offsets[rootBlock], root)

        var info = Data()
        info.u32(UInt32(rootNode))
        info.u32(leaves.count > 1 ? 2 : 1)
        info.u32(UInt32(sorted.count))
        info.u32(UInt32(nodeCount))
        info.u32(UInt32(DSStore.pageSize))
        put(buddy.offsets[2], info)

        for (index, node) in nodes.enumerated() { put(buddy.offsets[nodeBlocks[index]], node) }
        return out
    }

    static func rootBlockSize(blocks: Int) -> Int {
        let padded = (blocks + 255) / 256 * 256
        let needed = 8 + padded * 4 + 13 + 32 * 4 + 64 * 4
        var size = 2048
        while size < needed { size *= 2 }
        return size
    }

    static func encode(_ record: DSRecord) -> Data {
        var d = Data()
        let name = Array(record.filename.utf16)
        d.u32(UInt32(name.count))
        name.forEach { d.u16($0) }
        d.append(Data(record.structID.utf8))
        d.append(Data(record.value.code.utf8))
        switch record.value {
        case .long(let v): d.u32(v)
        case .shor(let v): d.u16(0); d.u16(v)
        case .bool(let v): d.append(v ? 1 : 0)
        case .blob(let v): d.u32(UInt32(v.count)); d.append(v)
        case .type(let v):
            var code = Data(v.utf8.prefix(4))
            while code.count < 4 { code.append(0x20) }
            d.append(code)
        case .ustr(let v):
            let units = Array(v.utf16)
            d.u32(UInt32(units.count))
            units.forEach { d.u16($0) }
        case .comp(let v), .dutc(let v): d.u64(v)
        }
        return d
    }
}

/// Buddy allocator over a 2^31 byte space, the way Finder lays the file out.
/// Offsets are relative to the 4-byte alignment prefix.
struct Buddy {
    private(set) var offsets: [Int] = []
    private(set) var sizes: [Int] = []
    private(set) var free: [Int: [Int]] = [31: [0]]
    private(set) var highWaterMark = 0

    mutating func allocate(_ size: Int) -> Int {
        var k = 5
        while (1 << k) < size { k += 1 }
        var j = k
        while j < 32 && (free[j] ?? []).isEmpty { j += 1 }
        precondition(j < 32, "buddy space exhausted")
        let offset = free[j]!.removeFirst()
        while j > k {
            j -= 1
            free[j, default: []].append(offset + (1 << j))
            free[j]!.sort()
        }
        offsets.append(offset)
        sizes.append(1 << k)
        highWaterMark = max(highWaterMark, offset + (1 << k))
        return offsets.count - 1
    }

    func address(of block: Int) -> UInt32 {
        var k = 0
        while (1 << k) < sizes[block] { k += 1 }
        return UInt32(offsets[block] | k)
    }
}

struct Reader {
    let data: Data
    var position: Int
    let limit: Int

    init(_ data: Data, at position: Int = 0, limit: Int? = nil) {
        self.data = data
        self.position = position
        self.limit = limit ?? data.count
    }

    mutating func bytes(_ count: Int) throws -> Data {
        guard count >= 0, position + count <= limit else { throw DSStoreError.corrupt("truncated") }
        let start = data.startIndex + position
        position += count
        return data.subdata(in: start..<(start + count))
    }

    mutating func u8() throws -> UInt8 { try bytes(1)[0] }
    mutating func u16() throws -> UInt16 { try bytes(2).reduce(0) { $0 << 8 | UInt16($1) } }
    mutating func u32() throws -> UInt32 { try bytes(4).reduce(0) { $0 << 8 | UInt32($1) } }
    mutating func u64() throws -> UInt64 { try bytes(8).reduce(0) { $0 << 8 | UInt64($1) } }
}

extension Data {
    mutating func u16(_ v: UInt16) { append(contentsOf: [UInt8(v >> 8), UInt8(v & 0xFF)]) }
    mutating func u32(_ v: UInt32) { for shift in stride(from: 24, through: 0, by: -8) { append(UInt8((v >> UInt32(shift)) & 0xFF)) } }
    mutating func u64(_ v: UInt64) { for shift in stride(from: 56, through: 0, by: -8) { append(UInt8((v >> UInt64(shift)) & 0xFF)) } }
}

extension String {
    init(utf16BigEndian data: Data) {
        var units: [UInt16] = []
        units.reserveCapacity(data.count / 2)
        var it = data.makeIterator()
        while let hi = it.next(), let lo = it.next() { units.append(UInt16(hi) << 8 | UInt16(lo)) }
        self = String(decoding: units, as: UTF16.self)
    }
}
