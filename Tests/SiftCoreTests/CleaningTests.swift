import XCTest
@testable import SiftCore

final class JunkTests: XCTestCase {
    func testClassification() {
        XCTAssertEqual(Junk.kind(name: ".DS_Store", isDirectory: false, atVolumeRoot: false), .dsStore)
        XCTAssertEqual(Junk.kind(name: ".ds_store", isDirectory: false, atVolumeRoot: true), .dsStore)
        XCTAssertNil(Junk.kind(name: ".DS_Store", isDirectory: true, atVolumeRoot: false))
        XCTAssertNil(Junk.kind(name: ".DS_Store.bak", isDirectory: false, atVolumeRoot: false))
        XCTAssertEqual(Junk.kind(name: "._photo.jpg", isDirectory: false, atVolumeRoot: false), .appleDouble)
        XCTAssertNil(Junk.kind(name: "._", isDirectory: false, atVolumeRoot: false), "a bare prefix is not a sidecar")
        XCTAssertNil(Junk.kind(name: "._photo.jpg", isDirectory: true, atVolumeRoot: false))
        XCTAssertEqual(Junk.kind(name: ".Spotlight-V100", isDirectory: true, atVolumeRoot: true), .spotlight)
        XCTAssertNil(Junk.kind(name: ".Spotlight-V100", isDirectory: true, atVolumeRoot: false), "volume items only at the top of a volume")
        XCTAssertNil(Junk.kind(name: ".Spotlight-V100", isDirectory: false, atVolumeRoot: true))
        XCTAssertEqual(Junk.kind(name: ".Trashes", isDirectory: true, atVolumeRoot: true), .trashes)
        XCTAssertNil(Junk.kind(name: ".localized", isDirectory: false, atVolumeRoot: false), "not in the catalog")
        XCTAssertNil(Junk.kind(name: ".VolumeIcon.icns", isDirectory: false, atVolumeRoot: true), "a person chose that")
    }

    func testPrefilter() {
        XCTAssertTrue(Junk.couldMatch(name: ".DS_Store"))
        XCTAssertTrue(Junk.couldMatch(name: "._sidecar"))
        XCTAssertTrue(Junk.couldMatch(name: ".fseventsd"))
        XCTAssertFalse(Junk.couldMatch(name: "report.pdf"))
        XCTAssertFalse(Junk.couldMatch(name: "Library"))
    }

    func testQuietFSEvents() throws {
        let box = try Sandbox()
        defer { box.destroy() }
        try box.file(".fseventsd/no_log", "")
        XCTAssertTrue(Junk.isQuietFSEvents(at: box.path + "/.fseventsd"))
        try box.file(".fseventsd/0000000012345678", "")
        XCTAssertFalse(Junk.isQuietFSEvents(at: box.path + "/.fseventsd"))
    }
}

final class SafetyTests: XCTestCase {
    func testVerdicts() {
        let safety = Safety(mountPoints: ["/Volumes/USB"], keptStores: ["/Users/me/.DS_Store"])
        XCTAssertEqual(safety.validate(path: "/"), .refused("Refusing to delete the root directory"))
        XCTAssertEqual(safety.validate(path: "/Volumes/USB"), .refused("A mount point"))
        XCTAssertFalse(safety.validate(path: "/System/.DS_Store").isAllowed)
        XCTAssertFalse(safety.validate(path: NSHomeDirectory() + "/Library/Caches/.DS_Store").isAllowed)
        XCTAssertFalse(safety.validate(path: "/Volumes/USB/.metadata_never_index").isAllowed)
        XCTAssertFalse(safety.validate(path: "/Volumes/USB/.fseventsd/no_log").isAllowed)
        XCTAssertFalse(safety.validate(path: "/Users/me/.DS_Store").isAllowed, "carries a view")
        XCTAssertTrue(safety.validate(path: "/Users/me/Documents/.DS_Store").isAllowed)
        XCTAssertFalse(safety.validate(path: "relative/.DS_Store").isAllowed)
        XCTAssertFalse(safety.validate(path: "/Volumes/USB/x/.DS_Store", within: ["/Volumes/Other"]).isAllowed)
        XCTAssertTrue(safety.validate(path: "/Volumes/USB/x/.DS_Store", within: ["/Volumes/USB"]).isAllowed)
        XCTAssertTrue(safety.isMountPoint("/"))
        XCTAssertTrue(safety.isProtected("/private/tmp/x"))
    }

