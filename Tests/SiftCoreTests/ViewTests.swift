import XCTest
@testable import SiftCore

final class DSStoreTests: XCTestCase {
    private func sample() -> [DSRecord] {
        [
            DSRecord(filename: ".", structID: "vstl", value: .type("icnv")),
            DSRecord(filename: ".", structID: "vSrn", value: .long(1)),
            DSRecord(filename: ".", structID: "icvp", value: .blob(Data([0x62, 0x70, 0x6C, 0x69, 0x73, 0x74]))),
            DSRecord(filename: "photo.jpg", structID: "Iloc", value: .blob(Data(repeating: 0, count: 16))),
            DSRecord(filename: "Zed", structID: "bool", value: .bool(true)),
            DSRecord(filename: "apple", structID: "shor", value: .shor(7)),
            DSRecord(filename: "ünïcode", structID: "ustr", value: .ustr("héllo")),
            DSRecord(filename: "when", structID: "moDD", value: .dutc(123_456_789)),
            DSRecord(filename: "big", structID: "comp", value: .comp(1 << 40)),
        ]
    }

    func testRoundTrip() throws {
        let data = try DSStore(records: sample()).encoded()
        XCTAssertEqual(data.prefix(8), Data([0, 0, 0, 1]) + Data("Bud1".utf8))
        let back = try DSStore.read(data)
        XCTAssertEqual(Set(back.records), Set(sample()))
        XCTAssertEqual(back.records.map(\.filename), back.records.map(\.filename).sorted { $0.lowercased() < $1.lowercased() })
        XCTAssertEqual(data, try DSStore(records: sample().reversed()).encoded(), "encoding is deterministic")
    }

    func testManyRecordsSpanSeveralNodes() throws {
        var records: [DSRecord] = []
        for i in 0..<1500 {
            records.append(DSRecord(filename: String(format: "file-%05d.txt", i), structID: "Iloc",
                                    value: .blob(Data(repeating: UInt8(i & 0xFF), count: 16))))
        }
        let back = try DSStore.read(try DSStore(records: records).encoded())
        XCTAssertEqual(back.records.count, 1500)
        XCTAssertEqual(back.records, records)
    }

    func testEmptyAndGarbage() throws {
        XCTAssertTrue(try DSStore.read(try DSStore().encoded()).records.isEmpty)
        XCTAssertThrowsError(try DSStore.read(Data("not a store at all, really".utf8)))
        XCTAssertThrowsError(try DSStore.read(Data()))
    }

    func testBuddyBlocksAreDisjointAndFreeListsConsistent() {
        var buddy = Buddy()
        let sizes = [32, 2048, 32, 4096, 4096, 100, 4096]
        for size in sizes { _ = buddy.allocate(size) }
        var used: [(Int, Int)] = []
        for i in 0..<sizes.count {
            let start = buddy.offsets[i], end = start + buddy.sizes[i]
            for (s, e) in used { XCTAssertTrue(end <= s || start >= e, "blocks overlap") }
            used.append((start, end))
            XCTAssertEqual(start % buddy.sizes[i], 0)
        }
        var total = 0
        for (k, list) in buddy.free {
            for offset in list {
                XCTAssertEqual(offset % (1 << k), 0)
                for (s, e) in used { XCTAssertTrue(offset + (1 << k) <= s || offset >= e) }
                total += 1 << k
            }
        }
        XCTAssertEqual(total + buddy.sizes.reduce(0, +), 1 << 31)
    }

    func testEquivalenceIgnoresOrderAndPlistEncoding() throws {
        let a = DSRecord(filename: ".", structID: "icvp", value: .blob(try Plist.data(["iconSize": 64, "arrangeBy": "name", "labelOnBottom": true])))
        let xml = try PropertyListSerialization.data(fromPropertyList: ["arrangeBy": "name", "labelOnBottom": true, "iconSize": 64.0], format: .xml, options: 0)
        let b = DSRecord(filename: ".", structID: "icvp", value: .blob(xml))
        let c = DSRecord(filename: ".", structID: "vstl", value: .type("icnv"))
        XCTAssertTrue(DSRecord.equivalent([c, a], [b, c]))
        XCTAssertFalse(DSRecord.equivalent([a], [b, c]))
        XCTAssertFalse(DSRecord.equivalent([a, c], [b, DSRecord(filename: ".", structID: "vstl", value: .type("Nlsv"))]))
    }
}

