import Foundation

/// A point on the battlefield, which is the unit square: (0, 0) bottom left, (1, 1) top right.
public struct Vec2: Codable, Equatable, Sendable {
    public var x: Double
    public var y: Double

    public init(_ x: Double, _ y: Double) {
        self.x = x
        self.y = y
    }

    public func distance(to other: Vec2) -> Double { ((x - other.x) * (x - other.x) + (y - other.y) * (y - other.y)).squareRoot() }

    public static func + (a: Vec2, b: Vec2) -> Vec2 { Vec2(a.x + b.x, a.y + b.y) }
    public static func - (a: Vec2, b: Vec2) -> Vec2 { Vec2(a.x - b.x, a.y - b.y) }
    public static func * (a: Vec2, k: Double) -> Vec2 { Vec2(a.x * k, a.y * k) }
}

/// Who holds what. 0 is nobody; 1 is you; 2, 3 and 4 are the enemy.
public enum Side {
    public static let neutral = 0
    public static let player = 1

    public static func name(_ faction: Int) -> String {
        switch faction {
        case neutral: return "Unclaimed"
        case player: return "Vanguard"
        case 2: return "Crimson Horde"
        case 3: return "Amber Legion"
        default: return "Void Syndicate"
        }
    }
}

/// A position worth holding. Bigger ones build troops faster and hold more of them.
public struct Outpost: Codable, Equatable, Identifiable, Sendable {
    public enum Kind: Int, Codable, Sendable {
        case relay = 1, outpost, stronghold, citadel
    }

    public let id: Int
    public var position: Vec2
    public var kind: Kind
    public var owner: Int
    public var troops: Double
    /// How many attackers each defender is worth. A citadel's walls make it 1.5.
    public var armor: Double

    public init(id: Int, position: Vec2, kind: Kind, owner: Int, troops: Double, armor: Double = 1) {
        self.id = id
        self.position = position
        self.kind = kind
        self.owner = owner
        self.troops = troops
        self.armor = armor
    }

    /// Troops per second, before the owner's multiplier. The unclaimed build nothing.
    public var production: Double { owner == Side.neutral ? 0 : Outpost.productionTable[kind.rawValue] }
    /// Production stops here; reinforcements can still pile in above it.
    public var capacity: Double { Outpost.capacityTable[kind.rawValue] }
    /// Radius as a fraction of the battlefield's side.
    public var radius: Double { Outpost.radiusTable[kind.rawValue] }

    static let productionTable: [Double] = [0, 0.55, 0.9, 1.3, 1.7]
    static let capacityTable: [Double] = [0, 30, 55, 90, 150]
    static let radiusTable: [Double] = [0, 0.040, 0.050, 0.061, 0.074]
}

/// Troops in flight. They fly a shallow curve, so fleets on one lane fan out instead of stacking.
public struct Fleet: Codable, Equatable, Identifiable, Sendable {
    public let id: Int
    public let owner: Int
    public let count: Int
    public let from: Int
    public let to: Int
    public let origin: Vec2
    public let control: Vec2
    public let target: Vec2
    public var elapsed: Double
    public let duration: Double

    public var progress: Double { min(1, max(0, elapsed / duration)) }
    public var position: Vec2 { point(at: progress) }
    /// Direction of travel in radians, counterclockwise from +x.
    public var heading: Double {
        let t = progress
        let d = (control - origin) * (2 * (1 - t)) + (target - control) * (2 * t)
        return atan2(d.y, d.x)
    }

    public func point(at t: Double) -> Vec2 {
        let u = 1 - t
        return origin * (u * u) + control * (2 * u * t) + target * (t * t)
    }
}

public enum Outcome: String, Codable, Sendable {
    case victory, defeat
}

/// What happened during a step, for the screen to show.
public enum BattleEvent: Equatable, Sendable {
    case launched(Fleet)
    case reinforced(outpost: Int, count: Int)
    /// An attack that broke on the defenders.
    case clashed(outpost: Int, attacker: Int, count: Int)
    case captured(outpost: Int, by: Int, from: Int)
    case eliminated(faction: Int)
    case ended(Outcome)
}

/// Your side of the ledger for one battle.
public struct BattleStats: Codable, Equatable, Sendable {
    /// Enemy (and unclaimed) troops your fleets and garrisons destroyed.
    public var kills: Double = 0
    public var losses: Double = 0
    public var captures: Int = 0
    public var launched: Int = 0

    public init() {}
}

/// How hard a sector fights back.
public struct Difficulty: Codable, Equatable, Sendable {
    /// Enemy factions, 1 to 3. They fight each other as well as you.
    public var enemies: Int
    /// Seconds between an enemy commander's decisions.
    public var think: Double
    /// Enemy production relative to yours.
    public var production: Double
    public var homeTroops: Double
    /// 0 to 1: how much an enemy prefers hitting you over taking unclaimed ground.
    public var aggression: Double
    /// Every fifth sector: the enemy home is a walled citadel with a guard.
    public var siege: Bool

    public static func forSector(_ sector: Int) -> Difficulty {
        let s = max(1, sector)
        let siege = s % 5 == 0
        let enemies: Int
        if siege { enemies = s >= 15 ? 2 : 1 }
        else if s < 4 { enemies = 1 }
        else if s < 12 { enemies = s % 2 == 0 ? 2 : 1 }
        else { enemies = s % 3 == 0 ? 3 : 2 }
        let t = Double(s - 1)
        return Difficulty(
            enemies: enemies,
            think: max(0.9, 3.2 - 0.11 * t),
            production: min(1.35, 0.8 + 0.025 * t),
            homeTroops: min(60, 20 + 2 * t),
            aggression: min(0.9, 0.3 + 0.035 * t),
            siege: siege
        )
    }
}

/// The name of a sector, the same every time.
public enum Names {
    static let first = ["Kharon", "Vex", "Ashen", "Iron", "Obsidian", "Crimson", "Talon", "Hollow", "Dread", "Storm",
                        "Ember", "Onyx", "Grim", "Titan", "Cinder", "Raven", "Basalt", "Sable", "Wolf", "Thorn",
                        "Cobalt", "Scorch", "Vanta", "Havoc"]
    static let second = ["Reach", "Gate", "Expanse", "Frontier", "Bastion", "Maw", "Spur", "Belt", "Verge", "Hold",
                         "Rift", "March", "Crossing", "Divide", "Anvil", "Crown", "Front", "Pass"]

    /// Strides through both lists at different rates: no name repeats within 72 sectors.
    public static func sector(_ n: Int) -> String {
        let k = max(0, n) + 3
        return first[(k * 7) % first.count] + " " + second[(k * 5) % second.count]
    }
}
