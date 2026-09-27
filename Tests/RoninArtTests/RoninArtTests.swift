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
            for k in 0..<Frame.recoverFrames { XCTAssertNil(Figure.pose(.hero, .recover(cut, k)).smear) }
        }
    }

    func testTheRoninStepsBackIntoGuardAFootAtATime() {
        // Each step back lifts the foot that moves; the other stays on the ground. Zanshin keeps the lunge's footing.
        let ground: CGFloat = 0.004
        for cut in Cut.allCases {
            let end = Figure.footing(.hero, .cut(cut, 5)), zanshin = Figure.footing(.hero, .cut(cut, Frame.cutFrames - 1))
            XCTAssertEqual(end.front.x, zanshin.front.x, accuracy: 0.001, "\(cut)")
            XCTAssertEqual(end.back.x, zanshin.back.x, accuracy: 0.001, "\(cut)")
            let steps = (0..<Frame.recoverFrames).map { Figure.footing(.hero, .recover(cut, $0)) }
            XCTAssertLessThan(steps[0].back.y, ground, "\(cut)")
            XCTAssertGreaterThan(steps[0].front.y, 0.03, "\(cut)")
            XCTAssertLessThan(steps[1].front.y, ground, "\(cut)")
            XCTAssertGreaterThan(steps[1].back.y, 0.02, "\(cut)")
            XCTAssertLessThan(steps[2].front.y, ground, "\(cut)")
            XCTAssertGreaterThan(steps[2].back.y, 0.03, "\(cut)")
            XCTAssertLessThan(steps[3].back.y, ground, "\(cut)")
            XCTAssertGreaterThan(steps[3].front.y, 0.03, "\(cut)")
        }
        // Worn out, he stands on the same footing as his guard, so nothing slides as he sags and heaves.
        let home = Figure.footing(.hero, .idle(0))
        for v in 0..<Frame.windedCycles {
            for k in 0..<Frame.windedFrames {
                let feet = Figure.footing(.hero, .winded(v, k))
                XCTAssertEqual(feet.front.x, home.front.x, accuracy: 0.002, "winded \(v) \(k)")
                XCTAssertEqual(feet.back.x, home.back.x, accuracy: 0.002, "winded \(v) \(k)")
                XCTAssertLessThan(max(feet.front.y, feet.back.y), ground, "winded \(v) \(k)")
            }
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
        XCTAssertEqual(Figure.pose(.hero, .recover(.nukitsuke, 1)).grip, .two)
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
            XCTAssertTrue(Figure.sketch(.hero, .recover(cut, 1)).underlay.isEmpty, "the return to guard is clean")
        }
        for kind in Kind.allCases where kind != .archer {
            XCTAssertFalse(Figure.sketch(.foe(kind), .strike(0)).underlay.isEmpty, "\(kind)'s blow")
        }
        XCTAssertTrue(Figure.sketch(.hero, .idle(0)).underlay.isEmpty)
    }

    func testTheDeadLieEachTheirOwnWay() {
        for kind in Kind.allCases {
            var outlines = Set<String>()
            for seed in 0..<6 {
                let body = Figure.corpse(.foe(kind), seed: UInt64(seed))
                XCTAssertFalse(body.isEmpty)
                XCTAssertTrue(body.fits(margin: 1), "\(kind) corpse \(seed) spills off its canvas")
                // Lying down: wider than tall.
                let box = body.bounds(margin: 0)
                XCTAssertGreaterThan(box.width, box.height * 0.9, "\(kind) corpse \(seed) is not lying down")
                outlines.insert(body.svg())
            }
            XCTAssertEqual(outlines.count, 6, "\(kind): every body falls its own way")
            for variant in 1..<4 { XCTAssertTrue(Figure.sketch(.foe(kind), pose: Figure.struck(.foe(kind), variant: variant)).fits(margin: 1)) }
        }
    }

    func testTheDeadCollapseUnderTheirOwnWeightAndComeToRestOnTheGround() {
        for kind in Kind.allCases {
            let cast = Cast.foe(kind)
            var rng = SeededRNG(seed: 7 &+ UInt64(kind.rawValue.count))
            var rests: [[CGPoint]] = []
            for k in 0..<8 {
                let pose = Figure.struck(cast, variant: k % 5)
                var doll: Ragdoll
                switch k % 4 {
                case 0: doll = Ragdoll.felled(cast, pose: pose, back: -1, rng: &rng)
                case 1: doll = Ragdoll.cut(cast, pose: pose, .above(at: 0.5, slant: 0.6), back: -1, rng: &rng)
                case 2: doll = Ragdoll.cut(cast, pose: pose, .below(at: 0.3, slant: 0.05), back: -1, rng: &rng)
                default: doll = Ragdoll.cut(cast, pose: pose, .headless, back: -1, rng: &rng)
                }
                if k % 4 >= 2 {
                    // Standing on its planted feet until let go.
                    doll.advance(0.5)
                    XCTAssertFalse(doll.settled, "\(kind) \(k) stands")
                    doll.collapse(rng: &rng)
                }
                var t = 0.0
                while !doll.settled, t < 6 {
                    doll.advance(1.0 / 60)
                    t += 1.0 / 60
                    for j in 0..<11 where doll.has(j) { XCTAssertGreaterThan(doll.points[j].y, -0.01, "\(kind) \(k) through the ground") }
                }
                XCTAssertTrue(doll.settled, "\(kind) \(k) never came to rest")
                XCTAssertLessThan(doll.hip.y, 0.35, "\(kind) \(k) is not down")
                // Drawn from its pose, the body is where the skeleton is.
                let drawn = Figure.skeleton(cast, doll.pose())
                for j in 0..<11 where doll.has(j) && j != Ragdoll.low && j != Ragdoll.high {
                    XCTAssertEqual(drawn[j].x, doll.points[j].x, accuracy: 0.02, "\(kind) \(k) joint \(j)")
                    XCTAssertEqual(drawn[j].y, doll.points[j].y, accuracy: 0.02, "\(kind) \(k) joint \(j)")
                }
                let sketch = Figure.sketch(cast, pose: doll.framed().pose)
                XCTAssertFalse(sketch.isEmpty)
                XCTAssertTrue(sketch.fits(margin: 1), "\(kind) \(k) spills off its canvas \(sketch.bounds(margin: 0)) \(doll.hip)")
                rests.append(doll.points)
            }
            // No two come to rest alike.
            for a in 0..<rests.count {
                for b in (a + 1)..<rests.count where a % 4 == b % 4 {
                    let apart = zip(rests[a], rests[b]).map { hypot($0.x - $1.x, $0.y - $1.y) }.max() ?? 0
                    XCTAssertGreaterThan(apart, 0.05, "\(kind): \(a) and \(b) lie alike")
                }
            }
        }
    }

    func testFeetKeepToTheGround() {
        // A foe's walk advances a frame for each twelfth of its stride, which must be about what its legs cover.
        for kind in Kind.allCases {
            let stride = Figure.stride(.foe(kind))
            XCTAssertGreaterThan(stride, 0.5, "\(kind)")
            XCTAssertLessThan(stride, 1.6, "\(kind)")
        }
    }

    func testTheSheetIsSVG() {
        let svg = Figure.sketch(.hero, .idle(0)).svg()
        XCTAssertTrue(svg.hasPrefix("<g"))
        XCTAssertTrue(svg.contains("<path"))
    }
}
