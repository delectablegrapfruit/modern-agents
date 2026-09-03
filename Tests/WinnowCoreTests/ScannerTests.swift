import XCTest
@testable import WinnowCore

final class ScannerTests: XCTestCase {
    var box: TestSandbox!

    override func setUpWithError() throws {
        box = try TestSandbox()
        try box.file(".DS_Store")
        try box.file("Photos/.DS_Store")
        try box.file("Photos/IMG_1.jpg", "real")
        try box.file(".Spotlight-V100/Store/index", "spotlight")
        try box.file("Photos/.Spotlight-V100/nested")
        try box.file(".Trashes/501/old.txt", "trash")
        try box.file("Keep/.DS_Store")
        try box.file("Tool.app/Contents/.DS_Store")
        try box.file("Archive/__MACOSX/._readme")
        try box.file("Docs/report.pdf", "pdf")
        try box.file(".metadata_never_index", "")
    }

    override func tearDown() {
        box.destroy()
    }

    private func options(volumeRoot: Bool = true, exclusions: [String] = [], skipPackages: Bool = true, recursive: Bool = true) -> ScanOptions {
        ScanOptions(rules: RuleSettings().activeRules,
                    exclusions: ExclusionMatcher(exclusions),
                    safety: SafetyPolicy(volumeRoots: volumeRoot ? [box.path] : []),
                    skipPackages: skipPackages, recursive: recursive)
    }

    func testFindsJunkAndRespectsScope() throws {
        let items = try JunkScanner(options: options()).scan(root: box.path)
        XCTAssertEqual(relativePaths(items, from: box.path), [
            ".DS_Store", "Photos/.DS_Store", ".Spotlight-V100", ".Trashes",
            "Keep/.DS_Store", "Archive/__MACOSX",
        ])
        let spotlight = items.first { $0.name == ".Spotlight-V100" }!
        XCTAssertTrue(spotlight.isDirectory)
        XCTAssertEqual(spotlight.size, 9)
        XCTAssertEqual(items.first { $0.name == "IMG_1.jpg" }, nil)
    }

    func testVolumeRootRulesIgnoredWhenRootIsNotAMountPoint() throws {
        let items = try JunkScanner(options: options(volumeRoot: false)).scan(root: box.path)
        let names = Set(items.map(\.name))
        XCTAssertFalse(names.contains(".Spotlight-V100"))
        XCTAssertFalse(names.contains(".Trashes"))
        XCTAssertTrue(names.contains(".DS_Store"))
    }

    func testExclusionsAndPackages() throws {
        let excluded = try JunkScanner(options: options(exclusions: [box.path + "/Keep"])).scan(root: box.path)
        XCTAssertFalse(relativePaths(excluded, from: box.path).contains("Keep/.DS_Store"))

        let intoPackages = try JunkScanner(options: options(skipPackages: false)).scan(root: box.path)
        XCTAssertTrue(relativePaths(intoPackages, from: box.path).contains("Tool.app/Contents/.DS_Store"))
    }

    func testShallowScan() throws {
        let items = try JunkScanner(options: options(recursive: false)).scan(root: box.path)
        XCTAssertEqual(relativePaths(items, from: box.path), [".DS_Store", ".Spotlight-V100", ".Trashes"])
    }

    func testDoesNotDescendIntoOtherMountPoints() throws {
        try box.file("Mount/.DS_Store")
        let safety = SafetyPolicy(volumeRoots: [box.path, box.path + "/Mount"])
        let opts = ScanOptions(rules: RuleSettings().activeRules, safety: safety)
        let items = try JunkScanner(options: opts).scan(root: box.path)
        XCTAssertFalse(relativePaths(items, from: box.path).contains("Mount/.DS_Store"))
    }

    func testRejectsNonDirectories() {
        XCTAssertThrowsError(try JunkScanner(options: options()).scan(root: box.path + "/Docs/report.pdf"))
    }

    func testCancellation() {
        XCTAssertThrowsError(try JunkScanner(options: options()).scan(root: box.path, isCancelled: { true })) { error in
            XCTAssertEqual(error as? ScanError, .cancelled)
        }
    }
}
