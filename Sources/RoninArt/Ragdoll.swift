import Foundation
#if canImport(CoreGraphics)
import CoreGraphics
#endif
import RoninCore

/// A body gone slack: a jointed skeleton let fall under its own weight, so no two of the dead come down alike.
///
/// Points are in the figure's own heights from the spot it stood on (x toward the way it faced, y up), the ground at
/// y = 0. The trunk is rigid, a line from its low end to its high end (the hips and the neck, or the ends of what a
/// cut left of it); the head hangs from the neck, the legs from the hips and the arms from the shoulders, each joint
/// bending only the way a joint bends. For a moment the body keeps some of the tone of its last pose, then goes
/// limp: the knees buckle, the trunk folds or topples, the arms fly out and flop down.
public struct Ragdoll: Sendable {
    /// The joints, as `Figure.skeleton` gives them (the trunk's two ends in place of the hips and the neck).
    public static let low = 0, high = 1, head = 2, frontKnee = 3, frontFoot = 4, backKnee = 5, backFoot = 6
    public static let frontElbow = 7, frontHand = 8, backElbow = 9, backHand = 10
    private static let count = 11

    public let cast: Cast
    public let severed: Severed?
    public private(set) var points: [CGPoint]
    private var old: [CGPoint]
    private let present: [Bool]
    private let weight: [CGFloat]
    private let radius: [CGFloat]
    private var sticks: [(a: Int, b: Int, length: CGFloat)] = []
    /// The pose it started from: its build and cloth, and the angles its tone pulls toward.
    private let base: Pose
    private var rest: [(pivot: Int, child: Int, angle: CGFloat)] = []
    private let span: (low: CGFloat, high: CGFloat)
    private var pins: [Int: CGPoint] = [:]
    /// How hard the body still holds its pose (0: limp), and how long it takes to let go once it starts to (it
    /// holds on while its feet are planted).
    public var tone: CGFloat = 0.3
    public var slackening = 0.4
    private var letGo: Double? = 0
    public private(set) var time = 0.0
    private var still = 0.0
    private var clock = 0.0

    /// A body in `pose` (on its feet, not rolled), or the part of it a cut leaves.
    public init(cast: Cast, pose: Pose, severed: Severed? = nil) {
        self.cast = cast
        self.severed = severed
        var base = pose
        base.roll = 0
        base.hipAt = nil
        base.severed = nil
        base.armed = false
        base.smear = nil
        base.ghosts = []
        base.drag = 0
        self.base = base
        var p = Figure.skeleton(cast, base)
        let span: (low: CGFloat, high: CGFloat) = severed?.trunk ?? (0, 1)
        self.span = span
        let hip = p[0], neck = p[1]
        func along(_ t: CGFloat) -> CGPoint { CGPoint(x: hip.x + (neck.x - hip.x) * t, y: hip.y + (neck.y - hip.y) * t) }
        p[0] = along(span.low)
        p[1] = along(span.high)
        points = p
        old = p
        let legs = severed?.hasLegs ?? true, arms = severed?.hasArms ?? true, head = severed == nil || severed?.hasHead == true
        var present = [Bool](repeating: true, count: Ragdoll.count)
        present[Ragdoll.head] = head
        for j in [3, 4, 5, 6] { present[j] = legs }
        for j in [7, 8, 9, 10] { present[j] = arms }
        self.present = present
        weight = [0.33, 0.33, 0.67, 0.83, 1, 0.83, 1, 1, 1.2, 1, 1.2]
        radius = [0.07, 0.06, 0.055, 0.035, 0.026, 0.035, 0.026, 0.03, 0.025, 0.03, 0.025]
        let limbs = Figure.limbs
        sticks.append((0, 1, (span.high - span.low) * limbs.torso))
        if head { sticks.append((1, 2, Ragdoll.distance(p[1], p[2]))) }
        if legs {
            sticks += [(0, 3, limbs.thigh), (3, 4, limbs.shin), (0, 5, limbs.thigh), (5, 6, limbs.shin)]
        }
        // The arms hang from the shoulders, which sit on the trunk below the neck (stick -1 stands for them).
        if arms {
            sticks += [(-1, 7, limbs.upperArm), (7, 8, limbs.forearm), (-1, 9, limbs.upperArm), (9, 10, limbs.forearm)]
        }
        // The angle each bone makes with the one it hangs from, which the tone pulls back toward.
        let bones: [(Int, Int)] = (head ? [(1, 2)] : []) + (legs ? [(0, 3), (3, 4), (0, 5), (5, 6)] : []) + (arms ? [(-1, 7), (7, 8), (-1, 9), (9, 10)] : [])
        var angles: [(pivot: Int, child: Int, angle: CGFloat)] = []
        for (pivot, child) in bones { angles.append((pivot, child, relative(pivot, child, in: p))) }
        rest = angles
    }

