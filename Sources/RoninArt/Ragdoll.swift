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
/// bending only the way a joint bends. A joint pulls on the bones on both sides of it, each moved as little as what
/// it carries makes it (the trunk hardly, a hand a lot), so a body turns and tumbles only as it was thrown: nothing is
/// flung by its own joints.
///
/// For a moment the body keeps some of the tone of its last pose (standing, its legs lock and hold it up), then goes
/// limp: the knees buckle first, then the hips, and the trunk folds or topples; the arms fly out and flop down. Dead
/// flesh drags at its joints and on the ground, so it lands, skids a little and lies still, low and flat, the far
/// limbs beside the near ones, each its own way. It lies on the body as it is drawn (the trunk on its outline, face
/// up or face down, a heavy man's limbs thicker), neither sunk into the ground nor held off it.
public struct Ragdoll: Sendable {
    /// The joints, as `Figure.skeleton` gives them (the trunk's two ends in place of the hips and the neck).
    public static let low = 0, high = 1, head = 2, frontKnee = 3, frontFoot = 4, backKnee = 5, backFoot = 6
    public static let frontElbow = 7, frontHand = 8, backElbow = 9, backHand = 10
    private static let count = 11
    /// The shoulders: not a joint of their own but a point on the trunk a little below the neck, which the arms hang
    /// from.
    private static let shoulder = -1

    /// A bone: two joints (or the shoulders and a joint) held `length` apart.
    private struct Bone: Sendable {
        let a: Int, b: Int
        let length: CGFloat
    }

    /// What a joint is, for how soon it lets go.
    private enum Part: Sendable { case neck, hip, knee, shoulder, elbow }

    /// A joint: the bone from `parent` to `pivot` and the bone from `pivot` on to `child`, and how far the second may
    /// turn from the line of the first (radians, toward the way he faces positive).
    private struct Hinge: Sendable {
        let parent: Int, pivot: Int, child: Int
        let lo: CGFloat, hi: CGFloat
        let part: Part
    }

    /// The joints bend only so far and only one way: the knees back (all the way, folded under him), the elbows
    /// forward, the head a little either way, the hips forward far more than back; the shoulders any way at all.
    private static let hinges: [Hinge] = [
        Hinge(parent: 0, pivot: 1, child: 2, lo: -0.9, hi: 0.9, part: .neck),
        Hinge(parent: 1, pivot: 0, child: 3, lo: -0.7, hi: 2.8, part: .hip),
        Hinge(parent: 0, pivot: 3, child: 4, lo: -3.05, hi: 0.1, part: .knee),
        Hinge(parent: 1, pivot: 0, child: 5, lo: -0.7, hi: 2.8, part: .hip),
        Hinge(parent: 0, pivot: 5, child: 6, lo: -3.05, hi: 0.1, part: .knee),
        Hinge(parent: 1, pivot: -1, child: 7, lo: -.pi, hi: .pi, part: .shoulder),
        Hinge(parent: -1, pivot: 7, child: 8, lo: -0.1, hi: 2.6, part: .elbow),
        Hinge(parent: 1, pivot: -1, child: 9, lo: -.pi, hi: .pi, part: .shoulder),
        Hinge(parent: -1, pivot: 9, child: 10, lo: -0.1, hi: 2.6, part: .elbow),
    ]
    /// The hips and the knees among them.
    private static let hips = [1, 3], knees = [2, 4]
    /// How far inside its range a joint of a pose is brought before the body starts, and held.
    private static let margin: CGFloat = 0.02
    /// The furthest forward a knee may be drawn in a pose a body starts from (radians past straight, as `hinges`
    /// measure it): the range's end, less the margin. For `Figure`, which draws the poses the dead start from.
    static var kneeLimit: CGFloat { hinges[2].hi - margin }

    /// How the body moves and lies (tuned by eye and by the numbers the tests hold it to).
    private enum Tuning {
        /// Solver passes a step.
        static let passes = 8
        /// What of its speed each joint keeps from one step to the next, in the air.
        static let air: CGFloat = 0.9993
        /// What of each joint's turn in a step dead flesh takes back.
        static let drag: CGFloat = 0.015
        /// How hard the ground holds what lies on it (a friction coefficient, varied a little body to body).
        static let grip: CGFloat = 0.8
        /// How much of its fall what strikes the ground hard keeps, bouncing back up, and how hard it must strike
        /// (figure heights a second).
        static let bounce: CGFloat = 0.2
        static let bounceFrom: CGFloat = 0.6
        /// Below this (figure heights a step) a joint is still.
        static let stillness: CGFloat = 0.0004
        /// After this long let go, whatever still stirs is slowed to a stop (by `calming` a step, at the most).
        static let calm = 2.4
        static let calming: CGFloat = 0.1
        /// When, after it is let go, what is left standing up goes over (as a body does, out of the picture's
        /// plane), and how fast (figure heights a step).
        static let overFrom = 0.4
        static let overUntil = 2.4
        static let over: CGFloat = 0.0025
        /// How often a knee left up folds flat rather than straightens.
        static let fold = 0.35
        /// How often what stood goes down in a heap (the rest topple stiff or go onto one knee, half and half).
        static let buckle = 0.5
        /// How hard what stood is sent the way it is to go over against the way it leans (figure heights a second, for
        /// each unit of the sine of its lean).
        static let against: CGFloat = 2.5
    }

