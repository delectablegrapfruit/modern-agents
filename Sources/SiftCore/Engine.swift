import Foundation

/// One place that gets cleaned and watched: a user area of the startup disk or
/// a whole volume.
public struct Root: Hashable, Identifiable {
    public let path: String
    public let label: String
    public let volume: Volume?

    public var id: String { path }

    public init(path: String, label: String, volume: Volume? = nil) {
        self.path = Paths.standardize(path)
        self.label = label
        self.volume = volume
    }
}

public enum Phase {
    case scanning(String)
    case removing(done: Int, total: Int)
}

/// Coordinates settings, volumes, watching, sweeping and folder views.
/// Thread-safe; long operations run on the caller's thread.
public final class Engine {
    public let store: SettingsStore
    public let volumes: VolumeSource
    public let log: Log

    /// Areas of the startup disk Finder browses. Everything else on it stays.
    public var userRoots: [String]
    public var persistsSettings = true
    /// No settings file existed when the engine was made.
    public let isFirstLaunch: Bool

    public var onRootsChanged: (([Root]) -> Void)?
    public var onRemoved: ((Outcome, Root) -> Void)?
    /// Items only an administrator can remove, as they are found and cleared.
    public var onLockedChanged: (([Item]) -> Void)?
    /// Removes as root what the app itself could not. Set once the helper is installed.
    public var privilegedRemove: (([Item]) -> Outcome)?

    private let state = DispatchQueue(label: "sift.engine.state")
    /// Live file events: kept short so a rescan never delays them.
    private let events = DispatchQueue(label: "sift.engine.events", qos: .utility)
    private let scans = DispatchQueue(label: "sift.engine.scans", qos: .utility)
    private let fileManager: FileManager
    private var _settings: Settings
    private var _volumes: [Volume] = []
    private var _watches: [String: (root: Root, watcher: Watcher)] = [:]
    private var _running = false
    private var _paused = false
    private var _plan: StorePlan
    private var _safety: Safety
    private var _locked: [String: Item] = [:]

    public init(store: SettingsStore = SettingsStore(),
                volumes: VolumeSource = Volumes.system(),
                log: Log? = nil,
                userRoots: [String]? = nil,
                fileManager: FileManager = .default) {
        self.store = store
        self.volumes = volumes
        self.log = log ?? Log(fileURL: AppPaths.activityFile(in: store.fileURL.deletingLastPathComponent()))
        self.fileManager = fileManager
        self.userRoots = userRoots ?? [NSHomeDirectory(), "/Users/Shared", "/Applications"]
        isFirstLaunch = !store.exists
        var settings = store.load()
        if isFirstLaunch { settings.views = FinderPrefs.read() }
        _settings = settings
        _plan = StorePlan(settings: settings.views, fileManager: fileManager)
        _safety = Safety(keptStores: _plan.storePaths)
    }

    // MARK: - Settings

    public var settings: Settings {
        get { state.sync { _settings } }
        set { update(newValue) }
    }

    public func update(_ settings: Settings) {
        state.sync { _settings = settings }
        if persistsSettings {
            do { try store.save(settings) } catch { log.info("Could not save settings: \(error.localizedDescription)") }
        }
        replan()
    }

    public var plan: StorePlan { state.sync { _plan } }
    public var safety: Safety { state.sync { _safety } }

    /// Recomputes which stores carry views and which paths are therefore kept.
    private func replan() {
        let (settings, volumes) = state.sync { (_settings, _volumes) }
        let plan = StorePlan(settings: settings.views, fileManager: fileManager)
        let safety = Safety(mountPoints: Set(volumes.map(\.mountPoint)), keptStores: plan.storePaths)
        state.sync {
            _plan = plan
            _safety = safety
        }
    }

    public var isPaused: Bool {
        get { state.sync { _paused } }
        set {
            state.sync { _paused = newValue }
            if isRunning { reconfigure() }
        }
    }

    public var isRunning: Bool { state.sync { _running } }
    public var mountedVolumes: [Volume] { state.sync { _volumes } }
    public var lockedItems: [Item] { state.sync { _locked.values.sorted { $0.path < $1.path } } }
    public var activeRoots: [Root] { state.sync { _watches.values.map(\.root).sorted { $0.path < $1.path } } }

    // MARK: - Lifecycle

