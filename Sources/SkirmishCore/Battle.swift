import Foundation

/// One battle: the map, the fleets in flight, the enemy commanders. Everything in it is a value, including the
/// random numbers, so it can be saved at any moment and resumed exactly.
public struct Battle: Codable, Equatable, Sendable {
    /// Battlefield widths per second.
    public static let speed = 0.1
    /// The simulation's fixed step, in seconds.
    static let tick = 0.05

    public let sector: Int
    public let seed: UInt64
    public let difficulty: Difficulty
    public internal(set) var outposts: [Outpost]
    public internal(set) var fleets: [Fleet] = []
    public private(set) var time: Double = 0
    public private(set) var outcome: Outcome?
    public private(set) var stats = BattleStats()
    /// Factions still in the fight, you included.
    public private(set) var alive: [Int]
    /// When true, your side is played by the same commander as the enemy's (for the simulator and the self-test).
    public var autopilot = false

    private var nextFleet = 0
    private var clocks: [Double]
    private var rng: SeededRNG
    private var carry: Double = 0

    public init(sector: Int, seed: UInt64) {
        let sector = max(1, sector)
        let difficulty = Difficulty.forSector(sector)
        var rng = SeededRNG(seed: mixSeed(seed, 0xB477_1E))
        // The enemy takes a few seconds to wake up: time to read the map.
        var clocks = [Double](repeating: 0, count: 5)
        for faction in 2...4 { clocks[faction] = difficulty.think * rng.range(1.0, 1.6) + 1.5 }
        clocks[Side.player] = 1
        self.sector = sector
        self.seed = seed
        self.difficulty = difficulty
        self.outposts = MapGenerator.make(sector: sector, seed: seed, difficulty: difficulty)
        self.alive = Array(Side.player...(Side.player + difficulty.enemies))
        self.clocks = clocks
        self.rng = rng
    }

    public var enemies: [Int] { Array(2...(1 + difficulty.enemies)) }

    // MARK: Orders

    /// Sends a share of the troops at each of `sources` (those you hold) to `target`. Returns the fleets launched.
    @discardableResult
    public mutating func send(from sources: [Int], to target: Int, fraction: Double, owner: Int = Side.player) -> [Fleet] {
        guard outcome == nil, outposts.indices.contains(target) else { return [] }
        var launched: [Fleet] = []
        for source in Set(sources).sorted() where source != target && outposts.indices.contains(source) {
            guard outposts[source].owner == owner else { continue }
            let count = Int(outposts[source].troops * min(1, max(0, fraction)))
            if let fleet = launch(from: source, to: target, count: count) { launched.append(fleet) }
        }
        return launched
    }

    private mutating func launch(from source: Int, to target: Int, count: Int) -> Fleet? {
        guard count >= 1, Double(count) <= outposts[source].troops + 1e-9 else { return nil }
        let a = outposts[source].position, b = outposts[target].position
        let length = a.distance(to: b)
        // A sideways bow of up to a tenth of the length, either way.
        let bend = rng.range(-0.1, 0.1) * length
        let mid = (a + b) * 0.5
        let normal = length > 0 ? Vec2(-(b.y - a.y) / length, (b.x - a.x) / length) : Vec2(0, 0)
        let control = mid + normal * bend
        var path = 0.0, last = a
        for k in 1...8 {
            let t = Double(k) / 8, u = 1 - t
            let p = a * (u * u) + control * (2 * u * t) + b * (t * t)
            path += last.distance(to: p)
            last = p
        }
        let fleet = Fleet(id: nextFleet, owner: outposts[source].owner, count: count, from: source, to: target,
                          origin: a, control: control, target: b, elapsed: 0, duration: max(0.3, path / Battle.speed))
        nextFleet += 1
        outposts[source].troops -= Double(count)
        fleets.append(fleet)
        if fleet.owner == Side.player { stats.launched += count }
        return fleet
    }

    // MARK: Time