    func testPaths() {
        XCTAssertEqual(Paths.standardize("/a/b/"), "/a/b")
        XCTAssertEqual(Paths.join("/", "x"), "/x")
        XCTAssertEqual(Paths.parent(of: "/a/b"), "/a")
        XCTAssertTrue(Paths.isInside("/a/b", "/a"))
        XCTAssertFalse(Paths.isInside("/ab", "/a"))
        XCTAssertEqual(Paths.display("/Users/x/Pictures", home: "/Users/x"), "~/Pictures")
        XCTAssertEqual(Paths.display("/Users/x", home: "/Users/x"), "Home")
    }
}

final class ScannerTests: XCTestCase {
    var box: Sandbox!

    override func setUpWithError() throws {
        box = try Sandbox()
        try box.file(".DS_Store")
        try box.file("Photos/.DS_Store")
        try box.file("Photos/IMG_1.jpg", "real")
        try box.file("Photos/._IMG_1.jpg")
        try box.file(".Spotlight-V100/Store/index", "spotlight")
        try box.file("Photos/.Spotlight-V100/nested")
        try box.file(".Trashes/501/old.txt", "trash")
        try box.file(".fseventsd/no_log", "")
        try box.file(".TemporaryItems/x")
        try box.file("Tool.app/Contents/.DS_Store")
        try box.file(".hidden/.DS_Store")
        try box.file("Project/node_modules/x/.DS_Store")
        try box.file("Project/src/.DS_Store")
        try box.file(".metadata_never_index", "")
    }

    override func tearDown() { box.destroy() }

    private func scanner(mount: Bool = true, kept: Set<String> = []) -> JunkScanner {
        JunkScanner(safety: Safety(mountPoints: mount ? [box.path] : [], keptStores: kept))
    }

    func testFindsJunkAndRespectsScope() throws {
        let items = try scanner().scan(root: box.path)
        XCTAssertEqual(relative(items, from: box.path), [
            ".DS_Store", "Photos/.DS_Store", "Photos/._IMG_1.jpg", ".Spotlight-V100", ".Trashes", ".TemporaryItems", "Project/src/.DS_Store",
        ])
        let spotlight = items.first { $0.kind == .spotlight }!
        XCTAssertTrue(spotlight.isDirectory)
        XCTAssertEqual(spotlight.size, 9)
    }

    func testVolumeItemsIgnoredWhenRootIsNotAMountPoint() throws {
        let kinds = Set(try scanner(mount: false).scan(root: box.path).map(\.kind))
        XCTAssertEqual(kinds, [.dsStore, .appleDouble])
    }

    func testKeptStoresStay() throws {
        let items = try scanner(kept: [box.path + "/Photos/.DS_Store"]).scan(root: box.path)
        XCTAssertFalse(relative(items, from: box.path).contains("Photos/.DS_Store"))
    }

    func testNoisyFSEventsIsJunk() throws {
        try box.file(".fseventsd/000000001", "")
        XCTAssertTrue(try scanner().scan(root: box.path).contains { $0.kind == .fsevents })
    }

    func testDoesNotDescendIntoOtherMountPoints() throws {
        try box.file("Mount/.DS_Store")
        let items = try JunkScanner(safety: Safety(mountPoints: [box.path, box.path + "/Mount"])).scan(root: box.path)
        XCTAssertFalse(relative(items, from: box.path).contains("Mount/.DS_Store"))
    }

    func testRejectsNonDirectoriesAndCancels() {
        XCTAssertThrowsError(try scanner().scan(root: box.path + "/Photos/IMG_1.jpg"))
        XCTAssertThrowsError(try scanner().scan(root: box.path, isCancelled: { true })) { error in
            XCTAssertEqual(error as? ScanError, .cancelled)
        }
    }

    func testChangedPathsResolveToHighestJunkAncestor() throws {
        let items = scanner().items(fromChangedPaths: [
            box.path + "/.Trashes/501/old.txt",
            box.path + "/Photos/.DS_Store",
            box.path + "/Photos/IMG_1.jpg",
            box.path + "/Photos/missing",
            box.path + "/Photos/.Spotlight-V100/nested",
            box.path + "/Tool.app/Contents/.DS_Store",
            "/elsewhere/.DS_Store",
        ], root: box.path)
        XCTAssertEqual(relative(items, from: box.path), [".Trashes", "Photos/.DS_Store"])
    }
}

