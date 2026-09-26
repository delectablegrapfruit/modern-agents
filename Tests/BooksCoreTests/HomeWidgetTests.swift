import Foundation
import XCTest
@testable import BooksCore

/// Home's widgets: their families and sizes, how stored sizes load, the grid's measures and where the widgets go.
final class HomeWidgetTests: XCTestCase {
    private var defaultItems: [(HomeElement, WidgetSize)] {
        let home = HomeSettings()
        return home.visible.map { ($0, home.size(of: $0)) }
    }

    func testFamiliesAndDefaults() {
        XCTAssertEqual(WidgetSize.allCases, [.small, .medium, .large, .extraLarge])
        XCTAssertEqual(WidgetSize.small.span, GridSpan(columns: 1, rows: 1))
        XCTAssertEqual(WidgetSize.medium.span, GridSpan(columns: 2, rows: 1))
        XCTAssertEqual(WidgetSize.large.span, GridSpan(columns: 2, rows: 2))
        XCTAssertEqual(WidgetSize.extraLarge.label, "Extra Large")
        for element in HomeElement.allCases {
            XCTAssertTrue(element.families.contains(element.defaultSize), "\(element) comes in its own default size")
            XCTAssertEqual(element.families, WidgetSize.allCases.filter { element.families.contains($0) }, "\(element) lists its sizes smallest first")
            XCTAssertFalse(element.symbol.isEmpty)
            XCTAssertTrue(element.galleryDescription.hasSuffix("."), "\(element) is described in a sentence")
            XCTAssertEqual(element.detail, element.galleryDescription)
        }
        XCTAssertEqual(HomeElement.activity.families, [.medium, .large, .extraLarge], "a heat map has no small size")
        XCTAssertEqual(HomeElement.progress.families, [.small, .medium])
        XCTAssertEqual(HomeElement.allCases.filter(\.isConfigurable), [.goals, .progress])
        let home = HomeSettings()
        XCTAssertEqual(home.visible, [.continueReading, .goals, .activity, .recentlyAdded])
        XCTAssertEqual(home.visible.map { home.size(of: $0) }, [.large, .medium, .medium, .extraLarge])
        XCTAssertEqual(home.size(of: .progress), .small)
        XCTAssertEqual(home.size(of: .calendar), .small)
        XCTAssertEqual(home.size(of: .forYou), .medium)
    }