    public func start() {
        let wasRunning: Bool = state.sync {
            defer { _running = true }
            return _running
        }
        if wasRunning { return }
        refreshVolumes()
        reconfigure()
        // Whatever Finder left in the managed stores last time is put right for its next start.
        scans.async { self.reconcileStores() }
    }

    public func stop() {
        let watchers: [Watcher] = state.sync {
            _running = false
            defer { _watches.removeAll() }
            return _watches.values.map(\.watcher)
        }
        watchers.forEach { $0.stop() }
        log.flush()
        onRootsChanged?([])
    }

    // MARK: - Roots

    @discardableResult
    public func refreshVolumes() -> [Volume] {
        let now = volumes.mounted()
        let before: [Volume] = state.sync { _volumes }
        let changed: Bool = state.sync {
            defer { _volumes = now }
            return Set(now.map(\.id)) != Set(_volumes.map(\.id))
        }
        if changed {
            let known = Set(before.map(\.mountPoint))
            replan()
            if isRunning { reconfigure() }
            // A disk that just arrived has stores Finder has not read yet.
            let fresh = now.map(\.mountPoint).filter { !known.contains($0) }
            if !fresh.isEmpty { scans.async { self.reconcileStores(under: fresh) } }
        }
        return now
    }

    /// Everything that gets cleaned: the startup disk's user areas and every
    /// cleanable volume.
    public func roots() -> [Root] {
        let volumes = mountedVolumes
        let system = Safety()
        var out: [Root] = []
        for path in userRoots.map(Paths.standardize) where Files.isDirectory(path) && !system.isProtected(path) {
            out.append(Root(path: path, label: "Startup disk"))
        }
        for volume in volumes where volume.isCleanable(fileManager: fileManager) {
            out.append(Root(path: volume.mountPoint, label: volume.name, volume: volume))
        }
        var seen = Set<String>()
        return out.filter { root in
            guard !seen.contains(where: { Paths.isInside(root.path, $0) }) else { return false }
            seen.insert(root.path)
            return true
        }
    }

    // MARK: - Watching

    /// Watching reacts to what the system reports and never walks a disk on its
    /// own: junk that was already there waits for a sweep.
    private func reconfigure() {
        let desired = isPaused ? [] : roots()
        var toStart: [(Root, Watcher)] = []
        var toStop: [Watcher] = []
        state.sync {
            guard _running else { return }
            let wanted = Dictionary(desired.map { ($0.path, $0) }, uniquingKeysWith: { a, _ in a })
            for (path, entry) in _watches where wanted[path] == nil {
                toStop.append(entry.watcher)
                _watches[path] = nil
            }
            let protected = Safety().protectedPrefixes
            for root in desired where _watches[root.path] == nil {
                let excluded = protected.filter { Paths.isInside($0, root.path) && $0 != root.path }
                let watcher = Watchers.make(root: root.path, excluding: excluded)
                _watches[root.path] = (root, watcher)
                toStart.append((root, watcher))
            }
        }
        toStop.forEach { $0.stop() }
        for (root, watcher) in toStart {
            watcher.onChange = { [weak self] change in
                guard let self else { return }
                switch change {
                case .subtree: self.scans.async { self.handle(change, root: root) }
                case .paths: self.events.async { self.handle(change, root: root) }
                }
            }
            watcher.start()
        }
        onRootsChanged?(activeRoots)
    }

    private func handle(_ change: Change, root: Root) {
        let live: Bool = state.sync { !_paused && _watches[root.path] != nil }
        guard live else { return }
        let outcome: Outcome
        switch change {
        case .subtree(let directory):
            let folder = Paths.standardize(directory)
            guard Paths.isInside(folder, root.path) else { return }
            let scanner = JunkScanner(safety: safety)
            guard let items = try? scanner.scan(root: folder, depth: Watchers.subtreeDepth), !items.isEmpty else { return }
            outcome = remove(items, within: [root.path], source: root.label, quiet: true)
        case .paths(let paths):
            let items = JunkScanner(safety: safety).items(fromChangedPaths: paths, root: root.path)
            guard !items.isEmpty else { return }
            outcome = remove(items, within: [root.path], source: root.label, quiet: true)
        }
        if !outcome.removed.isEmpty { onRemoved?(outcome, root) }
    }

