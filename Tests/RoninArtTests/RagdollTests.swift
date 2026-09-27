import XCTest
import RoninCore
@testable import RoninArt

/// The dead, as the lane gets them: every kind, cut down every way Carnage cuts a man down, with its forces, its
/// stand times and its raise onto the lane, let fall at sixty frames a second. The checks that must always hold are
/// made on every body; the ones about how bodies tend to fall are made on rates over them all, with room to spare, so
/// no seed has to be lucky.
final class RagdollTests: XCTestCase {
    /// How a man is cut down, as Carnage does it: felled whole, cut through the trunk (at, slant, lift) on the slant
    /// down or up, level or low, his head taken, or his legs cut from under him.
    private enum Way: String, CaseIterable {
        case felled, falling, rising, level, legs, head, hamstrung

        var cut: (at: CGFloat, slant: CGFloat, lift: CGFloat)? {
            switch self {
            case .falling: return (0.5, 0.6, 1.3)
            case .rising: return (0.5, -0.6, 1.3)
            case .level: return (0.3, 0.05, 1.3)
            case .legs: return (0.12, 0.08, 0.6)
            default: return nil
            }
        }
    }

    /// A piece of a dead man: the doll, how long it stands (nil: it falls at once), and what it is.
    private struct Piece: Sendable {
        var doll: Ragdoll
        var stand: Double?
        var name: String
    }

    private static let step = 1.0 / 60

    /// The pieces one death leaves, made the way Carnage makes them.
    private static func pieces(_ kind: Kind, _ way: Way, rng: inout SeededRNG) -> [Piece] {
        let cast = Cast.foe(kind)
        let force: CGFloat = kind == .warlord ? 1.5 : kind == .brute ? 1.25 : 1
        let pose = Figure.struck(cast, variant: rng.int(0...3))
        let stand = rng.range(0.35, 0.7)
        let raise = 0.12 * CGFloat(rng.range(0, 1)) / Build.of(cast).height
        var made: [Piece]
        switch way {
        case .felled:
            let from = Figure.pose(cast, rng.chance(0.5) ? .die(0) : .stagger(0))
            made = [Piece(doll: Ragdoll.felled(cast, pose: from, back: -1, force: force, rng: &rng), stand: nil, name: "felled")]
        case .hamstrung:
            made = [Piece(doll: Ragdoll.hamstrung(cast, pose: pose, back: -1, force: force, rng: &rng), stand: nil, name: "hamstrung")]
        case .head:
            made = [Piece(doll: Ragdoll.cut(cast, pose: pose, .headless, back: -1, force: force, rng: &rng), stand: stand * 1.4, name: "headless")]
        default:
            let c = way.cut!
            made = [
                Piece(doll: Ragdoll.cut(cast, pose: pose, .above(at: c.at, slant: c.slant), back: -1, force: force, lift: c.lift, rng: &rng),
                      stand: nil, name: "above \(way)"),
                Piece(doll: Ragdoll.cut(cast, pose: pose, .below(at: c.at, slant: c.slant), back: -1, force: force, rng: &rng),
                      stand: stand, name: "below \(way)"),
            ]
        }
        for i in made.indices { made[i].doll.raise(raise) }
        return made
    }

    /// Every death, a few times over.
    private static func everyDeath(seeds: Int, base: UInt64) -> [(label: String, piece: Piece, rng: SeededRNG)] {
        var all: [(String, Piece, SeededRNG)] = []
        for (i, kind) in Kind.allCases.enumerated() {
            for (w, way) in Way.allCases.enumerated() {
                for seed in 0..<seeds {
                    var rng = SeededRNG(seed: base &+ UInt64(i * 1000 + w * 37 + seed) &* 0x9E37_79B9)
                    for piece in pieces(kind, way, rng: &rng) { all.append(("\(kind) \(piece.name) \(seed)", piece, rng)) }
                }
            }
        }
        return all
    }

    /// What became of a piece: where it lay, whether it came to rest by lying still, and what was seen on the way.
    private struct Outcome: Sendable {
        var doll: Ragdoll
        var label: String
        var restedBy: Double
        var resting: Bool
        var fastest: CGFloat = 0
        var through: CGFloat = 0
        var finite = true
        var slipped: CGFloat = 0
    }