    // MARK: Setting it going

    /// Sets the whole piece moving (figure heights a second), turning at `spin` (radians a second, positive toward
    /// the way it faced) about its middle.
    public mutating func thrown(_ velocity: CGPoint, spin: CGFloat = 0) {
        let live = (0..<Ragdoll.count).filter { present[$0] }
        let mid = live.reduce(CGPoint.zero) { CGPoint(x: $0.x + points[$1].x, y: $0.y + points[$1].y) }
        let c = CGPoint(x: mid.x / CGFloat(live.count), y: mid.y / CGFloat(live.count))
        for j in live {
            let r = CGPoint(x: points[j].x - c.x, y: points[j].y - c.y)
            // Turning forward (clockwise, seen with him facing right).
            push(j, CGPoint(x: velocity.x + spin * r.y, y: velocity.y - spin * r.x))
        }
    }

    /// Adds to one joint's velocity (figure heights a second).
    public mutating func push(_ joint: Int, _ velocity: CGPoint) {
        guard present[joint] else { return }
        let h = CGFloat(Ragdoll.step)
        old[joint] = CGPoint(x: old[joint].x - velocity.x * h, y: old[joint].y - velocity.y * h)
    }

    /// Holds the feet where they stand (a body still on its legs, holding its pose), or lets them go (and the body
    /// begins to go slack).
    public mutating func planted(_ on: Bool) {
        pins = [:]
        letGo = on ? nil : time
        still = 0
        guard on, present[Ragdoll.frontFoot] else { return }
        for j in [Ragdoll.frontFoot, Ragdoll.backFoot] { pins[j] = points[j] }
    }

    /// Moves the whole body up (or down), as it is.
    public mutating func raise(_ dy: CGFloat) {
        for j in 0..<Ragdoll.count {
            points[j].y += dy
            old[j].y += dy
        }
        for (j, p) in pins { pins[j] = CGPoint(x: p.x, y: p.y + dy) }
    }

    // MARK: Falling

    private static let step = 1.0 / 120

    /// Lets it fall for `dt` seconds.
    public mutating func advance(_ dt: Double) {
        clock += dt
        while clock >= Ragdoll.step {
            clock -= Ragdoll.step
            integrate()
        }
    }

    /// Whether it has come to rest (or has been falling long enough).
    public var settled: Bool { letGo != nil && (still > 0.3 || time - (letGo ?? 0) > 4) }

    private mutating func integrate() {
        let h = CGFloat(Ragdoll.step)
        time += Ragdoll.step
        let gravity: CGFloat = 9
        var fastest: CGFloat = 0
        let most = 7 * h
        for j in 0..<Ragdoll.count where present[j] {
            var v = CGPoint(x: (points[j].x - old[j].x) * 0.997, y: (points[j].y - old[j].y) * 0.997)
            let speed = hypot(v.x, v.y)
            if speed > most { v = CGPoint(x: v.x * most / speed, y: v.y * most / speed) }
            fastest = max(fastest, hypot(v.x, v.y))
            old[j] = points[j]
            points[j] = CGPoint(x: points[j].x + v.x, y: points[j].y + v.y - gravity * h * h)
        }
        if let letGo, time - letGo > 0.4 { topple() }
        let strength = tone * CGFloat(letGo.map { max(0, 1 - (time - $0) / max(0.01, slackening)) } ?? 1)
        if strength > 0.001 { hold(strength) }
        for _ in 0..<8 {
            for stick in sticks { solve(stick) }
            limit()
            ground()
            for (j, p) in pins { points[j] = p }
        }
        still = fastest < 0.0011 ? still + Ragdoll.step : 0
    }

    /// What a body lying still leaves balanced upright goes over, as it would, out of the picture's plane, in a
    /// body that is not flat: a leg, an arm, the trunk sitting up; and a knee standing up off the ground slides its
    /// foot out until the leg lies flat.
    private mutating func topple() {
        func slow(_ j: Int) -> Bool { hypot(points[j].x - old[j].x, points[j].y - old[j].y) < 0.0015 }
        for (j, parent) in [(1, 0), (4, 3), (6, 5), (7, 1), (8, 7), (9, 1), (10, 9)] where present[j] && points[j].y > 0.2 && slow(j) {
            let lean = points[j].x - points[parent].x
            let way: CGFloat = abs(lean) > 0.005 ? (lean > 0 ? 1 : -1) : (j % 2 == 0 ? 1 : -1)
            old[j].x -= way * 0.004
        }
        for (knee, foot) in [(3, 4), (5, 6)] where present[knee] && points[knee].y > 0.09 && slow(knee) {
            let way: CGFloat = points[foot].x >= points[0].x ? 1 : -1
            old[foot].x -= way * 0.003
            old[knee].y += 0.002
        }
    }

