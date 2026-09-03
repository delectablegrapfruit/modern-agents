import XCTest
@testable import WinnowCore

final class FolderViewTests: XCTestCase {
    var box: TestSandbox!

    override func setUpWithError() throws {
        box = try TestSandbox()
        try box.dir("Pictures")
    }

    override func tearDown() {
        box.destroy()
    }

    private func plist(_ record: DSStoreRecord) -> [String: Any]? {
        guard case .blob(let data) = record.value else { return nil }
        return try? PropertyListSerialization.propertyList(from: data, options: [], format: nil) as? [String: Any]
    }

    func testRecordsDescribeTheView() throws {
        var view = FolderView(path: box.path + "/Pictures", viewStyle: .icons, sortKey: .dateAdded)
        view.options.icon.iconSize = 128
        let records = try FolderViewWriter.records(for: view)
        XCTAssertEqual(records.map(\.structID), ["vstl", "icvl", "vSrn", "icvp"])
        XCTAssertEqual(records[0].value, .type("icnv"))
        XCTAssertEqual(records[1].value, .type("icnv"))
        let icvp = plist(records[3])!
        XCTAssertEqual(plistDouble(icvp["iconSize"]), 128)
        XCTAssertEqual(icvp["arrangeBy"] as? String, "dateAdded")

        let list = FolderView(path: box.path + "/Pictures", viewStyle: .list, sortKey: .size, ascending: false)
        let listRecords = try FolderViewWriter.records(for: list)
        XCTAssertEqual(listRecords.map(\.structID), ["vstl", "icvl", "vSrn", "lsvp", "lsvP"])
        let lsvP = plist(listRecords[4])!
        XCTAssertEqual(lsvP["sortColumn"] as? String, "size")
        let columns = lsvP["columns"] as! [[String: Any]]
        let size = columns.first { $0["identifier"] as? String == "size" }!
        XCTAssertEqual(plistBool(size["visible"]), true)
        XCTAssertEqual(plistBool(size["ascending"]), false)

        XCTAssertEqual(try FolderViewWriter.records(for: FolderView(path: box.path, viewStyle: .columns)).map(\.structID), ["vstl", "icvl", "vSrn"])
        XCTAssertEqual(try FolderViewWriter.records(for: FolderView(path: box.path, viewStyle: .gallery)).map(\.structID), ["vstl", "icvl", "vSrn", "glvp"])
    }

    func testWriteMergesWithExistingRecordsAndRemoveStripsThem() throws {
        let store = box.path + "/Pictures/.DS_Store"
        let foreign = DSStoreRecord(filename: "photo.jpg", structID: "Iloc", value: .blob(Data(repeating: 1, count: 16)))
        let stale = DSStoreRecord(filename: ".", structID: "icvo", value: .blob(Data(repeating: 2, count: 18)))
        try DSStoreFile(records: [foreign, stale]).encoded().write(to: URL(fileURLWithPath: store))

        let view = FolderView(path: box.path + "/Pictures", viewStyle: .gallery)
        try FolderViewWriter.write(view)
        let merged = try DSStoreFile.read(try Data(contentsOf: URL(fileURLWithPath: store)))
        XCTAssertTrue(merged.records.contains(foreign))
        XCTAssertFalse(merged.records.contains(stale))
        XCTAssertTrue(merged.records.contains { $0.structID == "vstl" && $0.value == .type("glyv") })
        XCTAssertTrue(merged.records.contains { $0.structID == "bwsp" }, "window settings are added when missing")

        try FolderViewWriter.write(view)
        let twice = try DSStoreFile.read(try Data(contentsOf: URL(fileURLWithPath: store)))
        XCTAssertEqual(twice.records.filter { $0.structID == "bwsp" }.count, 1)

        try FolderViewWriter.remove(view)
        let stripped = try DSStoreFile.read(try Data(contentsOf: URL(fileURLWithPath: store)))
        XCTAssertEqual(Set(stripped.records.map(\.structID)), ["Iloc", "bwsp"])

        try DSStoreFile(records: try FolderViewWriter.records(for: view)).encoded().write(to: URL(fileURLWithPath: store))
        try FolderViewWriter.remove(view)
        XCTAssertFalse(box.exists("Pictures/.DS_Store"))
    }

    func testWriteRefusesMissingFolder() {
        XCTAssertThrowsError(try FolderViewWriter.write(FolderView(path: box.path + "/Nope")))
    }

