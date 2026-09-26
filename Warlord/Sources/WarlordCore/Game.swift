import Foundation

/// Why an order was refused, in words the panel can show.
public enum Refusal: Error, Equatable, Sendable {
    case notYours
    case alreadyYours
    case notBordering
    case tooFewTroops
    case noOrders(nextIn: TimeInterval)
    case cannotAfford
    case realmConquered
    case realmNotConquered

    public var message: String {
        switch self {
        case .notYours: "That land is not yours to command."
        case .alreadyYours: "Your banner already flies there."
        case .notBordering: "Too far — strike a bordering land."
        case .tooFewTroops: "One soldier must stay behind to hold it."
        case .noOrders(let wait): "No orders left. Next in \(Clock.short(wait)) — back to work."
        case .cannotAfford: "The war chest is empty."
        case .realmConquered: "This realm is already yours."
        case .realmNotConquered: "The realm still resists."
        }
    }
}

/// One clash of arms, yours or a rival's.
public struct Battle: Sendable, Equatable {
    public let from: Int
    public let to: Int
    public let attacker: FactionID
    public let defender: FactionID
    public let sent: Int
    public let chance: Double
    public let won: Bool
    public let attackerLosses: Int
    public let defenderLosses: Int
    /// Set when the battle took a house's seat: the house, and the lands that came over with it.
    public var broke: FactionID?
    public var subjugated: [Int] = []
}

/// What an attack set in motion: your battle, then the rivals' answer.
public struct Turn: Sendable {
    public let battle: Battle
    public let rivalBattles: [Battle]
    /// True when this attack took the last territory of the realm.
    public let conquered: Bool
}

/// What came in while you were away.
public struct Homecoming: Sendable, Equatable {
    public let away: TimeInterval
    public let gold: Int
    public let orders: Int
}

public enum Combat {
    /// Chance that `sent` troops beat a wall of `wall`: the roll is uniform over 1 ± `Rules.rollSpread`.
    public static func chance(sent: Int, wall: Double) -> Double {
        guard sent > 0 else { return 0 }
        let needed = wall / Double(sent)
        let low = 1 - Rules.rollSpread, high = 1 + Rules.rollSpread
        return min(max((high - needed) / (high - low), 0), 1)
    }
}

public enum Clock {
    /// "4:59", "12s".
    public static func short(_ seconds: TimeInterval) -> String {
        let s = max(0, Int(seconds.rounded(.up)))
        return s < 60 ? "\(s)s" : "\(s / 60):" + (s % 60 < 10 ? "0" : "") + "\(s % 60)"
    }

    /// "3 h 20 min", "12 min".
    public static func long(_ seconds: TimeInterval) -> String {
        let m = max(0, Int(seconds / 60))
        return m < 60 ? "\(m) min" : "\(m / 60) h" + (m % 60 == 0 ? "" : " \(m % 60) min")
    }
}

/// A campaign: the realm on the table, your treasury and orders, and your record. Every change goes through a
/// method that takes the current time, so the clock-driven parts (orders coming back, gold coming in) are exact and
/// testable.
public struct Game: Codable, Sendable {
    public static let version = 1

    public private(set) var version = Game.version
    public internal(set) var realm: Realm
    public internal(set) var gold: Double
    public internal(set) var orders: Int
    public private(set) var stats: Stats
    private var goldClock: Date
    private var ordersClock: Date
    private var rng: SplitMix64
    /// When you last looked, and your gold then: the baseline of the next homecoming.
    private var checkedIn: Date
    private var goldAtCheckIn: Double

    public init(seed: UInt64, now: Date) {
        rng = SplitMix64(seed: seed)
        stats = Stats()
        realm = RealmGenerator.make(level: 1, rank: 0, rng: &rng)
        gold = Rules.startingGold
        orders = Rules.orderCap
        goldClock = now
        ordersClock = now
        checkedIn = now
        goldAtCheckIn = gold
    }

    // MARK: Standing

    public var rank: Int { stats.realmsConquered }
    public var title: String { Rank.title(realms: rank) }

    public var incomePerMinute: Double {
        realm.territories.filter { $0.owner == .player }.reduce(0) { $0 + $1.income } * (1 + Rules.incomePerRank * Double(rank))
    }

    public var levyCost: Int { Rules.levySize * Int(Rules.troopCost) }
    public var canLevy: Bool { gold >= Rules.troopCost }

