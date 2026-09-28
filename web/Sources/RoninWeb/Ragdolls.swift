#if os(WASI)
import WASILibc
#else
import Foundation
#endif
import RoninArt
import RoninCore

// The dead, for the page's carnage: RoninArt's Ragdoll, made as the app's Carnage makes them (Sources/Ronin/Carnage.swift),
// stepped here and drawn as sketches. Points are in the figure's own heights from the spot it stood on (x toward the way
// it faced, y up); the page faces, scales and places them.

struct SeveredInput: Decodable {
    /// "above", "below" or "headless".
    var part: String
    var at: Double?
    var slant: Double?

    func value() throws -> Severed {
        switch part {
        case "above": return .above(at: CGFloat(at ?? 0.5), slant: CGFloat(slant ?? 0))
        case "below": return .below(at: CGFloat(at ?? 0.5), slant: CGFloat(slant ?? 0))
        case "headless": return .headless
        default: throw BridgeError("severed.part is above, below or headless, not '\(part)'")
        }
    }
}

struct RagdollOptions: Decodable {
    var action: String
    var id: Int?
    var ids: [Int]?
    var cast: String?
    /// The pose: a frame, or `Figure.struck(cast, variant:)` (the default: variant 0, the stagger a killing blow
    /// freezes a foe in).
    var frame: String?
    var variant: Int?
    var severance: String?
    var severed: SeveredInput?
    /// "felled", "hamstrung", "cut" or "plain".
    var style: String?
    var back: Double?
    var force: Double?
    var lift: Double?
    var seed: String?
    var dt: Double?
    var dy: Double?
    var joint: Int?
    var along: Double?
    var x: Double?
    var y: Double?
    var spin: Double?
    var amount: Double?
    var fling: Bool?
    /// What to reach for: "wild" (any pose a blow throws a man into), "thrown", "struck" (with `reachVariant`), or a
    /// frame key.
    var target: String?
    var targetVariant: Int?
    var on: Bool?
    var points: Bool?
}

struct Doll {
    var doll: Ragdoll
    /// The joints as they were when last drawn, for `moved`.
    var drawn: [CGPoint]
    /// Standing, the pose it reaches for as its knees go (`collapse`).
    var reach: Pose?
}

private var dolls: [Int: Doll] = [:]
private var nextDoll = 1
private var dollRNG = SeededRNG(seed: WebSession.randomSeed())

private func add(_ doll: Ragdoll, reach: Pose? = nil) -> Int {
    let id = nextDoll
    nextDoll += 1
    dolls[id] = Doll(doll: doll, drawn: doll.points, reach: reach)
    return id
}

/// The pose a blow throws a man into, with his cloth at rest (`Figures.frozen`): what the struck figure shows.
func frozen(_ cast: Cast, variant: Int) -> Pose {
    var pose = Figure.struck(cast, variant: variant)
    pose.stream = 0
    return pose
}

/// Any of a million poses a blow may throw a man into (`Carnage.wild`).
private func wild(_ cast: Cast) -> Pose { Figure.struck(cast, variant: dollRNG.int(1...1_000_000)) }

private func pose(_ o: RagdollOptions, _ cast: Cast) throws -> Pose {
    if let frame = o.frame { return Figure.pose(cast, try requireFrame(frame)) }
    return Figure.struck(cast, variant: o.variant ?? 0)
}

private func target(_ o: RagdollOptions, _ cast: Cast) throws -> Pose {
    switch o.target ?? "wild" {
    case "wild": return wild(cast)
    case "thrown": return Figure.thrown(cast)
    case "struck": return Figure.struck(cast, variant: o.targetVariant ?? 0)
    case let key: return Figure.pose(cast, try requireFrame(key))
    }
}

private func doll(_ id: Int?) throws -> Doll {
    guard let id, let d = dolls[id] else { throw BridgeError("no ragdoll \(id.map(String.init) ?? "(no id)")") }
    return d
}

private func update(_ id: Int?, _ change: (inout Doll) -> Void) throws {
    var d = try doll(id)
    change(&d)
    dolls[id!] = d
}

