import Foundation

/// Plays a fight. The perfect pilot cuts the moment something is in reach. A human-like one sees the lane, decides,
/// and its cut lands `reaction` seconds later, no more than `rate` times a second, going the wrong way now and then
/// (`slips`). The balance runs use the second to check that stages stay winnable by a person.
public struct Pilot: Codable, Equatable, Sendable {
    public var reaction: Double
    public var rate: Double
    public var slips: Double
    var rng: SeededRNG
    var ready = 0.0
    var queue: [Planned] = []

    struct Planned: Codable, Equatable, Sendable {
        var at: Double
        var side: Side
        var target: Fight.Target
    }

    public init(reaction: Double, rate: Double, slips: Double, seed: UInt64 = 0xB1ADE) {
        self.reaction = reaction
        self.rate = rate
        self.slips = slips
        rng = SeededRNG(seed: seed)
    }

    public static let perfect = Pilot(reaction: 0, rate: 60, slips: 0)

    public static func human(reaction: Double = 0.22, rate: Double = 7, slips: Double = 0.02, seed: UInt64 = 0xB1ADE) -> Pilot {
        Pilot(reaction: reaction, rate: rate, slips: slips, seed: seed)
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
        guard let plan = choose(fight) else { return }
        var side = plan.side
        if slips > 0, rng.chance(slips) { side = side.opposite }
        ready = fight.time + 1 / rate
        if reaction == 0 {
            fight.strike(side, into: &events)
        } else {
            queue.append(Planned(at: fight.time + reaction, side: side, target: plan.target))
        }
    }

    /// The most pressing thing that will be in reach when a cut decided now lands.
    func choose(_ fight: Fight) -> (side: Side, target: Fight.Target)? {
        let reach = fight.reach * (reaction > 0 ? 0.96 : 1)
        var best: (side: Side, target: Fight.Target, urgency: Double)?
        func consider(_ side: Side, _ target: Fight.Target, _ urgency: Double) {
            if urgency < best?.urgency ?? .infinity { best = (side, target, urgency) }
        }
        for foe in fight.foes where foe.targetable {
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
            guard !queue.contains(where: { $0.target == .arrow(arrow.id) }) else { continue }
            let speed = abs(arrow.velocity)
            let at = abs(arrow.x) - speed * reaction
            guard at <= reach, at > Tuning.body else { continue }
            consider(arrow.side, .arrow(arrow.id), (abs(arrow.x) - Tuning.body) / speed)
        }
        return best.map { ($0.side, $0.target) }
    }
}