    /// Lets a piece stand its while, collapse, and fall until it settles, `watch`ing each frame (with the time since
    /// it was let go, nil while it stands).
    private static func play(_ piece: Piece, _ label: String, rng: inout SeededRNG) -> Outcome {
        var doll = piece.doll
        var t = 0.0
        var letGo: Double? = piece.stand == nil ? 0 : nil
        var outcome = Outcome(doll: doll, label: label, restedBy: 0, resting: false)
        var before = doll.points
        var hipAtOne: CGFloat?
        while t < 8 {
            if letGo == nil, let stand = piece.stand, t + RagdollTests.step >= stand {
                doll.collapse(rng: &rng)
                letGo = t
            }
            doll.advance(RagdollTests.step)
            t += RagdollTests.step
            let since = letGo.map { t - $0 }
            for j in 0..<11 where doll.has(j) {
                let p = doll.points[j]
                if !p.x.isFinite || !p.y.isFinite { outcome.finite = false }
                outcome.through = min(outcome.through, p.y)
                if let since, since > 0.2 {
                    outcome.fastest = max(outcome.fastest, hypot(p.x - before[j].x, p.y - before[j].y) / CGFloat(RagdollTests.step))
                }
            }
            if let since, since >= 1.5, hipAtOne == nil { hipAtOne = doll.hip.x }
            before = doll.points
            if let since, doll.settled {
                outcome.restedBy = since
                outcome.resting = doll.resting
                break
            }
            guard outcome.finite else { break }
        }
        if let hipAtOne { outcome.slipped = abs(doll.hip.x - hipAtOne) }
        outcome.doll = doll
        return outcome
    }

    private func highest(_ doll: Ragdoll, _ joints: [Int] = Array(0..<11)) -> CGFloat {
        joints.filter { doll.has($0) }.map { doll.points[$0].y }.max() ?? 0
    }

    /// Every death three times over, fallen to rest: made once, looked at by several tests.
    private static let fallen: [Outcome] = everyDeath(seeds: 3, base: 7).map { label, piece, rng in
        var rng = rng
        return play(piece, label, rng: &rng)
    }

    // MARK: Falling and lying

    func testTheDeadCollapseUnderTheirOwnWeightAndComeToRestOnTheGround() {
        let outcomes = RagdollTests.fallen
        for outcome in outcomes {
            let doll = outcome.doll, label = outcome.label
            // Always: nothing comes apart, nothing goes through the ground, and the body drawn is the doll.
            XCTAssertTrue(outcome.finite, "\(label) came apart")
            XCTAssertGreaterThan(outcome.through, -0.01, "\(label) went through the ground")
            XCTAssertTrue(doll.settled, "\(label) never came to rest")
            XCTAssertLessThan(highest(doll), 0.45, "\(label) is left standing up \(doll.points)")
            let drawn = Figure.skeleton(doll.cast, doll.pose())
            for j in 2..<11 where doll.has(j) {
                XCTAssertEqual(drawn[j].x, doll.points[j].x, accuracy: 0.02, "\(label) joint \(j)")
                XCTAssertEqual(drawn[j].y, doll.points[j].y, accuracy: 0.02, "\(label) joint \(j)")
            }
            let sketch = Figure.sketch(doll.cast, pose: doll.framed().pose)
            XCTAssertFalse(sketch.isEmpty, label)
            XCTAssertTrue(sketch.fits(margin: 1), "\(label) spills off its canvas \(sketch.bounds(margin: 0)) \(doll.hip)")
        }
        let n = Double(outcomes.count)
        func share(_ test: (Outcome) -> Bool) -> Double { Double(outcomes.filter(test).count) / n }
        // They come to rest by lying still, not by being stopped where they are, and soon.
        XCTAssertGreaterThan(share { $0.resting }, 0.95, "rest by lying still")
        XCTAssertGreaterThan(share { $0.restedBy < 3.5 }, 0.9, "rest soon")
        // Low and flat: the hips down, nothing much left up.
        XCTAssertGreaterThan(share { min($0.doll.points[Ragdoll.low].y, $0.doll.points[Ragdoll.high].y) < 0.2 }, 0.97, "trunk down")
        XCTAssertGreaterThan(share { self.highest($0.doll) < 0.32 }, 0.97, "lying flat")
        // Where they lie, they stay: no skating across the lane once down, and nothing stirring after.
        XCTAssertGreaterThan(share { $0.slipped < 0.3 }, 0.97, "no sliding once down")
        var stirring = 0
        for outcome in outcomes {
            var doll = outcome.doll
            let then = doll.points
            doll.advance(1)
            if doll.moved(since: then) > 0.01 { stirring += 1 }
        }
        XCTAssertLessThan(Double(stirring) / n, 0.05, "still once at rest")
    }

