import Foundation

// Finder stores per-folder view settings in `.DS_Store`: a "Bud1" buddy-allocated
// file holding one B-tree of (filename, structure id, value) records. Format as
// documented by Wim Lewis and implemented by the `ds_store` Python package.

public enum DSStoreError: Error, LocalizedError, Equatable {
    case notADSStore
    case corrupt(String)
    case tooManyRecords

    public var errorDescription: String? {
        switch self {
        case .notADSStore: return "Not a .DS_Store file"
        case .corrupt(let what): return ".DS_Store is damaged (\(what))"
        case .tooManyRecords: return "Too many records for a two-level .DS_Store"
        }
    }
}

public struct DSStoreRecord: Hashable {
    public enum Value: Hashable {
        case long(UInt32)
        case shor(UInt16)
        case bool(Bool)
        case blob(Data)
        case type(String)
        case ustr(String)
        case comp(UInt64)
        case dutc(UInt64)

        public var typeCode: String {
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

    /// Finder keeps records ordered by case-insensitive filename, then structure id.
    static func ordered(_ a: DSStoreRecord, _ b: DSStoreRecord) -> Bool {
        let fa = a.filename.lowercased(), fb = b.filename.lowercased()
        if fa != fb { return fa < fb }
        return a.structID < b.structID
    }
}

/// Whole-file model: parse with `read`, edit `records`, serialise with `encoded()`.
public struct DSStoreFile: Hashable {
    public var records: [DSStoreRecord]

    public init(records: [DSStoreRecord] = []) {
        self.records = records
    }

    static let pageSize = 4096
    static let headerSize = 32

    // MARK: Reading

    public static func read(_ data: Data) throws -> DSStoreFile {
        var reader = ByteReader(data)
        guard data.count >= 36, try reader.u32() == 1, try reader.bytes(4) == Data("Bud1".utf8) else {
            throw DSStoreError.notADSStore
        }
        let rootOffset = Int(try reader.u32())
        let rootSize = Int(try reader.u32())
        guard rootOffset + 4 + rootSize <= data.count else { throw DSStoreError.corrupt("root block") }

        var root = ByteReader(data, position: rootOffset + 4)
        let blockCount = Int(try root.u32())
        _ = try root.u32()
        var addresses: [UInt32] = []
        for _ in 0..<blockCount { addresses.append(try root.u32()) }
        let padded = (blockCount + 255) / 256 * 256
        root.position += (padded - blockCount) * 4
        let tocCount = Int(try root.u32())
        var toc: [String: Int] = [:]
        for _ in 0..<tocCount {
            let length = Int(try root.u8())
            let name = String(decoding: try root.bytes(length), as: UTF8.self)
            toc[name] = Int(try root.u32())
        }
        guard let dsdbBlock = toc["DSDB"] else { throw DSStoreError.corrupt("no DSDB") }

        func block(_ id: Int) throws -> ByteReader {
            guard id < addresses.count else { throw DSStoreError.corrupt("block id \(id)") }
            let entry = Int(addresses[id])
            let offset = (entry & ~0x1F) + 4
            let size = 1 << (entry & 0x1F)
            guard offset + size <= data.count else { throw DSStoreError.corrupt("block \(id) bounds") }
            return ByteReader(data, position: offset, limit: offset + size)
        }

        var info = try block(dsdbBlock)
        let rootNode = Int(try info.u32())
        var records: [DSStoreRecord] = []
        var visited = Set<Int>()

        func walk(_ node: Int) throws {
            guard visited.insert(node).inserted else { throw DSStoreError.corrupt("node cycle") }
            var r = try block(node)
            let next = Int(try r.u32())
            let count = Int(try r.u32())
            if next != 0 {
                for _ in 0..<count {
                    let child = Int(try r.u32())
                    try walk(child)
                    records.append(try readRecord(&r))
                }
                try walk(next)
            } else {
                for _ in 0..<count { records.append(try readRecord(&r)) }
            }
        }
        try walk(rootNode)
        return DSStoreFile(records: records)
    }

