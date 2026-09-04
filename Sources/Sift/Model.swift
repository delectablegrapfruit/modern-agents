import AppKit
import Combine
import SwiftUI
import SiftCore

/// Cancellation flag plus a light throttle for progress reporting.
final class WorkToken {
    private let lock = NSLock()
    private var cancelled = false
    private var lastReport = Date.distantPast

    var isCancelled: Bool { lock.lock(); defer { lock.unlock() }; return cancelled }
    func cancel() { lock.lock(); cancelled = true; lock.unlock() }

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
final class Model: ObservableObject {
    enum SweepState: Equatable {
        case idle
        case scanning(String)
        case found([Item])
        case removing(done: Int, total: Int)
        case finished(Outcome)

        var showsSheet: Bool {
            switch self {
            case .found, .removing, .finished: return true
            case .idle, .scanning: return false
            }
        }
    }

    let engine: Engine
    private let guardian: Guardian

    @Published private(set) var roots: [Root] = []
    @Published private(set) var locked: [Item] = []
    @Published private(set) var activity: [Entry] = []
    @Published private(set) var isPaused = false
    @Published private(set) var sweep: SweepState = .idle
    /// Places where junk may have arrived unwatched since the last sweep, and why.
    @Published private(set) var sweepDue: [Engine.Due] = []
    /// Every mounted disk, for choosing which to watch.
    @Published private(set) var volumes: [Volume] = []
    @Published var editingWatch = false
    /// Views as edited in the window; `applied` is what Finder has.
    @Published var draft: ViewSettings
    @Published private(set) var applied: ViewSettings
    @Published private(set) var applyPhase: String?
    @Published var editing: FolderView?
    @Published var error: String?
    @Published private(set) var hasFullDiskAccess = true
    @Published private(set) var canControlFinder = true
    @Published private(set) var reactsInstantly = false
    /// The root helper is installed and answering.
    @Published private(set) var helperReady = false
    /// The window shows itself once, the first time the app runs.
    private var wantsWindow: Bool

    private var token = WorkToken()
    /// The roots the found items came from, swept once they are removed.
    private var sweptRoots: [Root] = []
    private var activityRefresh: Task<Void, Never>?
    private var observers: [NSObjectProtocol] = []

    init(engine: Engine = Engine()) {
        self.engine = engine
        wantsWindow = engine.isFirstLaunch
        let views = engine.settings.views
        draft = views
        applied = views
        guardian = Guardian(views: { engine.settings.views })
        activity = engine.log.recent(60)
        locked = engine.lockedItems

        guardian.onNotAllowed = { [weak self] allowed in Task { @MainActor in self?.canControlFinder = allowed } }
        guardian.onModeChange = { [weak self] instant in Task { @MainActor in self?.reactsInstantly = instant } }
        guardian.onProblem = { [weak self] message in self?.engine.log.info(message) }
        guardian.onApplied = { [weak self] path, view in self?.engine.log.info("Finder window set to " + view, path: path) }
        // Finder flushes its stores on the way out; they are put right for its next start.
        guardian.onFinderQuit = { Task.detached(priority: .utility) { engine.reconcileStores() } }
        engine.onRootsChanged = { [weak self] list in
            let volumes = engine.mountedVolumes
            Task { @MainActor in
                self?.roots = list
                self?.volumes = volumes
            }
        }
        engine.onLockedChanged = { [weak self] list in Task { @MainActor in self?.locked = list } }
        engine.onSweepDueChanged = { [weak self] list in Task { @MainActor in self?.sweepDue = list } }
        engine.log.onAppend = { [weak self] in Task { @MainActor in self?.scheduleActivityRefresh() } }
    }

    func start() {
        let center = NSWorkspace.shared.notificationCenter
        let engine = self.engine
        for name in [NSWorkspace.didMountNotification, NSWorkspace.didUnmountNotification] {
            observers.append(center.addObserver(forName: name, object: nil, queue: nil) { _ in
                Task.detached(priority: .utility) { engine.refreshVolumes() }
            })
        }
        checkPermissions()
        Task { await refreshHelper() }
        guardian.start()
        let settings = engine.settings
        Task.detached(priority: .utility) {
            try? FinderPrefs.preventStores()
            // The first run writes the settings file, so the window opens by itself only once.
            if engine.isFirstLaunch { engine.update(settings) }
            engine.start()
        }
    }

    /// Called once the menu bar item exists, which is when a window can be opened.
    func openWindowIfWanted() {
        guard wantsWindow else { return }
        wantsWindow = false
        WindowOpener.open()
    }

    /// Called when the app comes to the front: permissions may have been granted meanwhile.
    func checkPermissions() {
        hasFullDiskAccess = Permissions.hasFullDiskAccess
        if helperReady, !locked.isEmpty {
            // The helper may have been given Full Disk Access since.
            let engine = self.engine
            Task.detached(priority: .utility) { engine.retryLocked() }
        }
    }

