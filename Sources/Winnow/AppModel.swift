import AppKit
import Combine
import SwiftUI
import WinnowCore

/// Cancellation flag plus a light throttle for progress reporting.
final class WorkToken {
    private let lock = NSLock()
    private var cancelled = false
    private var lastReport = Date.distantPast

    var isCancelled: Bool {
        lock.lock(); defer { lock.unlock() }
        return cancelled
    }

    func cancel() {
        lock.lock(); cancelled = true; lock.unlock()
    }

    /// True at most ten times a second.
    func shouldReport() -> Bool {
        lock.lock(); defer { lock.unlock() }
        let now = Date()
        guard now.timeIntervalSince(lastReport) > 0.1 else { return false }
        lastReport = now
        return true
    }
}

@MainActor
final class AppModel: ObservableObject {
    enum SweepState: Equatable {
        case idle
        case scanning(label: String, detail: String)
        case found(items: [JunkItem], roots: [String], label: String)
        case removing(done: Int, total: Int)
        case finished(SweepResult)

        var showsSheet: Bool {
            switch self {
            case .found, .removing, .finished: return true
            case .idle, .scanning: return false
            }
        }
    }

    let engine: Engine

    @Published var settings: WinnowCore.Settings {
        didSet { if settings != oldValue { scheduleSave() } }
    }
    @Published var exclusionsDraft: String {
        didSet { scheduleExclusionsCommit() }
    }
    @Published private(set) var volumes: [VolumeInfo] = []
    @Published private(set) var watches: [SweepTarget] = []
    @Published private(set) var activity: [ActivityEntry] = []
    @Published private(set) var statistics = ActivityStatistics()
    @Published private(set) var sweep: SweepState = .idle
    /// Finder defaults as edited in the window; written only on Apply.
    @Published var finderDraft: FinderDefaults
    @Published private(set) var finderApplied: FinderDefaults
    @Published private(set) var folderViewsApplied: [FolderView]
    @Published private(set) var isApplyingFinder = false
    @Published var resetFoldersOnApply = true
    @Published private(set) var finderStatus: String?
    @Published var editingFolderView: FolderView?
    @Published var startupDiskWarningShown = false
    @Published var lastError: String?

    private var saveTask: Task<Void, Never>?
    private var exclusionsTask: Task<Void, Never>?
    private var activityTask: Task<Void, Never>?
    private var token = WorkToken()
    private var observers: [NSObjectProtocol] = []

    init(engine: Engine = Engine()) {
        self.engine = engine
        var initial = engine.settings
        let finder = FinderDefaults.read()
        finderDraft = finder
        finderApplied = finder
        folderViewsApplied = initial.folderViews
        if LoginItem.isAvailable {
            initial.general.launchAtLogin = LoginItem.isEnabled
        }
        settings = initial
        exclusionsDraft = initial.exclusions.joined(separator: "\n")
        activity = engine.log.recent(200)
        statistics = engine.log.statistics

        engine.onVolumesChanged = { [weak self] list in
            Task { @MainActor in self?.volumes = list }
        }
        engine.onWatchesChanged = { [weak self] list in
            Task { @MainActor in self?.watches = list }
        }
        engine.onAutoClean = { [weak self] result, target in
            Task { @MainActor in self?.announce(result, label: target.label) }
        }
        engine.log.onAppend = { [weak self] _ in
            Task { @MainActor in self?.scheduleActivityRefresh() }
        }
        engine.onSettingsChanged = { [weak self] changed in
            Task { @MainActor in self?.settings = changed }
        }
    }

    func start() {
        let center = NSWorkspace.shared.notificationCenter
        let engine = self.engine
        let refresh: @Sendable (Notification) -> Void = { _ in
            Task.detached(priority: .utility) { engine.refreshVolumes() }
        }
        observers.append(center.addObserver(forName: NSWorkspace.didMountNotification, object: nil, queue: nil, using: refresh))
        observers.append(center.addObserver(forName: NSWorkspace.didUnmountNotification, object: nil, queue: nil, using: refresh))
        observers.append(center.addObserver(forName: NSWorkspace.willUnmountNotification, object: nil, queue: nil) { note in
            // Runs on the posting thread, before the unmount proceeds.
            guard let url = note.userInfo?[NSWorkspace.volumeURLUserInfoKey] as? URL else { return }
            engine.handleVolumeWillUnmount(mountPoint: url.path)
        })
        Notifier.requestAuthorization()
        Task.detached(priority: .utility) {
            engine.start()
            let volumes = engine.mountedVolumes
            let watches = engine.activeWatches
            await MainActor.run { [weak self] in
                self?.volumes = volumes
                self?.watches = watches
            }
        }
    }

