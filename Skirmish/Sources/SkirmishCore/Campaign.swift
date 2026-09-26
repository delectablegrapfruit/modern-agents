/// The long war: which sector is next, your record, your rank. A lost battle costs nothing but the streak; the
/// sector waits, on a fresh map, until you take it.
public struct Campaign: Codable, Equatable, Sendable {
    public var sector = 1
    /// Tries at the current sector, which with the sector names its map.
    public var attempt = 0
    public var victories = 0
    public var defeats = 0
    public var streak = 0
    public var bestStreak = 0
    public var kills = 0
    public var captures = 0
    /// Seconds of the quickest victory.
    public var fastest: Double?

    public init() {}

    public static let ranks: [(victories: Int, title: String)] = [
        (0, "Recruit"), (1, "Private"), (3, "Corporal"), (5, "Sergeant"), (8, "Lieutenant"), (12, "Captain"),
        (17, "Major"), (23, "Colonel"), (30, "Brigadier"), (40, "General"), (52, "Marshal"), (66, "Warlord"),
        (82, "Conqueror"), (100, "Emperor"),
    ]

    public var rank: String { Campaign.ranks.last { $0.victories <= victories }?.title ?? "Recruit" }

    public var nextRank: (title: String, victories: Int)? {
        Campaign.ranks.first { $0.victories > victories }.map { ($0.title, $0.victories) }
    }

    public func makeBattle() -> Battle { Battle(sector: sector, seed: mixSeed(UInt64(sector), UInt64(attempt))) }

    /// Records a finished battle. Returns the new rank when this one earned a promotion.
    @discardableResult
    public mutating func record(_ battle: Battle) -> String? {
        guard let outcome = battle.outcome else { return nil }
        let before = rank
        kills += Int(battle.stats.kills)
        captures += battle.stats.captures
        switch outcome {
        case .victory:
            victories += 1
            streak += 1
            bestStreak = max(bestStreak, streak)
            fastest = min(fastest ?? battle.time, battle.time)
            sector = battle.sector + 1
            attempt = 0
        case .defeat:
            defeats += 1
            streak = 0
            attempt += 1
        }
        return rank != before ? rank : nil
    }

    /// Gives up the current battle: counts as a defeat, and the sector comes back on a new map.
    public mutating func retreat(from battle: Battle) {
        kills += Int(battle.stats.kills)
        defeats += 1
        streak = 0
        attempt += 1
    }
}

/// Everything that is saved: the campaign and the battle in progress.
public struct SaveGame: Codable, Equatable, Sendable {
    public static let currentVersion = 1
    public var version = SaveGame.currentVersion
    public var campaign: Campaign
    public var battle: Battle

    public init(campaign: Campaign = Campaign(), battle: Battle? = nil) {
        self.campaign = campaign
        self.battle = battle ?? campaign.makeBattle()
    }
}