    /// Whether the helper is installed and answering; asked off the main thread.
    @discardableResult
    func refreshHelper() async -> Bool {
        let socket = Helper.socketPath
        let ready = await Task.detached(priority: .utility) { Helper.isReady }.value
        helperReady = ready
        engine.privilegedRemove = ready ? { HelperClient.remove($0, at: socket) } : nil
        return ready
    }

    /// Installs the helper (one password), then tries the locked items again.
    func allowAdministrator() {
        do {
            try Helper.install()
        } catch {
            if (error as? Privileged.RunError) != .cancelled { self.error = error.localizedDescription }
            return
        }
        let engine = self.engine
        Task {
            var ready = false
            for _ in 0..<25 where !ready {
                ready = await refreshHelper()
                if !ready { try? await Task.sleep(nanoseconds: 200_000_000) }
            }
            guard ready else {
                error = "The helper was installed but is not answering yet. Try again in a moment."
                return
            }
            Task.detached(priority: .utility) { engine.retryLocked() }
        }
    }

    // MARK: - Status

    var statusText: String {
        if isPaused { return "Paused" }
        var labels: [String] = []
        for root in roots where !labels.contains(root.label) { labels.append(root.label) }
        return labels.isEmpty ? "Nothing to watch" : "Watching " + labels.joined(separator: ", ")
    }

    /// Disks the person left out, by the key `setWatched` takes.
    var excludedDisks: Set<String> { engine.settings.excludedVolumes }

    /// Names of connected disks left out, for the watching row.
    var unwatchedNames: [String] {
        let excluded = excludedDisks
        return volumes.filter { isWatchable($0) && excluded.contains(watchKey($0)) }.map(\.name)
    }

    func watchKey(_ volume: Volume) -> String { volume.kind == .startup ? Engine.startupKey : volume.id }

    /// Whether the disk can be watched at all (read-only and Time Machine disks cannot).
    func isWatchable(_ volume: Volume) -> Bool { volume.kind == .startup || volume.isCleanable() }

    func isWatched(_ volume: Volume) -> Bool { !excludedDisks.contains(watchKey(volume)) }

    func setWatched(_ volume: Volume, _ on: Bool) {
        var settings = engine.settings
        if on { settings.excludedVolumes.remove(watchKey(volume)) } else { settings.excludedVolumes.insert(watchKey(volume)) }
        let engine = self.engine
        objectWillChange.send()
        Task.detached(priority: .utility) { engine.update(settings) }
    }

    /// The sweep row: whether one is needed, and why, in a few words.
    var sweepText: (title: String, reason: String?) {
        guard let first = sweepDue.first else { return ("Nothing to sweep", nil) }
        let names = sweepDue.filter { $0.reason == first.reason }.map(\.root.label)
        var labels: [String] = []
        for name in names where !labels.contains(name) { labels.append(name) }
        let list = labels.joined(separator: ", ")
        let reason: String
        switch first.reason {
        case .started: reason = "Files from before Sift ran on " + list
        case .connected: reason = list + " connected since the last sweep"
        case .paused: reason = "Nothing watched while paused on " + list
        case .missed: reason = "Changes on " + list + " went unseen"
        }
        let more = Set(sweepDue.map(\.reason)).count - 1
        return ("Sweep due", reason + (more > 0 ? " · and more" : ""))
    }

    /// Pause stops everything automatic: cleaning and the window guard.
    func togglePause() {
        isPaused.toggle()
        let paused = isPaused
        let engine = self.engine
        Task.detached(priority: .utility) { engine.isPaused = paused }
        if paused { guardian.isPaused = true } else { guardian.resume() }
    }

    // MARK: - Sweeping

    func sweepNow() {
        guard sweep == .idle else { return }
        let token = WorkToken()
        self.token = token
        sweep = .scanning("")
        let engine = self.engine
        Task.detached(priority: .userInitiated) { [weak self] in
            let roots = engine.roots()
            guard !roots.isEmpty else {
                await MainActor.run { [weak self] in
                    self?.sweep = .idle
                    self?.error = "Nothing to sweep: no disk is connected and no user folder could be read."
                }
                return
            }
            do {
                let items = try engine.scan(roots: roots, progress: { phase in
                    guard case .scanning(let directory) = phase, token.shouldReport() else { return }
                    Task { @MainActor in
                        guard let self, !token.isCancelled, case .scanning = self.sweep else { return }
                        self.sweep = .scanning(directory)
                    }
                }, isCancelled: { token.isCancelled })
                if items.isEmpty, !token.isCancelled { engine.noteSwept(roots) }
                await MainActor.run { [weak self] in
                    guard let self, !token.isCancelled else { return }
                    self.sweep = .found(items)
                    self.sweptRoots = items.isEmpty ? [] : roots
                }
            } catch {
                await MainActor.run { [weak self] in
                    guard let self else { return }
                    self.sweep = .idle
                    if !token.isCancelled { self.error = error.localizedDescription }
                }
            }
        }
    }

