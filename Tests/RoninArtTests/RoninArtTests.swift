import XCTest
import RoninCore
@testable import RoninArt

final class RoninArtTests: XCTestCase {
    private let casts: [Cast] = [.hero] + Kind.allCases.map { .foe($0) }

    /// How far a sketch's figure and overlay reach (quadratic curves followed, not their control points; strokes
    /// widened), in its pixels.
    private func extent(_ sketch: Sketch) -> (minX: CGFloat, maxX: CGFloat, minY: CGFloat, maxY: CGFloat) {
        var minX = CGFloat.infinity, maxX = -CGFloat.infinity, minY = CGFloat.infinity, maxY = -CGFloat.infinity
        func add(_ p: CGPoint, _ grow: CGFloat) {
            minX = min(minX, p.x - grow)
            maxX = max(maxX, p.x + grow)
            minY = min(minY, p.y - grow)
            maxY = max(maxY, p.y + grow)
        }
        for shape in sketch.body + sketch.overlay {
            let grow = shape.stroke == nil ? 0 : shape.width / 2
            switch shape.kind {
            case .ellipse(let r):
                add(CGPoint(x: r.minX, y: r.minY), grow)
                add(CGPoint(x: r.maxX, y: r.maxY), grow)
            case .path(let path):
                var last = CGPoint.zero
                for segment in path.segments {
                    switch segment {
                    case .move(let p), .line(let p):
                        add(p, grow)
                        last = p
                    case .quad(let p, let c):
                        for i in 0...10 {
                            let t = CGFloat(i) / 10
                            add(CGPoint(x: (1 - t) * (1 - t) * last.x + 2 * (1 - t) * t * c.x + t * t * p.x,
                                        y: (1 - t) * (1 - t) * last.y + 2 * (1 - t) * t * c.y + t * t * p.y), grow)
                        }
                        last = p
                    case .close:
                        break
                    }
                }
            }
        }
        return (minX, maxX, minY, maxY)
    }

    /// The shapes of a sketch's figure filled with a colour.
    private func filled(_ sketch: Sketch, _ rgb: RGB) -> [Shape] { sketch.body.filter { $0.fill?.rgb == rgb } }

    /// The frames of a cut swung fastest (the blade whipping through the middle of its arc).
    private func fast(_ cut: Cut) -> [Int] { cut == .nukitsuke ? [4, 5] : [3, 4] }

    /// How opaque shapes laid one over another are at a point (their outlines taken as polygons, filled as Core
    /// Graphics and SVG fill them: wherever the outline winds round the point).
    private func coverage(_ shapes: [Shape], at p: CGPoint) -> CGFloat {
        var clear: CGFloat = 1
        for shape in shapes {
            guard let fill = shape.fill, case .path(let path) = shape.kind else { continue }
            let points = path.points
            var winding = 0
            for (i, a) in points.enumerated() {
                let b = points[(i + 1) % points.count]
                guard (a.y > p.y) != (b.y > p.y), p.x < a.x + (p.y - a.y) / (b.y - a.y) * (b.x - a.x) else { continue }
                winding += b.y > a.y ? 1 : -1
            }
            if winding != 0 { clear *= 1 - fill.alpha }
        }
        return 1 - clear
    }

    func testEveryFrameDrawsSomethingAndStaysOnItsCanvas() {
        for cast in casts {
            for frame in Figure.frames(for: cast) {
                let sketch = Figure.sketch(cast, frame)
                XCTAssertFalse(sketch.isEmpty, "\(cast) \(frame)")
                let e = extent(sketch)
                XCTAssertTrue(sketch.fits(margin: 1),
                              "\(cast) \(frame) spills off its \(sketch.width)x\(sketch.height) canvas: x \(e.minX)...\(e.maxX), y \(e.minY)...\(e.maxY)")
            }
        }
    }

    func testNothingOnItsFeetGoesThroughTheGroundOrAboveTheLane() {
        // The lane runs 0.84 of the field up from the bottom and a figure stands 0.16 up it, a ronin being 0.52 of the
        // field tall: 1.615 ronin heights of room over the feet, under the header. Only a blow's trail (a tenth of a
        // second) and a leap (drawn at the top of its arc) may go past it.
        for cast in casts {
            let H = Figure.pixelHeight(cast) * Build.of(cast).height
            for frame in Figure.frames(for: cast) {
                let e = extent(Figure.sketch(cast, frame))
                XCTAssertGreaterThan((e.minY - Figure.feet.y * H) / H, -0.015, "\(cast) \(frame) goes through the ground")
                switch frame {
                case .strike(0), .strike(1), .leap: continue
                default: break
                }
                let top = (e.maxY - Figure.feet.y * H) / H * Build.of(cast).height
                XCTAssertLessThan(top, 1.6, "\(cast) \(frame) rises into the header")
            }
        }
    }

    func testTheRoninHasTheMostFramesAndTheFinestDetail() {
        let hero = Figure.frames(for: .hero)
        for kind in Kind.allCases { XCTAssertGreaterThan(hero.count, Figure.frames(for: .foe(kind)).count) }
        XCTAssertGreaterThan(Figure.pixelHeight(.hero), Figure.pixelHeight(.foe(.grunt)))
        for cut in Cut.allCases {
            XCTAssertEqual(hero.filter { if case .cut(cut, _) = $0 { return true } else { return false } }.count, Frame.cutFrames)
            XCTAssertEqual(hero.filter { if case .chain(cut, _) = $0 { return true } else { return false } }.count,
                           cut == .nukitsuke ? 0 : Frame.chainFrames, "\(cut)")
            // The swing leaves a trail; zanshin and the return to guard do not.
            for k in fast(cut) { XCTAssertNotNil(Figure.pose(.hero, .cut(cut, k)).smear, "\(cut) \(k)") }
            XCTAssertNil(Figure.pose(.hero, .cut(cut, 8)).smear)
            for k in 0..<Frame.recoverFrames { XCTAssertNil(Figure.pose(.hero, .recover(cut, k)).smear) }
        }
    }

