import Foundation

/// The numbers the game is balanced on. `warlord-sim` plays campaigns with them to check the pacing.
public enum Rules {
    /// Orders are the only thing that runs out: each attack spends one, and they come back with time. A full stock
    /// is a short break's worth of play; the rest of the time the realm waits.
    public static let orderCap = 6
    public static let orderInterval: TimeInterval = 5 * 60
    /// Gold keeps coming in while you work, up to this much absence.
    public static let incomeCap: TimeInterval = 8 * 3600
    /// Troops a levy raises, and what each costs.
    public static let levySize = 5
    public static let troopCost = 5.0
    public static let startingGold = 40.0
    /// An attack's strength is its troops times a roll in 1 ± this.
    public static let rollSpread = 0.2
    /// A capital's walls multiply its terrain's defence.
    public static let capitalDefense = 1.5
    /// Each realm conquered adds this much to your income.
    public static let incomePerRank = 0.1
    /// After this long without a look, the panel greets you with what came in meanwhile.
    public static let homecomingAfter: TimeInterval = 3 * 60
}

public enum Terrain: String, Codable, CaseIterable, Sendable {
    case plains, forest, hills, mountains, city

    /// Multiplies the garrison of a territory under attack.
    public var defense: Double {
        switch self {
        case .plains: 1.0
        case .forest: 1.2
        case .hills: 1.35
        case .mountains: 1.7
        case .city: 1.1
        }
    }

    /// Gold per minute to whoever holds it.
    public var income: Double {
        switch self {
        case .city: 1.5
        case .mountains: 0.25
        default: 0.5
        }
    }

    public var name: String { rawValue.capitalized }
}

/// Who holds a territory: nobody, you, or one of the rival houses (2 and up).
public struct FactionID: Hashable, Comparable, Codable, Sendable {
    public let raw: Int

    public init(_ raw: Int) {
        self.raw = raw
    }

    public static let neutral = FactionID(0)
    public static let player = FactionID(1)

    public var isRival: Bool { raw >= 2 }

    public static func < (a: FactionID, b: FactionID) -> Bool { a.raw < b.raw }

    public init(from decoder: Decoder) throws {
        raw = try decoder.singleValueContainer().decode(Int.self)
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(raw)
    }
}

public struct Territory: Codable, Hashable, Sendable, Identifiable {
    public let id: Int
    public let hex: Hex
    public let name: String
    public var terrain: Terrain
    public var owner: FactionID
    public var troops: Int
    /// A walled seat of power. Taking a house's own seat breaks the house.
    public var isCapital: Bool

    /// What each defending soldier counts for.
    public var defense: Double { terrain.defense * (isCapital ? Rules.capitalDefense : 1) }
    /// The strength an attack has to beat.
    public var wall: Double { Double(troops) * defense }
    public var income: Double { terrain.income + (isCapital ? 2 : 0) }
}

/// A rival house.
public struct Faction: Codable, Hashable, Sendable {
    public let id: FactionID
    public let name: String
    /// Which banner colour the house flies; the app maps it to a colour.
    public let banner: Int
    /// The territory whose fall breaks the house.
    public let seat: Int
    public var isAlive: Bool
}

/// One map to conquer.
public struct Realm: Codable, Sendable {
    /// 1 for the first realm; later realms are larger and better defended.
    public let level: Int
    public let name: String
    public let columns: Int
    public let rows: Int
    /// Indexed by territory id.
    public internal(set) var territories: [Territory]
    /// Territory ids bordering each territory, indexed by territory id.
    public let adjacency: [[Int]]
    public internal(set) var rivals: [Faction]
    /// Your seat. Rivals never march on it, so however a campaign goes you cannot be driven out.
    public let home: Int

    init(level: Int, name: String, columns: Int, rows: Int, territories: [Territory], rivals: [Faction], home: Int) {
        self.level = level
        self.name = name
        self.columns = columns
        self.rows = rows
        self.territories = territories
        self.rivals = rivals
        self.home = home
        var index: [Hex: Int] = [:]
        for t in territories { index[t.hex] = t.id }
        adjacency = territories.map { t in t.hex.neighbors.compactMap { index[$0] } }
    }

    public func territory(at hex: Hex) -> Territory? {
        territories.first { $0.hex == hex }
    }

    public func owned(by faction: FactionID) -> [Int] {
        territories.filter { $0.owner == faction }.map(\.id)
    }

    public func borders(_ a: Int, _ b: Int) -> Bool {
        adjacency[a].contains(b)
    }

    public func rival(_ id: FactionID) -> Faction? {
        rivals.first { $0.id == id }
    }

    public func name(of owner: FactionID) -> String {
        switch owner {
        case .neutral: "Unclaimed"
        case .player: "Your banner"
        default: rival(owner)?.name ?? "Unknown"
        }
    }

    public var isConquered: Bool { territories.allSatisfy { $0.owner == .player } }
}

public struct Stats: Codable, Sendable, Equatable {
    public var realmsConquered = 0
    public var battlesWon = 0
    public var battlesLost = 0
    public var territoriesTaken = 0
    public var housesBroken = 0

    public init() {}
}

public enum Rank {
    public static let titles = ["Sellsword", "Captain", "Warlord", "Baron", "Count", "Duke", "Prince", "King", "High King", "Emperor"]

    /// Your title once `realms` realms have fallen to you.
    public static func title(realms: Int) -> String {
        titles[min(max(realms, 0), titles.count - 1)]
    }
}