final class FinderPrefsTests: XCTestCase {
    private func plist(_ record: DSRecord) -> [String: Any]? {
        guard case .blob(let data) = record.value else { return nil }
        return try? PropertyListSerialization.propertyList(from: data, options: [], format: nil) as? [String: Any]
    }

    func testStandardViewSettingsFromScratch() {
        var s = ViewSettings()
        s.default = FinderView(mode: .list, sortKey: .dateAdded)
        let merged = FinderPrefs.standardViewSettings(s, into: nil)
        let list = merged["ListViewSettings"] as! [String: Any]
        XCTAssertEqual(list["sortColumn"] as? String, "dateAdded")
        let columns = list["columns"] as! [String: Any]
        XCTAssertEqual(columns.count, 10)
        XCTAssertEqual((columns["dateAdded"] as! [String: Any])["visible"] as? Bool, true)
        XCTAssertEqual((columns["dateAdded"] as! [String: Any])["ascending"] as? Bool, false, "dates newest first")
        let extended = merged["ExtendedListViewSettingsV2"] as! [String: Any]
        let extendedColumns = extended["columns"] as! [[String: Any]]
        XCTAssertEqual(extendedColumns.count, 10)
        XCTAssertEqual((merged["IconViewSettings"] as! [String: Any])["arrangeBy"] as? String, "dateAdded")
        XCTAssertEqual((merged["GalleryViewSettings"] as! [String: Any])["arrangeBy"] as? String, "dateAdded")
        XCTAssertEqual(merged["ViewStyle"] as? String, "Nlsv")
        XCTAssertEqual(merged["SettingsType"] as? String, "StandardViewSettings")
        let desktop = FinderPrefs.desktopViewSettings(s, into: ["Other": 1])
        XCTAssertEqual((desktop["IconViewSettings"] as! [String: Any])["arrangeBy"] as? String, "dateAdded")
        XCTAssertEqual(desktop["Other"] as? Int, 1)
    }

    func testMergePreservesWhatFinderStored() {
        let existing: [String: Any] = [
            "IconViewSettings": ["backgroundType": 2, "backgroundImageAlias": "x", "arrangeBy": "none"],
            "ListViewSettings": ["textSize": 14.0, "sortColumn": "name",
                                 "columns": ["name": ["visible": true, "ascending": true, "index": 0, "width": 250]]],
            "ExtendedListViewSettingsV2": ["columns": [["identifier": "name", "visible": true, "ascending": true, "index": 0, "width": 250]]],
        ]
        var s = ViewSettings()
        s.default.sortKey = .size
        s.default.options.icon.iconSize = 128
        let merged = FinderPrefs.standardViewSettings(s, into: existing)
        let icon = merged["IconViewSettings"] as! [String: Any]
        XCTAssertEqual(icon["iconSize"] as? Double, 128.0)
        XCTAssertEqual(icon["backgroundType"] as? Int, 2)
        XCTAssertEqual(icon["arrangeBy"] as? String, "size")
        let columns = (merged["ListViewSettings"] as! [String: Any])["columns"] as! [String: Any]
        XCTAssertEqual((columns["name"] as! [String: Any])["width"] as? Int, 250)
        XCTAssertEqual((columns["size"] as! [String: Any])["visible"] as? Bool, true)
        let extendedColumns = (merged["ExtendedListViewSettingsV2"] as! [String: Any])["columns"] as! [[String: Any]]
        XCTAssertEqual(extendedColumns.count, 10, "missing columns are added so Finder can show them")
        XCTAssertEqual(extendedColumns.first?["width"] as? Int, 250, "existing geometry is kept")
        XCTAssertEqual(extendedColumns.first { $0["identifier"] as? String == "comments" }!["visible"] as? Bool, false)
    }

    func testColumnViewOptions() {
        var s = ViewSettings()
        s.default.sortKey = .dateModified
        XCTAssertEqual(FinderPrefs.columnViewOptions(s, into: nil)["ArrangeBy"] as? String, "dmod")
        s.default.sortKey = .dateAdded
        s.default.options.column.textSize = 13
        let kept = FinderPrefs.columnViewOptions(s, into: ["ArrangeBy": "dnam", "ColumnWidth": 245])
        XCTAssertEqual(kept["ArrangeBy"] as? String, "dnam", "no code for Date Added, so the old one stays")
        XCTAssertEqual(kept["ColumnWidth"] as? Int, 245)
        XCTAssertEqual(kept["FontSize"] as? Int, 13)
    }