    public let cast: Cast
    public let severed: Severed?
    public private(set) var points: [CGPoint]
    private var old: [CGPoint]
    private let present: [Bool]
    /// One over what each joint weighs: the trunk's ends heavy, a hand light.
    private let lightness: [CGFloat]
    /// How thick the body is at each joint: how far off the ground the joint is when that part of it lies there (for
    /// the trunk's ends, the least: see `outline`).
    private let radius: [CGFloat]
    /// The trunk as it is drawn, split between its two ends (each point from the end it is nearer, x along the
    /// trunk's line toward the high end, y out toward the chest): whichever side of it is down, it lies on that, not
    /// sunk into the ground, the chest as deep as it is drawn and a cut's slant as far as it runs.
    private let outline: (low: [CGPoint], high: [CGPoint])
    /// How far off the ground each joint must be as the body now lies: its thickness there, or the trunk's.
    private var floors: [CGFloat]
    /// How much further up each joint lies once the body is down, as if a little further from the eye, so the far
    /// leg and arm lie beside the near ones rather than on them.
    private var depth: [CGFloat]
    private let bones: [Bone]
    /// How far down the trunk from its high end the shoulders are, as a share of it.
    private let shoulderAt: CGFloat
    /// The pose it started from: its build and cloth.
    private let base: Pose
    /// The bend each joint holds while it has tone, joint by joint as `hinges` lists them.
    private var rest: [CGFloat]
    private let span: (low: CGFloat, high: CGFloat)
    /// The joints held where they stand, as bits, and where they are held.
    private var pinned = 0
    private var anchors: [CGPoint]
    /// How hard the body still holds its pose (0: limp), and how long it takes to let go once it starts to (it
    /// holds on while its feet are planted).
    public var tone: CGFloat = 0.3
    public var slackening = 0.4
    /// How soon the knees (the near one, the far one) and the hips let go, as shares of the slackening: mostly the
    /// knees first.
    private var give: (front: Double, back: Double, hips: Double) = (0.35, 0.35, 0.7)
    /// Standing, how fast the knees give under the weight (radians a second).
    private var sink: CGFloat = 0
    /// How this body in particular drags on the ground, as a share of the usual; and which of its knees, left
    /// standing up, fold flat rather than straighten (as bits).
    private var grip: CGFloat = 1
    private var folds = 0
    private var letGo: Double? = 0
    private var plantedAt = 0.0
    /// Standing, how long the arms keep their tone before they drop and hang.
    private var droop = 0.4
    public private(set) var time = 0.0
    private var still = 0.0
    private var clock = 0.0
    /// A wound other than a cut's: on the bone into `joint`, `along` of the way from the joint it hangs from.
    private var gash: (joint: Int, along: CGFloat)?
    // Kept from step to step so as not to be made afresh: where the joints were, how fast each was falling, how
    // hard the ground pushed it back, and how each joint was bent.
    private var was: [CGPoint]
    private var falling: [CGFloat]
    private var pressed: [CGFloat]
    private var bent: [CGFloat]

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
        let legs = severed?.hasLegs ?? true, arms = severed?.hasArms ?? true, head = severed == nil || severed?.hasHead == true
        var present = [Bool](repeating: true, count: Ragdoll.count)
        present[Ragdoll.head] = head
        for j in 3...6 { present[j] = legs }
        for j in 7...10 { present[j] = arms }
        self.present = present
        let limbs = Figure.limbs
        let trunk = max(0.001, (span.high - span.low) * limbs.torso)
        shoulderAt = min(0.9, limbs.shoulder / trunk)
        // What each joint carries: the trunk's ends its flesh (and the hips the pelvis, the neck the shoulders), the
        // others the half of each bone that meets there.
        let flesh = 4.4 * (span.high - span.low)
        let mass: [CGFloat] = [(span.low == 0 ? 1 : 0) + max(0.1, flesh / 2), max(0.2, flesh / 2 + (arms ? 0.4 : 0)),
                               1.1, 1.3, 0.8, 1.3, 0.8, 0.6, 0.45, 0.6, 0.45]
        lightness = mass.map { 1 / $0 }
        // How thick the limbs are (a heavy man's are thicker, and a brawny man's hips and thighs thicker still, so that
        // they lie on the ground and not in it); the trunk lies on its outline as drawn, split at its middle between
        // its two ends.
        let build = Build.of(cast)
        let k = build.bulk, m = build.bulk * build.brawn
        radius = [0.04 * m, 0.04 * k, 0.055, 0.035 * m, 0.026 * k, 0.035 * m, 0.026 * k, 0.03 * k, 0.025 * k, 0.03 * k, 0.025 * k]
        let from = span.low * limbs.torso
        let rim = Figure.trunkOutline(cast, severed: severed).map { CGPoint(x: $0.x - from, y: $0.y) }
        outline = (rim.filter { $0.x < trunk / 2 }, rim.filter { $0.x >= trunk / 2 }.map { CGPoint(x: $0.x - trunk, y: $0.y) })
        floors = radius
        depth = [CGFloat](repeating: 0, count: Ragdoll.count)
        var bones = [Bone(a: 0, b: 1, length: trunk)]
        if head { bones.append(Bone(a: 1, b: 2, length: Ragdoll.distance(p[1], p[2]))) }
        if legs {
            bones += [Bone(a: 0, b: 3, length: limbs.thigh), Bone(a: 3, b: 4, length: limbs.shin),
                      Bone(a: 0, b: 5, length: limbs.thigh), Bone(a: 5, b: 6, length: limbs.shin)]
        }
        if arms {
            bones += [Bone(a: -1, b: 7, length: limbs.upperArm), Bone(a: 7, b: 8, length: limbs.forearm),
                      Bone(a: -1, b: 9, length: limbs.upperArm), Bone(a: 9, b: 10, length: limbs.forearm)]
        }
        self.bones = bones
        points = p
        old = p
        anchors = p
        was = p
        falling = [CGFloat](repeating: 0, count: Ragdoll.count)
        pressed = falling
        rest = [CGFloat](repeating: 0, count: Ragdoll.hinges.count)
        bent = rest
        // A pose drawn past where a joint bends is brought back inside it before it starts, not snapped there on the
        // first step; the tone then holds what a joint can hold.
        for k in Ragdoll.hinges.indices where live(k) && Ragdoll.hinges[k].part != .shoulder {
            let hinge = Ragdoll.hinges[k]
            let now = angle(k)
            let to = min(hinge.hi - Ragdoll.margin, max(hinge.lo + Ragdoll.margin, now))
            if to != now { swing(k, by: to - now) }
        }
        old = points
        anchors = points
        for k in Ragdoll.hinges.indices where live(k) { rest[k] = angle(k) }
    }

    // MARK: Setting it going

    /// Sets the whole piece moving (figure heights a second), turning at `spin` (radians a second, positive toward
    /// the way it faced) about its middle.
    public mutating func thrown(_ velocity: CGPoint, spin: CGFloat = 0) {
        var c = CGPoint.zero, total: CGFloat = 0
        for j in 0..<Ragdoll.count where present[j] {
            let m = 1 / lightness[j]
            c.x += points[j].x * m
            c.y += points[j].y * m
            total += m
        }
        c = CGPoint(x: c.x / total, y: c.y / total)
        for j in 0..<Ragdoll.count where present[j] {
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

    /// Holds the feet where they stand, and the legs locked under the body (a body still on its feet, holding its
    /// pose), or lets them go (and the body begins to go slack).
    public mutating func planted(_ on: Bool) {
        pinned = 0
        letGo = on ? nil : time
        still = 0
        guard on, present[Ragdoll.frontFoot] else { return }
        plantedAt = time
        for j in [Ragdoll.frontFoot, Ragdoll.backFoot] {
            pinned |= 1 << j
            anchors[j] = points[j]
            old[j] = points[j]
        }
    }

    /// Moves the whole body up (or down), as it is.
    public mutating func raise(_ dy: CGFloat) {
        for j in 0..<Ragdoll.count {
            points[j].y += dy
            old[j].y += dy
            anchors[j].y += dy
        }
    }

    /// Makes it bleed from somewhere other than a cut: from the bone that ends at `joint` (a knee, a foot, an elbow, a
    /// hand or the head; the trunk for either of its ends), `along` of the way down it.
    public mutating func wounded(at joint: Int, along: CGFloat = 0.5) {
        guard (0..<Ragdoll.count).contains(joint), present[joint] else { return }
        gash = (joint, min(1, max(0, along)))
    }

    /// Unsettles the pose it goes slack from, by up to `amount` (1 is a good deal): what its tone pulls it toward as
    /// it goes, so bodies thrown the same way still come down their own ways.
    public mutating func stir(_ rng: inout SeededRNG, by amount: CGFloat = 1) {
        for k in Ragdoll.hinges.indices where live(k) {
            let hinge = Ragdoll.hinges[k]
            let d: CGFloat
            switch hinge.part {
            case .neck: d = CGFloat(rng.range(-0.5, 0.5))
            // The legs only ever fold further: a body going down never pushes itself back up.
            case .hip: d = CGFloat(rng.range(0, 0.8))
            case .knee: d = CGFloat(rng.range(-1.2, 0))
            case .elbow: d = CGFloat(rng.range(-0.4, 1.3))
            case .shoulder: d = CGFloat(rng.range(-0.8, 0.8))
            }
            rest[k] = min(hinge.hi - 0.05, max(hinge.lo + 0.05, rest[k] + d * amount))
        }
    }

    /// Has its tone pull toward `pose` rather than the one it started from: a body let go from one pose, reaching
    /// for another as it falls.
    public mutating func aim(at pose: Pose) {
        var target = pose
        target.roll = 0
        target.hipAt = nil
        let p = Figure.skeleton(cast, target)
        let b = Figure.limbs.shoulder / Figure.limbs.torso
        func at(_ j: Int) -> CGPoint {
            j >= 0 ? p[j] : CGPoint(x: p[1].x + (p[0].x - p[1].x) * b, y: p[1].y + (p[0].y - p[1].y) * b)
        }
        for k in Ragdoll.hinges.indices where live(k) {
            let hinge = Ragdoll.hinges[k]
            let a = Ragdoll.angle(at(hinge.parent), at(hinge.pivot), at(hinge.child))
            rest[k] = min(hinge.hi - Ragdoll.margin, max(hinge.lo + Ragdoll.margin, a))
        }
    }

    /// Has it reach for `pose` as it goes, rather than for the pose it was struck in (`aim(at:)`), unsettled by a
    /// little or a good deal (`stir`), so bodies struck down alike, from the very pose a figure froze in, still come
    /// down and lie their own ways; `fling`ing its head and arms toward it as well, as a blow that throws a man off his
    /// feet flings them (to where they are in it, from the hips, in about an eighth of a second). It moves nothing yet:
    /// the first frame is still the pose it started from.
    public mutating func reach(for pose: Pose, fling: Bool = false, rng: inout SeededRNG) {
        aim(at: pose)
        stir(&rng, by: CGFloat(rng.range(0.3, 1)))
        guard fling else { return }
        let target = Ragdoll(cast: cast, pose: pose)
        let to = target.points, there = target.hip, from = points, here = hip
        for j in [Ragdoll.head, Ragdoll.frontElbow, Ragdoll.frontHand, Ragdoll.backElbow, Ragdoll.backHand] where present[j] {
            let dx = (to[j].x - there.x) - (from[j].x - here.x), dy = (to[j].y - there.y) - (from[j].y - here.y)
            push(j, CGPoint(x: dx / 0.12, y: dy / 0.12))
        }
    }

    /// Makes the body its own: how far off the near ones its far leg and arm lie, and how it drags on the ground.
    private mutating func vary(_ rng: inout SeededRNG) {
        func r(_ a: Double, _ b: Double) -> CGFloat { CGFloat(rng.range(a, b)) }
        depth[Ragdoll.backKnee] = r(0.015, 0.05)
        depth[Ragdoll.backFoot] = depth[Ragdoll.backKnee] + r(0, 0.06)
        depth[Ragdoll.backElbow] = r(0.01, 0.04)
        depth[Ragdoll.backHand] = depth[Ragdoll.backElbow] + r(0, 0.05)
        grip = r(0.75, 1.25)
        for knee in [Ragdoll.frontKnee, Ragdoll.backKnee] where rng.chance(Tuning.fold) { folds |= 1 << knee }
    }

    // MARK: Falling

    private static let step = 1.0 / 120
    /// The most it is let fall in one go: after a long stall it takes up where it was rather than catching up.
    private static let longest = 0.25
    private static let gravity: CGFloat = 9
    /// The fastest any joint goes (figure heights a second): a safeguard, well beyond any throw.
    private static let fastest: CGFloat = 9

    /// Lets it fall for `dt` seconds.
    public mutating func advance(_ dt: Double) {
        guard dt > 0, dt.isFinite else { return }
        clock += min(dt, Ragdoll.longest)
        while clock >= Ragdoll.step {
            clock -= Ragdoll.step
            integrate()
        }
    }

    /// Whether it has come to rest (or has been falling long enough).
    public var settled: Bool { letGo != nil && (still > 0.3 || time - (letGo ?? 0) > 4) }

    /// Whether it has come to rest by lying still, rather than by being let fall long enough.
    public var resting: Bool { letGo != nil && still > 0.3 }

    private func live(_ k: Int) -> Bool { present[Ragdoll.hinges[k].child] }

    private func mobility(_ j: Int) -> CGFloat { pinned & (1 << j) != 0 ? 0 : lightness[j] }

    private mutating func integrate() {
        let h = CGFloat(Ragdoll.step)
        time += Ragdoll.step
        let since = letGo.map { time - $0 }
        // A little air; and once it has lain a while, whatever still stirs is brought to a stop rather than stopped
        // where it is.
        var keep = Tuning.air
        if let since, since > Tuning.calm { keep *= 1 - Tuning.calming * CGFloat(min(1, (since - Tuning.calm) / 1.0)) }
        let most = Ragdoll.fastest * h
        let fall = Ragdoll.gravity * h * h
        for k in Ragdoll.hinges.indices where live(k) { bent[k] = angle(k) }
        for j in 0..<Ragdoll.count where present[j] {
            was[j] = points[j]
            if pinned & (1 << j) != 0 {
                points[j] = anchors[j]
                old[j] = anchors[j]
                falling[j] = 0
                continue
            }
            var vx = (points[j].x - old[j].x) * keep, vy = (points[j].y - old[j].y) * keep
            let speed = (vx * vx + vy * vy).squareRoot()
            if speed > most {
                vx *= most / speed
                vy *= most / speed
            }
            falling[j] = vy
            old[j] = points[j]
            points[j] = CGPoint(x: points[j].x + vx, y: points[j].y + vy - fall)
        }
        // Dead flesh drags at its joints: part of each joint's turn this step is taken back.
        for k in Ragdoll.hinges.indices where live(k) {
            let turn = Ragdoll.wrap(angle(k) - bent[k])
            if turn != 0 { bend(k, by: turn, Tuning.drag) }
        }
        // The tone: each joint pulled part of the way back to the bend it holds. Standing, the legs and the neck are
        // held outright, below.
        let standing = letGo == nil
        for k in Ragdoll.hinges.indices where live(k) {
            let part = Ragdoll.hinges[k].part
            if standing && part != .shoulder && part != .elbow { continue }
            let s = strength(k, since)
            if s > 0.001 { bend(k, by: Ragdoll.wrap(angle(k) - rest[k]), s) }
        }
        if standing, sink > 0 {
            // The knees giving under the weight, the hips folding a little with them.
            for k in Ragdoll.knees where live(k) { rest[k] = max(Ragdoll.hinges[k].lo + 0.4, rest[k] - sink * h) }
            for k in Ragdoll.hips where live(k) { rest[k] = min(Ragdoll.hinges[k].hi - 0.4, rest[k] + sink * h * 0.5) }
        }
        var toppling = false
        if let since, since > Tuning.overFrom, since < Tuning.overUntil { toppling = goOver() }
        // The far limbs come to lie beside the near ones over the first half second it is down.
        let ease = CGFloat(min(1, (since ?? 0) / 0.5))
        for j in 0..<Ragdoll.count { pressed[j] = 0 }
        for _ in 0..<Tuning.passes {
            for bone in bones { solve(bone) }
            for k in Ragdoll.hinges.indices where live(k) && Ragdoll.hinges[k].part != .shoulder { limit(k) }
            if standing {
                for k in 0..<5 where live(k) { bend(k, by: Ragdoll.wrap(angle(k) - rest[k]), 1) }
            }
            gauge(ease)
            for j in 0..<Ragdoll.count where present[j] {
                let floor = floors[j]
                if points[j].y < floor {
                    pressed[j] += floor - points[j].y
                    points[j].y = floor
                }
            }
            if pinned != 0 {
                for j in 0..<Ragdoll.count where pinned & (1 << j) != 0 { points[j] = anchors[j] }
            }
        }
        // The ground answers once a step: what struck it hard bounces a little, the rest stays down; and whatever
        // it pushed back drags on it, as hard as it was pushed.
        for j in 0..<Ragdoll.count where present[j] && pressed[j] > 0 && pinned & (1 << j) == 0 {
            var vx = points[j].x - old[j].x, vy = points[j].y - old[j].y
            if points[j].y <= floors[j] + 0.0001 {
                vy = falling[j] < -Tuning.bounceFrom * h ? -falling[j] * Tuning.bounce : 0
            }
            let drag = Tuning.grip * grip * pressed[j]
            vx = abs(vx) <= drag ? 0 : vx - (vx > 0 ? drag : -drag)
            old[j] = CGPoint(x: points[j].x - vx, y: points[j].y - vy)
        }
        var moved: CGFloat = 0
        var sound = true
        for j in 0..<Ragdoll.count where present[j] {
            guard points[j].x.isFinite, points[j].y.isFinite else {
                sound = false
                break
            }
            moved = max(moved, Ragdoll.distance(points[j], was[j]))
        }
        if !sound {
            // Never expected; but a body that has come apart in the numbers is put back where it was, and stopped.
            points = was
            old = was
            moved = 0
        }
        still = moved < Tuning.stillness && !toppling ? still + Ragdoll.step : 0
    }

    /// How hard a joint still holds its bend. Standing, the arms hold a moment, then drop; let go, the knees and
    /// the hips give when they give, and then the rest.
    private func strength(_ k: Int, _ since: Double?) -> CGFloat {
        guard let since else { return tone * CGFloat(max(0, 1 - (time - plantedAt) / droop)) }
        let share: Double
        switch Ragdoll.hinges[k].child {
        case Ragdoll.frontFoot: share = give.front
        case Ragdoll.backFoot: share = give.back
        case Ragdoll.frontKnee, Ragdoll.backKnee: share = give.hips
        default: share = 1
        }
        return tone * CGFloat(max(0, 1 - since / max(0.01, slackening * share)))
    }

    /// How far off the ground each joint must be as the body now lies (`floors`): a limb's thickness, the far ones a
    /// little further off (`ease` of the way there); and for each end of the trunk, as far as the half of its outline
    /// nearer that end reaches below it, whichever side of it is down and however it slopes.
    private mutating func gauge(_ ease: CGFloat) {
        for j in 2..<Ragdoll.count { floors[j] = radius[j] + depth[j] * ease }
        let a = points[0], b = points[1]
        let length = Ragdoll.distance(a, b)
        guard length > 1e-6 else {
            floors[0] = radius[0]
            floors[1] = radius[1]
            return
        }
        // Along the trunk (u), and out toward the chest (u turned a quarter back): a point x along it and y out from
        // it lies y u.x - x u.y below the end it is measured from.
        let ux = (b.x - a.x) / length, uy = (b.y - a.y) / length
        var low = radius[0], high = radius[1]
        for p in outline.low { low = max(low, p.y * ux - p.x * uy) }
        for p in outline.high { high = max(high, p.y * ux - p.x * uy) }
        floors[0] = low
        floors[1] = high
    }

    /// The knees over their feet, the trunk's two ends, and the joints that can be left standing up over the one
    /// they hang from.
    private static let shins = [(3, 4), (5, 6)], ends = [0, 1]
    private static let upright = [(1, 0), (2, 1), (4, 3), (6, 5), (7, 1), (8, 7), (9, 1), (10, 9)]

    /// What a body lying still leaves standing up goes over, as a body does, out of the picture's plane: a trunk
    /// sitting up, a knee up (its foot sliding out), a leg or an arm in the air. Only for a while after it is let go,
    /// so that a body that cannot lie flatter still comes to rest; while it does, the body is not yet still.
    private mutating func goOver() -> Bool {
        let k = Tuning.over
        var any = false
        func slow(_ j: Int) -> Bool { Ragdoll.distance(points[j], old[j]) < 0.0015 }
        for (knee, foot) in Ragdoll.shins where present[knee] && points[knee].y > radius[knee] + 0.08 && slow(knee) {
            // The higher it stands, the harder it goes over: its foot sliding out until the leg lies straight, or
            // (a leg of its own) in under it, folding it flat.
            let push = k * min(3, 1 + (points[knee].y - radius[knee] - 0.08) * 10)
            points[knee].y -= push
            if folds & (1 << knee) != 0 {
                shove(knee, (points[knee].x >= points[0].x ? 1 : -1) * push * 0.5, against: foot)
            } else {
                shove(foot, (points[foot].x >= points[0].x ? 1 : -1) * push * 0.5, against: Ragdoll.low)
            }
            any = true
        }
        for j in Ragdoll.ends where points[j].y > floors[j] + 0.1 && slow(j) {
            // The trunk goes down the way it leans, over what holds it up: a man left kneeling tips forward off his
            // knees onto his face, one left sitting goes over backward.
            let way: CGFloat = points[1].x >= points[0].x ? 1 : -1
            points[j].y -= k
            if j == Ragdoll.low && present[Ragdoll.frontKnee] {
                shove(j, way * k * 0.5, against: Ragdoll.frontKnee)
                shove(j, way * k * 0.5, against: Ragdoll.backKnee)
            } else {
                shove(j, way * k, against: 1 - j)
            }
            any = true
        }
        for (j, parent) in Ragdoll.upright where present[j] && points[j].y > (j < 2 ? floors[j] : radius[j]) + 0.15 && slow(j) {
            let lean = points[j].x - points[parent].x
            let way: CGFloat = abs(lean) > 0.005 ? (lean > 0 ? 1 : -1) : (j % 2 == 0 ? 1 : -1)
            points[j].y -= k * 0.5
            shove(j, way * k, against: parent)
            any = true
        }
        return any
    }

    /// Moves a joint `dx` along the ground and what it leans on the other way, as far as their weights make it, so
    /// that a body going over turns where it lies and does not creep across the ground.
    private mutating func shove(_ j: Int, _ dx: CGFloat, against n: Int) {
        points[j].x += dx
        points[n].x -= dx * lightness[n] / lightness[j]
    }

    // MARK: The bones and the joints

    /// Where a joint is, or the shoulders (-1).
    private func at(_ j: Int) -> CGPoint {
        guard j < 0 else { return points[j] }
        let a = points[0], b = points[1]
        return CGPoint(x: b.x + (a.x - b.x) * shoulderAt, y: b.y + (a.y - b.y) * shoulderAt)
    }

    /// Holds a bone to its length, each end moved as little as what it carries makes it (the shoulders' share
    /// spread over the trunk's two ends).
    private mutating func solve(_ bone: Bone) {
        let pa = at(bone.a), pb = points[bone.b]
        let dx = pb.x - pa.x, dy = pb.y - pa.y
        let d = (dx * dx + dy * dy).squareRoot()
        guard d > 1e-6 else { return }
        let wb = mobility(bone.b)
        if bone.a >= 0 {
            let wa = mobility(bone.a)
            guard wa + wb > 0 else { return }
            let k = (d - bone.length) / d / (wa + wb)
            points[bone.a].x += dx * k * wa
            points[bone.a].y += dy * k * wa
            points[bone.b].x -= dx * k * wb
            points[bone.b].y -= dy * k * wb
        } else {
            let c = shoulderAt, w0 = mobility(0), w1 = mobility(1)
            let wa = w0 * c * c + w1 * (1 - c) * (1 - c)
            guard wa + wb > 0 else { return }
            let k = (d - bone.length) / d / (wa + wb)
            points[0].x += dx * k * w0 * c
            points[0].y += dy * k * w0 * c
            points[1].x += dx * k * w1 * (1 - c)
            points[1].y += dy * k * w1 * (1 - c)
            points[bone.b].x -= dx * k * wb
            points[bone.b].y -= dy * k * wb
        }
    }

    /// How far a joint is bent: the turn from its parent bone's line to its child bone's (radians, positive toward
    /// the way he faces for a leg or an arm hanging down).
    private func angle(_ k: Int) -> CGFloat {
        let hinge = Ragdoll.hinges[k]
        return Ragdoll.angle(at(hinge.parent), at(hinge.pivot), points[hinge.child])
    }

    private static func angle(_ a: CGPoint, _ p: CGPoint, _ c: CGPoint) -> CGFloat {
        let wx = p.x - a.x, wy = p.y - a.y, vx = c.x - p.x, vy = c.y - p.y
        return atan2(wx * vy - wy * vx, wx * vx + wy * vy)
    }

    /// Unbends a joint by `error` (radians; `stiffness` of it, and never more than a quarter radian at once), turning
    /// the bones on both sides of it about it, each by as little as what it carries makes it: what one side gains the
    /// other gives back, so the joint pushes on the body as a real one does and adds nothing of its own to how it
    /// moves.
    private mutating func bend(_ k: Int, by error: CGFloat, _ stiffness: CGFloat) {
        let hinge = Ragdoll.hinges[k]
        let a = at(hinge.parent), p = at(hinge.pivot), c = points[hinge.child]
        let wx = p.x - a.x, wy = p.y - a.y, vx = c.x - p.x, vy = c.y - p.y
        let ww = wx * wx + wy * wy, vv = vx * vx + vy * vy
        guard ww > 1e-8, vv > 1e-8 else { return }
        // How the bend changes as each point moves: the child and the parent's far end turn their bones about the
        // pivot, and the pivot takes the opposite of both.
        let gc = CGPoint(x: -vy / vv, y: vx / vv)
        let ga = CGPoint(x: -wy / ww, y: wx / ww)
        let gp = CGPoint(x: -ga.x - gc.x, y: -ga.y - gc.y)
        // Onto the joints themselves: the shoulders are a point on the trunk, so theirs is shared by its two ends.
        var g0 = CGPoint.zero, g1 = CGPoint.zero, gj = CGPoint.zero
        Ragdoll.spread(ga, at: hinge.parent, shoulder: shoulderAt, &g0, &g1, &gj)
        Ragdoll.spread(gp, at: hinge.pivot, shoulder: shoulderAt, &g0, &g1, &gj)
        let pivot = hinge.pivot > 1 ? hinge.pivot : -1
        let m0 = mobility(0), m1 = mobility(1), mj = pivot > 1 ? mobility(pivot) : 0, mc = mobility(hinge.child)
        let sum = m0 * (g0.x * g0.x + g0.y * g0.y) + m1 * (g1.x * g1.x + g1.y * g1.y) + mj * (gj.x * gj.x + gj.y * gj.y)
            + mc * (gc.x * gc.x + gc.y * gc.y)
        guard sum > 1e-9 else { return }
        let lambda = -max(-0.25, min(0.25, error)) * stiffness / sum
        points[0].x += lambda * m0 * g0.x
        points[0].y += lambda * m0 * g0.y
        points[1].x += lambda * m1 * g1.x
        points[1].y += lambda * m1 * g1.y
        if pivot > 1 {
            points[pivot].x += lambda * mj * gj.x
            points[pivot].y += lambda * mj * gj.y
        }
        points[hinge.child].x += lambda * mc * gc.x
        points[hinge.child].y += lambda * mc * gc.y
    }


    /// Adds a point's share `g` of a turn to the joint it is: the trunk's low or high end, the shoulders (shared by the
    /// two ends, `shoulder` of the way down from the high one), or a limb's joint.
    private static func spread(_ g: CGPoint, at j: Int, shoulder s: CGFloat, _ g0: inout CGPoint, _ g1: inout CGPoint,
                               _ gj: inout CGPoint) {
        switch j {
        case 0:
            g0.x += g.x
            g0.y += g.y
        case 1:
            g1.x += g.x
            g1.y += g.y
        case Ragdoll.shoulder:
            g0.x += g.x * s
            g0.y += g.y * s
            g1.x += g.x * (1 - s)
            g1.y += g.y * (1 - s)
        default:
            gj.x += g.x
            gj.y += g.y
        }
    }

    /// Brings a joint bent past where it bends back to whichever limit is nearer, the short way round.
    private mutating func limit(_ k: Int) {
        let hinge = Ragdoll.hinges[k]
        let now = angle(k)
        guard now < hinge.lo || now > hinge.hi else { return }
        let past = Ragdoll.wrap(now - hinge.lo), over = Ragdoll.wrap(now - hinge.hi)
        bend(k, by: abs(past) < abs(over) ? past : over, 1)
    }

    /// Turns what hangs from a joint about it, as it is, by `angle`: for setting a pose, not for moving one.
    private mutating func swing(_ k: Int, by angle: CGFloat) {
        let hinge = Ragdoll.hinges[k]
        let c = at(hinge.pivot)
        let cs = cos(angle), sn = sin(angle)
        func turn(_ j: Int) {
            let x = points[j].x - c.x, y = points[j].y - c.y
            points[j] = CGPoint(x: c.x + x * cs - y * sn, y: c.y + x * sn + y * cs)
        }
        turn(hinge.child)
        // Below a knee or an elbow, the foot or the hand.
        if [3, 5, 7, 9].contains(hinge.child) { turn(hinge.child + 1) }
    }

    // MARK: Drawing it

    /// The pose that draws the body as it now lies: the trunk's lean turned into a roll about the hips, and every
    /// limb and the head at its angle, the hips wherever they have got to, and the ground as far below them as it is
    /// (so its cloth and gear hang toward the ground and lie on it).
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
        let hip = self.hip
        p.hipAt = hip
        p.floor = hip.y
        func angle(_ from: CGPoint, _ to: CGPoint) -> CGFloat { atan2(to.x - from.x, -(to.y - from.y)) + r }
        if present[Ragdoll.frontKnee] {
            p.front = (angle(a, points[3]), angle(points[3], points[4]))
            p.back = (angle(a, points[5]), angle(points[5], points[6]))
        }
        if present[Ragdoll.frontElbow] {
            let s = at(Ragdoll.shoulder)
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
    /// (The pose keeps `pose()`'s floor: the doll's ground, wherever the canvas puts the hips.)
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

    /// Where the wound is, and the way blood leaves it (radians, from the +x axis): a cut's, or one made with
    /// `wounded(at:along:)`; nil for a whole body with neither.
    public var wound: (at: CGPoint, angle: CGFloat)? {
        if let gash {
            // On the bone, out of the front of it and a little back up it.
            let j = gash.joint
            let from: CGPoint, to: CGPoint
            switch j {
            case 0, 1: (from, to) = (points[0], points[1])
            case Ragdoll.head: (from, to) = (points[1], points[2])
            case 3, 5: (from, to) = (points[0], points[j])
            case 7, 9: (from, to) = (at(Ragdoll.shoulder), points[j])
            default: (from, to) = (points[j - 1], points[j])
            }
            let down = atan2(to.y - from.y, to.x - from.x)
            // A bone running up (the trunk, the neck) faces the other way from one hanging down.
            let front = j <= Ragdoll.head ? down - .pi / 2 : down + .pi / 2
            let point = CGPoint(x: from.x + (to.x - from.x) * gash.along, y: from.y + (to.y - from.y) * gash.along)
            return (point, j <= Ragdoll.head ? front + 0.4 : front - 0.4)
        }
        guard let severed else { return nil }
        let a = points[0], b = points[1]
        switch severed {
        case .above: return (a, atan2(a.y - b.y, a.x - b.x))
        case .below: return (b, atan2(b.y - a.y, b.x - a.x))
        case .headless:
            // From the face of the stump, which stands clear of the shoulders the way the neck was carried.
            let neck = atan2(b.x - a.x, b.y - a.y) + base.tilt
            let reach = Figure.neckCut * Build.of(cast).head
            return (CGPoint(x: b.x + sin(neck) * reach, y: b.y + cos(neck) * reach), atan2(cos(neck), sin(neck)))
        }
    }

    /// How far the joints have moved since `then` (the most any has).
    public func moved(since then: [CGPoint]) -> CGFloat {
        guard then.count == points.count else { return .infinity }
        var most: CGFloat = 0
        for j in 0..<Ragdoll.count where present[j] { most = max(most, Ragdoll.distance(points[j], then[j])) }
        return most
    }

    public func has(_ joint: Int) -> Bool { present[joint] }

    /// Each joint there is: the joint below it (the knee's foot, the shoulder's elbow), how far it is bent now and
    /// how far it may bend. For checking.
    var bends: [(child: Int, angle: CGFloat, lo: CGFloat, hi: CGFloat)] {
        Ragdoll.hinges.indices.filter(live).map { (Ragdoll.hinges[$0].child, angle($0), Ragdoll.hinges[$0].lo, Ragdoll.hinges[$0].hi) }
    }

    /// What each joint weighs. For checking.
    var masses: [CGFloat] { lightness.map { 1 / $0 } }

    /// How fast each joint is going, as of the last step (figure heights a second). For checking.
    var velocities: [CGPoint] {
        let h = CGFloat(Ragdoll.step)
        return (0..<Ragdoll.count).map { CGPoint(x: (points[$0].x - old[$0].x) / h, y: (points[$0].y - old[$0].y) / h) }
    }

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
    /// and over, or now and then crumpling where he stands, knees first, and going over one way or the other.
    public static func felled(_ cast: Cast, pose: Pose, back: CGFloat, force: CGFloat = 1, rng: inout SeededRNG) -> Ragdoll {
        func r(_ a: Double, _ b: Double) -> CGFloat { CGFloat(rng.range(a, b)) }
        var doll = Ragdoll(cast: cast, pose: pose)
        doll.vary(&rng)
        doll.tone = r(0.2, 0.4)
        doll.slackening = Double(r(0.25, 0.6))
        if rng.chance(0.35) {
            // The legs simply go: down onto the knees, then over, mostly onto his face.
            doll.give = (Double(r(0.02, 0.2)), Double(r(0.02, 0.2)), Double(r(0.3, 0.7)))
            let forward = rng.chance(0.65)
            doll.push(Ragdoll.low, CGPoint(x: back * r(forward ? 0 : -0.3, 0.4), y: -r(0.6, 1.4)))
            doll.push(Ragdoll.high, CGPoint(x: (forward ? -back * r(1.2, 2.2) : back * r(0.2, 1.1)) * force, y: -r(0.2, 0.6)))
            if forward { doll.push(Ragdoll.head, CGPoint(x: -back * r(0.3, 1.0), y: -r(0, 0.4))) }
            for knee in [Ragdoll.frontKnee, Ragdoll.backKnee] { doll.push(knee, CGPoint(x: r(0.2, 1.0), y: 0)) }
        } else {
            doll.push(Ragdoll.high, CGPoint(x: back * r(1.1, 2.3) * force, y: r(-0.1, 0.5)))
            doll.push(Ragdoll.low, CGPoint(x: back * r(0.2, 0.9) * force, y: r(0, 0.3)))
            doll.push(Ragdoll.head, CGPoint(x: back * r(0.5, 1.5), y: r(-0.3, 0.6)))
            for hand in [Ragdoll.frontHand, Ragdoll.backHand] { doll.push(hand, CGPoint(x: r(-1.5, 1.5), y: r(0, 2))) }
            if rng.chance(0.4) {
                // The knees going as he goes back: he sits down into the fall.
                doll.give.front = Double(r(0.02, 0.3))
                doll.give.back = Double(r(0.02, 0.3))
                for knee in [Ragdoll.frontKnee, Ragdoll.backKnee] { doll.push(knee, CGPoint(x: r(0.1, 0.8), y: 0)) }
            }
        }
        doll.stir(&rng, by: r(0.3, 1))
        return doll
    }

    /// A man whose legs are cut from under him at the shins: he drops onto his knees, his feet knocked `back` (±1,
    /// along his facing), and pitches over the other way onto his face, bleeding from the front shin.
    public static func hamstrung(_ cast: Cast, pose: Pose, back: CGFloat, force: CGFloat = 1, rng: inout SeededRNG) -> Ragdoll {
        func r(_ a: Double, _ b: Double) -> CGFloat { CGFloat(rng.range(a, b)) }
        var doll = Ragdoll(cast: cast, pose: pose)
        doll.vary(&rng)
        doll.tone = r(0.25, 0.4)
        doll.slackening = Double(r(0.3, 0.6))
        doll.give = (0.02, 0.02, Double(r(0.2, 0.5)))
        for (foot, knee) in [(Ragdoll.frontFoot, Ragdoll.frontKnee), (Ragdoll.backFoot, Ragdoll.backKnee)] {
            doll.push(foot, CGPoint(x: back * r(0.1, 0.7) * force, y: r(0, 0.3)))
            doll.push(knee, CGPoint(x: r(0.1, 0.5), y: -r(0.3, 0.9)))
        }
        doll.push(Ragdoll.low, CGPoint(x: -back * r(0, 0.3), y: -r(0.8, 1.5) * force))
        doll.push(Ragdoll.high, CGPoint(x: -back * r(0.8, 1.6) * force, y: -r(0, 0.4)))
        doll.push(Ragdoll.head, CGPoint(x: -back * r(0.2, 0.8), y: r(-0.2, 0.3)))
        for hand in [Ragdoll.frontHand, Ragdoll.backHand] { doll.push(hand, CGPoint(x: r(-1.2, 1.2), y: r(0, 1.5))) }
        doll.wounded(at: Ragdoll.frontFoot, along: r(0.2, 0.45))
        doll.stir(&rng, by: r(0.3, 0.8))
        return doll
    }

    /// What a cut leaves of a man in `pose`: the part above it flung `back` (±1, along his facing) and up, tumbling,
    /// arms flying; the part below still standing on its planted feet, the knees slowly giving, until it is let
    /// `collapse`.
    public static func cut(_ cast: Cast, pose: Pose, _ severed: Severed, back: CGFloat, force: CGFloat = 1, lift: CGFloat = 1,
                           rng: inout SeededRNG) -> Ragdoll {
        func r(_ a: Double, _ b: Double) -> CGFloat { CGFloat(rng.range(a, b)) }
        var doll = Ragdoll(cast: cast, pose: pose, severed: severed)
        doll.vary(&rng)
        if case .above = severed {
            doll.tone = r(0.15, 0.35)
            doll.slackening = Double(r(0.2, 0.5))
            doll.thrown(CGPoint(x: back * r(1.0, 2.0) * force, y: r(0.8, 1.3) * lift * force), spin: back * r(2, 7))
            for hand in [Ragdoll.frontHand, Ragdoll.backHand, Ragdoll.head] { doll.push(hand, CGPoint(x: r(-1.5, 1.5), y: r(-0.5, 1.5))) }
            doll.stir(&rng, by: r(0.3, 1))
        } else {
            doll.tone = 0.45
            doll.sink = r(0.05, 0.3)
            doll.droop = Double(r(0.15, 0.6))
            doll.planted(true)
        }
        return doll
    }

    /// Legs, or a body without its head, that have stood a moment: the knees go, and it folds or topples its own way,
    /// forward or back whichever way it leans. Mostly they buckle at once and it drops in a heap before it goes over;
    /// now and then it topples stiff, like a felled tree, the knees going only as it comes down; or one knee goes
    /// before the other and it twists down onto it.
    public mutating func collapse(rng: inout SeededRNG) {
        func r(_ a: Double, _ b: Double) -> CGFloat { CGFloat(rng.range(a, b)) }
        planted(false)
        tone = r(0.2, 0.45)
        slackening = Double(r(0.2, 0.5))
        let over: CGFloat = rng.chance(0.5) ? 1 : -1
        // Which end of it carries the weight to be thrown: the trunk, or (for legs cut from it) the hips.
        let reach = min(1, (span.high - span.low) / 0.5)
        let way = rng.unit()
        if way < Tuning.buckle {
            give = (Double(r(0.02, 0.2)), Double(r(0.02, 0.2)), Double(r(0.4, 0.8)))
            push(Ragdoll.low, CGPoint(x: over * r(0, 0.4), y: -r(0.3, 0.9)))
            push(Ragdoll.high, CGPoint(x: over * r(0.2, 1.1) * reach, y: -r(0, 0.3) * reach))
            for knee in [Ragdoll.frontKnee, Ragdoll.backKnee] where has(knee) { push(knee, CGPoint(x: r(0.2, 1.0), y: 0)) }
        } else if way < Tuning.buckle + (1 - Tuning.buckle) / 2 {
            give = (Double(r(1.0, 1.6)), Double(r(1.0, 1.6)), Double(r(0.8, 1.3)))
            push(Ragdoll.high, CGPoint(x: over * r(0.6, 1.4) * reach, y: 0))
            push(Ragdoll.low, CGPoint(x: over * r(0.3, 0.9) * (1 - reach), y: 0))
        } else {
            let first = rng.chance(0.5)
            let (quick, slow) = (Double(r(0.02, 0.12)), Double(r(0.8, 1.4)))
            give = (first ? quick : slow, first ? slow : quick, Double(r(0.5, 0.9)))
            push(first ? Ragdoll.frontKnee : Ragdoll.backKnee, CGPoint(x: r(0.4, 1.2), y: -r(0, 0.4)))
            push(Ragdoll.low, CGPoint(x: over * r(0.1, 0.5), y: -r(0.2, 0.6)))
            push(Ragdoll.high, CGPoint(x: over * r(0.3, 1.0) * reach, y: -r(0, 0.3) * reach))
        }
        // It goes over the way it is sent, whichever way it leans as it stands (a blow leaves most men leaning back):
        // one sent forward first sags forward over its knees, so the dead lie as often on their faces as on their
        // backs.
        let lean = atan2(points[1].x - points[0].x, points[1].y - points[0].y)
        let against = max(0, -over * sin(lean))
        if against > 0 { push(Ragdoll.high, CGPoint(x: over * against * Tuning.against * reach, y: 0)) }
        stir(&rng, by: r(0.3, 1))
    }
}
