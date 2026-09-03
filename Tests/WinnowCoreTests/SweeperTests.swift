import XCTest
@testable import WinnowCore

final class SweeperTests: XCTestCase {
    var box: TestSandbox!

    override func setUpWithError() throws {
        box = try TestSandbox()
        try box.file(".DS_Store", "12345")
        try box.file("A/.DS_Store", "1")
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
        XCTAssertFalse(box.exists("A/.DS_Store"))
    }

    func testSafetyPolicyVerdicts() {
        let policy = SafetyPolicy(volumeRoots: ["/Volumes/USB"])
        XCTAssertEqual(policy.validate(path: "/"), .denied("Refusing to delete the root directory"))
        XCTAssertEqual(policy.validate(path: "/Volumes/USB"), .denied("Path is a mount point"))
        XCTAssertFalse(policy.validate(path: "/System/.DS_Store").isAllowed)
        XCTAssertTrue(policy.validate(path: NSHomeDirectory() + "/Library/Caches/.DS_Store").isAllowed)
        XCTAssertFalse(policy.validate(path: "/Volumes/USB/.metadata_never_index").isAllowed)
        XCTAssertFalse(policy.validate(path: "relative/.DS_Store").isAllowed)
        XCTAssertTrue(policy.validate(path: "/Volumes/USB/.DS_Store").isAllowed)
        XCTAssertTrue(policy.isAtVolumeRoot("/Volumes/USB/.Trashes"))
        XCTAssertFalse(policy.isAtVolumeRoot("/Volumes/USB/a/.Trashes"))
    }
}

final class PermissionFailureTests: XCTestCase {
    func testPermissionErrorsAreClassified() {
        let posix = NSError(domain: NSPOSIXErrorDomain, code: Int(EACCES))
        XCTAssertTrue(FailureClassifier.isPermissionError(posix))
        let wrapped = NSError(domain: NSCocoaErrorDomain, code: CocoaError.Code.fileWriteUnknown.rawValue,
                              userInfo: [NSUnderlyingErrorKey: NSError(domain: NSPOSIXErrorDomain, code: Int(EPERM))])
        XCTAssertTrue(FailureClassifier.isPermissionError(wrapped))
        let missing = NSError(domain: NSCocoaErrorDomain, code: CocoaError.Code.fileNoSuchFile.rawValue)
        XCTAssertFalse(FailureClassifier.isPermissionError(missing))
    }

    func testUndeletableItemIsFlaggedAsLocked() throws {
        try XCTSkipIf(getuid() == 0, "root can delete anything")
        let box = try TestSandbox()
        defer {
            chmod(box.path + "/Locked", 0o700)
            box.destroy()
        }
        try box.file("Locked/.DS_Store")
        XCTAssertEqual(chmod(box.path + "/Locked", 0o500), 0)
        let safety = SafetyPolicy(volumeRoots: [box.path])
        let items = try JunkScanner(options: ScanOptions(rules: RuleSettings().activeRules, safety: safety)).scan(root: box.path)
        XCTAssertEqual(items.map(\.name), [".DS_Store"])
        let result = Sweeper(options: SweepOptions(), safety: safety).remove(items, within: [box.path])
        XCTAssertEqual(result.failed.count, 1)
        XCTAssertTrue(result.failed[0].needsPrivileges)
        XCTAssertEqual(result.lockedItems.count, 1)
    }
}