    func testOptionsRoundTripThroughPlists() {
        var list = ListOptions()
        list.columns = ["dateAdded", "kind"]
        list.largeIcons = true
        let back = ListOptions.read(nil, extended: list.extendedPlist(sortColumn: "name", ascending: true))
        XCTAssertEqual(back.columns, ["dateAdded", "kind"])
        XCTAssertTrue(back.largeIcons)
        XCTAssertEqual(IconOptions.read(IconOptions().plist(arrangeBy: "name")), IconOptions())
        XCTAssertEqual(GalleryOptions.read(GalleryOptions().plist(arrangeBy: "name")), GalleryOptions())
        XCTAssertEqual(ColumnOptions.read(ColumnOptions().plist(arrangeBy: "dnam")), ColumnOptions())
    }

    func testViewLookup() {
        var s = ViewSettings()
        s.folders = [FolderView(path: "/Users/x/Pictures", view: FinderView(mode: .gallery)),
                     FolderView(path: "/Users/x/Pictures/Raw", view: FinderView(mode: .list))]
        XCTAssertEqual(s.view(for: "/Users/x/Pictures").view.mode, .gallery)
        XCTAssertEqual(s.view(for: "/Users/x/Pictures/2024/Trip").owner, "/Users/x/Pictures")
        XCTAssertEqual(s.view(for: "/Users/x/Pictures/Raw/2024").view.mode, .list, "the nearest folder view wins")
        XCTAssertNil(s.view(for: "/Users/x/Documents").owner)
        XCTAssertEqual(s.view(for: "/Users/x/Documents").view, s.default)
        XCTAssertEqual(FinderView(mode: .icons, sortKey: .dateModified).ascending, false)
        XCTAssertEqual(FinderView(mode: .gallery).summary, "Gallery · by Name · 48 px")
    }
}

final class StoreTests: XCTestCase {
    var box: Sandbox!

    override func setUpWithError() throws {
        box = try Sandbox()
        try box.dir("Pictures/2024")
    }

    override func tearDown() { box.destroy() }

    private func settings(_ folders: [FolderView]) -> ViewSettings {
        var s = ViewSettings()
        s.folders = folders
        return s
    }

    func testRecordsDescribeTheView() throws {
        var view = FinderView(mode: .icons, sortKey: .dateAdded)
        view.options.icon.iconSize = 128
        let records = try StorePlan.records(for: view, as: "Pictures")
        XCTAssertEqual(records.map(\.structID), ["vstl", "vSrn", "icvp"])
        XCTAssertEqual(records[0].value, .type("icnv"))
        XCTAssertEqual(records[1].value, .long(1))
        guard case .blob(let data) = records[2].value,
              let icvp = try PropertyListSerialization.propertyList(from: data, options: [], format: nil) as? [String: Any] else {
            return XCTFail("icvp is a plist")
        }
        XCTAssertEqual(plistDouble(icvp["iconSize"]), 128)
        XCTAssertEqual(icvp["arrangeBy"] as? String, "dateAdded")
        XCTAssertEqual(try StorePlan.records(for: FinderView(mode: .list), as: ".").map(\.structID), ["vstl", "vSrn", "lsvp", "lsvP"])
        XCTAssertEqual(try StorePlan.records(for: FinderView(mode: .columns), as: ".").map(\.structID), ["vstl", "vSrn"])
        XCTAssertEqual(try StorePlan.records(for: FinderView(mode: .gallery), as: ".").map(\.structID), ["vstl", "vSrn", "glvp"])
    }