    /// Where the shoulders are: on the trunk, a little below the neck.
    private var shoulder: CGPoint {
        let a = points[0], b = points[1]
        let length = max(0.0001, Ragdoll.distance(a, b))
        let back = Figure.limbs.shoulder / length
        return CGPoint(x: b.x - (b.x - a.x) * back, y: b.y - (b.y - a.y) * back)
    }

    private func at(_ j: Int) -> CGPoint { j < 0 ? shoulder : points[j] }

    private mutating func solve(_ stick: (a: Int, b: Int, length: CGFloat)) {
        let pa = at(stick.a), pb = points[stick.b]
        let dx = pb.x - pa.x, dy = pb.y - pa.y
        let d = max(0.0001, hypot(dx, dy))
        let wa = stick.a < 0 ? weight[1] : weight[stick.a], wb = weight[stick.b]
        let k = (d - stick.length) / d / (wa + wb)
        if stick.a < 0 {
            // The shoulder moves the neck end of the trunk.
            points[1].x += dx * k * wa
            points[1].y += dy * k * wa
        } else {
            points[stick.a].x += dx * k * wa
            points[stick.a].y += dy * k * wa
        }
        points[stick.b].x -= dx * k * wb
        points[stick.b].y -= dy * k * wb
    }

    /// The angle a bone makes with the one it hangs from: the head and the limbs off the trunk (the head measured
    /// from the trunk's line up, the legs and arms from its line down), the shins and forearms off the thighs and
    /// upper arms.
    private func relative(_ pivot: Int, _ child: Int, in p: [CGPoint]) -> CGFloat {
        func angle(_ a: CGPoint, _ b: CGPoint) -> CGFloat { atan2(b.x - a.x, -(b.y - a.y)) }
        let a = pivot < 0 ? shoulderOf(p) : p[pivot]
        let bone = angle(a, p[child])
        let parent: CGFloat
        switch (pivot, child) {
        case (1, 2): parent = angle(p[0], p[1])
        case (0, _), (-1, _): parent = angle(p[1], p[0])
        case (let j, _): parent = angle(parentOf(j, in: p), p[j])
        }
        return Ragdoll.wrap(bone - parent)
    }

    private func shoulderOf(_ p: [CGPoint]) -> CGPoint {
        let length = max(0.0001, Ragdoll.distance(p[0], p[1]))
        let back = Figure.limbs.shoulder / length
        return CGPoint(x: p[1].x - (p[1].x - p[0].x) * back, y: p[1].y - (p[1].y - p[0].y) * back)
    }

    private func parentOf(_ j: Int, in p: [CGPoint]) -> CGPoint {
        switch j {
        case 3, 5: return p[0]
        default: return shoulderOf(p)
        }
    }

    /// Everything the joint `pivot` carries when the bone to `child` turns: the child, and below a knee or elbow
    /// the foot or hand too.
    private func carried(_ child: Int) -> [Int] {
        switch child {
        case 3, 5, 7, 9: return [child, child + 1]
        default: return [child]
        }
    }

    /// Turns a bone (and what it carries) about its joint, a little at a time, its way of moving turned with it: a
    /// bent joint straightened this way gains no speed from it, so nothing is flung by its own joints.
    private mutating func turn(_ pivot: Int, _ child: Int, by angle: CGFloat) {
        let c = at(pivot)
        let angle = max(-0.2, min(0.2, angle))
        let cs = cos(angle), sn = sin(angle)
        func turned(_ p: CGPoint) -> CGPoint {
            // In the angle's own sense (from straight down, toward the way he faces).
            let x = p.x - c.x, y = p.y - c.y
            return CGPoint(x: c.x + x * cs - y * sn, y: c.y + x * sn + y * cs)
        }
        for j in carried(child) {
            points[j] = turned(points[j])
            old[j] = turned(old[j])
        }
    }

    /// The tone: each bone pulled part of the way back toward the angle it held.
    private mutating func hold(_ strength: CGFloat) {
        for bone in rest {
            let now = relative(bone.pivot, bone.child, in: points)
            turn(bone.pivot, bone.child, by: Ragdoll.wrap(bone.angle - now) * strength)
        }
    }

