import XCTest
@testable import WinnowCore

final class SweeperTests: XCTestCase {
    var box: TestSandbox!

    override func setUpWithError() throws {
        box = try TestSandbox()
        try box.file(".DS_Store", "12345")
        try box.file("A/._x", "1")
        try box.file(".Trashes/501/a", "1234")
    }

    override func tearDown() {
        box.destroy()
    }

    private func items() throws -> [JunkItem] {
        let opts = ScanOptions(rules: RuleSettings().activeRules, safety: SafetyPolicy(volumeRoots: [box.path]))
        return try JunkScanner(options: opts).scan(root: box.path)
    }

    func testDryRunKeepsEverything() throws {
        let sweeper = Sweeper(options: SweepOptions(dryRun: true), safety: SafetyPolicy(volumeRoots: [box.path]))
        let result = sweeper.remove(try items(), within: [box.path])
        XCTAssertEqual(result.removedCount, 3)
        XCTAssertTrue(result.dryRun)
        XCTAssertTrue(box.exists(".DS_Store"))
        XCTAssertTrue(box.exists(".Trashes/501/a"))
    }

    func testRemovesItemsAndCountsBytes() throws {
        let sweeper = Sweeper(options: SweepOptions(mode: .permanent), safety: SafetyPolicy(volumeRoots: [box.path]))
        let result = sweeper.remove(try items(), within: [box.path])
        XCTAssertEqual(result.removedCount, 3)
        XCTAssertEqual(result.bytesFreed, 10)
        XCTAssertTrue(result.failed.isEmpty)
        XCTAssertFalse(box.exists(".DS_Store"))
        XCTAssertFalse(box.exists(".Trashes"))
        XCTAssertTrue(box.exists("A"))
    }

    func testSkipsPathsOutsideRootsAndProtectedLocations() throws {
        let outside = JunkItem(path: "/System/Library/.DS_Store", name: ".DS_Store", ruleID: "ds_store", ruleName: ".DS_Store",
                               isDirectory: false, size: 1, modified: Date())
        let sweeper = Sweeper(options: SweepOptions(), safety: SafetyPolicy(volumeRoots: [box.path]))
        let result = sweeper.remove(try items() + [outside], within: [box.path + "/A"])
        XCTAssertEqual(result.removedCount, 1)
        XCTAssertEqual(result.skipped.count, 3)
        XCTAssertTrue(box.exists(".DS_Store"))
        XCTAssertFalse(box.exists("A/._x"))
    }

    func testSafetyPolicyVerdicts() {
        let policy = SafetyPolicy(volumeRoots: ["/Volumes/USB"])
        XCTAssertEqual(policy.validate(path: "/"), .denied("Refusing to delete the root directory"))
        XCTAssertEqual(policy.validate(path: "/Volumes/USB"), .denied("Path is a mount point"))
        XCTAssertFalse(policy.validate(path: "/System/.DS_Store").isAllowed)
        XCTAssertFalse(policy.validate(path: "/Volumes/USB/.metadata_never_index").isAllowed)
        XCTAssertFalse(policy.validate(path: "relative/.DS_Store").isAllowed)
        XCTAssertTrue(policy.validate(path: "/Volumes/USB/.DS_Store").isAllowed)
        XCTAssertTrue(policy.isAtVolumeRoot("/Volumes/USB/.Trashes"))
        XCTAssertFalse(policy.isAtVolumeRoot("/Volumes/USB/a/.Trashes"))
    }
}