    func testStoreLivesInTheParent() throws {
        try box.dir("Documents")
        try box.dir("Tool.app/Contents")
        try box.dir(".hidden")
        try box.file("notes.txt")
        let plan = StorePlan(settings: settings([FolderView(path: box.path + "/Pictures", view: FinderView(mode: .gallery))]))
        XCTAssertEqual(StorePlan.storeDirectory(for: box.path + "/Pictures"), box.path)
        XCTAssertNil(StorePlan.storeDirectory(for: "/"))
        XCTAssertEqual(plan.storePaths, [box.path + "/.DS_Store"], "the parent's store alone: Finder ignores a folder's own \".\" record")
        XCTAssertEqual(try plan.writeAll(), 1)
        let records = try box.records(".DS_Store")
        XCTAssertEqual(Set(records.map(\.filename)), ["Pictures", "Documents"], "the folder next to it gets the default; packages, hidden folders and files do not")
        let pictures = records.filter { $0.filename == "Pictures" }
        XCTAssertEqual(pictures.map(\.structID).sorted(), ["bwsp", "glvp", "vSrn", "vstl"])
        XCTAssertTrue(pictures.contains { $0.structID == "vstl" && $0.value == .type("glyv") })
        let documents = records.filter { $0.filename == "Documents" }
        XCTAssertEqual(documents.map(\.structID).sorted(), ["lsvP", "lsvp", "vSrn", "vstl"], "the default view, no window record")
        XCTAssertTrue(documents.contains { $0.structID == "vstl" && $0.value == .type("Nlsv") })
        XCTAssertFalse(box.exists("Pictures/.DS_Store"))
        XCTAssertEqual(try plan.writeAll(), 0, "already as planned")
    }

    func testFoldersInsideAFolderViewInheritItInTheirRecords() throws {
        try box.dir("Pictures/Raw")
        let inner = FolderView(path: box.path + "/Pictures/Raw", view: FinderView(mode: .columns))
        let plan = StorePlan(settings: settings([FolderView(path: box.path + "/Pictures", view: FinderView(mode: .gallery)), inner]))
        XCTAssertEqual(plan.storePaths, [box.path + "/.DS_Store", box.path + "/Pictures/.DS_Store"])
        try plan.writeAll()
        let records = try box.records("Pictures/.DS_Store")
        XCTAssertEqual(records.filter { $0.filename == "Raw" && $0.structID == "vstl" }.map(\.value), [.type("clmv")])
        XCTAssertEqual(records.filter { $0.filename == "2024" && $0.structID == "vstl" }.map(\.value), [.type("glyv")], "a plain folder inside gets the enclosing view")
    }

    func testStoreLivesInTheFolderWhenTheParentCannotBeWritten() throws {
        try XCTSkipIf(getuid() == 0, "root can write anywhere")
        try box.dir("Locked/Photos")
        XCTAssertEqual(chmod(box.path + "/Locked", 0o500), 0)
        defer { chmod(box.path + "/Locked", 0o700) }
        let plan = StorePlan(settings: settings([FolderView(path: box.path + "/Locked/Photos", view: FinderView(mode: .list))]))
        XCTAssertNil(StorePlan.storeDirectory(for: box.path + "/Locked/Photos"))
        XCTAssertTrue(plan.isEmpty, "no writable parent: no record anywhere, the window guard alone")
        XCTAssertEqual(try plan.writeAll(), 0)
        XCTAssertFalse(box.exists("Locked/Photos/.DS_Store"), "a record Finder would ignore is not written")
    }

    func testRewriteDropsWhatFinderAddedButKeepsItsWindow() throws {
        try box.dir("Documents")
        let plan = StorePlan(settings: settings([FolderView(path: box.path + "/Pictures", view: FinderView(mode: .gallery))]))
        try plan.writeAll()
        let planned = try box.records(".DS_Store")

        var file = DSStore(records: planned)
        file.records.removeAll { $0.structID == "bwsp" }
        file.records.append(DSRecord(filename: "Pictures", structID: "bwsp", value: .blob(Data([1, 2, 3]))))
        file.records.append(DSRecord(filename: "Pictures", structID: "vstl", value: .type("clmv")))
        file.records += try StorePlan.records(for: FinderView(mode: .columns), as: "Documents")
        file.records.append(DSRecord(filename: "photo.jpg", structID: "Iloc", value: .blob(Data(repeating: 1, count: 16))))
        try file.encoded().write(to: box.url(".DS_Store"))

        XCTAssertTrue(try plan.write(directory: box.path))
        let kept = try box.records(".DS_Store")
        XCTAssertEqual(Set(kept.map(\.filename)), ["Pictures", "Documents"], "icon positions go")
        XCTAssertTrue(kept.contains { $0.structID == "bwsp" && $0.value == .blob(Data([1, 2, 3])) }, "Finder's window geometry stays")
        XCTAssertEqual(kept.filter { $0.filename == "Pictures" && $0.structID == "vstl" }.map(\.value), [.type("glyv")])
        XCTAssertEqual(kept.filter { $0.filename == "Documents" && $0.structID == "vstl" }.map(\.value), [.type("Nlsv")], "a view chosen in Finder for the folder next to it goes back to the default")
        XCTAssertFalse(kept.contains { $0.filename == "Documents" && $0.structID == "bwsp" })
        XCTAssertFalse(try plan.write(directory: box.path))

        try FileManager.default.removeItem(at: box.url(".DS_Store"))
        XCTAssertTrue(try plan.write(directory: box.path), "a deleted store comes back")

        let none = StorePlan(settings: ViewSettings())
        none.retire(from: plan)
        XCTAssertFalse(box.exists(".DS_Store"))
        XCTAssertFalse(box.exists("Pictures/.DS_Store"))
    }

