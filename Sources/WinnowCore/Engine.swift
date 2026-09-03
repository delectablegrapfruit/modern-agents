import Foundation

/// One root that gets scanned: a user folder, an eligible volume, or an ad-hoc request.
public struct SweepTarget: Hashable, Identifiable {
    public enum Source: Hashable {
        case location(UUID)
        case volume(String)
        case startupDisk
        case adHoc
    }

    public let path: String
    public let label: String
    public let recursive: Bool
    public let source: Source
    public let volume: VolumeInfo?

    public var id: String { path }
    public var isNetwork: Bool { volume?.kind == .network }

    public init(location: WatchedLocation, volume: VolumeInfo?) {
        path = SafetyPolicy.standardize(location.path)
        label = location.displayName
        recursive = location.recursive
        source = .location(location.id)
        self.volume = volume
    }

    public init(volume: VolumeInfo) {
        path = volume.mountPoint
        label = volume.name
        recursive = true
        source = .volume(volume.id)
        self.volume = volume
    }

    public init(startupDisk path: String) {
        self.path = SafetyPolicy.standardize(path)
        label = "Startup disk · " + NSString(string: self.path).lastPathComponent
        recursive = true
        source = .startupDisk
        volume = nil
    }

    public init(adHoc path: String, recursive: Bool = true, volume: VolumeInfo? = nil) {
        self.path = SafetyPolicy.standardize(path)
        label = NSString(string: self.path).lastPathComponent.isEmpty ? self.path : NSString(string: self.path).lastPathComponent
        self.recursive = recursive
        source = .adHoc
        self.volume = volume
    }
}

public enum SweepPhase {
    case scanning(target: String, directory: String)
    case deleting(done: Int, total: Int, item: JunkItem)
}

public struct VolumeDecision: Hashable {
    public let isEligible: Bool
    public let reason: String

    init(_ isEligible: Bool, _ reason: String) {
        self.isEligible = isEligible
        self.reason = reason
    }
}

/// Coordinates settings, volumes, watchers, scanning and deletion.
/// Thread-safe; long operations run on the caller's thread.
public final class Engine {
    public let store: SettingsStore
    public let inspector: VolumeInspecting
    public let log: ActivityLog

    /// How often the mounted-volume list is re-read as a fallback to mount notifications.
    public var volumePollInterval: TimeInterval = 10
    /// Set false to keep settings changes in memory only.
    public var persistsSettings = true
    /// User areas of the startup disk covered by the opt-in `.DS_Store` cleaning.
    public var startupDiskRoots = ["/Users", "/Applications"]

    public var onVolumesChanged: (([VolumeInfo]) -> Void)?
    /// Fired when the engine changes settings on its own (startup-disk time limit reached).
    public var onSettingsChanged: ((Settings) -> Void)?
    public var onWatchesChanged: (([SweepTarget]) -> Void)?
    public var onAutoClean: ((SweepResult, SweepTarget) -> Void)?

    private let fileManager: FileManager
    private let state = DispatchQueue(label: "winnow.engine.state")
    /// Live file events: kept short so a rescan never delays them.
    private let work = DispatchQueue(label: "winnow.engine.events", qos: .utility)
    /// Full re-scans of a target.
    private let scans = DispatchQueue(label: "winnow.engine.scans", qos: .utility)
    private var _settings: Settings
    private var _volumes: [VolumeInfo] = []
    private var _watches: [String: (target: SweepTarget, watcher: ChangeWatcher)] = [:]
    private var _running = false
    private var _reportedFailures: Set<String> = []
    private var volumeTimer: DispatchSourceTimer?

    public init(store: SettingsStore = SettingsStore(),
                inspector: VolumeInspecting = VolumeInspectors.system(),
                log: ActivityLog? = nil,
                fileManager: FileManager = .default) {
        self.store = store
        self.inspector = inspector
        self.log = log ?? ActivityLog(fileURL: AppPaths.activityFile(in: store.fileURL.deletingLastPathComponent()))
        self.fileManager = fileManager
        _settings = store.load()
    }

