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
                if !sketch.fits(margin: 1) {
                    let pts = (sketch.body + sketch.overlay).flatMap(\.points)
                    print("SPILL", cast, frame, pts.map(\.x).min()!, pts.map(\.x).max()!, pts.map(\.y).min()!, pts.map(\.y).max()!, sketch.width, sketch.height)
                }
            }
        }
    }

    func testTheRoninHasTheMostFramesAndTheFinestDetail() {
        let hero = Figure.frames(for: .hero)
        for kind in Kind.allCases { XCTAssertGreaterThan(hero.count, Figure.frames(for: .foe(kind)).count) }
        XCTAssertGreaterThan(Figure.pixelHeight(.hero), Figure.pixelHeight(.foe(.grunt)))
        for cut in Cut.allCases {
            XCTAssertEqual(hero.filter { if case .cut(cut, _) = $0 { return true } else { return false } }.count, Frame.cutFrames)
            // The swing leaves a trail; zanshin and the return to guard do not.
            XCTAssertNotNil(Figure.pose(.hero, .cut(cut, 3)).smear)
            XCTAssertNotNil(Figure.pose(.hero, .cut(cut, 4)).smear)
            XCTAssertNil(Figure.pose(.hero, .cut(cut, 8)).smear)
            XCTAssertNil(Figure.pose(.hero, .cut(cut, 9)).smear)
        }
    }

    func testTheFlourishEndsWithTheBladeHomeAndTheDrawBringsItOut() {
        XCTAssertEqual(Figure.pose(.hero, .flourish(0)).sheathed, 0)
        XCTAssertEqual(Figure.pose(.hero, .flourish(Frame.flourishFrames - 1)).sheathed, 1)
        XCTAssertEqual(Figure.pose(.hero, .iai(0)).sheathed, 1)
        XCTAssertGreaterThan(Figure.pose(.hero, .cut(.nukitsuke, 0)).sheathed, 0)
        XCTAssertEqual(Figure.pose(.hero, .cut(.nukitsuke, 3)).sheathed, 0)
    }

    func testTheSwordIsHeldInBothHandsExceptToDrawAndSheathe() {
        XCTAssertEqual(Figure.pose(.hero, .idle(0)).grip, .two)
        for cut in Cut.allCases where cut != .nukitsuke {
            for k in 0..<Frame.cutFrames { XCTAssertEqual(Figure.pose(.hero, .cut(cut, k)).grip, .two, "\(cut) \(k)") }
        }
        XCTAssertEqual(Figure.pose(.hero, .cut(.nukitsuke, 5)).grip, .saya)
        XCTAssertEqual(Figure.pose(.hero, .cut(.nukitsuke, Frame.cutFrames - 1)).grip, .two)
        XCTAssertEqual(Figure.pose(.foe(.warlord), .block).grip, .two)
    }

    func testTheBladeLeadsWithTheHandsAndWhipsThrough() {
        // Partway through the swing the hands are further along than the blade; by the end it has caught up.
        for cut in [Cut.kesa, .gyaku, .shomen, .sune] {
            let keys = Figure.cutKeys(cut)
            let early = Figure.pose(.hero, .cut(cut, 2))
            let bladeShare = (early.blade - keys.from) / (keys.to - keys.from)
            let hand = { (p: Pose) in p.hold ?? .zero }
            let handShare = (hand(early).y - hand(keys.start).y) / (hand(keys.end).y - hand(keys.start).y)
            XCTAssertLessThan(bladeShare, handShare, "\(cut)")
            XCTAssertEqual(Figure.pose(.hero, .cut(cut, 5)).blade, keys.to, accuracy: 0.001)
        }
    }

    func testEachCutSweepsItsOwnWay() {
        let arcs = Cut.allCases.map { Figure.cutKeys($0) }
        for (i, a) in arcs.enumerated() {
            for b in arcs[(i + 1)...] { XCTAssertFalse(a.from == b.from && a.to == b.to) }
        }
        XCTAssertLessThan(Figure.pose(.hero, .cut(.dou, 3)).flat, 1, "the level cut is seen side-on")
        XCTAssertTrue(Figure.pose(.hero, .cut(.tsuki, 4)).smear?.thrust ?? false)
    }

    func testEveryBlowLandsOnTheRoninAndNotThroughHim() {
        // A foe strikes from his weapon's reach, so the point of it has to arrive at the ronin: a thrust stops at his
        // body, a cut may carry across it but not far beyond.
        for kind in Kind.allCases where kind != .archer {
            guard let tip = Figure.tip(.foe(kind), .strike(0)) else { XCTFail("\(kind) has no weapon"); continue }
            let reach = Double(tip.x * Build.of(.foe(kind)).height) * Tuning.figure
            let beyond = kind == .grunt ? 0.02 : 0.08
            print("TIP", kind, reach, kind.range)
            XCTAssertGreaterThan(reach, kind.range - 0.04, "\(kind) falls short")
            XCTAssertLessThan(reach, kind.range + beyond, "\(kind) goes through him")
        }
    }

    func testTheDeadLetGoOfTheirWeaponsWhichLieOnTheirOwn() {
        for kind in Kind.allCases {
            XCTAssertFalse(Figure.pose(.foe(kind), .die(1)).armed)
            let weapon = Figure.weapon(.foe(kind))
            XCTAssertFalse(weapon.isEmpty, "\(kind)")
            XCTAssertTrue(weapon.fits(margin: 1), "\(kind)'s weapon spills off its canvas")
            let box = weapon.bounds(margin: 0)
            XCTAssertGreaterThan(box.width, box.height, "\(kind)'s weapon lies level")
        }
    }

    func testFastFramesAreSmeared() {
        // Through the swing, the arms and blade are repeated back along it under the pose, and the body drags echoes.
        for cut in Cut.allCases {
            for k in [2, 3, 4] {
                let pose = Figure.pose(.hero, .cut(cut, k))
                XCTAssertFalse(pose.ghosts.isEmpty, "\(cut) \(k)")
                XCTAssertFalse(Figure.sketch(.hero, .cut(cut, k)).underlay.isEmpty, "\(cut) \(k)")
            }
            XCTAssertTrue(Figure.sketch(.hero, .cut(cut, 9)).underlay.isEmpty, "the return to guard is clean")
        }
        for kind in Kind.allCases where kind != .archer {
            XCTAssertFalse(Figure.sketch(.foe(kind), .strike(0)).underlay.isEmpty, "\(kind)'s blow")
        }
        XCTAssertTrue(Figure.sketch(.hero, .idle(0)).underlay.isEmpty)
    }

    func testTheSheetIsSVG() {
        let svg = Figure.sketch(.hero, .idle(0)).svg()
        XCTAssertTrue(svg.hasPrefix("<g"))
        XCTAssertTrue(svg.contains("<path"))
    }
}
