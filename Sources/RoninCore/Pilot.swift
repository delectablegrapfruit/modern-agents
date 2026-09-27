import Foundation

/// Plays a fight. The perfect pilot cuts the moment something is in reach. A human-like one sees the lane, decides,
/// and its cut lands `reaction` seconds later, no more than `rate` times a second, going the wrong way now and then
/// (`slips`), and, if `rash`, losing patience with a warlord's set guard now and then and cutting into it. The balance
/// runs use the second to check that stages stay winnable by a person.
public struct Pilot: Codable, Equatable, Sendable {
    public var reaction: Double
    public var rate: Double
    public var slips: Double
    /// How often a second, while a warlord's set guard stands in reach, he cuts into it anyway.
    public var rash: Double
    var rng: SeededRNG
    var ready = 0.0
    var queue: [Planned] = []

    struct Planned: Codable, Equatable, Sendable {
        var at: Double
        var side: Side
        var target: Fight.Target
    }

    public init(reaction: Double, rate: Double, slips: Double, rash: Double = 0, seed: UInt64 = 0xB1ADE) {
        self.reaction = reaction
        self.rate = rate
        self.slips = slips
        self.rash = rash
        rng = SeededRNG(seed: seed)
    }

    public static let perfect = Pilot(reaction: 0, rate: 60, slips: 0)

    public static func human(reaction: Double = 0.22, rate: Double = 7, slips: Double = 0.02, rash: Double = 0,
                             seed: UInt64 = 0xB1ADE) -> Pilot {
        Pilot(reaction: reaction, rate: rate, slips: slips, rash: rash, seed: seed)
    }

    mutating func act(on fight: inout Fight, events: inout [FightEvent]) {
        // Carried into a new fight, whose clock starts again at zero: forget the old one's plans.
        if ready > fight.time + 1 || (queue.first?.at ?? 0) > fight.time + reaction + 1 {
            ready = 0
            queue.removeAll()
        }
        while let next = queue.first, next.at <= fight.time + 1e-9 {
            queue.removeFirst()
            fight.strike(next.side, into: &events)
        }
        guard fight.outcome == nil, fight.time >= ready, !fight.isStumbling else { return }
        if reaction == 0, fight.cooldown > 0 { return }
        // Only a set guard in reach tempts him, so the dice are only thrown then.
        let reckless = rash > 0 && fight.foes.contains { $0.guardSet && $0.gap <= fight.reach }
            && rng.chance(rash * Tuning.step)
        guard let plan = choose(fight, reckless: reckless) else { return }
        var side = plan.side
        if slips > 0, rng.chance(slips) { side = side.opposite }
        ready = fight.time + 1 / rate
        if reaction == 0 {
            fight.strike(side, into: &events)
        } else {
            queue.append(Planned(at: fight.time + reaction, side: side, target: plan.target))
        }
    }

    /// The most pressing thing that will be in reach when a cut decided now lands. `reckless`: a guard in reach is
    /// cut into first.
    func choose(_ fight: Fight, reckless: Bool = false) -> (side: Side, target: Fight.Target)? {
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
            // One cut at a time on a foe: one that survives it is knocked back or leaps, so the next is a new read.
            guard !queue.contains(where: { $0.target == .foe(foe.id) }) else { continue }
            let contactGap = foe.contact - foe.kind.width / 2
            let moving = foe.phase == .advancing && foe.kind != .archer
            let gap = moving ? max(contactGap, foe.gap - foe.speed * reaction) : foe.gap
            guard gap <= reach, foe.gap <= reach + foe.speed * reaction + 0.01 else { continue }
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
        return best.map { ($0.side, $0.target) }
    }
}

extension Pilot {
    /// Reads a saved pilot, taking one saved before it could be rash as a patient one.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        reaction = try c.decode(Double.self, forKey: .reaction)
        rate = try c.decode(Double.self, forKey: .rate)
        slips = try c.decode(Double.self, forKey: .slips)
        rash = try c.decodeIfPresent(Double.self, forKey: .rash) ?? 0
        rng = try c.decode(SeededRNG.self, forKey: .rng)
        ready = try c.decode(Double.self, forKey: .ready)
        queue = try c.decode([Planned].self, forKey: .queue)
    }
}