    /// Seconds until the next order arrives; nil while the stock is full.
    public func nextOrder(now: Date) -> TimeInterval? {
        orders >= Rules.orderCap ? nil : max(0, Rules.orderInterval - now.timeIntervalSince(ordersClock))
    }

    /// The odds of attacking `to` from `from`, if that is an attack you could order.
    public func chance(from: Int, to: Int) -> Double? {
        let a = realm.territories[from], d = realm.territories[to]
        guard a.owner == .player, d.owner != .player, realm.borders(from, to), a.troops >= 2 else { return nil }
        return Combat.chance(sent: a.troops - 1, wall: d.wall)
    }

    // MARK: Time

    /// Brings gold and orders up to `now`.
    public mutating func accrue(now: Date) {
        let dt = now.timeIntervalSince(goldClock)
        if dt > 0 { gold += incomePerMinute * min(dt, Rules.incomeCap) / 60 }
        goldClock = now

        let elapsed = now.timeIntervalSince(ordersClock)
        if orders >= Rules.orderCap || elapsed < 0 {
            ordersClock = now
        } else {
            let gained = Int(elapsed / Rules.orderInterval)
            if gained > 0 {
                orders = min(Rules.orderCap, orders + gained)
                ordersClock = orders >= Rules.orderCap ? now : ordersClock.addingTimeInterval(Double(gained) * Rules.orderInterval)
            }
        }
    }

    /// You are looking at the realm. After a while away, reports what came in since you last looked.
    public mutating func checkIn(now: Date) -> Homecoming? {
        accrue(now: now)
        let away = now.timeIntervalSince(checkedIn)
        let report = away >= Rules.homecomingAfter ? Homecoming(away: away, gold: Int(gold) - Int(goldAtCheckIn), orders: orders) : nil
        checkedIn = now
        goldAtCheckIn = gold
        return report
    }

    // MARK: Orders

    /// Sends all but one of `from`'s troops against a bordering territory. Spends an order; the rivals answer.
    public mutating func attack(from: Int, to: Int, now: Date) throws -> Turn {
        guard !realm.isConquered else { throw Refusal.realmConquered }
        let a = realm.territories[from], d = realm.territories[to]
        guard a.owner == .player else { throw Refusal.notYours }
        guard d.owner != .player else { throw Refusal.alreadyYours }
        guard realm.borders(from, to) else { throw Refusal.notBordering }
        guard a.troops >= 2 else { throw Refusal.tooFewTroops }
        accrue(now: now)
        guard orders > 0 else { throw Refusal.noOrders(nextIn: nextOrder(now: now) ?? 0) }
        orders -= 1
        touch(now)

        let battle = resolve(from: from, to: to)
        if battle.won {
            stats.battlesWon += 1
            stats.territoriesTaken += 1 + battle.subjugated.count
            if battle.broke != nil { stats.housesBroken += 1 }
        } else {
            stats.battlesLost += 1
        }
        let conquered = realm.isConquered
        let answer = conquered ? [] : rivalsMove()
        if conquered { stats.realmsConquered += 1 }
        return Turn(battle: battle, rivalBattles: answer, conquered: conquered)
    }

    /// Moves all but one of `from`'s troops to a bordering territory of yours. Costs nothing.
    @discardableResult
    public mutating func march(from: Int, to: Int, now: Date) throws -> Int {
        let a = realm.territories[from], d = realm.territories[to]
        guard a.owner == .player, d.owner == .player else { throw Refusal.notYours }
        guard realm.borders(from, to) else { throw Refusal.notBordering }
        guard a.troops >= 2 else { throw Refusal.tooFewTroops }
        touch(now)
        let moving = a.troops - 1
        realm.territories[from].troops = 1
        realm.territories[to].troops += moving
        return moving
    }

    /// Raises up to `Rules.levySize` troops in a territory of yours, as many as the war chest pays for.
    @discardableResult
    public mutating func levy(at id: Int, now: Date) throws -> Int {
        guard realm.territories[id].owner == .player else { throw Refusal.notYours }
        accrue(now: now)
        touch(now)
        let raised = min(Rules.levySize, Int(gold / Rules.troopCost))
        guard raised > 0 else { throw Refusal.cannotAfford }
        gold -= Double(raised) * Rules.troopCost
        realm.territories[id].troops += raised
        return raised
    }

    /// Rides on to a new, larger realm once this one is yours. Gold and orders come along.
    public mutating func advance(now: Date) throws {
        guard realm.isConquered else { throw Refusal.realmNotConquered }
        accrue(now: now)
        realm = RealmGenerator.make(level: realm.level + 1, rank: rank, rng: &rng)
        touch(now)
    }

