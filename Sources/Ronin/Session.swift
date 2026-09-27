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

    /// The run's score so far: every stage of it, this one included. After a fall, the run that just ended.
    var runScore: Int {
        switch fight.outcome {
        case nil:
            return career.run.score + fight.score
        case .victory?:
            // Booked already: the run holds this stage's score (a save from before runs were kept may not).
            return max(career.run.score, fight.score)
        case .defeat?:
            guard let run = career.lastRun, run.stage == fight.stage, run.score >= fight.score else { return fight.score }
            return run.score
        }
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

    /// The next fight: the next stage after a win, stage 1 after a fall (in an endless run, the run's first stage).
    func next() {
        promotion = nil
        let autopilot = fight.autopilot
        fight = career.makeFight()
        fight.autopilot = autopilot
        save()
    }

    /// Walks away from this fight for a fresh roll of the same stage. The hearts it cost stay lost and its kills
    /// count, so walking away is never better than playing on. A finished fight goes on, as its card does.
    func restart() {
        if fight.outcome == nil {
            career.abandon(fight)
            career.attempt += 1
        }
        next()
    }

    /// Switches the difficulty, to the mode's own campaign. The fight in progress is left as a restart leaves it (its
    /// wounds kept for when you come back, its kills counted), and an endless run is left with its record kept.
    func choose(_ mode: Mode) {
        guard mode != career.mode else { return }
        career.abandon(fight)
        career.choose(mode)
        next()
    }

    func reset() {
        let mode = career.mode
        career = Career(seed: UInt64.random(in: 1...UInt64.max))
        career.choose(mode)
        next()
    }

    /// Starts an endless run from an unlocked stage. The fight in progress is left as a restart leaves it.
    func startEndless(at stage: Int) {
        career.abandon(fight)
        career.startEndless(at: stage)
        next()
    }

    /// Back to the campaign, where it was left. The run's fight is left as a restart leaves it, and the run is kept
    /// if it was a record.
    func leaveEndless() {
        guard career.isEndless else { return }
        career.abandon(fight)
        career.leaveEndless()
        next()
    }

    /// Jumps the career to a stage (the self-test uses it to reach a warlord). The campaign's run starts there.
    func jump(to stage: Int) {
        career.stage = max(1, stage)
        career.runs[career.mode.rawValue] = nil
        career.attempt = 1
        next()
    }

    func save() {
        store.save(SaveGame(career: career, fight: fight))
        unsaved = 0
    }
}

/// The save file: JSON in Application Support. A save this build cannot read is never written over.
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

    /// The saved career and fight (see `SaveGame.load`: an older save keeps its career). Nil when there is no save,
    /// or when not even its career can be read: then the file is set aside, beside it, before a new career can be
    /// saved over it.
    func load() -> SaveGame? {
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        do {
            let data = try Data(contentsOf: url)
            if let save = SaveGame.load(data) { return save }
            NSLog("Ronin: the save at %@ cannot be read", url.path)
        } catch {
            NSLog("Ronin: the save at %@ cannot be read: %@", url.path, String(describing: error))
        }
        let stamp = ISO8601DateFormatter().string(from: Date()).replacingOccurrences(of: ":", with: "-")
        let aside = url.deletingLastPathComponent().appendingPathComponent("save.unreadable-\(stamp).json")
        do {
            try FileManager.default.moveItem(at: url, to: aside)
            NSLog("Ronin: set it aside as %@ and started a new career", aside.lastPathComponent)
        } catch {
            NSLog("Ronin: could not set the save aside: %@", String(describing: error))
        }
        return nil
    }

    func save(_ game: SaveGame) {
        do {
            try JSONEncoder().encode(game).write(to: url, options: .atomic)
        } catch {
            NSLog("Ronin: could not save: %@", String(describing: error))
        }
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

    /// Medium until you choose.
    static var size: Size {
        get { (defaults.object(forKey: "size") as? Int).flatMap(Size.init(rawValue:)) ?? .medium }
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

    /// The reach marks and the mouse-button hints on the lane's floor. Off unless you turn them on.
    static var floorHints: Bool {
        get { defaults.object(forKey: "floorHints") as? Bool ?? false }
        set { defaults.set(newValue, forKey: "floorHints") }
    }

    /// The mouse buttons are learnt: a foe cut down on each side. Until then the lane shows which button cuts which
    /// way: on a new career's first card, after a cut the wrong way with a foe in reach the other way, and (if Floor
    /// Hints is on) on the floor. Turning Floor Hints on teaches them again.
    static var hintShown: Bool {
        get { defaults.bool(forKey: "hintShown") }
        set { defaults.set(newValue, forKey: "hintShown") }
    }

    /// Calmer effects: less shake, no zoom punches, softer full-lane flashes, lightning a slow glow. The blood and the
    /// dead are untouched. Follows the system's Reduce Motion until chosen in the menu (choosing what the system says
    /// follows it again).
    @MainActor static var reduceMotion: Bool {
        get { defaults.object(forKey: "reduceMotion") as? Bool ?? NSWorkspace.shared.accessibilityDisplayShouldReduceMotion }
        set {
            if newValue == NSWorkspace.shared.accessibilityDisplayShouldReduceMotion {
                defaults.removeObject(forKey: "reduceMotion")
            } else {
                defaults.set(newValue, forKey: "reduceMotion")
            }
        }
    }

    /// Which of `Shortcut.all` shows and hides the panel (the first that registers, from this one on).
    static var shortcut: Int {
        get { defaults.integer(forKey: "shortcut") }
        set { defaults.set(newValue, forKey: "shortcut") }
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