    func testNothingIsFlungByItsOwnJoints() {
        // Its joints only ever pass a body's way of moving from one part to another: after the first moment none
        // goes faster than a thrown man's arm.
        let outcomes = RagdollTests.fallen
        for outcome in outcomes { XCTAssertLessThan(outcome.fastest, 12, "\(outcome.label) flung") }
        XCTAssertLessThan(Double(outcomes.filter { $0.fastest > 8 }.count) / Double(outcomes.count), 0.02)
    }

    func testAHalfFliesAsOneBodyTumbling() {
        // In the air, the joints and bones only pass motion between the parts: the whole keeps its way and its
        // turning (but for the air's slight drag) until it lands.
        for (i, kind) in Kind.allCases.enumerated() {
            var doll = Ragdoll(cast: .foe(kind), pose: Figure.struck(.foe(kind), variant: i % 4), severed: .above(at: 0.5, slant: 0.6))
            doll.tone = 0.3
            doll.thrown(CGPoint(x: -1.5, y: 1.6), spin: i % 2 == 0 ? -6 : 5)
            doll.push(Ragdoll.frontHand, CGPoint(x: 1, y: 1))
            doll.raise(0.3)
            let masses = doll.masses
            func momentum(_ d: Ragdoll) -> (p: CGPoint, spin: CGFloat, centre: CGPoint) {
                let v = d.velocities
                var m: CGFloat = 0, p = CGPoint.zero, c = CGPoint.zero
                for j in 0..<11 where d.has(j) {
                    m += masses[j]
                    p.x += masses[j] * v[j].x
                    p.y += masses[j] * v[j].y
                    c.x += masses[j] * d.points[j].x
                    c.y += masses[j] * d.points[j].y
                }
                c = CGPoint(x: c.x / m, y: c.y / m)
                var l: CGFloat = 0
                for j in 0..<11 where d.has(j) {
                    let r = CGPoint(x: d.points[j].x - c.x, y: d.points[j].y - c.y)
                    l += masses[j] * (r.x * v[j].y - r.y * v[j].x)
                }
                return (CGPoint(x: p.x / m, y: p.y / m), l, c)
            }
            doll.advance(1.0 / 120)
            let start = momentum(doll)
            var t = 1.0 / 120
            while t < 0.3, (0..<11).allSatisfy({ !doll.has($0) || doll.points[$0].y > 0.1 }) {
                doll.advance(1.0 / 120)
                t += 1.0 / 120
            }
            XCTAssertGreaterThan(t, 0.1, "\(kind): long enough in the air to tell")
            let end = momentum(doll)
            XCTAssertEqual(end.p.x, start.p.x, accuracy: 0.05 + abs(start.p.x) * 0.02, "\(kind): keeps its way")
            XCTAssertEqual(end.p.y, start.p.y - 9 * CGFloat(t - 1.0 / 120), accuracy: 0.08, "\(kind): falls as one")
            // Tumbling as it was thrown: never faster, never the other way; slowed a little by the air and the drag
            // of its joints.
            XCTAssertGreaterThan(abs(start.spin), 0.2, "\(kind): thrown tumbling")
            XCTAssertGreaterThan(end.spin * start.spin, 0, "\(kind): turns back")
            XCTAssertLessThan(abs(end.spin), abs(start.spin) * 1.01, "\(kind): spins up")
            XCTAssertGreaterThan(abs(end.spin), abs(start.spin) * 0.7, "\(kind): stops tumbling")
        }
    }