    func testStoredSizesLoad() throws {
        let legacy = try JSONDecoder().decode(HomeSettings.self, from: Data(#"{"sizes": {"continueReading": "wide", "statistics": "wide", "goals": "small"}}"#.utf8))
        XCTAssertEqual(legacy.size(of: .continueReading), .extraLarge, "the old full-row size is extra large")
        XCTAssertEqual(legacy.size(of: .statistics), .medium, "a size the widget no longer takes gives way to its default")
        XCTAssertEqual(legacy.size(of: .goals), .small)

        let odd = try JSONDecoder().decode(HomeSettings.self, from: Data(#"{"sizes": {"goals": "small", "calendar": "enormous", "activity": 3, "recentlyAdded": "large"}}"#.utf8))
        XCTAssertEqual(odd.size(of: .goals), .small, "one bad value does not cost the others")
        XCTAssertEqual(odd.size(of: .calendar), .small)
        XCTAssertEqual(odd.size(of: .activity), .medium)
        XCTAssertEqual(odd.size(of: .recentlyAdded), .large)
        XCTAssertNil(odd.sizes["calendar"])

        var chosen = HomeSettings()
        chosen.setSize(.extraLarge, for: .activity)
        chosen.setSize(.extraLarge, for: .goals)
        XCTAssertEqual(chosen.size(of: .goals), .medium, "a size the widget does not come in is refused")
        let data = try JSONEncoder().encode(chosen)
        XCTAssertTrue(String(decoding: data, as: UTF8.self).contains("\"extraLarge\""))
        let back = try JSONDecoder().decode(HomeSettings.self, from: data)
        XCTAssertEqual(back, chosen)
        XCTAssertEqual(back.size(of: .activity), .extraLarge)
        XCTAssertThrowsError(try JSONDecoder().decode([WidgetSize].self, from: Data(#"["huge"]"#.utf8)))
        XCTAssertEqual(try JSONDecoder().decode([WidgetSize].self, from: Data(#"["wide", "small"]"#.utf8)), [.extraLarge, .small])
    }

    func testGridMeasures() {
        XCTAssertEqual(HomeGrid.columns(forWidth: 892), 4)
        XCTAssertEqual(HomeGrid.unit(forWidth: 892, columns: 4), 208, "the default window: four units of 208")
        XCTAssertEqual(HomeGrid.columns(forWidth: 384), 2)
        XCTAssertEqual(HomeGrid.unit(forWidth: 384, columns: 2), 182, "the narrowest window with the widest sidebar")
        XCTAssertEqual(HomeGrid.columns(forWidth: 659), 2)
        XCTAssertEqual(HomeGrid.columns(forWidth: 660), 4)
        XCTAssertEqual(HomeGrid.unit(forWidth: 704, columns: 4), 161)
        XCTAssertEqual(HomeGrid.unit(forWidth: 1400, columns: 4), 240, "units stop growing and the grid is centred")
        XCTAssertEqual(WidgetSize.extraLarge.fitting(columns: 2, supported: HomeElement.recentlyAdded.families), .large)
        XCTAssertEqual(WidgetSize.extraLarge.fitting(columns: 4, supported: HomeElement.recentlyAdded.families), .extraLarge)
        XCTAssertEqual(WidgetSize.medium.fitting(columns: 2, supported: HomeElement.activity.families), .medium)
        XCTAssertEqual(WidgetSize.extraLarge.fitting(columns: 2, supported: [.small, .medium]), .medium)
    }

    func testDefaultHomeFillsFourByFour() {
        let four = HomeGrid.place(defaultItems, columns: 4)
        XCTAssertEqual(four, [
            HomePlacement(element: .continueReading, size: .large, column: 0, row: 0),
            HomePlacement(element: .goals, size: .medium, column: 2, row: 0),
            HomePlacement(element: .activity, size: .medium, column: 2, row: 1),
            HomePlacement(element: .recentlyAdded, size: .extraLarge, column: 0, row: 2),
        ])
        XCTAssertEqual(HomeGrid.rows(four), 4)

        let two = HomeGrid.place(defaultItems, columns: 2)
        XCTAssertEqual(two, [
            HomePlacement(element: .continueReading, size: .large, column: 0, row: 0),
            HomePlacement(element: .goals, size: .medium, column: 0, row: 2),
            HomePlacement(element: .activity, size: .medium, column: 0, row: 3),
            HomePlacement(element: .recentlyAdded, size: .large, column: 0, row: 4),
        ], "a narrow Home stacks the widgets and draws the extra large one large")
        XCTAssertEqual(HomeGrid.rows(two), 6)
        XCTAssertTrue(HomeGrid.place([], columns: 4).isEmpty)
        XCTAssertEqual(HomeGrid.rows([]), 0)
    }

    func testPlacementFillsHoles() {
        // A medium leaves half a row; the extra large goes below, and the smalls after it come back to fill the hole.
        let placed = HomeGrid.place([(.goals, .medium), (.recentlyAdded, .extraLarge), (.calendar, .small), (.progress, .small), (.statistics, .small)], columns: 4)
        XCTAssertEqual(placed.map(\.column), [0, 0, 2, 3, 0])
        XCTAssertEqual(placed.map(\.row), [0, 1, 0, 0, 3])
        // A small beside a large slots in next to it; the one after fills the square under it.
        let beside = HomeGrid.place([(.continueReading, .large), (.calendar, .small), (.progress, .small), (.goals, .small), (.statistics, .small), (.activity, .medium)], columns: 4)
        XCTAssertEqual(beside.map(\.column), [0, 2, 3, 2, 3, 0])
        XCTAssertEqual(beside.map(\.row), [0, 0, 0, 1, 1, 2])
        // Fewer than two columns are never asked for; the grid keeps two.
        let narrow = HomeGrid.place([(.activity, .medium)], columns: 1)
        XCTAssertEqual(narrow.first, HomePlacement(element: .activity, size: .medium, column: 0, row: 0))
    }

    func testAddingAndMovingWidgets() {
        var home = HomeSettings()
        home.add(.statistics, size: .small)
        XCTAssertEqual(home.visible, [.continueReading, .goals, .activity, .recentlyAdded, .statistics], "a widget added from the gallery joins at the end")
        XCTAssertEqual(home.size(of: .statistics), .small)
        home.add(.goals, size: .large)
        XCTAssertEqual(home.visible.first(where: { $0 != .continueReading }), .goals, "a widget already shown keeps its place")
        XCTAssertEqual(home.size(of: .goals), .large)

        home.move(.continueReading, to: .goals)
        XCTAssertEqual(Array(home.visible.prefix(2)), [.goals, .continueReading], "dragged forward, a widget goes after the one it lands on")
        home.move(.statistics, to: .goals)
        XCTAssertEqual(Array(home.visible.prefix(3)), [.statistics, .goals, .continueReading], "dragged back, it goes before")
        home.move(.goals, to: .goals)
        XCTAssertEqual(home.visible.first, .statistics)
        home.moveToEnd(.statistics)
        XCTAssertEqual(home.elements.last, .statistics)
        XCTAssertEqual(home.elements.count, HomeElement.allCases.count)
    }

    func testMonthGridAndHeat() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        calendar.firstWeekday = 2
        var c = DateComponents()
        c.year = 2026; c.month = 9; c.day = 15; c.hour = 12
        let september = calendar.date(from: c)!
        // The day by its key, so the test does not hang on the time zone of the machine running it.
        let stats = ReadingStats(days: [DailyReading(day: "2026-09-15", seconds: 600, pages: 4)])
        let weeks = stats.monthWeeks(containing: september, calendar: calendar)
        XCTAssertEqual(weeks.count, 5, "September 2026 starts on a Tuesday and fits five weeks")
        XCTAssertTrue(weeks.allSatisfy { $0.count == 7 })
        XCTAssertNil(weeks[0][0])
        XCTAssertEqual(weeks[0][1]?.day, "2026-09-01")
        XCTAssertEqual(weeks[2][1]?.seconds, 600)
        XCTAssertEqual(weeks[4][2]?.day, "2026-09-30")
        XCTAssertNil(weeks[4][3])
        c.month = 8
        let august = stats.monthWeeks(containing: calendar.date(from: c)!, calendar: calendar)
        XCTAssertEqual(august.count, 6, "August 2026 starts on a Saturday and needs six weeks")
        XCTAssertEqual(august[0][5]?.day, "2026-08-01")
        calendar.firstWeekday = 1
        XCTAssertEqual(stats.monthWeeks(containing: september, calendar: calendar)[0][2]?.day, "2026-09-01", "weeks starting on Sunday")

        XCTAssertEqual(ReadingStats.heatLevel(seconds: 0, peak: 100), 0)
        XCTAssertEqual(ReadingStats.heatLevel(seconds: 0, pages: 3, peak: 100), 1, "pages without time still show")
        XCTAssertEqual(ReadingStats.heatLevel(seconds: 25, peak: 100), 1)
        XCTAssertEqual(ReadingStats.heatLevel(seconds: 26, peak: 100), 2)
        XCTAssertEqual(ReadingStats.heatLevel(seconds: 75, peak: 100), 3)
        XCTAssertEqual(ReadingStats.heatLevel(seconds: 100, peak: 100), 4)
        XCTAssertEqual(ReadingStats.heatLevel(seconds: 500, peak: 100), 4)
        XCTAssertEqual(ReadingStats.heatLevel(seconds: 10, peak: 0), 1)
    }
}
