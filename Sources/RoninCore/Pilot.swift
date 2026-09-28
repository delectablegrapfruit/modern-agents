#if os(WASI)
import WASILibc
#else
import Foundation
#endif

/// Plays a fight. The perfect pilot cuts the moment something is in reach (a brute's club as it glares is met, and
/// turned aside, the same way), and catches a falling gourd the moment it can. A human-like one sees the lane, decides,
/// and its cut lands `reaction` seconds later, no more than `rate` times a second, going the wrong way now and then
/// (`slips`), and, if `rash`, losing patience with a warlord's set guard now and then and cutting into it. It times a
/// press to a moment it sees coming (the gourd coming down; the glare on a brute's club it cannot cut him down before;
/// the last moment of a wind-up it chose to wait for, `daring`, for a shard) no closer than its `timing` lets it. The
/// balance runs use the second to check that stages stay winnable by a person.
public struct Pilot: Codable, Equatable, Sendable {
    public var reaction: Double
    public var rate: Double
    public var slips: Double
    /// How often a second, while a warlord's set guard stands in reach, he cuts into it anyway.
    public var rash: Double
    /// How far a timed press lands from the moment it is aimed at: the spread of its error, in seconds.
    public var timing: Double
    /// How often, with a man it can fell before it and nothing else pressing, it lets him wind up and cuts him down in
    /// the last moment of it (sen-no-sen) rather than as soon as he is in reach.
    public var daring: Double
    var rng: SeededRNG
    var ready = 0.0
    var queue: [Planned] = []
    /// Men it is letting wind up, to cut down late; every man it has weighed that for, either way; the brutes whose
    /// blow now coming it has weighed (to cut him down before it, or to meet his club at the glare); the gourd it has
    /// timed a catch for (by its bearer); and when its last press was made.
    var waiting: [Int] = []
    var weighed: [Int] = []
    var clubs: [Int] = []
    var tossed: Int?
    var pressed = -1.0

    struct Planned: Codable, Equatable, Sendable {
        var at: Double
        var side: Side
        var target: Fight.Target
        /// Timed to a moment seen coming, not made on sight: its hands are kept free for it.
        var timed = false
    }

    public init(reaction: Double, rate: Double, slips: Double, rash: Double = 0, timing: Double = 0, daring: Double = 0,
                seed: UInt64 = 0xB1ADE) {
        self.reaction = reaction
        self.rate = rate
        self.slips = slips
        self.rash = rash
        self.timing = timing
        self.daring = daring
        rng = SeededRNG(seed: seed)
    }

    public static let perfect = Pilot(reaction: 0, rate: 60, slips: 0)

    public static func human(reaction: Double = 0.22, rate: Double = 7, slips: Double = 0.02, rash: Double = 0,
                             timing: Double = 0.05, daring: Double = 0.8, seed: UInt64 = 0xB1ADE) -> Pilot {
        Pilot(reaction: reaction, rate: rate, slips: slips, rash: rash, timing: timing, daring: daring, seed: seed)
    }

    mutating func act(on fight: inout Fight, events: inout [FightEvent]) {
        // Carried into a new fight, whose clock starts again at zero: forget the old one's plans.
        if ready > fight.time + 1 || pressed > fight.time + 1e-9 || (queue.first?.at ?? 0) > fight.time + reaction + 2 {
            ready = 0
            queue.removeAll()
            waiting.removeAll()
            weighed.removeAll()
            clubs.removeAll()
            tossed = nil
            pressed = -1
        }
        while let first = queue.first, first.at <= fight.time + 1e-9 {
            // A press timed to a moment goes before one made on sight when both are due.
            let next = queue.remove(at: queue.firstIndex { $0.timed && $0.at <= fight.time + 1e-9 } ?? 0)
            // Hands only go so fast: a press due sooner after the last than they allow waits for them.
            if fight.time - pressed < 1 / rate - 1e-6 {
                schedule(Planned(at: pressed + 1 / rate, side: next.side, target: next.target, timed: next.timed))
                continue
            }
            // Careful while a catch of the gourd is timed: a press made on sight whose man or arrow is no longer there
            // to cut is let go, not swung at nothing (a stumble now would cost the catch).
            if !next.timed, careful, fight.target(next.side) == nil { continue }
            pressed = fight.time
            fight.strike(next.side, into: &events)
        }
        guard fight.outcome == nil else { return }
        if reaction > 0 { time(fight) }
        guard fight.time >= ready, !fight.isStumbling else { return }
        if reaction == 0, fight.cooldown > 0 { return }
        // Only a set guard in reach tempts him, so the dice are only thrown then.
        let reckless = rash > 0 && fight.foes.contains { $0.guardSet && $0.gap <= fight.reach }
            && rng.chance(rash * Tuning.step)
        guard let plan = choose(fight, reckless: reckless) else { return }
        // Its hands kept free for a press it has timed: nothing new that would land just before it and hold it up,
        // unless what it is for cannot wait until after.
        if reaction > 0, let timed = queue.first(where: \.timed) {
            let lands = fight.time + reaction
            if lands > timed.at - 1 / rate, lands <= timed.at, plan.urgency > timed.at + 1 / rate - fight.time { return }
        }
        var side = plan.side
        if slips > 0, rng.chance(slips) { side = side.opposite }
        ready = fight.time + 1 / rate
        if reaction == 0 {
            fight.strike(side, into: &events)
        } else {
            schedule(Planned(at: fight.time + reaction, side: side, target: plan.target))
        }
    }