    func testMissingFoldersAreLeftOut() throws {
        let plan = StorePlan(settings: settings([FolderView(path: box.path + "/Nope", view: FinderView())]))
        XCTAssertTrue(plan.isEmpty)
        XCTAssertEqual(try plan.writeAll(), 0)
        XCTAssertFalse(box.exists(".DS_Store"))
    }
}

final class WindowGuardTests: XCTestCase {
    func testParsesTheLookReport() {
        XCTAssertEqual(WindowGuard.errorNumber(in: "36:52: execution error: Not authorized to send Apple events to Finder. (-1743)"), -1743)
        XCTAssertEqual(WindowGuard.errorNumber(in: "syntax error: A identifier can't go after this identifier. (-2740)\n"), -2740)
        XCTAssertNil(WindowGuard.errorNumber(in: "killed"))
        XCTAssertEqual(WindowGuard.error("36:52: execution error: Finder got an error: Can’t get Finder window id 9. (-1728)"), .gone)
        XCTAssertEqual(WindowGuard.error("114:116: execution error: Finder got an error: Unknown object type. (-1731)\n"),
                       .failed("Finder got an error: Unknown object type. (-1731)"))

        let report = WindowGuard.parse("= 12 /Users/me/Documents/\n+ 1 7 /Volumes/USB/My Photos/\n! 9 -1728 /Users/me/Old/\tFinder got an error: Can’t get Finder window id 9.\nx /nope\n\n= 3 relative/\n")
        XCTAssertEqual(report.windows, [.init(id: 12, path: "/Users/me/Documents/"), .init(id: 7, path: "/Volumes/USB/My Photos/")])
        XCTAssertEqual(report.windows.map(\.path), ["/Users/me/Documents", "/Volumes/USB/My Photos"])
        XCTAssertEqual(report.windows.map(\.raw), ["12 /Users/me/Documents/", "7 /Volumes/USB/My Photos/"], "handed back to the next look as written")
        XCTAssertEqual(report.applied, [.init(window: .init(id: 7, path: "/Volumes/USB/My Photos/"), rule: 1)])
        XCTAssertEqual(report.failures, [.init(id: 9, number: -1728, path: "/Users/me/Old", message: "Finder got an error: Can’t get Finder window id 9.")])
        XCTAssertEqual(WindowGuard.parse("").windows, [])
    }

    func testOpenWindowsComeBackWhereTheyWere() {
        let windows = WindowGuard.parseOpenWindows("0 44 900 700 /Users/me/My Files/\n100 100 500 400 /Volumes/USB/\nx y z w /nope\n1 2 3 4 relative\n")
        XCTAssertEqual(windows, [.init(path: "/Users/me/My Files/", bounds: [0, 44, 900, 700]), .init(path: "/Volumes/USB/", bounds: [100, 100, 500, 400])])
        let script = WindowGuard.reopenScript(windows)
        let usb = script.range(of: "POSIX file \"/Volumes/USB/\"")!.lowerBound
        let files = script.range(of: "POSIX file \"/Users/me/My Files/\"")!.lowerBound
        XCTAssertLessThan(usb, files, "back to front, so the front window ends up in front")
        XCTAssertTrue(script.contains("set bounds of w to {0, 44, 900, 700}"))
        XCTAssertTrue(script.contains("make new Finder window to"))
        XCTAssertTrue(WindowGuard.openWindowsScript.contains("bounds of Finder window id n"))
        XCTAssertEqual(WindowGuard.parseOpenWindows(""), [])
    }