extension JSONWriter {
    /// Where the weapon leaves his hand (`Carnage.drop`): the hand, in figure heights, and the turn from lying level.
    mutating func weaponDrop(_ cast: Cast, pose: Pose) {
        let hand = Ragdoll(cast: cast, pose: pose).points[Ragdoll.frontHand]
        let bow: Bool
        if case .bow = Build.of(cast).weapon { bow = true } else { bow = false }
        beginObject()
        key("hand"); point(hand)
        field("turn", Double(pose.blade - (bow ? .pi : .pi / 2)))
        field("bow", bow)
        endObject()
    }

    /// A doll's state after a step: enough to know whether to draw it again, where it bleeds, and when it is done.
    mutating func dollState(_ id: Int, _ d: Doll, points withPoints: Bool) {
        let doll = d.doll
        beginObject()
        field("id", id)
        field("time", doll.time)
        field("settled", doll.settled)
        field("resting", doll.resting)
        key("hip"); point(doll.hip)
        field("moved", Double(doll.moved(since: d.drawn)))
        // Where it bleeds (`Carnage.bleeding`): its wound, or run through, the front of its chest, out and up.
        let bleed: (at: CGPoint, angle: CGFloat)
        if let wound = doll.wound {
            bleed = wound
        } else {
            let a = doll.points[Ragdoll.low], b = doll.points[Ragdoll.high]
            let up = atan2(b.y - a.y, b.x - a.x)
            bleed = (CGPoint(x: a.x + (b.x - a.x) * 0.68, y: a.y + (b.y - a.y) * 0.68), up - 0.7)
        }
        key("bleeding"); beginObject(); key("at"); point(bleed.at); field("angle", Double(bleed.angle)); endObject()
        field("wounded", doll.wound != nil)
        field("standing", d.reach != nil)
        if withPoints {
            key("points")
            beginArray()
            for (j, p) in doll.points.enumerated() {
                if doll.has(j) { point(p) } else { null() }
            }
            endArray()
        }
        endObject()
    }
}

