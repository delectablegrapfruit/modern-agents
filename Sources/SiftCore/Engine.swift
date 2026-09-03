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
    /// Fallback to mount notifications.
    public var volumePollInterval: TimeInterval = 10
    public var persistsSettings = true
    /// No settings file existed when the engine was made.
    public let isFirstLaunch: Bool

    public var onRootsChanged: (([Root]) -> Void)?
    public var onRemoved: ((Outcome, Root) -> Void)?
    /// Items only an administrator can remove, as they are found and cleared.
    public var onLockedChanged: (([Item]) -> Void)?

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
    /// Bytes last written per managed store, so its own writes are not re-read.
    private var _written: [String: Data] = [:]
    private var _rewrites: [String: (count: Int, since: Date)] = [:]
    private var timer: DispatchSourceTimer?

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
            _rewrites = [:]
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
        let t = DispatchSource.makeTimerSource(queue: scans)
        t.schedule(deadline: .now() + volumePollInterval, repeating: volumePollInterval, leeway: .seconds(2))
        t.setEventHandler { [weak self] in self?.refreshVolumes() }
        t.resume()
        timer = t
    }

    public func stop() {
        timer?.cancel()
        timer = nil
        let watchers: [Watcher] = state.sync {
            _running = false
            defer { _watches.removeAll() }
            return _watches.values.map(\.watcher)
        }
        watchers.forEach { $0.stop() }
        onRootsChanged?([])
    }

    // MARK: - Roots

    @discardableResult
    public func refreshVolumes() -> [Volume] {
        let now = volumes.mounted()
        let changed: Bool = state.sync {
            defer { _volumes = now }
            return Set(now.map(\.id)) != Set(_volumes.map(\.id))
        }
        if changed {
            replan()
            if isRunning { reconfigure() }
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
                case .rescan: self.scans.async { self.handle(change, root: root) }
                case .paths: self.events.async { self.handle(change, root: root) }
                }
            }
            watcher.start()
            scans.async { [weak self] in self?.handle(.rescan, root: root) }
        }
        onRootsChanged?(activeRoots)
    }

    private func handle(_ change: Change, root: Root) {
        let live: Bool = state.sync { !_paused && _watches[root.path] != nil }
        guard live else { return }
        let outcome: Outcome
        switch change {
        case .rescan:
            reconcileStores(under: root.path)
            guard let swept = try? sweep(roots: [root], quiet: true) else { return }
            outcome = swept
        case .paths(let paths):
            reconcileStores(changed: paths)
            let items = JunkScanner(safety: safety).items(fromChangedPaths: paths, root: root.path)
            guard !items.isEmpty else { return }
            outcome = remove(items, within: [root.path], source: root.label, quiet: true)
        }
        if !outcome.removed.isEmpty { onRemoved?(outcome, root) }
    }

    /// Runs a final, time-boxed sweep of a volume that is about to be ejected.
    public func handleWillUnmount(mountPoint: String) {
        let path = Paths.standardize(mountPoint)
        guard !isPaused, let root = roots().first(where: { $0.path == path }) else { return }
        let watcher: Watcher? = state.sync { _watches.removeValue(forKey: path)?.watcher }
        watcher?.stop()
        let deadline = Date().addingTimeInterval(20)
        _ = try? sweep(roots: [root], quiet: true, isCancelled: { Date() > deadline })
    }

    // MARK: - Folder stores

    /// Writes every store the views need and removes those no longer needed.
    /// Called with Finder quit, so it cannot overwrite them on the way out.
    public func applyStores(previous: StorePlan) throws {
        let plan = self.plan
        plan.retire(from: previous, fileManager: fileManager)
        try plan.writeAll()
        remember(plan)
    }

    private func remember(_ plan: StorePlan) {
        for path in plan.storePaths {
            let data = try? Data(contentsOf: URL(fileURLWithPath: path))
            state.sync { _written[path] = data }
        }
    }

    private func reconcileStores(under root: String) {
        for directory in plan.stores.keys where Paths.isInside(directory, root) { reconcile(directory) }
    }

    private func reconcileStores(changed paths: [String]) {
        let plan = self.plan
        guard !plan.isEmpty else { return }
        var done = Set<String>()
        for raw in paths {
            let path = Paths.standardize(raw)
            guard Paths.name(of: path) == ".DS_Store" else { continue }
            let directory = Paths.parent(of: path)
            if plan.stores[directory] != nil, done.insert(directory).inserted { reconcile(directory) }
        }
    }

    /// Finder wrote (or removed) a managed store: put it back to what the view says.
    /// A store that keeps coming back different is left alone for a while.
    @discardableResult
    func reconcile(_ directory: String) -> Bool {
        let store = directory + "/.DS_Store"
        let current = try? Data(contentsOf: URL(fileURLWithPath: store))
        let last: Data? = state.sync { _written[store] }
        if let current, current == last { return false }
        let overBudget: Bool = state.sync {
            let now = Date()
            var entry = _rewrites[store] ?? (count: 0, since: now)
            if now.timeIntervalSince(entry.since) > 60 { entry = (count: 0, since: now) }
            entry.count += 1
            _rewrites[store] = entry
            if entry.count == 21 { log.info("Stopped rewriting \(store): it keeps changing") }
            return entry.count > 20
        }
        if overBudget { return false }
        do {
            let written = try plan.write(directory: directory)
            let data = try? Data(contentsOf: URL(fileURLWithPath: store))
            state.sync { _written[store] = data }
            if written { log.info("Kept the view of " + Paths.display(directory), path: directory) }
            return written
        } catch {
            log.info("Could not keep the view of \(Paths.display(directory)): \(error.localizedDescription)", path: directory)
            return false
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
        let outcome = remover.remove(items, within: roots, progress: { progress?(.removing(done: $0, total: $1)) },
                                     isCancelled: isCancelled)
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
        let before: [String] = state.sync { Array(_locked.keys) }
        let after: [String] = state.sync {
            for item in outcome.removed { _locked[item.path] = nil }
            for item in outcome.locked { _locked[item.path] = item }
            for path in _locked.keys where Files.info(path) == nil { _locked[path] = nil }
            return Array(_locked.keys)
        }
        if Set(before) != Set(after) { onLockedChanged?(lockedItems) }
    }

    #if os(macOS)
    /// Removes what the current user may not, after an administrator password.
    /// Main thread only. Spotlight is switched off on a disk before its index goes.
    public func removeAsAdministrator(_ items: [Item]) -> Outcome {
        var outcome = Outcome()
        let safety = self.safety
        var allowed: [Item] = []
        for item in items {
            switch safety.validate(path: item.path, within: roots().map(\.path)) {
            case .refused(let reason): outcome.skipped.append(Failure(item: item, reason: reason))
            case .allowed: allowed.append(item)
            }
        }
        guard !allowed.isEmpty else { return outcome }
        do {
            try Privileged.run(Privileged.script(for: allowed))
        } catch {
            for item in allowed {
                outcome.failed.append(Failure(item: item, reason: error.localizedDescription, needsAdministrator: true))
            }
            return outcome
        }
        for item in allowed {
            let gone = Files.info(item.path) == nil || (item.kind == .fsevents && Junk.isQuietFSEvents(at: item.path))
            if gone {
                outcome.removed.append(item)
            } else {
                outcome.failed.append(Failure(item: item, reason: "Still present", needsAdministrator: true))
            }
        }
        state.sync { for item in outcome.removed { _locked[item.path] = nil } }
        onLockedChanged?(lockedItems)
        log.record(outcome)
        return outcome
    }
    #endif
}