    // MARK: - Settings

    public var settings: Settings {
        get { state.sync { _settings } }
        set { update(newValue) }
    }

    public func update(_ newSettings: Settings) {
        state.sync { _settings = newSettings }
        if persistsSettings {
            do { try store.save(newSettings) } catch {
                log.record(.error, "Could not save settings: \(error.localizedDescription)")
            }
        }
        if isRunning { reconfigure() }
    }

    public var isRunning: Bool { state.sync { _running } }
    public var mountedVolumes: [VolumeInfo] { state.sync { _volumes } }
    public var activeWatches: [SweepTarget] {
        state.sync { _watches.values.map(\.target).sorted { $0.path < $1.path } }
    }

    // MARK: - Lifecycle

    public func start() {
        let wasRunning: Bool = state.sync { () -> Bool in
            if _running { return true }
            _running = true
            return false
        }
        if wasRunning { return }
        refreshVolumes(announceNew: false)
        reconfigure()
        let timer = DispatchSource.makeTimerSource(queue: scans)
        timer.schedule(deadline: .now() + volumePollInterval, repeating: volumePollInterval, leeway: .seconds(2))
        timer.setEventHandler { [weak self] in
            self?.refreshVolumes(announceNew: true)
            self?.expireStartupDiskIfNeeded()
        }
        timer.resume()
        volumeTimer = timer
    }

    public func stop() {
        volumeTimer?.cancel()
        volumeTimer = nil
        let watchers: [ChangeWatcher] = state.sync { () -> [ChangeWatcher] in
            _running = false
            let list = _watches.values.map(\.watcher)
            _watches.removeAll()
            return list
        }
        watchers.forEach { $0.stop() }
        onWatchesChanged?([])
    }

    // MARK: - Volumes

    @discardableResult
    public func refreshVolumes(announceNew: Bool = true) -> [VolumeInfo] {
        let now = inspector.mountedVolumes()
        let (added, changed): ([VolumeInfo], Bool) = state.sync { () -> ([VolumeInfo], Bool) in
            let oldIDs = Set(_volumes.map(\.id))
            let added = now.filter { !oldIDs.contains($0.id) }
            let changed = Set(now.map(\.id)) != oldIDs
            _volumes = now
            return (added, changed)
        }
        guard changed else { return now }
        onVolumesChanged?(now)
        if isRunning { reconfigure() }
        if announceNew {
            for volume in added where volume.kind != .boot {
                let verdict = decision(for: volume)
                log.record(.volume, "\(volume.name) connected · \(verdict.isEligible ? "will be cleaned" : verdict.reason)",
                           path: volume.mountPoint)
                if verdict.isEligible { applyPrevention(to: volume) }
            }
        }
        return now
    }

    /// Runs a final, time-boxed sweep of a volume that is about to be ejected.
    public func handleVolumeWillUnmount(mountPoint: String) {
        let current = settings
        guard current.volumes.cleanOnEject, current.general.isWatching else { return }
        let path = SafetyPolicy.standardize(mountPoint)
        guard let volume = mountedVolumes.first(where: { $0.mountPoint == path }), decision(for: volume).isEligible else { return }
        let watcher: ChangeWatcher? = state.sync { _watches.removeValue(forKey: path)?.watcher }
        watcher?.stop()
        let deadline = Date().addingTimeInterval(20)
        _ = try? performSweep(targets: [SweepTarget(volume: volume)], dryRun: false,
                              source: "\(volume.name) before eject", progress: nil,
                              isCancelled: { Date() > deadline })
    }

    public func decision(for volume: VolumeInfo) -> VolumeDecision {
        Engine.decide(volume, policy: settings.volumes)
    }

    /// What the policy alone would decide, ignoring per-volume overrides.
    public func policyDecision(for volume: VolumeInfo) -> VolumeDecision {
        var policy = settings.volumes
        policy.overrides[volume.id] = nil
        return Engine.decide(volume, policy: policy)
    }

