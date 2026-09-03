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
        XCTAssertEqual(records.map(\.structID), ["vstl", "vSrn", "icvp"])
        XCTAssertEqual(records[0].value, .type("icnv"))
        let icvp = plist(records[2])!
        XCTAssertEqual(plistDouble(icvp["iconSize"]), 128)
        XCTAssertEqual(icvp["arrangeBy"] as? String, "dateAdded")

        let list = FolderView(path: box.path + "/Pictures", viewStyle: .list, sortKey: .size, ascending: false)
        let listRecords = try FolderViewWriter.records(for: list)
        XCTAssertEqual(listRecords.map(\.structID), ["vstl", "vSrn", "lsvp", "lsvP"])
        let lsvP = plist(listRecords[3])!
        XCTAssertEqual(lsvP["sortColumn"] as? String, "size")
        let columns = lsvP["columns"] as! [[String: Any]]
        let size = columns.first { $0["identifier"] as? String == "size" }!
        XCTAssertEqual(plistBool(size["visible"]), true)
        XCTAssertEqual(plistBool(size["ascending"]), false)

        XCTAssertEqual(try FolderViewWriter.records(for: FolderView(path: box.path, viewStyle: .columns)).map(\.structID), ["vstl", "vSrn"])
        XCTAssertEqual(try FolderViewWriter.records(for: FolderView(path: box.path, viewStyle: .gallery)).map(\.structID), ["vstl", "vSrn", "glvp"])
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

        try FolderViewWriter.remove(view)
        let stripped = try DSStoreFile.read(try Data(contentsOf: URL(fileURLWithPath: store)))
        XCTAssertEqual(stripped.records, [foreign])

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
        XCTAssertEqual(Settings().folderViews.count, 2)
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

    func testResetFolderSettingsUsesStartupRootsAndKeepsManaged() throws {
        try box.file("Users/me/Desktop/.DS_Store")
        try box.file("Users/me/Pictures/.DS_Store")
        try box.file("Users/me/Desktop/.Spotlight-V100/x")
        let store = SettingsStore(fileURL: box.root.appendingPathComponent("config/settings.json"))
        let engine = Engine(store: store, inspector: StaticVolumeInspector([]),
                            log: ActivityLog(fileURL: box.root.appendingPathComponent("config/activity.jsonl")))
        engine.startupDiskRoots = [box.path + "/Users"]
        var settings = engine.settings
        settings.folderViews = [FolderView(path: box.path + "/Users/me/Pictures")]
        engine.update(settings)
        let result = try engine.resetFolderSettings()
        XCTAssertEqual(relativePaths(result.removed, from: box.path), ["Users/me/Desktop/.DS_Store"])
        XCTAssertTrue(box.exists("Users/me/Pictures/.DS_Store"))
        XCTAssertTrue(box.exists("Users/me/Desktop/.Spotlight-V100"))
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