    // MARK: - Status

    var isWatching: Bool { settings.general.isWatching }

    var statusText: String {
        guard isWatching else { return "Paused" }
        let volumeCount = watches.filter { if case .volume = $0.source { return true } else { return false } }.count
        let startupCount = watches.filter { if case .startupDisk = $0.source { return true } else { return false } }.count
        let folderCount = watches.count - volumeCount - startupCount
        var parts: [String] = []
        if volumeCount > 0 { parts.append("\(volumeCount) volume\(volumeCount == 1 ? "" : "s")") }
        if folderCount > 0 { parts.append("\(folderCount) folder\(folderCount == 1 ? "" : "s")") }
        if startupCount > 0 { parts.append("startup disk") }
        return parts.isEmpty ? "Nothing to watch" : "Watching " + parts.joined(separator: ", ")
    }

    var statisticsText: String? {
        guard statistics.itemsRemoved > 0 else { return nil }
        return "\(statistics.itemsRemoved) removed · \(Format.bytes(statistics.bytesFreed))"
    }

    func toggleWatching() {
        settings.general.isWatching.toggle()
    }

    // MARK: - Sweeping

    func sweepEverything() {
        let targets = engine.fullSweepTargets()
        guard !targets.isEmpty else {
            lastError = "Nothing to sweep. Add a folder or connect a disk that Winnow cleans."
            return
        }
        scan(targets, label: "everything")
    }

