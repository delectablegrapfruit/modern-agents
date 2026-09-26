import Foundation

/// The campaign on disk: one JSON file, `~/Library/Application Support/Warlord/campaign.json` (or under
/// `$WARLORD_HOME`), written whole and atomically after every order.
public struct GameStore: Sendable {
    public let directory: URL
    public var file: URL { directory.appendingPathComponent("campaign.json") }

    public init(directory: URL = GameStore.defaultDirectory) {
        self.directory = directory
    }

    public static var defaultDirectory: URL {
        if let home = ProcessInfo.processInfo.environment["WARLORD_HOME"], !home.isEmpty {
            return URL(fileURLWithPath: home, isDirectory: true)
        }
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support")
        return support.appendingPathComponent("Warlord", isDirectory: true)
    }

    /// The saved campaign, or nil when there is none. A file that cannot be read is set aside, not overwritten.
    public func load() -> Game? {
        guard let data = try? Data(contentsOf: file) else { return nil }
        if let game = try? JSONDecoder().decode(Game.self, from: data), game.version <= Game.version {
            return game
        }
        let aside = directory.appendingPathComponent("campaign-unreadable-\(Int(Date().timeIntervalSince1970)).json")
        try? FileManager.default.moveItem(at: file, to: aside)
        return nil
    }

    public func save(_ game: Game) throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        try encoder.encode(game).write(to: file, options: .atomic)
    }

    /// The saved campaign, or a new one.
    public func loadOrStart(now: Date = Date()) -> Game {
        load() ?? Game(seed: UInt64.random(in: 1...UInt64.max), now: now)
    }
}