    private static func readRecord(_ r: inout ByteReader) throws -> DSStoreRecord {
        let nameLength = Int(try r.u32())
        let nameData = try r.bytes(nameLength * 2)
        let filename = String(utf16BigEndian: nameData)
        let structID = String(decoding: try r.bytes(4), as: UTF8.self)
        let type = String(decoding: try r.bytes(4), as: UTF8.self)
        let value: DSStoreRecord.Value
        switch type {
        case "long": value = .long(try r.u32())
        case "shor": _ = try r.u16(); value = .shor(try r.u16())
        case "bool": value = .bool(try r.u8() != 0)
        case "blob": value = .blob(try r.bytes(Int(try r.u32())))
        case "type": value = .type(String(decoding: try r.bytes(4), as: UTF8.self))
        case "ustr": value = .ustr(String(utf16BigEndian: try r.bytes(Int(try r.u32()) * 2)))
        case "comp": value = .comp(try r.u64())
        case "dutc": value = .dutc(try r.u64())
        default: throw DSStoreError.corrupt("record type \(type)")
        }
        return DSStoreRecord(filename: filename, structID: structID, value: value)
    }

    // MARK: Writing

    public func encoded() throws -> Data {
        let sorted = records.sorted(by: DSStoreRecord.ordered)
        let encodedRecords = sorted.map(DSStoreFile.encode)
        let capacity = DSStoreFile.pageSize - 8

        // Pack into leaves; the record between two leaves moves up into the root node.
        var leaves: [[Data]] = []
        var separators: [Data] = []
        var current: [Data] = []
        var currentSize = 0
        for record in encodedRecords {
            if !current.isEmpty && currentSize + record.count > capacity {
                leaves.append(current)
                separators.append(record)
                current = []
                currentSize = 0
                continue
            }
            guard record.count <= capacity else { throw DSStoreError.tooManyRecords }
            current.append(record)
            currentSize += record.count
        }
        if current.isEmpty, let last = separators.popLast() { current = [last] }
        leaves.append(current)

        var allocator = BuddyAllocator()
        _ = allocator.allocate(DSStoreFile.headerSize)                  // block 0: the header itself
        let nodeCount = leaves.count + (leaves.count > 1 ? 1 : 0)
        let blockTotal = 3 + nodeCount
        let rootBlockSize = DSStoreFile.rootBlockSize(blocks: blockTotal)
        let rootBlock = allocator.allocate(rootBlockSize)               // block 1
        _ = allocator.allocate(DSStoreFile.headerSize)                  // block 2: DSDB info
        var nodeBlocks: [Int] = []
        for _ in 0..<nodeCount { nodeBlocks.append(allocator.allocate(DSStoreFile.pageSize)) }

        var nodes: [Data] = []
        for leaf in leaves {
            var d = Data()
            d.appendU32(0)
            d.appendU32(UInt32(leaf.count))
            leaf.forEach { d.append($0) }
            nodes.append(d)
        }
        var rootNodeBlock = 3
        if leaves.count > 1 {
            var d = Data()
            d.appendU32(UInt32(3 + leaves.count - 1))                    // rightmost child
            d.appendU32(UInt32(separators.count))
            for (index, separator) in separators.enumerated() {
                d.appendU32(UInt32(3 + index))
                d.append(separator)
            }
            guard d.count <= DSStoreFile.pageSize else { throw DSStoreError.tooManyRecords }
            nodes.append(d)
            rootNodeBlock = 3 + leaves.count
        }

        let fileSize = allocator.highWaterMark + 4
        var out = Data(count: fileSize)

        // Header (absolute 0): alignment word, then the 32-byte buddy header at relative 0.
        out.replaceU32(at: 0, 1)
        out.replaceSubrange(4..<8, with: Data("Bud1".utf8))
        out.replaceU32(at: 8, UInt32(allocator.offsets[rootBlock]))
        out.replaceU32(at: 12, UInt32(rootBlockSize))
        out.replaceU32(at: 16, UInt32(allocator.offsets[rootBlock]))

        // Root block: block table, TOC, free lists.
        var root = Data()
        root.appendU32(UInt32(blockTotal))
        root.appendU32(0)
        for id in 0..<blockTotal { root.appendU32(allocator.address(of: id)) }
        let padded = (blockTotal + 255) / 256 * 256
        for _ in blockTotal..<padded { root.appendU32(0) }
        root.appendU32(1)
        root.append(4)
        root.append(Data("DSDB".utf8))
        root.appendU32(2)
        for k in 0..<32 {
            let list = allocator.free[k] ?? []
            root.appendU32(UInt32(list.count))
            list.forEach { root.appendU32(UInt32($0)) }
        }
        guard root.count <= rootBlockSize else { throw DSStoreError.tooManyRecords }
        out.replaceSubrange(range(allocator.offsets[rootBlock], root.count), with: root)

        var info = Data()
        info.appendU32(UInt32(rootNodeBlock))
        info.appendU32(leaves.count > 1 ? 2 : 1)
        info.appendU32(UInt32(sorted.count))
        info.appendU32(UInt32(nodeCount))
        info.appendU32(UInt32(DSStoreFile.pageSize))
        out.replaceSubrange(range(allocator.offsets[2], info.count), with: info)

        for (index, node) in nodes.enumerated() {
            out.replaceSubrange(range(allocator.offsets[nodeBlocks[index]], node.count), with: node)
        }
        return out
    }