    /// The joints bend only so far and only one way: the knees back, the elbows forward, the head a little either
    /// way, the hips forward far more than back.
    private mutating func limit() {
        var ranges: [(Int, Int, CGFloat, CGFloat)] = []
        if present[Ragdoll.head] { ranges.append((1, 2, -0.9, 0.9)) }
        if present[Ragdoll.frontKnee] {
            ranges += [(0, 3, -0.7, 2.2), (3, 4, -2.5, 0.12), (0, 5, -0.7, 2.2), (5, 6, -2.5, 0.12)]
        }
        if present[Ragdoll.frontElbow] { ranges += [(7, 8, -0.1, 2.5), (9, 10, -0.1, 2.5)] }
        for (pivot, child, lo, hi) in ranges {
            let now = relative(pivot, child, in: points)
            guard now < lo || now > hi else { continue }
            // Back to whichever limit is nearer, the short way round.
            let toLo = Ragdoll.wrap(lo - now), toHi = Ragdoll.wrap(hi - now)
            turn(pivot, child, by: (abs(toLo) < abs(toHi) ? toLo : toHi) * 0.6)
        }
    }

    /// Nothing goes through the ground; what touches it drags on it.
    private mutating func ground() {
        for j in 0..<Ragdoll.count where present[j] && points[j].y < radius[j] {
            let vy = points[j].y - old[j].y
            points[j].y = radius[j]
            old[j].y = points[j].y + vy * 0.25
            old[j].x = points[j].x - (points[j].x - old[j].x) * 0.55
        }
    }

    // MARK: Drawing it

    /// The pose that draws the body as it now lies: the trunk's lean turned into a roll about the hips, and every
    /// limb and the head at its angle, the hips wherever they have got to.
    public func pose() -> Pose {
        var p = base
        let a = points[0], b = points[1]
        let length = max(0.0001, Ragdoll.distance(a, b))
        let u = CGPoint(x: (b.x - a.x) / length, y: (b.y - a.y) / length)
        let lean = atan2(u.x, u.y)
        let r = lean - base.lean
        p.roll = r
        p.grounded = false
        p.airborne = false
        p.hipAt = hip
        func angle(_ from: CGPoint, _ to: CGPoint) -> CGFloat { atan2(to.x - from.x, -(to.y - from.y)) + r }
        if present[Ragdoll.frontKnee] {
            p.front = (angle(a, points[3]), angle(points[3], points[4]))
            p.back = (angle(a, points[5]), angle(points[5], points[6]))
        }
        if present[Ragdoll.frontElbow] {
            let s = shoulder
            p.grip = .one
            p.hold = nil
            p.hold2 = nil
            p.arm = (angle(s, points[7]), angle(points[7], points[8]))
            p.arm2 = (angle(s, points[9]), angle(points[9], points[10]))
        }
        if present[Ragdoll.head] { p.tilt = atan2(points[2].x - b.x, points[2].y - b.y) - lean }
        p.severed = severed
        p.stream = 0
        return p
    }

    /// The pose to draw it by on a figure's canvas, the hips in the middle of it and a little up (so that nothing
    /// lying on the ground runs off the bottom), and where the canvas's ground point then is, in the doll's terms.
    public func framed() -> (pose: Pose, anchor: CGPoint) {
        var p = pose()
        let hip = self.hip
        let y = min(hip.y + 0.3, 0.72)
        p.hipAt = CGPoint(x: 0, y: y)
        return (p, CGPoint(x: hip.x, y: hip.y - y))
    }

    /// Where the hips are (inside the body, or where they would be, for what is left above a cut).
    public var hip: CGPoint {
        let a = points[0], b = points[1]
        let length = max(0.0001, Ragdoll.distance(a, b))
        let back = span.low * Figure.limbs.torso / length
        return CGPoint(x: a.x - (b.x - a.x) * back, y: a.y - (b.y - a.y) * back)
    }

    /// Where the wound of a cut is, and the way blood leaves it (radians, from the +x axis); nil for a whole body.
    public var wound: (at: CGPoint, angle: CGFloat)? {
        guard let severed else { return nil }
        let a = points[0], b = points[1]
        switch severed {
        case .above: return (a, atan2(a.y - b.y, a.x - b.x))
        case .below: return (b, atan2(b.y - a.y, b.x - a.x))
        case .headless:
            let up = atan2(b.y - a.y, b.x - a.x)
            return (CGPoint(x: b.x + cos(up) * 0.03, y: b.y + sin(up) * 0.03), up)
        }
    }