    public static func decide(_ volume: VolumeInfo, policy: VolumePolicy) -> VolumeDecision {
        if volume.kind == .boot { return VolumeDecision(false, "Startup disk is never cleaned") }
        if volume.isReadOnly { return VolumeDecision(false, "Read-only") }
        if let override = policy.overrides[volume.id] {
            return override == .always ? VolumeDecision(true, "Always") : VolumeDecision(false, "Never")
        }
        switch volume.kind {
        case .external where !policy.cleanExternal: return VolumeDecision(false, "External disks are off")
        case .network where !policy.cleanNetwork: return VolumeDecision(false, "Network volumes are off")
        case .internalDisk where !policy.cleanInternal: return VolumeDecision(false, "Internal disks are off")
        case .unknown: return VolumeDecision(false, "Unknown volume type")
        default: break
        }
        if policy.onlyNonMacFormatted && volume.isMacNative { return VolumeDecision(false, "Mac-formatted") }
        return VolumeDecision(true, "By policy")
    }

    public func eligibleVolumes() -> [VolumeInfo] {
        mountedVolumes.filter { decision(for: $0).isEligible }
    }

    // MARK: - Startup disk

    /// Turns startup-disk cleaning off once its time limit has passed.
    @discardableResult
    public func expireStartupDiskIfNeeded(now: Date = Date()) -> Bool {
        var current = settings
        guard current.startupDisk.hasExpired(at: now) else { return false }
        current.startupDisk.disable()
        update(current)
        log.record(.info, "Startup disk cleaning turned off · time limit reached")
        onSettingsChanged?(current)
        return true
    }

    private func startupTargets(_ current: Settings) -> [SweepTarget] {
        guard current.startupDisk.isActive() else { return [] }
        return startupDiskRoots
            .filter { FileStats.info($0)?.isDirectory == true }
            .map { SweepTarget(startupDisk: $0) }
    }

    /// Rules applied to one target: the startup disk only ever loses `.DS_Store`.
    func rules(for target: SweepTarget, settings current: Settings) -> [JunkRule] {
        if case .startupDisk = target.source {
            return [JunkCatalog.builtIn(id: "ds_store")].compactMap { $0 }
        }
        return current.rules.activeRules
    }

    // MARK: - Targets

    public func fullSweepTargets() -> [SweepTarget] {
        let current = settings
        return withStartup(dedupe(locationTargets(current) + volumeTargets()), current)
    }

    private func watchTargets(_ current: Settings) -> [SweepTarget] {
        guard current.general.isWatching else { return [] }
        return withStartup(dedupe(locationTargets(current) + volumeTargets()), current)
    }

    /// Startup-disk targets use a narrower rule set, so they never replace a user folder.
    private func withStartup(_ base: [SweepTarget], _ current: Settings) -> [SweepTarget] {
        base + startupTargets(current).filter { startup in !base.contains { $0.path == startup.path } }
    }

    private func locationTargets(_ current: Settings) -> [SweepTarget] {
        current.locations.filter(\.isEnabled).map {
            SweepTarget(location: $0, volume: inspector.volume(containing: $0.path))
        }
    }

    private func volumeTargets() -> [SweepTarget] {
        eligibleVolumes().map { SweepTarget(volume: $0) }
    }

    private func dedupe(_ targets: [SweepTarget]) -> [SweepTarget] {
        var out: [SweepTarget] = []
        for target in targets.sorted(by: { $0.path.count < $1.path.count }) {
            let covered = out.contains { parent in
                target.path == parent.path
                    || (parent.recursive && target.path.hasPrefix(parent.path == "/" ? "/" : parent.path + "/"))
            }
            if !covered { out.append(target) }
        }
        return out
    }

    // MARK: - Watching