func ragdollOp(_ r: Request, _ w: inout JSONWriter) throws {
    guard let o = r.options else { throw BridgeError("ragdoll needs options") }
    switch o.action {
    case "seed":
        dollRNG = SeededRNG(seed: try parseSeed(o.seed) ?? WebSession.randomSeed())
        w.value(true)
    case "joints":
        w.beginObject()
        for (name, j) in [("low", Ragdoll.low), ("high", Ragdoll.high), ("head", Ragdoll.head), ("frontKnee", Ragdoll.frontKnee),
                          ("frontFoot", Ragdoll.frontFoot), ("backKnee", Ragdoll.backKnee), ("backFoot", Ragdoll.backFoot),
                          ("frontElbow", Ragdoll.frontElbow), ("frontHand", Ragdoll.frontHand), ("backElbow", Ragdoll.backElbow),
                          ("backHand", Ragdoll.backHand)] {
            w.key(name)
            w.value(j)
        }
        w.endObject()
    case "sever":
        // `Carnage.sever`: the pieces a killing cut leaves. `back` is the way the upper part is thrown along his own
        // facing (the app: away from the ronin × his facing).
        let cast = try requireCast(o.cast)
        let variant = o.variant ?? 0
        let back = CGFloat(o.back ?? -1), force = CGFloat(o.force ?? 1)
        let pose = Figure.struck(cast, variant: variant)
        let stand = dollRNG.range(0.35, 0.7)
        w.beginObject()
        w.field("severance", o.severance ?? "level")
        w.field("variant", variant)
        switch o.severance ?? "level" {
        case "head":
            let body = add(Ragdoll.cut(cast, pose: pose, .headless, back: back, force: force, rng: &dollRNG), reach: wild(cast))
            w.field("body", body)
            w.field("standFor", stand * 1.4)
            w.field("head", variant)
        case "legs":
            var doll = Ragdoll.hamstrung(cast, pose: pose, back: back, force: force, rng: &dollRNG)
            doll.reach(for: wild(cast), rng: &dollRNG)
            w.field("body", add(doll))
        case "falling", "rising", "level":
            let (at, slant): (CGFloat, CGFloat)
            switch o.severance ?? "level" {
            case "falling": (at, slant) = (0.5, 0.6)
            case "rising": (at, slant) = (0.5, -0.6)
            default: (at, slant) = (0.3, 0.05)
            }
            var cut = Ragdoll.cut(cast, pose: pose, .above(at: at, slant: slant), back: back, force: force, lift: 1.3, rng: &dollRNG)
            cut.reach(for: wild(cast), rng: &dollRNG)
            w.field("upper", add(cut))
            let lower = Ragdoll.cut(cast, pose: pose, .below(at: at, slant: slant), back: back, force: force, rng: &dollRNG)
            w.field("lower", add(lower, reach: wild(cast)))
            w.field("standFor", stand)
        case let other:
            throw BridgeError("severance is falling, rising, level, legs or head, not '\(other)'")
        }
        w.key("weapon"); w.weaponDrop(cast, pose: pose)
        w.endObject()
    case "fell":
        // `Carnage.fell`: run through or shot, down whole, thrown back off his feet or folding where he stands.
        let cast = try requireCast(o.cast)
        let from = try pose(o, cast)
        var doll = Ragdoll.felled(cast, pose: from, back: CGFloat(o.back ?? -1), force: CGFloat(o.force ?? 1), rng: &dollRNG)
        doll.reach(for: dollRNG.int(0...2) == 0 ? Figure.thrown(cast) : wild(cast), fling: true, rng: &dollRNG)
        w.beginObject()
        w.field("body", add(doll))
        w.key("weapon"); w.weaponDrop(cast, pose: from)
        w.endObject()
    case "create":
        let cast = try requireCast(o.cast)
        let from = try pose(o, cast)
        let back = CGFloat(o.back ?? -1), force = CGFloat(o.force ?? 1)
        let doll: Ragdoll
        switch o.style ?? "plain" {
        case "felled": doll = Ragdoll.felled(cast, pose: from, back: back, force: force, rng: &dollRNG)
        case "hamstrung": doll = Ragdoll.hamstrung(cast, pose: from, back: back, force: force, rng: &dollRNG)
        case "cut":
            guard let severed = o.severed else { throw BridgeError("a cut ragdoll needs severed") }
            doll = Ragdoll.cut(cast, pose: from, try severed.value(), back: back, force: force, lift: CGFloat(o.lift ?? 1), rng: &dollRNG)
        case "plain": doll = Ragdoll(cast: cast, pose: from, severed: try o.severed?.value())
        case let other: throw BridgeError("style is felled, hamstrung, cut or plain, not '\(other)'")
        }
        w.value(add(doll))
    case "collapse":
        try update(o.id) { d in
            d.doll.collapse(rng: &dollRNG)
            if let reach = d.reach {
                d.doll.reach(for: reach, rng: &dollRNG)
                d.reach = nil
            }
        }
        w.value(true)
    case "reach":
        let d = try doll(o.id)
        let to = try target(o, d.doll.cast)
        try update(o.id) { $0.doll.reach(for: to, fling: o.fling ?? false, rng: &dollRNG) }
        w.value(true)
    case "raise":
        try update(o.id) { $0.doll.raise(CGFloat(o.dy ?? 0)) }
        w.value(true)
    case "push":
        guard let joint = o.joint, (0..<11).contains(joint) else { throw BridgeError("push needs a joint 0–10") }
        try update(o.id) { $0.doll.push(joint, CGPoint(x: o.x ?? 0, y: o.y ?? 0)) }
        w.value(true)
    case "thrown":
        try update(o.id) { $0.doll.thrown(CGPoint(x: o.x ?? 0, y: o.y ?? 0), spin: CGFloat(o.spin ?? 0)) }
        w.value(true)
    case "planted":
        try update(o.id) { $0.doll.planted(o.on ?? true) }
        w.value(true)
    case "wounded":
        try update(o.id) { $0.doll.wounded(at: o.joint ?? Ragdoll.high, along: CGFloat(o.along ?? 0.5)) }
        w.value(true)
    case "stir":
        try update(o.id) { $0.doll.stir(&dollRNG, by: CGFloat(o.amount ?? 1)) }
        w.value(true)
    case "tone":
        try update(o.id) { d in
            if let amount = o.amount { d.doll.tone = CGFloat(amount) }
            if let dt = o.dt { d.doll.slackening = dt }
        }
        w.value(true)
    case "step":
        stepDolls(o.dt ?? 0, ids: o.ids ?? o.id.map { [$0] }, points: o.points ?? false, &w)
    case "info":
        let d = try doll(o.id)
        w.dollState(o.id!, d, points: true)
    case "remove":
        let ids = o.ids ?? o.id.map { [$0] } ?? []
        for id in ids { dolls[id] = nil }
        w.value(true)
    case "clear":
        dolls.removeAll()
        w.value(true)
    case "count":
        w.value(dolls.count)
    case "head":
        // `Figures.head`: the head struck off a foe frozen in a struck pose, and its wound (canvas pixels, y up) and
        // the way blood leaves it.
        let cast = try requireCast(o.cast)
        let head = Figure.severedHead(cast, pose: frozen(cast, variant: o.variant ?? 0))
        w.beginObject()
        w.key("wound"); w.point(head.wound)
        w.field("angle", Double(head.angle))
        w.endObject()
    default:
        throw BridgeError("unknown ragdoll action '\(o.action)'")
    }
}

