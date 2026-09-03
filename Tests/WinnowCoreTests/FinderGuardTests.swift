import XCTest
@testable import WinnowCore

final class FinderGuardTests: XCTestCase {
    func testParsesWindowLines() {
        let windows = FinderWindowGuard.parse(["12\t/Users/me/Documents/", "x\t/nope", "no tab", "7\t/Volumes/USB/Photos"])
        XCTAssertEqual(windows, [.init(id: 12, path: "/Users/me/Documents"), .init(id: 7, path: "/Volumes/USB/Photos")])
    }

    func testTrackerReportsOnlyWindowsThatMoved() {
        var tracker = FinderWindowGuard.Tracker()
        let a = FinderWindowGuard.Window(id: 1, path: "/Users/me/Pictures")
        let b = FinderWindowGuard.Window(id: 2, path: "/Users/me")
        XCTAssertEqual(tracker.moved([a, b]), [a, b], "everything is new at first")
        XCTAssertEqual(tracker.moved([a, b]), [])
        let a2 = FinderWindowGuard.Window(id: 1, path: "/Users/me/Documents")
        XCTAssertEqual(tracker.moved([a2, b]), [a2])
        XCTAssertEqual(tracker.moved([a2]), [], "a closed window is forgotten")
        XCTAssertEqual(tracker.moved([a2, b]), [b], "and counts as new when it comes back")
    }

    func testSetViewScriptsFollowTheDefaults() {
        var defaults = FinderDefaults()
        defaults.viewStyle = .list
        defaults.sortKey = .dateModified
        let list = FinderWindowGuard.setViewScripts(windowID: 42, defaults: defaults)
        XCTAssertEqual(list.count, 1)
        XCTAssertTrue(list[0].contains("Finder window id 42"))
        XCTAssertTrue(list[0].contains("set current view of w to list view"))
        XCTAssertTrue(list[0].contains("sort column of list view options of w to modification date column"))

        defaults.viewStyle = .gallery
        let gallery = FinderWindowGuard.setViewScripts(windowID: 1, defaults: defaults)
        XCTAssertEqual(gallery.count, 2, "gallery view falls back to flow view")
        XCTAssertTrue(gallery[1].contains("flow view"))

        XCTAssertTrue(FinderWindowGuard.listScript.contains("POSIX path"))
    }

    func testSettingDefaultsOn() throws {
        XCTAssertTrue(GeneralSettings().resetViewOnNavigation)
        let old = try JSONDecoder().decode(GeneralSettings.self, from: Data("{}".utf8))
        XCTAssertTrue(old.resetViewOnNavigation)
    }
}