    public func reconfigure() {
        let current = settings
        let desired = watchTargets(current)
        var toStart: [(SweepTarget, ChangeWatcher, Bool)] = []
        var toStop: [ChangeWatcher] = []
        state.sync {
            guard _running else { return }
            let desiredByPath = Dictionary(desired.map { ($0.path, $0) }, uniquingKeysWith: { a, _ in a })
            for (path, entry) in _watches {
                if let wanted = desiredByPath[path], wanted.recursive == entry.target.recursive { continue }
                toStop.append(entry.watcher)
                _watches[path] = nil
            }
            let protected = SafetyPolicy().protectedPrefixes
            for target in desiredByPath.values where _watches[target.path] == nil {
                let prefix = target.path == "/" ? "/" : target.path + "/"
                let excluded = protected.filter { $0.hasPrefix(prefix) }
                let watcher = Watchers.make(root: target.path, excluding: excluded, alsoPoll: target.isNetwork,
                                            pollInterval: current.general.pollIntervalSeconds)
                _watches[target.path] = (target, watcher)
                let sweepNow: Bool
                if case .volume = target.source { sweepNow = current.volumes.cleanOnMount } else { sweepNow = true }
                toStart.append((target, watcher, sweepNow))
            }
        }
        toStop.forEach { $0.stop() }
        for (target, watcher, sweepNow) in toStart {
            watcher.onEvent = { [weak self] event in
                guard let self else { return }
                switch event {
                case .rescan: self.scans.async { self.handle(event, for: target) }
                case .paths: self.work.async { self.handle(event, for: target) }
                }
            }
            watcher.start()
            if sweepNow {
                scans.async { [weak self] in self?.handle(.rescan, for: target) }
            }
        }
        onWatchesChanged?(activeWatches)
    }

    private func handle(_ event: WatchEvent, for target: SweepTarget) {
        let current = settings
        guard current.general.isWatching else { return }
        let stillWatched: Bool = state.sync { _watches[target.path] != nil }
        guard stillWatched else { return }
        let result: SweepResult
        switch event {
        case .rescan:
            guard let swept = try? performSweep(targets: [target], dryRun: false, source: target.label,
                                                progress: nil, isCancelled: { false }, quietRepeats: true) else { return }
            result = swept
        case .paths(let paths):
            let items = junkItems(fromEventPaths: paths, target: target, settings: current)
            guard !items.isEmpty else { return }
            result = remove(items, within: [target.path], dryRun: false, source: target.label, quietRepeats: true)
        }
        if !result.removed.isEmpty || !result.failed.isEmpty {
            onAutoClean?(result, target)
        }
    }

    /// Maps changed paths to junk items, checking each ancestor down from the
    /// watched root so a file created inside `.Trashes` flags `.Trashes` itself.
    func junkItems(fromEventPaths paths: [String], target: SweepTarget, settings current: Settings) -> [JunkItem] {
        let options = scanOptions(current, target: target)
        let root = target.path
        let rootPrefix = root == "/" ? "/" : root + "/"
        var seen = Set<String>()
        var items: [JunkItem] = []
        for raw in paths {
            let path = SafetyPolicy.standardize(raw)
            guard path.hasPrefix(rootPrefix) else { continue }
            let components = path.dropFirst(rootPrefix.count).split(separator: "/").map(String.init)
            // Cheap name test first: most file events are unrelated to any rule.
            guard components.contains(where: options.couldMatch(name:)) else { continue }
            var node = root
            for (depth, component) in components.enumerated() {
                if depth > 0 && !target.recursive { break }
                node = node == "/" ? "/" + component : node + "/" + component
                if seen.contains(node) { break }
                if options.exclusions.isExcluded(path: node, name: component) || options.safety.isProtected(node) { break }
                guard let st = FileStats.info(node) else { break }
                let isDirectory = st.isDirectory && !st.isSymlink
                if let rule = options.firstMatch(name: component, isDirectory: isDirectory,
                                                 atVolumeRoot: options.safety.isAtVolumeRoot(node)),
                   options.safety.validate(path: node, within: [root]).isAllowed {
                    seen.insert(node)
                    let size = isDirectory ? JunkScanner.directorySize(node, fileManager: fileManager) : st.size
                    items.append(JunkItem(path: node, name: component, ruleID: rule.id, ruleName: rule.name,
                                          isDirectory: isDirectory, size: size, modified: st.modified))
                    break
                }
                if !isDirectory { break }
                if options.skipPackages && JunkScanner.isPackage(path: node, name: component) { break }
            }
        }
        return items
    }