    /// With a catch of the gourd timed, it is careful: it cuts only what is already in reach, never a man it expects
    /// to walk into it, and never at nothing.
    private var careful: Bool { reaction > 0 && queue.contains { $0.timed && $0.target == .gourd } }

    /// Queues a press, in the order they come.
    private mutating func schedule(_ press: Planned) {
        queue.insert(press, at: queue.firstIndex { $0.at > press.at } ?? queue.endIndex)
    }

    /// Presses timed to a moment seen coming rather than made on sight: the gourd caught in the middle of the moments it
    /// can be, a brute's club met in the middle of its glare, and a man it chose to let wind up cut down in the last
    /// moment of it. Each lands off the moment it is aimed at by as much as `timing` puts it, and goes the wrong way as
    /// often as any cut.
    private mutating func time(_ fight: Fight) {
        func aimed(_ at: Double, _ side: Side, _ target: Fight.Target) {
            let error = timing > 0 ? timing * rng.normal() : 0
            let wrong = slips > 0 && rng.chance(slips)
            schedule(Planned(at: max(fight.time + reaction, at + error), side: wrong ? side.opposite : side, target: target, timed: true))
        }
        if let gourd = fight.gourd, tossed != gourd.from {
            tossed = gourd.from
            aimed(fight.time + gourd.timer - Tuning.catchWindow / 2, gourd.side, .gourd)
        }
        // A brute raising his club, with no knock-back to break it: if the cuts it can land before his blow cannot fell
        // him, it leaves him be and meets the club in the middle of its glare instead (and cuts him down while he
        // reels); if they can, it cuts on sight. Weighed once a wind-up.
        clubs.removeAll { id in fight.foe(id)?.phase != .windup }
        if fight.crowding.noBruteKnockback {
            for foe in fight.foes where foe.kind == .brute && foe.phase == .windup && !clubs.contains(foe.id) {
                clubs.append(foe.id)
                let cuts = foe.timer > reaction ? Int(((foe.timer - reaction) * rate).rounded(.down)) + 1 : 0
                guard foe.hp > 1, cuts < foe.hp, foe.gap <= fight.reach else { continue }
                aimed(fight.time + foe.timer - Tuning.parryWindow / 2, Side.of(foe.x), .foe(foe.id))
            }
        }
        // Sen-no-sen: once a man it is waiting on raises his weapon, the cut is timed to the last moment of his wind-up,
        // a little inside it; if the lane stops being quiet first, or he is too quick to time, he is cut on sight.
        let late = Tuning.senNoSen * 0.6
        for id in waiting {
            guard let foe = fight.foe(id), foe.targetable, quiet(fight, but: id) else {
                waiting.removeAll { $0 == id }
                continue
            }
            guard foe.phase == .windup else { continue }
            waiting.removeAll { $0 == id }
            let at = fight.time + foe.timer - late
            if at >= fight.time + reaction { aimed(at, Side.of(foe.x), .foe(id)) }
        }
        // Whom to wait on: a man about to come into reach who falls to one cut, whose blow costs one heart and is slow
        // enough to time a cut to its end, with nothing else pressing and a heart to spare. Each is weighed once.
        guard daring > 0, fight.hp > 1, fight.hp < fight.maxHP else { return }
        for foe in fight.foes where foe.targetable && !weighed.contains(foe.id) {
            guard foe.phase == .advancing, !foe.bearer, foe.kind != .archer, foe.kind != .warlord, foe.hp == 1,
                  foe.kind.damage == 1, foe.gap <= fight.reach + foe.speed * reaction + 0.02,
                  foe.windup >= reaction + late + 2 * timing else { continue }
            weighed.append(foe.id)
            if quiet(fight, but: foe.id), rng.chance(daring) { waiting.append(foe.id) }
        }
    }

    /// Nothing but `id` will want cutting soon: no other man near reach, no arrow coming, no gourd in the air.
    private func quiet(_ fight: Fight, but id: Int) -> Bool {
        guard fight.gourd == nil, !fight.isStumbling, !fight.arrows.contains(where: { !$0.deflected }) else { return false }
        return !fight.foes.contains { $0.id != id && $0.alive && $0.gap < fight.reach + 0.15 }
    }