    func testTrackerTellsTheNextLookWhatItSaw() {
        var tracker = WindowGuard.Tracker()
        XCTAssertEqual(tracker.lines, [])
        tracker.update(with: WindowGuard.parse("= 1 /Users/me/Pictures/\n+ 0 2 /Users/me/\n! 3 -1728 /Users/me/Gone/\toops"))
        XCTAssertEqual(tracker.lines, ["1 /Users/me/Pictures/", "2 /Users/me/"], "a window that refused is looked at again")
        tracker.update(with: WindowGuard.parse("+ 0 1 /Users/me/Documents/"))
        XCTAssertEqual(tracker.lines, ["1 /Users/me/Documents/"], "closed windows are forgotten")
        tracker.reset()
        XCTAssertEqual(tracker.lines, [])
    }

    func testRulesMatchTheNearestFolderView() {
        var s = ViewSettings()
        s.default = FinderView(mode: .list)
        s.folders = [FolderView(path: "/Users/me/Pictures", view: FinderView(mode: .gallery)),
                     FolderView(path: "/Users/me/Pictures/Raw", view: FinderView(mode: .columns)),
                     FolderView(path: "/Volumes/USB", view: FinderView(mode: .icons))]
        let rules = WindowGuard.rules(s)
        XCTAssertEqual(rules.map(\.prefix), ["/Users/me/Pictures/Raw", "/Users/me/Pictures", "/Volumes/USB", ""], "longest path first, the default last")
        XCTAssertEqual(rules.map(\.label), ["Columns", "Gallery", "Icons", "List (default)"])
        for path in ["/Users/me/Pictures/Raw/2024", "/Users/me/Pictures", "/Users/me/Pictures2", "/Volumes/USB/x", "/"] {
            let expected = s.view(for: path).view
            let matched = rules.first { $0.prefix.isEmpty || Paths.isInside(path, $0.prefix) }!
            XCTAssertEqual(matched.view, expected, path)
        }
    }

    func testLookScriptCarriesRulesAndKnownWindows() {
        var s = ViewSettings()
        s.default = FinderView(mode: .list, sortKey: .dateModified)
        s.default.options.list.largeIcons = true
        s.folders = [FolderView(path: "/Users/me/Pictures", view: FinderView(mode: .gallery)),
                     FolderView(path: "/Users/me/Zoë \"quoted\"", view: FinderView(mode: .icons, sortKey: .kind))]
        let script = WindowGuard.lookScript(rules: WindowGuard.rules(s), known: ["12 /Users/me/Documents/"])
        XCTAssertTrue(script.hasPrefix("with timeout of"), "a busy Finder never holds the caller for long")
        XCTAssertTrue(script.contains("set known to {\"12 /Users/me/Documents/\"}"))
        XCTAssertTrue(script.contains("set ids to id of every Finder window"), "one request for every id")
        XCTAssertTrue(script.contains("target of Finder window id n"), "each window addressed by id, never as item N of a changing list")
        XCTAssertFalse(script.contains("id of w) as text"), "Finder cannot fetch and coerce in one step")
        XCTAssertTrue(script.contains("if p starts with (string id {47, 85, 115, 101, 114, 115, 47, 109, 101, 47, 90, 111, 235, 32, 34, 113, 117, 111, 116, 101, 100, 34, 47}) then"), "non-ASCII paths are built from code points so the script stays ASCII")
        XCTAssertTrue(script.contains("else if p starts with \"/Users/me/Pictures/\" then"))
        XCTAssertTrue(script.contains("if current view of w is not flow view then set current view of w to flow view"), "Finder's name for the gallery view")
        XCTAssertFalse(script.contains("gallery view"), "not a term Finder knows")
        XCTAssertTrue(script.contains("if arrangement of o is not arranged by kind then set arrangement of o to arranged by kind"), "set only when it differs: Finder records every change")
        XCTAssertTrue(script.contains("then set sort column of o to modification date column"))
        XCTAssertTrue(script.contains("then set sort direction of sort column of o to reversed"))
        XCTAssertTrue(script.contains("then set icon size of o to large icon"))
        let added = WindowGuard.viewLines(FinderView(mode: .list, sortKey: .dateAdded)).joined(separator: "\n")
        XCTAssertFalse(added.contains("sort column"), "Finder has no term for Date Added; the preferences and the record keep it")
        XCTAssertFalse(added.contains("sort direction"))
        XCTAssertFalse(WindowGuard.viewLines(FinderView(mode: .icons, sortKey: .dateAdded)).joined().contains("arrangement"))
        XCTAssertTrue(script.contains("set end of out to \"+ 2 \" & entry"), "the default is the last rule")
        XCTAssertTrue(script.contains("on error msg number num"))
        XCTAssertTrue(script.unicodeScalars.allSatisfy { $0.isASCII })
        XCTAssertEqual(WindowGuard.literal("a\\b\"c"), "\"a\\\\b\\\"c\"")
        let none = WindowGuard.lookScript(rules: WindowGuard.rules(ViewSettings()), known: [])
        XCTAssertTrue(none.contains("set known to {}"))
        XCTAssertTrue(none.contains("if true then"), "only the default: no folder to match")
    }
}