/// Steps the dolls named (all of them, oldest first, when none are) `dt` seconds; writes each one's state.
func stepDolls(_ dt: Double, ids: [Int]?, points: Bool, _ w: inout JSONWriter) {
    w.beginArray()
    for id in ids ?? dolls.keys.sorted() {
        guard var d = dolls[id] else { continue }
        d.doll.advance(dt)
        dolls[id] = d
        w.dollState(id, d, points: points)
    }
    w.endArray()
}

/// Sketches of what the dead are made of, as floats (the layout of `ronin_sketch`). A doll's sketch is followed by
/// two floats: where the sketch's anchor (its feet on the canvas) goes, in the doll's terms (`Ragdoll.framed`).
struct PieceRequest: Decodable {
    /// "doll" (with `id`), "struck" (`cast`, `variant`, `armed`: the figure frozen at a killing blow), "head" (`cast`,
    /// `variant`) or "weapon" (`cast`).
    var kind: String
    var id: Int?
    var cast: String?
    var variant: Int?
    var armed: Bool?
}

func pieceSketch(_ r: PieceRequest) throws -> [UInt8] {
    var encoder = SketchEncoder()
    switch r.kind {
    case "doll":
        guard let id = r.id, var d = dolls[id] else { throw BridgeError("no ragdoll \(r.id.map(String.init) ?? "")") }
        let framed = d.doll.framed()
        let cast = d.doll.cast
        encoder.encode(Figure.sketch(cast, pose: framed.pose), cast: cast, smeared: false)
        encoder.out.append(Float(framed.anchor.x))
        encoder.out.append(Float(framed.anchor.y))
        d.drawn = d.doll.points
        dolls[id] = d
    case "struck":
        let cast = try requireCast(r.cast)
        var pose = frozen(cast, variant: r.variant ?? 0)
        pose.armed = r.armed ?? true
        encoder.encode(Figure.sketch(cast, pose: pose), cast: cast, smeared: false)
    case "head":
        let cast = try requireCast(r.cast)
        encoder.encode(Figure.severedHead(cast, pose: frozen(cast, variant: r.variant ?? 0)).sketch, cast: cast, smeared: false)
    case "weapon":
        let cast = try requireCast(r.cast)
        encoder.encode(Figure.weapon(cast), cast: cast, smeared: false)
    default:
        throw BridgeError("piece kind is doll, struck, head or weapon, not '\(r.kind)'")
    }
    return encoder.bytes
}
