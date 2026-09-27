import XCTest
import RoninCore
@testable import RoninArt

final class RoninArtTests: XCTestCase {
    private let casts: [Cast] = [.hero] + Kind.allCases.map { .foe($0) }

    func testEveryFrameDrawsSomethingAndStaysOnItsCanvas() {
        for cast in casts {
            for frame in Figure.frames(for: cast) {
                let sketch = Figure.sketch(cast, frame)
                XCTAssertFalse(sketch.isEmpty, "\(cast) \(frame)")
                XCTAssertTrue(sketch.fits(margin: 1), "\(cast) \(frame) spills off its canvas")
            }
        }
    }

    func testTheRoninHasTheMostFramesAndTheFinestDetail() {
        let hero = Figure.frames(for: .hero)
        for kind in Kind.allCases { XCTAssertGreaterThan(hero.count, Figure.frames(for: .foe(kind)).count) }
        XCTAssertGreaterThan(Figure.pixelHeight(.hero), Figure.pixelHeight(.foe(.grunt)))
        for cut in Cut.allCases {
            XCTAssertEqual(hero.filter { if case .cut(cut, _) = $0 { return true } else { return false } }.count, Frame.cutFrames)
            // The swing leaves a trail; the settle does not.
            XCTAssertNotNil(Figure.pose(.hero, .cut(cut, 1)).smear)
            XCTAssertNil(Figure.pose(.hero, .cut(cut, 5)).smear)
        }
    }

    func testTheFlourishEndsWithTheBladeHome() {
        XCTAssertEqual(Figure.pose(.hero, .flourish(0)).sheathed, 0)
        XCTAssertEqual(Figure.pose(.hero, .flourish(Frame.flourishFrames - 1)).sheathed, 1)
    }

    func testEachCutSweepsItsOwnWay() {
        let arcs = Cut.allCases.map { Figure.cutKeys($0) }
        for (i, a) in arcs.enumerated() {
            for b in arcs[(i + 1)...] { XCTAssertFalse(a.from == b.from && a.to == b.to) }
        }
    }

    func testTheSheetIsSVG() {
        let svg = Figure.sketch(.hero, .idle(0)).svg()
        XCTAssertTrue(svg.hasPrefix("<g"))
        XCTAssertTrue(svg.contains("<path"))
    }
}