    func testSeededViews() {
        let seeded = FolderView.seeded(home: "/Users/x")
        XCTAssertEqual(seeded.map(\.path), ["/Users/x/Pictures", "/Users/x/Movies"])
        XCTAssertEqual(seeded[0].viewStyle, .icons)
        XCTAssertEqual(seeded[1].viewStyle, .gallery)
        XCTAssertTrue(seeded.allSatisfy(\.isEnabled))
        XCTAssertEqual(seeded.map(\.id), [FolderView.picturesID, FolderView.moviesID])
        XCTAssertEqual(Settings().folderViews.count, 2)
        XCTAssertEqual(Settings(), Settings())
        let none = try! JSONDecoder().decode(Settings.self, from: Data("{\"folderViews\": []}".utf8))
        XCTAssertTrue(none.folderViews.isEmpty)
    }

    func testSweepsKeepManagedDSStore() throws {
        try box.dir("USB")
        try box.file("USB/.DS_Store")
        try box.file("USB/Pics/.DS_Store")
        try box.file("USB/Pics/Sub/.DS_Store")
        let usb = VolumeInfo(id: "uuid:usb", name: "USB", mountPoint: box.path + "/USB", kind: .external, fileSystem: "exfat")
        let store = SettingsStore(fileURL: box.root.appendingPathComponent("config/settings.json"))
        let engine = Engine(store: store, inspector: StaticVolumeInspector([usb]),
                            log: ActivityLog(fileURL: box.root.appendingPathComponent("config/activity.jsonl")))
        var settings = engine.settings
        settings.folderViews = [FolderView(path: box.path + "/USB/Pics", viewStyle: .list)]
        engine.update(settings)
        engine.refreshVolumes()

        let result = try engine.fullSweep()
        XCTAssertEqual(relativePaths(result.removed, from: box.path), ["USB/.DS_Store", "USB/Pics/Sub/.DS_Store"])
        XCTAssertTrue(box.exists("USB/Pics/.DS_Store"))

        settings.folderViews[0].isEnabled = false
        engine.update(settings)
        let again = try engine.fullSweep()
        XCTAssertEqual(relativePaths(again.removed, from: box.path), ["USB/Pics/.DS_Store"])
    }

    func testResetCoversStartupRootsAndEveryDriveButKeepsManaged() throws {
        try box.file("Users/me/Desktop/.DS_Store")
        try box.file("Users/me/Library/Preferences/.DS_Store")
        try box.file("Users/me/Pictures/.DS_Store")
        try box.file("Users/me/Desktop/.Spotlight-V100/x")
        try box.file("Internal/Projects/.DS_Store")
        try box.file("Internal/.Spotlight-V100/x")
        try box.file("ReadOnly/.DS_Store")
        let internalDisk = VolumeInfo(id: "i", name: "Data", mountPoint: box.path + "/Internal", kind: .internalDisk, fileSystem: "apfs")
        let readOnly = VolumeInfo(id: "r", name: "Disc", mountPoint: box.path + "/ReadOnly", kind: .external, fileSystem: "udf", isReadOnly: true)
        let boot = VolumeInfo(id: "b", name: "Boot", mountPoint: "/", kind: .boot, fileSystem: "apfs")
        let store = SettingsStore(fileURL: box.root.appendingPathComponent("config/settings.json"))
        let engine = Engine(store: store, inspector: StaticVolumeInspector([boot, internalDisk, readOnly]),
                            log: ActivityLog(fileURL: box.root.appendingPathComponent("config/activity.jsonl")))
        engine.startupDiskRoots = [box.path + "/Users"]
        var settings = engine.settings
        settings.folderViews = [FolderView(path: box.path + "/Users/me/Pictures")]
        engine.update(settings)
        engine.refreshVolumes()

        XCTAssertEqual(Set(engine.dsStoreOnlyTargets().map(\.path)), [box.path + "/Users", box.path + "/Internal"])
        let result = try engine.resetFolderSettings()
        XCTAssertEqual(relativePaths(result.removed, from: box.path),
                       ["Users/me/Desktop/.DS_Store", "Users/me/Library/Preferences/.DS_Store", "Internal/Projects/.DS_Store"])
        XCTAssertTrue(box.exists("Users/me/Pictures/.DS_Store"))
        XCTAssertTrue(box.exists("Users/me/Desktop/.Spotlight-V100"))
        XCTAssertTrue(box.exists("Internal/.Spotlight-V100"), "only the .DS_Store rule applies here")
        XCTAssertTrue(box.exists("ReadOnly/.DS_Store"))

        // A drive already cleaned by policy keeps its full-rule target; no duplicate.
        settings.startupDisk.enable()
        settings.volumes.cleanInternal = true
        engine.update(settings)
        let paths = engine.fullSweepTargets().map(\.path)
        XCTAssertEqual(paths.filter { $0 == box.path + "/Internal" }.count, 1)
        XCTAssertTrue(engine.fullSweepTargets().contains { $0.path == box.path + "/Users" })
    }