    // MARK: - Scanning and sweeping

    private func safety() -> SafetyPolicy {
        let kept = settings.folderViews.filter(\.isEnabled).map(\.dsStorePath)
        return SafetyPolicy(volumeRoots: Set(mountedVolumes.map(\.mountPoint)).union(["/"]), exemptPaths: Set(kept))
    }

    /// Removes `.DS_Store` across the startup-disk user areas so folders adopt the
    /// Finder defaults. Folders with their own view keep theirs.
    public func resetFolderSettings(progress: ((SweepPhase) -> Void)? = nil,
                                    isCancelled: () -> Bool = { false }) throws -> SweepResult {
        let targets = startupDiskRoots
            .filter { FileStats.info($0)?.isDirectory == true }
            .map { SweepTarget(startupDisk: $0) }
        return try performSweep(targets: targets, dryRun: false, source: "Finder defaults reset",
                                progress: progress, isCancelled: isCancelled)
    }

    private func scanOptions(_ current: Settings, target: SweepTarget) -> ScanOptions {
        ScanOptions(rules: rules(for: target, settings: current), exclusions: current.exclusionMatcher, safety: safety(),
                    skipPackages: current.general.skipPackages, recursive: target.recursive)
    }

    public func scan(paths: [String], recursive: Bool = true,
                     progress: ((SweepPhase) -> Void)? = nil,
                     isCancelled: () -> Bool = { false }) throws -> [JunkItem] {
        try scan(targets: paths.map { SweepTarget(adHoc: $0, recursive: recursive) }, progress: progress, isCancelled: isCancelled)
    }

    public func scan(targets: [SweepTarget],
                     progress: ((SweepPhase) -> Void)? = nil,
                     isCancelled: () -> Bool = { false }) throws -> [JunkItem] {
        let current = settings
        var seen = Set<String>()
        var items: [JunkItem] = []
        for target in targets {
            let scanner = JunkScanner(options: scanOptions(current, target: target), fileManager: fileManager)
            let found = try scanner.scan(root: target.path,
                                         progress: { dir in progress?(.scanning(target: target.label, directory: dir)) },
                                         isCancelled: isCancelled)
            for item in found where seen.insert(item.path).inserted {
                items.append(item)
            }
        }
        return items
    }

    /// Deletes `items`, refusing anything outside `roots`, and records the outcome.
    /// With `quietRepeats`, failures already reported in this session are dropped
    /// so background re-scans do not repeat the same complaint.
    public func remove(_ items: [JunkItem], within roots: [String], dryRun: Bool = false, source: String,
                       progress: ((SweepPhase) -> Void)? = nil,
                       isCancelled: () -> Bool = { false },
                       quietRepeats: Bool = false) -> SweepResult {
        let current = settings
        let sweeper = Sweeper(options: SweepOptions(mode: current.general.deletionMode, dryRun: dryRun),
                              safety: safety(), fileManager: fileManager)
        var result = sweeper.remove(items, within: roots,
                                    progress: { done, total, item in progress?(.deleting(done: done, total: total, item: item)) },
                                    isCancelled: isCancelled)
        if quietRepeats {
            let failures = result.failed
            result.failed = state.sync { failures.filter { _reportedFailures.insert($0.item.path).inserted } }
        } else {
            let removedPaths = result.removed.map(\.path)
            state.sync { removedPaths.forEach { _reportedFailures.remove($0) } }
        }
        log.recordResult(result, source: source)
        return result
    }

