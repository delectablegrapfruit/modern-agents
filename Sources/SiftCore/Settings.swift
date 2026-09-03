import Foundation

/// Everything the app remembers: how folders look. Nothing else needs a setting.
public struct Settings: Hashable, Codable {
    public var views = ViewSettings()

    public init() {}

    enum CodingKeys: String, CodingKey { case views }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        views = (try? c.decodeIfPresent(ViewSettings.self, forKey: .views)) ?? ViewSettings()
    }
}

public enum AppPaths {
    public static let appName = "Sift"

    /// `~/Library/Application Support/Sift` on macOS, `~/.config/sift` elsewhere.
    public static func supportDirectory(fileManager: FileManager = .default) -> URL {
        #if os(macOS)
        let base = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent("Library/Application Support")
        return base.appendingPathComponent(appName, isDirectory: true)
        #else
        if let xdg = ProcessInfo.processInfo.environment["XDG_CONFIG_HOME"], !xdg.isEmpty {
            return URL(fileURLWithPath: xdg).appendingPathComponent("sift", isDirectory: true)
        }
        return URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent(".config/sift", isDirectory: true)
        #endif
    }

    public static func settingsFile(in directory: URL? = nil) -> URL {
        (directory ?? supportDirectory()).appendingPathComponent("settings.json")
    }

    public static func activityFile(in directory: URL? = nil) -> URL {
        (directory ?? supportDirectory()).appendingPathComponent("activity.jsonl")
    }
}

public final class SettingsStore {
    public let fileURL: URL

    public init(fileURL: URL = AppPaths.settingsFile()) {
        self.fileURL = fileURL
    }

    public var exists: Bool { FileManager.default.fileExists(atPath: fileURL.path) }

    public func load() -> Settings {
        guard let data = try? Data(contentsOf: fileURL) else { return Settings() }
        return (try? JSONDecoder().decode(Settings.self, from: data)) ?? Settings()
    }

    public func save(_ settings: Settings) throws {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        try FileManager.default.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        try encoder.encode(settings).write(to: fileURL, options: .atomic)
    }
}

// MARK: - Activity

public struct Entry: Codable, Identifiable, Hashable {
    public enum Kind: String, Codable, Hashable {
        case removed, failed, info
    }

    public var id: UUID
    public var date: Date
    public var kind: Kind
    public var text: String
    public var path: String?
    public var bytes: Int64?

    public init(id: UUID = UUID(), date: Date = Date(), kind: Kind, text: String, path: String? = nil, bytes: Int64? = nil) {
        self.id = id
        self.date = date
        self.kind = kind
        self.text = text
        self.path = path
        self.bytes = bytes
    }
}

public struct Statistics: Hashable {
    public var removed = 0
    public var bytes: Int64 = 0

    public init() {}
}

/// Append-only record of what was removed and why, kept as JSON lines.
public final class Log {
    public let fileURL: URL?
    public let keep: Int
    private let lock = NSLock()
    private var _entries: [Entry] = []
    private var _statistics = Statistics()
    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        e.outputFormatting = [.sortedKeys]
        return e
    }()

    /// Called off the main thread whenever an entry is added.
    public var onAppend: ((Entry) -> Void)?
    private let io = DispatchQueue(label: "sift.log.io", qos: .utility)
    private var pending = Data()
    private var flushScheduled = false

    public init(fileURL: URL?, keep: Int = 500) {
        self.fileURL = fileURL
        self.keep = keep
        load()
    }

    public var entries: [Entry] {
        lock.lock(); defer { lock.unlock() }
        return _entries
    }

    public var statistics: Statistics {
        lock.lock(); defer { lock.unlock() }
        return _statistics
    }

    /// Newest first.
    public func recent(_ limit: Int) -> [Entry] {
        lock.lock(); defer { lock.unlock() }
        return Array(_entries.suffix(limit).reversed())
    }

    public func append(_ entry: Entry) {
        lock.lock()
        _entries.append(entry)
        if _entries.count > keep { _entries.removeFirst(_entries.count - keep) }
        if entry.kind == .removed {
            _statistics.removed += 1
            _statistics.bytes += entry.bytes ?? 0
        }
        lock.unlock()
        write(entry)
        onAppend?(entry)
    }

    public func info(_ text: String, path: String? = nil) {
        append(Entry(kind: .info, text: text, path: path))
    }

    /// Removals are always recorded; failures only when not `quiet`, so background
    /// rescans do not repeat the same complaint. Locked items are shown, not logged.
    public func record(_ outcome: Outcome, quiet: Bool = false) {
        guard !outcome.dryRun else { return }
        for item in outcome.removed {
            append(Entry(kind: .removed, text: "Removed " + item.name, path: item.path, bytes: item.size))
        }
        for failure in outcome.failed where !quiet && !failure.needsAdministrator {
            append(Entry(kind: .failed, text: "Could not remove \(failure.item.name): \(failure.reason)", path: failure.item.path))
        }
    }

    /// Lines are gathered and written once a second, so a sweep that removes
    /// thousands of files does not open the log thousands of times.
    private func write(_ entry: Entry) {
        guard fileURL != nil, var encoded = try? encoder.encode(entry) else { return }
        encoded.append(0x0A)
        let line = encoded
        io.async {
            self.pending.append(line)
            guard !self.flushScheduled else { return }
            self.flushScheduled = true
            self.io.asyncAfter(deadline: .now() + 1) { self.flushPending() }
        }
    }

    /// Writes everything gathered so far. Called when the engine stops.
    public func flush() {
        io.sync { flushPending() }
    }

    private func flushPending() {
        flushScheduled = false
        guard let fileURL, !pending.isEmpty else { return }
        let data = pending
        pending = Data()
        let fm = FileManager.default
        do {
            if !fm.fileExists(atPath: fileURL.path) {
                try fm.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
                try data.write(to: fileURL, options: .atomic)
                return
            }
            let handle = try FileHandle(forWritingTo: fileURL)
            defer { try? handle.close() }
            try handle.seekToEnd()
            try handle.write(contentsOf: data)
        } catch {
            // Logging must never take the engine down.
        }
    }

    private func load() {
        guard let fileURL, let data = try? Data(contentsOf: fileURL), let text = String(data: data, encoding: .utf8) else { return }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        var loaded: [Entry] = []
        var stats = Statistics()
        for line in text.split(separator: "\n", omittingEmptySubsequences: true) {
            guard let entry = try? decoder.decode(Entry.self, from: Data(line.utf8)) else { continue }
            loaded.append(entry)
            if entry.kind == .removed {
                stats.removed += 1
                stats.bytes += entry.bytes ?? 0
            }
        }
        if loaded.count > keep { loaded.removeFirst(loaded.count - keep) }
        lock.lock()
        _entries = loaded
        _statistics = stats
        lock.unlock()
    }
}
