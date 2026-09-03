import XCTest
@testable import WinnowCore

final class FinderDefaultsTests: XCTestCase {
    func testMergeCreatesTemplateWithVisibleSortColumn() {
        var d = FinderDefaults()
        d.sortKey = .dateAdded
        d.ascending = false
        let merged = d.mergedStandardViewSettings(into: nil)

        let list = merged["ListViewSettings"] as! [String: Any]
        XCTAssertEqual(list["sortColumn"] as? String, "dateAdded")
        let columns = list["columns"] as! [String: Any]
        XCTAssertEqual(columns.count, 10)
        let column = columns["dateAdded"] as! [String: Any]
        XCTAssertEqual(column["visible"] as? Bool, true)
        XCTAssertEqual(column["ascending"] as? Bool, false)
        XCTAssertEqual((columns["name"] as! [String: Any])["visible"] as? Bool, true)

        let extended = merged["ExtendedListViewSettingsV2"] as! [String: Any]
        XCTAssertEqual(extended["sortColumn"] as? String, "dateAdded")
        let extendedColumns = extended["columns"] as! [[String: Any]]
        XCTAssertEqual(extendedColumns.count, 10)
        let added = extendedColumns.first { $0["identifier"] as? String == "dateAdded" }!
        XCTAssertEqual(added["visible"] as? Bool, true)
        XCTAssertEqual(added["ascending"] as? Bool, false)

        XCTAssertEqual((merged["IconViewSettings"] as! [String: Any])["arrangeBy"] as? String, "dateAdded")
        XCTAssertEqual((merged["GalleryViewSettings"] as! [String: Any])["arrangeBy"] as? String, "dateAdded")
    }

    func testMergePreservesWhatFinderAlreadyStored() {
        let existing: [String: Any] = [
            "IconViewSettings": ["backgroundType": 2, "backgroundImageAlias": "x", "arrangeBy": "none"],
            "ListViewSettings": [
                "textSize": 14.0, "sortColumn": "name",
                "columns": ["name": ["visible": true, "ascending": true, "index": 0, "width": 250]],
            ],
            "ExtendedListViewSettingsV2": [
                "columns": [["identifier": "name", "visible": true, "ascending": true, "index": 0, "width": 250]],
            ],
        ]
        var d = FinderDefaults()
        d.sortKey = .size
        d.options.icon.iconSize = 128
        d.options.list.textSize = 14
        let merged = d.mergedStandardViewSettings(into: existing)

        let icon = merged["IconViewSettings"] as! [String: Any]
        XCTAssertEqual(icon["iconSize"] as? Double, 128.0)
        XCTAssertEqual(icon["backgroundType"] as? Int, 2)
        XCTAssertEqual(icon["backgroundImageAlias"] as? String, "x")
        XCTAssertEqual(icon["arrangeBy"] as? String, "size")

        let list = merged["ListViewSettings"] as! [String: Any]
        XCTAssertEqual(list["textSize"] as? Double, 14.0)
        let columns = list["columns"] as! [String: Any]
        XCTAssertEqual((columns["name"] as! [String: Any])["width"] as? Int, 250)
        XCTAssertEqual((columns["size"] as! [String: Any])["visible"] as? Bool, true)

        let extendedColumns = (merged["ExtendedListViewSettingsV2"] as! [String: Any])["columns"] as! [[String: Any]]
        XCTAssertEqual(extendedColumns.count, 2)
        XCTAssertEqual(extendedColumns.last?["identifier"] as? String, "size")
        XCTAssertEqual(extendedColumns.last?["visible"] as? Bool, true)
    }

    func testColumnViewCodes() {
        XCTAssertEqual(FinderSortKey.name.columnViewCode, "dnam")
        XCTAssertEqual(FinderSortKey.kind.columnViewCode, "kipl")
        XCTAssertNil(FinderSortKey.dateAdded.columnViewCode)

        var d = FinderDefaults()
        d.sortKey = .dateModified
        XCTAssertEqual(d.mergedColumnViewOptions(into: nil)["ArrangeBy"] as? String, "dmod")
        d.sortKey = .dateAdded
        let kept = d.mergedColumnViewOptions(into: ["ArrangeBy": "dnam", "FontSize": 13])
        XCTAssertEqual(kept["ArrangeBy"] as? String, "dnam")
        XCTAssertEqual(kept["FontSize"] as? Int, 13)
    }

    func testDefaultsAndLabels() {
        XCTAssertTrue(FinderSortKey.name.defaultAscending)
        XCTAssertFalse(FinderSortKey.dateModified.defaultAscending)
        XCTAssertEqual(FinderDefaults().sortLabel, "Name")
        XCTAssertEqual(FinderGroupBy.dateModified.rawValue, "Date Modified")
        XCTAssertEqual(FinderDefaults(), FinderDefaults())
    }
}