    /// Advances the battle by `dt` seconds in fixed steps and says what happened.
    public mutating func step(_ dt: Double) -> [BattleEvent] {
        guard outcome == nil, dt > 0 else { return [] }
        var events: [BattleEvent] = []
        carry += dt
        while carry >= Battle.tick - 1e-9, outcome == nil {
            carry -= Battle.tick
            tick(Battle.tick, &events)
        }
        return events
    }

    private mutating func tick(_ h: Double, _ events: inout [BattleEvent]) {
        time += h
        for i in outposts.indices where outposts[i].owner != Side.neutral && outposts[i].troops < outposts[i].capacity {
            let rate = outposts[i].production * multiplier(outposts[i].owner)
            outposts[i].troops = min(outposts[i].capacity, outposts[i].troops + rate * h)
        }

        var landed: [Fleet] = []
        for i in fleets.indices { fleets[i].elapsed += h }
        fleets.removeAll { fleet in
            if fleet.elapsed >= fleet.duration { landed.append(fleet); return true }
            return false
        }
        for fleet in landed { arrive(fleet, &events) }

        for faction in alive where faction != Side.player || autopilot {
            clocks[faction] -= h
            if clocks[faction] <= 0 {
                clocks[faction] = thinkInterval(faction) * rng.range(0.75, 1.25)
                command(faction, &events)
            }
        }

        for faction in alive where !outposts.contains(where: { $0.owner == faction }) && !fleets.contains(where: { $0.owner == faction }) {
            alive.removeAll { $0 == faction }
            if faction != Side.player { events.append(.eliminated(faction: faction)) }
        }
        if !alive.contains(Side.player) {
            outcome = .defeat
            events.append(.ended(.defeat))
        } else if alive == [Side.player] {
            outcome = .victory
            events.append(.ended(.victory))
        }
    }

    public func multiplier(_ faction: Int) -> Double { faction == Side.player ? 1 : difficulty.production }

    mutating func arrive(_ fleet: Fleet, _ events: inout [BattleEvent]) {
        var o = outposts[fleet.to]
        let attack = Double(fleet.count)
        if o.owner == fleet.owner {
            o.troops += attack
            events.append(.reinforced(outpost: o.id, count: fleet.count))
        } else {
            let defense = o.troops * o.armor
            let fallen = min(attack, defense)
            if fleet.owner == Side.player { stats.kills += fallen / o.armor; stats.losses += fallen }
            if o.owner == Side.player { stats.kills += fallen; stats.losses += fallen / o.armor }
            if attack > defense {
                let previous = o.owner
                o.owner = fleet.owner
                o.troops = attack - defense
                if fleet.owner == Side.player { stats.captures += 1 }
                events.append(.captured(outpost: o.id, by: fleet.owner, from: previous))
            } else {
                o.troops = (defense - attack) / o.armor
                events.append(.clashed(outpost: o.id, attacker: fleet.owner, count: fleet.count))
            }
        }
        outposts[fleet.to] = o
    }

    // MARK: Reading the field

    /// Troops a faction has, garrisoned and in flight.
    public func strength(of faction: Int) -> Double {
        outposts.reduce(0) { $0 + ($1.owner == faction ? $1.troops : 0) }
            + Double(fleets.reduce(0) { $0 + ($1.owner == faction ? $1.count : 0) })
    }

    /// Your share of everything the factions hold, 0 to 1 (unclaimed garrisons left out).
    public var playerShare: Double {
        let total = alive.reduce(0.0) { $0 + strength(of: $1) }
        return total > 0 ? strength(of: Side.player) / total : 0
    }

    /// Troops of other factions flying at `outpost`, and troops of the holder's own flying to it.
    public func incoming(to outpost: Int) -> (hostile: Double, friendly: Double) {
        let owner = outposts[outpost].owner
        var hostile = 0.0, friendly = 0.0
        for fleet in fleets where fleet.to == outpost {
            if fleet.owner == owner { friendly += Double(fleet.count) } else { hostile += Double(fleet.count) }
        }
        return (hostile, friendly)
    }

    // MARK: The commander

