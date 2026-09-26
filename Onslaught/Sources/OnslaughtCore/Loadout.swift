import Foundation

/// Upgrades, one picked from three after every boss. They stack up to a limit and last for the run.
public enum Mod: String, Codable, CaseIterable, Sendable {
    case splitBarrel, overclock, tungsten, seekers, wingman, plating, deflector, reactor, novaCore, afterburner

    public var title: String {
        switch self {
        case .splitBarrel: return "SPLIT BARREL"
        case .overclock: return "OVERCLOCK"
        case .tungsten: return "TUNGSTEN ROUNDS"
        case .seekers: return "SEEKER POD"
        case .wingman: return "WINGMAN"
        case .plating: return "HULL PLATING"
        case .deflector: return "DEFLECTOR"
        case .reactor: return "GRAZE REACTOR"
        case .novaCore: return "NOVA CORE"
        case .afterburner: return "AFTERBURNER"
        }
    }

    public var blurb: String {
        switch self {
        case .splitBarrel: return "+1 gun barrel"
        case .overclock: return "+22% fire rate"
        case .tungsten: return "+25% damage"
        case .seekers: return "+1 homing missile per volley"
        case .wingman: return "+1 drone that fires with you"
        case .plating: return "+1 max hull, repaired"
        case .deflector: return "Absorbs the first hit each fight"
        case .reactor: return "Grazes charge the nova 50% faster"
        case .novaCore: return "Nova hits twice as hard, starts half charged"
        case .afterburner: return "+20% ship speed"
        }
    }

    /// An SF Symbol for the card.
    public var symbol: String {
        switch self {
        case .splitBarrel: return "arrow.up.and.line.horizontal.and.arrow.down"
        case .overclock: return "speedometer"
        case .tungsten: return "circle.hexagongrid.fill"
        case .seekers: return "scope"
        case .wingman: return "airplane"
        case .plating: return "shield.lefthalf.filled"
        case .deflector: return "shield.fill"
        case .reactor: return "bolt.fill"
        case .novaCore: return "sun.max.fill"
        case .afterburner: return "flame.fill"
        }
    }

    public var maxLevel: Int {
        switch self {
        case .splitBarrel: return 3
        case .overclock, .tungsten: return 4
        case .seekers: return 3
        case .wingman: return 2
        case .plating: return 3
        case .deflector: return 1
        case .reactor: return 2
        case .novaCore: return 2
        case .afterburner: return 2
        }
    }
}

public struct Loadout: Codable, Equatable, Sendable {
    public var levels: [String: Int] = [:]

    public init() {}

    public func level(_ mod: Mod) -> Int { levels[mod.rawValue] ?? 0 }
    public func canTake(_ mod: Mod) -> Bool { level(mod) < mod.maxLevel }

    public mutating func add(_ mod: Mod) {
        guard canTake(mod) else { return }
        levels[mod.rawValue] = level(mod) + 1
    }

    public var count: Int { levels.values.reduce(0, +) }

    // What the mods add up to.

    public var barrels: Int { 1 + level(.splitBarrel) }
    public var fireInterval: Double { 0.1 / (1 + 0.22 * Double(level(.overclock))) }
    public var damageScale: Double { 1 + 0.25 * Double(level(.tungsten)) }
    /// Each barrel of a split gun hits a little softer than a lone one.
    public var boltDamage: Double { damageScale * (barrels > 1 ? 0.72 : 1) }
    public var missiles: Int { level(.seekers) }
    public var drones: Int { level(.wingman) }
    public var maxHull: Int { 3 + level(.plating) }
    public var hasDeflector: Bool { level(.deflector) > 0 }
    public var grazeGain: Double { 1 + 0.5 * Double(level(.reactor)) }
    public var grazeRadius: Double { 11 * (1 + 0.15 * Double(level(.reactor))) }
    public var novaPower: Double { 1 + Double(level(.novaCore)) }
    public var novaStart: Double { level(.novaCore) > 0 ? 0.5 : 0 }
    public var shipSpeed: Double { 330 * (1 + 0.2 * Double(level(.afterburner))) }
}

/// Picks the three upgrades on offer after a boss.
public enum Armory {
    public static func offer(_ loadout: Loadout, rng: inout RNG, count: Int = 3) -> [Mod] {
        var pool = Mod.allCases.filter { loadout.canTake($0) }
        rng.shuffle(&pool)
        return Array(pool.prefix(count))
    }
}

/// Career ranks, by bosses destroyed over every run.
public enum Rank {
    public static let ladder: [(kills: Int, title: String)] = [
        (0, "Cadet"), (2, "Pilot"), (5, "Gunner"), (9, "Ace"), (15, "Veteran"), (24, "Vanguard"),
        (36, "Warhawk"), (52, "Destroyer"), (75, "Titanslayer"), (105, "Warlord"), (150, "Legend"), (210, "Immortal"),
    ]

    public static func title(kills: Int) -> String {
        ladder.last { $0.kills <= kills }?.title ?? "Cadet"
    }

    public static func next(kills: Int) -> (kills: Int, title: String)? {
        ladder.first { $0.kills > kills }
    }
}