    func testStandingPiecesStandUntilLetGoThenFallRatherThanFly() {
        for (i, kind) in Kind.allCases.enumerated() {
            for (s, severed) in [Severed.headless, .below(at: 0.5, slant: 0.6), .below(at: 0.3, slant: 0.05), .below(at: 0.12, slant: 0.08)].enumerated() {
                for variant in [(i + s) % 4, (i + s + 2) % 4] {
                    let label = "\(kind) \(variant) \(severed)"
                    var rng = SeededRNG(seed: UInt64(i * 100 + variant * 10 + s))
                    var doll = Ragdoll.cut(.foe(kind), pose: Figure.struck(.foe(kind), variant: variant), severed, back: -1, rng: &rng)
                    let hip = doll.hip.y
                    let lean = atan2(doll.points[1].x - doll.points[0].x, doll.points[1].y - doll.points[0].y)
                    let feet = [doll.points[Ragdoll.frontFoot], doll.points[Ragdoll.backFoot]]
                    // The longest a headless man stands (0.7 s × 1.4).
                    for _ in 0..<59 {
                        let then = doll.points
                        doll.advance(1.0 / 60)
                        XCTAssertFalse(doll.settled, "\(label) stands")
                        XCTAssertGreaterThan(doll.hip.y, hip - 0.05, "\(label) sags")
                        XCTAssertEqual(doll.points[Ragdoll.frontFoot].x, feet[0].x, accuracy: 0.001, "\(label) feet stay")
                        XCTAssertEqual(doll.points[Ragdoll.backFoot].y, feet[1].y, accuracy: 0.001, "\(label) feet stay")
                        let now = atan2(doll.points[1].x - doll.points[0].x, doll.points[1].y - doll.points[0].y)
                        XCTAssertLessThan(abs(now - lean), 0.25, "\(label) keeps its trunk")
                        // The legs and trunk hold still; only the arms move.
                        for j in [0, 1, 3, 4, 5, 6] {
                            XCTAssertLessThan(hypot(doll.points[j].x - then[j].x, doll.points[j].y - then[j].y), 0.02, "\(label) joint \(j) jerks")
                        }
                        for bend in doll.bends where bend.child == Ragdoll.frontFoot || bend.child == Ragdoll.backFoot {
                            XCTAssertLessThan(bend.angle, 0.15, "\(label) knee bent backward")
                        }
                    }
                    // Let go, it comes down; nothing of it goes up.
                    let top = highest(doll, [0, 1, 3, 4, 5, 6])
                    doll.collapse(rng: &rng)
                    var t = 0.0
                    while !doll.settled, t < 6 {
                        doll.advance(1.0 / 60)
                        t += 1.0 / 60
                        XCTAssertLessThan(highest(doll, [0, 1, 3, 4, 5, 6]), top + 0.05, "\(label) flies up")
                        XCTAssertLessThan(highest(doll), max(top, highest(doll, [7, 8, 9, 10])) + 0.3, "\(label) flies up")
                    }
                    XCTAssertLessThan(doll.hip.y, 0.3, "\(label) goes down")
                }
            }
        }
    }

