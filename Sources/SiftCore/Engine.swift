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
    /// The roots where a sweep is due, whenever that changes.
    public var onSweepDueChanged: (([Due]) -> Void)?
    /// Removes as root what the app itself could not. Set once the helper is installed.
    public var privilegedRemove: (([Item]) -> Outcome)?

    private let state = DispatchQueue(label: "sift.engine.state")
    /// Live file events: kept short so a rescan never delays them.
    private let events = DispatchQueue(label: "sift.engine.events", qos: .utility)
    private let scans = DispatchQueue(label: "sift.engine.scans", qos: .utility)
    /// Every write of a managed `.DS_Store` goes through here, one at a time.
    private let stores = DispatchQueue(label: "sift.engine.stores", qos: .utility)
    private let fileManager: FileManager
    private var _settings: Settings
    private var _volumes: [Volume] = []
    private var _watches: [String: (root: Root, watcher: Watcher)] = [:]
    private var _running = false
    private var _paused = false
    private var _plan: StorePlan
    private var _safety: Safety
    private var _locked: [String: Item] = [:]
    /// When each root was last unwatched, and why. Junk from before that
    /// moment is only found by a sweep.
    private var _unwatched: [String: Unwatched] = [:]
    private var _everWatched: Set<String> = []
    private var _stoppedByPause: Set<String> = []
    private var _lastDue: [Due] = []

    public init(store: SettingsStore = SettingsStore(),
                volumes: VolumeSource = Volumes.system(),
                log: Log? = nil,
                userRoots: [String]? = nil,
                fileManager: FileManager = .default) {
        self.store = store
        self.volumes = volumes
        self.log = log ?? Log(fileURL: AppPaths.activityFile(in: store.fileURL.deletingLastPathComponent()))
        self.fileManager = fileManager
        self.userRoots = userRoots ?? [NSHomeDirectory(), "/Users/Shared", "/Applications"] + Safety.cloudFolders()
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
        modify { $0 = settings }
    }

    /// Changes the settings in place, under the lock, so concurrent changes to
    /// different parts (views, sweeps, disks) never overwrite one another.
    public func modify(_ change: (inout Settings) -> Void) {
        let (settings, watchedChanged): (Settings, Bool) = state.sync {
            let before = _settings.excludedVolumes
            change(&_settings)
            return (_settings, _settings.excludedVolumes != before)
        }
        if persistsSettings {
            do { try store.save(settings) } catch { log.info("Could not save settings: \(error.localizedDescription)") }
        }
        replan()
        if watchedChanged, isRunning { reconfigure() }
    }

    /// The key under which the startup disk's user areas are excluded.
    public static let startupKey = "startup"

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
            state.sync {
                _paused = newValue
                // From now on nothing is watched: a sweep is due once resumed.
                if newValue { for path in _watches.keys { _unwatched[path] = Unwatched(since: Date(), reason: .paused) } }
            }
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
        // Work under way finishes before the engine is gone.
        events.sync {}
        scans.sync {}
        stores.sync {}
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
            return Set(now) != Set(_volumes)
        }
        if changed {
            let known = Set(before.map(\.mountPoint))
            replan()
            if isRunning { reconfigure() }
            // A disk that just arrived has stores Finder has not read yet (the
            // first refresh is the start: `start` reconciles everything once).
            let fresh = now.map(\.mountPoint).filter { !known.contains($0) }
            if !before.isEmpty, !fresh.isEmpty {
                scans.async {
                    self.retireForgotten(under: fresh)
                    self.reconcileStores(under: fresh)
                }
            }
        }
        return now
    }

    /// Everything that gets cleaned: the startup disk's user areas and every
    /// cleanable volume.
    public func roots() -> [Root] {
        let (volumes, excluded) = state.sync { (_volumes, _settings.excludedVolumes) }
        let system = Safety()
        var out: [Root] = []
        if !excluded.contains(Engine.startupKey) {
            for path in userRoots.map(Paths.standardize) where Files.isDirectory(path) && !system.isProtected(path) {
                out.append(Root(path: path, label: "Startup disk"))
            }
        }
        for volume in volumes where volume.isCleanable(fileManager: fileManager) && !excluded.contains(volume.id) {
            out.append(Root(path: volume.mountPoint, label: volume.name, volume: volume))
        }
        // A root inside another is redundant, unless the outer one does not enter
        // it (the cloud folders under the home Library).
        let exceptions = system.exceptions
        var seen = Set<String>()
        return out.filter { root in
            let covered = seen.contains { outer in
                Paths.isInside(root.path, outer) && !exceptions.contains { Paths.isInside(root.path, $0) && !Paths.isInside(outer, $0) }
            }
            guard !covered else { return false }
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
                if _paused { _stoppedByPause.insert(path) }
            }
            let protected = Safety().protectedPrefixes
            for root in desired where _watches[root.path] == nil {
                let excluded = protected.filter { Paths.isInside($0, root.path) && $0 != root.path }
                let watcher = Watchers.make(root: root.path, excluding: excluded)
                _watches[root.path] = (root, watcher)
                let reason: Unwatched.Reason = _stoppedByPause.contains(root.path) ? .paused
                    : (_everWatched.contains(root.path) ? .connected : .started)
                _unwatched[root.path] = Unwatched(since: Date(), reason: reason)
                _everWatched.insert(root.path)
                _stoppedByPause.remove(root.path)
                toStart.append((root, watcher))
            }
        }
        toStop.forEach { $0.stop() }
        noteSweepDue()
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
            let scanner = JunkScanner(safety: safety)
            // The folder is looked at only where the walk itself would go.
            guard scanner.isReachable(folder, from: root.path) else { return }
            if Watchers.subtreeDepth < Int.max {
                // Only the top of it is looked at; what lies deeper waits for a sweep.
                state.sync { _unwatched[root.path] = Unwatched(since: Date(), reason: .missed) }
                noteSweepDue()
            }
            guard let items = try? scanner.scan(root: folder, depth: Watchers.subtreeDepth, liveOnly: true, measured: false),
                  !items.isEmpty else { return }
            outcome = remove(items, within: [root.path], source: root.label, quiet: true)
        case .paths(let paths):
            let items = JunkScanner(safety: safety).items(fromChangedPaths: paths, root: root.path)
            guard !items.isEmpty else { return }
            outcome = remove(items, within: [root.path], source: root.label, quiet: true)
        }
        if !outcome.removed.isEmpty { onRemoved?(outcome, root) }
    }

    // MARK: - Sweeps

    /// A moment from which a root's junk is not caught as it appears.
    public struct Unwatched: Hashable {
        public enum Reason: Hashable {
            /// Sift started: what was there before is unknown.
            case started
            /// The disk was connected (or came back).
            case connected
            /// Nothing was watched while paused.
            case paused
            /// The system reported changes it could not name.
            case missed
        }

        public let since: Date
        public let reason: Reason
    }

    /// A root where a sweep is due, and why.
    public struct Due: Hashable {
        public let root: Root
        public let reason: Unwatched.Reason
    }

    /// Roots where junk could have arrived unwatched since the last sweep.
    /// Nothing is read from disk to know this.
    public var sweepDue: [Due] {
        let (sweeps, unwatched) = state.sync { (_settings.sweeps, _unwatched) }
        return roots().compactMap { root in
            guard let entry = unwatched[root.path] else { return nil }
            if let last = sweeps[root.path], last > entry.since { return nil }
            return Due(root: root, reason: entry.reason)
        }
    }

    private func noteSweepDue() {
        let due = sweepDue
        let changed: Bool = state.sync {
            defer { _lastDue = due }
            return due != _lastDue
        }
        if changed { onSweepDueChanged?(due) }
    }

    /// A sweep went through these roots in full.
    public func noteSwept(_ roots: [Root], at date: Date = Date()) {
        modify { settings in
            for root in roots { settings.sweeps[root.path] = date }
        }
        noteSweepDue()
    }

    // MARK: - Folder stores

    /// Writes every store the views need and removes those no longer needed,
    /// remembering which directories carry one. Called with Finder quit, so it
    /// cannot overwrite them on the way out.
    public func applyStores(previous: StorePlan) throws {
        try stores.sync {
            let plan = self.plan
            plan.retire(from: previous, fileManager: fileManager)
            retireForgotten(under: nil, plan: plan)
            try plan.writeAll()
            modify { settings in
                // Directories on disks that are away stay remembered until they are back.
                let away = settings.managedStores.filter { plan.stores[$0] == nil && !Files.isDirectory(Paths.parent(of: $0)) }
                settings.managedStores = Set(plan.stores.keys).union(away)
            }
        }
    }

    /// Removes remembered stores that are no longer planned, where the disk is
    /// present (all of them, or only under `roots`), and forgets them.
    private func retireForgotten(under roots: [String]?, plan: StorePlan? = nil) {
        let plan = plan ?? self.plan
        let remembered: Set<String> = state.sync { _settings.managedStores }
        var forgotten: Set<String> = []
        for directory in remembered where plan.stores[directory] == nil {
            if let roots, !roots.contains(where: { Paths.isInside(directory, $0) }) { continue }
            guard Files.isDirectory(Paths.parent(of: directory)) else { continue }
            try? fileManager.removeItem(atPath: directory + "/.DS_Store")
            forgotten.insert(directory)
        }
        if !forgotten.isEmpty { modify { $0.managedStores.subtract(forgotten) } }
    }

    /// Puts the managed stores back to what the views say. Finder keeps a
    /// store in memory while it runs and writes its own copy back, so this is
    /// done when Finder has quit (and when Sift starts, and when a disk
    /// arrives), never on every write Finder makes: the file only matters the
    /// next time Finder starts. One that belongs to root is handed to the helper.
    public func reconcileStores(under roots: [String]? = nil) {
        stores.sync {
            let plan = self.plan
            for directory in plan.stores.keys.sorted() {
                if let roots, !roots.contains(where: { Paths.isInside(directory, $0) }) { continue }
                do {
                    if try plan.write(directory: directory) { log.info("Kept the view of " + Paths.display(directory), path: directory) }
                } catch {
                    let store = directory + "/.DS_Store"
                    if Errors.isPermission(error), let privileged = privilegedRemove,
                       let info = Files.info(store), !info.isDirectory,
                       !privileged([Item(path: store, kind: .dsStore, isDirectory: false, size: info.size)]).removed.isEmpty,
                       (try? plan.write(directory: directory)) == true {
                        log.info("Kept the view of " + Paths.display(directory), path: directory)
                        continue
                    }
                    log.info("Could not keep the view of \(Paths.display(directory)): \(error.localizedDescription)", path: directory)
                }
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
