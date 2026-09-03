import Foundation
#if canImport(Darwin)
import Darwin
#endif

public struct SweepOptions {
    public var mode: DeletionMode
    public var dryRun: Bool
    /// When the Trash is unavailable (network shares, some removable media) delete outright instead.
    public var fallbackToPermanent: Bool

    public init(mode: DeletionMode = .permanent, dryRun: Bool = false, fallbackToPermanent: Bool = true) {
        self.mode = mode
        self.dryRun = dryRun
        self.fallbackToPermanent = fallbackToPermanent
    }
}

public struct SweepFailure: Hashable, Codable {
    public let item: JunkItem
    public let reason: String
}

public struct SweepResult: Codable, Hashable {
    public var removed: [JunkItem] = []
    public var failed: [SweepFailure] = []
    public var skipped: [SweepFailure] = []
    public var bytesFreed: Int64 = 0
    public var startedAt: Date = Date()
    public var finishedAt: Date = Date()
    public var dryRun = false
    public var rootsScanned: [String] = []

    public init() {}

    public var removedCount: Int { removed.count }
    public var duration: TimeInterval { finishedAt.timeIntervalSince(startedAt) }
    public var isEmpty: Bool { removed.isEmpty && failed.isEmpty && skipped.isEmpty }

    public mutating func merge(_ other: SweepResult) {
        removed += other.removed
        failed += other.failed
        skipped += other.skipped
        bytesFreed += other.bytesFreed
        rootsScanned += other.rootsScanned
        finishedAt = max(finishedAt, other.finishedAt)
    }
}

public enum SweepError: Error, LocalizedError {
    case trashUnavailable(String)

    public var errorDescription: String? {
        switch self {
        case .trashUnavailable(let why): return why
        }
    }
}

/// Deletes previously identified items, re-checking safety for each one.
public final class Sweeper {
    public let options: SweepOptions
    public let safety: SafetyPolicy
    private let fileManager: FileManager

    public init(options: SweepOptions, safety: SafetyPolicy, fileManager: FileManager = .default) {
        self.options = options
        self.safety = safety
        self.fileManager = fileManager
    }

    public func remove(_ items: [JunkItem],
                       within roots: [String]? = nil,
                       progress: ((Int, Int, JunkItem) -> Void)? = nil,
                       isCancelled: () -> Bool = { false }) -> SweepResult {
        var result = SweepResult()
        result.dryRun = options.dryRun
        result.startedAt = Date()
        result.rootsScanned = roots ?? []
        let total = items.count
        for (index, item) in items.enumerated() {
            if isCancelled() { break }
            progress?(index, total, item)
            switch safety.validate(path: item.path, within: roots) {
            case .denied(let reason):
                result.skipped.append(SweepFailure(item: item, reason: reason))
                continue
            case .allowed:
                break
            }
            guard FileStats.info(item.path) != nil else {
                result.skipped.append(SweepFailure(item: item, reason: "Already gone"))
                continue
            }
            do {
                try delete(item)
                result.removed.append(item)
                result.bytesFreed += item.size
            } catch {
                result.failed.append(SweepFailure(item: item, reason: error.localizedDescription))
            }
        }
        result.finishedAt = Date()
        return result
    }

    private func delete(_ item: JunkItem) throws {
        if options.dryRun { return }
        switch options.mode {
        case .permanent:
            try removePermanently(item.path)
        case .trash:
            #if os(macOS)
            do {
                try fileManager.trashItem(at: URL(fileURLWithPath: item.path), resultingItemURL: nil)
            } catch {
                guard options.fallbackToPermanent else { throw error }
                try removePermanently(item.path)
            }
            #else
            guard options.fallbackToPermanent else { throw SweepError.trashUnavailable("Trash is not available on this platform") }
            try removePermanently(item.path)
            #endif
        }
    }

    private func removePermanently(_ path: String) throws {
        do {
            try fileManager.removeItem(atPath: path)
        } catch {
            #if os(macOS)
            // Locked (uchg) items refuse deletion until the flag is cleared.
            if chflags(path, 0) == 0 {
                try fileManager.removeItem(atPath: path)
                return
            }
            #endif
            throw error
        }
    }
}