final class SettingsTests: XCTestCase {
    func testEmptyDocumentYieldsDefaults() throws {
        let settings = try JSONDecoder().decode(Settings.self, from: Data("{}".utf8))
        XCTAssertEqual(settings, Settings())
        XCTAssertEqual(settings.views.default.mode, .list)
        let broken = try JSONDecoder().decode(Settings.self, from: Data("{\"views\": {\"default\": 5}}".utf8))
        XCTAssertEqual(broken, Settings(), "an unreadable section falls back to the defaults")
    }

    func testStoreRoundTrip() throws {
        let box = try Sandbox()
        defer { box.destroy() }
        let store = SettingsStore(fileURL: box.url("nested/settings.json"))
        XCTAssertFalse(store.exists)
        XCTAssertEqual(store.load(), Settings())
        var settings = Settings()
        settings.views.default = FinderView(mode: .list, sortKey: .size, ascending: false)
        settings.views.groupBy = .kind
        settings.views.folders = [FolderView(path: box.path + "/Photos/", view: FinderView(mode: .gallery))]
        try store.save(settings)
        XCTAssertTrue(store.exists)
        XCTAssertEqual(store.load(), settings)
        XCTAssertEqual(store.load().views.folders.first?.path, box.path + "/Photos")
    }

    func testLogKeepsTheLastEntriesAndTellsOncePerBatch() throws {
        let box = try Sandbox()
        defer { box.destroy() }
        let log = Log(fileURL: box.url("activity.jsonl"), keep: 5)
        var told = 0
        let lock = NSLock()
        log.onAppend = { lock.lock(); told += 1; lock.unlock() }
        var outcome = Outcome()
        outcome.removed = [Item(path: "/x/.DS_Store", kind: .dsStore, isDirectory: false, size: 10),
                           Item(path: "/x/._y", kind: .appleDouble, isDirectory: false, size: 5)]
        outcome.failed = [Failure(item: Item(path: "/x/.Trashes", kind: .trashes, isDirectory: true, size: 0), reason: "no", needsAdministrator: true)]
        log.record(outcome)
        XCTAssertEqual(log.entries.count, 2, "locked items are shown in the window, not logged")
        lock.lock(); XCTAssertEqual(told, 1, "one word per batch, not per entry"); lock.unlock()
        XCTAssertEqual(log.recent(1).first?.text, "Removed ._y")
        log.info("later")
        lock.lock(); XCTAssertEqual(told, 2, "told again once the last batch was read"); lock.unlock()
        log.flush()
        let again = Log(fileURL: box.url("activity.jsonl"), keep: 5)
        XCTAssertEqual(again.entries.map(\.text), log.entries.map(\.text))

        for i in 0..<20 { log.info("entry \(i)") }
        log.flush()
        let lines = try String(contentsOf: box.url("activity.jsonl")).split(separator: "\n").count
        XCTAssertLessThanOrEqual(lines, 10, "the file is rewritten to the kept entries once it doubles")
        XCTAssertEqual(Log(fileURL: box.url("activity.jsonl"), keep: 5).entries.map(\.text), (15..<20).map { "entry \($0)" })
    }
}