    private func range(_ relativeOffset: Int, _ count: Int) -> Range<Int> {
        (relativeOffset + 4)..<(relativeOffset + 4 + count)
    }

    static func rootBlockSize(blocks: Int) -> Int {
        let padded = (blocks + 255) / 256 * 256
        let needed = 8 + padded * 4 + 13 + 32 * 4 + 64 * 4
        var size = 2048
        while size < needed { size *= 2 }
        return size
    }

    static func encode(_ record: DSStoreRecord) -> Data {
        var d = Data()
        let name = Array(record.filename.utf16)
        d.appendU32(UInt32(name.count))
        name.forEach { d.appendU16($0) }
        d.append(Data(record.structID.utf8))
        d.append(Data(record.value.typeCode.utf8))
        switch record.value {
        case .long(let v): d.appendU32(v)
        case .shor(let v): d.appendU16(0); d.appendU16(v)
        case .bool(let v): d.append(v ? 1 : 0)
        case .blob(let v): d.appendU32(UInt32(v.count)); d.append(v)
        case .type(let v):
            var code = Data(v.utf8.prefix(4))
            while code.count < 4 { code.append(0x20) }
            d.append(code)
        case .ustr(let v):
            let units = Array(v.utf16)
            d.appendU32(UInt32(units.count))
            units.forEach { d.appendU16($0) }
        case .comp(let v): d.appendU64(v)
        case .dutc(let v): d.appendU64(v)
        }
        return d
    }
}

/// Buddy allocator over a 2^31 byte space, matching how Finder lays out `.DS_Store`.
/// Offsets are relative to the file's 4-byte alignment prefix.
struct BuddyAllocator {
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

    /// Block table entry: offset with log2(size) in the low five bits.
    func address(of block: Int) -> UInt32 {
        var k = 0
        while (1 << k) < sizes[block] { k += 1 }
        return UInt32(offsets[block] | k)
    }
}

// MARK: - Byte helpers

struct ByteReader {
    let data: Data
    var position: Int
    let limit: Int

    init(_ data: Data, position: Int = 0, limit: Int? = nil) {
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
    mutating func appendU16(_ v: UInt16) { append(contentsOf: [UInt8(v >> 8), UInt8(v & 0xFF)]) }
    mutating func appendU32(_ v: UInt32) { for shift in stride(from: 24, through: 0, by: -8) { append(UInt8((v >> UInt32(shift)) & 0xFF)) } }
    mutating func appendU64(_ v: UInt64) { for shift in stride(from: 56, through: 0, by: -8) { append(UInt8((v >> UInt64(shift)) & 0xFF)) } }
    mutating func replaceU32(at offset: Int, _ v: UInt32) {
        var d = Data(); d.appendU32(v)
        replaceSubrange(offset..<(offset + 4), with: d)
    }
}

extension String {
    init(utf16BigEndian data: Data) {
        var units: [UInt16] = []
        units.reserveCapacity(data.count / 2)
        var iterator = data.makeIterator()
        while let hi = iterator.next(), let lo = iterator.next() {
            units.append(UInt16(hi) << 8 | UInt16(lo))
        }
        self = String(decoding: units, as: UTF16.self)
    }
}