    func testTheRoninStepsBackIntoGuardAFootAtATime() {
        // Each step back lifts the foot that moves; the other stays on the ground. Zanshin keeps the lunge's footing.
        let ground: CGFloat = 0.004
        let home = Figure.footing(.hero, .idle(0))
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
            // From a short lunge the back foot is drawn up to over its place in guard (for a reach of about 0.05).
            XCTAssertEqual(steps[2].back.x, home.back.x - 0.07, accuracy: 0.01, "\(cut)")
            // The push-off: both feet where the lunge put them, on the ground, the hips going back over the back one.
            XCTAssertEqual(steps[4].front.x, zanshin.front.x, accuracy: 0.002, "\(cut)")
            XCTAssertEqual(steps[4].back.x, zanshin.back.x, accuracy: 0.002, "\(cut)")
            XCTAssertLessThan(max(steps[4].front.y, steps[4].back.y), ground, "\(cut)")
            XCTAssertLessThan(Figure.pose(.hero, .recover(cut, 4)).shift, Figure.pose(.hero, .cut(cut, Frame.cutFrames - 1)).shift, "\(cut)")
            // For a middling lunge, the front foot lifted back not as far, from the same back foot as the long way.
            XCTAssertEqual(steps[5].back.x, steps[0].back.x, accuracy: 0.002, "\(cut)")
            XCTAssertLessThan(steps[5].back.y, ground, "\(cut)")
            XCTAssertGreaterThan(steps[5].front.y, 0.05, "\(cut)")
        }
        // Worn out, he stands on the same footing as his guard, so nothing slides as he sags and heaves.
        for v in 0..<Frame.windedCycles {
            for k in 0..<Frame.windedFrames {
                let feet = Figure.footing(.hero, .winded(v, k))
                XCTAssertEqual(feet.front.x, home.front.x, accuracy: 0.002, "winded \(v) \(k)")
                XCTAssertEqual(feet.back.x, home.back.x, accuracy: 0.002, "winded \(v) \(k)")
                XCTAssertLessThan(max(feet.front.y, feet.back.y), ground, "winded \(v) \(k)")
            }
        }
    }

    func testTheRoninStepsHomeAFootAtATime() {
        // Back: the front foot lifted back over the planted back one, then set down as the back one follows.
        // Forward: the back foot drawn up under the planted front one, then the front stepped out into guard.
        let ground: CGFloat = 0.004, lifted: CGFloat = 0.05
        let s = (0..<Frame.shuffleFrames).map { Figure.footing(.hero, .shuffle($0)) }
        XCTAssertEqual(s.count, 4)
        XCTAssertLessThan(s[0].back.y, ground)
        XCTAssertGreaterThan(s[0].front.y, lifted)
        XCTAssertLessThan(s[1].front.y, ground)
        XCTAssertGreaterThan(s[1].back.y, lifted)
        XCTAssertLessThan(s[2].front.y, ground)
        XCTAssertGreaterThan(s[2].back.y, lifted)
        XCTAssertLessThan(s[3].back.y, ground)
        XCTAssertGreaterThan(s[3].front.y, lifted)
        // Drawn up narrower than any stance a blow leaves him in, so the back foot only travels forward.
        let spread = { (f: (front: CGPoint, back: CGPoint)) in f.front.x - f.back.x }
        for f in [Frame.hurt(Frame.hurtFrames - 1), .reel(0, Frame.reelFrames - 1), .reel(1, Frame.reelFrames - 1), .repelled(1)] {
            XCTAssertGreaterThan(spread(Figure.footing(.hero, f)), spread(s[1]) + 0.02, "\(f)")
        }
    }

    func testKneesBendOnlyForward() {
        // Outside the stride (whose swinging leg reaches out straight to land), no knee is drawn bowed backward.
        for cast in [Cast.hero] + Kind.allCases.map({ Cast.foe($0) }) {
            for frame in Figure.frames(for: cast) {
                if case .walk = frame { continue }
                let p = Figure.pose(cast, frame)
                XCTAssertGreaterThan(p.front.thigh - p.front.shin, -0.05, "\(cast) \(frame): front knee")
                XCTAssertGreaterThan(p.back.thigh - p.back.shin, -0.05, "\(cast) \(frame): back knee")
            }
        }
    }

    func testAFoeStandsOnTheGroundAndIsRockedBackWhereHeStands() {
        for kind in Kind.allCases {
            let cast = Cast.foe(kind)
            // On his feet (not striding or in the air), always a foot on the ground: never floating over it.
            for frame in Figure.frames(for: cast) {
                if case .walk = frame { continue }
                if frame == .leap { continue }
                let feet = Figure.footing(cast, frame)
                XCTAssertLessThan(min(feet.front.y, feet.back.y), 0.004, "\(kind) \(frame) floats")
            }
            // A blow (or the freeze of a killing one) rocks him back over his own stance's footing: his feet stay.
            let home = Figure.footing(cast, .idle(0)), struck = Figure.footing(cast, .stagger(0))
            XCTAssertEqual(struck.front.x, home.front.x, accuracy: 0.002, "\(kind)")
            XCTAssertEqual(struck.back.x, home.back.x, accuracy: 0.002, "\(kind)")
            // Coiling to strike, the feet stay where they were, but for a foot lifted to step in.
            let coiled = Figure.footing(cast, .windup(Frame.windupFrames - 1)), before = Figure.footing(cast, .windup(Frame.windupFrames - 2))
            if coiled.front.y < 0.01, before.front.y < 0.01 { XCTAssertEqual(coiled.front.x, before.front.x, accuracy: 0.01, "\(kind)") }
        }
    }

    func testTheFlourishTheBlowThatFellsHimAndAParryLeaveHisFeetWhereTheyStand() {
        // The chiburi and the nōtō are done over his guard's footing, the body sinking and rising; the blow that fells
        // him takes him where he stands in guard; thrown back off a guard, he comes down off his heels where he landed.
        let home = Figure.footing(.hero, .idle(0))
        for k in 0..<Frame.flourishFrames {
            let feet = Figure.footing(.hero, .flourish(k))
            XCTAssertEqual(feet.front.x, home.front.x, accuracy: 0.002, "flourish \(k)")
            XCTAssertEqual(feet.back.x, home.back.x, accuracy: 0.002, "flourish \(k)")
            XCTAssertEqual(feet.back.y, home.back.y, accuracy: 0.002, "flourish \(k)")
        }
        let hips = (0..<Frame.flourishFrames).map { Figure.skeleton(.hero, Figure.pose(.hero, .flourish($0)))[0].y }
        XCTAssertLessThan(hips[3], hips[1] - 0.03, "the snap of the chiburi sinks him")
        XCTAssertGreaterThan(hips[Frame.flourishFrames - 1], hips[3] + 0.03, "the blade home, he rises")
        let struck = Figure.footing(.hero, .fall(0))
        XCTAssertEqual(struck.front.x, home.front.x, accuracy: 0.002)
        XCTAssertEqual(struck.back.x, home.back.x, accuracy: 0.002)
        let rocked = Figure.footing(.hero, .repelled(0)), down = Figure.footing(.hero, .repelled(1))
        XCTAssertEqual(down.front.x, rocked.front.x, accuracy: 0.002)
        XCTAssertEqual(down.back.x, rocked.back.x, accuracy: 0.002)
        XCTAssertLessThan(max(down.front.y, down.back.y), 0.004)
    }

    func testAChainedCutSwingsFromTheLungeItStandsIn() {
        // Swung again from the lunge, the feet stay where it put them; only the body, the arms and the blade come
        // round, smeared as ever, with no drag of the body.
        for cut in Cut.allCases where cut != .nukitsuke {
            let zanshin = Figure.footing(.hero, .cut(cut, Frame.cutFrames - 1))
            for k in 0..<Frame.chainFrames {
                let feet = Figure.footing(.hero, .chain(cut, k))
                XCTAssertEqual(feet.front.x, zanshin.front.x, accuracy: 0.001, "\(cut) chain \(k)")
                XCTAssertEqual(feet.back.x, zanshin.back.x, accuracy: 0.001, "\(cut) chain \(k)")
                XCTAssertLessThan(feet.front.y, 0.004, "\(cut) chain \(k)")
                XCTAssertEqual(Figure.pose(.hero, .chain(cut, k)).drag, 0, "\(cut) chain \(k)")
                XCTAssertEqual(Figure.pose(.hero, .chain(cut, k)).blade, Figure.pose(.hero, .cut(cut, k)).blade, accuracy: 0.0001)
            }
            for k in 0..<Frame.chainFrames {
                XCTAssertEqual(Figure.pose(.hero, .chain(cut, k)).ghosts.isEmpty, k == 0, "\(cut) chain \(k)")
            }
        }
    }

    /// How the ronin's sprite moves him as each frame comes up (as HeroSprite does it, facing right, in his heights):
    /// not at all, a foot kept where it was, a foot set down in its place in guard, or thrown to a spot.
    private enum Footwork { case hold, keep(front: Bool), home(front: Bool), thrown(CGFloat) }

    /// The ronin's feet where they are in the world, frame by frame, through a run of frames from `start` at `offset`.
    private func replay(from start: Frame, offset: CGFloat, _ beats: [(Frame, Footwork)]) -> [(frame: Frame, front: CGPoint, back: CGPoint)] {
        var offset = offset, now = start
        let home = Figure.footing(.hero, .idle(0))
        func world(_ f: Frame) -> (frame: Frame, front: CGPoint, back: CGPoint) {
            let feet = Figure.footing(.hero, f)
            return (f, CGPoint(x: offset + feet.front.x, y: feet.front.y), CGPoint(x: offset + feet.back.x, y: feet.back.y))
        }
        var out = [world(start)]
        for (frame, footwork) in beats {
            let before = Figure.footing(.hero, now), after = Figure.footing(.hero, frame)
            switch footwork {
            case .hold: break
            case .keep(let front): offset += front ? before.front.x - after.front.x : before.back.x - after.back.x
            case .home(let front): offset = front ? home.front.x - after.front.x : home.back.x - after.back.x
            case .thrown(let to): offset = to
            }
            now = frame
            out.append(world(frame))
        }
        return out
    }

    /// No foot on the ground in two frames running slides along it (and, `forward`, no foot goes back).
    private func assertPlanted(_ steps: [(frame: Frame, front: CGPoint, back: CGPoint)], forward: Bool = false, _ what: String) {
        for (a, b) in zip(steps, steps.dropFirst()) {
            for (p, q, foot) in [(a.front, b.front, "front"), (a.back, b.back, "back")] {
                if p.y < 0.01, q.y < 0.01 { XCTAssertEqual(q.x, p.x, accuracy: 0.01, "\(what): the \(foot) foot slides from \(a.frame) to \(b.frame)") }
                if forward { XCTAssertGreaterThan(q.x, p.x - 0.01, "\(what): the \(foot) foot goes back from \(a.frame) to \(b.frame)") }
            }
        }
    }

    func testTheLungeAndTheStepsHomeNeverSlideAPlantedFoot() {
        // The beats HeroSprite plays (Sprites.swift, HeroSprite.cut, advance and hurt), replayed with the frames'
        // footing: keep these two in step.
        let home = Figure.footing(.hero, .idle(0))
        for cut in Cut.allCases {
            let zanshin = Frame.cut(cut, Frame.cutFrames - 1)
            // A long lunge: pushing off, the front foot lifted back (not as far from a middling one), set down as the
            // back one follows, and guard.
            for reach in [CGFloat(0.12), 0.16, 0.22] {
                let middling = reach < 0.17
                let long = replay(from: zanshin, offset: reach, [(.recover(cut, 4), .hold), (.recover(cut, middling ? 5 : 0), .keep(front: false)),
                                                                (.recover(cut, 1), .home(front: true)), (.idle(0), .home(front: true))])
                assertPlanted(long, "\(cut) long \(reach)")
                XCTAssertEqual(long.last!.front.x, home.front.x, accuracy: 0.001)
                XCTAssertEqual(long[2].front.x, home.front.x, accuracy: middling ? 0.06 : 0.09, "\(cut) long \(reach): the front foot comes back near its place")
            }
            // A short one: the back foot drawn up to over its place, then the front foot lifted back.
            for reach in [CGFloat(0), 0.05, 0.1] {
                let short = replay(from: zanshin, offset: reach, [(.recover(cut, 2), .keep(front: true)), (.recover(cut, 3), .home(front: false)),
                                                                 (.idle(0), .home(front: false))])
                assertPlanted(short, "\(cut) short \(reach)")
                XCTAssertEqual(short[1].back.x, home.back.x, accuracy: 0.06, "\(cut) short \(reach): the back foot comes down near its place")
                XCTAssertEqual(short.last!.front.x, home.front.x, accuracy: 0.01, "\(cut) short \(reach): not home")
                XCTAssertEqual(short.last!.back.x, home.back.x, accuracy: 0.01, "\(cut) short \(reach): not home")
            }
            // A cut swung again from the lunge of the one before: the feet held where they are.
            guard cut != .nukitsuke else { continue }
            for first in Cut.allCases where first != .nukitsuke {
                var beats: [(Frame, Footwork)] = [(.chain(cut, 0), .keep(front: true))]
                beats += (1..<Frame.chainFrames).map { (.chain(cut, $0), .hold) }
                beats += (Frame.chainFrames..<Frame.cutFrames).map { (.cut(cut, $0), .hold) }
                assertPlanted(replay(from: .cut(first, Frame.cutFrames - 1), offset: 0.2, beats), "\(first) then \(cut)")
            }
        }
        // Knocked back by a blow: forward home, the back foot drawn up first and then the front one stepped out, each
        // foot only going forward. Carried forward of his place: back home, the front foot lifted back first.
        for (end, knock) in [(Frame.hurt(Frame.hurtFrames - 1), CGFloat(-0.2)), (.reel(0, Frame.reelFrames - 1), -0.15),
                             (.reel(1, Frame.reelFrames - 1), -0.1), (.repelled(1), -0.12)] {
            let steps = replay(from: end, offset: knock, [(.shuffle(1), .keep(front: true)), (.shuffle(3), .home(front: false)),
                                                          (.idle(0), .home(front: false))])
            assertPlanted(steps, forward: true, "\(end)")
            XCTAssertEqual(steps.last!.front.x, home.front.x, accuracy: 0.001)
        }
        let back = replay(from: .stumble(1), offset: 0.12, [(.shuffle(0), .keep(front: false)), (.shuffle(2), .home(front: true)),
                                                            (.idle(0), .home(front: true))])
        assertPlanted(back, "back home")
        XCTAssertEqual(back.last!.front.x, home.front.x, accuracy: 0.01)
        XCTAssertEqual(back.last!.back.x, home.back.x, accuracy: 0.01)
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
            XCTAssertGreaterThan(reach, kind.range - 0.04, "\(kind)'s blow falls short: reach \(reach) against range \(kind.range)")
            XCTAssertLessThan(reach, kind.range + beyond, "\(kind)'s blow goes through him: reach \(reach) against range \(kind.range)")
        }
    }

    func testTheWorstHurtHandPressedToHisWoundShows() {
        for k in 0..<Frame.windedFrames {
            XCTAssertTrue(Figure.pose(.hero, .winded(1, k)).clutch)
            XCTAssertFalse(Figure.pose(.hero, .winded(0, k)).clutch)
            let sketch = Figure.sketch(.hero, .winded(1, k))
            let blood = sketch.body.lastIndex { $0.fill?.rgb == Palette.blood } ?? -1
            XCTAssertGreaterThan(blood, 0, "winded 1 \(k): no blood at the wound")
            // Over the body and the near arm: only the forearm, the fist and the blade after it.
            XCTAssertGreaterThan(blood, sketch.body.count - 12, "winded 1 \(k): the wound is drawn under the body")
        }
    }

    func testTheRoninGoesDownAndStaysDown() {
        // To one knee, then pitching forward off it, then face down: the hips only ever go down, the kneeling knee
        // stays on the ground until he goes over, and the front foot goes out ahead of him rather than back.
        func hips(_ k: Int) -> CGFloat { Figure.skeleton(.hero, Figure.pose(.hero, .fall(k)))[0].y }
        XCTAssertGreaterThan(hips(2), hips(3))
        XCTAssertGreaterThan(hips(3), hips(4))
        XCTAssertLessThan(Figure.skeleton(.hero, Figure.pose(.hero, .fall(3)))[5].y, 0.08, "the knee comes off the ground")
        XCTAssertGreaterThan(Figure.footing(.hero, .fall(3)).front.x, Figure.footing(.hero, .fall(2)).front.x, "the front foot jumps back")
        // Face down, he lies flat on the ground: on it, not over it or in it, and nothing of him (his scabbard, his
        // ribbons, the hems of his hakama) standing up off it.
        let H = Figure.pixelHeight(.hero)
        let last = Figure.pose(.hero, .fall(Frame.fallFrames - 1))
        XCTAssertEqual(last.floor ?? -1, hips(Frame.fallFrames - 1), accuracy: 0.0001, "he does not know where the ground is")
        let e = extent(Figure.sketch(.hero, pose: last))
        XCTAssertEqual((e.minY - Figure.feet.y * H) / H, 0, accuracy: 0.015, "he does not lie on the ground")
        XCTAssertLessThan((e.maxY - Figure.feet.y * H) / H, 0.3, "something of him stands up off the ground")
        for joint in Figure.skeleton(.hero, last) { XCTAssertLessThan(joint.y, 0.22, "he is not lying flat") }
    }

    func testTheDeadLetGoOfTheirWeaponsWhichLieOnTheirOwn() {
        for kind in Kind.allCases {
            XCTAssertFalse(Figure.thrown(.foe(kind)).armed)
            let weapon = Figure.weapon(.foe(kind))
            XCTAssertFalse(weapon.isEmpty, "\(kind)")
            XCTAssertTrue(weapon.fits(margin: 1), "\(kind)'s weapon spills off its canvas")
            let box = weapon.bounds(margin: 0)
            XCTAssertGreaterThan(box.width, box.height, "\(kind)'s weapon lies level")
        }
    }

    func testEveryFastMotionIsSmeared() {
        // As an animator smears a motion: every frame of a swing (the draw's too, and the first of the follow-through)
        // is a smear frame, running along the path since the frame before, so the whole cut reads as one motion; the
        // chamber, the end of the follow-through, zanshin and the way back into guard are clean poses. The bright trail
        // builds to the blade whipping through and dies away after it; the body blurs after itself as far as the lunge
        // carries it in each frame (never when a cut is swung again from the lunge, the feet planted).
        for cut in Cut.allCases {
            var strengths: [CGFloat] = []
            for k in 0..<Frame.cutFrames {
                let pose = Figure.pose(.hero, .cut(cut, k)), sketch = Figure.sketch(.hero, .cut(cut, k))
                if (1...6).contains(k) {
                    XCTAssertGreaterThanOrEqual(pose.ghosts.count, 8, "\(cut) \(k): the path is too coarse to run smooth")
                    XCTAssertFalse(sketch.underlay.isEmpty, "\(cut) \(k) is not smeared")
                    if k < 6 || cut == .nukitsuke { XCTAssertGreaterThan(pose.drag, 0, "\(cut) \(k): the body is not carried") }
                    // (The draw's first two frames push the hilt out, the blade still in the scabbard: no trail yet.)
                    if cut != .nukitsuke || k >= 3 {
                        XCTAssertNotNil(pose.smear, "\(cut) \(k) leaves no trail")
                        strengths.append(pose.smear?.strength ?? 0)
                    }
                } else {
                    XCTAssertTrue(pose.ghosts.isEmpty && pose.smear == nil && pose.drag == 0, "\(cut) \(k) is smeared")
                    XCTAssertTrue(sketch.underlay.isEmpty && sketch.overlay.isEmpty, "\(cut) \(k) is smeared")
                }
            }
            let peak = strengths.firstIndex(of: strengths.max()!)!
            XCTAssertTrue(peak > 0 && peak < strengths.count - 1, "\(cut): the trail is brightest at an end of the swing, not in it")
            XCTAssertLessThan(strengths.last!, 0.5, "\(cut): the trail does not die away")
            if cut != .nukitsuke {
                for k in 0..<Frame.chainFrames {
                    let pose = Figure.pose(.hero, .chain(cut, k))
                    XCTAssertEqual(pose.ghosts.isEmpty, k == 0, "\(cut) chain \(k)")
                    XCTAssertEqual(pose.drag, 0, "\(cut) chain \(k): the planted lunge blurs")
                }
            }
            for k in 0..<Frame.recoverFrames {
                XCTAssertTrue(Figure.sketch(.hero, .recover(cut, k)).underlay.isEmpty, "the return to guard is clean")
            }
        }
        // A foe's blow from the coil, and on into its follow-through (the body flung into it, then less so); the
        // recovery, the wind-up and a stagger are clean; a leap carries the body.
        for kind in Kind.allCases where kind != .archer {
            let cast = Cast.foe(kind)
            for k in 0...1 {
                XCTAssertFalse(Figure.pose(cast, .strike(k)).ghosts.isEmpty, "\(kind) strike \(k)")
                XCTAssertFalse(Figure.sketch(cast, .strike(k)).underlay.isEmpty, "\(kind) strike \(k)")
            }
            XCTAssertGreaterThan(Figure.pose(cast, .strike(0)).drag, Figure.pose(cast, .strike(1)).drag, "\(kind)'s blow")
            XCTAssertGreaterThan(Figure.pose(cast, .strike(1)).drag, 0, "\(kind)'s follow-through")
            for f in [Frame.strike(2), .windup(Frame.windupFrames - 1), .stagger(0), .idle(0), .walk(0)] {
                XCTAssertTrue(Figure.sketch(cast, f).underlay.isEmpty, "\(kind) \(f) is smeared")
            }
            if Figure.frames(for: cast).contains(.leap) { XCTAssertGreaterThan(Figure.pose(cast, .leap).drag, 0, "\(kind)'s leap") }
        }
        // The ronin carried past his mark, flung back off a guard or off the warlord's blade, struck; the chiburi's
        // snap and its stop; each smeared, and what follows each of them clean.
        for f in [Frame.stumble(0), .repelled(0), .clash(1), .flourish(2), .flourish(3)] {
            XCTAssertFalse(Figure.pose(.hero, f).ghosts.isEmpty, "\(f)")
            XCTAssertFalse(Figure.sketch(.hero, f).underlay.isEmpty, "\(f) is not smeared")
        }
        XCTAssertLessThan(Figure.pose(.hero, .hurt(0)).drag, 0, "the blow does not carry him back")
        XCTAssertLessThan(Figure.pose(.hero, .clash(1)).drag, 0, "he is not thrown back off the blade")
        for f in [Frame.idle(0), .stumble(1), .repelled(1), .hurt(1), .hurt(2), .clash(0), .flourish(0), .flourish(1), .flourish(4)] {
            XCTAssertTrue(Figure.sketch(.hero, f).underlay.isEmpty, "\(f) is smeared")
        }
    }

    func testASmearIsTheMotionNotCopiesOfTheFigure() {
        // Not the arms, the blade and the body drawn again back along the motion (a stack of copies), but the motion
        // itself: nothing of a smear is drawn dark on its own (every shape of it faint, building up only where the
        // motion lingers), all of it in the figure's own ink under a bright steel edge; the sweep of the blade nearly as
        // dark as the figure just behind the blade and fading back along the swing, smoothly, in steps too fine to see;
        // and where the hands were a frame ago, no second pair of hands. (A thrust leaves speed lines.)
        var smeared: [(Cast, Frame)] = [(.hero, .flourish(2)), (.hero, .flourish(3)), (.hero, .clash(1)), (.hero, .repelled(0))]
        for cut in Cut.allCases where cut != .tsuki { smeared += (cut == .nukitsuke ? [4, 5] : [2, 3, 4, 5]).map { (.hero, .cut(cut, $0)) } }
        smeared += [Kind.runner, .brute, .dancer, .warlord].map { (.foe($0), .strike(0)) }
        for (cast, frame) in smeared {
            var pose = Figure.pose(cast, frame)
            let sketch = Figure.sketch(cast, frame)
            let H = Figure.pixelHeight(cast) * Build.of(cast).height
            for shape in sketch.underlay {
                XCTAssertEqual((shape.fill ?? shape.stroke)?.rgb, Palette.silhouette, "\(cast) \(frame): not in the figure's ink")
                XCTAssertLessThanOrEqual((shape.fill ?? shape.stroke)?.alpha ?? 1, 0.3, "\(cast) \(frame): a copy drawn dark on its own")
            }
            XCTAssertTrue(sketch.overlay.contains { $0.fill?.rgb == Palette.steel }, "\(cast) \(frame): no steel edge")
            // The sweep on its own (without the blur of the body), along the path of a point near the tip of the blade
            // from where the frame before left it (oldest first).
            pose.drag = 0
            let sweep = Figure.sketch(cast, pose: pose).underlay
            func along(_ p: Pose, _ share: CGFloat) -> CGPoint {
                let hand = Figure.skeleton(cast, p)[8], tip = Figure.tip(cast, pose: p) ?? hand
                return CGPoint(x: (Figure.feet.x + hand.x + (tip.x - hand.x) * share) * H, y: (Figure.feet.y + hand.y + (tip.y - hand.y) * share) * H)
            }
            let path = pose.ghosts.dropFirst().map { along($0, 0.85) }
            let dense = coverage(sweep, at: path.last!), early = coverage(sweep, at: path.first!)
            XCTAssertGreaterThan(dense, 0.55, "\(cast) \(frame): the sweep is a pale fog at the blade")
            XCTAssertLessThan(early, dense * 0.5, "\(cast) \(frame): the sweep does not thin back along the swing")
            // Followed closely along that path, the ink never steps: no band, no edge of a copy. (A foe's blow may
            // turn a weapon back along its own line, as the runner's knife does coming out of its tuck, and the sweep
            // then has an edge where it folds: a sharper change, but still nothing like a copy's.)
            var ink: [CGFloat] = []
            for (a, b) in zip(path, path.dropFirst()) {
                for i in 0..<8 { ink.append(coverage(sweep, at: CGPoint(x: a.x + (b.x - a.x) * CGFloat(i) / 8, y: a.y + (b.y - a.y) * CGFloat(i) / 8))) }
            }
            let step = zip(ink, ink.dropFirst()).map { abs($1 - $0) }.max() ?? 0
            XCTAssertLessThan(step, cast == .hero ? 0.12 : 0.25, "\(cast) \(frame): the sweep is banded (a step of \(step))")
            // Where the hands were a frame ago, only the faintest trace of them.
            let hands = Figure.skeleton(cast, pose.ghosts[0])[8]
            let then = coverage(sweep, at: CGPoint(x: (Figure.feet.x + hands.x) * H, y: (Figure.feet.y + hands.y) * H))
            XCTAssertLessThan(then, 0.3, "\(cast) \(frame): the hands are drawn again where they were")
        }
        XCTAssertTrue(Figure.pose(.hero, .cut(.tsuki, 4)).smear?.thrust ?? false)
    }

    func testASmearRunsOnFromTheFrameBefore() {
        // Each frame of a swing smears the way from the frame before: its first in-between is that frame's pose, so
        // the sweep starts where the eye last saw the blade and the hands, and one frame's smear leads into the next.
        for cut in Cut.allCases {
            for k in 1...6 {
                let pose = Figure.pose(.hero, .cut(cut, k)), before = Figure.pose(.hero, .cut(cut, k - 1))
                guard let first = pose.ghosts.first else { XCTFail("\(cut) \(k) is not smeared"); continue }
                let a = Figure.skeleton(.hero, first)[8], b = Figure.skeleton(.hero, before)[8]
                XCTAssertEqual(hypot(a.x - b.x, a.y - b.y), 0, accuracy: 0.02, "\(cut) \(k): the hands' smear starts elsewhere")
                if let p = Figure.tip(.hero, pose: first), let q = Figure.tip(.hero, pose: before) {
                    XCTAssertEqual(hypot(p.x - q.x, p.y - q.y), 0, accuracy: 0.02, "\(cut) \(k): the sweep starts elsewhere")
                }
            }
        }
    }

    func testTheDeadStartFromPosesTheyCanFallFrom() {
        for kind in Kind.allCases {
            let cast = Cast.foe(kind)
            for variant in stride(from: 0, to: 1_000_000, by: 9973) {
                let pose = Figure.struck(cast, variant: variant)
                XCTAssertFalse(pose.armed)
                XCTAssertTrue(Figure.sketch(cast, pose: pose).fits(margin: 1), "\(kind) struck \(variant) spills off its canvas")
            }
            XCTAssertTrue(Figure.sketch(cast, pose: Figure.thrown(cast)).fits(margin: 1), "\(kind) thrown spills off its canvas")
        }
    }

    func testTheWarlordsBannerAndTheDancersRibbonLieOnTheGroundNotThroughIt() {
        // Cloth and gear on a body lying where it fell hang toward the ground and lie on it: the banner, the plates, the
        // ribbons, the quiver, the hat. Nothing of any of them, nor of the body itself (which lies on its outline as it
        // is drawn), goes more than a sliver into the ground. The pose a doll is drawn by knows where its ground is.
        var rng = SeededRNG(seed: 41)
        for (kind, piece) in [(Kind.warlord, Severed.headless), (.dancer, .above(at: 0.5, slant: 0.6)), (.dancer, .headless),
                              (.runner, .above(at: 0.3, slant: 0.05)), (.archer, .headless), (.archer, .above(at: 0.3, slant: 0.05)),
                              (.grunt, .above(at: 0.5, slant: -0.6)), (.brute, .below(at: 0.5, slant: -0.6))] {
            let cast = Cast.foe(kind)
            for v in 0..<Figure.struckVariants {
                var doll = Ragdoll.cut(cast, pose: Figure.struck(cast, variant: v), piece, back: -1, force: kind == .warlord ? 1.5 : 1, rng: &rng)
                if piece.hasLegs {
                    // Standing a moment (a doll lets itself fall a quarter of a second at most in one go).
                    for _ in 0..<42 { doll.advance(1.0 / 60) }
                    doll.collapse(rng: &rng)
                }
                var n = 0
                while !doll.settled, n < 400 {
                    doll.advance(1.0 / 60)
                    n += 1
                }
                let framed = doll.framed()
                XCTAssertEqual(framed.pose.floor ?? -1, doll.hip.y, accuracy: 0.0001, "\(kind) \(piece) \(v) does not know its ground")
                let H = Figure.pixelHeight(cast) * Build.of(cast).height
                let lowest = extent(Figure.sketch(cast, pose: framed.pose)).minY / H - Figure.feet.y + framed.anchor.y
                XCTAssertGreaterThan(lowest, -0.04, "\(kind) \(piece) \(v) goes through the ground")
            }
        }
    }

    func testAHeadStruckOffCarriesOnlyTheHeadAndAllItWears() {
        for kind in Kind.allCases {
            let cast = Cast.foe(kind)
            let H = Figure.pixelHeight(cast) * Build.of(cast).height
            for v in 0..<Figure.struckVariants {
                let pose = Figure.struck(cast, variant: v)
                let (sketch, wound, _) = Figure.severedHead(cast, pose: pose)
                XCTAssertTrue(sketch.fits(margin: 1), "\(kind) \(v)")
                // Nothing of the rest of him: no banner, no arrows, nothing of the trunk.
                XCTAssertTrue(filled(sketch, RGB(0.55, 0.05, 0.06)).isEmpty, "\(kind) \(v) takes the banner with it")
                XCTAssertFalse(sketch.body.contains { $0.stroke?.rgb == RGB(0.85, 0.85, 0.8) }, "\(kind) \(v) takes the arrows with it")
                let e = extent(sketch)
                XCTAssertLessThan(max(e.maxX - e.minX, e.maxY - e.minY), 0.45 * H, "\(kind) \(v) is more than a head")
                // The wound at the end of its neck, red, where the body's neck was cut.
                XCTAssertFalse(filled(sketch, RGB(0.86, 0.1, 0.12)).isEmpty, "\(kind) \(v)")
                let body = Figure.anatomy(cast, pose: pose)
                let cut = CGPoint(x: body.neck.x + (body.head.x - body.neck.x) * 0.12, y: body.neck.y + (body.head.y - body.neck.y) * 0.12)
                XCTAssertEqual(hypot(wound.x - cut.x, wound.y - cut.y), 0, accuracy: 0.01 * H, "\(kind) \(v)")
                // And the body left standing shows the wound on its stump.
                var headless = pose
                headless.severed = .headless
                let stump = Figure.sketch(cast, pose: headless)
                XCTAssertFalse(filled(stump, RGB(0.38, 0.0, 0.03)).isEmpty, "\(kind) \(v)'s stump has no meat")
                XCTAssertFalse(filled(stump, RGB(0.93, 0.88, 0.8)).isEmpty, "\(kind) \(v)'s stump has no bone")
            }
        }
    }

    func testTheFaceOfACutShowsOverWhatItCuts() {
        // Below a cut nothing covers the wound but the bone in it; neither half keeps any of the sash or the collar
        // past the cut.
        let red = RGB(0.86, 0.1, 0.12), bone = RGB(0.93, 0.88, 0.8), collar = Palette.shade.mix(.white, 0.14)
        for kind in Kind.allCases {
            let cast = Cast.foe(kind)
            let sash = Build.of(cast).accent.scaled(0.75)
            for v in 0..<Figure.struckVariants {
                for (at, slant) in [(CGFloat(0.12), CGFloat(0.08)), (0.3, 0.05), (0.5, 0.6), (0.5, -0.6)] {
                    var above = Figure.struck(cast, variant: v), below = above
                    above.severed = .above(at: at, slant: slant)
                    below.severed = .below(at: at, slant: slant)
                    let lower = Figure.sketch(cast, pose: below), upper = Figure.sketch(cast, pose: above)
                    let last = lower.body.lastIndex { $0.fill?.rgb == red }
                    XCTAssertNotNil(last, "\(kind) \(v) below \(at) has no wound")
                    if let last {
                        for shape in lower.body[(last + 1)...] { XCTAssertEqual(shape.fill?.rgb, bone, "\(kind) \(v) below \(at): the wound is covered") }
                    }
                    // Where the cut runs, and which side of it each half keeps.
                    let body = Figure.anatomy(cast, pose: above)
                    let length = hypot(body.neck.x - body.hip.x, body.neck.y - body.hip.y)
                    let up = CGPoint(x: (body.neck.x - body.hip.x) / length, y: (body.neck.y - body.hip.y) / length)
                    let across = CGPoint(x: up.y, y: -up.x)
                    let point = CGPoint(x: body.hip.x + up.x * at * length, y: body.hip.y + up.y * at * length)
                    let normal = CGPoint(x: up.x * cos(slant) - across.x * sin(slant), y: up.y * cos(slant) - across.y * sin(slant))
                    for (sketch, keep) in [(upper, CGFloat(1)), (lower, -1)] {
                        for shape in filled(sketch, sash) + filled(sketch, collar) {
                            for p in shape.points {
                                let side = ((p.x - point.x) * normal.x + (p.y - point.y) * normal.y) * keep
                                XCTAssertGreaterThan(side, -0.5, "\(kind) \(v) \(at) \(slant): cloth past the cut")
                            }
                        }
                    }
                }
            }
        }
    }

    func testFeetKeepToTheGround() {
        // A foe's walk advances a frame for each twelfth of its stride, which must be about what its legs cover; and a
        // foot on the ground from one frame to the next does not skid forward along it (no more than a heel settling).
        for kind in Kind.allCases {
            let cast = Cast.foe(kind)
            let stride = Figure.stride(cast)
            XCTAssertGreaterThan(stride, 0.5, "\(kind)")
            XCTAssertLessThan(stride, 1.6, "\(kind)")
            for k in 0..<Frame.walkFrames {
                let a = Figure.footing(cast, .walk(k)), b = Figure.footing(cast, .walk((k + 1) % Frame.walkFrames))
                for (p, q, foot) in [(a.front, b.front, "front"), (a.back, b.back, "back")] where p.y < 0.01 && q.y < 0.01 {
                    XCTAssertLessThan(q.x - p.x, 0.045, "\(kind) walk \(k): the \(foot) foot skids forward on the ground")
                }
            }
        }
    }

    func testAFootOnTheGroundHoldsItsPlaceAsTheBodyGoesOverIt() {
        // Played a frame for each twelfth of the stride travelled, a foot down in two frames running is at the same
        // spot on the ground in both (the body having gone on a twelfth of the stride between them): no sliding.
        for kind in Kind.allCases {
            let cast = Cast.foe(kind)
            let beat = Figure.stride(cast) / CGFloat(Frame.walkFrames)
            var planted = 0
            for k in 0..<Frame.walkFrames {
                let a = Figure.footing(cast, .walk(k)), b = Figure.footing(cast, .walk((k + 1) % Frame.walkFrames))
                for (p, q, foot) in [(a.front, b.front, "near"), (a.back, b.back, "far")] where p.y < 0.001 && q.y < 0.001 {
                    XCTAssertEqual(q.x + beat, p.x, accuracy: 0.002, "\(kind) walk \(k): the \(foot) foot slides")
                    planted += 1
                }
            }
            // Walking, each foot is down for more than half the stride (both at once as a foot lands); running, less.
            if kind == .runner { XCTAssertLessThan(planted, Frame.walkFrames) } else { XCTAssertGreaterThanOrEqual(planted, Frame.walkFrames) }
        }
    }

    func testTheRunnerSprintsLowAndLongAndHalfTheTimeInTheAir() {
        // The shinobi's strength is his speed: a low, driving sprint pitched hard forward, on the balls of his feet,
        // each foot down a quarter of the stride and half his time in the air; the heel flicked up high behind him and
        // the knee driven through; his legs turning over faster than any other man's. He runs on his legs alone: the
        // arms held still, the knife up before his chin reversed along the forearm, the free arm swept back.
        let cast = Cast.foe(.runner), n = Frame.walkFrames
        let feet = (0..<n).map { Figure.footing(cast, .walk($0)) }
        XCTAssertGreaterThanOrEqual(feet.filter { min($0.front.y, $0.back.y) > 0.01 }.count, n / 2, "not in the air long enough")
        let bones = (0..<n).map { Figure.skeleton(cast, Figure.pose(cast, .walk($0))) }
        for k in 0..<n {
            let p = Figure.pose(cast, .walk(k))
            XCTAssertGreaterThan(p.lean, 0.75, "walk \(k) runs upright")
            XCTAssertGreaterThan(p.heels, 0.2, "walk \(k) runs flat-footed")
            for kind in Kind.allCases where kind != .runner {
                XCTAssertGreaterThan(p.lean, Figure.pose(.foe(kind), .walk(k)).lean + 0.3, "walk \(k) is pitched no further than the \(kind)'s")
            }
            // The knife reversed along the forearm, its point out past the elbow.
            let elbow = bones[k][7], hand = bones[k][8]
            let forearm = atan2(elbow.x - hand.x, -(elbow.y - hand.y))
            XCTAssertEqual(remainder(p.blade - forearm, 2 * .pi), 0, accuracy: 0.35, "walk \(k): the knife is not tucked")
        }
        let lifted = feet.flatMap { [$0.front, $0.back] }
        XCTAssertTrue(lifted.contains { $0.y > 0.2 && $0.x < -0.3 }, "the heel is not flicked up behind him")
        XCTAssertTrue(lifted.contains { $0.y > 0.25 && abs($0.x) < 0.12 }, "the foot is not tucked under him as the knee comes through")
        // The knee driven up ahead of the hips.
        XCTAssertGreaterThan(bones.map { max($0[3].x, $0[5].x) - $0[0].x }.max()!, 0.2)
        // The arms still on the body through the whole stride (the hands kept where they are from the neck, the body
        // rocking under them as it will), the knife hand up before his face and the free one back behind his hips.
        let leans = (0..<n).map { Figure.pose(cast, .walk($0)).lean }
        for (hand, name) in [(8, "knife"), (10, "free")] {
            let from = zip(bones, leans).map { b, lean -> CGPoint in
                let d = CGPoint(x: b[hand].x - b[1].x, y: b[hand].y - b[1].y)
                return CGPoint(x: d.x * cos(lean) - d.y * sin(lean), y: d.x * sin(lean) + d.y * cos(lean))
            }
            let spread = max(from.map(\.x).max()! - from.map(\.x).min()!, from.map(\.y).max()! - from.map(\.y).min()!)
            XCTAssertLessThan(spread, 0.03, "the \(name) arm swings")
        }
        for b in bones {
            XCTAssertGreaterThan(b[8].x, b[1].x + 0.08, "the knife is not held out before him")
            XCTAssertGreaterThan(b[8].y, b[1].y - 0.06, "the knife is carried low")
            XCTAssertLessThan(b[10].x, b[0].x, "the free arm is not swept back")
        }
        func cadence(_ kind: Kind) -> Double { kind.speed / Double(Figure.stride(.foe(kind)) * Build.of(.foe(kind)).height) }
        for kind in Kind.allCases where kind != .runner { XCTAssertGreaterThan(cadence(.runner), cadence(kind) * 1.15, "\(kind)") }
    }

    func testTheRunnerIsNeverStillOnTheBallsOfHisFeet() {
        // His guard: low, on the balls of his feet, bouncing and twitching (far more than any other man breathes), his
        // feet where they are.
        let cast = Cast.foe(.runner)
        let home = Figure.footing(cast, .idle(0))
        func hips(_ cast: Cast) -> [CGFloat] { (0..<Frame.foeIdleFrames).map { Figure.skeleton(cast, Figure.pose(cast, .idle($0)))[0].y } }
        for k in 0..<Frame.foeIdleFrames {
            let feet = Figure.footing(cast, .idle(k))
            XCTAssertGreaterThan(Figure.pose(cast, .idle(k)).heels, 0.2, "idle \(k) stands flat-footed")
            XCTAssertEqual(feet.front.x, home.front.x, accuracy: 0.002, "idle \(k)")
            XCTAssertEqual(feet.back.x, home.back.x, accuracy: 0.002, "idle \(k)")
            XCTAssertLessThan(max(feet.front.y, feet.back.y), 0.004, "idle \(k)")
        }
        let bounce = hips(cast).max()! - hips(cast).min()!
        XCTAssertGreaterThan(bounce, 0.02)
        for kind in Kind.allCases where kind != .runner {
            let theirs = hips(.foe(kind))
            XCTAssertGreaterThan(bounce, (theirs.max()! - theirs.min()!) * 2, "\(kind)")
        }
        // Lower than he stands in the sprint, pitched further forward than any other man's guard but the sprint.
        XCTAssertLessThan(hips(cast)[0], Figure.skeleton(cast, Figure.pose(cast, .walk(0)))[0].y)
        for kind in Kind.allCases where kind != .runner {
            XCTAssertGreaterThan(Figure.pose(cast, .idle(0)).lean, Figure.pose(.foe(kind), .idle(0)).lean + 0.2, "\(kind)")
        }
    }

    func testTheRunnerBurstsOutOfACoilInOneLongLunge() {
        // Coiled low like a sprinter set to go, then out in one long lunge, the knife whipped a long way through the one
        // frame of the blow (smeared, the body blurring after itself further than any other man's), and smeared less as
        // it carries through.
        let cast = Cast.foe(.runner)
        let coiled = Frame.windup(Frame.windupFrames - 1)
        let stance = Figure.footing(cast, .idle(0)), blow = Figure.footing(cast, .strike(0))
        XCTAssertGreaterThan(blow.front.x - blow.back.x, (stance.front.x - stance.back.x) * 1.6, "the lunge is short")
        XCTAssertLessThan(Figure.skeleton(cast, Figure.pose(cast, coiled))[0].y, Figure.skeleton(cast, Figure.pose(cast, .idle(0)))[0].y - 0.04,
                          "he does not coil")
        let from = Figure.tip(cast, coiled)!, to = Figure.tip(cast, .strike(0))!
        XCTAssertGreaterThan(hypot(to.x - from.x, to.y - from.y), 0.5, "the knife hardly moves")
        let pose = Figure.pose(cast, .strike(0))
        XCTAssertFalse(pose.ghosts.isEmpty)
        XCTAssertGreaterThan(pose.drag, Figure.pose(.foe(.grunt), .strike(0)).drag, "the blow is no faster than a spearman's")
        XCTAssertFalse(Figure.pose(cast, .strike(1)).ghosts.isEmpty)
        XCTAssertLessThan(Figure.pose(cast, .strike(1)).drag, pose.drag)
    }

    func testAFoeWalksOnBentKneesThatNeverLock() {
        // Every foe comes on in a crouch: a knee on the ground keeps a real bend through the whole stride (as the
        // foot lands, as the body passes over it, as it pushes off), and a leg in the air folds further.
        for kind in Kind.allCases {
            let cast = Cast.foe(kind)
            for k in 0..<Frame.walkFrames {
                let p = Figure.pose(cast, .walk(k)), feet = Figure.footing(cast, .walk(k))
                for (leg, foot, name) in [(p.front, feet.front, "near"), (p.back, feet.back, "far")] {
                    let bend = leg.thigh - leg.shin
                    XCTAssertGreaterThan(bend, Figure.walkingKnee - 0.01, "\(kind) walk \(k): the \(name) knee locks")
                    if foot.y > 0.03 { XCTAssertGreaterThan(bend, 0.5, "\(kind) walk \(k): the \(name) leg swings through stiff") }
                }
                // The body pitched forward over the stride, the head held up out of it.
                XCTAssertGreaterThan(p.lean, 0.1, "\(kind) walk \(k) walks upright")
                XCTAssertLessThan(p.lean + p.tilt, p.lean, "\(kind) walk \(k) hangs his head")
            }
        }
    }

    func testTheHeavyTreadSinksIntoEachFootfall() {
        // The oni and the warlord: slow, long, heavy steps; the hips at their lowest just after a foot comes down (the
        // knee giving under the weight) and pushed up again over it; the foot lifted high and stamped down.
        func hips(_ cast: Cast, _ k: Int) -> CGFloat { Figure.skeleton(cast, Figure.pose(cast, .walk(k)))[0].y }
        let grunt = Cast.foe(.grunt)
        func cadence(_ kind: Kind) -> Double { kind.speed / Double(Figure.stride(.foe(kind)) * Build.of(.foe(kind)).height) }
        for kind in [Kind.brute, .warlord] {
            let cast = Cast.foe(kind)
            let half = Frame.walkFrames / 2
            let step = (0..<half).map { hips(cast, $0) }
            XCTAssertEqual(step.firstIndex(of: step.min()!), 1, "\(kind) sinks after the foot lands")
            XCTAssertGreaterThan(step.max()! - step.min()!, 0.03, "\(kind) treads lightly")
            XCTAssertGreaterThan(step.max()! - step.min()!, (0..<half).map { hips(grunt, $0) }.max()! - (0..<half).map { hips(grunt, $0) }.min()!)
            let lifted = (0..<Frame.walkFrames).map { Figure.footing(cast, .walk($0)).front.y }.max()!
            XCTAssertGreaterThan(lifted, 0.075, "\(kind) shuffles")
            XCTAssertLessThan(cadence(kind), cadence(.grunt) * 0.7, "\(kind) hurries")
        }
    }

    func testInAClashTheBladesMeet() {
        // Stood `clashGap` apart, facing each other, the ronin's blade and the warlord's meet at the one point in the
        // bind, crossed (not lying along each other), and still touch as he is forced off it (his back foot where it
        // was, so he has not moved); the warlord takes it on his guard's footing.
        let tall = Build.of(.foe(.warlord)).height, gap = Figure.clashGap()
        XCTAssertGreaterThan(gap, 0.6)
        XCTAssertLessThan(gap, 1.1)
        let guardFeet = Figure.footing(.foe(.warlord), .block)
        for k in 0..<Frame.clashFrames {
            guard let mine = Figure.contact(.hero, .clash(k)), let theirs = Figure.contact(.foe(.warlord), .clash(k)) else {
                XCTFail("clash \(k) has no contact")
                continue
            }
            XCTAssertEqual(mine.y, theirs.y * tall, accuracy: 0.005, "clash \(k): the blades meet at different heights")
            XCTAssertEqual(mine.x + theirs.x * tall, gap, accuracy: 0.01, "clash \(k): the blades do not meet")
            // On each blade, between the guard and the point.
            let hand = Figure.skeleton(.hero, Figure.pose(.hero, .clash(k)))[8], tip = Figure.tip(.hero, .clash(k))!
            XCTAssertLessThan(hypot(mine.x - hand.x, mine.y - hand.y), hypot(tip.x - hand.x, tip.y - hand.y) + 0.001, "clash \(k)")
            let feet = Figure.footing(.foe(.warlord), .clash(k))
            XCTAssertEqual(feet.front.x, guardFeet.front.x, accuracy: 0.002)
            XCTAssertEqual(feet.back.x, guardFeet.back.x, accuracy: 0.002)
        }
        let bind = (Figure.pose(.hero, .clash(0)).blade, .pi * 2 - Figure.pose(.foe(.warlord), .clash(0)).blade)
        XCTAssertGreaterThan(abs(bind.0 - bind.1), 0.5, "the blades lie along each other rather than cross")
        XCTAssertNotNil(Figure.contact(.foe(.warlord), .block))
        XCTAssertNil(Figure.contact(.hero, .idle(0)))
        // Forced off: both feet down in the bind; then the back one where it was and the front one off the ground.
        let bound = Figure.footing(.hero, .clash(0)), forced = Figure.footing(.hero, .clash(1))
        XCTAssertLessThan(max(bound.front.y, bound.back.y), 0.004)
        XCTAssertEqual(forced.back.x, bound.back.x, accuracy: 0.002)
        XCTAssertLessThan(forced.back.y, 0.004)
        XCTAssertGreaterThan(forced.front.y, 0.03)
        XCTAssertLessThan(forced.front.x, bound.front.x - 0.05)
        XCTAssertFalse(Figure.pose(.hero, .clash(1)).ghosts.isEmpty, "thrown back, smeared")
    }

    func testTheRoninBacksOffAFootAtATime() {
        // Forced off the warlord's blade, then backing off in guard: each foot lifted as it moves, the other planted
        // where it was; each step takes him `retreatStep` further back, and he ends in his guard's footing.
        let home = Figure.footing(.hero, .idle(0))
        var beats: [(Frame, Footwork)] = [(.clash(1), .keep(front: false)), (.retreat(3), .keep(front: false))]
        for _ in 0..<3 {
            beats += [(.retreat(0), .keep(front: true)), (.retreat(1), .keep(front: true)), (.retreat(2), .keep(front: false)),
                      (.retreat(3), .keep(front: false))]
        }
        beats.append((.idle(0), .hold))
        let steps = replay(from: .clash(0), offset: 0, beats)
        assertPlanted(steps, "backing off")
        for (a, b) in zip(steps, steps.dropFirst()) {
            XCTAssertLessThan(b.front.x, a.front.x + 0.002, "the front foot goes forward from \(a.frame) to \(b.frame)")
            XCTAssertLessThan(b.back.x, a.back.x + 0.002, "the back foot goes forward from \(a.frame) to \(b.frame)")
        }
        let r = (0..<Frame.retreatFrames).map { Figure.footing(.hero, .retreat($0)) }
        XCTAssertGreaterThan(r[0].back.y, 0.04)
        XCTAssertLessThan(r[0].front.y, 0.004)
        XCTAssertLessThan(max(r[1].front.y, r[1].back.y), 0.004)
        XCTAssertGreaterThan(r[2].front.y, 0.04)
        XCTAssertLessThan(r[2].back.y, 0.004)
        XCTAssertEqual(r[3].front.x, home.front.x, accuracy: 0.002)
        XCTAssertEqual(r[3].back.x, home.back.x, accuracy: 0.002)
        XCTAssertEqual(r[1].back.x, home.back.x - Figure.retreatStep, accuracy: 0.002)
        // Three steps back from where he stood in guard after the clash.
        let back = steps.filter { $0.frame == .retreat(3) }.map(\.front.x)
        for (a, b) in zip(back, back.dropFirst()) { XCTAssertEqual(b, a - Figure.retreatStep, accuracy: 0.002) }
        // The guard held up.
        for k in 0..<Frame.retreatFrames {
            XCTAssertGreaterThan(Figure.pose(.hero, .retreat(k)).blade, Figure.pose(.hero, .idle(0)).blade + 0.15, "retreat \(k)")
        }
    }

    func testElbowsAndKneesBendOnlyTheWayTheyBend() {
        // In every frame an elbow folds forward, never back past straight, and a knee back (a back leg locked straight
        // under the weight may give a little the other way); measured as a doll measures its joints.
        func bend(_ a: CGPoint, _ p: CGPoint, _ c: CGPoint) -> CGFloat {
            let wx = p.x - a.x, wy = p.y - a.y, vx = c.x - p.x, vy = c.y - p.y
            return atan2(wx * vy - wy * vx, wx * vx + wy * vy)
        }
        let down = Figure.limbs.shoulder / Figure.limbs.torso
        for cast in casts {
            for frame in Figure.frames(for: cast) {
                let s = Figure.skeleton(cast, Figure.pose(cast, frame))
                let shoulder = CGPoint(x: s[1].x + (s[0].x - s[1].x) * down, y: s[1].y + (s[0].y - s[1].y) * down)
                for (elbow, hand) in [(7, 8), (9, 10)] {
                    XCTAssertGreaterThan(bend(shoulder, s[elbow], s[hand]), -0.12, "\(cast) \(frame): an elbow bends backward")
                }
                for (knee, foot) in [(3, 4), (5, 6)] {
                    XCTAssertLessThan(bend(s[0], s[knee], s[foot]), 0.22, "\(cast) \(frame): a knee bends forward")
                }
            }
        }
    }

    func testTheFiguresStayDarkShapesOnAnySky() {
        // Figures are silhouettes that belong in the dusk and the moonlight: the far limbs a touch off black, not grey;
        // the rim of light faint and cool, not a warm halo. (A smear's sweep is dark enough to read as the body, not
        // fog: testASmearIsOneSweepDenseAtTheBladeAndThinningBackAlongTheSwing.)
        func luma(_ c: RGB) -> CGFloat { 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b }
        XCTAssertLessThan(luma(Palette.shade), 0.09)
        XCTAssertGreaterThan(luma(Palette.shade), luma(Palette.silhouette) + 0.03, "the far side no longer reads in depth")
        let rim = Figure.sketch(.hero, .idle(0)).rim
        XCTAssertLessThanOrEqual(rim.alpha, 0.35)
        XCTAssertGreaterThanOrEqual(rim.rgb.b, rim.rgb.r, "a warm rim")
        // The ronin still shows his red.
        XCTAssertTrue(Figure.sketch(.hero, .idle(0)).body.contains { $0.fill?.rgb == Palette.blood })
    }

    func testTheSheetIsSVG() {
        let svg = Figure.sketch(.hero, .idle(0)).svg()
        XCTAssertTrue(svg.hasPrefix("<g"))
        XCTAssertTrue(svg.contains("<path"))
    }
}