    func testListOptionsRoundTripThroughPlist() {
        var options = ListViewOptions()
        options.visibleColumns = ["dateAdded", "kind"]
        options.largeIcons = true
        let extended = options.extendedPlist(sortColumn: "name", ascending: true)
        let back = ListViewOptions.read(nil, extended: extended)
        XCTAssertEqual(back.visibleColumns, ["dateAdded", "kind"])
        XCTAssertTrue(back.largeIcons)
        let icon = IconViewOptions.read(IconViewOptions().plist(arrangeBy: "name"))
        XCTAssertEqual(icon, IconViewOptions())
    }
}

final class FinderScriptingTests: XCTestCase {
    func testScriptCoversEachMode() {
        var icons = FolderView(path: "/Users/x/My \"Pics\"", viewStyle: .icons, sortKey: .kind)
        icons.options.icon.iconSize = 128
        let iconScripts = FinderScripting.scripts(for: icons)
        XCTAssertEqual(iconScripts.count, 2, "one with the view line, one without")
        let iconScript = iconScripts[0]
        XCTAssertTrue(iconScript.contains("POSIX file \"/Users/x/My \\\"Pics\\\"\""))
        XCTAssertTrue(iconScript.contains("set current view of theWindow to icon view"))
        XCTAssertTrue(iconScript.contains("try\nset arrangement of icon view options of theWindow to arranged by kind\nend try"))
        XCTAssertTrue(iconScript.contains("set icon size of icon view options of theWindow to 128"))
        XCTAssertTrue(iconScript.hasSuffix("close theWindow\nend tell"))
        XCTAssertFalse(iconScripts[1].contains("set current view"))

        let list = FinderScripting.scripts(for: FolderView(path: "/tmp/a", viewStyle: .list, sortKey: .dateModified))[0]
        XCTAssertTrue(list.contains("set sort column of list view options of theWindow to modification date column"))
        XCTAssertTrue(list.contains("small icon"))

        let columns = FinderScripting.scripts(for: FolderView(path: "/tmp/a", viewStyle: .columns))[0]
        XCTAssertTrue(columns.contains("column view options"))

        let gallery = FinderScripting.scripts(for: FolderView(path: "/tmp/a", viewStyle: .gallery))
        XCTAssertEqual(gallery.count, 3)
        XCTAssertTrue(gallery[0].contains("gallery view"))
        XCTAssertTrue(gallery[1].contains("flow view"))
        XCTAssertFalse(gallery[2].contains("set current view"))
        XCTAssertFalse(gallery[0].contains("view options"))
    }
}

final class ScanSkipTests: XCTestCase {
    func testSkipPrefixesHiddenAndNamedFoldersAreNotDescended() throws {
        let box = try TestSandbox()
        defer { box.destroy() }
        try box.file("Library/Caches/app/.DS_Store")
        try box.file("Library/Preferences/.DS_Store")
        try box.file(".npm/pkg/.DS_Store")
        try box.file("Project/node_modules/x/.DS_Store")
        try box.file("Project/src/.DS_Store")
        var options = ScanOptions(rules: RuleSettings().activeRules, skipPrefixes: [box.path + "/Library/Caches"])
        var found = try JunkScanner(options: options).scan(root: box.path)
        XCTAssertEqual(relativePaths(found, from: box.path),
                       ["Library/Preferences/.DS_Store", ".npm/pkg/.DS_Store", "Project/node_modules/x/.DS_Store", "Project/src/.DS_Store"])
        options.skipHiddenDirectories = true
        options.skipDirectoryNames = ["node_modules"]
        found = try JunkScanner(options: options).scan(root: box.path)
        XCTAssertEqual(relativePaths(found, from: box.path), ["Library/Preferences/.DS_Store", "Project/src/.DS_Store"])
    }
}
