import AppKit
import RoninCore

/// The career and the fight in progress, saved as they change so a closed laptop or a quit loses nothing.
@MainActor
final class GameSession {
    private(set) var career: Career
    private(set) var fight: Fight
    let store: Store
    /// The rank the last finished fight earned, if it earned one.
    private(set) var promotion: String?
    private var unsaved = 0.0

    init(store: Store) {
        self.store = store
        let save = store.load()
        let career = save?.career ?? Career(seed: UInt64.random(in: 1...UInt64.max))
        self.career = career
        fight = save?.fight ?? career.makeFight()
    }

    var autopilot: Bool {
        get { fight.autopilot }
        set { fight.autopilot = newValue }
    }

    /// Runs the fight forward. A fight that ends is booked and saved on the spot.
    func advance(_ dt: Double) -> [FightEvent] {
        let events = fight.step(dt)
        unsaved += dt
        conclude(events)
        if unsaved > 10 { save() }
        return events
    }

    func strike(_ side: Side) -> [FightEvent] {
        let events = fight.strike(side)
        conclude(events)
        return events
    }

    private func conclude(_ events: [FightEvent]) {
        guard fight.outcome != nil, events.contains(where: { if case .ended = $0 { return true } else { return false } }) else { return }
        promotion = career.record(fight)
        save()
    }

    /// The next fight: the next stage after a win, the same one on a fresh roll after a fall.
    func next() {
        promotion = nil
        let pilot = fight.pilot
        fight = career.makeFight()
        fight.pilot = pilot
        save()
    }

    /// Walks away from this fight for a fresh roll of the same stage.
    func restart() {
        if fight.outcome == nil { career.attempt += 1 }
        next()
    }

    func reset() {
        career = Career(seed: UInt64.random(in: 1...UInt64.max))
        next()
    }

    /// Jumps the career to a stage (the self-test uses it to reach a warlord).
    func jump(to stage: Int) {
        career.stage = max(1, stage)
        career.attempt = 1
        next()
    }

    func save() {
        store.save(SaveGame(career: career, fight: fight))
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
        return Store(directory: base.appendingPathComponent("Ronin", isDirectory: true))
    }

    static func scratch() -> Store {
        Store(directory: FileManager.default.temporaryDirectory.appendingPathComponent("Ronin Self-Test \(UUID().uuidString)", isDirectory: true))
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
        ? (UserDefaults(suiteName: "org.modernagents.Ronin.selftest") ?? .standard)
        : .standard

    enum Size: Int, CaseIterable {
        case small, medium, large

        var width: CGFloat { [340, 420, 520][rawValue] }
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