    /// How far the joints have moved since `then` (the most any has).
    public func moved(since then: [CGPoint]) -> CGFloat {
        guard then.count == points.count else { return .infinity }
        return (0..<Ragdoll.count).filter { present[$0] }.map { Ragdoll.distance(points[$0], then[$0]) }.max() ?? 0
    }

    public func has(_ joint: Int) -> Bool { present[joint] }

    static func distance(_ a: CGPoint, _ b: CGPoint) -> CGFloat { hypot(b.x - a.x, b.y - a.y) }

    static func wrap(_ a: CGFloat) -> CGFloat {
        var a = a
        while a > .pi { a -= 2 * .pi }
        while a < -.pi { a += 2 * .pi }
        return a
    }
}

// MARK: Ways to die

extension Ragdoll {
    /// A man cut down whole from `pose`, `back` (±1) being the way he is thrown along his own facing: off his feet
    /// and over, or now and then crumpling where he stands, knees first.
    public static func felled(_ cast: Cast, pose: Pose, back: CGFloat, force: CGFloat = 1, rng: inout SeededRNG) -> Ragdoll {
        func r(_ a: Double, _ b: Double) -> CGFloat { CGFloat(rng.range(a, b)) }
        var doll = Ragdoll(cast: cast, pose: pose)
        doll.tone = r(0.2, 0.4)
        doll.slackening = Double(r(0.25, 0.6))
        if rng.chance(0.3) {
            // The legs simply go: down onto the knees, then over.
            doll.push(Ragdoll.low, CGPoint(x: back * r(-0.3, 0.3), y: -r(0.6, 1.4)))
            doll.push(Ragdoll.high, CGPoint(x: -back * r(0.1, 0.9), y: -r(0.2, 0.6)))
            for knee in [Ragdoll.frontKnee, Ragdoll.backKnee] { doll.push(knee, CGPoint(x: -back * r(0.2, 1.0), y: 0)) }
        } else {
            doll.push(Ragdoll.high, CGPoint(x: back * r(1.1, 2.3) * force, y: r(-0.1, 0.5)))
            doll.push(Ragdoll.low, CGPoint(x: back * r(0.2, 0.9) * force, y: r(0, 0.3)))
            doll.push(Ragdoll.head, CGPoint(x: back * r(0.5, 1.5), y: r(-0.3, 0.6)))
            for hand in [Ragdoll.frontHand, Ragdoll.backHand] { doll.push(hand, CGPoint(x: r(-1.5, 1.5), y: r(0, 2))) }
        }
        return doll
    }

    /// What a cut leaves of a man in `pose`: the part above it flung `back` (±1, along his facing) and up, tumbling,
    /// arms flying; the part below still standing, its feet planted, until it is let `collapse`.
    public static func cut(_ cast: Cast, pose: Pose, _ severed: Severed, back: CGFloat, force: CGFloat = 1, lift: CGFloat = 1,
                           rng: inout SeededRNG) -> Ragdoll {
        func r(_ a: Double, _ b: Double) -> CGFloat { CGFloat(rng.range(a, b)) }
        var doll = Ragdoll(cast: cast, pose: pose, severed: severed)
        if case .above = severed {
            doll.tone = r(0.15, 0.35)
            doll.slackening = Double(r(0.2, 0.5))
            doll.thrown(CGPoint(x: back * r(1.0, 2.0) * force, y: r(0.8, 1.3) * lift * force), spin: back * r(2, 7))
            for hand in [Ragdoll.frontHand, Ragdoll.backHand, Ragdoll.head] { doll.push(hand, CGPoint(x: r(-1.5, 1.5), y: r(-0.5, 1.5))) }
        } else {
            doll.tone = 0.45
            doll.planted(true)
        }
        return doll
    }

    /// Legs, or a body without its head, that have stood a moment: the knees go, and it folds or topples its own way.
    public mutating func collapse(rng: inout SeededRNG) {
        func r(_ a: Double, _ b: Double) -> CGFloat { CGFloat(rng.range(a, b)) }
        planted(false)
        tone = r(0.2, 0.45)
        slackening = Double(r(0.12, 0.4))
        let lean = r(-1, 1)
        push(Ragdoll.low, CGPoint(x: lean * 0.5, y: -r(0.1, 0.6)))
        push(Ragdoll.high, CGPoint(x: lean * r(0.6, 1.4), y: 0))
        for knee in [Ragdoll.frontKnee, Ragdoll.backKnee] where has(knee) { push(knee, CGPoint(x: r(-0.3, 0.9), y: 0)) }
    }
}