    func testTheDeadLieApartAndEachTheirOwnWay() {
        var rests: [String: [[CGPoint]]] = [:]
        var merged = 0, legged = 0
        for outcome in RagdollTests.fallen {
            let doll = outcome.doll, label = outcome.label
            let p = doll.points
            if doll.has(Ragdoll.frontKnee) {
                legged += 1
                // The far leg lies beside the near one, not on it.
                if hypot(p[3].x - p[5].x, p[3].y - p[5].y) < 0.02 && hypot(p[4].x - p[6].x, p[4].y - p[6].y) < 0.02 { merged += 1 }
            }
            let key = label.split(separator: " ").dropLast().joined(separator: " ")
            let hip = p[0]
            rests[key, default: []].append((0..<11).map { doll.has($0) ? CGPoint(x: p[$0].x - hip.x, y: p[$0].y - hip.y) : .zero })
        }
        XCTAssertLessThan(Double(merged) / Double(legged), 0.1, "legs merged into one")
        // Bodies that fell the same way do not come to lie the same way.
        // (A whole body has more ways to lie than a pair of legs, which lie straight or folded, one way or the other.)
        var alike = (whole: 0, all: 0), pairs = (whole: 0, all: 0)
        for (key, group) in rests {
            let whole = !key.contains("above") && !key.contains("below")
            for a in group.indices {
                for b in group.indices where b > a {
                    let apart = zip(group[a], group[b]).map { hypot($0.x - $1.x, $0.y - $1.y) }.max() ?? 0
                    pairs.all += 1
                    if apart < 0.05 { alike.all += 1 }
                    if whole {
                        pairs.whole += 1
                        if apart < 0.05 { alike.whole += 1 }
                    }
                }
            }
        }
        XCTAssertLessThan(Double(alike.whole) / Double(pairs.whole), 0.1, "whole bodies lie alike")
        XCTAssertLessThan(Double(alike.all) / Double(pairs.all), 0.25, "pieces lie alike")
    }

    // MARK: Setting up

    func testStartPosesBendOnlyTheWayJointsBend() {
        for kind in Kind.allCases {
            let cast = Cast.foe(kind)
            let poses = (0..<8).map { Figure.struck(cast, variant: $0) } + [Figure.pose(cast, .die(0)), Figure.pose(cast, .stagger(0))]
            for (v, pose) in poses.enumerated() {
                for severed in [nil, Severed.headless, .above(at: 0.5, slant: 0.6), .below(at: 0.5, slant: 0.6)] {
                    var doll = Ragdoll(cast: cast, pose: pose, severed: severed)
                    for bend in doll.bends {
                        XCTAssertGreaterThanOrEqual(bend.angle, bend.lo - 0.001, "\(kind) \(v) \(String(describing: severed)) \(bend.child)")
                        XCTAssertLessThanOrEqual(bend.angle, bend.hi + 0.001, "\(kind) \(v) \(String(describing: severed)) \(bend.child)")
                    }
                    // Nothing snaps into place as it starts: left to itself, no hand leaps before the next frame.
                    if case .above? = severed { continue }
                    if severed != nil { doll.planted(true) }
                    let then = doll.points
                    doll.advance(1.0 / 40)
                    for j in [Ragdoll.frontHand, Ragdoll.backHand] where doll.has(j) {
                        XCTAssertLessThan(hypot(doll.points[j].x - then[j].x, doll.points[j].y - then[j].y), 0.05, "\(kind) \(v) hand \(j) snaps")
                    }
                }
            }
        }
    }

    func testRaggedFramesAndLongStallsDoNoHarm() {
        var rng = SeededRNG(seed: 99)
        for kind in Kind.allCases {
            var doll = Ragdoll.felled(.foe(kind), pose: Figure.pose(.foe(kind), .die(0)), back: -1, force: 1.5, rng: &rng)
            for _ in 0..<400 {
                let u = rng.unit()
                let dt = u < 0.05 ? rng.range(0.3, 5) : u < 0.1 ? 0 : u < 0.12 ? -1 : u < 0.13 ? .nan : rng.range(0.0005, 0.05)
                let before = doll.time
                doll.advance(dt)
                // A long stall is not caught up all at once.
                XCTAssertLessThanOrEqual(doll.time - before, 0.26, "\(kind) \(dt)")
                for j in 0..<11 where doll.has(j) {
                    XCTAssertTrue(doll.points[j].x.isFinite && doll.points[j].y.isFinite, "\(kind)")
                    XCTAssertGreaterThan(doll.points[j].y, -0.01, "\(kind)")
                }
            }
            XCTAssertTrue(doll.settled, "\(kind)")
            XCTAssertLessThan(doll.hip.y, 0.3, "\(kind)")
        }
    }

    // MARK: Ways to die

