import Foundation

public enum ActivityKind: String, Codable, Hashable, CaseIterable {
    case removed
    case sweep
    case volume
    case prevention
    case error
    case info
}

public struct ActivityEntry: Codable, Identifiable, Hashable {
    public var id: UUID
    public var date: Date
    public var kind: ActivityKind
    public var message: String
    public var path: String?
    public var ruleName: String?
    public var bytes: Int64?
    public var count: Int?
    public var dryRun: Bool

    public init(id: UUID = UUID(), date: Date = Date(), kind: ActivityKind, message: String, path: String? = nil,
                ruleName: String? = nil, bytes: Int64? = nil, count: Int? = nil, dryRun: Bool = false) {
        self.id = id
        self.date = date
        self.kind = kind
        self.message = message
        self.path = path
        self.ruleName = ruleName
        self.bytes = bytes
        self.count = count
        self.dryRun = dryRun
    }
}

public struct ActivityStatistics: Hashable {
    public var itemsRemoved: Int = 0
    public var bytesFreed: Int64 = 0
    public var lastRemoval: Date?

    public init() {}
}

/// Append-only JSON-lines record of what was removed and why.
public final class ActivityLog {
    public let fileURL: URL?
    public let maxInMemory: Int
    private let lock = NSLock()
    private var _entries: [ActivityEntry] = []
    private var _statistics = ActivityStatistics()
    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        e.outputFormatting = [.sortedKeys]
        return e
    }()

    /// Called off the main thread whenever an entry is appended.
    public var onAppend: ((ActivityEntry) -> Void)?

    public init(fileURL: URL?, maxInMemory: Int = 2000) {
        self.fileURL = fileURL
        self.maxInMemory = maxInMemory
        loadExisting()
    }

    public var entries: [ActivityEntry] {
        lock.lock(); defer { lock.unlock() }
        return _entries
    }

    public var statistics: ActivityStatistics {
        lock.lock(); defer { lock.unlock() }
        return _statistics
    }

    public func recent(_ limit: Int) -> [ActivityEntry] {
        lock.lock(); defer { lock.unlock() }
        return Array(_entries.suffix(limit).reversed())
    }

    public func append(_ entry: ActivityEntry) {
        lock.lock()
        _entries.append(entry)
        if _entries.count > maxInMemory { _entries.removeFirst(_entries.count - maxInMemory) }
        if entry.kind == .removed && !entry.dryRun {
            _statistics.itemsRemoved += 1
            _statistics.bytesFreed += entry.bytes ?? 0
            _statistics.lastRemoval = entry.date
        }
        lock.unlock()
        writeLine(entry)
        onAppend?(entry)
    }

    public func record(_ kind: ActivityKind, _ message: String, path: String? = nil, ruleName: String? = nil,
                       bytes: Int64? = nil, count: Int? = nil, dryRun: Bool = false) {
        append(ActivityEntry(kind: kind, message: message, path: path, ruleName: ruleName,
                             bytes: bytes, count: count, dryRun: dryRun))
    }

    public func recordResult(_ result: SweepResult, source: String) {
        for item in result.removed {
            record(.removed, (result.dryRun ? "Would remove " : "Removed ") + item.name,
                   path: item.path, ruleName: item.ruleName, bytes: item.size, dryRun: result.dryRun)
        }
        for failure in result.failed {
            record(.error, "Could not remove \(failure.item.name): \(failure.reason)",
                   path: failure.item.path, ruleName: failure.item.ruleName)
        }
        if !result.removed.isEmpty || !result.failed.isEmpty {
            let verb = result.dryRun ? "Found" : "Removed"
            record(.sweep, "\(verb) \(result.removed.count) item\(result.removed.count == 1 ? "" : "s") · \(source)",
                   bytes: result.bytesFreed, count: result.removed.count, dryRun: result.dryRun)
        }
    }

    public func clear() {
        lock.lock()
        _entries.removeAll()
        _statistics = ActivityStatistics()
        lock.unlock()
        if let fileURL {
            try? FileManager.default.removeItem(at: fileURL)
        }
    }

    // MARK: Persistence

    private func writeLine(_ entry: ActivityEntry) {
        guard let fileURL, var data = try? encoder.encode(entry) else { return }
        data.append(0x0A)
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

    private func loadExisting() {
        guard let fileURL, let data = try? Data(contentsOf: fileURL), let text = String(data: data, encoding: .utf8) else { return }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        var loaded: [ActivityEntry] = []
        var stats = ActivityStatistics()
        for line in text.split(separator: "\n", omittingEmptySubsequences: true) {
            guard let entry = try? decoder.decode(ActivityEntry.self, from: Data(line.utf8)) else { continue }
            loaded.append(entry)
            if entry.kind == .removed && !entry.dryRun {
                stats.itemsRemoved += 1
                stats.bytesFreed += entry.bytes ?? 0
                stats.lastRemoval = entry.date
            }
        }
        if loaded.count > maxInMemory { loaded.removeFirst(loaded.count - maxInMemory) }
        lock.lock()
        _entries = loaded
        _statistics = stats
        lock.unlock()
    }
}