    func removeFound() {
        guard case .found(let items) = sweep, !items.isEmpty else { return }
        let token = WorkToken()
        self.token = token
        sweep = .removing(done: 0, total: items.count)
        let engine = self.engine
        let swept = sweptRoots
        Task.detached(priority: .userInitiated) { [weak self] in
            let roots = engine.roots().map(\.path)
            let outcome = engine.remove(items, within: roots, source: "sweep", progress: { phase in
                guard case .removing(let done, let total) = phase, token.shouldReport() else { return }
                Task { @MainActor in
                    guard let self, case .removing = self.sweep else { return }
                    self.sweep = .removing(done: done, total: total)
                }
            }, isCancelled: { token.isCancelled })
            if !token.isCancelled { engine.noteSwept(swept) }
            await MainActor.run { [weak self] in self?.sweep = .finished(outcome) }
        }
    }

    func cancelSweep() {
        token.cancel()
        sweep = .idle
    }

    func dismissSweep() {
        if case .removing = sweep { return }
        sweep = .idle
    }

    // MARK: - Views

    var hasChanges: Bool { draft != applied }

    /// Quits Finder, writes its defaults and every folder view, starts it again
    /// with the windows it had.
    func apply() {
        guard hasChanges, applyPhase == nil else { return }
        applyPhase = "Applying…"
        let views = draft
        let previous = engine.plan
        var settings = engine.settings
        settings.views = views
        let engine = self.engine
        Task { @MainActor in
            await guardian.pause()
            var problems: [String] = []
            let windows = await Finder.openWindows()
            if !(await Finder.quit()) {
                problems.append("Finder would not quit; it may show the previous views until it is restarted.")
            }
            var prefsWritten = true
            do {
                try await Task.detached(priority: .userInitiated) { try FinderPrefs.write(views) }.value
            } catch {
                prefsWritten = false
                problems.append(error.localizedDescription)
            }
            await Task.detached(priority: .userInitiated) { engine.update(settings) }.value
            do {
                try await Task.detached(priority: .userInitiated) { try engine.applyStores(previous: previous) }.value
            } catch {
                problems.append(error.localizedDescription)
            }
            await Finder.launch()
            await Finder.reopen(windows)
            // Left as changes when Finder's defaults could not be written, so Apply can be tried again.
            if prefsWritten { applied = engine.settings.views }
            if !problems.isEmpty { error = problems.joined(separator: "\n") }
            applyPhase = nil
            guardian.resume()
        }
    }

    func revert() {
        draft = applied
    }

    func addFolder() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        panel.prompt = "Choose"
        panel.message = "Choose a folder that should have its own view."
        guard panel.runModal() == .OK, let url = panel.url else { return }
        // Finder shows the real folder, so its view is recorded there.
        let path = Paths.standardize(url.resolvingSymlinksInPath().path)
        if let existing = draft.folders.first(where: { $0.path == path }) {
            editing = existing
            return
        }
        editing = FolderView(path: path, view: draft.default)
    }

    func removeFolder(_ id: UUID) {
        draft.folders.removeAll { $0.id == id }
    }

    func saveFolder(_ folder: FolderView) {
        if let index = draft.folders.firstIndex(where: { $0.id == folder.id }) {
            draft.folders[index] = folder
        } else {
            draft.folders.append(folder)
            draft.folders.sort { $0.path < $1.path }
        }
        editing = nil
    }

    /// Whether the folder has a record Finder reads, or is served by the window guard alone.
    func isRecorded(_ folder: FolderView) -> Bool {
        StorePlan.storeDirectory(for: folder.path) != nil
    }

    func requestAccessibility() { Permissions.requestAccessibility() }
    func openFullDiskAccess() { Permissions.openFullDiskAccess() }
    func openAutomation() { Permissions.openAutomation() }
    func revealApp() { NSWorkspace.shared.activateFileViewerSelecting([Bundle.main.bundleURL]) }
    func revealHelper() { NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: HelperInstall.binary)]) }

    // MARK: - Activity

    private func scheduleActivityRefresh() {
        guard activityRefresh == nil else { return }
        activityRefresh = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 1_000_000_000)
            guard let self else { return }
            self.activity = self.engine.log.recent(60)
            self.activityRefresh = nil
        }
    }
}

enum Format {
    static func bytes(_ count: Int64) -> String {
        ByteCountFormatter.string(fromByteCount: count, countStyle: .file)
    }
}
