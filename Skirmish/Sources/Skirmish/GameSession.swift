import AppKit
import SkirmishCore

/// The campaign and the battle being fought, saved as they change so a closed laptop or a quit loses nothing.
@MainActor
final class GameSession {
    private(set) var campaign: Campaign
    private(set) var battle: Battle
    let store: Store
    /// The rank the last finished battle earned, if it earned one.
    private(set) var promotion: String?
    private var unsaved = 0.0

    init(store: Store) {
        self.store = store
        let save = store.load()
        campaign = save?.campaign ?? Campaign()
        battle = save?.battle ?? (save?.campaign ?? Campaign()).makeBattle()
    }

    var autopilot: Bool {
        get { battle.autopilot }
        set { battle.autopilot = newValue }
    }

    /// Runs the battle forward. A battle that ends is recorded and saved on the spot.
    func advance(_ dt: Double) -> [BattleEvent] {
        let events = battle.step(dt)
        unsaved += dt
        if battle.outcome != nil, events.contains(where: { if case .ended = $0 { return true } else { return false } }) {
            promotion = campaign.record(battle)
            save()
        } else if unsaved > 15 {
            save()
        }
        return events
    }

    func send(from sources: [Int], to target: Int, fraction: Double) -> [Fleet] {
        battle.send(from: sources, to: target, fraction: fraction)
    }

    /// On to the next battle: the next sector after a victory, the same one on a new map after a defeat.
    func next() {
        promotion = nil
        battle = campaign.makeBattle()
        save()
    }

    /// Gives up this map for another. A finished battle is simply left.
    func retreat() {
        if battle.outcome == nil { campaign.retreat(from: battle) }
        next()
    }

    func reset() {
        campaign = Campaign()
        next()
    }

    func save() {
        store.save(SaveGame(campaign: campaign, battle: battle))
        unsaved = 0
    }
}

/// The save file: JSON in Application Support.
struct Store {
    let url: URL

    init(directory: URL) {
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        url = directory.appendingPathComponent("save.json")
    }

    static var standard: Store {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent("Library/Application Support")
        return Store(directory: base.appendingPathComponent("Skirmish", isDirectory: true))
    }

    static func scratch() -> Store {
        Store(directory: FileManager.default.temporaryDirectory.appendingPathComponent("Skirmish Self-Test \(UUID().uuidString)", isDirectory: true))
    }

    func load() -> SaveGame? {
        guard let data = try? Data(contentsOf: url),
              let save = try? JSONDecoder().decode(SaveGame.self, from: data),
              save.version == SaveGame.currentVersion
        else { return nil }
        return save
    }

    func save(_ game: SaveGame) {
        guard let data = try? JSONEncoder().encode(game) else { return }
        try? data.write(to: url, options: .atomic)
    }
}

/// Preferences, in the user defaults (a separate domain for the self-test, so it never touches yours).
enum Settings {
    static let defaults: UserDefaults = SelfTest.enabled
        ? (UserDefaults(suiteName: "org.modernagents.Skirmish.selftest") ?? .standard)
        : .standard

    enum Size: Int, CaseIterable {
        case small, medium, large

        var side: CGFloat { [236, 296, 376][rawValue] }
        var title: String { ["Small", "Medium", "Large"][rawValue] }
    }

    static var size: Size {
        get { Size(rawValue: defaults.integer(forKey: "size")) ?? .medium }
        set { defaults.set(newValue.rawValue, forKey: "size") }
    }

    static var pauseWhenAway: Bool {
        get { defaults.object(forKey: "pauseWhenAway") as? Bool ?? true }
        set { defaults.set(newValue, forKey: "pauseWhenAway") }
    }

    static var dimWhenAway: Bool {
        get { defaults.object(forKey: "dimWhenAway") as? Bool ?? true }
        set { defaults.set(newValue, forKey: "dimWhenAway") }
    }

    static var compact: Bool {
        get { defaults.bool(forKey: "compact") }
        set { defaults.set(newValue, forKey: "compact") }
    }

    static var visible: Bool {
        get { defaults.object(forKey: "visible") as? Bool ?? true }
        set { defaults.set(newValue, forKey: "visible") }
    }

    static var hintShown: Bool {
        get { defaults.bool(forKey: "hintShown") }
        set { defaults.set(newValue, forKey: "hintShown") }
    }

    /// The window's top-left corner on screen.
    static var topLeft: NSPoint? {
        get {
            guard let pair = defaults.array(forKey: "topLeft") as? [Double], pair.count == 2 else { return nil }
            return NSPoint(x: pair[0], y: pair[1])
        }
        set {
            if let p = newValue { defaults.set([Double(p.x), Double(p.y)], forKey: "topLeft") }
            else { defaults.removeObject(forKey: "topLeft") }
        }
    }
}
