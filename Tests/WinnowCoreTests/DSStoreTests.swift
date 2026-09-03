import XCTest
@testable import WinnowCore

final class DSStoreTests: XCTestCase {
    private func sample() -> [DSStoreRecord] {
        [
            DSStoreRecord(filename: ".", structID: "vstl", value: .type("icnv")),
            DSStoreRecord(filename: ".", structID: "vSrn", value: .long(1)),
            DSStoreRecord(filename: ".", structID: "icvp", value: .blob(Data([0x62, 0x70, 0x6C, 0x69, 0x73, 0x74]))),
            DSStoreRecord(filename: "photo.jpg", structID: "Iloc", value: .blob(Data(repeating: 0, count: 16))),
            DSStoreRecord(filename: "Zed", structID: "bool", value: .bool(true)),
            DSStoreRecord(filename: "apple", structID: "shor", value: .shor(7)),
            DSStoreRecord(filename: "ünïcode", structID: "ustr", value: .ustr("héllo")),
            DSStoreRecord(filename: "when", structID: "moDD", value: .dutc(123_456_789)),
            DSStoreRecord(filename: "big", structID: "comp", value: .comp(1 << 40)),
        ]
    }

    func testRoundTripSmall() throws {
        let data = try DSStoreFile(records: sample()).encoded()
        XCTAssertEqual(data.prefix(8), Data([0, 0, 0, 1]) + Data("Bud1".utf8))
        XCTAssertEqual(data.count % 4, 0)
        let back = try DSStoreFile.read(data)
        XCTAssertEqual(Set(back.records), Set(sample()))
        XCTAssertEqual(back.records.map(\.filename), back.records.map(\.filename).sorted { $0.lowercased() < $1.lowercased() })
    }

    func testRoundTripManyRecordsSpansSeveralNodes() throws {
        var records: [DSStoreRecord] = []
        for i in 0..<1500 {
            records.append(DSStoreRecord(filename: String(format: "file-%05d.txt", i), structID: "Iloc",
                                         value: .blob(Data(repeating: UInt8(i & 0xFF), count: 16))))
        }
        let data = try DSStoreFile(records: records).encoded()
        let back = try DSStoreFile.read(data)
        XCTAssertEqual(back.records.count, 1500)
        XCTAssertEqual(Set(back.records), Set(records))
        XCTAssertEqual(back.records.map(\.filename), records.map(\.filename))
    }

    func testEmptyFile() throws {
        let data = try DSStoreFile().encoded()
        XCTAssertTrue(try DSStoreFile.read(data).records.isEmpty)
    }

    func testRejectsGarbage() {
        XCTAssertThrowsError(try DSStoreFile.read(Data("not a store at all, really".utf8)))
        XCTAssertThrowsError(try DSStoreFile.read(Data()))
    }

    func testBuddyAllocatorKeepsBlocksDisjointAndFreeListsConsistent() {
        var allocator = BuddyAllocator()
        let sizes = [32, 2048, 32, 4096, 4096, 100, 4096]
        for size in sizes { _ = allocator.allocate(size) }
        var used: [(Int, Int)] = []
        for i in 0..<sizes.count {
            let start = allocator.offsets[i]
            let end = start + allocator.sizes[i]
            for (s, e) in used { XCTAssertTrue(end <= s || start >= e, "blocks overlap") }
            used.append((start, end))
            XCTAssertEqual(start % allocator.sizes[i], 0, "buddy blocks are size-aligned")
        }
        var total = 0
        for (k, list) in allocator.free {
            for offset in list {
                XCTAssertEqual(offset % (1 << k), 0)
                for (s, e) in used { XCTAssertTrue(offset + (1 << k) <= s || offset >= e, "free block overlaps allocation") }
                total += 1 << k
            }
        }
        XCTAssertEqual(total + allocator.sizes.reduce(0, +), 1 << 31)
    }
}