    func sweep(urls: [URL]) {
        var paths: [String] = []
        for url in urls where url.isFileURL {
            var isDirectory: ObjCBool = false
            guard FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory) else { continue }
            let path = isDirectory.boolValue ? url.path : url.deletingLastPathComponent().path
            if !paths.contains(path) { paths.append(path) }
        }
        guard !paths.isEmpty else { return }
        let targets = paths.map { SweepTarget(adHoc: $0) }
        scan(targets, label: targets.count == 1 ? targets[0].label : "\(targets.count) folders")
    }

    private func scan(_ targets: [SweepTarget], label: String) {
        if case .scanning = sweep { return }
        if case .removing = sweep { return }
        let token = WorkToken()
        self.token = token
        sweep = .scanning(label: label, detail: "")
        let engine = self.engine
        Task.detached(priority: .userInitiated) { [weak self] in
            do {
                let items = try engine.scan(targets: targets, progress: { phase in
                    guard case .scanning(_, let directory) = phase, token.shouldReport() else { return }
                    Task { @MainActor in
                        guard let self, !token.isCancelled, case .scanning = self.sweep else { return }
                        self.sweep = .scanning(label: label, detail: directory)
                    }
                }, isCancelled: { token.isCancelled })
                await MainActor.run { [weak self] in
                    guard let self, !token.isCancelled else { return }
                    self.sweep = .found(items: items, roots: targets.map(\.path), label: label)
                }
            } catch {
                await MainActor.run { [weak self] in
                    guard let self else { return }
                    self.sweep = .idle
                    if !token.isCancelled { self.lastError = error.localizedDescription }
                }
            }
        }
    }

    func removeFound() {
        guard case .found(let items, let roots, let label) = sweep, !items.isEmpty else { return }
        let token = WorkToken()
        self.token = token
        sweep = .removing(done: 0, total: items.count)
        let engine = self.engine
        Task.detached(priority: .userInitiated) { [weak self] in
            let result = engine.remove(items, within: roots, source: label, progress: { phase in
                guard case .deleting(let done, let total, _) = phase, token.shouldReport() else { return }
                Task { @MainActor in
                    guard let self, case .removing = self.sweep else { return }
                    self.sweep = .removing(done: done, total: total)
                }
            }, isCancelled: { token.isCancelled })
            await MainActor.run { [weak self] in
                guard let self else { return }
                self.sweep = .finished(result)
                self.announce(result, label: label)
            }
        }
    }

    func cancelSweep() {
        token.cancel()
        sweep = .idle
    }

    /// Retries the items the current user could not delete, as administrator.
    func removeLockedItems() {
        guard case .finished(let result) = sweep else { return }
        let locked = result.lockedItems
        guard !locked.isEmpty else { return }
        let extra = engine.removeWithPrivileges(locked, within: result.rootsScanned, source: "locked items")
        var merged = result
        let lockedPaths = Set(locked.map(\.path))
        merged.failed.removeAll { lockedPaths.contains($0.item.path) }
        merged.removed += extra.removed
        merged.bytesFreed += extra.bytesFreed
        merged.failed += extra.failed
        merged.skipped += extra.skipped
        merged.finishedAt = Date()
        sweep = .finished(merged)
    }

    /// Whether a failure looks like the Trash on another disk, which macOS gates behind Full Disk Access.
    func needsFullDiskAccess(_ result: SweepResult) -> Bool {
        result.failed.contains { $0.needsPrivileges && ($0.item.name == ".Trashes" || $0.item.path.contains("/.Trashes/")) }
    }

    func openFullDiskAccessSettings() {
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles") {
            NSWorkspace.shared.open(url)
        }
    }

    func dismissSweep() {
        if case .removing = sweep { return }
        sweep = .idle
    }

    private func announce(_ result: SweepResult, label: String) {
        guard settings.general.notify, !result.removed.isEmpty || !result.failed.isEmpty else { return }
        var body = "\(result.removedCount) item\(result.removedCount == 1 ? "" : "s") · \(Format.bytes(result.bytesFreed))"
        let locked = result.lockedItems.count
        if locked > 0 { body += " · \(locked) need administrator access" }
        if result.failed.count > locked { body += " · \(result.failed.count - locked) could not be removed" }
        Notifier.notify(title: "Cleaned \(label)", body: body)
    }

    // MARK: - Rules

    func ruleBinding(_ rule: JunkRule) -> Binding<Bool> {
        Binding(
            get: { [weak self] in self?.settings.rules.isEnabled(rule) ?? false },
            set: { [weak self] on in self?.settings.rules.setEnabled(on, ruleID: rule.id) }
        )
    }

    func addCustomPattern(_ text: String) {
        let pattern = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !pattern.isEmpty, !pattern.contains("/") else { return }
        guard !settings.rules.custom.contains(where: { $0.pattern.caseInsensitiveCompare(pattern) == .orderedSame }) else { return }
        settings.rules.custom.append(CustomPattern(pattern: pattern))
    }

    func removeCustomPattern(_ id: UUID) {
        settings.rules.custom.removeAll { $0.id == id }
    }

    // MARK: - Volumes

    func isCleaned(_ volume: VolumeInfo) -> Bool {
        Engine.decide(volume, policy: settings.volumes).isEligible
    }

    func canToggle(_ volume: VolumeInfo) -> Bool {
        volume.kind != .boot && !volume.isReadOnly
    }

    func volumeBinding(_ volume: VolumeInfo) -> Binding<Bool> {
        Binding(
            get: { [weak self] in self?.isCleaned(volume) ?? false },
            set: { [weak self] on in self?.setCleaned(on, volume: volume) }
        )
    }

    private func setCleaned(_ cleaned: Bool, volume: VolumeInfo) {
        var policy = settings.volumes
        policy.overrides[volume.id] = nil
        if Engine.decide(volume, policy: policy).isEligible != cleaned {
            policy.overrides[volume.id] = cleaned ? VolumeOverride.always : VolumeOverride.never
        }
        settings.volumes = policy
    }

    func volumeDetail(_ volume: VolumeInfo) -> String {
        var parts = [volume.kind.label, volume.fileSystemLabel]
        if volume.kind == .boot { parts.append("never cleaned") }
        else if volume.isReadOnly { parts.append("read-only") }
        else if settings.volumes.overrides[volume.id] != nil { parts.append("set here") }
        return parts.joined(separator: " · ")
    }

    private func refreshVolumesInBackground() {
        let engine = self.engine
        Task.detached(priority: .utility) { engine.refreshVolumes() }
    }

    // MARK: - Folders

    func addFolders() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = true
        panel.prompt = "Add"
        panel.message = "Choose folders to keep clean."
        guard panel.runModal() == .OK else { return }
        for url in panel.urls {
            let path = SafetyPolicy.standardize(url.path)
            guard !settings.locations.contains(where: { $0.path == path }) else { continue }
            settings.locations.append(WatchedLocation(path: path))
        }
    }

    func removeLocation(_ id: UUID) {
        settings.locations.removeAll { $0.id == id }
    }

    func locationEnabledBinding(_ id: UUID) -> Binding<Bool> {
        Binding(
            get: { [weak self] in self?.settings.locations.first { $0.id == id }?.isEnabled ?? false },
            set: { [weak self] on in
                guard let self, let index = self.settings.locations.firstIndex(where: { $0.id == id }) else { return }
                self.settings.locations[index].isEnabled = on
            }
        )
    }

    func locationRecursiveBinding(_ id: UUID) -> Binding<Bool> {
        Binding(
            get: { [weak self] in self?.settings.locations.first { $0.id == id }?.recursive ?? true },
            set: { [weak self] on in
                guard let self, let index = self.settings.locations.firstIndex(where: { $0.id == id }) else { return }
                self.settings.locations[index].recursive = on
            }
        )
    }

    // MARK: - Options

    var launchAtLoginBinding: Binding<Bool> {
        Binding(
            get: { [weak self] in self?.settings.general.launchAtLogin ?? false },
            set: { [weak self] on in
                guard let self else { return }
                do {
                    try LoginItem.set(on)
                    self.settings.general.launchAtLogin = on
                } catch {
                    self.lastError = error.localizedDescription
                    self.settings.general.launchAtLogin = LoginItem.isEnabled
                }
            }
        )
    }

    var spotlightBinding: Binding<Bool> {
        Binding(
            get: { [weak self] in self?.settings.prevention.noSpotlightOnCleanedVolumes ?? false },
            set: { [weak self] on in
                guard let self else { return }
                self.settings.prevention.noSpotlightOnCleanedVolumes = on
                if on {
                    let engine = self.engine
                    var pending = self.settings
                    pending.prevention.noSpotlightOnCleanedVolumes = true
                    Task.detached(priority: .utility) {
                        engine.update(pending)
                        engine.applyPreventionToMountedVolumes()
                    }
                }
            }
        )
    }

    // MARK: - Finder

    var finderHasChanges: Bool {
        finderDraft != finderApplied || settings.folderViews != folderViewsApplied
    }

    /// Writes Finder's defaults and every folder view, optionally resets existing
    /// folder settings, then relaunches Finder.
    func applyFinderDefaults() {
        guard finderHasChanges || resetFoldersOnApply, !isApplyingFinder else { return }
        isApplyingFinder = true
        let draft = finderDraft
        let views = settings.folderViews
        let previous = folderViewsApplied
        let reset = resetFoldersOnApply
        let engine = self.engine
        let current = settings
        Task { @MainActor in
            var problems: [String] = []
            // Finder writes its own .DS_Store files when it quits, so quit it first.
            await FinderApplier.quitFinder()
            do { try draft.write() } catch { problems.append(error.localizedDescription) }

            let wanted = Dictionary(views.filter(\.isEnabled).map { ($0.path, $0) }, uniquingKeysWith: { a, _ in a })
            for view in previous where view.isEnabled && wanted[view.path] == nil {
                try? FolderViewWriter.remove(view)
            }
            for view in wanted.values {
                do { try FolderViewWriter.write(view) } catch { problems.append("\(view.displayName): \(error.localizedDescription)") }
            }

            var resetCount: Int?
            if reset {
                // Make sure the engine exempts the folder views before sweeping.
                await Task.detached(priority: .userInitiated) { engine.update(current) }.value
                let result = try? await Task.detached(priority: .userInitiated) { try engine.resetFolderSettings() }.value
                resetCount = result?.removedCount
            }

            await FinderApplier.launchFinder()

            finderApplied = problems.isEmpty ? draft : FinderDefaults.read()
            folderViewsApplied = views
            if !problems.isEmpty { lastError = problems.joined(separator: "\n") }
            var status = "Applied " + Date().formatted(date: .omitted, time: .shortened)
            if let resetCount { status += " · reset \(resetCount) folder\(resetCount == 1 ? "" : "s")" }
            finderStatus = status
            isApplyingFinder = false
        }
    }

    func revertFinderDraft() {
        finderDraft = finderApplied
        settings.folderViews = folderViewsApplied
    }

    // MARK: Folder views

    func addFolderView() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        panel.prompt = "Choose"
        panel.message = "Choose a folder that should keep its own view."
        guard panel.runModal() == .OK, let url = panel.url else { return }
        let path = SafetyPolicy.standardize(url.path)
        if let existing = settings.folderViews.first(where: { $0.path == path }) {
            editingFolderView = existing
            return
        }
        var view = FolderView(path: path, viewStyle: finderDraft.viewStyle, sortKey: finderDraft.sortKey,
                              ascending: finderDraft.ascending, options: finderDraft.options)
        view.isEnabled = true
        settings.folderViews.append(view)
        editingFolderView = view
    }

    func removeFolderView(_ id: UUID) {
        settings.folderViews.removeAll { $0.id == id }
    }

    func saveFolderView(_ view: FolderView) {
        if let index = settings.folderViews.firstIndex(where: { $0.id == view.id }) {
            settings.folderViews[index] = view
        } else {
            settings.folderViews.append(view)
        }
        editingFolderView = nil
    }

    func folderViewEnabledBinding(_ id: UUID) -> Binding<Bool> {
        Binding(
            get: { [weak self] in self?.settings.folderViews.first { $0.id == id }?.isEnabled ?? false },
            set: { [weak self] on in
                guard let self, let index = self.settings.folderViews.firstIndex(where: { $0.id == id }) else { return }
                self.settings.folderViews[index].isEnabled = on
            }
        )
    }

    // MARK: - Startup disk

    static let startupDurations: [(label: String, seconds: Double)] = [
        ("1 hour", 3600), ("8 hours", 8 * 3600), ("24 hours", 24 * 3600), ("1 week", 7 * 24 * 3600), ("Never", 0),
    ]

    static let startupDiskWarning = "Finder keeps each folder's view, sort order, icon positions and window size in its .DS_Store file. "
        + "Winnow will remove those files continuously across your home folder, Applications and every connected drive, "
        + "so every folder follows the defaults and changes made in Finder last only until the folder is next opened. "
        + "Folders with their own view keep theirs. System folders are never touched."

    /// Turning on goes through the warning first; turning off is immediate.
    var startupDiskBinding: Binding<Bool> {
        Binding(
            get: { [weak self] in self?.settings.startupDisk.isEnabled ?? false },
            set: { [weak self] on in
                guard let self else { return }
                if on { self.startupDiskWarningShown = true } else { self.settings.startupDisk.disable() }
            }
        )
    }

    func enableStartupDisk() {
        settings.startupDisk.enable()
    }

    /// 0 means indefinitely. Changing it while enabled restarts the clock.
    var startupDurationBinding: Binding<Double> {
        Binding(
            get: { [weak self] in self?.settings.startupDisk.durationSeconds ?? 0 },
            set: { [weak self] seconds in
                guard let self else { return }
                self.settings.startupDisk.durationSeconds = seconds > 0 ? seconds : nil
                if self.settings.startupDisk.isEnabled { self.settings.startupDisk.enable() }
            }
        )
    }

    var startupDiskDetail: String? {
        guard settings.startupDisk.isEnabled else { return nil }
        guard let until = settings.startupDisk.expiresAt else { return "On until turned off" }
        return "On until " + until.formatted(date: .abbreviated, time: .shortened)
    }

    func volumeIsStartupDisk(_ volume: VolumeInfo) -> Bool {
        volume.kind == .boot
    }

    func clearActivity() {
        engine.log.clear()
        activity = []
        statistics = ActivityStatistics()
    }

    // MARK: - Persistence

    private func scheduleSave() {
        saveTask?.cancel()
        let pending = settings
        let engine = self.engine
        saveTask = Task {
            try? await Task.sleep(nanoseconds: 300_000_000)
            guard !Task.isCancelled else { return }
            await Task.detached(priority: .utility) { engine.update(pending) }.value
        }
    }

    private func scheduleExclusionsCommit() {
        exclusionsTask?.cancel()
        exclusionsTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 500_000_000)
            guard !Task.isCancelled, let self else { return }
            let lines = self.exclusionsDraft
                .split(separator: "\n", omittingEmptySubsequences: true)
                .map { $0.trimmingCharacters(in: .whitespaces) }
                .filter { !$0.isEmpty }
            if lines != self.settings.exclusions {
                self.settings.exclusions = lines
            }
        }
    }

    private func scheduleActivityRefresh() {
        guard activityTask == nil else { return }
        activityTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 250_000_000)
            guard let self else { return }
            self.activity = self.engine.log.recent(200)
            self.statistics = self.engine.log.statistics
            self.activityTask = nil
        }
    }
}

enum Format {
    static func bytes(_ count: Int64) -> String {
        ByteCountFormatter.string(fromByteCount: count, countStyle: .file)
    }
}