    /// The most pressing thing that will be in reach when a cut decided now lands, and how soon it presses (seconds
    /// before a blow would land). `reckless`: a guard in reach is cut into first. `careful`: only a man already in
    /// reach.
    func choose(_ fight: Fight, reckless: Bool = false) -> (side: Side, target: Fight.Target, urgency: Double)? {
        let reach = fight.reach * (reaction > 0 ? 0.96 : 1)
        var best: (side: Side, target: Fight.Target, urgency: Double)?
        func consider(_ side: Side, _ target: Fight.Target, _ urgency: Double) {
            if urgency < best?.urgency ?? .infinity { best = (side, target, urgency) }
        }
        // A side whose nearest foe stands on guard is closed: a cut there would be turned aside, or glance off one
        // still coming up.
        var guarded: [Side: Double] = [:]
        for side in Side.allCases {
            let nearest = fight.foes.filter { $0.targetable && Side.of($0.x) == side }.min { $0.gap < $1.gap }
            if let nearest, nearest.phase == .guarding {
                if reckless, nearest.guardSet, nearest.gap <= reach {
                    consider(side, .foe(nearest.id), -1)
                } else {
                    guarded[side] = nearest.gap
                }
            }
        }
        for foe in fight.foes where foe.targetable {
            if guarded[Side.of(foe.x)] != nil { continue }
            // One cut at a time on a foe: one that survives it is knocked back or leaps, so the next is a new read. A
            // man it is letting wind up is left to it.
            guard !queue.contains(where: { $0.target == .foe(foe.id) }), !waiting.contains(foe.id) else { continue }
            let contactGap = foe.contact - foe.kind.width / 2
            // The gourd-bearer, seen darting, is on his mark by the time the cut lands; waiting at his spot he is not
            // coming on, whatever his feet say.
            let speed = foe.darting ? foe.speed * Tuning.dartPace : foe.speed
            let moving = foe.bearer ? foe.darting : foe.phase == .advancing && foe.kind != .archer && !careful
            let gap = moving ? max(contactGap, foe.gap - speed * reaction) : foe.gap
            guard gap <= reach, foe.gap <= reach + speed * reaction + 0.01 else { continue }
            let urgency: Double
            switch foe.phase {
            case .windup: urgency = foe.timer
            default: urgency = max(0, foe.gap - contactGap) / max(0.05, foe.speed) + foe.windup
            }
            consider(Side.of(foe.x), .foe(foe.id), urgency)
        }
        for arrow in fight.arrows where !arrow.deflected {
            if let guardGap = guarded[arrow.side], abs(arrow.x) >= guardGap { continue }
            guard !queue.contains(where: { $0.target == .arrow(arrow.id) }) else { continue }
            let speed = abs(arrow.velocity)
            let at = abs(arrow.x) - speed * reaction
            guard at <= reach, at > Tuning.body else { continue }
            consider(arrow.side, .arrow(arrow.id), (abs(arrow.x) - Tuning.body) / speed)
        }
        // The perfect pilot catches the gourd the moment it can. A human-like one has timed its catch already; if that
        // press went elsewhere (it came too soon, at a man on that side) it presses again on sight, if the gourd will
        // still be low enough when this one lands.
        if let gourd = fight.gourd, !queue.contains(where: { $0.target == .gourd }) {
            if reaction == 0 {
                if fight.target(gourd.side) == .gourd { consider(gourd.side, .gourd, gourd.timer) }
            } else if tossed == gourd.from, gourd.timer > reaction, gourd.timer - reaction <= Tuning.catchWindow {
                consider(gourd.side, .gourd, gourd.timer)
            }
        }
        return best
    }
}

extension Pilot {
    /// Reads a saved pilot, taking one saved before it could be rash, time a press, wait on a man or weigh a brute's
    /// blow as one that does none of them.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        reaction = try c.decode(Double.self, forKey: .reaction)
        rate = try c.decode(Double.self, forKey: .rate)
        slips = try c.decode(Double.self, forKey: .slips)
        rash = try c.decodeIfPresent(Double.self, forKey: .rash) ?? 0
        timing = try c.decodeIfPresent(Double.self, forKey: .timing) ?? 0
        daring = try c.decodeIfPresent(Double.self, forKey: .daring) ?? 0
        rng = try c.decode(SeededRNG.self, forKey: .rng)
        ready = try c.decode(Double.self, forKey: .ready)
        queue = try c.decode([Planned].self, forKey: .queue)
        waiting = try c.decodeIfPresent([Int].self, forKey: .waiting) ?? []
        weighed = try c.decodeIfPresent([Int].self, forKey: .weighed) ?? []
        clubs = try c.decodeIfPresent([Int].self, forKey: .clubs) ?? []
        tossed = try c.decodeIfPresent(Int.self, forKey: .tossed)
        pressed = try c.decodeIfPresent(Double.self, forKey: .pressed) ?? -1
    }
}

extension Pilot.Planned {
    /// Reads a saved press, taking one saved before presses were timed as made on sight.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        at = try c.decode(Double.self, forKey: .at)
        side = try c.decode(Side.self, forKey: .side)
        target = try c.decode(Fight.Target.self, forKey: .target)
        timed = try c.decodeIfPresent(Bool.self, forKey: .timed) ?? false
    }
}