    #if os(macOS)
    /// Removes items the current user may not delete by asking for an administrator
    /// password. Must be called on the main thread. Spotlight is switched off on the
    /// affected volume when that prevention option is on, so the index is not rebuilt.
    public func removeWithPrivileges(_ items: [JunkItem], within roots: [String], source: String) -> SweepResult {
        var result = SweepResult()
        result.rootsScanned = roots
        let policy = safety()
        var allowed: [JunkItem] = []
        for item in items {
            switch policy.validate(path: item.path, within: roots) {
            case .denied(let reason): result.skipped.append(SweepFailure(item: item, reason: reason))
            case .allowed: allowed.append(item)
            }
        }
        guard !allowed.isEmpty else { return result }
        var mounts: [String] = []
        if settings.prevention.noSpotlightOnCleanedVolumes {
            for item in allowed where item.ruleID == "spotlight" && !mounts.contains(item.parentPath) {
                mounts.append(item.parentPath)
            }
        }
        do {
            try PrivilegedRemover.remove(paths: allowed.map(\.path), disableIndexingAt: mounts)
        } catch {
            let cancelled = (error as? PrivilegedRemovalError) == .cancelled
            for item in allowed {
                result.failed.append(SweepFailure(item: item, reason: error.localizedDescription, needsPrivileges: true))
            }
            result.finishedAt = Date()
            if !cancelled { log.record(.error, "Administrator removal failed: \(error.localizedDescription)") }
            return result
        }
        for item in allowed {
            if FileStats.info(item.path) == nil {
                result.removed.append(item)
                result.bytesFreed += item.size
            } else {
                result.failed.append(SweepFailure(item: item, reason: "Still present after administrator removal", needsPrivileges: true))
            }
        }
        for mount in mounts {
            log.record(.prevention, "Stopped Spotlight indexing \(NSString(string: mount).lastPathComponent)", path: mount)
        }
        result.finishedAt = Date()
        log.recordResult(result, source: source + " · administrator")
        return result
    }
    #endif

    public func sweep(paths: [String], recursive: Bool = true, dryRun: Bool = false,
                      progress: ((SweepPhase) -> Void)? = nil,
                      isCancelled: () -> Bool = { false }) throws -> SweepResult {
        let targets = paths.map { SweepTarget(adHoc: $0, recursive: recursive) }
        let source = targets.count == 1 ? targets[0].label : "\(targets.count) folders"
        return try performSweep(targets: targets, dryRun: dryRun, source: source, progress: progress, isCancelled: isCancelled)
    }

    /// Scans and cleans every enabled location and every eligible mounted volume.
    public func fullSweep(dryRun: Bool = false,
                          progress: ((SweepPhase) -> Void)? = nil,
                          isCancelled: () -> Bool = { false }) throws -> SweepResult {
        let targets = fullSweepTargets()
        let result = try performSweep(targets: targets, dryRun: dryRun, source: "full sweep", progress: progress, isCancelled: isCancelled)
        if result.removed.isEmpty && result.failed.isEmpty {
            log.record(.info, "Full sweep · nothing to remove", count: 0, dryRun: dryRun)
        }
        return result
    }

    public func performSweep(targets: [SweepTarget], dryRun: Bool, source: String,
                             progress: ((SweepPhase) -> Void)?,
                             isCancelled: () -> Bool,
                             quietRepeats: Bool = false) throws -> SweepResult {
        let items = try scan(targets: targets, progress: progress, isCancelled: isCancelled)
        var result = remove(items, within: targets.map(\.path), dryRun: dryRun, source: source,
                            progress: progress, isCancelled: isCancelled, quietRepeats: quietRepeats)
        result.rootsScanned = targets.map(\.path)
        return result
    }

    // MARK: - Prevention

    public func applyPrevention(to volume: VolumeInfo) {
        let current = settings
        guard current.prevention.noSpotlightOnCleanedVolumes, !volume.isReadOnly, volume.kind != .boot,
              decision(for: volume).isEligible else { return }
        do {
            if try VolumeMarkers.ensureSpotlightDisabled(at: volume.mountPoint, fileManager: fileManager) {
                log.record(.prevention, "Stopped Spotlight indexing \(volume.name)", path: volume.mountPoint)
            }
        } catch {
            log.record(.error, "Could not stop Spotlight on \(volume.name): \(error.localizedDescription)", path: volume.mountPoint)
        }
    }

    public func applyPreventionToMountedVolumes() {
        eligibleVolumes().forEach(applyPrevention)
    }
}
