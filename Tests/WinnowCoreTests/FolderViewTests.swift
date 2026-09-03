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

    private func records(at relative: String) throws -> [DSStoreRecord] {
        try DSStoreFile.read(try Data(contentsOf: box.root.appendingPathComponent(relative))).records
    }

    func testApplyWritesOwnAndParentRecordsAndRetireStripsThem() throws {
        let store = box.path + "/Pictures/.DS_Store"
        let foreign = DSStoreRecord(filename: "photo.jpg", structID: "Iloc", value: .blob(Data(repeating: 1, count: 16)))
        let stale = DSStoreRecord(filename: ".", structID: "icvo", value: .blob(Data(repeating: 2, count: 18)))
        try DSStoreFile(records: [foreign, stale]).encoded().write(to: URL(fileURLWithPath: store))

        let view = FolderView(path: box.path + "/Pictures", viewStyle: .gallery, includeSubfolders: false)
        let plan = FolderViewPlan(views: [view])
        XCTAssertEqual(plan.directories(), [box.path, box.path + "/Pictures"], "the parent store holds the folder's record")
        XCTAssertTrue(plan.manages(store: store))
        XCTAssertTrue(plan.manages(store: box.path + "/.DS_Store"))
        XCTAssertFalse(plan.manages(store: box.path + "/Elsewhere/.DS_Store"))
        XCTAssertFalse(plan.manages(store: box.path + "/Pictures/photo.jpg"))

        XCTAssertEqual(try FolderViewWriter.apply(plan), 1)
        let own = try records(at: "Pictures/.DS_Store")
        XCTAssertFalse(own.contains(foreign), "Finder's own records do not persist")
        XCTAssertFalse(own.contains(stale))
        XCTAssertTrue(own.contains { $0.filename == "." && $0.structID == "vstl" && $0.value == .type("glyv") })
        XCTAssertEqual(own.filter { $0.structID == "bwsp" }.count, 1, "window settings are added when missing")
        let parent = try records(at: ".DS_Store")
        XCTAssertEqual(Set(parent.map(\.filename)), ["Pictures"])
        XCTAssertTrue(parent.contains { $0.structID == "vstl" && $0.value == .type("glyv") })
        XCTAssertTrue(parent.contains { $0.structID == "glvp" })
        XCTAssertTrue(parent.contains { $0.structID == "bwsp" })

        XCTAssertFalse(try FolderViewWriter.write(directory: view.path, plan: plan), "already as planned")
        XCTAssertFalse(try FolderViewWriter.write(directory: box.path, plan: plan))

        FolderViewWriter.retire(plan)
        XCTAssertFalse(box.exists("Pictures/.DS_Store"), "our default window record goes too")
        XCTAssertFalse(box.exists(".DS_Store"))

        // A window record Finder changed is kept through rewrites and is not ours to remove.
        var custom = DSStoreFile(records: [foreign])
        custom.records.append(DSStoreRecord(filename: ".", structID: "bwsp", value: .blob(Data([1, 2, 3]))))
        try custom.encoded().write(to: URL(fileURLWithPath: store))
        try FolderViewWriter.apply(plan)
        XCTAssertTrue(try records(at: "Pictures/.DS_Store").contains { $0.structID == "bwsp" && $0.value == .blob(Data([1, 2, 3])) })
        FolderViewWriter.retire(plan)
        XCTAssertEqual(try records(at: "Pictures/.DS_Store").map(\.structID), ["bwsp"])
    }

    func testReconcileRestoresWhatFinderChanged() throws {
        try box.dir("Pictures/2024")
        try box.dir("Documents")
        let view = FolderView(path: box.path + "/Pictures", viewStyle: .gallery)
        let plan = FolderViewPlan(views: [view])
        try FolderViewWriter.apply(plan)
        let before = try records(at: ".DS_Store")

        // Finder persists a sibling's view in the parent store and flips the folder's own view.
        var parent = try DSStoreFile.read(try Data(contentsOf: box.root.appendingPathComponent(".DS_Store")))
        parent.records += try FolderViewWriter.records(for: FolderView(path: box.path + "/Documents", viewStyle: .columns), as: "Documents")
        try parent.encoded().write(to: box.root.appendingPathComponent(".DS_Store"))
        var own = try DSStoreFile.read(try Data(contentsOf: box.root.appendingPathComponent("Pictures/.DS_Store")))
        own.records.removeAll { $0.structID == "vstl" }
        own.records.append(DSStoreRecord(filename: ".", structID: "vstl", value: .type("clmv")))
        own.records.append(DSStoreRecord(filename: "2024", structID: "vstl", value: .type("clmv")))
        try own.encoded().write(to: box.root.appendingPathComponent("Pictures/.DS_Store"))

        XCTAssertTrue(try FolderViewWriter.write(directory: box.path, plan: plan))
        XCTAssertTrue(FolderViewWriter.equivalent(try records(at: ".DS_Store"), before))
        XCTAssertTrue(try FolderViewWriter.write(directory: view.path, plan: plan))
        let restored = try records(at: "Pictures/.DS_Store")
        XCTAssertEqual(restored.filter { $0.structID == "vstl" }.map(\.value), [.type("glyv"), .type("glyv")])
        XCTAssertFalse(try FolderViewWriter.write(directory: view.path, plan: plan))

        // A deleted managed store comes back.
        try FileManager.default.removeItem(at: box.root.appendingPathComponent(".DS_Store"))
        XCTAssertTrue(try FolderViewWriter.write(directory: box.path, plan: plan))
        XCTAssertTrue(box.exists(".DS_Store"))
    }

    func testEquivalenceIgnoresOrderAndPlistEncoding() throws {
        let a = DSStoreRecord(filename: ".", structID: "icvp", value: .blob(try FolderViewWriter.plistData(["iconSize": 64, "arrangeBy": "name", "labelOnBottom": true])))
        let xml = try PropertyListSerialization.data(fromPropertyList: ["arrangeBy": "name", "labelOnBottom": true, "iconSize": 64.0], format: .xml, options: 0)
        let b = DSStoreRecord(filename: ".", structID: "icvp", value: .blob(xml))
        let c = DSStoreRecord(filename: ".", structID: "vstl", value: .type("icnv"))
        XCTAssertTrue(FolderViewWriter.equivalent([c, a], [b, c]))
        XCTAssertFalse(FolderViewWriter.equivalent([a], [b, c]))
        XCTAssertFalse(FolderViewWriter.equivalent([a, c], [b, DSStoreRecord(filename: ".", structID: "vstl", value: .type("Nlsv"))]))
    }

    func testDefaultWindowRecordIsRecognisedAfterSerialisation() throws {
        let data = try FolderViewWriter.plistData(FolderViewWriter.defaultWindowSettings)
        XCTAssertTrue(FolderViewWriter.isDefaultWindowSettings(data))
        var changed = FolderViewWriter.defaultWindowSettings
        changed["SidebarWidth"] = 300
        XCTAssertFalse(FolderViewWriter.isDefaultWindowSettings(try FolderViewWriter.plistData(changed)))
        XCTAssertFalse(FolderViewWriter.isDefaultWindowSettings(Data([1, 2, 3])))
    }

    func testMissingFoldersAreLeftOut() throws {
        let plan = FolderViewPlan(views: [FolderView(path: box.path + "/Nope"), FolderView(path: box.path + "/Pictures", isEnabled: false)])
        XCTAssertTrue(plan.isEmpty)
        XCTAssertTrue(plan.directories().isEmpty)
        XCTAssertEqual(try FolderViewWriter.apply(plan), 0)
        XCTAssertFalse(box.exists(".DS_Store"))
        XCTAssertThrowsError(try FolderViewWriter.write(directory: box.path + "/Nope", plan: FolderViewPlan(views: [FolderView(path: box.path + "/Pictures")])))
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

    func testSubfolderViewsAndExemption() throws {
        try box.dir("Pictures/2024/Trip")
        try box.dir("Pictures/.hidden")
        try box.dir("Pictures/node_modules/x")
        try box.dir("Pictures/Album.photoslibrary/inner")
        try box.dir("Pictures/Own/Deep")
        let root = FolderView(path: box.path + "/Pictures", viewStyle: .gallery)
        let own = FolderView(path: box.path + "/Pictures/Own", viewStyle: .list, includeSubfolders: false)
        let plan = FolderViewPlan(views: [root, own])

        XCTAssertEqual(Set(plan.subfolders(of: root).map { String($0.dropFirst(box.path.count + 1)) }), ["Pictures/2024", "Pictures/2024/Trip"])
        XCTAssertTrue(plan.subfolders(of: own).isEmpty)
        XCTAssertEqual(plan.directories().map { String($0.dropFirst(box.path.count)) }, ["", "/Pictures", "/Pictures/2024", "/Pictures/2024/Trip", "/Pictures/Own"])
        XCTAssertEqual(plan.view(covering: box.path + "/Pictures/2024/Trip")?.viewStyle, .gallery)
        XCTAssertEqual(plan.view(covering: box.path + "/Pictures/Own")?.viewStyle, .list)
        XCTAssertNil(plan.view(covering: box.path + "/Pictures/Own/Deep"))
        XCTAssertNil(plan.view(covering: box.path + "/Pictures/.hidden"))
        XCTAssertNil(plan.view(covering: box.path + "/Pictures/Album.photoslibrary/inner"))

        XCTAssertEqual(try FolderViewWriter.apply(plan), 4)
        XCTAssertTrue(box.exists("Pictures/2024/Trip/.DS_Store"))
        XCTAssertTrue(box.exists("Pictures/Own/.DS_Store"))
        XCTAssertFalse(box.exists("Pictures/Own/Deep/.DS_Store"))
        XCTAssertFalse(box.exists("Pictures/.hidden/.DS_Store"))
        let pictures = try records(at: "Pictures/.DS_Store")
        XCTAssertEqual(Set(pictures.map(\.filename)), [".", "2024", "Own"], "browsable children carry the view, a nested root its own")
        XCTAssertTrue(pictures.contains { $0.filename == "2024" && $0.structID == "vstl" && $0.value == .type("glyv") })
        XCTAssertTrue(pictures.contains { $0.filename == "Own" && $0.structID == "vstl" && $0.value == .type("Nlsv") })
        XCTAssertTrue(try records(at: "Pictures/Own/.DS_Store").contains { $0.filename == "." && $0.value == .type("Nlsv") })

        let policy = SafetyPolicy(exemptRoots: [
            .init(path: root.path, includesSubfolders: true), .init(path: own.path, includesSubfolders: false),
            .init(path: box.path, includesSubfolders: false),
        ])
        XCTAssertFalse(policy.validate(path: box.path + "/.DS_Store").isAllowed, "the parent store is kept")
        XCTAssertFalse(policy.validate(path: box.path + "/Pictures/.DS_Store").isAllowed)
        XCTAssertFalse(policy.validate(path: box.path + "/Pictures/2024/Trip/.DS_Store").isAllowed)
        XCTAssertFalse(policy.validate(path: box.path + "/Pictures/Own/.DS_Store").isAllowed, "nested view keeps its own")
        XCTAssertTrue(policy.validate(path: box.path + "/Pictures/Own/Deep/.DS_Store").isAllowed, "nested view without subfolders does not cover deeper folders")
        XCTAssertTrue(policy.validate(path: box.path + "/Elsewhere/.DS_Store").isAllowed, "siblings are not covered by the parent exemption")
        XCTAssertTrue(policy.validate(path: box.path + "/Pictures/2024/photo.jpg").isAllowed, "only .DS_Store is exempt")

        FolderViewWriter.retire(plan)
        XCTAssertFalse(box.exists("Pictures/2024/Trip/.DS_Store"))
        XCTAssertFalse(box.exists("Pictures/.DS_Store"))
        XCTAssertFalse(box.exists("Pictures/Own/.DS_Store"))
        XCTAssertFalse(box.exists(".DS_Store"))
    }

    func testManyChildrenFallBackToViewStyleOnly() throws {
        for i in 0..<60 { try box.dir("Pictures/Album \(i)") }
        let plan = FolderViewPlan(views: [FolderView(path: box.path + "/Pictures", viewStyle: .list)])
        XCTAssertTrue(try FolderViewWriter.write(directory: box.path + "/Pictures", plan: plan))
        let records = try records(at: "Pictures/.DS_Store")
        XCTAssertEqual(records.filter { $0.structID == "vstl" }.count, 61)
        XCTAssertEqual(records.filter { $0.structID == "lsvp" }.map(\.filename), ["."], "only the folder itself keeps full options")
        XCTAssertFalse(try FolderViewWriter.write(directory: box.path + "/Pictures", plan: plan), "the slim form is stable")
    }

    func testSweepsKeepManagedDSStore() throws {
        try box.dir("USB")
        try box.file("USB/.DS_Store")
        try box.file("USB/Pics/.DS_Store")
        try box.file("USB/Pics/Sub/.DS_Store")
        try box.file("USB/Pics/Sub/Deeper/.DS_Store")
        let usb = VolumeInfo(id: "uuid:usb", name: "USB", mountPoint: box.path + "/USB", kind: .external, fileSystem: "exfat")
        let store = SettingsStore(fileURL: box.root.appendingPathComponent("config/settings.json"))
        let engine = Engine(store: store, inspector: StaticVolumeInspector([usb]),
                            log: ActivityLog(fileURL: box.root.appendingPathComponent("config/activity.jsonl")))
        var settings = engine.settings
        settings.folderViews = [FolderView(path: box.path + "/USB/Pics", viewStyle: .list, includeSubfolders: false)]
        engine.update(settings)
        engine.refreshVolumes()

        let result = try engine.fullSweep()
        XCTAssertEqual(relativePaths(result.removed, from: box.path), ["USB/Pics/Sub/.DS_Store", "USB/Pics/Sub/Deeper/.DS_Store"])
        XCTAssertTrue(box.exists("USB/Pics/.DS_Store"))
        XCTAssertTrue(box.exists("USB/.DS_Store"), "the parent store carries the folder's record")

        try box.file("USB/Pics/Sub/.DS_Store")
        settings.folderViews[0].includeSubfolders = true
        engine.update(settings)
        XCTAssertTrue(try engine.fullSweep().removed.isEmpty)
        XCTAssertTrue(box.exists("USB/Pics/Sub/.DS_Store"))

        settings.folderViews[0].isEnabled = false
        engine.update(settings)
        let again = try engine.fullSweep()
        XCTAssertEqual(relativePaths(again.removed, from: box.path), ["USB/.DS_Store", "USB/Pics/.DS_Store", "USB/Pics/Sub/.DS_Store"])
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
