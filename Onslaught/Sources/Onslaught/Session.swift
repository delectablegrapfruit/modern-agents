import AppKit
import OnslaughtCore

/// The game being played, saved as it changes so a closed laptop or a quit loses nothing.
@MainActor
final class GameSession {
    private(set) var game: Game
    let store: Store
    /// Changes whenever a new fight replaces the old one, so the scene knows to rebuild.
    private(set) var fightSerial = 0
    private var unsaved = 0.0

    init(store: Store) {
        self.store = store
        game = store.load() ?? Game(seed: GameSession.freshSeed())
    }

    static func freshSeed() -> Int { Int.random(in: 1...0xFFFF_FFFF_FFFF) }

    var autopilot: Bool {
        get { game.autopilot }
        set { game.autopilot = newValue }
    }

    func advance(_ dt: Double) -> [FightEvent] {
        let stage = game.stage
        let events = game.advance(dt)
        unsaved += dt
        if game.stage != stage || unsaved > 15 { save() }
        return events
    }

    func aim(at p: Vec2) { game.fight.aim(at: p) }

    func detonate() -> [FightEvent] { game.detonate() }

    func choose(_ mod: Mod?) {
        game.choose(mod)
        fightSerial += 1
        save()
    }

    func newRun() {
        game.newRun()
        fightSerial += 1
        save()
    }

    func abandon() {
        game.abandon()
        save()
    }

    /// Fills the nova gauge (the self-test's shortcut).
    func chargeNova() { game.fight.ship.nova = 1 }

    /// Forgets the career too.
    func reset() {
        game = Game(seed: GameSession.freshSeed())
        fightSerial += 1
        save()
    }

    func save() {
        store.save(game)
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
        return Store(directory: base.appendingPathComponent("Onslaught", isDirectory: true))
    }

    static func scratch() -> Store {
        Store(directory: FileManager.default.temporaryDirectory.appendingPathComponent("Onslaught Self-Test \(UUID().uuidString)", isDirectory: true))
    }

    func load() -> Game? {
        guard let data = try? Data(contentsOf: url),
              let game = try? JSONDecoder().decode(Game.self, from: data),
              game.version == Game.currentVersion
        else { return nil }
        return game
    }

    func save(_ game: Game) {
        guard let data = try? JSONEncoder().encode(game) else { return }
        try? data.write(to: url, options: .atomic)
    }
}

/// Preferences, in the user defaults (a separate domain for the self-test, so it never touches yours).
enum Settings {
    static let defaults: UserDefaults = SelfTest.enabled
        ? (UserDefaults(suiteName: "org.modernagents.Onslaught.selftest") ?? .standard)
        : .standard

    enum Size: Int, CaseIterable {
        case small, medium, large

        /// The arena's width in points; it is 1.25 times as tall, plus the header.
        var width: CGFloat { [200, 240, 300][rawValue] }
        var title: String { ["Small", "Medium", "Large"][rawValue] }
    }

    static var size: Size {
        get { Size(rawValue: defaults.object(forKey: "size") as? Int ?? 1) ?? .medium }
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

    /// How many times the nova hint has been shown.
    static var novaHints: Int {
        get { defaults.integer(forKey: "novaHints") }
        set { defaults.set(newValue, forKey: "novaHints") }
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