    // MARK: - Folder stores

    /// Writes every store the views need and removes those no longer needed.
    /// Called with Finder quit, so it cannot overwrite them on the way out.
    public func applyStores(previous: StorePlan) throws {
        let plan = self.plan
        plan.retire(from: previous, fileManager: fileManager)
        try plan.writeAll()
    }

    /// Puts the managed stores back to what the views say. Finder keeps a
    /// store in memory while it runs and writes its own copy back, so this is
    /// done when Finder has quit (and when Sift starts, and when a disk
    /// arrives), never on every write Finder makes: the file only matters the
    /// next time Finder starts.
    public func reconcileStores(under roots: [String]? = nil) {
        let plan = self.plan
        for directory in plan.stores.keys.sorted() {
            if let roots, !roots.contains(where: { Paths.isInside(directory, $0) }) { continue }
            do {
                if try plan.write(directory: directory) { log.info("Kept the view of " + Paths.display(directory), path: directory) }
            } catch {
                log.info("Could not keep the view of \(Paths.display(directory)): \(error.localizedDescription)", path: directory)
            }
        }
    }

    // MARK: - Scanning and removing

    public func scan(roots: [Root], progress: ((Phase) -> Void)? = nil,
                     isCancelled: () -> Bool = { false }) throws -> [Item] {
        let scanner = JunkScanner(safety: safety)
        var seen = Set<String>()
        var items: [Item] = []
        for root in roots {
            let found = try scanner.scan(root: root.path, progress: { progress?(.scanning($0)) }, isCancelled: isCancelled)
            for item in found where seen.insert(item.path).inserted { items.append(item) }
        }
        return items
    }

    /// Deletes `items`, refusing anything outside `roots`, and records the outcome.
    /// Quiet removals do not repeat complaints about items already known to be locked.
    public func remove(_ items: [Item], within roots: [String], dryRun: Bool = false, source: String,
                       progress: ((Phase) -> Void)? = nil, isCancelled: () -> Bool = { false },
                       quiet: Bool = false) -> Outcome {
        let remover = Remover(safety: safety, dryRun: dryRun, fileManager: fileManager)
        var outcome = remover.remove(items, within: roots, progress: { progress?(.removing(done: $0, total: $1)) },
                                     isCancelled: isCancelled)
        // What the user may not delete, the helper may, without a word.
        if !dryRun, let privileged = privilegedRemove, !outcome.locked.isEmpty {
            let extra = privileged(outcome.locked)
            let handled = Set((extra.removed + extra.failed.map(\.item) + extra.skipped.map(\.item)).map(\.path))
            outcome.failed.removeAll { handled.contains($0.item.path) }
            outcome.removed += extra.removed
            outcome.failed += extra.failed
            outcome.skipped += extra.skipped
        }
        if !dryRun { noteLocked(outcome) }
        log.record(outcome, quiet: quiet)
        return outcome
    }

    public func sweep(roots: [Root], dryRun: Bool = false, quiet: Bool = false,
                      progress: ((Phase) -> Void)? = nil,
                      isCancelled: () -> Bool = { false }) throws -> Outcome {
        let items = try scan(roots: roots, progress: progress, isCancelled: isCancelled)
        let source = roots.count == 1 ? roots[0].label : "sweep"
        return remove(items, within: roots.map(\.path), dryRun: dryRun, source: source,
                      progress: progress, isCancelled: isCancelled, quiet: quiet)
    }

    private func noteLocked(_ outcome: Outcome) {
        let previous: Set<String> = state.sync { Set(_locked.keys) }
        let candidates: [String] = state.sync {
            for item in outcome.removed { _locked[item.path] = nil }
            for item in outcome.locked { _locked[item.path] = item }
            return Array(_locked.keys)
        }
        // Looked at outside the lock: a slow disk must not hold everything else.
        let gone = candidates.filter { Files.info($0) == nil }
        let current: Set<String> = state.sync {
            for path in gone { _locked[path] = nil }
            return Set(_locked.keys)
        }
        if current != previous { onLockedChanged?(lockedItems) }
    }

    /// Tries the items only an administrator could remove again, now with the helper.
    public func retryLocked() {
        let items = lockedItems
        guard !items.isEmpty else { return }
        _ = remove(items, within: roots().map(\.path), source: "administrator")
    }
}