    /// Gives up on this realm for a fresh one of the same size.
    public mutating func abandon(now: Date) {
        accrue(now: now)
        realm = RealmGenerator.make(level: realm.level, rank: rank, rng: &rng)
        touch(now)
    }

    private mutating func touch(_ now: Date) {
        checkedIn = max(checkedIn, now)
        goldAtCheckIn = gold
    }

    // MARK: Battle

    /// Fights it out: all but one of `from`'s troops against `to`'s garrison behind its walls. Losing sends the
    /// survivors home and still costs the defender; winning moves the survivors in.
    mutating func resolve(from: Int, to: Int) -> Battle {
        let attacker = realm.territories[from].owner, defender = realm.territories[to].owner
        let sent = realm.territories[from].troops - 1
        let garrison = realm.territories[to].troops
        let wall = realm.territories[to].wall
        let chance = Combat.chance(sent: sent, wall: wall)
        let strength = Double(sent) * (1 + (rng.unit() * 2 - 1) * Rules.rollSpread)
        realm.territories[from].troops = 1

        guard strength > wall else {
            let ratio = strength / max(wall, 0.001)
            let losses = min(sent, Int((Double(sent) * (0.45 + 0.3 * (1 - ratio))).rounded()))
            let killed = min(garrison - 1, Int((Double(garrison) * ratio * 0.5).rounded()))
            realm.territories[from].troops += sent - losses
            realm.territories[to].troops -= max(killed, 0)
            return Battle(from: from, to: to, attacker: attacker, defender: defender, sent: sent, chance: chance,
                          won: false, attackerLosses: losses, defenderLosses: max(killed, 0))
        }

        let losses = min(sent - 1, Int((wall * wall / strength * 0.8).rounded()))
        realm.territories[to].owner = attacker
        realm.territories[to].troops = sent - losses
        var battle = Battle(from: from, to: to, attacker: attacker, defender: defender, sent: sent, chance: chance,
                            won: true, attackerLosses: losses, defenderLosses: garrison)

        // A house whose seat falls breaks: its remaining lands bend the knee to the victor, half their garrisons
        // deserting.
        if let house = realm.rivals.firstIndex(where: { $0.seat == to && $0.isAlive }) {
            let id = realm.rivals[house].id
            realm.rivals[house].isAlive = false
            battle.broke = id
            for t in realm.territories.indices where realm.territories[t].owner == id {
                realm.territories[t].owner = attacker
                realm.territories[t].troops = max(1, realm.territories[t].troops / 2)
                battle.subjugated.append(t)
            }
        }
        return battle
    }

    /// The rivals' answer to one of your attacks: each house musters troops on its borders and may strike a
    /// neighbour it is confident of beating — unclaimed land first; your lands now and then, and only on long odds;
    /// your seat never.
    mutating func rivalsMove() -> [Battle] {
        var battles: [Battle] = []
        let boldness = min(0.3 + 0.05 * Double(realm.level), 0.55)
        for index in realm.rivals.indices where realm.rivals[index].isAlive {
            let id = realm.rivals[index].id
            let holdings = realm.owned(by: id)
            guard !holdings.isEmpty else {
                realm.rivals[index].isAlive = false
                continue
            }
            let border = holdings.filter { t in realm.adjacency[t].contains { realm.territories[$0].owner != id } }
            let muster = 1 + holdings.count / 5
            for _ in 0..<muster {
                if let t = (border.isEmpty ? holdings : border).randomElement(using: &rng) { realm.territories[t].troops += 1 }
            }

            guard rng.chance(boldness) else { continue }
            let raiding = rng.chance(0.35)
            var best: (from: Int, to: Int, score: Double)?
            for t in border where realm.territories[t].troops >= 3 {
                for n in realm.adjacency[t] where realm.territories[n].owner != id && n != realm.home {
                    let target = realm.territories[n]
                    if target.owner == .player && !raiding { continue }
                    let odds = Combat.chance(sent: realm.territories[t].troops - 1, wall: target.wall)
                    guard odds >= (target.owner == .player ? 0.95 : 0.65) else { continue }
                    let score = odds + (target.owner == .neutral ? 0.3 : 0) + (target.isCapital ? 0.5 : 0) + rng.unit() * 0.2
                    if score > best?.score ?? -1 { best = (t, n, score) }
                }
            }
            if let best { battles.append(resolve(from: best.from, to: best.to)) }
        }
        return battles
    }
}