final class RemoverTests: XCTestCase {
    var box: Sandbox!

    override func setUpWithError() throws {
        box = try Sandbox()
        try box.file(".DS_Store", "12345")
        try box.file("A/.DS_Store", "1")
        try box.file(".Trashes/501/a", "1234")
    }

    override func tearDown() { box.destroy() }

    private var safety: Safety { Safety(mountPoints: [box.path]) }
    private func items() throws -> [Item] { try JunkScanner(safety: safety).scan(root: box.path) }

    func testDryRunKeepsEverything() throws {
        let outcome = Remover(safety: safety, dryRun: true).remove(try items(), within: [box.path])
        XCTAssertEqual(outcome.removed.count, 3)
        XCTAssertTrue(outcome.dryRun)
        XCTAssertTrue(box.exists(".DS_Store"))
    }

    func testRemovesAndCountsBytes() throws {
        let outcome = Remover(safety: safety).remove(try items(), within: [box.path])
        XCTAssertEqual(outcome.removed.count, 3)
        XCTAssertEqual(outcome.bytes, 10)
        XCTAssertTrue(outcome.failed.isEmpty)
        XCTAssertFalse(box.exists(".Trashes"))
        XCTAssertTrue(box.exists("A"))
    }

    func testVolumeFoldersLeaveTheirQuietFormBehind() throws {
        try box.file(".fseventsd/0000000001", "journal")
        try box.file(".Spotlight-V100/Store/index", "spotlight")
        let outcome = Remover(safety: safety).remove(try items(), within: [box.path])
        XCTAssertEqual(outcome.removed.count, 5)
        XCTAssertTrue(box.exists(".fseventsd/no_log"), "the journal stays in its quiet form")
        XCTAssertFalse(box.exists(".fseventsd/0000000001"))
        XCTAssertFalse(box.exists(".Spotlight-V100"))
        XCTAssertTrue(box.exists(".metadata_never_index"), "Spotlight is told not to index the disk again")
        XCTAssertTrue(try items().isEmpty, "nothing left to remove")
    }

    func testSkipsOutsideRootsAndProtected() throws {
        let outside = Item(path: "/System/Library/.DS_Store", kind: .dsStore, isDirectory: false, size: 1)
        let outcome = Remover(safety: safety).remove(try items() + [outside], within: [box.path + "/A"])
        XCTAssertEqual(outcome.removed.count, 1)
        XCTAssertEqual(outcome.skipped.count, 3)
        XCTAssertTrue(box.exists(".DS_Store"))
        XCTAssertFalse(box.exists("A/.DS_Store"))
    }

    func testUndeletableItemNeedsAdministrator() throws {
        try XCTSkipIf(getuid() == 0, "root can delete anything")
        try box.file("Locked/.DS_Store")
        XCTAssertEqual(chmod(box.path + "/Locked", 0o500), 0)
        defer { chmod(box.path + "/Locked", 0o700) }
        let found = try items().filter { $0.path.contains("/Locked/") }
        let outcome = Remover(safety: safety).remove(found, within: [box.path])
        XCTAssertEqual(outcome.failed.count, 1)
        XCTAssertTrue(outcome.failed[0].needsAdministrator)
        XCTAssertEqual(outcome.locked.count, 1)
    }

    func testPrivilegedScript() {
        let items = [
            Item(path: "/Volumes/U S'B/.Spotlight-V100", kind: .spotlight, isDirectory: true, size: 0),
            Item(path: "/Volumes/USB/.fseventsd", kind: .fsevents, isDirectory: true, size: 0),
            Item(path: "/Volumes/USB/.Trashes", kind: .trashes, isDirectory: true, size: 0),
        ]
        let script = Privileged.script(for: items)
        XCTAssertTrue(script.contains("mdutil -i off '/Volumes/U S'\\''B'"))
        XCTAssertTrue(script.contains("touch '/Volumes/U S'\\''B/.metadata_never_index'"))
        XCTAssertTrue(script.contains("mkdir -p '/Volumes/USB/.fseventsd' && /usr/bin/touch '/Volumes/USB/.fseventsd/no_log'"))
        XCTAssertTrue(script.contains("rm -rf -- '/Volumes/USB/.Trashes'"))
    }
}