    func testAShinCutDropsHimOnHisKneesBleedingFromTheShin() {
        for kind in Kind.allCases {
            let cast = Cast.foe(kind)
            var rng = SeededRNG(seed: 5 &+ UInt64(Kind.allCases.firstIndex(of: kind)! * 31))
            var doll = Ragdoll.hamstrung(cast, pose: Figure.struck(cast, variant: 1), back: -1, rng: &rng)
            // The wound is on the front shin, below the knee, bleeding forward.
            guard let wound = doll.wound else { return XCTFail("\(kind): no wound") }
            let knee = doll.points[Ragdoll.frontKnee], foot = doll.points[Ragdoll.frontFoot]
            XCTAssertLessThan(wound.at.y, knee.y, "\(kind)")
            XCTAssertGreaterThan(wound.at.y, foot.y, "\(kind)")
            XCTAssertGreaterThan(cos(wound.angle), 0, "\(kind): bleeds forward")
            let hip = doll.hip.y
            for _ in 0..<24 { doll.advance(1.0 / 60) }
            XCTAssertLessThan(doll.hip.y, hip * 0.8, "\(kind): the legs go from under him")
            for _ in 0..<48 { doll.advance(1.0 / 60) }
            XCTAssertLessThan(doll.hip.y, hip * 0.5, "\(kind): and he goes down")
            var t = 0.0
            while !doll.settled, t < 6 {
                doll.advance(1.0 / 60)
                t += 1.0 / 60
                // The wound stays on the shin as he falls.
                if let w = doll.wound {
                    let k = doll.points[Ragdoll.frontKnee], f = doll.points[Ragdoll.frontFoot]
                    let d = abs((f.x - k.x) * (k.y - w.at.y) - (k.x - w.at.x) * (f.y - k.y)) / hypot(f.x - k.x, f.y - k.y)
                    XCTAssertLessThan(d, 0.001, "\(kind)")
                }
            }
            XCTAssertTrue(doll.resting, "\(kind)")
            XCTAssertLessThan(highest(doll), 0.35, "\(kind)")
        }
    }

    func testHeavyBodiesLieOnTheirBacksNotSunkIntoTheGround() {
        // The trunk lies as thick as it is drawn: a brute's chest keeps his spine further off the ground.
        for kind in [Kind.brute, .warlord] {
            let build = Build.of(.foe(kind))
            var rng = SeededRNG(seed: 41)
            for _ in 0..<4 {
                var doll = Ragdoll.felled(.foe(kind), pose: Figure.pose(.foe(kind), .die(0)), back: -1, rng: &rng)
                var t = 0.0
                while !doll.settled, t < 6 {
                    doll.advance(1.0 / 60)
                    t += 1.0 / 60
                }
                XCTAssertGreaterThan(doll.points[Ragdoll.low].y, build.waist * 0.9 - 0.005, "\(kind)")
                XCTAssertGreaterThan(doll.points[Ragdoll.high].y, build.chest * 0.5 - 0.005, "\(kind)")
            }
        }
    }

    func testABodyCanBeAimedAtAnotherPoseAndStirred() {
        let cast = Cast.foe(.grunt)
        var rng = SeededRNG(seed: 8)
        var plain = Ragdoll(cast: cast, pose: Figure.struck(cast, variant: 2))
        var aimed = plain
        aimed.aim(at: Figure.pose(cast, .die(2)))
        var stirred = plain
        stirred.stir(&rng)
        plain.tone = 0.3
        aimed.tone = 0.3
        stirred.tone = 0.3
        plain.advance(0.3)
        aimed.advance(0.3)
        stirred.advance(0.3)
        XCTAssertGreaterThan(aimed.moved(since: plain.points), 0.05, "reaches for the pose it is aimed at")
        XCTAssertGreaterThan(stirred.moved(since: plain.points), 0.02, "stirred, goes its own way")
        for doll in [aimed, stirred] {
            for bend in doll.bends {
                XCTAssertGreaterThanOrEqual(bend.angle, bend.lo - 0.05)
                XCTAssertLessThanOrEqual(bend.angle, bend.hi + 0.05)
            }
        }
    }
}