    private func thinkInterval(_ faction: Int) -> Double { faction == Side.player ? 1.1 : difficulty.think }
    private func aggression(_ faction: Int) -> Double { faction == Side.player ? 0.75 : difficulty.aggression }

    /// One decision for `faction`: shore up a position about to fall, else the best-value attack it can win,
    /// else move a full garrison forward.
    private mutating func command(_ faction: Int, _ events: inout [BattleEvent]) {
        let mine = outposts.indices.filter { outposts[$0].owner == faction }
        guard !mine.isEmpty else { return }
        var ownIncoming = [Double](repeating: 0, count: outposts.count)
        var hostileIncoming = [Double](repeating: 0, count: outposts.count)
        for fleet in fleets {
            if fleet.owner == faction { ownIncoming[fleet.to] += Double(fleet.count) }
            else if outposts[fleet.to].owner == faction { hostileIncoming[fleet.to] += Double(fleet.count) }
        }
        func spare(_ i: Int) -> Double { (outposts[i].troops * 0.75).rounded(.down) }
        func travel(_ a: Int, _ b: Int) -> Double { outposts[a].position.distance(to: outposts[b].position) / Battle.speed }

        // Defence.
        for i in mine where hostileIncoming[i] > outposts[i].troops * outposts[i].armor + ownIncoming[i] {
            let deficit = hostileIncoming[i] - outposts[i].troops * outposts[i].armor - ownIncoming[i] + 3
            if let helper = mine.filter({ $0 != i && spare($0) >= deficit }).min(by: { travel($0, i) < travel($1, i) }) {
                if let fleet = launch(from: helper, to: i, count: Int(deficit.rounded(.up))) { events.append(.launched(fleet)) }
                return
            }
        }

        // Attack.
        let bias = aggression(faction)
        var best: (score: Double, target: Int, orders: [(source: Int, count: Int)])?
        for t in outposts.indices where outposts[t].owner != faction {
            let target = outposts[t]
            var value = Double(target.kind.rawValue) + 0.5
            // Any rival is a rival: the enemy factions fight each other as readily as they fight you.
            value *= target.owner == Side.neutral ? 1.2 - 0.6 * bias : 0.7 + bias
            let sources = mine.sorted { travel($0, t) < travel($1, t) }.prefix(3)
            var gathered = 0.0, used: [Int] = [], farthest = 0.0
            for s in sources where spare(s) >= 1 {
                used.append(s)
                gathered += spare(s)
                farthest = max(farthest, travel(s, t))
                let growth = target.production * multiplier(target.owner) * farthest
                let need = (target.troops + growth) * target.armor - ownIncoming[t] + 2 + Double(target.kind.rawValue)
                guard need > 0 else { break }
                guard gathered >= need else { continue }
                let score = value / (need + 5 * farthest)
                if score > best?.score ?? 0 {
                    var orders: [(source: Int, count: Int)] = []
                    var left = need.rounded(.up) + 1
                    for u in used where left > 0 {
                        let n = min(spare(u), left)
                        orders.append((u, Int(n)))
                        left -= n
                    }
                    best = (score, t, orders)
                }
                break
            }
        }
        if let best {
            for order in best.orders {
                if let fleet = launch(from: order.source, to: best.target, count: order.count) { events.append(.launched(fleet)) }
            }
            return
        }

        // Nothing worth taking yet: move a garrison that has stopped growing toward the front.
        let hostile = outposts.indices.filter { outposts[$0].owner != faction && outposts[$0].owner != Side.neutral }
        guard !hostile.isEmpty else { return }
        func front(_ i: Int) -> Double { hostile.map { travel(i, $0) }.min() ?? 0 }
        for i in mine where outposts[i].troops >= outposts[i].capacity * 0.9 {
            if let forward = mine.filter({ $0 != i && front($0) < front(i) - 1 }).min(by: { front($0) < front($1) }) {
                if let fleet = launch(from: i, to: forward, count: Int(outposts[i].troops * 0.6)) { events.append(.launched(fleet)) }
                return
            }
        }
    }
}
